#!/usr/bin/env python3
"""
AI Unlocked — Static Site Build Script

Runs as a GitHub Action (or locally). Scrapes RSS feeds, summarises articles,
detects company logos, and outputs static JSON files into site/data/.

The static frontend reads these JSON files — no server needed.
"""

import datetime
import hashlib
import json
import logging
import os
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import escape as html_escape
from pathlib import Path
import urllib.parse

import feedparser
from bs4 import BeautifulSoup

# ── Paths ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = ROOT / "site"
DATA_DIR = SITE_DIR / "data"
LOGO_DIR = SITE_DIR / "logo_cache"
ARTICLES_DIR = SITE_DIR / "articles"
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOGO_DIR.mkdir(parents=True, exist_ok=True)
ARTICLES_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
)
log = logging.getLogger("build")

# ═══════════════════════════════════════════════════════════════════════
#  CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════

MAX_ARTICLES_PER_FEED = 15
ARTICLE_RETENTION_DAYS = 7

FEEDS = [
    ("MIT Technology Review – AI", "https://www.technologyreview.com/topic/artificial-intelligence/feed", "Research"),
    ("TechCrunch – AI", "https://techcrunch.com/category/artificial-intelligence/feed/", "Industry"),
    ("VentureBeat – AI", "https://venturebeat.com/category/ai/feed/", "Industry"),
    ("The Verge – AI", "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "Industry"),
    ("Wired – AI", "https://www.wired.com/feed/tag/ai/latest/rss", "Industry"),
    ("Ars Technica – AI", "https://feeds.arstechnica.com/arstechnica/technology-lab", "Industry"),
    ("Google AI Blog", "https://blog.google/technology/ai/rss/", "Company Updates"),
    ("OpenAI Blog", "https://openai.com/blog/rss.xml", "Company Updates"),
    ("DeepMind Blog", "https://deepmind.google/blog/rss.xml", "Research"),
    ("Hugging Face Blog", "https://huggingface.co/blog/feed.xml", "Open Source"),
    ("arXiv – AI (cs.AI)", "https://rss.arxiv.org/rss/cs.AI", "Research Papers"),
    ("arXiv – Machine Learning (cs.LG)", "https://rss.arxiv.org/rss/cs.LG", "Research Papers"),
    ("Towards Data Science (Medium)", "https://towardsdatascience.com/feed", "Tutorials"),
    ("Analytics India Magazine", "https://analyticsindiamag.com/feed/", "Industry"),
    ("Nvidia AI Blog", "https://blogs.nvidia.com/feed/", "Company Updates"),
    ("Microsoft AI Blog", "https://blogs.microsoft.com/ai/feed/", "Company Updates"),
    ("Amazon Science", "https://www.amazon.science/index.rss", "Research"),
    ("SyncedReview", "https://syncedreview.com/feed/", "Research"),
    ("Marktechpost", "https://www.marktechpost.com/feed/", "Research"),
    ("The Gradient", "https://thegradient.pub/rss/", "Research"),
]

CATEGORY_COLOURS = {
    "Research": "#6C5CE7",
    "Industry": "#00B894",
    "Company Updates": "#0984E3",
    "Open Source": "#E17055",
    "Research Papers": "#A29BFE",
    "Tutorials": "#FDCB6E",
}

SITE_URL = "https://aiunlocked.info"

AI_KEYWORDS = [
    "artificial intelligence", "machine learning", "deep learning",
    "neural network", "large language model", "LLM", "GPT",
    "transformer", "diffusion model", "generative ai", "gen ai",
    "computer vision", "NLP", "natural language", "reinforcement learning",
    "AI model", "AI agent", "chatbot", "openai", "anthropic", "gemini",
    "mistral", "llama", "stable diffusion", "midjourney", "copilot",
    "ai chip", "gpu", "tpu", "ai regulation", "ai safety",
    "ai startup", "foundation model", "multimodal", "rag",
    "retrieval augmented", "fine-tuning", "fine tuning",
    "ai funding", "ai acquisition", "algorithm", "robotics",
    "autonomous", "self-driving", "ai ethics", "hugging face",
    "pytorch", "tensorflow", "jax", "MLOps",
]

_KW_PATTERN = re.compile("|".join(re.escape(k) for k in AI_KEYWORDS), re.IGNORECASE)

# ═══════════════════════════════════════════════════════════════════════
#  COMPANY DETECTION
# ═══════════════════════════════════════════════════════════════════════

COMPANY_LOGO_MAP = [
    (["openai", "chatgpt", "gpt-4", "gpt-5", "dall-e", "sora", "o1", "o3"], "OpenAI", "openai.com"),
    (["anthropic", "claude"], "Anthropic", "anthropic.com"),
    (["deepmind", "alphafold", "alphacode", "alphago", "gemma"], "DeepMind", "deepmind.google"),
    (["google ai", "google brain", "gemini", "bard", "palm", "google cloud ai"], "Google", "google.com"),
    (["meta ai", "llama", "codellama", "sam model"], "Meta", "meta.com"),
    (["microsoft", "copilot", "azure ai", "phi-3", "phi-4", "bing ai"], "Microsoft", "microsoft.com"),
    (["nvidia", "geforce", "tensorrt", "cuda", "h100", "h200", "b100", "b200", "gb200", "blackwell", "nemotron"], "NVIDIA", "nvidia.com"),
    (["apple intelligence", "apple ai", "apple machine learning", "core ml"], "Apple", "apple.com"),
    (["amazon", "aws ai", "bedrock", "alexa ai", "titan model"], "Amazon", "amazon.com"),
    (["hugging face", "huggingface", "transformers library"], "Hugging Face", "huggingface.co"),
    (["mistral"], "Mistral AI", "mistral.ai"),
    (["cohere"], "Cohere", "cohere.com"),
    (["stability ai", "stable diffusion", "stablediffusion"], "Stability AI", "stability.ai"),
    (["midjourney"], "Midjourney", "midjourney.com"),
    (["xai", "x.ai", "grok"], "xAI", "x.ai"),
    (["inflection", "pi chatbot"], "Inflection AI", "inflection.ai"),
    (["perplexity"], "Perplexity", "perplexity.ai"),
    (["runway", "gen-2", "gen-3"], "Runway", "runwayml.com"),
    (["adobe firefly", "adobe ai"], "Adobe", "adobe.com"),
    (["ibm watson", "ibm ai"], "IBM", "ibm.com"),
    (["intel ai", "intel gaudi", "habana"], "Intel", "intel.com"),
    (["amd ai", "amd instinct", "xilinx"], "AMD", "amd.com"),
    (["tesla ai", "tesla bot", "optimus", "tesla fsd", "dojo"], "Tesla", "tesla.com"),
    (["samsung ai", "samsung gauss"], "Samsung", "samsung.com"),
    (["baidu", "ernie bot"], "Baidu", "baidu.com"),
    (["alibaba ai", "qwen", "tongyi"], "Alibaba", "alibaba.com"),
    (["tencent ai"], "Tencent", "tencent.com"),
    (["bytedance", "doubao"], "ByteDance", "bytedance.com"),
    (["pytorch"], "PyTorch", "pytorch.org"),
    (["tensorflow"], "TensorFlow", "tensorflow.org"),
    (["langchain"], "LangChain", "langchain.com"),
    (["arxiv"], "arXiv", "arxiv.org"),
]


def detect_company(title: str, summary: str = ""):
    text = f"{title} {summary}".lower()
    for keywords, name, domain in COMPANY_LOGO_MAP:
        for kw in keywords:
            if kw.lower() in text:
                return name, domain
    return None


def fetch_logo(domain: str) -> str:
    """Download company logo to logo_cache/, return relative path or empty."""
    safe = domain.replace(".", "_")
    dest = LOGO_DIR / f"{safe}.png"
    if dest.exists() and dest.stat().st_size > 100:
        return f"logo_cache/{safe}.png"
    url = f"https://www.google.com/s2/favicons?domain={domain}&sz=128"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = resp.read()
        if len(data) > 100:
            dest.write_bytes(data)
            return f"logo_cache/{safe}.png"
    except Exception:
        pass
    return ""


# ═══════════════════════════════════════════════════════════════════════
#  SUMMARISER
# ═══════════════════════════════════════════════════════════════════════

_FETCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    )
}


def _fetch_article_text(url: str, timeout: int = 12) -> str:
    try:
        req = urllib.request.Request(url, headers=_FETCH_HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except Exception:
        return ""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup.find_all(["script", "style", "nav", "footer", "header",
                               "aside", "form", "iframe", "noscript", "svg",
                               "figure", "figcaption", "button", "input"]):
        tag.decompose()
    article_el = (
        soup.find("article")
        or soup.find(attrs={"role": "main"})
        or soup.find(class_=re.compile(
            r"article[-_]?body|post[-_]?content|entry[-_]?content|"
            r"story[-_]?body|article[-_]?text|content[-_]?body", re.I))
        or soup.find("main")
    )
    paras = (article_el or soup).find_all("p")
    lines = []
    for p in paras:
        t = p.get_text(" ", strip=True)
        if len(t) < 40:
            continue
        low = t.lower()
        if any(bp in low for bp in [
            "cookie", "subscribe", "sign up", "newsletter", "privacy policy",
            "terms of service", "advertisement", "sponsored", "click here",
            "continue reading", "all rights reserved",
        ]):
            continue
        lines.append(t)
    return " ".join(lines)[:20000]


def _clean(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&\w+;", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _split_sentences(text: str) -> list[str]:
    # Protect abbreviations, decimals, URLs from false splits
    text = re.sub(r'\b(Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|Corp|vs|etc|e\.g|i\.e|U\.S|U\.K|U\.N)\.',
                  r'\1<P>', text)
    text = re.sub(r'(\d)\.(\d)', r'\1<P>\2', text)          # decimals like 3.5
    text = re.sub(r'(https?://\S+)', lambda m: m.group().replace('.', '<P>'), text)  # URLs
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z"\'])', text.strip())
    parts = [s.replace('<P>', '.').strip() for s in parts]
    return [s for s in parts if len(s.strip()) > 25]


def _score(sentence, keywords, position, total):
    lower = sentence.lower()
    kw_score = sum(1 + len(kw.split()) * 0.5 for kw in keywords if kw.lower() in lower)
    pos_score = max(0, 3 - position) if position < 3 else (0.5 if position >= total - 2 else 0)
    wc = len(sentence.split())
    len_score = 1.0 if 10 <= wc <= 35 else (0.3 if wc < 10 else 0.6)
    if any(bp in lower for bp in ["said in a statement", "did not respond",
                                    "declined to comment", "image credit"]):
        return 0
    return kw_score * 2 + pos_score + len_score


def _rewrite(sentences, title):
    result = []
    for i, s in enumerate(sentences):
        s = s.strip()
        if not s:
            continue
        if i == 0:
            s = re.sub(r'^(However|Meanwhile|Furthermore|Additionally|Moreover|Also),?\s+', '', s)
        s = re.sub(r'\bhas announced\b', 'unveiled', s)
        s = re.sub(r'\bannounced\b', 'revealed', s)
        s = re.sub(r'\bis set to\b', 'plans to', s)
        s = re.sub(r'\bis expected to\b', 'is likely to', s)
        s = re.sub(r'\baccording to\b', 'based on', s)
        s = re.sub(r'\bin a blog post\b', '', s)
        s = re.sub(r'\bin a press release\b', '', s)
        s = re.sub(r'\bthe company said\b', 'the company noted', s)
        s = re.sub(r',?\s*according to [^,.]+[,.]?', '', s)
        s = re.sub(r',?\s*as reported by [^,.]+[,.]?', '', s)
        s = re.sub(r',?\s*sources? (?:say|told|report)[^,.]*[,.]?', '', s)
        s = re.sub(r'\s+', ' ', s).strip()
        s = re.sub(r',\s*$', '.', s)
        if s and s[-1] not in '.!?':
            s += '.'
        if s:
            result.append(s)
    return " ".join(result)


def summarise(title, raw_desc, url="", max_sentences=6):
    full = _fetch_article_text(url) if url else ""
    source = full if len(full) > 200 else _clean(raw_desc)
    if not source:
        return ""
    if len(source) < 80:
        return source

    sentences = _split_sentences(source)

    # ── Fallback for short / un-parseable text ──────────────────────
    if not sentences:
        snip = source[:600]
        if len(source) > 600:
            snip = snip.rsplit(" ", 1)[0] + "…"
        return snip

    # If source text is too short for meaningful extraction (e.g. RSS
    # teaser with only 1-3 sentences), return it cleaned-up directly
    # instead of trying to cherry-pick from a tiny pool.
    if len(sentences) <= 3:
        combined = _rewrite(sentences, title)
        if len(combined) > 1000:
            combined = _truncate_on_sentence(combined, 1000)
        return combined

    # ── Keyword-driven extractive summarisation ─────────────────────
    stopwords = {"the", "and", "for", "are", "that", "this", "with", "from",
                 "will", "have", "has", "been", "its", "was", "were", "can",
                 "could", "would", "should", "into", "about", "than", "more",
                 "what", "how", "why", "new", "now", "just", "also"}
    title_words = [w.lower() for w in re.findall(r'\b\w+\b', title)
                   if len(w) > 3 and w.lower() not in stopwords]
    all_kw = list(set(AI_KEYWORDS + title_words))
    total = len(sentences)
    scored = sorted(
        [(i, s, _score(s, all_kw, i, total)) for i, s in enumerate(sentences)],
        key=lambda x: x[2], reverse=True,
    )
    top = sorted(scored[:max_sentences], key=lambda x: x[0])
    chosen = [s for _, s, sc in top if sc > 0] or sentences[:max_sentences]
    summary = _rewrite(chosen, title)

    # Truncate on a sentence boundary (not mid-word)
    if len(summary) > 1000:
        summary = _truncate_on_sentence(summary, 1000)
    return summary


def _truncate_on_sentence(text: str, limit: int) -> str:
    """Truncate *text* to at most *limit* chars, cutting at a sentence boundary."""
    if len(text) <= limit:
        return text
    truncated = text[:limit]
    # Try to cut at the last sentence-ending punctuation
    last_end = max(truncated.rfind('. '), truncated.rfind('! '), truncated.rfind('? '))
    if last_end > limit * 0.4:           # only if we keep a reasonable chunk
        return truncated[:last_end + 1]
    # Fallback: cut at last space
    return truncated.rsplit(" ", 1)[0] + "…"


def generate_guid(url, title):
    return hashlib.sha256(f"{url}|{title}".encode()).hexdigest()[:16]


# ═══════════════════════════════════════════════════════════════════════
#  RSS SCRAPER
# ═══════════════════════════════════════════════════════════════════════

def _is_ai_related(title, desc):
    return bool(_KW_PATTERN.search(f"{title} {desc}"))


def _parse_date(entry):
    for attr in ("published_parsed", "updated_parsed"):
        tp = getattr(entry, attr, None)
        if tp:
            try:
                return datetime.datetime(*tp[:6]).isoformat()
            except Exception:
                pass
    return datetime.datetime.utcnow().isoformat()


def _extract_image(entry):
    media = entry.get("media_thumbnail", [])
    if media:
        return media[0].get("url")
    for mc in entry.get("media_content", []):
        if mc.get("medium") == "image" or "image" in mc.get("type", ""):
            return mc.get("url")
    for link in entry.get("links", []):
        if "image" in link.get("type", ""):
            return link.get("href")
    summary = entry.get("summary", "")
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', summary)
    return m.group(1) if m else None


def scrape_feed(source_name, feed_url, category):
    """Scrape one feed, return list of article dicts."""
    articles = []
    try:
        feed = feedparser.parse(feed_url)
        for entry in feed.entries[:MAX_ARTICLES_PER_FEED]:
            title = entry.get("title", "").strip()
            link = entry.get("link", "").strip()
            raw_desc = entry.get("summary", "") or entry.get("description", "")
            if not title or not link:
                continue
            if not _is_ai_related(title, raw_desc):
                continue
            guid = generate_guid(link, title)
            summary = summarise(title, raw_desc, url=link)
            published = _parse_date(entry)
            image = _extract_image(entry)

            # Company detection
            company_name, company_logo = "", ""
            result = detect_company(title, summary)
            if result:
                company_name = result[0]
                company_logo = fetch_logo(result[1])

            articles.append({
                "guid": guid,
                "title": title,
                "summary": summary,
                "category": category,
                "image_url": image,
                "published_at": published,
                "company_name": company_name,
                "company_logo": company_logo,
                "source_url": link,
                "source_name": source_name,
            })
    except Exception as e:
        log.warning("Failed %s: %s", source_name, e)
    return articles


# ═══════════════════════════════════════════════════════════════════════
#  MAIN BUILD
# ═══════════════════════════════════════════════════════════════════════

def main():
    start = time.time()
    log.info("Starting AI Unlocked static build …")

    # Load existing articles to merge (don't lose old ones)
    articles_file = DATA_DIR / "articles.json"
    existing = {}
    if articles_file.exists():
        try:
            for a in json.loads(articles_file.read_text()):
                existing[a["guid"]] = a
        except Exception:
            pass

    # Scrape all feeds in parallel
    all_new = []
    errors = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(scrape_feed, name, url, cat): name
            for name, url, cat in FEEDS
        }
        for fut in as_completed(futures):
            name = futures[fut]
            try:
                arts = fut.result()
                if arts:
                    log.info("  ✓ %s — %d articles", name, len(arts))
                    all_new.extend(arts)
            except Exception as e:
                errors += 1
                log.warning("  ✗ %s — %s", name, e)

    # Merge: new articles override existing by guid
    for a in all_new:
        existing[a["guid"]] = a

    # Purge articles older than retention period
    cutoff = (datetime.datetime.utcnow()
              - datetime.timedelta(days=ARTICLE_RETENTION_DAYS)).isoformat()
    articles = [a for a in existing.values() if a["published_at"] >= cutoff]

    # Sort by published_at descending
    articles.sort(key=lambda a: a["published_at"], reverse=True)

    # Build category stats
    cat_counts = {}
    for a in articles:
        cat_counts[a["category"]] = cat_counts.get(a["category"], 0) + 1
    categories = sorted(cat_counts.items(), key=lambda x: x[1], reverse=True)

    today = datetime.date.today().isoformat()
    today_count = sum(1 for a in articles if a["published_at"][:10] >= today)

    # Write data files
    articles_file.write_text(json.dumps(articles, indent=2, ensure_ascii=False))

    # ── Trending topics (keyword frequency from today's articles) ──
    trending = _extract_trending(articles, today)

    meta = {
        "total_articles": len(articles),
        "today": today_count,
        "categories": len(cat_counts),
        "category_list": [{"category": c, "cnt": n} for c, n in categories],
        "colours": CATEGORY_COLOURS,
        "trending": trending,
        "built_at": datetime.datetime.utcnow().isoformat(),
    }
    (DATA_DIR / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))

    # ── Generate RSS feed ──
    _generate_rss(articles[:50])

    # ── Generate individual article pages ──
    _generate_article_pages(articles)

    # ── Generate dynamic sitemap ──
    _generate_sitemap(articles)

    # ── Ping Google about the updated sitemap ──
    try:
        ping_url = f"{SITE_URL}/sitemap.xml"
        urllib.request.urlopen(
            f"https://www.google.com/ping?sitemap={urllib.parse.quote(ping_url, safe='/:')}",
            timeout=10,
        )
        log.info("  ✓ Pinged Google with updated sitemap")
    except Exception as e:
        log.warning("  ⚠ Could not ping Google: %s", e)

    elapsed = round(time.time() - start, 1)
    log.info("Build done in %ss — %d total articles, %d new, %d errors",
             elapsed, len(articles), len(all_new), errors)


# ═══════════════════════════════════════════════════════════════════════
#  TRENDING TOPICS
# ═══════════════════════════════════════════════════════════════════════

# Keywords to surface as trending (multi-word first for greedy matching)
_TRENDING_KEYWORDS = [
    "large language model", "generative ai", "computer vision",
    "reinforcement learning", "natural language", "ai safety",
    "ai regulation", "ai agent", "foundation model", "fine-tuning",
    "stable diffusion", "self-driving", "retrieval augmented",
    "neural network", "deep learning", "machine learning",
    "open source", "multimodal", "robotics", "autonomous",
    "OpenAI", "Anthropic", "Google", "Meta", "NVIDIA", "Microsoft",
    "Mistral", "Hugging Face", "Apple", "xAI", "DeepMind",
    "GPT", "Claude", "Gemini", "Llama", "Copilot", "ChatGPT",
    "transformer", "diffusion", "LLM", "MLOps", "RAG",
    "AI chip", "GPU", "TPU", "AI startup", "AI funding",
]


def _extract_trending(articles, today_str, max_items=12):
    """Count keyword mentions in recent articles, return top trending."""
    recent = [a for a in articles if a["published_at"][:10] >= today_str]
    if len(recent) < 3:
        cutoff_2d = (datetime.datetime.utcnow() - datetime.timedelta(days=2)).isoformat()[:10]
        recent = [a for a in articles if a["published_at"][:10] >= cutoff_2d]

    counts = {}
    for a in recent:
        text = f"{a['title']} {a.get('summary', '')}".lower()
        seen = set()
        for kw in _TRENDING_KEYWORDS:
            kw_lower = kw.lower()
            if kw_lower in text and kw_lower not in seen:
                counts[kw] = counts.get(kw, 0) + 1
                seen.add(kw_lower)

    sorted_kw = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    return [{"keyword": kw, "count": n} for kw, n in sorted_kw[:max_items] if n >= 2]


# ═══════════════════════════════════════════════════════════════════════
#  RSS FEED GENERATOR
# ═══════════════════════════════════════════════════════════════════════

def _generate_rss(articles):
    """Write a static RSS 2.0 feed to site/rss.xml."""
    now = datetime.datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S +0000")

    items = []
    for a in articles:
        pub = ""
        try:
            d = datetime.datetime.fromisoformat(a["published_at"])
            pub = d.strftime("%a, %d %b %Y %H:%M:%S +0000")
        except Exception:
            pub = now

        items.append(f"""    <item>
      <title><![CDATA[{a['title']}]]></title>
      <description><![CDATA[{a.get('summary', '')}]]></description>
      <category>{_xml_escape(a.get('category', ''))}</category>
      <pubDate>{pub}</pubDate>
      <guid isPermaLink="false">{a['guid']}</guid>
    </item>""")

    rss = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI Unlocked — Daily AI News</title>
    <link>https://aiunlocked.info</link>
    <description>Your daily AI news — curated and summarised. Research, industry, open source, and more.</description>
    <language>en-us</language>
    <lastBuildDate>{now}</lastBuildDate>
    <atom:link href="https://aiunlocked.info/rss.xml" rel="self" type="application/rss+xml"/>
{chr(10).join(items)}
  </channel>
</rss>
"""
    (SITE_DIR / "rss.xml").write_text(rss.strip(), encoding="utf-8")
    log.info("  ✓ RSS feed written (%d items)", len(items))


def _xml_escape(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


# ═══════════════════════════════════════════════════════════════════════
#  INDIVIDUAL ARTICLE PAGES
# ═══════════════════════════════════════════════════════════════════════

def _generate_article_pages(articles):
    """Generate individual HTML pages for each article with full SEO."""
    for old in ARTICLES_DIR.glob("*.html"):
        old.unlink()
    for a in articles:
        _write_article_page(a)
    log.info("  ✓ Generated %d article pages", len(articles))


def _write_article_page(a):
    guid = a["guid"]
    title = a["title"]
    summary = a.get("summary", "")
    category = a.get("category", "")
    company = a.get("company_name", "")
    company_logo = a.get("company_logo", "")
    image_url = a.get("image_url", "")
    source_url = a.get("source_url", "")
    source_name = a.get("source_name", "")
    published = a.get("published_at", "")
    colour = CATEGORY_COLOURS.get(category, "#6366f1")

    # Meta description (max 160 chars)
    if len(summary) > 160:
        meta_desc = summary[:157].rsplit(" ", 1)[0] + "…"
    else:
        meta_desc = summary

    # Dates
    date_display, date_iso = "", published
    try:
        d = datetime.datetime.fromisoformat(published)
        date_display = d.strftime("%B %d, %Y")
        date_iso = d.isoformat()
    except Exception:
        pass

    # Reading time
    read_time = max(1, len(summary.split()) // 200)

    # URLs
    article_url = f"{SITE_URL}/articles/{guid}.html"
    og_image = image_url if image_url else f"{SITE_URL}/assets/og-image.png"
    encoded_title = urllib.parse.quote(f"{title} — via AI Unlocked")
    encoded_url = urllib.parse.quote(article_url)

    # Hero image
    hero_html = ""
    if image_url:
        hero_html = (
            f'\n            <div class="article-page-hero">'
            f'<img src="{html_escape(image_url)}" alt="{html_escape(title)}" /></div>'
        )

    # Company section
    company_html = ""
    if company:
        logo_src = f"../{company_logo}" if company_logo else "../assets/favicon.svg"
        company_html = (
            f'\n            <div class="article-page-company">'
            f'<img src="{html_escape(logo_src)}" alt="{html_escape(company)}" '
            f'onerror="this.src=\'../assets/favicon.svg\'" />'
            f'<span>{html_escape(company)}</span></div>'
        )

    # Summary → paragraphs (every 3 sentences)
    sents = [s.strip() for s in re.split(r'(?<=[.!?])\s+', summary) if s.strip()]
    paras = []
    for i in range(0, max(len(sents), 1), 3):
        chunk = " ".join(sents[i:i + 3])
        if chunk:
            paras.append(f"<p>{html_escape(chunk)}</p>")
    if not paras:
        paras = [f"<p>{html_escape(summary)}</p>"]
    summary_paragraphs = "\n                ".join(paras)

    # Source link
    source_html = ""
    if source_url:
        label = f" on {html_escape(source_name)}" if source_name else ""
        source_html = (
            f'\n            <div class="article-page-source">'
            f'<a href="{html_escape(source_url)}" target="_blank" rel="noopener noreferrer">'
            f'📰 Read original article{label} →</a></div>'
        )

    # JSON-LD
    json_ld = json.dumps({
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": title,
        "description": meta_desc,
        "image": og_image,
        "datePublished": date_iso,
        "dateModified": date_iso,
        "author": {"@type": "Organization", "name": "AI Unlocked", "url": SITE_URL},
        "publisher": {
            "@type": "Organization",
            "name": "AI Unlocked",
            "url": SITE_URL,
            "logo": {"@type": "ImageObject", "url": f"{SITE_URL}/assets/favicon.svg"},
        },
        "mainEntityOfPage": {"@type": "WebPage", "@id": article_url},
        "articleSection": category,
    }, indent=4, ensure_ascii=False)

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- Google Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-5Z3TJDSQ9E"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){{dataLayer.push(arguments);}}
      gtag('js', new Date());
      gtag('config', 'G-5Z3TJDSQ9E');
    </script>

    <title>{html_escape(title)} — AI Unlocked</title>
    <meta name="description" content="{html_escape(meta_desc)}" />
    <meta name="keywords" content="AI news, {html_escape(category)}, {html_escape(company or 'artificial intelligence')}, machine learning" />
    <meta name="author" content="AI Unlocked" />
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
    <link rel="canonical" href="{article_url}" />

    <!-- Open Graph -->
    <meta property="og:type" content="article" />
    <meta property="og:title" content="{html_escape(title)}" />
    <meta property="og:description" content="{html_escape(meta_desc)}" />
    <meta property="og:url" content="{article_url}" />
    <meta property="og:image" content="{html_escape(og_image)}" />
    <meta property="og:site_name" content="AI Unlocked" />
    <meta property="article:published_time" content="{date_iso}" />
    <meta property="article:section" content="{html_escape(category)}" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{html_escape(title)}" />
    <meta name="twitter:description" content="{html_escape(meta_desc)}" />
    <meta name="twitter:image" content="{html_escape(og_image)}" />

    <!-- JSON-LD Structured Data -->
    <script type="application/ld+json">
    {json_ld}
    </script>

    <!-- Breadcrumb -->
    <script type="application/ld+json">
    {{
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {{ "@type": "ListItem", "position": 1, "name": "Home", "item": "{SITE_URL}/" }},
        {{ "@type": "ListItem", "position": 2, "name": "{html_escape(category)}", "item": "{SITE_URL}/#articlesGrid" }},
        {{ "@type": "ListItem", "position": 3, "name": "{html_escape(title[:60])}" }}
      ]
    }}
    </script>

    <!-- Favicon -->
    <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="../assets/style.css" />
</head>
<body>
    <header class="site-header" role="banner">
        <div class="container header-inner">
            <a href="../" class="logo" aria-label="AI Unlocked home">
                <img class="logo-icon" src="../assets/favicon.svg" alt="AI Unlocked" width="36" height="36" />
                <span class="logo-text">AI <span class="accent">Unlocked</span></span>
            </a>
            <p class="tagline">Your daily AI news — curated &amp; summarised</p>
            <div class="header-actions">
                <a href="../" class="btn btn-outline btn-sm">&larr; All Articles</a>
                <button id="themeToggle" class="btn btn-icon" title="Toggle dark / light mode">&#x1f319;</button>
            </div>
        </div>
    </header>

    <main class="container article-page-main">
        <article class="article-page">{hero_html}
            <div class="article-page-meta">
                <span class="badge" style="background:{colour}">{html_escape(category)}</span>
                <time class="article-page-date" datetime="{date_iso}">{date_display}</time>
                <span class="article-page-readtime">&#x1f4d6; {read_time} min read</span>
            </div>{company_html}
            <h1 class="article-page-title">{html_escape(title)}</h1>
            <div class="article-page-body">
                {summary_paragraphs}
            </div>{source_html}
            <div class="article-page-share">
                <span class="article-page-share-label">Share this article</span>
                <div class="article-page-share-btns">
                    <a href="https://x.com/intent/tweet?text={encoded_title}&amp;url={encoded_url}" target="_blank" rel="noopener noreferrer" class="share-link" title="Share on X">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        X
                    </a>
                    <a href="https://www.linkedin.com/sharing/share-offsite/?url={encoded_url}" target="_blank" rel="noopener noreferrer" class="share-link" title="Share on LinkedIn">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                        LinkedIn
                    </a>
                    <a href="https://reddit.com/submit?url={encoded_url}&amp;title={encoded_title}" target="_blank" rel="noopener noreferrer" class="share-link" title="Share on Reddit">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>
                        Reddit
                    </a>
                </div>
            </div>
        </article>
        <nav class="article-page-back">
            <a href="../" class="btn btn-outline">&larr; Back to All AI News</a>
        </nav>
    </main>

    <footer class="site-footer">
        <div class="container footer-inner">
            <img src="../assets/favicon.svg" alt="AI Unlocked" width="32" height="32" style="margin:0 auto 10px;display:block;opacity:.6;" />
            <p><strong>AI Unlocked</strong> — your daily dose of AI news, curated and summarised.</p>
            <div class="footer-social">
                <a href="https://youtube.com/@aiunlocked-ai" target="_blank" rel="noopener noreferrer" class="footer-social-link yt" title="YouTube">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                    YouTube
                </a>
                <a href="https://www.instagram.com/aiunlocked.hacks.news" target="_blank" rel="noopener noreferrer" class="footer-social-link ig" title="Instagram">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
                    Instagram
                </a>
            </div>
            <p class="footer-small">Updated daily&ensp;&middot;&ensp;Powered by AI Unlocked</p>
        </div>
    </footer>

    <button class="bookmark-fab visible" id="bookmarkBtn" title="Bookmark this article" style="opacity:1;pointer-events:auto;transform:none;">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        <span>Bookmark</span>
    </button>

    <script>
    (function() {{
        var t = document.getElementById('themeToggle');
        var s = localStorage.getItem('aiunlocked-theme');
        var p = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var theme = s || (p ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
        t.textContent = theme === 'dark' ? '☀️' : '🌙';
        t.addEventListener('click', function() {{
            var c = document.documentElement.getAttribute('data-theme');
            var n = c === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', n);
            localStorage.setItem('aiunlocked-theme', n);
            t.textContent = n === 'dark' ? '☀️' : '🌙';
        }});

        // Bookmark
        var bk = document.getElementById('bookmarkBtn');
        if (bk) bk.addEventListener('click', function() {{
            var title = document.title;
            var url = window.location.href;
            if (navigator.share) {{
                navigator.share({{ title: title, url: url }}).catch(function(){{}});
                return;
            }}
            var isMac = /Mac|iPhone|iPad/i.test(navigator.userAgent);
            var key = isMac ? '\u2318+D' : 'Ctrl+D';
            var toast = document.getElementById('bookmarkToast');
            if (!toast) {{
                toast = document.createElement('div');
                toast.id = 'bookmarkToast';
                toast.className = 'bookmark-toast';
                document.body.appendChild(toast);
            }}
            toast.innerHTML = '<span>&#x1F516;</span> Press <kbd>' + key + '</kbd> to bookmark this page';
            toast.classList.add('show');
            setTimeout(function(){{ toast.classList.remove('show'); }}, 3500);
        }});
    }})();
    </script>
</body>
</html>"""

    (ARTICLES_DIR / f"{guid}.html").write_text(page, encoding="utf-8")


# ═══════════════════════════════════════════════════════════════════════
#  DYNAMIC SITEMAP GENERATOR
# ═══════════════════════════════════════════════════════════════════════

def _generate_sitemap(articles):
    """Generate sitemap.xml with real dates and per-article URLs."""
    today = datetime.date.today().isoformat()

    urls = []

    # Main page
    urls.append(f"""  <url>
    <loc>{SITE_URL}/</loc>
    <lastmod>{today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>""")

    # Individual article pages
    for a in articles:
        pub_date = a.get("published_at", today)[:10]
        urls.append(f"""  <url>
    <loc>{SITE_URL}/articles/{a['guid']}.html</loc>
    <lastmod>{pub_date}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>""")

    # Section anchors
    sections = [
        ("gamesArcadeSection", "monthly", "0.6"),
        ("successStoriesSection", "monthly", "0.6"),
        ("quizSection", "monthly", "0.5"),
        ("glossarySection", "monthly", "0.7"),
        ("toolOfDaySection", "daily", "0.6"),
        ("timelineSection", "monthly", "0.5"),
    ]
    for section, freq, priority in sections:
        urls.append(f"""  <url>
    <loc>{SITE_URL}/#{section}</loc>
    <lastmod>{today}</lastmod>
    <changefreq>{freq}</changefreq>
    <priority>{priority}</priority>
  </url>""")

    # Terminal page
    urls.append(f"""  <url>
    <loc>{SITE_URL}/terminal.html</loc>
    <lastmod>{today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>""")

    sitemap = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{chr(10).join(urls)}
</urlset>"""

    (SITE_DIR / "sitemap.xml").write_text(sitemap.strip(), encoding="utf-8")
    log.info("  ✓ Sitemap written (%d URLs)", len(urls))


if __name__ == "__main__":
    main()

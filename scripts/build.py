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
from pathlib import Path

import feedparser
from bs4 import BeautifulSoup

# ── Paths ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = ROOT / "site"
DATA_DIR = SITE_DIR / "data"
LOGO_DIR = SITE_DIR / "logo_cache"
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOGO_DIR.mkdir(parents=True, exist_ok=True)

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


if __name__ == "__main__":
    main()

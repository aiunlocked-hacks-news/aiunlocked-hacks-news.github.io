/* ═══════════════════════════════════════════════════════════════
   AI Unlocked — Static Site Frontend
   Reads pre-built JSON from data/ — no server needed.
   ═══════════════════════════════════════════════════════════════ */

(() => {
    "use strict";

    const PER_PAGE = 6;

    // ── State ───────────────────────────────────────────────────
    let allArticles     = [];   // full dataset loaded once
    let filteredArticles = [];  // after category + search filters
    let currentCategory = "";
    let currentSearch   = "";
    let currentPage     = 1;
    let categoryColours = {};

    // ── DOM refs ────────────────────────────────────────────────
    const $grid        = document.getElementById("articlesGrid");
    const $empty       = document.getElementById("emptyState");
    const $pagination  = document.getElementById("pagination");
    const $searchInput = document.getElementById("searchInput");
    const $themeToggle = document.getElementById("themeToggle");
    const $catList     = document.getElementById("categoryList");
    const $count       = document.getElementById("articleCount");
    const $title       = document.getElementById("sectionTitle");
    const $statTotal   = document.getElementById("statTotal");
    const $statToday   = document.getElementById("statToday");
    const $statCats    = document.getElementById("statCategories");
    const $lastUpdated = document.getElementById("lastUpdated");
    const $trendingBar = document.getElementById("trendingBar");
    const $trendingScroll = document.getElementById("trendingScroll");

    // ── Theme ───────────────────────────────────────────────────
    function initTheme() {
        const saved = localStorage.getItem("aiunlocked-theme");
        const prefer = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const theme = saved || (prefer ? "dark" : "light");
        document.documentElement.setAttribute("data-theme", theme);
        $themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    }
    $themeToggle.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme");
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("aiunlocked-theme", next);
        $themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
    });

    // ── Fetch helper ────────────────────────────────────────────
    async function fetchJSON(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    // ── Load everything once ────────────────────────────────────
    async function init() {
        showSkeleton();
        try {
            const [articles, meta] = await Promise.all([
                fetchJSON("data/articles.json"),
                fetchJSON("data/meta.json"),
            ]);

            allArticles = articles;
            categoryColours = meta.colours || {};

            // Stats bar
            $statTotal.textContent = meta.total_articles.toLocaleString();
            $statToday.textContent = meta.today.toLocaleString();
            $statCats.textContent  = meta.categories != null ? meta.categories.toLocaleString() : "—";
            if (meta.built_at) {
                const d = new Date(meta.built_at + "Z");
                $lastUpdated.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            }

            // Build category sidebar
            buildCategoryList(meta.category_list || []);

            // Build trending ticker
            buildTrendingTicker(meta.trending || []);

            // First render
            applyFilters();

            // Data-dependent features
            initWeeklySummary();
            initLeaderboard();
        } catch (e) {
            console.error("Init failed", e);
            $grid.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><h3>Failed to load data</h3><p>${escapeHTML(e.message)}</p></div>`;
        }
    }

    // ── Category sidebar ────────────────────────────────────────
    function buildTrendingTicker(trending) {
        if (!trending || trending.length === 0) return;
        $trendingBar.style.display = "";
        $trendingScroll.innerHTML = trending.map(t =>
            `<button class="trending-tag" data-keyword="${escapeAttr(t.keyword)}">${escapeHTML(t.keyword)} <span class="trend-count">${t.count}</span></button>`
        ).join("");
        $trendingScroll.querySelectorAll(".trending-tag").forEach(btn => {
            btn.addEventListener("click", () => {
                const kw = btn.dataset.keyword;
                $searchInput.value = kw;
                currentSearch = kw;
                currentPage = 1;
                applyFilters();
            });
        });
    }

    function buildCategoryList(categories) {
        const allBtn = $catList.querySelector('[data-category=""]');
        $catList.innerHTML = "";
        const li = document.createElement("li");
        li.appendChild(allBtn);
        allBtn.addEventListener("click", () => selectCategory(""));
        $catList.appendChild(li);

        categories.forEach((cat) => {
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.className = "cat-btn";
            btn.dataset.category = cat.category;
            btn.innerHTML = `${escapeHTML(cat.category)} <span class="cat-count">${cat.cnt}</span>`;
            btn.addEventListener("click", () => selectCategory(cat.category));
            li.appendChild(btn);
            $catList.appendChild(li);
        });
    }

    function selectCategory(cat) {
        currentCategory = cat;
        currentPage = 1;
        $catList.querySelectorAll(".cat-btn").forEach((b) => {
            b.classList.toggle("active", b.dataset.category === cat);
        });
        $title.textContent = cat || "Latest AI News";
        applyFilters();
    }

    // ── Client-side filtering & pagination ──────────────────────
    function applyFilters() {
        const search = currentSearch.toLowerCase();

        filteredArticles = allArticles.filter((a) => {
            if (currentCategory && a.category !== currentCategory) return false;
            if (search) {
                const haystack = `${a.title} ${a.summary} ${a.company_name || ""}`.toLowerCase();
                if (!haystack.includes(search)) return false;
            }
            return true;
        });

        const total = filteredArticles.length;
        const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
        if (currentPage > totalPages) currentPage = totalPages;

        const start = (currentPage - 1) * PER_PAGE;
        const pageArticles = filteredArticles.slice(start, start + PER_PAGE);

        if (pageArticles.length === 0) {
            $grid.innerHTML = "";
            $empty.style.display = "block";
            $pagination.innerHTML = "";
            $count.textContent = "";
            return;
        }

        $empty.style.display = "none";
        $count.textContent = `${total.toLocaleString()} article${total !== 1 ? "s" : ""}`;
        $grid.innerHTML = pageArticles.map(articleCard).join("");
        bindCardEvents();
        renderPagination(currentPage, totalPages);
        injectArticleSchema(pageArticles);
    }

    // ── Render a single card ────────────────────────────────────
    function articleCard(a) {
        const colour = categoryColours[a.category] || "#6366f1";
        const dateStr = formatDate(a.published_at);

        // Company logo or AI Unlocked default
        const logoSrc = a.company_logo || "assets/favicon.svg";
        const companyName = a.company_name || "AI Unlocked";
        const readTime = Math.max(1, Math.ceil(((a.summary || '').split(/\s+/).length) / 200));

        // Card image: use image_url, or the AI Unlocked branded default
        const image = a.image_url
            ? `<div class="card-image-wrap"><img class="card-image" src="${escapeAttr(a.image_url)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'card-image-placeholder\\'><img src=\\'assets/default-card.svg\\' alt=\\'\\'></div>'" /></div>`
            : `<div class="card-image-wrap"><div class="card-image-placeholder"><img src="assets/default-card.svg" alt=""></div></div>`;

        return `
        <article class="article-card" tabindex="0" role="button" aria-expanded="false">
            ${image}
            <div class="card-body">
                <div class="card-meta">
                    <span class="badge" style="background:${colour}">${escapeHTML(a.category)}</span>
                    <span class="card-reading-time">📖 ${readTime} min</span>
                    <span class="card-date">${dateStr}</span>
                </div>
                <div class="card-company">
                    <img class="company-logo" src="${escapeAttr(logoSrc)}" alt="${escapeAttr(companyName)}" onerror="this.src='assets/favicon.svg'" />
                    <span class="company-name">${escapeHTML(companyName)}</span>
                </div>
                <h3 class="card-title">${escapeHTML(a.title)}</h3>
                <p class="card-summary">${escapeHTML(a.summary)}</p>
                <div class="card-actions">
                    <button class="share-btn" data-share="twitter" data-title="${escapeAttr(a.title)}" data-url="${escapeAttr(a.guid)}" title="Share on X">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        X
                    </button>
                    <button class="share-btn" data-share="linkedin" data-title="${escapeAttr(a.title)}" data-url="${escapeAttr(a.guid)}" title="Share on LinkedIn">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                        LinkedIn
                    </button>
                    <button class="share-btn" data-share="reddit" data-title="${escapeAttr(a.title)}" data-url="${escapeAttr(a.guid)}" title="Share on Reddit">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>
                        Reddit
                    </button>
                    <button class="share-btn" data-share="copy" data-title="${escapeAttr(a.title)}" data-url="${escapeAttr(a.guid)}" title="Copy link">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        Copy
                    </button>
                    <button class="listen-btn" data-listen="${escapeAttr(a.title + '. ' + a.summary)}" title="Listen to summary">
                        🔊 Listen
                    </button>
                    <button class="clap-btn" data-article-id="${escapeAttr(a.guid || a.title)}" title="Like this article">
                        <span class="clap-emoji">👏</span>
                        <span class="clap-count">${getClapCount(a.guid || a.title)}</span>
                    </button>
                    <button class="copy-summary-btn" data-summary="${escapeAttr(a.summary)}" title="Copy summary">📋 Summary</button>
                    <button class="quote-card-btn" data-title="${escapeAttr(a.title)}" data-summary="${escapeAttr(a.summary)}" title="Create quote card">🖼️ Quote</button>
                    <span class="share-copied">Copied!</span>
                </div>
                <div class="card-footer">
                    <span class="card-expand-hint">Click to read more</span>
                </div>
            </div>
        </article>`;
    }

    // ── Card expand / collapse ──────────────────────────────────
    function bindCardEvents() {
        $grid.querySelectorAll(".article-card").forEach((card) => {
            // Expand/collapse on click (but not on buttons)
            card.addEventListener("click", (e) => {
                if (e.target.closest(".share-btn, .listen-btn, .clap-btn, .copy-summary-btn, .quote-card-btn")) return;
                const isExpanded = card.classList.contains("expanded");
                $grid.querySelectorAll(".article-card.expanded").forEach((c) => {
                    c.classList.remove("expanded");
                    c.setAttribute("aria-expanded", "false");
                    const hint = c.querySelector(".card-expand-hint");
                    if (hint) hint.textContent = "Click to read more";
                });
                if (!isExpanded) {
                    card.classList.add("expanded");
                    card.setAttribute("aria-expanded", "true");
                    const hint = card.querySelector(".card-expand-hint");
                    if (hint) hint.textContent = "Click to collapse";
                }
            });
            card.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    card.click();
                }
            });
        });

        // Share buttons
        $grid.querySelectorAll(".share-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const type = btn.dataset.share;
                const title = btn.dataset.title;
                const siteUrl = "https://aiunlocked.info";
                const text = `${title} — via AI Unlocked`;

                if (type === "twitter") {
                    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(siteUrl)}`, "_blank", "width=550,height=420");
                } else if (type === "linkedin") {
                    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(siteUrl)}&title=${encodeURIComponent(title)}`, "_blank", "width=550,height=520");
                } else if (type === "reddit") {
                    window.open(`https://reddit.com/submit?url=${encodeURIComponent(siteUrl)}&title=${encodeURIComponent(text)}`, "_blank", "width=550,height=520");
                } else if (type === "copy") {
                    navigator.clipboard.writeText(`${title} — ${siteUrl}`).then(() => {
                        const copied = btn.closest(".card-actions").querySelector(".share-copied");
                        if (copied) { copied.classList.add("show"); setTimeout(() => copied.classList.remove("show"), 1500); }
                    });
                }
            });
        });

        // Listen (TTS) buttons
        $grid.querySelectorAll(".listen-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (speechSynthesis.speaking) {
                    speechSynthesis.cancel();
                    $grid.querySelectorAll(".listen-btn.playing").forEach(b => b.classList.remove("playing"));
                    btn.innerHTML = "🔊 Listen";
                    return;
                }
                const text = btn.dataset.listen;
                const utter = new SpeechSynthesisUtterance(text);
                utter.rate = 1;
                utter.pitch = 1;
                utter.onstart = () => { btn.classList.add("playing"); btn.innerHTML = "⏹ Stop"; };
                utter.onend = () => { btn.classList.remove("playing"); btn.innerHTML = "🔊 Listen"; };
                utter.onerror = () => { btn.classList.remove("playing"); btn.innerHTML = "🔊 Listen"; };
                speechSynthesis.speak(utter);
            });
        });

        // Clap / Like buttons
        $grid.querySelectorAll(".clap-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = btn.dataset.articleId;
                const claps = JSON.parse(localStorage.getItem("aiunlocked-claps") || "{}");
                claps[id] = (claps[id] || 0) + 1;
                localStorage.setItem("aiunlocked-claps", JSON.stringify(claps));
                const countEl = btn.querySelector(".clap-count");
                countEl.textContent = claps[id];
                btn.classList.add("clap-animate");
                setTimeout(() => btn.classList.remove("clap-animate"), 600);
            });
        });

        // Copy Summary buttons
        $grid.querySelectorAll(".copy-summary-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(btn.dataset.summary).then(() => {
                    const copied = btn.closest(".card-actions").querySelector(".share-copied");
                    if (copied) { copied.classList.add("show"); setTimeout(() => copied.classList.remove("show"), 1500); }
                });
            });
        });

        // Quote Card buttons
        $grid.querySelectorAll(".quote-card-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                showQuoteCardModal(btn.dataset.title, btn.dataset.summary);
            });
        });
    }

    // ── Pagination ──────────────────────────────────────────────
    function renderPagination(page, totalPages) {
        if (totalPages <= 1) { $pagination.innerHTML = ""; return; }

        let html = "";
        html += `<button class="page-btn" ${page <= 1 ? "disabled" : ""} data-page="${page - 1}">← Prev</button>`;

        const range = paginationRange(page, totalPages);
        range.forEach((p) => {
            if (p === "…") {
                html += `<span style="color:var(--text-muted)">…</span>`;
            } else {
                html += `<button class="page-btn ${p === page ? "active" : ""}" data-page="${p}">${p}</button>`;
            }
        });

        html += `<button class="page-btn" ${page >= totalPages ? "disabled" : ""} data-page="${page + 1}">Next →</button>`;
        $pagination.innerHTML = html;

        $pagination.querySelectorAll(".page-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                if (btn.disabled) return;
                currentPage = parseInt(btn.dataset.page, 10);
                applyFilters();
                window.scrollTo({ top: 0, behavior: "smooth" });
            });
        });
    }

    function paginationRange(current, total) {
        const delta = 2;
        const range = [];
        for (let i = 1; i <= total; i++) {
            if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
                range.push(i);
            }
        }
        const withDots = [];
        let prev = 0;
        range.forEach((i) => {
            if (prev && i - prev > 1) withDots.push("…");
            withDots.push(i);
            prev = i;
        });
        return withDots;
    }

    // ── Skeleton ────────────────────────────────────────────────
    function showSkeleton() {
        $grid.innerHTML = Array(6).fill('<div class="skeleton-card"></div>').join("");
        $empty.style.display = "none";
    }

    // ── Search (debounced) ──────────────────────────────────────
    let searchTimer;
    $searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            currentSearch = $searchInput.value.trim();
            currentPage = 1;
            applyFilters();
        }, 400);
    });

    // ── Utilities ───────────────────────────────────────────────
    function escapeHTML(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function escapeAttr(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
    }
    function formatDate(iso) {
        if (!iso) return "";
        try {
            const d = new Date(iso);
            const now = new Date();
            const diffMs = now - d;
            const diffH = diffMs / 3600000;
            if (diffH < 1) return `${Math.max(1, Math.round(diffMs / 60000))}m ago`;
            if (diffH < 24) return `${Math.round(diffH)}h ago`;
            if (diffH < 48) return "Yesterday";
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        } catch {
            return iso.slice(0, 10);
        }
    }

    // ── Clap helper ─────────────────────────────────────────────
    function getClapCount(id) {
        const claps = JSON.parse(localStorage.getItem("aiunlocked-claps") || "{}");
        return claps[id] || 0;
    }

    // ── NewsArticle JSON-LD for SEO ─────────────────────────────
    function injectArticleSchema(articles) {
        const old = document.getElementById("dynamic-article-schema");
        if (old) old.remove();
        if (!articles || articles.length === 0) return;

        const items = articles.slice(0, 6).map(a => ({
            "@type": "NewsArticle",
            "headline": a.title,
            "description": a.summary,
            "datePublished": a.published_at,
            "author": {
                "@type": "Organization",
                "name": a.company_name || "AI Unlocked"
            },
            "publisher": {
                "@type": "Organization",
                "name": "AI Unlocked",
                "url": "https://aiunlocked.info",
                "logo": { "@type": "ImageObject", "url": "https://aiunlocked.info/assets/favicon.svg" }
            },
            "mainEntityOfPage": a.guid || "https://aiunlocked.info",
            "image": a.image_url || "https://aiunlocked.info/assets/og-image.png"
        }));

        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.id = "dynamic-article-schema";
        script.textContent = JSON.stringify({
            "@context": "https://schema.org",
            "@graph": items
        });
        document.head.appendChild(script);
    }

    // ══════════════════════════════════════════════════════════════
    //   AI QUIZ
    // ══════════════════════════════════════════════════════════════
    const quizQuestions = [
        {
            question: "What does GPT stand for?",
            options: ["General Purpose Technology", "Generative Pre-trained Transformer", "Global Processing Tool", "Graphical Pattern Tracker"],
            answer: 1
        },
        {
            question: "Which company created the transformer architecture used in most modern LLMs?",
            options: ["OpenAI", "Meta", "Google", "Microsoft"],
            answer: 2
        },
        {
            question: "What is 'hallucination' in the context of AI?",
            options: ["When an AI gains consciousness", "When an AI generates confident but incorrect information", "When an AI runs out of memory", "When an AI dreams during training"],
            answer: 1
        },
        {
            question: "What year was the original Transformer paper 'Attention Is All You Need' published?",
            options: ["2015", "2017", "2019", "2020"],
            answer: 1
        },
        {
            question: "Which technique allows LLMs to learn new tasks from just a few examples in the prompt?",
            options: ["Transfer Learning", "Backpropagation", "Few-Shot Prompting", "Gradient Descent"],
            answer: 2
        }
    ];

    let quizCurrent = 0;
    let quizScore = 0;
    let quizAnswered = false;

    function initQuiz() {
        const $quizContainer = document.getElementById("quizContainer");
        if (!$quizContainer) return;

        quizCurrent = 0;
        quizScore = 0;
        quizAnswered = false;
        renderQuizQuestion();
    }

    function renderQuizQuestion() {
        const $quizContainer = document.getElementById("quizContainer");
        if (quizCurrent >= quizQuestions.length) {
            showQuizResult();
            return;
        }
        const q = quizQuestions[quizCurrent];
        quizAnswered = false;
        $quizContainer.innerHTML = `
            <div class="quiz-progress">Question ${quizCurrent + 1} of ${quizQuestions.length}</div>
            <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${((quizCurrent) / quizQuestions.length) * 100}%"></div></div>
            <h3 class="quiz-question">${escapeHTML(q.question)}</h3>
            <div class="quiz-options">
                ${q.options.map((opt, i) => `<button class="quiz-option" data-index="${i}">${escapeHTML(opt)}</button>`).join("")}
            </div>
            <div class="quiz-feedback" id="quizFeedback"></div>
        `;
        $quizContainer.querySelectorAll(".quiz-option").forEach(btn => {
            btn.addEventListener("click", () => handleQuizAnswer(btn, parseInt(btn.dataset.index)));
        });
    }

    function handleQuizAnswer(btn, selected) {
        if (quizAnswered) return;
        quizAnswered = true;
        const q = quizQuestions[quizCurrent];
        const correct = selected === q.answer;
        const $feedback = document.getElementById("quizFeedback");
        const $quizContainer = document.getElementById("quizContainer");

        // Highlight correct/wrong
        $quizContainer.querySelectorAll(".quiz-option").forEach((b, i) => {
            b.disabled = true;
            if (i === q.answer) b.classList.add("correct");
            if (i === selected && !correct) b.classList.add("wrong");
        });

        if (correct) {
            quizScore++;
            $feedback.innerHTML = `<span class="quiz-correct">✅ Correct! Great job!</span>`;
        } else {
            $feedback.innerHTML = `<span class="quiz-wrong">❌ Oops! The answer was: ${escapeHTML(q.options[q.answer])}</span>`;
        }
        $feedback.style.display = "block";

        setTimeout(() => {
            quizCurrent++;
            renderQuizQuestion();
        }, 1800);
    }

    function showQuizResult() {
        const $quizContainer = document.getElementById("quizContainer");
        const passed = quizScore >= 3;
        const percentage = Math.round((quizScore / quizQuestions.length) * 100);
        const emoji = passed ? "🏆" : "💪";
        const title = passed ? "Amazing! You're an AI Expert!" : "Keep Learning, You'll Get There!";
        const message = passed
            ? `You nailed ${quizScore} out of ${quizQuestions.length}! You really know your AI stuff. Share this with your friends and challenge them!`
            : `You got ${quizScore} out of ${quizQuestions.length}. Don't worry — the AI world is evolving fast. Keep reading AI Unlocked and you'll ace it next time!`;

        $quizContainer.innerHTML = `
            <div class="quiz-result ${passed ? 'quiz-passed' : 'quiz-failed'}">
                <div class="quiz-result-emoji">${emoji}</div>
                <div class="quiz-result-score">${percentage}%</div>
                <h3 class="quiz-result-title">${title}</h3>
                <p class="quiz-result-message">${message}</p>
                <div class="quiz-result-stars">${'⭐'.repeat(quizScore)}${'☆'.repeat(quizQuestions.length - quizScore)}</div>
                <button class="quiz-retry-btn" id="quizRetryBtn">🔄 Try Again</button>
            </div>
        `;
        document.getElementById("quizRetryBtn").addEventListener("click", initQuiz);
    }

    // ══════════════════════════════════════════════════════════════
    //   FUN FACTS — Rotating display
    // ══════════════════════════════════════════════════════════════
    const funFacts = [
        { icon: "🧠", fact: "The human brain has about 86 billion neurons. GPT-4 is estimated to have over 1.7 trillion parameters — but still can't make a decent cup of coffee." },
        { icon: "⚡", fact: "Training GPT-3 consumed approximately 1,287 MWh of energy — enough to power 120 US homes for a full year." },
        { icon: "🤖", fact: "The term 'Artificial Intelligence' was coined in 1956 by John McCarthy at the Dartmouth Conference — almost 70 years ago!" },
        { icon: "📈", fact: "ChatGPT reached 100 million users in just 2 months after launch — the fastest-growing consumer app in history at the time." },
        { icon: "🎨", fact: "AI-generated art sold at Christie's for $432,500 in 2018. The artist? A GAN (Generative Adversarial Network) algorithm." },
        { icon: "🎮", fact: "DeepMind's AlphaGo defeated the world Go champion in 2016, a feat experts predicted wouldn't happen for another decade." },
        { icon: "🔬", fact: "AlphaFold by DeepMind predicted the 3D structures of nearly all known proteins — solving a 50-year-old biology challenge." },
        { icon: "🌍", fact: "Over 80% of enterprises worldwide are now using or exploring AI technologies in their business operations." }
    ];

    function initFunFacts() {
        const $factsGrid = document.getElementById("funFactsGrid");
        if (!$factsGrid) return;

        // Show 4 random facts
        const shuffled = funFacts.sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 4);

        $factsGrid.innerHTML = selected.map(f => `
            <div class="fun-fact-card">
                <span class="fun-fact-icon">${f.icon}</span>
                <p class="fun-fact-text">${escapeHTML(f.fact)}</p>
            </div>
        `).join("");
    }

    // Shuffle fun facts button
    function bindFunFactsShuffle() {
        const btn = document.getElementById("shuffleFactsBtn");
        if (btn) {
            btn.addEventListener("click", () => {
                initFunFacts();
                btn.classList.add("spin");
                setTimeout(() => btn.classList.remove("spin"), 600);
            });
        }
    }

    // ── Floating Quiz CTA ──────────────────────────────────────────
    function initFloatingQuizBtn() {
        const btn = document.getElementById("floatingQuizBtn");
        const quizSection = document.getElementById("quizSection");
        if (!btn || !quizSection) return;

        btn.addEventListener("click", () => {
            quizSection.scrollIntoView({ behavior: "smooth", block: "center" });
        });

        // Hide button when quiz section is visible
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                btn.classList.toggle("hidden", entry.isIntersecting);
            });
        }, { threshold: 0.2 });
        observer.observe(quizSection);
    }

    // ══════════════════════════════════════════════════════════════
    //   AI SUCCESS STORIES
    // ══════════════════════════════════════════════════════════════
    const successStories = [
        {
            icon: "🏥",
            company: "Google DeepMind & Moorfields Eye Hospital",
            industry: "Healthcare",
            title: "AI Detects Eye Diseases as Accurately as World-Leading Doctors",
            desc: "DeepMind partnered with Moorfields Eye Hospital to develop an AI system that can detect over 50 eye diseases from 3D retinal scans with 94% accuracy, matching top ophthalmologists and enabling faster diagnosis for millions.",
            stats: [{ value: "94%", label: "Accuracy" }, { value: "50+", label: "Diseases Detected" }],
            year: "2018"
        },
        {
            icon: "🧬",
            company: "DeepMind — AlphaFold",
            industry: "Science",
            title: "Predicting the 3D Structure of Nearly Every Known Protein",
            desc: "AlphaFold solved a 50-year grand challenge in biology by predicting the 3D structures of over 200 million proteins. The open-source database is now used by over 1 million researchers accelerating drug discovery and understanding of life itself.",
            stats: [{ value: "200M+", label: "Proteins Mapped" }, { value: "1M+", label: "Researchers" }],
            year: "2022"
        },
        {
            icon: "🚗",
            company: "Waymo (Alphabet)",
            industry: "Transportation",
            title: "Autonomous Ride-Hailing Serves Thousands of Trips Daily",
            desc: "Waymo's self-driving taxis now operate commercially in Phoenix, San Francisco, and Los Angeles, completing tens of thousands of fully autonomous rides per week with a safety record significantly better than human drivers.",
            stats: [{ value: "100K+", label: "Weekly Rides" }, { value: "3", label: "Cities Live" }],
            year: "2024"
        },
        {
            icon: "🌾",
            company: "John Deere & Blue River Technology",
            industry: "Agriculture",
            title: "AI-Powered Precision Farming Cuts Herbicide Use by 90%",
            desc: "John Deere's See & Spray technology uses computer vision to identify individual weeds and spray only those plants, reducing herbicide usage by up to 90% and saving farmers billions while protecting the environment.",
            stats: [{ value: "90%", label: "Less Herbicide" }, { value: "$B+", label: "Savings" }],
            year: "2023"
        },
        {
            icon: "🎵",
            company: "Spotify",
            industry: "Entertainment",
            title: "AI-Driven Personalization Powers 600M+ User Experiences",
            desc: "Spotify's AI recommendation engine analyses listening patterns across 600M+ users to deliver hyper-personalized playlists like Discover Weekly, which has driven over 2.3 billion hours of music discovery since launch.",
            stats: [{ value: "600M+", label: "Users" }, { value: "2.3B", label: "Hours Discovered" }],
            year: "2024"
        },
        {
            icon: "🔬",
            company: "Insilico Medicine",
            industry: "Pharma",
            title: "AI-Discovered Drug Reaches Human Clinical Trials in Record Time",
            desc: "Insilico Medicine used generative AI to discover a novel drug candidate for idiopathic pulmonary fibrosis, going from target discovery to Phase II clinical trials in under 30 months — a process that typically takes 4–6 years.",
            stats: [{ value: "<30", label: "Months to Trial" }, { value: "Phase II", label: "Stage" }],
            year: "2023"
        },
        {
            icon: "🛡️",
            company: "JPMorgan Chase",
            industry: "Finance",
            title: "AI Fraud Detection Saves Billions in Prevented Losses",
            desc: "JPMorgan's AI-powered fraud detection system analyses billions of transactions in real-time, identifying suspicious patterns and preventing an estimated $2 billion in fraudulent activities annually while reducing false positives by 50%.",
            stats: [{ value: "$2B+", label: "Fraud Prevented" }, { value: "50%", label: "Fewer False Positives" }],
            year: "2024"
        },
        {
            icon: "🌍",
            company: "Google — Flood Forecasting Initiative",
            industry: "Climate",
            title: "AI Flood Warnings Protect 460 Million People",
            desc: "Google's AI-powered flood forecasting system provides accurate alerts up to 7 days in advance across 80+ countries, covering 460 million people in flood-prone regions. The system has sent over 115 million life-saving notifications.",
            stats: [{ value: "460M", label: "People Protected" }, { value: "7 Days", label: "Advance Warning" }],
            year: "2024"
        },
        {
            icon: "💊",
            company: "BenevolentAI",
            industry: "Pharma",
            title: "AI Repurposed Existing Drug for COVID-19 Treatment",
            desc: "BenevolentAI used its knowledge graph and AI platform to identify baricitinib — an existing rheumatoid arthritis drug — as a potential COVID-19 treatment in just 3 days. It was later approved by the FDA for emergency use.",
            stats: [{ value: "3 Days", label: "Discovery Time" }, { value: "FDA", label: "Approved" }],
            year: "2020"
        },
        {
            icon: "📦",
            company: "Amazon",
            industry: "Logistics",
            title: "AI-Optimized Supply Chain Enables Same-Day Delivery",
            desc: "Amazon's AI systems predict customer demand, optimize warehouse placement, and route deliveries in real-time. This AI backbone powers same-day and next-day delivery for hundreds of millions of items across 20+ countries.",
            stats: [{ value: "20+", label: "Countries" }, { value: "Billions", label: "Packages/Year" }],
            year: "2024"
        },
        {
            icon: "🔋",
            company: "Google DeepMind",
            industry: "Energy",
            title: "AI Reduces Data Centre Cooling Energy by 40%",
            desc: "DeepMind's AI system optimises Google's data centre cooling in real-time, reducing energy used for cooling by 40% and overall energy consumption by 15%. This has saved hundreds of millions of dollars and significantly cut carbon emissions.",
            stats: [{ value: "40%", label: "Energy Saved" }, { value: "15%", label: "Total Reduction" }],
            year: "2018"
        },
        {
            icon: "🗣️",
            company: "Duolingo",
            industry: "Education",
            title: "AI Tutor Personalizes Language Learning for 80M+ Users",
            desc: "Duolingo leverages GPT-4 to power Duolingo Max, offering AI conversation partners and personalized explanations. The AI adapts difficulty in real-time, improving learner retention by 30% and making language learning accessible to millions worldwide.",
            stats: [{ value: "80M+", label: "Monthly Users" }, { value: "30%", label: "Better Retention" }],
            year: "2024"
        },
        {
            icon: "🛰️",
            company: "NASA — Jet Propulsion Laboratory",
            industry: "Space",
            title: "AI Autonomously Navigates Mars Rovers Across Alien Terrain",
            desc: "NASA's AI-driven AutoNav system allows Mars rovers like Perseverance to autonomously navigate hazardous terrain, making real-time driving decisions. The rover drives 5x faster than previous missions, accelerating scientific discovery on Mars.",
            stats: [{ value: "5x", label: "Faster Navigation" }, { value: "Auto", label: "Autonomous" }],
            year: "2023"
        },
        {
            icon: "👁️",
            company: "Zebra Medical Vision",
            industry: "Healthcare",
            title: "AI Scans Medical Images to Flag Life-Threatening Conditions",
            desc: "Zebra Medical's AI analyses CT scans, X-rays, and mammograms to detect conditions like cancer, cardiovascular disease, and liver disease. Deployed in 1,000+ hospitals globally, it helps radiologists prioritize critical cases and catch what humans might miss.",
            stats: [{ value: "1000+", label: "Hospitals" }, { value: "10+", label: "Conditions" }],
            year: "2023"
        },
        {
            icon: "⚖️",
            company: "DoNotPay",
            industry: "Legal",
            title: "AI Robot Lawyer Overturns 300,000+ Parking Tickets",
            desc: "DoNotPay's AI chatbot lawyer helped users successfully contest over 300,000 parking tickets across London and New York, saving users millions in fines. The AI expanded to handle consumer disputes, cancellations, and small claims.",
            stats: [{ value: "300K+", label: "Tickets Overturned" }, { value: "$M+", label: "User Savings" }],
            year: "2020"
        },
        {
            icon: "🏗️",
            company: "Autodesk",
            industry: "Construction",
            title: "Generative AI Designs Structures Humans Never Imagined",
            desc: "Autodesk's generative design AI explores thousands of design possibilities based on constraints like materials, cost, and manufacturing methods. It's helped engineers create parts 40% lighter and 20% stronger than traditional designs, revolutionizing manufacturing.",
            stats: [{ value: "40%", label: "Lighter Parts" }, { value: "20%", label: "Stronger" }],
            year: "2023"
        },
        {
            icon: "🎯",
            company: "Netflix",
            industry: "Entertainment",
            title: "AI Recommendation Engine Saves $1 Billion Annually",
            desc: "Netflix's AI recommendation system personalizes content for 260M+ subscribers across 190 countries. The system is so effective that 80% of content watched is driven by recommendations, saving Netflix an estimated $1B per year in customer retention.",
            stats: [{ value: "$1B", label: "Annual Savings" }, { value: "80%", label: "AI-Driven Views" }],
            year: "2024"
        },
        {
            icon: "🌊",
            company: "Ocean Cleanup & AI Partners",
            industry: "Environment",
            title: "AI-Guided Systems Remove Millions of Kg of Ocean Plastic",
            desc: "The Ocean Cleanup project uses AI-powered sensors and satellite imagery to track and predict plastic accumulation in oceans. AI optimizes cleanup vessel routes, helping remove over 10 million kg of plastic from waterways and the Great Pacific Garbage Patch.",
            stats: [{ value: "10M+ kg", label: "Plastic Removed" }, { value: "AI", label: "Route Optimization" }],
            year: "2024"
        },
        {
            icon: "🏦",
            company: "Ant Group (Alibaba)",
            industry: "Finance",
            title: "AI Approves Micro-Loans in 3 Minutes for 20M+ Small Businesses",
            desc: "Ant Group's AI-driven credit system analyses thousands of data points to approve micro-loans in under 3 minutes with no human intervention. Over 20 million small businesses have received funding, with default rates lower than traditional banks.",
            stats: [{ value: "3 Min", label: "Approval Time" }, { value: "20M+", label: "Businesses Served" }],
            year: "2023"
        },
        {
            icon: "🧪",
            company: "Microsoft & Novartis",
            industry: "Pharma",
            title: "AI Generative Chemistry Discovers Novel Drug Candidates",
            desc: "Microsoft's AI platform partnered with Novartis to use generative chemistry models that design entirely new molecular structures for drug candidates. The system reduced the early discovery phase from years to weeks, with multiple candidates now in preclinical testing.",
            stats: [{ value: "Weeks", label: "vs Years" }, { value: "Novel", label: "Molecules" }],
            year: "2024"
        }
    ];

    const SS_PER_PAGE = 6;
    let ssCurrentPage = 1;
    let ssCurrentFilter = "all";
    let ssListView = false;

    function getSSIndustries() {
        const set = new Set(successStories.map(s => s.industry));
        return [...set].sort();
    }

    function initSuccessStories() {
        const $filterBar = document.getElementById("ssFilterBar");
        const $viewToggle = document.getElementById("ssViewToggle");
        if (!$filterBar) return;

        // Build filter buttons
        const industries = getSSIndustries();
        industries.forEach(ind => {
            const btn = document.createElement("button");
            btn.className = "ss-filter-btn";
            btn.dataset.filter = ind;
            btn.textContent = ind;
            btn.addEventListener("click", () => {
                ssCurrentFilter = ind;
                ssCurrentPage = 1;
                $filterBar.querySelectorAll(".ss-filter-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === ind));
                renderSuccessStories();
            });
            $filterBar.appendChild(btn);
        });

        // "All" button
        $filterBar.querySelector('[data-filter="all"]').addEventListener("click", () => {
            ssCurrentFilter = "all";
            ssCurrentPage = 1;
            $filterBar.querySelectorAll(".ss-filter-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === "all"));
            renderSuccessStories();
        });

        // View toggle
        $viewToggle.addEventListener("click", () => {
            ssListView = !ssListView;
            $viewToggle.textContent = ssListView ? "⊟" : "⊞";
            const grid = document.getElementById("successStoriesGrid");
            grid.classList.toggle("ss-list-view", ssListView);
        });

        renderSuccessStories();
    }

    function renderSuccessStories() {
        const $grid = document.getElementById("successStoriesGrid");
        const $pagination = document.getElementById("ssPagination");

        const filtered = ssCurrentFilter === "all"
            ? successStories
            : successStories.filter(s => s.industry === ssCurrentFilter);

        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / SS_PER_PAGE));
        if (ssCurrentPage > totalPages) ssCurrentPage = totalPages;

        const start = (ssCurrentPage - 1) * SS_PER_PAGE;
        const page = filtered.slice(start, start + SS_PER_PAGE);

        $grid.innerHTML = page.map(s => `
            <div class="ss-card">
                <div class="ss-card-accent"></div>
                <div class="ss-card-body">
                    <span class="ss-card-year">${escapeHTML(s.year)}</span>
                    <div class="ss-card-header">
                        <div class="ss-card-icon">${s.icon}</div>
                        <div class="ss-card-meta">
                            <div class="ss-card-company">${escapeHTML(s.company)}</div>
                            <span class="ss-card-industry">${escapeHTML(s.industry)}</span>
                        </div>
                    </div>
                    <h3 class="ss-card-title">${escapeHTML(s.title)}</h3>
                    <p class="ss-card-desc">${escapeHTML(s.desc)}</p>
                    <div class="ss-card-stats">
                        ${s.stats.map(st => `
                            <div class="ss-stat">
                                <span class="ss-stat-value">${escapeHTML(st.value)}</span>
                                <span class="ss-stat-label">${escapeHTML(st.label)}</span>
                            </div>
                        `).join("")}
                    </div>
                </div>
            </div>
        `).join("");

        // Pagination
        if (totalPages <= 1) {
            $pagination.innerHTML = "";
            return;
        }
        $pagination.innerHTML = `
            <button class="ss-page-btn" ${ssCurrentPage <= 1 ? "disabled" : ""} data-ss-page="${ssCurrentPage - 1}">← Prev</button>
            <span class="ss-page-info">${ssCurrentPage} / ${totalPages}</span>
            <button class="ss-page-btn" ${ssCurrentPage >= totalPages ? "disabled" : ""} data-ss-page="${ssCurrentPage + 1}">Next →</button>
        `;
        $pagination.querySelectorAll(".ss-page-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                if (btn.disabled) return;
                ssCurrentPage = parseInt(btn.dataset.ssPage, 10);
                renderSuccessStories();
                document.getElementById("successStoriesSection").scrollIntoView({ behavior: "smooth", block: "start" });
            });
        });
    }

    // ══════════════════════════════════════════════════════════════
    //   AI GAMES ARCADE — 5 Mini-Games
    // ══════════════════════════════════════════════════════════════

    // ── Shared state ────────────────────────────────────────────
    let activeGame = "emoji";

    function initGamesArcade() {
        const tabs = document.querySelectorAll("#gamesTabs .game-tab");
        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                tabs.forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                activeGame = tab.dataset.game;
                launchGame(activeGame);
            });
        });
        launchGame("emoji");
    }

    function launchGame(name) {
        const c = document.getElementById("gameContainer");
        if (!c) return;
        switch (name) {
            case "emoji":    startEmojiDecoder(c);   break;
            case "scramble": startWordScramble(c);    break;
            case "speedmatch": startSpeedMatch(c);    break;
            case "aiorhuman": startAIorHuman(c);      break;
            case "acronym":  startAcronymChallenge(c); break;
        }
    }

    // ────────────────────────────────────────────────────────────
    //  GAME 1: AI Emoji Decoder
    // ────────────────────────────────────────────────────────────
    const emojiRounds = [
        { emojis: "🧠🔄🤖", answer: "Neural Network", options: ["Neural Network", "Blockchain", "Quantum Computing", "Cloud Storage"] },
        { emojis: "👁️🖼️🔍", answer: "Computer Vision", options: ["Computer Vision", "Data Mining", "Encryption", "Web Scraping"] },
        { emojis: "💬🤖✨", answer: "Chatbot", options: ["Database", "Chatbot", "Firewall", "Compiler"] },
        { emojis: "📊📈🔮", answer: "Predictive Analytics", options: ["Predictive Analytics", "Data Entry", "Social Media", "Email Marketing"] },
        { emojis: "🎨🖌️🤖", answer: "Generative AI", options: ["Generative AI", "Graphic Design", "3D Printing", "Animation Studio"] },
        { emojis: "🗣️📝🤖", answer: "Speech to Text", options: ["Text Editor", "Speech to Text", "Audio Mixer", "Podcast App"] },
        { emojis: "🧬🔬💊", answer: "AI Drug Discovery", options: ["Chemistry Lab", "AI Drug Discovery", "Genome Editing", "Pharmacy"] },
        { emojis: "🚗💨🚫🧑", answer: "Self-Driving Car", options: ["Electric Car", "Car Racing", "Self-Driving Car", "Traffic Jam"] },
        { emojis: "🔒🧠🛡️", answer: "AI Cybersecurity", options: ["Password Manager", "AI Cybersecurity", "Antivirus", "Safe Deposit"] },
        { emojis: "🌍🛰️🌡️", answer: "Climate AI", options: ["Weather App", "Climate AI", "Satellite TV", "GPS Navigation"] }
    ];

    function startEmojiDecoder(container) {
        let rounds = shuffleArr([...emojiRounds]).slice(0, 5);
        let idx = 0, score = 0, answered = false;

        function render() {
            if (idx >= rounds.length) { showGameResult(container, score, rounds.length, "Emoji Decoder", startEmojiDecoder); return; }
            const r = rounds[idx];
            answered = false;
            const opts = shuffleArr([...r.options]);
            container.innerHTML = `
                <div class="game-hud">
                    <div class="game-hud-left"><span class="game-score-pill">⭐ ${score}/${rounds.length}</span></div>
                    <span class="game-round-pill">Round ${idx + 1} of ${rounds.length}</span>
                </div>
                <div class="game-prompt">
                    <span class="game-prompt-emoji">${r.emojis}</span>
                    <p class="game-prompt-hint">What AI concept do these emojis represent?</p>
                </div>
                <div class="game-options">${opts.map(o => `<button class="game-option-btn" data-val="${escapeAttr(o)}">${escapeHTML(o)}</button>`).join("")}</div>
                <div class="game-feedback" id="gameFb"></div>`;
            container.querySelectorAll(".game-option-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    if (answered) return;
                    answered = true;
                    const correct = btn.dataset.val === r.answer;
                    if (correct) score++;
                    container.querySelectorAll(".game-option-btn").forEach(b => {
                        b.disabled = true;
                        if (b.dataset.val === r.answer) b.classList.add("correct");
                        if (b === btn && !correct) b.classList.add("wrong");
                    });
                    const fb = document.getElementById("gameFb");
                    fb.className = "game-feedback " + (correct ? "correct" : "wrong");
                    fb.textContent = correct ? "✅ Correct!" : `❌ It was: ${r.answer}`;
                    setTimeout(() => { idx++; render(); }, 1400);
                });
            });
        }
        render();
    }

    // ────────────────────────────────────────────────────────────
    //  GAME 2: AI Word Scramble
    // ────────────────────────────────────────────────────────────
    const scrambleWords = [
        { word: "TRANSFORMER", hint: "Architecture behind GPT & BERT" },
        { word: "HALLUCINATION", hint: "When AI confidently says something wrong" },
        { word: "BACKPROPAGATION", hint: "How neural networks learn from errors" },
        { word: "DEEPFAKE", hint: "AI-generated fake video or audio" },
        { word: "OVERFITTING", hint: "Model memorises training data too well" },
        { word: "EMBEDDING", hint: "Turning words into number vectors" },
        { word: "DIFFUSION", hint: "Process behind Stable Diffusion images" },
        { word: "TOKENIZER", hint: "Splits text into pieces for LLMs" },
        { word: "GRADIENT", hint: "Guides parameter updates during training" },
        { word: "PERCEPTRON", hint: "Simplest type of neural network node" }
    ];

    function startWordScramble(container) {
        let rounds = shuffleArr([...scrambleWords]).slice(0, 5);
        let idx = 0, score = 0;

        function render() {
            if (idx >= rounds.length) { showGameResult(container, score, rounds.length, "Word Scramble", startWordScramble); return; }
            const r = rounds[idx];
            const scrambled = shuffleArr(r.word.split(""));
            let chosen = [];
            let used = new Array(scrambled.length).fill(false);

            function draw() {
                container.innerHTML = `
                    <div class="game-hud">
                        <div class="game-hud-left"><span class="game-score-pill">⭐ ${score}/${rounds.length}</span></div>
                        <span class="game-round-pill">Round ${idx + 1} of ${rounds.length}</span>
                    </div>
                    <div class="game-prompt">
                        <p class="game-prompt-hint">💡 Hint: ${escapeHTML(r.hint)}</p>
                    </div>
                    <div style="text-align:center;margin-bottom:14px;">
                        <span class="game-prompt-text">${chosen.length ? chosen.join("") : "_ ".repeat(r.word.length).trim()}</span>
                    </div>
                    <div class="scramble-tiles">${scrambled.map((ch, i) => `<div class="scramble-tile ${used[i] ? "used" : ""}" data-idx="${i}">${ch}</div>`).join("")}</div>
                    <div style="display:flex;gap:10px;justify-content:center;margin-top:10px;">
                        <button class="game-submit-btn" id="scrUndo">↩ Undo</button>
                        <button class="game-submit-btn" id="scrSubmit">Submit</button>
                    </div>
                    <div class="game-feedback" id="gameFb"></div>`;

                container.querySelectorAll(".scramble-tile:not(.used)").forEach(tile => {
                    tile.addEventListener("click", () => {
                        const i = parseInt(tile.dataset.idx);
                        if (used[i]) return;
                        used[i] = true;
                        chosen.push(scrambled[i]);
                        draw();
                    });
                });
                document.getElementById("scrUndo").addEventListener("click", () => {
                    if (chosen.length === 0) return;
                    const last = chosen.pop();
                    for (let i = used.length - 1; i >= 0; i--) {
                        if (used[i] && scrambled[i] === last) { used[i] = false; break; }
                    }
                    draw();
                });
                document.getElementById("scrSubmit").addEventListener("click", () => {
                    const attempt = chosen.join("");
                    const correct = attempt === r.word;
                    if (correct) score++;
                    const fb = document.getElementById("gameFb");
                    fb.className = "game-feedback " + (correct ? "correct" : "wrong");
                    fb.textContent = correct ? "✅ Correct!" : `❌ The word was: ${r.word}`;
                    setTimeout(() => { idx++; render(); }, 1400);
                });
            }
            draw();
        }
        render();
    }

    // ────────────────────────────────────────────────────────────
    //  GAME 3: Speed Match (match terms to definitions)
    // ────────────────────────────────────────────────────────────
    const speedPairs = [
        { term: "LLM", def: "Large Language Model" },
        { term: "GAN", def: "Generates fake realistic data" },
        { term: "NLP", def: "Processing human language" },
        { term: "CNN", def: "Image recognition network" },
        { term: "Reinforcement Learning", def: "Learn by reward & penalty" },
        { term: "Fine-tuning", def: "Adapting a pre-trained model" },
        { term: "Tokenization", def: "Splitting text into tokens" },
        { term: "Inference", def: "Running a trained model" },
        { term: "Epoch", def: "One full pass through data" },
        { term: "Attention", def: "Focus on relevant input parts" },
        { term: "RAG", def: "Retrieval-Augmented Generation" },
        { term: "RLHF", def: "Learn from human feedback" }
    ];

    function startSpeedMatch(container) {
        const pairs = shuffleArr([...speedPairs]).slice(0, 4);
        const shuffledDefs = shuffleArr(pairs.map(p => ({ term: p.term, def: p.def })));
        let selectedTerm = null, matched = new Set(), score = 0;
        let timeLeft = 30, timerInterval = null;

        function render() {
            container.innerHTML = `
                <div class="game-hud">
                    <div class="game-hud-left">
                        <span class="game-score-pill">⭐ ${score}/${pairs.length}</span>
                        <span class="game-timer-pill ${timeLeft <= 10 ? "warn" : ""}" id="smTimer">⏱ ${timeLeft}s</span>
                    </div>
                    <span class="game-round-pill">Match terms to definitions</span>
                </div>
                <div class="speed-pairs">
                    ${pairs.map((p, i) => `
                        <div class="speed-pair-row">
                            <div class="speed-pair-term ${matched.has(p.term) ? "matched" : ""} ${selectedTerm === p.term ? "selected" : ""}" data-term="${escapeAttr(p.term)}">${escapeHTML(p.term)}</div>
                            <div class="speed-pair-def ${matched.has(shuffledDefs[i].term) ? "matched" : ""}" data-term="${escapeAttr(shuffledDefs[i].term)}">${escapeHTML(shuffledDefs[i].def)}</div>
                        </div>
                    `).join("")}
                </div>
                <div class="game-feedback" id="gameFb"></div>`;

            container.querySelectorAll(".speed-pair-term:not(.matched)").forEach(el => {
                el.addEventListener("click", () => { selectedTerm = el.dataset.term; render(); });
            });
            container.querySelectorAll(".speed-pair-def:not(.matched)").forEach(el => {
                el.addEventListener("click", () => {
                    if (!selectedTerm) return;
                    if (el.dataset.term === selectedTerm) {
                        matched.add(selectedTerm);
                        score++;
                        selectedTerm = null;
                        if (matched.size === pairs.length) {
                            clearInterval(timerInterval);
                            setTimeout(() => showGameResult(container, score, pairs.length, "Speed Match", startSpeedMatch), 500);
                        } else { render(); }
                    } else {
                        el.classList.add("wrong-flash");
                        const fb = document.getElementById("gameFb");
                        fb.className = "game-feedback wrong";
                        fb.textContent = "❌ Not a match! Try again.";
                        setTimeout(() => { el.classList.remove("wrong-flash"); fb.textContent = ""; }, 800);
                        selectedTerm = null;
                    }
                });
            });
        }

        render();
        timerInterval = setInterval(() => {
            timeLeft--;
            const el = document.getElementById("smTimer");
            if (el) { el.textContent = `⏱ ${timeLeft}s`; if (timeLeft <= 10) el.classList.add("warn"); }
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                showGameResult(container, score, pairs.length, "Speed Match", startSpeedMatch);
            }
        }, 1000);
    }

    // ────────────────────────────────────────────────────────────
    //  GAME 4: AI or Human?
    // ────────────────────────────────────────────────────────────
    const aohStatements = [
        { text: "The average housecat has 230 bones, which is 24 more than a human.", source: "human", explain: "This is a real fact written by a human." },
        { text: "Elephants are the only animals that can't jump, primarily because their knee joints bend in the opposite direction of most mammals.", source: "ai", explain: "AI-generated — elephant knees bend normally; they can't jump due to weight, not joint direction." },
        { text: "The first computer programmer was Ada Lovelace, who wrote algorithms for Charles Babbage's Analytical Engine in the 1840s.", source: "human", explain: "True historical fact written by a human." },
        { text: "Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still perfectly edible.", source: "human", explain: "This is a well-known true fact." },
        { text: "Octopuses have three hearts and blue blood because their blood uses copper-based hemocyanin rather than iron-based hemoglobin.", source: "human", explain: "Accurate biology fact from a human source." },
        { text: "The Great Wall of China is the only man-made structure visible from space with the naked eye.", source: "ai", explain: "AI-generated myth — the Great Wall is NOT visible from space with the naked eye." },
        { text: "Quantum computers can already solve any mathematical problem billions of times faster than classical computers.", source: "ai", explain: "AI-generated — quantum computers only speed up certain types of problems, not all." },
        { text: "GPT-4 was trained on every book ever written in human history to achieve its language capabilities.", source: "ai", explain: "AI-generated — GPT-4 was trained on a large but curated dataset, not every book ever written." },
        { text: "The term 'bug' in computing originated when a moth was found inside Harvard's Mark II computer in 1947.", source: "human", explain: "True story — Grace Hopper's team found the moth." },
        { text: "Machine learning models can now predict earthquakes with 99.7% accuracy up to one week before they occur.", source: "ai", explain: "AI-generated — earthquake prediction at this accuracy is not yet possible." }
    ];

    function startAIorHuman(container) {
        let rounds = shuffleArr([...aohStatements]).slice(0, 5);
        let idx = 0, score = 0, answered = false;

        function render() {
            if (idx >= rounds.length) { showGameResult(container, score, rounds.length, "AI or Human?", startAIorHuman); return; }
            const r = rounds[idx];
            answered = false;
            container.innerHTML = `
                <div class="game-hud">
                    <div class="game-hud-left"><span class="game-score-pill">⭐ ${score}/${rounds.length}</span></div>
                    <span class="game-round-pill">Round ${idx + 1} of ${rounds.length}</span>
                </div>
                <div class="game-prompt"><p class="game-prompt-hint">Was this written by a human or generated by AI?</p></div>
                <div class="aoh-statement-card"><p class="aoh-quote">"${escapeHTML(r.text)}"</p></div>
                <div class="aoh-buttons">
                    <button class="aoh-btn" data-choice="human">🧑 Human</button>
                    <button class="aoh-btn" data-choice="ai">🤖 AI</button>
                </div>
                <div class="game-feedback" id="gameFb"></div>`;
            container.querySelectorAll(".aoh-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    if (answered) return;
                    answered = true;
                    const correct = btn.dataset.choice === r.source;
                    if (correct) score++;
                    container.querySelectorAll(".aoh-btn").forEach(b => {
                        b.disabled = true;
                        if (b.dataset.choice === r.source) b.classList.add("correct");
                        if (b === btn && !correct) b.classList.add("wrong");
                    });
                    const fb = document.getElementById("gameFb");
                    fb.className = "game-feedback " + (correct ? "correct" : "wrong");
                    fb.textContent = (correct ? "✅ " : "❌ ") + r.explain;
                    setTimeout(() => { idx++; render(); }, 2200);
                });
            });
        }
        render();
    }

    // ────────────────────────────────────────────────────────────
    //  GAME 5: AI Acronym Challenge
    // ────────────────────────────────────────────────────────────
    const acronymRounds = [
        { acronym: "GPT", answer: "Generative Pre-trained Transformer", options: ["Generative Pre-trained Transformer", "General Purpose Technology", "Global Processing Tool", "Graphical Pattern Tracker"] },
        { acronym: "NLP", answer: "Natural Language Processing", options: ["Natural Language Processing", "Neural Logic Programming", "Network Layer Protocol", "New Learning Platform"] },
        { acronym: "CNN", answer: "Convolutional Neural Network", options: ["Convolutional Neural Network", "Central News Network", "Computer Node Nexus", "Connected Neuron Nucleus"] },
        { acronym: "GAN", answer: "Generative Adversarial Network", options: ["Generative Adversarial Network", "Global AI Nexus", "Graphical Animation Node", "General Activation Network"] },
        { acronym: "BERT", answer: "Bidirectional Encoder Representations from Transformers", options: ["Bidirectional Encoder Representations from Transformers", "Binary Encoded Real-Time Transformer", "Balanced Entity Recognition Tool", "Basic Encoder for Recurrent Tasks"] },
        { acronym: "RLHF", answer: "Reinforcement Learning from Human Feedback", options: ["Reinforcement Learning from Human Feedback", "Recurrent Learning with Hidden Features", "Rapid Language Handling Framework", "Real-time Logic for Hybrid Functions"] },
        { acronym: "RAG", answer: "Retrieval-Augmented Generation", options: ["Retrieval-Augmented Generation", "Rapid AI Growth", "Recurrent Attention Gate", "Reinforced Adaptive Generator"] },
        { acronym: "LLM", answer: "Large Language Model", options: ["Large Language Model", "Linear Logic Machine", "Layered Learning Module", "Long-term Learning Memory"] },
        { acronym: "AGI", answer: "Artificial General Intelligence", options: ["Artificial General Intelligence", "Advanced GPU Integration", "Automated Governance Interface", "Adaptive Graph Inference"] },
        { acronym: "CUDA", answer: "Compute Unified Device Architecture", options: ["Compute Unified Device Architecture", "Central Unit for Data Analysis", "Compiled Universal Driver API", "Custom Unified Data Array"] }
    ];

    function startAcronymChallenge(container) {
        let rounds = shuffleArr([...acronymRounds]).slice(0, 5);
        let idx = 0, score = 0, answered = false;

        function render() {
            if (idx >= rounds.length) { showGameResult(container, score, rounds.length, "Acronym Challenge", startAcronymChallenge); return; }
            const r = rounds[idx];
            answered = false;
            const opts = shuffleArr([...r.options]);
            container.innerHTML = `
                <div class="game-hud">
                    <div class="game-hud-left"><span class="game-score-pill">⭐ ${score}/${rounds.length}</span></div>
                    <span class="game-round-pill">Round ${idx + 1} of ${rounds.length}</span>
                </div>
                <div class="game-prompt">
                    <span class="game-prompt-text">${escapeHTML(r.acronym)}</span>
                    <p class="game-prompt-hint">What does this AI acronym stand for?</p>
                </div>
                <div class="game-options">${opts.map(o => `<button class="game-option-btn" data-val="${escapeAttr(o)}">${escapeHTML(o)}</button>`).join("")}</div>
                <div class="game-feedback" id="gameFb"></div>`;
            container.querySelectorAll(".game-option-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    if (answered) return;
                    answered = true;
                    const correct = btn.dataset.val === r.answer;
                    if (correct) score++;
                    container.querySelectorAll(".game-option-btn").forEach(b => {
                        b.disabled = true;
                        if (b.dataset.val === r.answer) b.classList.add("correct");
                        if (b === btn && !correct) b.classList.add("wrong");
                    });
                    const fb = document.getElementById("gameFb");
                    fb.className = "game-feedback " + (correct ? "correct" : "wrong");
                    fb.textContent = correct ? "✅ Correct!" : `❌ It stands for: ${r.answer}`;
                    setTimeout(() => { idx++; render(); }, 1400);
                });
            });
        }
        render();
    }

    // ── Shared game utilities ───────────────────────────────────
    function shuffleArr(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function showGameResult(container, score, total, gameName, restartFn) {
        const pct = Math.round((score / total) * 100);
        const passed = pct >= 60;
        const emoji = pct === 100 ? "🏆" : passed ? "🎉" : "💪";
        const title = pct === 100 ? "Perfect Score!" : passed ? "Great Job!" : "Keep Trying!";
        const msg = pct === 100
            ? `Flawless! You aced ${gameName}! Share this with friends!`
            : passed
            ? `You scored ${score}/${total} in ${gameName}. Well done!`
            : `You got ${score}/${total} in ${gameName}. Practice makes perfect!`;

        container.innerHTML = `
            <div class="game-result">
                <div class="game-result-emoji">${emoji}</div>
                <div class="game-result-score">${pct}%</div>
                <h3 class="game-result-title">${title}</h3>
                <p class="game-result-msg">${msg}</p>
                <button class="game-play-btn" id="gameReplayBtn">🔄 Play Again</button>
            </div>`;
        document.getElementById("gameReplayBtn").addEventListener("click", () => restartFn(container));
    }

    // ══════════════════════════════════════════════════════════════
    //   SECTION NAV — Active highlight on scroll + smooth scroll
    // ══════════════════════════════════════════════════════════════
    function initSectionNav() {
        const nav = document.getElementById("sectionNav");
        const links = document.querySelectorAll(".section-nav-link");
        if (!nav || !links.length) return;

        // Smooth scroll on click
        links.forEach(link => {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                const target = document.querySelector(link.getAttribute("href"));
                if (target) {
                    const offset = 120; // header + nav height
                    const top = target.getBoundingClientRect().top + window.scrollY - offset;
                    window.scrollTo({ top, behavior: "smooth" });
                }
            });
        });

        // Highlight active section on scroll
        const sectionMap = [
            { id: "articles", el: document.getElementById("articlesGrid") },
            { id: "games", el: document.getElementById("gamesArcadeSection") },
            { id: "stories", el: document.getElementById("successStoriesSection") },
            { id: "quiz", el: document.getElementById("quizSection") },
            { id: "glossary", el: document.getElementById("glossarySection") },
            { id: "timeline", el: document.getElementById("timelineSection") }
        ];

        function updateActive() {
            const scrollY = window.scrollY + 160;
            let current = "articles";
            for (const s of sectionMap) {
                if (s.el && s.el.offsetTop <= scrollY) current = s.id;
            }
            links.forEach(l => l.classList.toggle("active", l.dataset.section === current));
            // Shadow on nav when scrolled
            nav.classList.toggle("scrolled", window.scrollY > 10);
        }

        window.addEventListener("scroll", updateActive, { passive: true });
        updateActive();
    }

    // ══════════════════════════════════════════════════════════════
    //   LANGUAGE SELECTOR — Google Translate integration
    // ══════════════════════════════════════════════════════════════
    const langNames = {
        en: "Translate", hi: "🇮🇳 Hindi", es: "🇪🇸 Español", fr: "🇫🇷 Français", de: "🇩🇪 Deutsch",
        "zh-CN": "🇨🇳 中文", ja: "🇯🇵 日本語", ko: "🇰🇷 한국어", pt: "🇧🇷 Português", ar: "🇸🇦 العربية",
        ru: "🇷🇺 Русский", it: "🇮🇹 Italiano", nl: "🇳🇱 Nederlands", sv: "🇸🇪 Svenska", pl: "🇵🇱 Polski",
        tr: "🇹🇷 Türkçe", vi: "🇻🇳 Việt", th: "🇹🇭 ไทย", id: "🇮🇩 Bahasa", bn: "🇧🇩 বাংলা"
    };

    function initLangSelector() {
        const selector = document.getElementById("langSelector");
        const toggle = document.getElementById("langToggle");
        const dropdown = document.getElementById("langDropdown");
        const label = document.getElementById("langLabel");
        if (!selector || !toggle || !dropdown) return;

        // Position dropdown below the toggle button using fixed positioning
        function positionDropdown() {
            const rect = toggle.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 6) + "px";
            dropdown.style.left = Math.max(8, rect.left) + "px";
        }

        // Toggle dropdown
        toggle.addEventListener("click", (e) => {
            e.stopPropagation();
            positionDropdown();
            selector.classList.toggle("open");
        });

        // Reposition on scroll/resize
        window.addEventListener("scroll", () => { if (selector.classList.contains("open")) positionDropdown(); }, { passive: true });
        window.addEventListener("resize", () => { if (selector.classList.contains("open")) positionDropdown(); }, { passive: true });

        // Close on outside click
        document.addEventListener("click", (e) => {
            if (!selector.contains(e.target)) selector.classList.remove("open");
        });

        // Language option click
        dropdown.querySelectorAll(".lang-option").forEach(btn => {
            btn.addEventListener("click", () => {
                const lang = btn.dataset.lang;
                selector.classList.remove("open");

                // Update active state
                dropdown.querySelectorAll(".lang-option").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                label.textContent = langNames[lang] || lang.toUpperCase();

                // Trigger Google Translate
                if (lang === "en") {
                    // Restore original
                    const frame = document.querySelector(".goog-te-banner-frame");
                    if (frame) {
                        const innerDoc = frame.contentDocument || frame.contentWindow.document;
                        const restoreBtn = innerDoc.querySelector("button#\\:1\\.restore, button.goog-close-link");
                        if (restoreBtn) restoreBtn.click();
                    }
                    // Fallback: reset cookie
                    document.cookie = "googtrans=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC";
                    document.cookie = "googtrans=; path=/; domain=." + location.hostname + "; expires=Thu, 01 Jan 1970 00:00:00 UTC";
                    location.reload();
                } else {
                    // Set Google Translate cookie & reload
                    document.cookie = "googtrans=/en/" + lang + "; path=/";
                    document.cookie = "googtrans=/en/" + lang + "; path=/; domain=." + location.hostname;
                    location.reload();
                }
            });
        });

        // Restore active state from cookie on load
        const match = document.cookie.match(/googtrans=\/en\/([^;]+)/);
        if (match && match[1]) {
            const savedLang = match[1];
            label.textContent = langNames[savedLang] || savedLang.toUpperCase();
            dropdown.querySelectorAll(".lang-option").forEach(b => {
                b.classList.toggle("active", b.dataset.lang === savedLang);
            });
        }
    }

    // ── Mobile Language Selector (mirrors desktop logic) ────────────
    function initMobileLangSelector() {
        const selector = document.getElementById("langSelectorMobile");
        const toggle = document.getElementById("langToggleMobile");
        const dropdown = document.getElementById("langDropdownMobile");
        if (!selector || !toggle || !dropdown) return;

        function positionDropdown() {
            const rect = toggle.getBoundingClientRect();
            const dropW = 190;
            dropdown.style.top = (rect.bottom + 6) + "px";
            // Right-align: place left edge so the dropdown ends near the right side of the button
            const leftPos = Math.max(8, rect.right - dropW);
            dropdown.style.left = leftPos + "px";
            dropdown.style.right = "auto";
        }

        toggle.addEventListener("click", (e) => {
            e.stopPropagation();
            positionDropdown();
            selector.classList.toggle("open");
        });

        document.addEventListener("click", (e) => {
            if (!selector.contains(e.target)) selector.classList.remove("open");
        });

        dropdown.querySelectorAll(".lang-option").forEach(btn => {
            btn.addEventListener("click", () => {
                const lang = btn.dataset.lang;
                selector.classList.remove("open");
                if (lang === "en") {
                    document.cookie = "googtrans=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC";
                    document.cookie = "googtrans=; path=/; domain=." + location.hostname + "; expires=Thu, 01 Jan 1970 00:00:00 UTC";
                } else {
                    document.cookie = "googtrans=/en/" + lang + "; path=/";
                    document.cookie = "googtrans=/en/" + lang + "; path=/; domain=." + location.hostname;
                }
                location.reload();
            });
        });

        // Restore active state from cookie
        const match = document.cookie.match(/googtrans=\/en\/([^;]+)/);
        if (match && match[1]) {
            dropdown.querySelectorAll(".lang-option").forEach(b => {
                b.classList.toggle("active", b.dataset.lang === match[1]);
            });
        }
    }

    // ══════════════════════════════════════════════════════════════
    //   BACK TO TOP BUTTON
    // ══════════════════════════════════════════════════════════════
    function initBackToTop() {
        const btn = document.getElementById("backToTopBtn");
        if (!btn) return;
        btn.addEventListener("click", () => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
        window.addEventListener("scroll", () => {
            btn.classList.toggle("visible", window.scrollY > 400);
        }, { passive: true });
    }

    // ══════════════════════════════════════════════════════════════
    //   RANDOM ARTICLE
    // ══════════════════════════════════════════════════════════════
    function initRandomArticle() {
        const btn = document.getElementById("randomArticleBtn");
        if (!btn) return;
        btn.addEventListener("click", () => {
            if (allArticles.length === 0) return;
            const rand = allArticles[Math.floor(Math.random() * allArticles.length)];
            currentSearch = rand.title.split(" ").slice(0, 4).join(" ");
            $searchInput.value = currentSearch;
            currentCategory = "";
            currentPage = 1;
            $catList.querySelectorAll(".cat-btn").forEach(b => b.classList.toggle("active", b.dataset.category === ""));
            $title.textContent = "🎲 Random Pick";
            applyFilters();
            document.getElementById("articlesGrid").scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    // ══════════════════════════════════════════════════════════════
    //   KEYBOARD SHORTCUTS
    // ══════════════════════════════════════════════════════════════
    function initKeyboardShortcuts() {
        const modal = document.getElementById("shortcutsModal");
        if (!modal) return;
        const closeBtn = modal.querySelector(".modal-close");
        if (closeBtn) closeBtn.addEventListener("click", () => modal.classList.remove("open"));
        modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });

        document.addEventListener("keydown", (e) => {
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
            switch (e.key) {
                case "?":
                    e.preventDefault();
                    modal.classList.toggle("open");
                    break;
                case "t":
                    $themeToggle.click();
                    break;
                case "s":
                    e.preventDefault();
                    $searchInput.focus();
                    break;
                case "g":
                    document.getElementById("gamesArcadeSection")?.scrollIntoView({ behavior: "smooth" });
                    break;
                case "q":
                    document.getElementById("quizSection")?.scrollIntoView({ behavior: "smooth" });
                    break;
                case "h":
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    break;
                case "r":
                    document.getElementById("randomArticleBtn")?.click();
                    break;
                case "Escape":
                    modal.classList.remove("open");
                    document.getElementById("quoteCardModal")?.classList.remove("open");
                    break;
            }
        });
    }

    // ══════════════════════════════════════════════════════════════
    //   AI GLOSSARY
    // ══════════════════════════════════════════════════════════════
    const glossaryTerms = [
        { term: "AGI", def: "Artificial General Intelligence — a hypothetical AI system with human-level reasoning across all domains.", category: "Core" },
        { term: "Algorithm", def: "A step-by-step procedure for solving a problem or performing a computation.", category: "Core" },
        { term: "Attention Mechanism", def: "A technique that allows models to focus on relevant parts of the input when generating output.", category: "Architecture" },
        { term: "Backpropagation", def: "The algorithm used to train neural networks by computing gradients and updating weights.", category: "Training" },
        { term: "BERT", def: "Bidirectional Encoder Representations from Transformers — Google's pre-trained language model.", category: "Models" },
        { term: "Bias", def: "Systematic errors in AI predictions, often reflecting societal prejudices in training data.", category: "Ethics" },
        { term: "ChatGPT", def: "OpenAI's conversational AI assistant built on the GPT architecture with RLHF fine-tuning.", category: "Models" },
        { term: "CNN", def: "Convolutional Neural Network — specialized for processing grid-like data such as images.", category: "Architecture" },
        { term: "Computer Vision", def: "AI field focused on enabling machines to interpret and understand visual information.", category: "Core" },
        { term: "Diffusion Model", def: "Generative model that creates data by gradually denoising random noise (used in DALL-E, Stable Diffusion).", category: "Architecture" },
        { term: "Embedding", def: "A dense numerical representation of data (text, images) in a continuous vector space.", category: "Core" },
        { term: "Epoch", def: "One complete pass through the entire training dataset during model training.", category: "Training" },
        { term: "Few-Shot Learning", def: "Teaching a model to perform tasks with only a few examples, often via prompt engineering.", category: "Training" },
        { term: "Fine-Tuning", def: "Adapting a pre-trained model to a specific task using a smaller, targeted dataset.", category: "Training" },
        { term: "GAN", def: "Generative Adversarial Network — two networks (generator & discriminator) competing to create realistic data.", category: "Architecture" },
        { term: "GPT", def: "Generative Pre-trained Transformer — OpenAI's family of large language models.", category: "Models" },
        { term: "Gradient Descent", def: "Optimization algorithm that iteratively adjusts parameters to minimize the loss function.", category: "Training" },
        { term: "Hallucination", def: "When an AI model generates confident but factually incorrect or fabricated information.", category: "Core" },
        { term: "Inference", def: "The process of running a trained model to make predictions on new data.", category: "Core" },
        { term: "LLM", def: "Large Language Model — neural networks with billions of parameters trained on massive text corpora.", category: "Core" },
        { term: "LSTM", def: "Long Short-Term Memory — a recurrent network architecture designed to learn long-range dependencies.", category: "Architecture" },
        { term: "Machine Learning", def: "Subset of AI where systems learn patterns from data without being explicitly programmed.", category: "Core" },
        { term: "Neural Network", def: "Computing system inspired by biological brains, composed of interconnected layers of nodes.", category: "Core" },
        { term: "NLP", def: "Natural Language Processing — AI's ability to understand, interpret, and generate human language.", category: "Core" },
        { term: "Overfitting", def: "When a model memorizes training data too well and fails to generalize to new, unseen data.", category: "Training" },
        { term: "Parameter", def: "A learnable variable in a neural network — modern LLMs have billions of parameters.", category: "Core" },
        { term: "Prompt Engineering", def: "The art of crafting input prompts to elicit desired outputs from AI language models.", category: "Core" },
        { term: "RAG", def: "Retrieval-Augmented Generation — combining LLMs with external knowledge retrieval for more accurate answers.", category: "Architecture" },
        { term: "Reinforcement Learning", def: "Training approach where agents learn by receiving rewards or penalties for actions in an environment.", category: "Training" },
        { term: "RLHF", def: "Reinforcement Learning from Human Feedback — used to align LLMs with human preferences.", category: "Training" },
        { term: "Tokenization", def: "Breaking text into smaller units (tokens) that language models can process.", category: "Core" },
        { term: "Transfer Learning", def: "Reusing a model trained on one task as a starting point for a different but related task.", category: "Training" },
        { term: "Transformer", def: "The dominant neural network architecture using self-attention, powering GPT, BERT, and most modern AI.", category: "Architecture" }
    ];

    function initGlossary() {
        const grid = document.getElementById("glossaryGrid");
        const search = document.getElementById("glossarySearch");
        const lettersDiv = document.getElementById("glossaryLetters");
        if (!grid || !search) return;

        const letters = [...new Set(glossaryTerms.map(t => t.term[0].toUpperCase()))].sort();
        if (lettersDiv) {
            lettersDiv.innerHTML = letters.map(l => `<button class="glossary-letter" data-letter="${l}">${l}</button>`).join("");
            lettersDiv.querySelectorAll(".glossary-letter").forEach(btn => {
                btn.addEventListener("click", () => {
                    search.value = "";
                    renderGlossary(btn.dataset.letter);
                });
            });
        }
        renderGlossary();
        search.addEventListener("input", () => {
            renderGlossary("", search.value.trim().toLowerCase());
        });
    }

    function renderGlossary(filterLetter = "", filterText = "") {
        const grid = document.getElementById("glossaryGrid");
        let terms = glossaryTerms;
        if (filterLetter) terms = terms.filter(t => t.term[0].toUpperCase() === filterLetter);
        if (filterText) terms = terms.filter(t => t.term.toLowerCase().includes(filterText) || t.def.toLowerCase().includes(filterText));
        grid.innerHTML = terms.length ? terms.map(t => `
            <div class="glossary-card">
                <div class="glossary-card-term">${escapeHTML(t.term)}</div>
                <span class="glossary-card-cat">${escapeHTML(t.category)}</span>
                <p class="glossary-card-def">${escapeHTML(t.def)}</p>
            </div>
        `).join("") : '<p style="text-align:center;color:var(--text-muted);grid-column:1/-1;padding:40px 0;">No matching terms found.</p>';
    }

    // ══════════════════════════════════════════════════════════════
    //   AI TOOL OF THE DAY
    // ══════════════════════════════════════════════════════════════
    const aiTools = [
        { name: "ChatGPT", maker: "OpenAI", category: "Chatbot", desc: "The AI chatbot that started the revolution. Chat, create, learn, and build with the world's most popular language model.", icon: "💬", url: "https://chat.openai.com" },
        { name: "Claude", maker: "Anthropic", category: "Chatbot", desc: "A thoughtful AI assistant focused on safety, helpfulness, and nuanced conversations. Great for writing and analysis.", icon: "🧠", url: "https://claude.ai" },
        { name: "Midjourney", maker: "Midjourney", category: "Image Gen", desc: "Create stunning AI-generated artwork and images from text descriptions. The go-to for creative professionals.", icon: "🎨", url: "https://midjourney.com" },
        { name: "GitHub Copilot", maker: "GitHub / Microsoft", category: "Coding", desc: "Your AI pair programmer. Autocompletes code, writes functions, and helps you code faster across all languages.", icon: "👨‍💻", url: "https://github.com/features/copilot" },
        { name: "Perplexity", maker: "Perplexity AI", category: "Search", desc: "AI-powered search engine that gives direct answers with cited sources. The future of how we find information.", icon: "🔍", url: "https://perplexity.ai" },
        { name: "Runway", maker: "Runway", category: "Video", desc: "Generate and edit videos with AI. From text-to-video to motion brush — Hollywood-grade tools for everyone.", icon: "🎬", url: "https://runwayml.com" },
        { name: "ElevenLabs", maker: "ElevenLabs", category: "Audio", desc: "Ultra-realistic AI voice generation and cloning. Create voiceovers, audiobooks, and podcasts in seconds.", icon: "🎙️", url: "https://elevenlabs.io" },
        { name: "Notion AI", maker: "Notion", category: "Productivity", desc: "AI writing assistant built into Notion. Summarize, brainstorm, draft, and improve your notes and docs.", icon: "📝", url: "https://notion.so" },
        { name: "Hugging Face", maker: "Hugging Face", category: "Platform", desc: "The GitHub of AI models. Host, share, and deploy 500K+ open-source models and datasets for free.", icon: "🤗", url: "https://huggingface.co" },
        { name: "Cursor", maker: "Cursor", category: "Coding", desc: "The AI-first code editor built on VS Code. Chat with your codebase, generate code, and refactor intelligently.", icon: "⌨️", url: "https://cursor.sh" },
        { name: "Stable Diffusion", maker: "Stability AI", category: "Image Gen", desc: "Open-source image generation model you can run locally. Full creative control without cloud dependencies.", icon: "🖼️", url: "https://stability.ai" },
        { name: "Suno AI", maker: "Suno", category: "Music", desc: "Create full songs with vocals, instruments, and lyrics from text prompts. AI music creation made easy.", icon: "🎵", url: "https://suno.ai" },
        { name: "Ollama", maker: "Ollama", category: "Local AI", desc: "Run large language models locally on your machine. Privacy-first AI with no cloud needed.", icon: "🦙", url: "https://ollama.ai" },
        { name: "v0 by Vercel", maker: "Vercel", category: "Coding", desc: "Generate UI components and full web apps from text descriptions. AI-powered frontend development.", icon: "🖥️", url: "https://v0.dev" },
        { name: "Gemini", maker: "Google", category: "Chatbot", desc: "Google's most capable AI model. Multimodal understanding across text, images, audio, video, and code.", icon: "✨", url: "https://gemini.google.com" }
    ];

    function initToolOfDay() {
        const container = document.getElementById("toolOfDayCard");
        if (!container) return;
        const now = new Date();
        const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
        const tool = aiTools[dayOfYear % aiTools.length];
        container.innerHTML = `
            <div class="tod-card">
                <div class="tod-icon">${tool.icon}</div>
                <div class="tod-body">
                    <div class="tod-header">
                        <h3 class="tod-name">${escapeHTML(tool.name)}</h3>
                        <span class="tod-cat">${escapeHTML(tool.category)}</span>
                    </div>
                    <p class="tod-maker">by ${escapeHTML(tool.maker)}</p>
                    <p class="tod-desc">${escapeHTML(tool.desc)}</p>
                    <a href="${escapeAttr(tool.url)}" target="_blank" rel="noopener noreferrer" class="tod-link">Try it →</a>
                </div>
            </div>
            <p class="tod-refresh-hint">🔄 New tool every day — come back tomorrow!</p>
        `;
    }

    // ══════════════════════════════════════════════════════════════
    //   AI EVENTS TIMELINE
    // ══════════════════════════════════════════════════════════════
    const timelineEvents = [
        { year: "1950", title: "Turing Test Proposed", desc: "Alan Turing publishes 'Computing Machinery and Intelligence', proposing a test for machine intelligence.", icon: "🧪" },
        { year: "1956", title: "AI Is Born", desc: "The term 'Artificial Intelligence' is coined at the Dartmouth Conference, marking the birth of the field.", icon: "🎓" },
        { year: "1997", title: "Deep Blue Beats Kasparov", desc: "IBM's Deep Blue defeats world chess champion Garry Kasparov, a landmark moment for AI.", icon: "♟️" },
        { year: "2011", title: "Watson Wins Jeopardy!", desc: "IBM Watson defeats human champions on Jeopardy!, showcasing NLP capabilities.", icon: "📺" },
        { year: "2012", title: "AlexNet Revolution", desc: "AlexNet wins ImageNet, igniting the deep learning revolution in computer vision.", icon: "👁️" },
        { year: "2014", title: "GANs Invented", desc: "Ian Goodfellow introduces Generative Adversarial Networks, enabling realistic data generation.", icon: "🎭" },
        { year: "2016", title: "AlphaGo Defeats Lee Sedol", desc: "DeepMind's AlphaGo beats Go world champion, a feat thought decades away.", icon: "⚫" },
        { year: "2017", title: "Attention Is All You Need", desc: "Google publishes the Transformer paper, the architecture that powers all modern LLMs.", icon: "⚡" },
        { year: "2018", title: "BERT Released", desc: "Google releases BERT, revolutionizing NLP with bidirectional pre-training.", icon: "📚" },
        { year: "2020", title: "GPT-3 Launches", desc: "OpenAI releases GPT-3 with 175B parameters, showing remarkable language generation abilities.", icon: "🚀" },
        { year: "2022", title: "ChatGPT Takes the World", desc: "ChatGPT launches and reaches 100M users in 2 months. DALL-E 2 and Stable Diffusion also debut.", icon: "💬" },
        { year: "2023", title: "GPT-4 & AI Goes Mainstream", desc: "GPT-4 launches with multimodal capabilities. AI assistants become part of everyday life.", icon: "🌟" },
        { year: "2024", title: "Video AI & Open Source Boom", desc: "Sora, Gemini 1.5, Claude 3, and Llama 3 push boundaries. AI agents become reality.", icon: "🎬" },
        { year: "2025", title: "Agentic AI Era", desc: "AI agents that can plan, reason, and execute complex multi-step tasks autonomously go mainstream.", icon: "🤖" }
    ];

    function initTimeline() {
        const container = document.getElementById("timelineContainer");
        if (!container) return;
        container.innerHTML = timelineEvents.map((e, i) => `
            <div class="timeline-item">
                <div class="timeline-dot">${e.icon}</div>
                <div class="timeline-content">
                    <span class="timeline-year">${escapeHTML(e.year)}</span>
                    <h3 class="timeline-title">${escapeHTML(e.title)}</h3>
                    <p class="timeline-desc">${escapeHTML(e.desc)}</p>
                </div>
            </div>
        `).join("");
    }

    // ══════════════════════════════════════════════════════════════
    //   WEEKLY AI SUMMARY (computed from loaded article data)
    // ══════════════════════════════════════════════════════════════
    function initWeeklySummary() {
        const grid = document.getElementById("weeklySummaryGrid");
        if (!grid || allArticles.length === 0) return;

        const now = new Date();
        const weekAgo = new Date(now - 7 * 86400000);
        const weekArticles = allArticles.filter(a => new Date(a.published_at) >= weekAgo);
        const pool = weekArticles.length ? weekArticles : allArticles;
        const total = pool.length;

        const catCounts = {};
        pool.forEach(a => { catCounts[a.category] = (catCounts[a.category] || 0) + 1; });
        const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

        const companyCounts = {};
        pool.forEach(a => { if (a.company_name) companyCounts[a.company_name] = (companyCounts[a.company_name] || 0) + 1; });
        const topCompanies = Object.entries(companyCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

        grid.innerHTML = `
            <div class="ws-card ws-highlight">
                <div class="ws-card-icon">📊</div>
                <div class="ws-card-value">${total}</div>
                <div class="ws-card-label">Articles This Period</div>
            </div>
            <div class="ws-card ws-highlight">
                <div class="ws-card-icon">📂</div>
                <div class="ws-card-value">${Object.keys(catCounts).length}</div>
                <div class="ws-card-label">Categories Covered</div>
            </div>
            <div class="ws-card ws-highlight">
                <div class="ws-card-icon">🏢</div>
                <div class="ws-card-value">${Object.keys(companyCounts).length}</div>
                <div class="ws-card-label">Companies Featured</div>
            </div>
            <div class="ws-card ws-wide">
                <h4 class="ws-card-title">🔥 Top Categories</h4>
                <div class="ws-bar-chart">${topCats.map(([cat, cnt]) => `
                    <div class="ws-bar-row">
                        <span class="ws-bar-label">${escapeHTML(cat)}</span>
                        <div class="ws-bar-track"><div class="ws-bar-fill" style="width:${Math.round((cnt / total) * 100)}%"></div></div>
                        <span class="ws-bar-count">${cnt}</span>
                    </div>
                `).join("")}</div>
            </div>
            <div class="ws-card ws-wide">
                <h4 class="ws-card-title">🏢 Top Companies</h4>
                <div class="ws-bar-chart">${topCompanies.map(([comp, cnt]) => `
                    <div class="ws-bar-row">
                        <span class="ws-bar-label">${escapeHTML(comp)}</span>
                        <div class="ws-bar-track"><div class="ws-bar-fill" style="width:${Math.round((cnt / total) * 100)}%"></div></div>
                        <span class="ws-bar-count">${cnt}</span>
                    </div>
                `).join("")}</div>
            </div>
        `;
    }

    // ══════════════════════════════════════════════════════════════
    //   READER FAVORITES LEADERBOARD
    // ══════════════════════════════════════════════════════════════
    function initLeaderboard() {
        const list = document.getElementById("leaderboardList");
        if (!list || allArticles.length === 0) return;

        const claps = JSON.parse(localStorage.getItem("aiunlocked-claps") || "{}");
        const ranked = allArticles
            .map(a => ({ ...a, claps: claps[a.guid || a.title] || 0 }))
            .filter(a => a.claps > 0)
            .sort((a, b) => b.claps - a.claps)
            .slice(0, 10);

        if (ranked.length === 0) {
            list.innerHTML = '<p class="leaderboard-empty">👏 No claps yet! Like your favorite articles above and they\'ll appear here.</p>';
            return;
        }

        list.innerHTML = ranked.map((a, i) => `
            <div class="lb-row">
                <span class="lb-rank">${i < 3 ? ["🥇","🥈","🥉"][i] : "#" + (i + 1)}</span>
                <div class="lb-info">
                    <span class="lb-title">${escapeHTML(a.title)}</span>
                    <span class="lb-meta">${escapeHTML(a.company_name || "AI Unlocked")} · ${escapeHTML(a.category)}</span>
                </div>
                <span class="lb-claps">👏 ${a.claps}</span>
            </div>
        `).join("");
    }

    // ══════════════════════════════════════════════════════════════
    //   SHAREABLE QUOTE CARDS (Canvas-based image generator)
    // ══════════════════════════════════════════════════════════════
    function showQuoteCardModal(title, summary) {
        const modal = document.getElementById("quoteCardModal");
        if (!modal) return;
        modal.classList.add("open");

        const canvas = document.getElementById("quoteCanvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 1080;
        canvas.height = 1080;

        // Background gradient
        const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
        grad.addColorStop(0, "#1e1b4b");
        grad.addColorStop(0.5, "#312e81");
        grad.addColorStop(1, "#3730a3");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1080, 1080);

        // Decorative circles
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(100, 100, 200, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(980, 980, 300, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;

        // Quote mark
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.font = "bold 200px serif";
        ctx.fillText("\u201C", 60, 220);

        // Title text
        ctx.fillStyle = "#fff";
        ctx.font = "bold 42px Inter, sans-serif";
        wrapText(ctx, title || "", 80, 320, 920, 52);

        // Summary text
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "400 28px Inter, sans-serif";
        const truncated = (summary || "").length > 200 ? (summary || "").slice(0, 200) + "…" : (summary || "");
        wrapText(ctx, truncated, 80, 580, 920, 38);

        // Branding bar
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(0, 980, 1080, 100);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 28px Inter, sans-serif";
        ctx.fillText("AI Unlocked — aiunlocked.info", 80, 1040);

        // Download / Share button (use Web Share API on mobile if available)
        const dlBtn = document.getElementById("quoteDownloadBtn");
        if (dlBtn) {
            dlBtn.onclick = async () => {
                try {
                    // Try Web Share API for mobile (works on iOS/Android)
                    if (navigator.share && navigator.canShare) {
                        canvas.toBlob(async (blob) => {
                            const file = new File([blob], "ai-unlocked-quote.png", { type: "image/png" });
                            if (navigator.canShare({ files: [file] })) {
                                await navigator.share({ files: [file], title: "AI Unlocked Quote" });
                                return;
                            }
                            // Fallback to download
                            downloadCanvas();
                        }, "image/png");
                        return;
                    }
                } catch (e) { /* ignore share errors, fall through to download */ }
                downloadCanvas();
            };
            function downloadCanvas() {
                const link = document.createElement("a");
                link.download = "ai-unlocked-quote.png";
                link.href = canvas.toDataURL("image/png");
                link.click();
            }
        }

        // Close modal
        const closeBtn = modal.querySelector(".modal-close");
        if (closeBtn) closeBtn.onclick = () => modal.classList.remove("open");
        modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });
    }

    function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = text.split(" ");
        let line = "";
        for (let i = 0; i < words.length; i++) {
            const test = line + words[i] + " ";
            if (ctx.measureText(test).width > maxWidth && i > 0) {
                ctx.fillText(line, x, y);
                line = words[i] + " ";
                y += lineHeight;
            } else {
                line = test;
            }
        }
        ctx.fillText(line, x, y);
    }

    // ── Bootstrap ───────────────────────────────────────────────────
    initTheme();
    init();
    initQuiz();
    initFunFacts();
    bindFunFactsShuffle();
    initFloatingQuizBtn();
    initSuccessStories();
    initGamesArcade();
    initSectionNav();
    initLangSelector();
    initMobileLangSelector();
    initBackToTop();
    initRandomArticle();
    initKeyboardShortcuts();
    initGlossary();
    initToolOfDay();
    initTimeline();

})();

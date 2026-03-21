/* ═══════════════════════════════════════════════════════════════
   AI Unlocked — Static Site Frontend
   Reads pre-built JSON from data/ — no server needed.
   ═══════════════════════════════════════════════════════════════ */

(() => {
    "use strict";

    const PER_PAGE = 30;

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
    }

    // ── Render a single card ────────────────────────────────────
    function articleCard(a) {
        const colour = categoryColours[a.category] || "#6366f1";
        const dateStr = formatDate(a.published_at);

        // Company logo or AI Unlocked default
        const logoSrc = a.company_logo || "assets/favicon.svg";
        const companyName = a.company_name || "AI Unlocked";

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
                if (e.target.closest(".share-btn, .listen-btn")) return;
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

    // ── Bootstrap ───────────────────────────────────────────────
    initTheme();
    init();

})();

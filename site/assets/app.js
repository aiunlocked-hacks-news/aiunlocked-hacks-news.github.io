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

            // First render
            applyFilters();
        } catch (e) {
            console.error("Init failed", e);
            $grid.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><h3>Failed to load data</h3><p>${escapeHTML(e.message)}</p></div>`;
        }
    }

    // ── Category sidebar ────────────────────────────────────────
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
                <div class="card-footer">
                    <span class="card-expand-hint">Click to read more</span>
                </div>
            </div>
        </article>`;
    }

    // ── Card expand / collapse ──────────────────────────────────
    function bindCardEvents() {
        $grid.querySelectorAll(".article-card").forEach((card) => {
            card.addEventListener("click", () => {
                const isExpanded = card.classList.contains("expanded");
                // Close all others
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

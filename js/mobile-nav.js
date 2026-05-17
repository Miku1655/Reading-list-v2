// js/mobile-nav.js
// Mobile navigation: hamburger drawer, cover column visibility, card centering
// Loads with `defer` so DOM is ready when it runs.

(function () {
    'use strict';

    // ── 1. Only activate on narrow screens ──────────────────────────────────
    const MOBILE_BREAKPOINT = 768;

    function isMobile() {
        return window.innerWidth <= MOBILE_BREAKPOINT;
    }

    // ── 2. Inject top bar + hamburger ────────────────────────────────────────
    function buildTopBar() {
        if (document.querySelector('.mobile-topbar')) return; // already exists

        const topbar = document.createElement('div');
        topbar.className = 'mobile-topbar';

        const title = document.createElement('span');
        title.className = 'mobile-topbar-title';
        title.textContent = 'Reading List';

        const hamburger = document.createElement('button');
        hamburger.className = 'mobile-hamburger';
        hamburger.setAttribute('aria-label', 'Open menu');
        hamburger.innerHTML = '☰ Menu';

        topbar.appendChild(title);
        topbar.appendChild(hamburger);

        // Insert before the first child of body
        document.body.insertBefore(topbar, document.body.firstChild);

        hamburger.addEventListener('click', openMenu);

        // Close button inside the drawer (injected into .tabs)
        const closeBtn = document.createElement('button');
        closeBtn.className = 'mobile-menu-close';
        closeBtn.setAttribute('aria-label', 'Close menu');
        closeBtn.textContent = '✕ Close';
        closeBtn.addEventListener('click', closeMenu);

        const tabs = document.querySelector('.tabs');
        if (tabs) tabs.appendChild(closeBtn);

        // Backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'mobile-menu-backdrop';
        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', closeMenu);
    }

    function openMenu() {
        document.body.classList.add('mobile-menu-open');
        document.querySelector('.tabs')?.setAttribute('aria-expanded', 'true');
    }

    function closeMenu() {
        document.body.classList.remove('mobile-menu-open');
        document.querySelector('.tabs')?.setAttribute('aria-expanded', 'false');
    }

    // Close the drawer whenever a tab is chosen
    function attachTabCloseListeners() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                if (isMobile()) closeMenu();
            });
        });
    }

    // ── 3. Cover column in the list table ───────────────────────────────────
    // On mobile, CSS hides column 4 (Cover). We re-show a small inline cover
    // inside the Title cell instead so book art stays visible.

    function injectCoverIntoTitleCell(tr, book) {
        const titleCell = tr.querySelector('td:first-child');
        if (!titleCell || titleCell.dataset.coverInjected) return;

        // Find the cover URL from the hidden 4th cell
        const coverCell = tr.querySelector('td:nth-child(4)');
        const img = coverCell && coverCell.querySelector('img');
        if (!img || !img.src || img.src === window.location.href) return;

        const thumb = document.createElement('img');
        thumb.src = img.src;
        thumb.className = 'mobile-cover-thumb';
        thumb.alt = '';
        thumb.onerror = () => thumb.remove();

        // Wrap title cell content in a flex row
        const wrapper = document.createElement('span');
        wrapper.className = 'mobile-title-wrapper';
        // Move existing children into wrapper
        while (titleCell.firstChild) wrapper.appendChild(titleCell.firstChild);

        titleCell.appendChild(thumb);
        titleCell.appendChild(wrapper);
        titleCell.dataset.coverInjected = '1';
    }

    function enhanceTableWithCovers() {
        if (!isMobile()) return;
        document.querySelectorAll('#tableBody tr').forEach(tr => {
            injectCoverIntoTitleCell(tr, null);
        });
    }

    // Observe table body mutations so covers are added on every render
    function observeTableBody() {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;

        const observer = new MutationObserver(() => {
            if (isMobile()) enhanceTableWithCovers();
        });
        observer.observe(tbody, { childList: true });
    }

    // ── 4. Card container centering in profile ───────────────────────────────
    // When cards don't fill the whole row (mobile), center them.
    function applyCardCentering() {
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 768px) {
                /* Profile card containers: center when not full-width */
                #recentBooksContainer,
                #favouritesContainer,
                .card-container {
                    justify-content: center !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // ── 5. Mobile cover thumb styles (injected once) ─────────────────────────
    function injectCoverThumbStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 768px) {
                /* Inline cover thumb next to title */
                td:first-child {
                    display: flex !important;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 4px !important;
                }

                .mobile-cover-thumb {
                    width: 36px;
                    height: 52px;
                    object-fit: cover;
                    border-radius: 3px;
                    flex-shrink: 0;
                    border: 1px solid #333;
                }

                .mobile-title-wrapper {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                }

                /* Keep note icon and emojis inside wrapper */
                .mobile-title-wrapper .noteIcon,
                .mobile-title-wrapper span[title] {
                    display: inline;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // ── 6. Update topbar title to match active tab ───────────────────────────
    function updateTopbarTitle() {
        const activeTab = document.querySelector('.tab.active');
        const titleEl = document.querySelector('.mobile-topbar-title');
        if (!titleEl) return;
        if (activeTab) {
            titleEl.textContent = activeTab.textContent.trim();
        } else {
            titleEl.textContent = 'Reading List';
        }
    }

    function observeTabChanges() {
        // Watch for class changes on .tab elements
        document.querySelectorAll('.tab').forEach(tab => {
            const observer = new MutationObserver(updateTopbarTitle);
            observer.observe(tab, { attributes: true, attributeFilter: ['class'] });
        });
    }

    // ── 7. Initialise ────────────────────────────────────────────────────────
    function init() {
        document.body.classList.add('mobile-nav-ready');

        buildTopBar();
        attachTabCloseListeners();
        injectCoverThumbStyles();
        applyCardCentering();
        observeTableBody();
        observeTabChanges();
        updateTopbarTitle();

        // Run once for any rows already in the DOM
        enhanceTableWithCovers();

        // Re-enhance on resize crossing the breakpoint
        let lastMobile = isMobile();
        window.addEventListener('resize', () => {
            const nowMobile = isMobile();
            if (nowMobile && !lastMobile) enhanceTableWithCovers();
            lastMobile = nowMobile;
        });
    }

    // DOM is ready because the script is deferred
    init();
})();

function createNotePopup() {
    notePopup = document.createElement("div");
    notePopup.style.position = "absolute";
    notePopup.style.background = "#222";
    notePopup.style.color = "#eee";
    notePopup.style.padding = "8px";
    notePopup.style.border = "1px solid #444";
    notePopup.style.borderRadius = "4px";
    notePopup.style.zIndex = "3000";
    notePopup.style.display = "none";
    notePopup.style.maxWidth = "300px";
    notePopup.style.pointerEvents = "none";
    document.body.appendChild(notePopup);
}

function showNotePopup(text) {
    if (!notePopup) createNotePopup();
    notePopup.textContent = text;
    notePopup.style.display = "block";
    document.addEventListener("mousemove", moveNotePopup);
}

function hideNotePopup() {
    if (notePopup) {
        notePopup.style.display = "none";
        document.removeEventListener("mousemove", moveNotePopup);
    }
}

function moveNotePopup(e) {
    if (!notePopup || notePopup.style.display === "none") return;
    notePopup.style.left = (e.clientX + 15) + "px";
    notePopup.style.top = (e.clientY + 20) + "px";
}

// ────────────────────────────────────────────────
// Dynamic tab loading – THIS IS THE FIXED FUNCTION
// ────────────────────────────────────────────────

async function loadTabContent(tabId) {
    const container = document.getElementById('tab-content-container');
    if (!container) {
        console.error("No #tab-content-container found");
        return;
    }

    container.innerHTML = '<p style="text-align:center; padding:40px;">Loading...</p>';

    let url = `partials/tab-${tabId}.html`;
    let targetId = 'tab-content-container';

    if (tabId === 'editModal') {
        url = 'partials/modal-edit-book.html';
        targetId = 'editModalContainer';
    }
    if (tabId === 'yearReview') {
        url = 'partials/modal-year-review.html';
        targetId = 'yearReviewModalContainer';
    }

    const target = document.getElementById(targetId) || container;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load ${url} (HTTP ${response.status})`);
        const html = await response.text();
        target.innerHTML = html;

        // Small delay for DOM to parse the new content
        setTimeout(() => {
            try {
                // Profile tab – call all your real render functions
                if (tabId === 'profile') {
                    renderProfileStats?.();
                    renderRecentBooks?.();
                    renderFavourites?.();
                    renderWaitingWidget?.();
                    renderOnThisDay?.();
                    renderQuoteOfTheDay?.();
                    renderRediscoverWidget?.();
                }

                // List tab
                if (tabId === 'list') {
                    renderTable?.();
                    renderYearGoalProgress?.();
                    populateShelfFilter?.();  // if you have this
                }

                // Other tabs
                if (tabId === 'options') {
                    renderShelfManager?.();
                    updateCoversCount?.();
                }
                if (tabId === 'world-map') renderMap?.();
                if (tabId === 'quotes') renderQuotes?.();
                if (tabId === 'timeline') renderTimeline?.();
                if (tabId === 'stats') renderStats?.();
                if (tabId === 'challenges') {
                    loadGoalsForYear?.();
                    renderChallengesTab?.();
                    // renderChallengesList?.();  // uncomment if exists
                }

                // Show modals after content is ready
                if (tabId === 'editModal' || tabId === 'yearReview') {
                    target.style.display = 'flex';
                }
            } catch (renderErr) {
                console.error(`Render error for ${tabId}:`, renderErr);
                target.innerHTML += `<p style="color:orange; padding:10px;">Render failed: ${renderErr.message}</p>`;
            }
        }, 100);

    } catch (err) {
        console.error("Load error:", err);
        target.innerHTML = `<p style="color:red; padding:40px; text-align:center;">Error loading tab: ${err.message}</p>`;
    }
}

// ────────────────────────────────────────────────
// Tab switching
// ────────────────────────────────────────────────

function switchTab(tabId) {
    // Activate the tab button
    document.querySelectorAll('.tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Load the content
    loadTabContent(tabId);

    // Save current tab
    localStorage.setItem('currentTab', tabId);
}

// ────────────────────────────────────────────────
// Init – only one DOMContentLoaded
// ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    createNotePopup();

    const savedTab = localStorage.getItem('currentTab') || 'list';
    switchTab(savedTab);

    // Optional: call renderAll for shared elements
    renderAll?.();

    // Set default goal year
    const goalYearInput = document.getElementById("goalYear");
    if (goalYearInput) {
        goalYearInput.value = new Date().getFullYear();
        loadGoalsForYear?.();
    }
});

// ────────────────────────────────────────────────
// Your other functions (unchanged)
// ────────────────────────────────────────────────

function renderAll() {
    populateShelfFilter?.();
    updateCoversCount?.();
    renderTable?.();

    const activeTab = document.querySelector(".tab.active")?.dataset.tab;

    if (document.getElementById("tab-profile")?.classList.contains("active") || activeTab === 'profile') {
        renderProfileStats?.();
        renderRecentBooks?.();
        renderFavourites?.();
        renderWaitingWidget?.();
        renderOnThisDay?.();
        renderQuoteOfTheDay?.();
        renderRediscoverWidget?.();
    }

    if (document.getElementById("tab-world-map")?.classList.contains("active") || activeTab === 'world-map') {
        renderMap?.();
    }

    if (document.getElementById("tab-list")?.classList.contains("active") || activeTab === 'list') {
        renderYearGoalProgress?.();
    }

    if (activeTab === "stats") renderStats?.();
    if (activeTab === "timeline") renderTimeline?.();
    if (activeTab === "quotes") renderQuotes?.();
    if (activeTab === "challenges") {
        loadGoalsForYear?.();
        renderChallengesTab?.();
        renderChallengesList?.();
    }
    if (activeTab === "options") renderShelfManager?.();
}
function renderShelfManager() {
    // (exact code from your ui.js — unchanged)
    const container = document.getElementById("shelfManager");
    container.innerHTML = "";
    const set = new Set();
    books.forEach(b => (b.shelves || []).forEach(s => set.add(s)));
    [...set].sort().forEach(shelf => {
        const div = document.createElement("div");
        div.style.marginBottom = "8px";
        div.innerHTML = `
            <input type="text" value="${shelf}" style="width:150px;" class="shelfName">
            <input type="color" value="${shelfColors[shelf] || '#888888'}" class="shelfColor">
            <button class="renameShelf">Rename</button>
            <button class="deleteShelf">Delete</button>
        `;
        container.appendChild(div);
        div.querySelector(".shelfColor").addEventListener("input", e => {
            shelfColors[shelf] = e.target.value;
            localStorage.setItem(SHELF_COLORS_KEY, JSON.stringify(shelfColors));
            renderTable();
        });
        div.querySelector(".renameShelf").addEventListener("click", () => {
            const newName = div.querySelector(".shelfName").value.trim();
            if (!newName || newName === shelf) return;
            if (!confirm(`Rename "${shelf}" → "${newName}" everywhere?`)) return;
            books.forEach(b => {
                if (b.shelves) b.shelves = b.shelves.map(s => s === shelf ? newName : s);
            });
            shelfColors[newName] = shelfColors[shelf] || '#888888';
            delete shelfColors[shelf];
            localStorage.setItem(SHELF_COLORS_KEY, JSON.stringify(shelfColors));
            saveBooksToLocal();
            renderAll();
        });
        div.querySelector(".deleteShelf").addEventListener("click", () => {
            if (!confirm(`Remove shelf "${shelf}" from all books?`)) return;
            books.forEach(b => {
                if (b.shelves) b.shelves = b.shelves.filter(s => s !== shelf);
            });
            delete shelfColors[shelf];
            localStorage.setItem(SHELF_COLORS_KEY, JSON.stringify(shelfColors));
            saveBooksToLocal();
            renderAll();
        });
    });
}
function updateSortIndicators() {
    // (exact code from your ui.js — unchanged)
    document.querySelectorAll(".sort").forEach(s => s.textContent = "");
    document.getElementById("recentSortIndicator").textContent = "";
    if (sortState.column) {
        const el = document.querySelector(`th[data-col="${sortState.column}"] .sort`);
        if (el) el.textContent = sortState.direction > 0 ? "▲" : "▼";
    } else {
        document.getElementById("recentSortIndicator").textContent = sortState.direction === -1 ? "▼" : "▲";
    }
}
function loadGoalsForYear() {
    // (exact code from your ui.js — unchanged)
    const year = Number(document.getElementById("goalYear").value) || new Date().getFullYear();
    document.getElementById("goalYear").value = year;
    const g = goals[year] || {};
    document.getElementById("yearBooksGoal").value = g.books || "";
    document.getElementById("yearPagesGoal").value = g.pages || "";
}
function renderChallengesTab() {
    // (exact full code from your ui.js — unchanged, including pace/projection/goal progress HTML)
    const container = document.getElementById("challengesProgressContainer");
    if (!container) return;
    let html = "";
    const currentYear = getCurrentYear();
    const stats = getYearStats(currentYear);
    const goal = goals[currentYear] || {};
    const daysElapsed = getDaysElapsed(currentYear);
    html += `<div class="stats-block"><h2>${currentYear} Pace & Projection</h2><div class="stats-list">`;
    html += `Finished so far (${daysElapsed} days into the year): <strong>${stats.books} books</strong>, <strong>${stats.pages} pages</strong><br><br>`;
    if (daysElapsed > 0) {
        const booksPace = (stats.books / daysElapsed).toFixed(2);
        const pagesPace = Math.round(stats.pages / daysElapsed);
        html += `Current pace: <strong>${booksPace} books/day</strong>, <strong>${pagesPace} pages/day</strong><br><br>`;
        const projectedBooks = calculateProjection(stats.books, currentYear);
        const projectedPages = calculateProjection(stats.pages, currentYear);
        html += `Projected by Dec 31: <strong>${projectedBooks} books</strong>, <strong>${projectedPages} pages</strong><br><br>`;
    } else {
        html += `Year just started – no pace data yet.<br><br>`;
    }
    if (goal.books || goal.pages) {
        html += `<strong>Goal Progress</strong><br>`;
        if (goal.books) {
            const rawPercent = goal.books > 0 ? (stats.books / goal.books * 100) : 0;
            const percent = Math.min(100, Math.round(rawPercent));
            let text = `${stats.books} / ${goal.books} (${Math.round(rawPercent)}%)`;
            if (stats.books >= goal.books) text += ` ✓ Goal completed (+${stats.books - goal.books} extra)`;
            html += `${text}<br>`;
            html += `<div class="progress-bar-container"><div class="progress-bar-fill books-fill" style="width:${percent}%;"></div></div>`;
        }
        if (goal.pages) {
            const rawPercent = goal.pages > 0 ? (stats.pages / goal.pages * 100) : 0;
            const percent = Math.min(100, Math.round(rawPercent));
            let text = `${stats.pages} / ${goal.pages} (${Math.round(rawPercent)}%)`;
            if (stats.pages >= goal.pages) text += ` ✓ Goal completed (+${stats.pages - goal.pages} extra)`;
            html += `${text}<br>`;
            html += `<div class="progress-bar-container"><div class="progress-bar-fill pages-fill" style="width:${percent}%;"></div></div>`;
        }
    } else {
        html += `<em>No goals set for ${currentYear} yet.</em>`;
    }
    html += `</div></div>`;
    const selectedYear = Number(document.getElementById("goalYear").value) || currentYear;
    if (selectedYear !== currentYear) {
        const sStats = getYearStats(selectedYear);
        const sGoal = goals[selectedYear] || {};
        if (sGoal.books || sGoal.pages) {
            html += `<div class="stats-block" style="margin-top:20px;"><h2>Goal Progress for ${selectedYear}</h2><div class="stats-list">`;
            html += `Finished: ${sStats.books} books, ${sStats.pages} pages<br><br>`;
            if (sGoal.books) {
                const rawPercent = sGoal.books > 0 ? (sStats.books / sGoal.books * 100) : 0;
                const percent = Math.min(100, Math.round(rawPercent));
                let text = `${sStats.books} / ${sGoal.books} (${Math.round(rawPercent)}%)`;
                if (sStats.books >= sGoal.books) text += ` (completed)`;
                html += `${text}<br>`;
                html += `<div class="progress-bar-container"><div class="progress-bar-fill books-fill" style="width:${percent}%;"></div></div>`;
            }
            if (sGoal.pages) {
                const rawPercent = sGoal.pages > 0 ? (sStats.pages / sGoal.pages * 100) : 0;
                const percent = Math.min(100, Math.round(rawPercent));
                let text = `${sStats.pages} / ${sGoal.pages} (${Math.round(rawPercent)}%)`;
                if (sStats.pages >= sGoal.pages) text += ` (completed)`;
                html += `${text}<br>`;
                html += `<div class="progress-bar-container"><div class="progress-bar-fill pages-fill" style="width:${percent}%;"></div></div>`;
            }
            html += `</div></div>`;
        }
    }
    container.innerHTML = html;
}

// Initial load (moved here — will be called from ui-events.js after DOM ready)
function initApp() {
    const savedTab = localStorage.getItem(TAB_KEY) || "list";
    switchTab(savedTab);
    renderAll();
    document.getElementById("goalYear").value = new Date().getFullYear();
    loadGoalsForYear();
}

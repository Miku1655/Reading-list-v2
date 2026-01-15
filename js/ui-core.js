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
function showNotePopup(popup, text) {
    popup.textContent = text;
    popup.style.display = "block";
    document.addEventListener("mousemove", moveNotePopup);
}
function hideNotePopup(popup) {
    popup.style.display = "none";
    document.removeEventListener("mousemove", moveNotePopup);
}
function moveNotePopup(e) {
    if (!notePopup) return;
    notePopup.style.left = (e.clientX + 15) + "px";
    notePopup.style.top = (e.clientY + 20) + "px";
}
function switchTab(name) {
    // Update active classes
    document.querySelectorAll(".tab").forEach(t => {
        t.classList.toggle("active", t.dataset.tab === name);
    });
    
    document.querySelectorAll(".tab-content").forEach(c => {
        c.classList.toggle("active", c.id === `tab-${name}`);
    });

    // Save the current tab
    localStorage.setItem(TAB_KEY, name);

    // Tab-specific renders
    if (name === "options") {
        renderShelfManager();
        updateCoversCount();
    }
    
    if (name === "profile") {
        renderProfileStats();
        renderRecentBooks();
        renderFavourites();
        renderWaitingWidget();
        renderOnThisDay();
        renderQuoteOfTheDay();
        renderRediscoverWidget();
    }
    
    if (name === "list") {
        renderYearGoalProgress();
        renderTable(); // table is main content on list tab
    }
    
    if (name === "quotes") {
        renderQuotes();
    }
    
    if (name === "timeline") {
        renderTimeline();
    }
    
    if (name === "stats") {
        renderStats?.(); // optional chaining if function might not exist yet
    }
    
    if (name === "challenges") {
        loadGoalsForYear();
        renderChallengesTab?.();
    }
}

// Central render function — use this only when you really need to refresh almost everything
// (e.g. after save, import, cloud load, etc.)
function renderAll() {
    // Core shared elements
    populateShelfFilter?.();         // optional, with ?.
    updateCoversCount?.();
    
    // Always render table (it's fast and often needed)
    renderTable();
    
    // Profile section (only if visible)
    if (document.getElementById("tab-profile")?.classList.contains("active")) {
        renderProfileStats();
        renderRecentBooks();
        renderFavourites();
        renderWaitingWidget();
        renderOnThisDay();
        renderQuoteOfTheDay();
        renderRediscoverWidget();
    }
    
    // Goal progress (only if list tab active)
    if (document.getElementById("tab-list")?.classList.contains("active")) {
        renderYearGoalProgress();
    }
    
    // Tab-specific heavy renders
    const activeTab = document.querySelector(".tab.active")?.dataset.tab;
    
    if (activeTab === "stats") renderStats?.();
    if (activeTab === "timeline") renderTimeline?.();
    if (activeTab === "quotes") renderQuotes?.();
    if (activeTab === "challenges") {
    loadGoalsForYear();
    renderChallengesTab();
    renderChallengesList();
}
    
    // Options shelf manager
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

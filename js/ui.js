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
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === "tab-" + name));
    localStorage.setItem(TAB_KEY, name);
    if (name === "options") { renderShelfManager(); updateCoversCount(); }
    if (name === "profile") {
        renderProfileStats();
        renderRecentBooks();
        renderFavourites();
    }
    if (name === "list") renderYearGoalProgress();
    renderTable(); // always refresh list on any tab switch
}

function renderAll() {
    populateShelfFilter();
    renderTable();
    renderProfileStats();
    renderRecentBooks();
    renderFavourites();
    renderYearGoalProgress();
    updateCoversCount();
    if (document.querySelector('.tab.active')?.dataset.tab === "options") renderShelfManager();
}

function renderShelfManager() {
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

// All event listeners
document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
document.getElementById("addBook").addEventListener("click", () => openEditModal());
document.getElementById("searchInput").addEventListener("input", renderTable);
document.getElementById("shelfFilter").addEventListener("change", renderTable);
document.querySelectorAll("th[data-col]").forEach(th => th.addEventListener("click", () => {
    if (sortState.column === th.dataset.col) {
        sortState.direction *= -1;
    } else {
        sortState.column = th.dataset.col;
        sortState.direction = 1;
    }
    updateSortIndicators();
    renderTable();
}));
document.getElementById("sortRecent").addEventListener("click", () => {
    if (sortState.column === null) {
        sortState.direction *= -1;
    } else {
        sortState.column = null;
        sortState.direction = -1;
    }
    updateSortIndicators();
    renderTable();
});
function updateSortIndicators() {
    document.querySelectorAll(".sort").forEach(s => s.textContent = "");
    document.getElementById("recentSortIndicator").textContent = "";
    if (sortState.column) {
        const el = document.querySelector(`th[data-col="${sortState.column}"] .sort`);
        if (el) el.textContent = sortState.direction > 0 ? "▲" : "▼";
    } else {
        document.getElementById("recentSortIndicator").textContent = sortState.direction === -1 ? "▼" : "▲";
    }
}

// Close modal handlers
document.getElementById("closeEdit").addEventListener("click", closeEditModal);
document.getElementById("editModal").addEventListener("click", e => {
    if (e.target === document.getElementById("editModal")) closeEditModal();
});

// Initial load
const savedTab = localStorage.getItem(TAB_KEY) || "list";
switchTab(savedTab);
renderAll();

function renderTimeline() {
    let container = document.getElementById("timelineContainer");
    if (!container) {
        console.warn("Timeline container missing – creating dynamically");
        const section = document.getElementById("tab-timeline");
        if (!section) {
            console.error("Timeline tab section not found!");
            return;
        }
        container = document.createElement("div");
        container.id = "timelineContainer";
        section.appendChild(container);
    }
    container.innerHTML = "";

    // ── Build filter bar ──────────────────────────────────────────────────────
    // Collect all years that have finished reads
    const allEntries = [];
    books.forEach(b => {
        if (b.reads) {
            b.reads.forEach(read => {
                if (read.finished) {
                    const dt = new Date(read.finished);
                    if (!isNaN(dt.getTime())) {
                        allEntries.push({ book: b, date: dt });
                    }
                }
            });
        }
    });

    if (allEntries.length === 0) {
        container.innerHTML = "<p style='text-align:center; color:#aaa; padding:80px; font-size:1.1em;'>No finished reads yet!<br><br>Mark some books as finished to build your reading timeline.</p>";
        return;
    }

    // Unique years, descending
    const allYears = [...new Set(allEntries.map(e => e.date.getFullYear()))].sort((a, b) => b - a);

    // Unique shelves (exclusive + extra)
    const allShelves = new Set();
    books.forEach(b => {
        if (b.exclusiveShelf) allShelves.add(b.exclusiveShelf);
        (b.shelves || []).forEach(s => allShelves.add(s));
    });

    // Filter bar container
    const filterBar = document.createElement("div");
    filterBar.style.cssText = "display:flex; gap:16px; flex-wrap:wrap; align-items:center; margin-bottom:16px; padding:12px; background:#1a1a1a; border:1px solid #333; border-radius:6px;";

    // Year select
    const yearLabel = document.createElement("label");
    yearLabel.textContent = "Year: ";
    const yearSelect = document.createElement("select");
    yearSelect.id = "timelineYearFilter";
    yearSelect.style.cssText = "background:#222; color:#eee; border:1px solid #444; padding:4px 8px; border-radius:4px;";
    yearSelect.innerHTML = `<option value="all">All years</option>` +
        allYears.map(y => `<option value="${y}">${y}</option>`).join("");
    yearLabel.appendChild(yearSelect);
    filterBar.appendChild(yearLabel);

    // Shelf select
    const shelfLabel = document.createElement("label");
    shelfLabel.textContent = "Shelf: ";
    const shelfSelect = document.createElement("select");
    shelfSelect.id = "timelineShelfFilter";
    shelfSelect.style.cssText = "background:#222; color:#eee; border:1px solid #444; padding:4px 8px; border-radius:4px;";
    shelfSelect.innerHTML = `<option value="all">All shelves</option>` +
        [...allShelves].sort().map(s => `<option value="${s}">${s}</option>`).join("");
    shelfLabel.appendChild(shelfSelect);
    filterBar.appendChild(shelfLabel);

    // Stats label (updates with filter)
    const statsSpan = document.createElement("span");
    statsSpan.id = "timelineStats";
    statsSpan.style.cssText = "color:#888; font-size:0.9em; margin-left:auto;";
    filterBar.appendChild(statsSpan);

    container.appendChild(filterBar);

    // List container
    const listContainer = document.createElement("div");
    listContainer.id = "timelineList";
    container.appendChild(listContainer);

    // ── Render function (called on filter change) ─────────────────────────────
    function renderFilteredTimeline() {
        listContainer.innerHTML = "";
        const selectedYear  = yearSelect.value;
        const selectedShelf = shelfSelect.value;

        let entries = allEntries.slice();

        if (selectedYear !== "all") {
            entries = entries.filter(e => e.date.getFullYear() === Number(selectedYear));
        }
        if (selectedShelf !== "all") {
            entries = entries.filter(e => {
                const b = e.book;
                return b.exclusiveShelf === selectedShelf || (b.shelves || []).includes(selectedShelf);
            });
        }

        if (entries.length === 0) {
            listContainer.innerHTML = "<p style='text-align:center; color:#aaa; padding:40px;'>No entries match the current filters.</p>";
            statsSpan.textContent = "0 reads";
            return;
        }

        statsSpan.textContent = `${entries.length} read${entries.length !== 1 ? "s" : ""}`;

        entries.sort((a, b) => b.date - a.date);

        const groups = {};
        const userLocale = navigator.language || 'en-US';
        entries.forEach(entry => {
            const year = entry.date.getFullYear();
            const monthNum = entry.date.getMonth() + 1;
            const monthPadded = String(monthNum).padStart(2, '0');
            const monthName = entry.date.toLocaleString(userLocale, { month: 'long' });
            const key = `${year}-${monthPadded}`;
            if (!groups[key]) groups[key] = { display: `${year} ${monthName}`, entries: [] };
            groups[key].entries.push(entry);
        });

        const sortedKeys = Object.keys(groups).sort().reverse();
        sortedKeys.forEach(key => {
            const g = groups[key];
            const div = document.createElement("div");
            div.innerHTML = `<h4>${g.display} (${g.entries.length} read${g.entries.length > 1 ? 's' : ''})</h4>`;
            const ul = document.createElement("ul");
            g.entries.forEach(entry => {
                const li = document.createElement("li");
                if (showCoversInTimeline && entry.book.coverUrl) {
                    const img = document.createElement("img");
                    img.src = entry.book.coverUrl;
                    img.alt = "Cover";
                    img.style.maxHeight = "80px";
                    img.style.marginRight = "12px";
                    img.style.verticalAlign = "middle";
                    img.onerror = () => img.remove();
                    li.appendChild(img);
                }
                const textDiv = document.createElement("span");
                const readDate = entry.date.toLocaleDateString(userLocale);
                textDiv.innerHTML = `<strong>${entry.book.title}</strong> by ${entry.book.author || "Unknown"} (${entry.book.rating || "unrated"}) — finished ${readDate}`;
                li.appendChild(textDiv);
                ul.appendChild(li);
            });
            div.appendChild(ul);
            listContainer.appendChild(div);
        });
    }

    // Wire filter controls
    yearSelect.addEventListener("change",  renderFilteredTimeline);
    shelfSelect.addEventListener("change", renderFilteredTimeline);

    // Initial render
    renderFilteredTimeline();
}

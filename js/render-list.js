// ── Shared debounce used by search ────────────────────────────────────────────
function _listDebounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function populateShelfFilter() {
    const select       = document.getElementById("shelfFilter");
    const currentValue = select.value;
    select.innerHTML   = '<option value="all">all</option>';
    const set = new Set();
    books.forEach(b => {
        if (b.exclusiveShelf) set.add(b.exclusiveShelf);
        (b.shelves || []).forEach(s => set.add(s));
    });
    [...set].sort().forEach(s => {
        const opt = document.createElement("option");
        opt.value       = s;
        opt.textContent = s;
        select.appendChild(opt);
    });
    if (currentValue && currentValue !== "all" && [...set].includes(currentValue)) {
        select.value = currentValue;
    } else {
        select.value = "all";
    }
}

function filterBooksByQuery(list, query) {
    const terms = query.toLowerCase().match(/\S+/g) || [];
    return list.filter(book => {
        let match = true;
        for (const term of terms) {
            let m;

            // rated
            if ((m = term.match(/^rated([<>=!]+)?(\d+)$/))) {
                const op = m[1] || "=", num = Number(m[2]), val = book.rating ?? 0;
                match = match && applyOp(val, op, num);

            // pages
            } else if ((m = term.match(/^pages([<>=!]+)?(\d+)$/i))) {
                const op = m[1] || "=", num = Number(m[2]), val = book.pages ?? 0;
                match = match && applyOp(val, op, num);

            // cover
            } else if ((m = term.match(/^cover[:=] *(true|1|false|0)$/i))) {
                const wantCover = m[1] === "true" || m[1] === "1";
                match = match && (!!book.coverUrl === wantCover);

            // year
            } else if ((m = term.match(/^year([<>=!]+)?(-?\d+)$/i))) {
                if (book.year == null) { match = false; continue; }
                match = match && applyOp(book.year, m[1] || "=", Number(m[2]));

            // lang
            } else if ((m = term.match(/^lang(?:uage)?:?(.*)$/i))) {
                const val = m[1];
                if (val === "" || val === "none") {
                    match = match && !book.language;
                } else {
                    match = match && (book.language || "").toLowerCase().includes(val.toLowerCase());
                }

            // read year
            } else if ((m = term.match(/^read([<>=!]+)?(\d{4})$/i))) {
                const op  = m[1] || "=", num = Number(m[2]);
                const readYears = (book.reads || [])
                    .filter(r => r.finished != null)
                    .map(r => new Date(r.finished).getFullYear());
                if (readYears.length === 0) { match = false; continue; }
                match = match && readYears.some(y => applyOp(y, op, num));

            // country
            } else if ((m = term.match(/^country?:?(.*)$/i))) {
                const val = m[1];
                if (val === "" || val === "none") {
                    match = match && !book.country;
                } else {
                    match = match && (book.country || "").toLowerCase().includes(val.toLowerCase());
                }

            // genre
            } else if ((m = term.match(/^genre?:?(.*)$/i))) {
                const val = m[1];
                if (val === "" || val === "none") {
                    match = match && !book.genre;
                } else {
                    match = match && (book.genre || "").toLowerCase().includes(val.toLowerCase());
                }

            // tag
            } else if ((m = term.match(/^tag:?(.*)$/i))) {
                const val = m[1];
                if (val === "" || val === "none") {
                    match = match && (!book.tags || book.tags.length === 0);
                } else {
                    const lcTags = (book.tags || []).map(t => t.toLowerCase());
                    match = match && lcTags.some(t => t.includes(val.toLowerCase()));
                }

            // added
            } else if ((m = term.match(/^added([<>=!]+)?(.+)$/i))) {
                const op  = m[1] || "=";
                const raw = m[2].trim();
                if (raw === "none") {
                    match = match && !book.dateAdded;
                } else {
                    if (!book.dateAdded) { match = false; continue; }
                    const rhsTs = raw.match(/^\d{4}$/)
                        ? new Date(`${raw}-01-01`).getTime()
                        : new Date(raw).getTime();
                    if (isNaN(rhsTs)) { match = false; continue; }
                    if (raw.match(/^\d{4}$/)) {
                        const bookYear = new Date(book.dateAdded).getFullYear();
                        match = match && applyOp(bookYear, op, Number(raw));
                    } else {
                        match = match && applyOp(book.dateAdded, op, rhsTs);
                    }
                }

            // plain text
            } else {
                const text = `${book.title} ${book.author} ${book.series || ""} ${book.notes || ""}`.toLowerCase();
                match = match && text.includes(term);
            }

            if (!match) return false;
        }
        return match;
    });
}

// Helper: apply a comparison operator
function applyOp(a, op, b) {
    switch (op) {
        case ">":  return a > b;
        case ">=": return a >= b;
        case "<":  return a < b;
        case "<=": return a <= b;
        case "!=": return a !== b;
        default:   return a === b;
    }
}

function renderTable() {
    const showNumbers = document.getElementById("showNumbers").checked;
    const filter      = document.getElementById("shelfFilter").value;
    const tbody       = document.getElementById("tableBody");
    tbody.innerHTML   = "";

    let list = books.slice();
    if (filter !== "all") {
        list = list.filter(b => b.exclusiveShelf === filter || (b.shelves || []).includes(filter));
    }
    if (hideToReadExceptOwnShelf) {
        list = list.filter(b => b.exclusiveShelf !== "to-read" || filter === "to-read");
    }

    const query = document.getElementById("searchInput").value.trim();
    if (query) list = filterBooksByQuery(list, query);

    if (sortState.column) {
        list.sort((a, b) => compare(a, b, sortState.column) * sortState.direction);
    } else {
        list.sort((a, b) => {
            const hasA = getSortTimestamp(a) > 0 ? 1 : 0;
            const hasB = getSortTimestamp(b) > 0 ? 1 : 0;
            if (hasA !== hasB) return hasB - hasA;
            return (getSortTimestamp(a) - getSortTimestamp(b)) * sortState.direction;
        });
    }

    list.forEach((book, idx) => {
        const tr = document.createElement("tr");
        const shelvesDisplay = [book.exclusiveShelf, ...(book.shelves || [])].filter(Boolean)
            .map(sh => `<span style="background:${shelfColors[sh] || '#888'}; padding:2px 4px; margin-right:2px; border-radius:3px;">${sh}</span>`)
            .join("");
        const coverHtml     = book.coverUrl ? `<img src="${book.coverUrl}" alt="Cover" style="max-height:80px;" onerror="this.style.display='none'">` : "";
        const lastReadTs    = getLatestFinished(book);
        const lastReadDisplay = lastReadTs > 0 ? new Date(lastReadTs).toLocaleDateString() : "-";
        const bookEmojis    = book.emojis || [];
        const emojisDisplay = bookEmojis.map(e => e.emoji).join(" ");
        const emojisTooltip = bookEmojis.map(e => `${e.emoji}${e.page ? ` (p.${e.page})` : ""}`).join(", ");
        const emojisHtml    = bookEmojis.length
            ? `<span style="font-size:1.4em; margin-left:8px;" title="${emojisTooltip}">${emojisDisplay}</span>`
            : "";
        tr.innerHTML = `
            <td>${showNumbers ? (idx + 1) + ". " : ""}${getDisplayTitle(book)}${book.notes ? ' <span class="noteIcon" style="cursor:help;color:#888;">📝</span>' : ''}${emojisHtml}</td>
            <td>${book.rating || "-"}</td>
            <td>${book.author || ""}</td>
            <td>${coverHtml}</td>
            <td>${shelvesDisplay}</td>
            <td>${book.pages || "-"}</td>
            <td>${book.year ?? "-"}</td>
            <td>${lastReadDisplay}</td>
            <td>${getReadCount(book)}</td>
            <td><button class="editBtn" style="padding:2px 6px;">✎</button></td>
        `;
        tbody.appendChild(tr);
        tr.querySelector(".editBtn").addEventListener("click", () => openEditModal(book));
        if (book.notes) {
            const icon = tr.querySelector(".noteIcon");
            if (!notePopup) createNotePopup();
            icon.addEventListener("mouseenter", () => showNotePopup(notePopup, book.notes));
            icon.addEventListener("mouseleave", () => hideNotePopup(notePopup));
        }
    });
}

// Debounced version wired to the search input in ui-events.js
const renderTableDebounced = _listDebounce(renderTable, 200);

function renderYearGoalProgress() {
    const container = document.getElementById("yearGoalProgressContainer");
    container.innerHTML = "";
    if (!showYearGoalProgress) return;

    const currentYear = getCurrentYear();
    const stats       = getYearStats(currentYear);
    const goal        = goals[currentYear] || {};
    const daysElapsed = getDaysElapsed(currentYear);

    let html = `<div style="background:#1a1a1a;padding:14px;border:1px solid #333;border-radius:8px; font-size:0.95em;">`;
    html += `<strong>${currentYear} Pace & Projection</strong><br>`;
    html += `Finished: ${stats.books} books • ${stats.pages} pages<br>`;

    if (daysElapsed > 0) {
        const booksPace = (stats.books / daysElapsed).toFixed(2);
        const pagesPace = Math.round(stats.pages / daysElapsed);
        html += `Daily pace: ${booksPace} books • ${pagesPace} pages<br>`;
        const projectedBooks = calculateProjection(stats.books, currentYear);
        const projectedPages = calculateProjection(stats.pages, currentYear);
        html += `<strong>Projected by Dec 31: ${projectedBooks} books • ${projectedPages} pages</strong><br><br>`;
    }

    if (goal.books || goal.pages) {
        if (goal.books) {
            const percent = goal.books > 0 ? Math.min(100, Math.round(stats.books / goal.books * 100)) : 0;
            let text = `${stats.books} / ${goal.books} (${percent}%)`;
            if (stats.books >= goal.books) text += ` ✓ Completed (+${stats.books - goal.books})`;
            html += `<strong>Books goal:</strong> ${text}<br>`;
            html += `<div class="progress-bar-container"><div class="progress-bar-fill books-fill" style="width:${percent}%;"></div></div>`;
        }
        if (goal.pages) {
            const percent = goal.pages > 0 ? Math.min(100, Math.round(stats.pages / goal.pages * 100)) : 0;
            let text = `${stats.pages} / ${goal.pages} (${percent}%)`;
            if (stats.pages >= goal.pages) text += ` ✓ Completed (+${stats.pages - goal.pages})`;
            html += `<strong>Pages goal:</strong> ${text}<br>`;
            html += `<div class="progress-bar-container"><div class="progress-bar-fill pages-fill" style="width:${percent}%;"></div></div>`;
        }
    } else {
        html += `<em>No goals set for ${currentYear}.</em>`;
    }
    html += `</div>`;
    container.innerHTML = html;
}

// ── CSV Export (Goodreads-compatible format) ───────────────────────────────────
function exportCSV() {
    // Goodreads CSV columns in standard order
    const headers = [
        "Title",
        "Author",
        "Additional Authors",
        "ISBN",
        "ISBN13",
        "My Rating",
        "Average Rating",
        "Publisher",
        "Binding",
        "Number of Pages",
        "Year Published",
        "Original Publication Year",
        "Date Read",
        "Date Added",
        "Bookshelves",
        "Bookshelves with positions",
        "Exclusive Shelf",
        "My Review",
        "Spoiler",
        "Private Notes",
        "Read Count",
        "Owned Copies"
    ];

    function escapeCSV(val) {
        if (val === null || val === undefined) return "";
        const str = String(val);
        // Wrap in quotes if contains comma, quote, or newline
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    function formatDate(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        const yyyy = d.getFullYear();
        const mm   = String(d.getMonth() + 1).padStart(2, "0");
        const dd   = String(d.getDate()).padStart(2, "0");
        return `${yyyy}/${mm}/${dd}`;
    }

    const rows = [headers.map(escapeCSV).join(",")];

    books.forEach(b => {
        // Date Read = most recent finished date
        const lastFinished = getLatestFinished(b);
        const dateRead     = lastFinished ? formatDate(lastFinished) : "";
        const dateAdded    = b.dateAdded  ? formatDate(b.dateAdded)  : "";

        // Bookshelves = extra shelves joined
        const extraShelves = (b.shelves || []).join(", ");

        const readCount = getReadCount(b);

        const row = [
            b.title       || "",
            b.author      || "",
            (b.additionalAuthors || []).join(", "),
            b.isbn        || "",
            "",                           // ISBN13 — not stored separately
            b.rating      || 0,
            "",                           // Average Rating — not stored
            b.publisher   || "",
            b.format      || "",
            b.pages       || "",
            b.year        || "",
            b.year        || "",          // Original Publication Year (same field)
            dateRead,
            dateAdded,
            extraShelves,
            "",                           // Bookshelves with positions — not stored
            b.exclusiveShelf || "to-read",
            b.notes       || "",
            "",                           // Spoiler — not stored
            "",                           // Private Notes — not stored
            readCount     || 0,
            ""                            // Owned Copies — not stored
        ];

        rows.push(row.map(escapeCSV).join(","));
    });

    const csv  = rows.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "reading-list-goodreads.csv";
    a.click();
    URL.revokeObjectURL(url);
}

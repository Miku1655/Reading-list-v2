function populateShelfFilter() {
    const select = document.getElementById("shelfFilter");
    const currentValue = select.value;
    select.innerHTML = '<option value="all">all</option>';
    const set = new Set();
    books.forEach(b => {
        if (b.exclusiveShelf) set.add(b.exclusiveShelf);
        (b.shelves || []).forEach(s => set.add(s));
    });
    [...set].sort().forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
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
            if ((m = term.match(/^rated([<>=!]+)?(\d+)$/))) {
                let op = m[1] || "=";
                const num = Number(m[2]);
                const val = book.rating ?? 0;
                if (op === ">") match = match && val > num;
                else if (op === ">=") match = match && val >= num;
                else if (op === "<") match = match && val < num;
                else if (op === "<=") match = match && val <= num;
                else if (op === "=" || op === "==") match = match && val === num;
                else if (op === "!=") match = match && val !== num;
            } else if ((m = term.match(/^pages([<>=!]+)?(\d+)$/i))) {
                let op = m[1] || "=";
                const num = Number(m[2]);
                const val = book.pages ?? 0;
                if (op === ">") match = match && val > num;
                else if (op === ">=") match = match && val >= num;
                else if (op === "<") match = match && val < num;
                else if (op === "<=") match = match && val <= num;
                else if (op === "=" || op === "==") match = match && val === num;
                else if (op === "!=") match = match && val !== num;
            } else if ((m = term.match(/^cover(=|:) *(true|1|false|0)$/i))) {
                const wantCover = m[2] === "true" || m[2] === "1";
                const hasCover = !!book.coverUrl;
                match = match && (hasCover === wantCover);
            } else if ((m = term.match(/^year([<>=!]+)?(-?\d+)$/i))) {
                let op = m[1] || "=";
                const num = Number(m[2]);
                if (book.year == null) { match = false; continue; }
                const val = book.year;
                if (op === ">") match = match && val > num;
                else if (op === ">=") match = match && val >= num;
                else if (op === "<") match = match && val < num;
                else if (op === "<=") match = match && val <= num;
                else if (op === "=" || op === "==") match = match && val === num;
                else if (op === "!=") match = match && val !== num;
            } else if ((m = term.match(/^lang(uage)?:?(.*)$/i))) {
                const val = m[2];
                if (val === "" || val === "none") {
                    match = match && !book.language;
                } else {
                    const lc = (book.language || "").toLowerCase();
                    match = match && lc.includes(val.toLowerCase());
                }
            } else if ((m = term.match(/^country?:?(.*)$/i))) {
                const val = m[1];
                if (val === "" || val === "none") {
                    match = match && !book.country;
                } else {
                    const lc = (book.country || "").toLowerCase();
                    match = match && lc.includes(val.toLowerCase());
                }
            } else if ((m = term.match(/^genre?:?(.*)$/i))) {
                const val = m[1];
                if (val === "" || val === "none") {
                    match = match && !book.genre;
                } else {
                    const lc = (book.genre || "").toLowerCase();
                    match = match && lc.includes(val.toLowerCase());
                }
            } else if ((m = term.match(/^tag:?(.*)$/i))) {
                const val = m[1];
                if (val === "" || val === "none") {
                    match = match && (!book.tags || book.tags.length === 0);
                } else {
                    const lcTags = (book.tags || []).map(t => t.toLowerCase());
                    match = match && lcTags.some(t => t.includes(val.toLowerCase()));
                }
            } else {
                const text = `${book.title} ${book.author} ${book.series || ""} ${book.notes || ""}`.toLowerCase();
                match = match && text.includes(term);
            }
            if (!match) return false;
        }
        return match;
    });
}

function renderTable() {
    const showNumbers = document.getElementById("showNumbers").checked;
    const filter = document.getElementById("shelfFilter").value;
    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = "";
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
            const diff = getSortTimestamp(a) - getSortTimestamp(b);
            return diff * sortState.direction;
        });
    }

    list.forEach((book, idx) => {
        const tr = document.createElement("tr");
        const shelvesDisplay = [book.exclusiveShelf, ...(book.shelves || [])].filter(Boolean)
            .map(sh => `<span style="background:${shelfColors[sh] || '#888'}; padding:2px 4px; margin-right:2px; border-radius:3px;">${sh}</span>`)
            .join("");
        const coverHtml = book.coverUrl ? `<img src="${book.coverUrl}" alt="Cover" style="max-height:80px;" onerror="this.style.display='none'">` : "";
        const lastReadTs = getLatestFinished(book);
        const lastReadDisplay = lastReadTs > 0 ? new Date(lastReadTs).toLocaleDateString() : "-";
        const bookEmojis = book.emojis || [];
        const emojisDisplay = bookEmojis.map(e => e.emoji).join(" ");
        const emojisTooltip = bookEmojis.map(e => `${e.emoji}${e.page ? ` (p.${e.page})` : ""}`).join(", ");
        const emojisHtml = bookEmojis.length ? `<span style="font-size:1.4em; margin-left:8px;" title="${emojisTooltip}">${emojisDisplay}</span>` : "";
        tr.innerHTML = `
            <td>${showNumbers ? (idx + 1) + ". " : ""}${book.title || ""}${book.notes ? ' <span class="noteIcon" style="cursor:help;color:#888;">📝</span>' : ''}${emojisHtml}</td>
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

function renderYearGoalProgress() {
    const container = document.getElementById("yearGoalProgressContainer");
    container.innerHTML = "";
    if (!showYearGoalProgress) return;

    const currentYear = getCurrentYear();
    const stats = getYearStats(currentYear);
    const goal = goals[currentYear] || {};
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

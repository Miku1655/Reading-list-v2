function parseCSVLine(line) {
    const result = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') inQuotes = !inQuotes;
        else if (c === "," && !inQuotes) {
            result.push(field);
            field = "";
        } else field += c;
    }
    result.push(field);
    return result;
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return alert("Empty file");
    const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
    const idx = name => headers.findIndex(h => h.toLowerCase() === name.toLowerCase()); // case-insensitive for safety

    const titleIdx = idx("title") !== -1 ? idx("title") : idx("book title");
    const authorIdx = idx("author");
    const exclusiveIdx = idx("exclusive shelf");
    const shelvesIdx = idx("bookshelves");
    const pagesIdx = idx("number of pages");
    const yearIdx = idx("original publication year");
    const ratingIdx = idx("my rating");
    const notesIdx = idx("my review");
    const isbnIdx = headers.findIndex(h => h.toLowerCase().includes("isbn"));

    books = [];
    nextImportOrder = 1;

    for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < headers.length) continue; // skip malformed
        if (!cols[titleIdx]) continue;

        let exclusive = cols[exclusiveIdx] || "read";
        exclusive = exclusive.toLowerCase();

        let extraShelves = cols[shelvesIdx] ? cols[shelvesIdx].split(",").map(s => s.trim()).filter(Boolean) : [];
        extraShelves = extraShelves.filter(s => s.toLowerCase() !== exclusive);

        let isbn = "";
        if (isbnIdx !== -1 && cols[isbnIdx]) {
            isbn = cols[isbnIdx].replace(/[^0-9X]/gi, "");
        }

        const book = {
            title: cols[titleIdx] || "",
            author: cols[authorIdx] || "",
            exclusiveShelf: exclusive,
            shelves: extraShelves,
            pages: Number(cols[pagesIdx]) || 0,
            year: Number(cols[yearIdx]) || null,
            rating: Number(cols[ratingIdx]) || 0,
            notes: cols[notesIdx] || "",
            importOrder: nextImportOrder++,
            dateAdded: Date.now(),
            isbn: isbn || null,
            reads: [],
            tags: []
        };
      
        books.push(book);
    }

    saveBooksToLocal();
    renderAll();
    alert("CSV imported successfully! Books added/replaced.");
}

function importJSON(text) {
    let data;
    try { data = JSON.parse(text); } catch { return alert("Invalid JSON"); }
    if (!data.books || !Array.isArray(data.books)) return alert("Invalid export format");
    if (!confirm("JSON import will replace current list. Continue?")) return;
    books = data.books || [];
    // Optional: restore profile/goals/shelfColors if in export
    if (data.profile) profile = data.profile;
    if (data.goals) goals = data.goals;
    if (data.shelfColors) shelfColors = data.shelfColors;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
    localStorage.setItem(SHELF_COLORS_KEY, JSON.stringify(shelfColors));
    saveBooksToLocal();
    renderAll();
    alert("JSON imported successfully!");
}

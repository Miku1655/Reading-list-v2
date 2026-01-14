function getReadCount(book) {
    return book.reads ? book.reads.filter(r => r.finished !== null).length : 0;
}
function getLatestFinished(book) {
    if (!book.reads || book.reads.length === 0) return 0;
    const finished = book.reads.map(r => r.finished).filter(t => t !== null);
    return finished.length > 0 ? Math.max(...finished) : 0;
}
function getCurrentReadStart(book) {
    if (!book.reads || book.reads.length === 0) return 0;
    const current = book.reads.find(r => r.finished === null);
    return current ? current.started || 0 : 0;
}
function getSortTimestamp(book) {
  
    const latestFinished = getLatestFinished(book);
    if (latestFinished > 0) return latestFinished;
    const currentStart = getCurrentReadStart(book);
    if (currentStart > 0) return currentStart;
    return book.dateAdded || 0;
}
function compare(a, b, col) {
    let av = a[col];
    let bv = b[col];
    if (col === "year") {
        av = av ?? Infinity;
        bv = bv ?? Infinity;
        return av - bv;
    }
    if (col === "pages" || col === "rating") {
        av = av ?? 0;
        bv = bv ?? 0;
        return av - bv;
    }
    if (col === "lastRead") {
        return getLatestFinished(a) - getLatestFinished(b);
    }
    if (col === "readCount") {
        return getReadCount(a) - getReadCount(b);
    }
    if (col === "shelves") {
        av = [a.exclusiveShelf, ...(a.shelves || [])].join(", ");
        bv = [b.exclusiveShelf, ...(b.shelves || [])].join(", ");
    }
    av = av ?? "";
    bv = bv ?? "";
    return String(av).localeCompare(String(bv));
}
function calculateReadingSpeeds() {
    const validReads = [];
    books.forEach(book => {
        if (!book.reads || book.pages <= 0) return;
        book.reads.forEach(read => {
            if (read.started !== null && read.finished !== null) {
                const days = (read.finished - read.started) / (1000 * 60 * 60 * 24);
                if (days > 0) {
                    validReads.push({
                        book: book,
                        speed: book.pages / days,
                        days: days
                    });
                }
            }
        });
    });
    if (validReads.length === 0) {
        return { avg: "0", fastest: null, slowest: null };
    }
    const speeds = validReads.map(r => r.speed);
    const avg = (speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(1);
    validReads.sort((a, b) => b.speed - a.speed);
    const fastest = validReads[0];
    const slowest = validReads[validReads.length - 1];
    return { avg, fastest, slowest };
}
function calculatePerYear() {
    const perYear = {};
    books.forEach(b => {
        if (!b.reads) return;
        b.reads.forEach(read => {
            if (!read.finished) return;
            // Normalize timestamp: handle number or string safely
            let timestamp = read.finished;
            if (typeof timestamp === 'string') {
                timestamp = Date.parse(timestamp);
            }
            if (isNaN(timestamp)) {
                console.warn("Invalid finished timestamp skipped:", read.finished, "in book:", b.title);
                return;
            }
            const dt = new Date(timestamp);
            const y = dt.getFullYear();
            if (isNaN(y)) return; // extra safety
            perYear[y] = perYear[y] || { books: 0, pages: 0 };
            perYear[y].books++;
            perYear[y].pages += b.pages || 0;
        });
    });
    return perYear;
}
function calculateDistributions() {
    const readBooks = books.filter(b => b.exclusiveShelf === "read");
    const status = { read: 0, "currently-reading": 0, "to-read": 0, dnf: 0 };
    books.forEach(b => {
        const shelf = b.exclusiveShelf || "to-read";
        status[shelf]++;
    });
    const language = {};
    const country = {};
    const genre = {};
    readBooks.forEach(b => {
        const l = (b.language || "").trim() || "Unknown";
        language[l] = (language[l] || 0) + 1;
        const c = (b.country || "").trim() || "Unknown";
        country[c] = (country[c] || 0) + 1;
        const g = (b.genre || "").trim() || "Unknown";
        genre[g] = (genre[g] || 0) + 1;
    });
    return {
        status,
        language,
        country,
        genre,
        readCount: readBooks.length,
        totalBooks: books.length
    };
}
function prepareChartData(map, maxItems = 8) {
    const sorted = Object.entries(map).sort(([,a], [,b]) => b - a);
    const top = sorted.slice(0, maxItems);
    const other = sorted.slice(maxItems).reduce((sum, [,c]) => sum + c, 0);
    const labels = top.map(([k]) => k);
    const values = top.map(([,v]) => v);
    if (other > 0) {
        labels.push("Other");
        values.push(other);
    }
    return { labels, values };
}
function getCurrentYear() {
    return new Date().getFullYear();
}
function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}
function getDaysInYear(year) {
    return isLeapYear(year) ? 366 : 365;
}
function getDaysElapsed(year) {
    const currentYear = getCurrentYear();
    if (year !== currentYear) return getDaysInYear(year);
    const now = new Date();
    const start = new Date(currentYear, 0, 1);
    const diffMs = now - start;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1; // inclusive of today
}
function calculateProjection(current, year) {
    const daysElapsed = getDaysElapsed(year);
    if (daysElapsed === 0) return current;
    const daily = current / daysElapsed;
    return Math.round(daily * getDaysInYear(year));
}
function getYearStats(year) {
    return calculatePerYear()[year] || { books: 0, pages: 0 };
}

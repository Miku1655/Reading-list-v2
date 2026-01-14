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
            if (read.finished) {
                const dt = new Date(read.finished);
                const y = dt.getFullYear();
                perYear[y] = perYear[y] || { books: 0, pages: 0 };
                perYear[y].books++;
                perYear[y].pages += b.pages || 0;
            }
        });
    });
    return perYear;
}

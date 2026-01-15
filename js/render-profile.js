function renderProfileStats() {
    const container = document.getElementById("profileStats");
    const readBooks = books.filter(b => b.exclusiveShelf === "read");
    const ratedBooks = readBooks.filter(b => b.rating > 0);
    const pagesRead = readBooks.reduce((s, b) => s + (b.pages || 0) * getReadCount(b), 0);
    const avgRating = ratedBooks.length ? (ratedBooks.reduce((s, b) => s + b.rating, 0) / ratedBooks.length).toFixed(1) : "-";
    container.innerHTML = `
        <h2>Reading Stats</h2>
        <div class="stats-grid">
            <div>Books read</div><div>${readBooks.length}</div>
            <div>Pages read</div><div>${pagesRead}</div>
            <div>Average rating</div><div>${avgRating}</div>
        </div>
    `;
}
function renderRecentBooks() {
    const container = document.getElementById("recentBooksContainer");
    container.innerHTML = "";
    const sortDesc = (a, b) => getSortTimestamp(b) - getSortTimestamp(a);
    let currently = books.filter(b => b.exclusiveShelf === "currently-reading");
    if (currently.length) {
        const section = document.createElement("div");
        section.innerHTML = "<h4>Currently Reading</h4><div class=\"card-container\"></div>";
        container.appendChild(section);
        currently.sort(sortDesc).forEach(b => section.querySelector(".card-container").appendChild(createBookCard(b)));
    }
    let finished = books.filter(b => b.exclusiveShelf === "read" && getLatestFinished(b) > 0);
    if (finished.length) {
        const section = document.createElement("div");
        section.innerHTML = "<h4>Recently Finished</h4><div class=\"card-container\"></div>";
        container.appendChild(section);
        finished.sort(sortDesc).slice(0, 8).forEach(b => section.querySelector(".card-container").appendChild(createBookCard(b)));
    }
    let toread = books.filter(b => b.exclusiveShelf === "to-read");
    if (toread.length) {
        const section = document.createElement("div");
        section.innerHTML = "<h4>Recently Added to To-Read</h4><div class=\"card-container\"></div>";
        container.appendChild(section);
        toread.sort(sortDesc).slice(0, 4).forEach(b => section.querySelector(".card-container").appendChild(createBookCard(b)));
    }
    if (!container.innerHTML.trim()) container.innerHTML = "<p>No activity yet.</p>";
}
function renderFavourites() {
    const container = document.getElementById("favouritesContainer");
    container.innerHTML = "";
    let hasContent = false;
    if (profile.favouriteSeries.length) {
    const section = document.createElement("div");
    section.innerHTML = "<h4>Favourite Series</h4><div class=\"card-container\"></div>";
    container.appendChild(section);
    const favSeriesContainer = section.querySelector(".card-container");
    // Sort by progress % desc, then name asc
    const sortedSeries = profile.favouriteSeries.slice().sort((a, b) => {
        const pa = getSeriesProgress(a);
        const pb = getSeriesProgress(b);
        if (!pa) return 1;
        if (!pb) return -1;
        if (pa.percent !== pb.percent) return pb.percent - pa.percent;
        return a.localeCompare(b);
    });
    sortedSeries.forEach(series => {
        const card = createSeriesCard(series);
        if (card) {
            hasContent = true;
            favSeriesContainer.appendChild(card);
        }
    });
}
    if (profile.favourites.length) {
        const favBooks = profile.favourites.map(id => books.find(b => b.importOrder === id)).filter(Boolean);
        if (favBooks.length) {
            hasContent = true;
            const section = document.createElement("div");
            section.innerHTML = "<h4>Favourite Books</h4><div class=\"card-container\"></div>";
            container.appendChild(section);
            const favContainer = section.querySelector(".card-container");
            favBooks.forEach(book => {
                const card = createBookCard(book);
                card.draggable = true;
                favContainer.appendChild(card);
            });
            makeFavouritesDraggable(favContainer);
        }
    }
    if (!hasContent) container.innerHTML = "<p>No favourites yet.</p>";
}
function renderWaitingWidget() {
    const widget = document.getElementById("waitingWidget");
    const toRead = books.filter(b => b.exclusiveShelf === "to-read");
    if (toRead.length === 0) {
        widget.innerHTML = "<p>All caught up! No to-read books waiting.</p>";
        return;
    }
    const randomBook = toRead[Math.floor(Math.random() * toRead.length)];
    const daysSince = randomBook.dateAdded ? Math.floor((Date.now() - randomBook.dateAdded) / (1000*60*60*24)) : "?";
    const coverHtml = randomBook.coverUrl
        ? `<img src="${randomBook.coverUrl}" style="max-height:200px; border:1px solid #444; border-radius:6px;">`
        : `<div class="no-cover" style="width:160px; height:200px; margin:auto;">No cover</div>`;
    widget.innerHTML = `
        ${coverHtml}
        <p style="margin:12px 0;"><strong>${randomBook.title}</strong> by ${randomBook.author || "Unknown"}</p>
        <p>Added ${daysSince} day${daysSince === 1 ? '' : 's'} ago... still waiting for you!</p>
    `;
}
function renderOnThisDay() {
    const container = document.getElementById("onThisDayContainer");
    const emptyMsg = document.getElementById("onThisDayEmpty");
    container.innerHTML = "";
    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();
    const currentYear = today.getFullYear();
    const anniversaries = [];
    books.forEach(book => {
        book.reads.forEach(read => {
            if (read.finished) {
                const d = new Date(read.finished);
                if (d.getMonth() === todayMonth && d.getDate() === todayDay) {
                    const yearsAgo = currentYear - d.getFullYear();
                    anniversaries.push({ book, yearsAgo, finishedYear: d.getFullYear() });
                }
            }
        });
    });
    if (anniversaries.length === 0) {
        emptyMsg.style.display = "block";
        return;
    }
    emptyMsg.style.display = "none";
    anniversaries.sort((a, b) => b.finishedYear - a.finishedYear);
    anniversaries.forEach(ann => {
        const card = createBookCard(ann.book);
        const note = document.createElement("small");
        note.className = "anniversary-note";
        const agoText = ann.yearsAgo === 0 ? "today!" : `${ann.yearsAgo} year${ann.yearsAgo > 1 ? "s" : ""} ago on this day`;
        note.textContent = `Finished ${agoText}`;
        card.appendChild(note);
        container.appendChild(card);
    });
}

function renderRediscoverWidget() {
    const widget = document.getElementById("rediscoverWidget");
    const currentYear = new Date().getFullYear();
    const cutoffYear = currentYear - 2;

    // Find qualifying books: finished, latest finish <= cutoffYear
    const qualifying = books.filter(b => {
        if (b.exclusiveShelf !== "read") return false;
        const latest = getLatestFinished(b);
        if (!latest) return false;
        return new Date(latest).getFullYear() <= cutoffYear;
    });

    if (qualifying.length === 0) {
        widget.innerHTML = "<p>No older finished books yet — keep reading to unlock rediscoveries!</p>";
        return;
    }

    // Random selection
    const book = qualifying[Math.floor(Math.random() * qualifying.length)];

    // Latest read entry
    const latestRead = book.reads.reduce((latest, read) => {
        if (read.finished && (!latest || read.finished > latest.finished)) return read;
        return latest;
    }, null);

    // Duration calc
    let durationText = "";
    if (latestRead && latestRead.started && latestRead.finished) {
        const start = new Date(latestRead.started);
        const end = new Date(latestRead.finished);
        const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1; // inclusive
        durationText = `${start.toLocaleDateString()} – ${end.toLocaleDateString()} (${days} day${days > 1 ? "s" : ""} read)`;
    } else if (latestRead && latestRead.finished) {
        durationText = `Finished ${new Date(latestRead.finished).toLocaleDateString()}`;
    }

    // Years ago
    const yearsAgo = currentYear - new Date(latestRead.finished).getFullYear();

    // Rating stars
    let ratingHtml = "";
    if (book.rating > 0) {
        ratingHtml = `<div style="margin:8px 0;">Rating: ${"★".repeat(book.rating)}${"☆".repeat(5 - book.rating)}</div>`;
    }

    // Notes truncated
    let notesHtml = "";
    if (book.notes) {
        const truncated = book.notes.length > 200 ? book.notes.slice(0, 200) + "..." : book.notes;
        notesHtml = `<div class="rediscover-notes">${truncated}</div>`;
    }

    const coverHtml = book.coverUrl
        ? `<img src="${book.coverUrl}">`
        : `<div class="no-cover">No cover</div>`;

    widget.innerHTML = `
        ${coverHtml}
        <p style="margin:12px 0;"><strong>${book.title}</strong> by ${book.author || "Unknown"}</p>
        <div class="rediscover-details">
            Finished ${yearsAgo} year${yearsAgo > 1 ? "s" : ""} ago<br>
            ${durationText}
            ${ratingHtml}
        </div>
        ${notesHtml}
    `;
}

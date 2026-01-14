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
        profile.favouriteSeries.sort().forEach(series => {
            const card = createSeriesCard(series);
            if (card) {
                hasContent = true;
                section.querySelector(".card-container").appendChild(card);
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

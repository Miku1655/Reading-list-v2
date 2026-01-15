function createBookCard(book) {
    const div = document.createElement("div");
    div.className = "book-card";
    div.dataset.bookId = book.importOrder;
    const emojis = book.emojis || [];
    const emojisDisplay = emojis.map(e => e.emoji).join(" ");
    const tooltip = emojis.map(e => `${e.emoji}${e.page ? ` (p.${e.page})` : ""}`).join(", ");
    const emojisHtml = emojis.length ? `<div style="margin-top:4px; font-size:1.4em;" title="${tooltip}">${emojisDisplay}</div>` : "";
    const readCount = getReadCount(book);
    const extraLayers = Math.min(Math.max(readCount - 1, 0), 5);
    if (extraLayers > 0) div.classList.add("stacked");
    for (let i = 0; i < extraLayers; i++) {
        const layer = document.createElement("div");
        layer.className = "stack-layer";
        div.appendChild(layer);
    }
    const coverHtml = book.coverUrl
        ? `<img src="${book.coverUrl}" alt="Cover" onerror="this.style.display='none'">`
        : `<div class="no-cover">No cover</div>`;
    div.innerHTML += `
        ${coverHtml}
        <strong class="profile-book-title">${book.title || "No title"}</strong>
        <span class="profile-book-author">${book.author || ""}</span>
        ${emojisHtml}
    `;
    div.title = `${book.title} — ${book.author}`;
    div.addEventListener("click", () => openEditModal(book));
    return div;
}
function createSeriesCard(series) {
    const progress = getSeriesProgress(series);
    if (!progress) return null; // No books in series

    const { completed, total, percent } = progress;
    const isComplete = completed === total;

    // Get all books in this series, sorted by seriesNumber
    let seriesBooks = books.filter(b => b.series === series);
    seriesBooks = seriesBooks.sort((a, b) => (a.seriesNumber ?? Infinity) - (b.seriesNumber ?? Infinity));

    const firstCoverBook = seriesBooks.find(b => b.coverUrl);
    const author = seriesBooks[0]?.author || "Various";
    const count = seriesBooks.length;

    let coverHtml = `<div class="no-cover">Series</div>`;
    if (firstCoverBook) {
        coverHtml = `<img src="${firstCoverBook.coverUrl}" alt="Cover" onerror="this.style.display='none'">`;
    }

    const div = document.createElement("div");
    div.className = "book-card series-card"; // added series-card class for easier targeting
    div.style.cursor = "pointer"; // visual hint it's clickable

    const progressText = isComplete
        ? `<span class="series-progress-text series-progress-complete">${total} / ${total} completed ✓</span>`
        : `<span class="series-progress-text">${completed} / ${total} completed</span>`;

    const progressBar = `<div class="series-progress-bar"><div class="series-progress-fill" style="width:${percent}%;"></div></div>`;

    // Toggle icon (will be updated by JS when clicked)
    const toggleIcon = `<span class="series-toggle-icon">+</span>`;

    div.innerHTML = `
        ${coverHtml}
        <strong class="profile-book-title">${series}</strong>
        <span class="profile-book-author">${author}</span>
        <small>${count} book${count > 1 ? 's' : ''}</small>
        ${progressText}
        ${progressBar}
        ${toggleIcon}
    `;

    div.title = `${series} (${completed}/${total} completed) – click to ${total > 1 ? 'expand' : 'show'} details`;

    // === COLLAPSE / EXPAND LOGIC ===
    const detailsContainer = document.createElement("div");
    detailsContainer.className = "series-details collapsed";
    
    // Build mini list of books in series
    if (seriesBooks.length > 0) {
        const ul = document.createElement("ul");
        seriesBooks.forEach(book => {
            const status = book.exclusiveShelf === "read" ? "✓ read" :
                          book.exclusiveShelf === "currently-reading" ? "→ reading" :
                          book.exclusiveShelf === "dnf" ? "✗ DNF" : "to-read";
            
            const li = document.createElement("li");
            li.innerHTML = `
                <span class="series-book-status">${status}</span>
                ${book.seriesNumber != null ? `<small>#${book.seriesNumber}</small> ` : ''}
                <strong>${book.title}</strong>
            `;
            
            // Optional: tiny cover thumbnail
            if (book.coverUrl) {
                const thumb = document.createElement("img");
                thumb.src = book.coverUrl;
                thumb.className = "series-book-thumb";
                thumb.alt = "";
                thumb.onerror = () => thumb.style.display = "none";
                li.prepend(thumb);
            }
            
            ul.appendChild(li);
        });
        detailsContainer.appendChild(ul);
    } else {
        detailsContainer.innerHTML = "<p style='color:#888; font-style:italic; padding:8px;'>No books found in this series.</p>";
    }

    // Insert details right after the main card content
    div.appendChild(detailsContainer);

    // Click handler – toggle collapse
    div.addEventListener("click", (e) => {
        // Prevent opening edit modal when clicking series card
        e.stopPropagation();
        
        const isCollapsed = detailsContainer.classList.toggle("collapsed");
        const icon = div.querySelector(".series-toggle-icon");
        if (icon) {
            icon.textContent = isCollapsed ? "+" : "−";
        }
    });

    return div;
}

function makeFavouritesDraggable(container) {
    container.addEventListener("dragstart", e => {
        const card = e.target.closest(".book-card");
        if (card) {
            draggedElement = card;
            card.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
        }
    });
    container.addEventListener("dragover", e => {
        e.preventDefault();
        const card = e.target.closest(".book-card");
        if (card && card !== draggedElement) {
            const rect = card.getBoundingClientRect();
            const next = (e.clientY - rect.top) > (rect.height / 2);
            if (next && card.nextSibling !== draggedElement) {
                container.insertBefore(draggedElement, card.nextSibling);
            } else if (!next && card !== draggedElement.nextSibling) {
                container.insertBefore(draggedElement, card);
            }
        }
    });
    container.addEventListener("dragend", () => {
        if (draggedElement) {
            draggedElement.classList.remove("dragging");
            profile.favourites = Array.from(container.querySelectorAll(".book-card")).map(c => Number(c.dataset.bookId));
            localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
            draggedElement = null;
        }
    });
    container.addEventListener("drop", e => e.preventDefault());
    container.addEventListener("touchstart", e => {
        if (e.touches.length === 1) {
            const card = e.target.closest(".book-card");
            if (card) {
                draggedElement = card;
                card.classList.add("dragging");
            }
        }
    }, {passive: true});
    container.addEventListener("touchmove", e => {
        if (!draggedElement) return;
        e.preventDefault();
        const touch = e.touches[0];
        const overElem = document.elementFromPoint(touch.clientX, touch.clientY);
        const card = overElem ? overElem.closest(".book-card") : null;
        if (card && card !== draggedElement) {
            const rect = card.getBoundingClientRect();
            if (touch.clientY > rect.top + rect.height / 2) {
                card.after(draggedElement);
            } else {
                card.before(draggedElement);
            }
        }
    }, {passive: false});
    container.addEventListener("touchend", () => {
        if (draggedElement) {
            draggedElement.classList.remove("dragging");
            profile.favourites = Array.from(container.querySelectorAll(".book-card")).map(c => Number(c.dataset.bookId));
            localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
            draggedElement = null;
        }
    });
}

function openEditModal(book = null) {
    editingBook = book || { reads: [], tags: [], exclusiveShelf: "to-read", dateAdded: Date.now(), emojis: [] };

    // Fill all fields (your original)
    document.getElementById("editTitle").value = book?.title || "";
    document.getElementById("editAuthor").value = book?.author || "";
    document.getElementById("editSeries").value = book?.series || "";
    document.getElementById("editSeriesNumber").value = book?.seriesNumber ?? "";
    document.getElementById("editLanguage").value = book?.language || "";
    document.getElementById("editCountry").value = book?.country || "";
    document.getElementById("editGenre").value = book?.genre || "";
    document.getElementById("editTags").value = (book?.tags || []).join(", ");
    document.getElementById("editShelves").value = (book?.shelves || []).join(", ");
    document.getElementById("editExclusiveShelf").value = editingBook.exclusiveShelf || "to-read";
    document.getElementById("editPages").value = book?.pages || "";
    document.getElementById("editYear").value = book?.year || "";
    document.getElementById("editRating").value = book?.rating || 0;
    document.getElementById("editNotes").value = book?.notes || "";
    document.getElementById("editCoverUrl").value = book?.coverUrl || "";
    document.getElementById("editDateAdded").value = book?.dateAdded ? new Date(book.dateAdded).toISOString().split('T')[0] : "";

    const preview = document.getElementById("coverPreview");
    if (book?.coverUrl) {
        preview.src = book.coverUrl;
        preview.style.display = "block";
    } else {
        preview.style.display = "none";
    }

    document.getElementById("editFavourite").checked = !!book && profile.favourites.includes(book.importOrder);

    const series = book?.series || "";
    if (series) {
        document.getElementById("favSeriesLabel").style.display = "block";
        document.getElementById("editFavouriteSeries").checked = profile.favouriteSeries.includes(series);
    } else {
        document.getElementById("favSeriesLabel").style.display = "none";
    }

    // Simple reads list (original – no emojis here)
    const readsList = document.getElementById("readsList");
    readsList.innerHTML = "";

    function rebuildReadsList() {
        readsList.innerHTML = "";
        editingBook.reads.forEach((read, idx) => {
            const div = document.createElement("div");
            div.className = "read-entry";
            div.innerHTML = `
                <input type="date" class="readStart" value="${read.started ? new Date(read.started).toISOString().substring(0,10) : ''}">
                <input type="date" class="readFinish" value="${read.finished ? new Date(read.finished).toISOString().substring(0,10) : ''}">
                <button type="button" class="removeRead">Remove</button>
            `;
            div.querySelector(".removeRead").onclick = () => {
                editingBook.reads.splice(idx, 1);
                rebuildReadsList();
            };
            div.querySelector(".readStart").onchange = e => read.started = e.target.value ? new Date(e.target.value).getTime() : null;
            div.querySelector(".readFinish").onchange = e => read.finished = e.target.value ? new Date(e.target.value).getTime() : null;
            readsList.appendChild(div);
        });
    }

    rebuildReadsList();

    document.getElementById("addReadBtn").onclick = () => {
        editingBook.reads.push({ started: Date.now(), finished: null });
        rebuildReadsList();
    };

    document.getElementById("editExclusiveShelf").onchange = () => {
        const status = document.getElementById("editExclusiveShelf").value;
        editingBook.exclusiveShelf = status;
        if (status === "currently-reading") {
            if (editingBook.reads.length === 0 || editingBook.reads[editingBook.reads.length - 1].finished !== null) {
                editingBook.reads.push({ started: Date.now(), finished: null });
            }
        } else if (status !== "read") {
            editingBook.reads = editingBook.reads.filter(r => r.finished !== null);
        }
        rebuildReadsList();
    };

    // Ensure emojis array exists and refresh display (handlers initialized once globally)
    editingBook.emojis = editingBook.emojis || [];
    if (window.__updateEmojiDisplay) window.__updateEmojiDisplay();

// Quotes list – similar to reads
const quotesList = document.getElementById("quotesList");
if (!quotesList) { // Create if not exist (we'll add HTML later)
    // We'll add the HTML in index.html
}
quotesList.innerHTML = "";
editingBook.quotes = editingBook.quotes || [];

function rebuildQuotesList() {
    quotesList.innerHTML = "";
    editingBook.quotes.forEach((quote, idx) => {
        const div = document.createElement("div");
        div.className = "quote-entry";
        div.innerHTML = `
            <textarea class="quoteText" placeholder="Quote text">${quote.text || ""}</textarea>
            <input type="number" class="quotePage" placeholder="Page" value="${quote.page ?? ''}">
            <input type="date" class="quoteDate" value="${quote.date ? new Date(quote.date).toISOString().split('T')[0] : ''}">
            <label>Favorite: <input type="checkbox" class="quoteFavorite" ${quote.favorite ? 'checked' : ''}></label>
            <button type="button" class="removeQuote">Remove</button>
        `;
        div.querySelector(".removeQuote").onclick = () => {
            editingBook.quotes.splice(idx, 1);
            rebuildQuotesList();
        };
        div.querySelector(".quoteText").onchange = e => quote.text = e.target.value.trim();
        div.querySelector(".quotePage").onchange = e => quote.page = e.target.value ? Number(e.target.value) : null;
        div.querySelector(".quoteDate").onchange = e => quote.date = e.target.value ? new Date(e.target.value).getTime() : null;
        div.querySelector(".quoteFavorite").onchange = e => quote.favorite = e.target.checked;
        quotesList.appendChild(div);
    });
}
rebuildQuotesList();

document.getElementById("addQuoteBtn").onclick = () => {
    editingBook.quotes.push({ text: "", page: null, date: null, favorite: false });
    rebuildQuotesList();
};
    
    // Collapsed persistence (clean)
    const key = "reading_edit_collapsed_sections";
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    document.querySelectorAll(".edit-section").forEach((sec, i) => {
        sec.classList.toggle("collapsed", saved.includes(i));
    });

    const saveCollapsed = () => {
        const now = [];
        document.querySelectorAll(".edit-section").forEach((sec, i) => {
            if (sec.classList.contains("collapsed")) now.push(i);
        });
        localStorage.setItem(key, JSON.stringify(now));
    };

    document.getElementById("saveEdit").addEventListener("click", saveCollapsed);
    document.getElementById("closeEdit").addEventListener("click", () => {
        saveCollapsed();
        closeEditModal();
    });
    document.getElementById("editModal").addEventListener("click", (e) => {
        if (e.target === document.getElementById("editModal")) {
            saveCollapsed();
            closeEditModal();
        }
    });

    document.getElementById("editModal").style.display = "flex";
}

function closeEditModal() {
    editingBook = null;
    document.getElementById("editModal").style.display = "none";
}

// --- Emoji picker/display handlers (single initialization) ---
(() => {
    const currentEmojisSpan = document.getElementById("currentEmojis");
    const pageInput = document.getElementById("emojiPageInput");
    const picker = document.getElementById("emojiPicker");
    if (!currentEmojisSpan || !pageInput || !picker) return;

    const emojiPickerText = "🙂 😐 😞 😭 💢 😂 😢 😡 🤔 🔥 ❄️ 🧠 🖤 ✨ ❤️ 🎯 🌫️ ☕️";
    const emojiList = emojiPickerText.trim().split(/\s+/).filter(e => e.length);

    function updateEmojiDisplay() {
        if (!editingBook || !Array.isArray(editingBook.emojis) || editingBook.emojis.length === 0) {
            currentEmojisSpan.innerHTML = "None";
            return;
        }
        currentEmojisSpan.innerHTML = editingBook.emojis.map((e, i) =>
            `<span style="margin:0 6px; cursor:pointer; border-radius:4px; padding:2px 6px; background:transparent; display:inline-block; user-select:none;" data-index="${i}" title="Click to remove">
                ${e.emoji} ${e.page ? `<small>(p.${e.page})</small>` : ''}
            </span>`
        ).join("");
    }

    // Expose for openEditModal to call after editingBook is set
    window.__updateEmojiDisplay = updateEmojiDisplay;

    // Left-click to remove emoji
    currentEmojisSpan.onclick = (ev) => {
        const span = ev.target.closest("span[data-index]");
        if (!span || !editingBook) return;
        const i = Number(span.dataset.index);
        if (!Number.isFinite(i)) return;
        editingBook.emojis.splice(i, 1);
        pageInput.value = "";
        updateEmojiDisplay();
    };

    // Picker click to add emoji (use pageInput value if present)
    picker.innerHTML = emojiList.map(e => `<span style="margin:0 6px; cursor:pointer;">${e}</span>`).join("");
    picker.onclick = (ev) => {
        const span = ev.target.closest("span");
        if (!span || !editingBook) return;
        const emoji = span.textContent.trim();
        if (!emojiList.includes(emoji)) return;
        const pageVal = pageInput.value.trim();
        const page = pageVal ? Number(pageVal) : null;
        editingBook.emojis = editingBook.emojis || [];
        editingBook.emojis.push({ emoji, page });
        pageInput.value = "";
        updateEmojiDisplay();
    };
})();

// saveEdit (add emojis save)
document.getElementById("saveEdit").addEventListener("click", () => {
    const now = Date.now();
    const daStr = document.getElementById("editDateAdded").value;
    const dateAdded = daStr ? new Date(daStr).getTime() : (editingBook.dateAdded || now);

    const data = {
        title: document.getElementById("editTitle").value.trim(),
        author: document.getElementById("editAuthor").value.trim(),
        series: document.getElementById("editSeries").value.trim(),
        seriesNumber: document.getElementById("editSeriesNumber").value ? Number(document.getElementById("editSeriesNumber").value) : null,
        language: document.getElementById("editLanguage").value.trim() || null,
        country: document.getElementById("editCountry").value.trim() || null,
        genre: document.getElementById("editGenre").value.trim() || null,
        tags: document.getElementById("editTags").value.split(",").map(t => t.trim()).filter(Boolean),
        shelves: document.getElementById("editShelves").value.split(",").map(s => s.trim()).filter(Boolean),
        exclusiveShelf: document.getElementById("editExclusiveShelf").value,
        pages: Number(document.getElementById("editPages").value) || 0,
        year: Number(document.getElementById("editYear").value) || null,
        rating: Number(document.getElementById("editRating").value) || 0,
        notes: document.getElementById("editNotes").value.trim(),
        coverUrl: document.getElementById("editCoverUrl").value.trim() || null,
        reads: editingBook.reads.map(r => ({ started: r.started, finished: r.finished })),
        emojis: editingBook.emojis || [],
        quotes: editingBook.quotes.map(q => ({ 
    text: q.text.trim(), 
    page: q.page, 
    date: q.date, 
    favorite: !!q.favorite 
})).filter(q => q.text.length > 0),
        dateAdded: dateAdded
    };
    
const collapsed = [];
    document.querySelectorAll(".edit-section").forEach((sec, idx) => {
        if (sec.classList.contains("collapsed")) collapsed.push(idx);
    });
    localStorage.setItem("reading_edit_collapsed_sections", JSON.stringify(collapsed));
    if (data.exclusiveShelf === "currently-reading") {
        if (data.reads.length === 0 || data.reads[data.reads.length - 1].finished !== null) {
            data.reads.push({ started: now, finished: null });
        }
    } else if (data.exclusiveShelf !== "read") {
        data.reads = data.reads.filter(r => r.finished !== null);
    }

    let savedBook;
    if (editingBook?.importOrder) {
        const index = books.findIndex(b => b.importOrder === editingBook.importOrder);
        if (index !== -1) {
            books[index] = { ...books[index], ...data };
            savedBook = books[index];
        }
    } else {
        data.importOrder = nextImportOrder++;
        books.unshift(data);
        savedBook = data;
    }

    const bookId = savedBook.importOrder;
    const isFav = document.getElementById("editFavourite").checked;
    if (isFav) {
        if (!profile.favourites.includes(bookId)) profile.favourites.push(bookId);
    } else {
        profile.favourites = profile.favourites.filter(id => id !== bookId);
    }
    const isFavSeries = document.getElementById("editFavouriteSeries").checked;
    if (isFavSeries && data.series && !profile.favouriteSeries.includes(data.series)) {
        profile.favouriteSeries.push(data.series);
    } else if (!isFavSeries && data.series) {
        profile.favouriteSeries = profile.favouriteSeries.filter(s => s !== data.series);
    }

    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    saveBooksToLocal();
    renderAll();
    closeEditModal();
});

document.getElementById("removeBook").addEventListener("click", () => {
    if (!editingBook || !confirm("Really remove this book?")) return;
    profile.favourites = profile.favourites.filter(id => id !== editingBook.importOrder);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    books = books.filter(b => b !== editingBook);
    saveBooksToLocal();
    renderAll();
    closeEditModal();
});

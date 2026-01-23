function getQuotesSortMode() {
    return localStorage.getItem('quotesSortMode') || 'newest';
}

function setQuotesSortMode(mode) {
    localStorage.setItem('quotesSortMode', mode);
}

function assignInitialCustomOrders(allQuotes) {
    // Sort newest first → assign 0, 1, 2, ...
    const sortedByDate = [...allQuotes].sort((a, b) => (b.date || 0) - (a.date || 0));
    sortedByDate.forEach((q, index) => {
        q.originalQuote.customOrder = index;
    });
}

function getSortedQuotes(allQuotes) {
    const mode = getQuotesSortMode();
    let sorted = [...allQuotes];

    if (mode === 'custom') {
        // Initialize if needed
        if (sorted.some(q => q.originalQuote.customOrder === undefined)) {
            assignInitialCustomOrders(sorted);
        }
        sorted.sort((a, b) => (a.originalQuote.customOrder ?? 999999) - (b.originalQuote.customOrder ?? 999999));
    } else if (mode === 'newest') {
        sorted.sort((a, b) => (b.date || 0) - (a.date || 0));
    } else if (mode === 'oldest') {
        sorted.sort((a, b) => (a.date || 0) - (b.date || 0));
    } else if (mode === 'title') {
        sorted.sort((a, b) => a.book.title.localeCompare(b.book.title));
    } else if (mode === 'author') {
        sorted.sort((a, b) => (a.book.author || '').localeCompare(b.book.author || ''));
    } else if (mode === 'page') {
        sorted.sort((a, b) => (a.page || 999999) - (b.page || 999999));
    } else if (mode === 'favorite') {
        sorted.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
    }

    return sorted;
}

function renderQuotes() {
    const container = document.getElementById("quotesContainer");
    if (!container) return;

    container.innerHTML = "<p>Loading quotes...</p>";

    // Collect all quotes with reference to original quote object
    const allQuotes = [];
    books.forEach(book => {
        (book.quotes || []).forEach(quote => {
            if (quote.text?.trim()) {
                if (quote.id === undefined) {
                    quote.id = Date.now() + Math.random().toString(36).slice(2); // unique ID if missing
                }
                allQuotes.push({ ...quote, book, originalQuote: quote }); // keep ref to original
            }
        });
    });

    if (allQuotes.length === 0) {
        container.innerHTML = "<p style='color:#aaa; text-align:center; padding:40px;'>No quotes added yet. Edit some books to add memorable passages!</p>";
        return;
    }

    // Populate book filter (unchanged)
    const bookFilter = document.getElementById("quoteBookFilter");
    if (bookFilter) {
        const currentValue = bookFilter.value;
        bookFilter.innerHTML = '<option value="all">All books with quotes</option>';
        const bookMap = new Map();
        allQuotes.forEach(q => {
            if (!bookMap.has(q.book.importOrder)) bookMap.set(q.book.importOrder, q.book);
        });
        const sortedBooks = Array.from(bookMap.values()).sort((a, b) => a.title.localeCompare(b.title));
        sortedBooks.forEach(book => {
            const opt = document.createElement("option");
            opt.value = book.importOrder;
            opt.textContent = `${book.title} (${book.quotes.length} quote${book.quotes.length === 1 ? '' : 's'})`;
            bookFilter.appendChild(opt);
        });
        bookFilter.value = currentValue && bookFilter.querySelector(`option[value="${currentValue}"]`) ? currentValue : "all";
    }

    // Render function
    function renderFilteredQuotes() {
        const selectedBookId = bookFilter?.value || "all";
        const searchText = (document.getElementById("quoteSearchInput")?.value || "").toLowerCase().trim();
        const onlyFavorites = document.getElementById("quoteFavoritesOnly")?.checked || false;

        let filtered = getSortedQuotes(allQuotes);

        if (selectedBookId !== "all") {
            filtered = filtered.filter(q => q.book.importOrder == selectedBookId);
        }
        if (onlyFavorites) {
            filtered = filtered.filter(q => q.favorite);
        }
        if (searchText) {
            filtered = filtered.filter(q => {
                const quoteMatch = q.text.toLowerCase().includes(searchText);
                const titleMatch = q.book.title.toLowerCase().includes(searchText);
                const authorMatch = (q.book.author || "").toLowerCase().includes(searchText);
                return quoteMatch || titleMatch || authorMatch;
            });
        }

        if (filtered.length === 0) {
            container.innerHTML = "<p style='color:#aaa; text-align:center; padding:40px;'>No matching quotes found.</p>";
            return;
        }

        let html = "";
        filtered.forEach(q => {
            const dateStr = q.date ? new Date(q.date).toLocaleDateString() : "";
            const pageStr = q.page ? `p.${q.page}` : "";
            const favStar = q.favorite ? "★" : "☆";

            html += `
                <div class="quote-item" data-quote-id="${q.id}" draggable="${getQuotesSortMode() === 'custom' ? 'true' : 'false'}" style="margin:16px 0; padding:12px; background:#222; border-radius:6px; border-left:4px solid #555;">
                    <blockquote style="margin:0 0 8px; font-style:italic; white-space:pre-wrap;">"${q.text}"</blockquote>
                    <div style="color:#aaa; font-size:0.9em; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                        <div>
                            — <strong>${q.book.title}</strong> by ${q.book.author || "Unknown"}
                            ${pageStr ? ` (${pageStr})` : ""}
                            ${dateStr ? ` • ${dateStr}` : ""}
                            <span style="margin-left:8px; cursor:pointer; font-size:1.2em;" class="toggle-favorite" data-fav="${q.favorite ? 'true' : 'false'}">${favStar}</span>
                        </div>
                        <button class="edit-quote-btn" style="padding:4px 10px; font-size:0.85em;">Edit</button>
                    </div>
                    <!-- Inline edit form -->
                    <div class="edit-quote-form" style="display:none; margin-top:12px; padding:12px; background:#1a1a1a; border-radius:6px;">
                        <textarea class="edit-quote-text" style="width:100%; height:80px; resize:vertical;">${q.text}</textarea>
                        <div style="margin:8px 0; display:flex; gap:12px; flex-wrap:wrap;">
                            <label>Page: <input type="number" class="edit-quote-page" value="${q.page ?? ''}" min="1" style="width:80px;"></label>
                            <label>Date: <input type="date" class="edit-quote-date" value="${q.date ? new Date(q.date).toISOString().split('T')[0] : ''}"></label>
                            <label>Favorite: <input type="checkbox" class="edit-quote-fav" ${q.favorite ? 'checked' : ''}></label>
                        </div>
                        <div style="text-align:right; margin-top:8px;">
                            <button class="remove-quote-btn" style="padding:6px 12px; background:#c0392b; color:white; border:none; border-radius:4px; margin-right:8px;">Remove</button>
                            <button class="save-quote-btn" style="padding:6px 12px;">Save</button>
                            <button class="cancel-quote-btn" style="padding:6px 12px; margin-left:8px;">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;

        // Event listeners
        container.querySelectorAll(".edit-quote-btn").forEach(btn => {
            btn.addEventListener("click", e => {
                const item = e.target.closest(".quote-item");
                const form = item.querySelector(".edit-quote-form");
                form.style.display = form.style.display === "none" ? "block" : "none";
            });
        });
        container.querySelectorAll(".save-quote-btn").forEach(btn => {
            btn.addEventListener("click", e => {
                const item = e.target.closest(".quote-item");
                const id = item.dataset.quoteId;
                const originalQuote = books.flatMap(b => b.quotes || []).find(q => q.id === id);
                if (!originalQuote) return;

                originalQuote.text = item.querySelector(".edit-quote-text").value.trim();
                originalQuote.page = Number(item.querySelector(".edit-quote-page").value) || null;
                const dateVal = item.querySelector(".edit-quote-date").value;
                originalQuote.date = dateVal ? new Date(dateVal).getTime() : null;
                originalQuote.favorite = item.querySelector(".edit-quote-fav").checked;

                saveBooksToLocal();
                renderQuotes();
            });
        });
        container.querySelectorAll(".cancel-quote-btn").forEach(btn => {
            btn.addEventListener("click", e => {
                const form = e.target.closest(".edit-quote-form");
                form.style.display = "none";
            });
        });
        // Remove
        container.querySelectorAll(".remove-quote-btn").forEach(btn => {
            btn.addEventListener("click", e => {
                if (!confirm("Are you sure you want to remove this quote? This cannot be undone.")) return;
                const item = e.target.closest(".quote-item");
                const id = item.dataset.quoteId;
                books.forEach(book => {
                    book.quotes = book.quotes?.filter(q => q.id !== id) || [];
                });
                saveBooksToLocal();
                renderQuotes();
            });
        });
        // Favorite toggle
        container.querySelectorAll(".toggle-favorite").forEach(star => {
            star.addEventListener("click", e => {
                const item = e.target.closest(".quote-item");
                const id = item.dataset.quoteId;
                const originalQuote = books.flatMap(b => b.quotes || []).find(q => q.id === id);
                if (!originalQuote) return;

                originalQuote.favorite = !originalQuote.favorite;
                saveBooksToLocal();
                renderQuotes();
            });
        });

        // Drag if custom
        if (getQuotesSortMode() === 'custom') {
            attachDragAndDrop(container);
        }
    }

    // Initial render
    renderFilteredQuotes();

    // Events
    document.getElementById("quoteBookFilter")?.addEventListener("change", renderFilteredQuotes);
    document.getElementById("quoteSearchInput")?.addEventListener("input", debounce(renderFilteredQuotes, 300));
    document.getElementById("quoteFavoritesOnly")?.addEventListener("change", renderFilteredQuotes);
    const sortSelect = document.getElementById("quotesSortSelect");
    if (sortSelect) {
        sortSelect.value = getQuotesSortMode();
        sortSelect.addEventListener("change", e => {
            setQuotesSortMode(e.target.value);
            renderFilteredQuotes();
        });
    }
}

function attachDragAndDrop(container) {
    let dragged = null;
    const handleDragOver = debounce(e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        const dragging = container.querySelector('.quote-item.dragging');
        if (!dragging) return;
        if (afterElement == null) {
            container.appendChild(dragging);
        } else {
            container.insertBefore(dragging, afterElement);
        }
    }, 50); // Throttle to 50ms for smoothness

    container.addEventListener('dragstart', e => {
        dragged = e.target.closest('.quote-item');
        if (!dragged) return;
        dragged.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
    });

    container.addEventListener('dragend', () => {
        const dragging = container.querySelector('.dragging');
        if (dragging) dragging.classList.remove('dragging');
        dragged = null;
        saveCustomOrder(container);
    });

    container.addEventListener('dragover', handleDragOver);

    container.addEventListener('drop', e => e.preventDefault());
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.quote-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        }
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function saveCustomOrder(container) {
    const currentItems = [...container.querySelectorAll('.quote-item')];
    currentItems.forEach((item, newIndex) => {
        const id = item.dataset.quoteId;
        const originalQuote = books.flatMap(b => b.quotes || []).find(q => q.id === id);
        if (originalQuote) {
            originalQuote.customOrder = newIndex;
        }
    });
    saveBooksToLocal();
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

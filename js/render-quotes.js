function renderQuotes() {
    const container = document.getElementById("quotesContainer");
    if (!container) return;
    
    container.innerHTML = "<p>Loading quotes...</p>";

    // Collect all quotes with book reference
    const allQuotes = [];
    books.forEach(book => {
        (book.quotes || []).forEach(quote => {
            if (quote.text?.trim()) {
                allQuotes.push({ ...quote, book });
            }
        });
    });

    if (allQuotes.length === 0) {
        container.innerHTML = "<p style='color:#aaa; text-align:center; padding:40px;'>No quotes added yet. Edit some books to add memorable passages!</p>";
        return;
    }

    // Populate book filter dropdown (only books with quotes)
    const bookFilter = document.getElementById("quoteBookFilter");
    if (bookFilter) {
        const currentValue = bookFilter.value;
        bookFilter.innerHTML = '<option value="all">All books with quotes</option>';
        
        const bookMap = new Map();
        allQuotes.forEach(q => {
            if (!bookMap.has(q.book.importOrder)) {
                bookMap.set(q.book.importOrder, q.book);
            }
        });
        
        const sortedBooks = Array.from(bookMap.values()).sort((a, b) => 
            a.title.localeCompare(b.title)
        );
        
        sortedBooks.forEach(book => {
            const opt = document.createElement("option");
            opt.value = book.importOrder;
            opt.textContent = `${book.title} (${book.quotes.length} quote${book.quotes.length === 1 ? '' : 's'})`;
            bookFilter.appendChild(opt);
        });

        if (currentValue && bookFilter.querySelector(`option[value="${currentValue}"]`)) {
            bookFilter.value = currentValue;
        } else {
            bookFilter.value = "all";
        }
    }

    // Render function (called on filter/search change)
    function renderFilteredQuotes() {
        const selectedBookId = bookFilter?.value || "all";
        const searchText = (document.getElementById("quoteSearchInput")?.value || "").toLowerCase().trim();

        let filtered = allQuotes;

        // Book filter
        if (selectedBookId !== "all") {
            filtered = filtered.filter(q => q.book.importOrder == selectedBookId);
        }

        // Text search (quote OR book title OR author)
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
                <div class="quote-item" data-quote-index="${allQuotes.indexOf(q)}" style="margin:16px 0; padding:12px; background:#222; border-radius:6px; border-left:4px solid #555;">
                    <blockquote style="margin:0 0 8px; font-style:italic; white-space:pre-wrap;">"${q.text}"</blockquote>
                    <div style="color:#aaa; font-size:0.9em; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                        <div>
                            — <strong>${q.book.title}</strong> by ${q.book.author || "Unknown"}
                            ${pageStr ? ` (${pageStr})` : ""}
                            ${dateStr ? ` • ${dateStr}` : ""}
                            <span style="margin-left:8px; cursor:pointer;" class="toggle-favorite" data-fav="${q.favorite ? 'true' : 'false'}">${favStar}</span>
                        </div>
                        <button class="edit-quote-btn" style="padding:4px 10px; font-size:0.85em;">Edit</button>
                    </div>

                    <!-- Inline edit form (hidden by default) -->
                    <div class="edit-quote-form" style="display:none; margin-top:12px; padding:12px; background:#1a1a1a; border-radius:6px;">
                        <textarea class="edit-quote-text" style="width:100%; height:80px; resize:vertical;">${q.text}</textarea>
                        <div style="margin:8px 0; display:flex; gap:12px; flex-wrap:wrap;">
                            <label>Page: <input type="number" class="edit-quote-page" value="${q.page ?? ''}" min="1" style="width:80px;"></label>
                            <label>Date: <input type="date" class="edit-quote-date" value="${q.date ? new Date(q.date).toISOString().split('T')[0] : ''}"></label>
                            <label>Favorite: <input type="checkbox" class="edit-quote-fav" ${q.favorite ? 'checked' : ''}></label>
                        </div>
                        <div style="text-align:right;">
                            <button class="save-quote-btn" style="padding:6px 12px;">Save</button>
                            <button class="cancel-quote-btn" style="padding:6px 12px; margin-left:8px;">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Attach event listeners
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
                const idx = parseInt(item.dataset.quoteIndex);
                const q = allQuotes[idx];
                if (!q) return;

                q.text = item.querySelector(".edit-quote-text").value.trim();
                q.page = Number(item.querySelector(".edit-quote-page").value) || null;
                const dateVal = item.querySelector(".edit-quote-date").value;
                q.date = dateVal ? new Date(dateVal).getTime() : null;
                q.favorite = item.querySelector(".edit-quote-fav").checked;

                // Save to book
                const book = q.book;
                const quoteIdx = book.quotes.findIndex(quote => 
                    quote.text === q.text && quote.page === q.page && quote.date === q.date
                ); // rough match - improve if needed
                if (quoteIdx !== -1) {
                    book.quotes[quoteIdx] = { ...q }; // update
                }

                saveBooksToLocal();
                renderQuotes(); // refresh
            });
        });

        container.querySelectorAll(".cancel-quote-btn").forEach(btn => {
            btn.addEventListener("click", e => {
                const form = e.target.closest(".edit-quote-form");
                form.style.display = "none";
            });
        });

        // Favorite toggle (click star)
        container.querySelectorAll(".toggle-favorite").forEach(star => {
            star.addEventListener("click", e => {
                const item = e.target.closest(".quote-item");
                const idx = parseInt(item.dataset.quoteIndex);
                const q = allQuotes[idx];
                q.favorite = !q.favorite;

                const book = q.book;
                const quoteIdx = book.quotes.findIndex(quote => quote.text === q.text);
                if (quoteIdx !== -1) {
                    book.quotes[quoteIdx].favorite = q.favorite;
                }

                saveBooksToLocal();
                renderQuotes();
            });
        });
    }

    // Initial render
    renderFilteredQuotes();

    // Event listeners for filters
    document.getElementById("quoteBookFilter")?.addEventListener("change", renderFilteredQuotes);
    document.getElementById("quoteSearchInput")?.addEventListener("input", debounce(renderFilteredQuotes, 300));
}

// Simple debounce helper (add to utils.js if not present, or inline here)
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

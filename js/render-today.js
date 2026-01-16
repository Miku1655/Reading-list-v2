function renderToday() {
    const container = document.getElementById("todayContainer");
    if (!container) return;

    const currentReading = books.filter(b => b.exclusiveShelf === "currently-reading");
    
    if (currentReading.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:80px 20px; color:#aaa;">
                <h2 style="color:#eee;">No books in progress yet</h2>
                <p>Add a book to "currently-reading" on the List tab to start your daily ritual.</p>
                <button onclick="switchTab('list')" style="margin-top:16px; padding:10px 20px;">
                    Go to List
                </button>
            </div>
        `;
        return;
    }

    // Get last selected (or first)
    let selectedId = Number(localStorage.getItem("todaySelectedBookId") || currentReading[0].importOrder);
    let selectedBook = currentReading.find(b => b.importOrder === selectedId);
    if (!selectedBook) {
        selectedBook = currentReading[0];
        selectedId = selectedBook.importOrder;
        localStorage.setItem("todaySelectedBookId", selectedId);
    }

    const today = getTodayDateStr();
    const todayNote = getDailyNoteForToday(selectedId) || { date: today, bookId: selectedId, note: "", pagesToday: 0, sliderEnd: 0 };
    
    // Current page from book's read entry
    const currentRead = selectedBook.reads.find(r => r.finished === null);
    const currentPage = currentRead?.currentPage || 0;

    // Random favorite quote (reuse logic)
    const favoriteQuotes = [];
    books.forEach(b => {
        if (b.quotes) {
            b.quotes.filter(q => q.favorite && q.text.trim()).forEach(q => {
                favoriteQuotes.push({ ...q, bookTitle: b.title, bookAuthor: b.author });
            });
        }
    });
    const randomQuote = favoriteQuotes.length > 0 ? favoriteQuotes[Math.floor(Math.random() * favoriteQuotes.length)] : null;

    let html = `
        <h2 style="text-align:center; margin-bottom:32px;">Your Reading Today</h2>
        
        <div style="margin-bottom:24px; text-align:center;">
            <label>Select book: 
                <select id="todayBookSelect" style="padding:8px; font-size:1.1em; background:#222; color:#eee; border:1px solid #444;">
                    ${currentReading.map(b => `<option value="${b.importOrder}" ${b.importOrder === selectedId ? 'selected' : ''}>${b.title} by ${b.author || '?'}</option>`).join('')}
                </select>
            </label>
        </div>

        <div class="book-card" style="margin:0 auto 32px; width:300px; padding:16px;">
            ${selectedBook.coverUrl ? `<img src="${selectedBook.coverUrl}" alt="${selectedBook.title}" style="width:100%; height:400px; object-fit:cover; border-radius:8px;">` : '<div class="no-cover" style="height:400px;">No cover</div>'}
            <h3 style="margin:12px 0 4px;">${selectedBook.title}</h3>
            <p style="color:#aaa;">${selectedBook.author || 'Unknown'}</p>
            <p style="margin-top:8px;">Pages: ${currentPage} / ${selectedBook.pages || '?'}</p>
        </div>

        <div style="margin:32px 0; text-align:center;">
            <h3>Progress Today</h3>
            <input type="range" id="todayPageSlider" min="0" max="${selectedBook.pages || 1000}" value="${currentPage}" style="width:80%; max-width:500px; height:12px; margin:16px 0;">
            <div style="font-size:1.6em; font-weight:bold;">${currentPage} pages</div>
        </div>

        <div style="margin:32px 0;">
            <h3>What did you read today?</h3>
            <textarea id="todayNote" placeholder="Thoughts, favorite passage, mood... (short & sweet)" style="width:100%; height:120px; padding:12px; background:#1a1a1a; color:#eee; border:1px solid #444; border-radius:6px; resize:vertical;">${todayNote.note || ''}</textarea>
        </div>

        <div style="display:flex; justify-content:space-between; margin:24px 0; padding:16px; background:#1a1a1a; border:1px solid #333; border-radius:8px;">
            <div>Streak: <strong id="streakDisplay">${calculateStreak()} days</strong></div>
            <div>Pages today: <strong id="pagesTodayDisplay">${todayNote.pagesToday || 0}</strong></div>
        </div>

        ${randomQuote ? `
        <div style="margin-top:40px; padding:20px; background:#111; border-left:4px solid #666; border-radius:4px;">
            <blockquote style="font-style:italic; margin:0 0 12px;">"${randomQuote.text}"</blockquote>
            <p style="text-align:right; color:#aaa;">— ${randomQuote.bookTitle} by ${randomQuote.bookAuthor || '?'}${randomQuote.page ? ` (p.${randomQuote.page})` : ''}</p>
            <button id="refreshTodayQuote" style="margin-top:8px; padding:6px 12px;">New quote</button>
        </div>
        ` : '<p style="text-align:center; color:#666; margin-top:40px;">No favorite quotes yet</p>'}
    `;

    container.innerHTML = html;
}

const DEFAULT_BOOK_HEIGHT = 240;
const MIN_WIDTH = 40; // for books with 0/unknown pages
const FONT_SCALE = 0.12; // fontSize = width * FONT_SCALE, clamped

function getBookByOrder(order) {
    return books.find(b => b.importOrder === order);
}

function calculateShelfWidth() {
    return document.getElementById('bookshelfContainer')?.offsetWidth || 1200;
}

function renderBookshelf() {
    const container = document.getElementById('bookshelfContainer');
    if (!container) return;
    container.innerHTML = '';

    let allBookIds = new Set(books.map(b => b.importOrder));
    let usedIds = new Set();
    bookshelfShelves.forEach(shelf => shelf.forEach(id => usedIds.add(id)));

    // Append any unarranged books to last shelf or new one
    let unarranged = books.filter(b => !usedIds.has(b.importOrder)).map(b => b.importOrder);
    if (unarranged.length > 0) {
        if (bookshelfShelves.length === 0) {
            bookshelfShelves.push(unarranged);
        } else {
            bookshelfShelves[bookshelfShelves.length - 1].push(...unarranged);
        }
        saveBookshelfToLocal();
    }

    const statsEl = document.getElementById('bookshelfStats');
    statsEl.textContent = `${books.length} books • ${bookshelfShelves.length} shelf${bookshelfShelves.length === 1 ? '' : 's'}`;

    bookshelfShelves.forEach((shelfIds, shelfIndex) => {
        const shelfDiv = document.createElement('div');
        shelfDiv.className = 'bookshelf-shelf';
        shelfDiv.dataset.shelfIndex = shelfIndex;
        shelfDiv.style.marginBottom = '40px';
        shelfDiv.style.position = 'relative';

        // Shelf background (simple wood look)
        shelfDiv.style.background = 'linear-gradient(to bottom, #8B5A2B, #A0522D)';
        shelfDiv.style.height = '60px';
        shelfDiv.style.borderRadius = '8px 8px 0 0';
        shelfDiv.style.boxShadow = '0 10px 20px rgba(0,0,0,0.6)';

        const booksRow = document.createElement('div');
        booksRow.className = 'books-row';
        booksRow.style.display = 'flex';
        booksRow.style.alignItems = 'flex-end';
        booksRow.style.minHeight = '200px';
        booksRow.style.position = 'relative';
        booksRow.style.top = '-240px'; // overlap shelf
        booksRow.style.padding = '0 10px';

        let totalPages = 0;
        let maxHeight = DEFAULT_BOOK_HEIGHT;

        shelfIds.forEach(order => {
            const book = getBookByOrder(order);
            if (!book) return;
            totalPages += book.pages || 0;

            const spine = document.createElement('div');
            spine.className = 'book-spine';
            spine.draggable = true;
            spine.dataset.order = order;
            spine.dataset.shelf = shelfIndex;

            let pages = book.pages || 100; // default for calc
            let width = Math.max(MIN_WIDTH, pages * 0.08); // base scale ~0.08px per page, will adjust

            let height = book.customHeight || DEFAULT_BOOK_HEIGHT;
            if (book.customHeight) maxHeight = Math.max(maxHeight, height);

            spine.style.width = width + 'px';
            spine.style.height = height + 'px';
            spine.style.background = book.spineColor || '#333'; // default dark
            spine.style.border = '1px solid #111';
            spine.style.borderRadius = '4px 4px 0 0';
            spine.style.boxShadow = '2px 4px 8px rgba(0,0,0,0.5)';
            spine.style.position = 'relative';
            spine.style.overflow = 'hidden';
            spine.style.cursor = 'grab';

            // Vertical title
            const titleEl = document.createElement('div');
            titleEl.textContent = book.title || 'Untitled';
            titleEl.style.writingMode = 'vertical-rl';
            titleEl.style.textOrientation = 'mixed';
            titleEl.style.position = 'absolute';
            titleEl.style.top = '8px';
            titleEl.style.left = '50%';
            titleEl.style.transform = 'translateX(-50%)';
            titleEl.style.fontSize = 'clamp(10px, ' + (width * FONT_SCALE) + 'px, 18px)';
            titleEl.style.fontWeight = 'bold';
            titleEl.style.color = '#eee';
            titleEl.style.textShadow = '1px 1px 2px #000';
            titleEl.style.whiteSpace = 'nowrap';
            titleEl.style.overflow = 'hidden';
            titleEl.style.textOverflow = 'ellipsis';
            titleEl.style.height = '80%';
            titleEl.style.display = 'flex';
            titleEl.style.alignItems = 'center';
            spine.appendChild(titleEl);

            // Author if wide enough
            if (width > 80) {
                const authorEl = document.createElement('div');
                authorEl.textContent = book.author || '';
                authorEl.style.writingMode = 'vertical-rl';
                authorEl.style.textOrientation = 'mixed';
                authorEl.style.fontSize = 'clamp(9px, ' + (width * 0.09) + 'px, 14px)';
                authorEl.style.color = '#ccc';
                authorEl.style.position = 'absolute';
                authorEl.style.bottom = '8px';
                authorEl.style.left = '50%';
                authorEl.style.transform = 'translateX(-50%)';
                authorEl.style.whiteSpace = 'nowrap';
                authorEl.style.overflow = 'hidden';
                authorEl.style.textOverflow = 'ellipsis';
                spine.appendChild(authorEl);
            }

            // Hover tooltip
            spine.addEventListener('mouseenter', e => {
                showNotePopup(notePopup, `${book.title} — ${book.author}\n${book.pages || '?'} pages • ${book.exclusiveShelf}`);
            });
            spine.addEventListener('mouseleave', () => hideNotePopup(notePopup));

            // Click to show details
            spine.addEventListener('click', () => showBookDetails(book));

            booksRow.appendChild(spine);
        });

        // Adjust widths
        const visualWidth = calculateShelfWidth() - 40; // padding
        const softMax = bookshelfSettings.maxPagesPerShelf;
        const hardMax = softMax * 1.1;
        let scale = 1;

        if (totalPages > hardMax) {
            scale = visualWidth / (totalPages * 0.08); // force fit
        } else if (totalPages > softMax) {
            scale = visualWidth / (totalPages * 0.08); // compress
        } else if (bookshelfSettings.justify) {
            scale = visualWidth / (totalPages * 0.08); // spread
        } else {
            scale = 1; // natural, gap on right
        }

        // Apply scale to all spines in row
        Array.from(booksRow.children).forEach(sp => {
            let baseW = parseFloat(sp.style.width);
            sp.style.width = (baseW * scale) + 'px';
            sp.style.height = (parseFloat(sp.style.height) * (scale > 1 ? 1 : scale)) + 'px'; // don't stretch height too much
        });

        shelfDiv.style.height = (maxHeight + 80) + 'px'; // dynamic shelf height

        shelfDiv.appendChild(booksRow);
        container.appendChild(shelfDiv);

        // Make row droppable
        makeDroppable(booksRow, shelfIndex);
    });

    // Add "new shelf" drop zone at bottom
    const newShelfZone = document.createElement('div');
    newShelfZone.style.height = '100px';
    newShelfZone.style.border = '2px dashed #555';
    newShelfZone.style.margin = '20px 0';
    newShelfZone.style.display = 'flex';
    newShelfZone.style.alignItems = 'center';
    newShelfZone.style.justifyContent = 'center';
    newShelfZone.style.color = '#777';
    newShelfZone.textContent = 'Drop here to create new shelf';
    newShelfZone.addEventListener('dragover', e => e.preventDefault());
    newShelfZone.addEventListener('drop', e => {
        e.preventDefault();
        const order = Number(e.dataTransfer.getData('text/plain'));
        if (!order) return;
        bookshelfShelves.push([order]);
        saveBookshelfToLocal();
        renderBookshelf();
    });
    container.appendChild(newShelfZone);
}

function makeDroppable(row, shelfIdx) {
    row.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(row, e.clientX);
        const draggable = document.querySelector('.dragging');
        if (afterElement == null) {
            row.appendChild(draggable);
        } else {
            row.insertBefore(draggable, afterElement);
        }
    });

    row.addEventListener('drop', e => {
        e.preventDefault();
        const order = Number(e.dataTransfer.getData('text/plain'));
        if (!order) return;

        // Remove from old shelf
        bookshelfShelves.forEach((shelf, i) => {
            const pos = shelf.indexOf(order);
            if (pos !== -1) shelf.splice(pos, 1);
        });

        // Add to this shelf at position
        const afterEl = getDragAfterElement(row, e.clientX);
        let insertIdx = 0;
        if (afterEl) {
            insertIdx = Array.from(row.children).indexOf(afterEl);
        } else {
            insertIdx = row.children.length;
        }

        bookshelfShelves[shelfIdx].splice(insertIdx, 0, order);
        saveBookshelfToLocal();
        renderBookshelf(); // full re-render for simplicity
    });
}

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.book-spine:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function showBookDetails(book) {
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0,0,0,0.8)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '2000';

    const card = document.createElement('div');
    card.style.background = '#222';
    card.style.padding = '24px';
    card.style.borderRadius = '12px';
    card.style.maxWidth = '500px';
    card.style.width = '90%';
    card.style.maxHeight = '80vh';
    card.style.overflowY = 'auto';
    card.style.color = '#eee';

    card.innerHTML = `
        <h3>${book.title}</h3>
        <p><strong>Author:</strong> ${book.author}</p>
        <p><strong>Pages:</strong> ${book.pages || 'Unknown'}</p>
        <p><strong>Status:</strong> ${book.exclusiveShelf}</p>
        <p><strong>Rating:</strong> ${book.rating || 0}/5</p>
        <p><strong>Reads:</strong> ${book.reads?.length || 0}</p>
        <p><strong>Quotes:</strong> ${book.quotes?.length || 0}</p>
        <p><strong>Notes:</strong> ${book.notes ? book.notes.substring(0, 200) + '...' : 'None'}</p>
        ${bookshelfSettings.customEditEnabled ? `
            <hr style="border-color:#444">
            <label>Custom height (80-500px): <input type="number" id="editHeight" min="80" max="500" value="${book.customHeight || ''}"></label><br><br>
            <label>Spine color: <input type="color" id="editSpineColor" value="${book.spineColor || '#333333'}"></label>
            <button id="saveCustom" style="margin-top:12px;">Save Customizations</button>
        ` : ''}
        <button id="closeDetails" style="margin-top:16px; float:right;">Close</button>
    `;

    modal.appendChild(card);
    document.body.appendChild(modal);

    modal.addEventListener('click', e => {
        if (e.target === modal) document.body.removeChild(modal);
    });

    document.getElementById('closeDetails')?.addEventListener('click', () => document.body.removeChild(modal));

    if (bookshelfSettings.customEditEnabled) {
        document.getElementById('saveCustom')?.addEventListener('click', () => {
            const h = Number(document.getElementById('editHeight').value);
            book.customHeight = (h >= 80 && h <= 500) ? h : null;
            book.spineColor = document.getElementById('editSpineColor').value;
            saveBooksToLocal();
            saveBookshelfToLocal();
            document.body.removeChild(modal);
            renderBookshelf();
        });
    }
}

function autoArrangeBookshelf() {
    if (!confirm("Auto-arrange will replace current layout. Continue?\n(Sorts by: country → author → series → series# → title)")) return;

    // Multi-key sort
    const sortedBooks = [...books].sort((a, b) => {
        const countryA = (a.country || '').toLowerCase();
        const countryB = (b.country || '').toLowerCase();
        if (countryA !== countryB) return countryA.localeCompare(countryB);

        const authorA = (a.author || '').toLowerCase();
        const authorB = (b.author || '').toLowerCase();
        if (authorA !== authorB) return authorA.localeCompare(authorB);

        const seriesA = (a.series || '').toLowerCase();
        const seriesB = (b.series || '').toLowerCase();
        if (seriesA !== seriesB) return seriesA.localeCompare(seriesB);

        const numA = a.seriesNumber || 9999;
        const numB = b.seriesNumber || 9999;
        if (numA !== numB) return numA - numB;

        return (a.title || '').localeCompare(b.title || '');
    });

    bookshelfShelves = [];
    let currentShelf = [];
    let currentPages = 0;
    const softMax = bookshelfSettings.maxPagesPerShelf;

    sortedBooks.forEach(book => {
        const pages = book.pages || 0;
        if (currentPages + pages > softMax * 1.05 && currentShelf.length > 0) { // slight overfill allowed
            bookshelfShelves.push(currentShelf.map(b => b.importOrder));
            currentShelf = [];
            currentPages = 0;
        }
        currentShelf.push(book);
        currentPages += pages;
    });
    if (currentShelf.length > 0) bookshelfShelves.push(currentShelf.map(b => b.importOrder));

    saveBookshelfToLocal();
    renderBookshelf();
}

// Init events (called from ui-events)
function initBookshelfEvents() {
    document.getElementById('autoArrangeBookshelf')?.addEventListener('click', autoArrangeBookshelf);

    document.getElementById('resetBookshelfArrangement')?.addEventListener('click', () => {
        if (!confirm("Reset arrangement? Books will be ungrouped but still visible.")) return;
        bookshelfShelves = [];
        saveBookshelfToLocal();
        renderBookshelf();
    });

    document.getElementById('bookshelfJustify')?.addEventListener('change', e => {
        bookshelfSettings.justify = e.target.checked;
        saveBookshelfToLocal();
        renderBookshelf();
    });

    document.getElementById('bookshelfCustomEdit')?.addEventListener('change', e => {
        bookshelfSettings.customEditEnabled = e.target.checked;
        saveBookshelfToLocal();
        // No re-render needed until next open
    });

    // Drag start on spines (delegated)
    document.getElementById('bookshelfContainer')?.addEventListener('dragstart', e => {
        if (e.target.classList.contains('book-spine')) {
            e.target.classList.add('dragging');
            e.dataTransfer.setData('text/plain', e.target.dataset.order);
        }
    });

    document.getElementById('bookshelfContainer')?.addEventListener('dragend', e => {
        if (e.target.classList.contains('book-spine')) {
            e.target.classList.remove('dragging');
        }
    });
}

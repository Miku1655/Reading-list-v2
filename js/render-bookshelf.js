const DEFAULT_BOOK_HEIGHT = 240;
const MIN_WIDTH = 45;
const MAX_WIDTH = 150;
const FONT_SCALE = 0.12;
const BASE_PX_PER_PAGE = 0.1;

function getBookByOrder(order) {
    return books.find(b => b.importOrder === order);
}

function renderBookshelf() {
    const container = document.getElementById('bookshelfContainer');
    if (!container) return;
    container.innerHTML = '';

    // Consolidate unarranged books
    const usedIds = new Set();
    bookshelfShelves.forEach(shelf => shelf.forEach(id => usedIds.add(id)));
    
    const unarranged = books
        .filter(b => !usedIds.has(b.importOrder))
        .map(b => b.importOrder);
    
    if (unarranged.length > 0) {
        if (bookshelfShelves.length === 0) {
            bookshelfShelves.push(unarranged);
        } else {
            bookshelfShelves[bookshelfShelves.length - 1].push(...unarranged);
        }
        saveBookshelfToLocal();
    }

    // Update stats
    const statsEl = document.getElementById('bookshelfStats');
    if (statsEl) {
        statsEl.textContent = `${books.length} books • ${bookshelfShelves.length} shelf${bookshelfShelves.length === 1 ? '' : 's'}`;
    }

    // Render each shelf
    bookshelfShelves.forEach((shelfIds, shelfIndex) => {
        const shelfDiv = createShelfElement(shelfIndex);
        const booksRow = createBooksRow();
        
        const { spines, totalPages, maxHeight } = createBookSpines(shelfIds, shelfIndex);
        spines.forEach(spine => booksRow.appendChild(spine));

        // Apply scaling to fit shelf width
        applyScaling(booksRow, totalPages, container.offsetWidth);

        // Adjust shelf height based on tallest book
        shelfDiv.style.height = (maxHeight + 100) + 'px';
        
        shelfDiv.appendChild(booksRow);
        container.appendChild(shelfDiv);

        // Enable drag and drop
        makeDroppable(booksRow, shelfIndex);
    });

    // Add new shelf zone
    container.appendChild(createNewShelfZone());
}

function createShelfElement(shelfIndex) {
    const shelfDiv = document.createElement('div');
    shelfDiv.className = 'bookshelf-shelf';
    shelfDiv.dataset.shelfIndex = shelfIndex;
    return shelfDiv;
}

function createBooksRow() {
    const booksRow = document.createElement('div');
    booksRow.className = 'books-row';
    return booksRow;
}

function createBookSpines(shelfIds, shelfIndex) {
    const spines = [];
    let totalPages = 0;
    let maxHeight = DEFAULT_BOOK_HEIGHT;

    shelfIds.forEach(order => {
        const book = getBookByOrder(order);
        if (!book) return;

        const pages = book.pages || 100;
        totalPages += pages;

        const spine = createBookSpine(book, shelfIndex);
        const height = book.customHeight || DEFAULT_BOOK_HEIGHT;
        maxHeight = Math.max(maxHeight, height);

        spines.push(spine);
    });

    return { spines, totalPages, maxHeight };
}

function createBookSpine(book, shelfIndex) {
    const spine = document.createElement('div');
    spine.className = 'book-spine';
    spine.draggable = true;
    spine.dataset.order = book.importOrder;
    spine.dataset.shelf = shelfIndex;

    // Calculate initial width based on pages
    const pages = book.pages || 100;
    const baseWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, pages * BASE_PX_PER_PAGE));
    const height = book.customHeight || DEFAULT_BOOK_HEIGHT;

    // Store base width for scaling
    spine.dataset.baseWidth = baseWidth;

    // Apply styles
    Object.assign(spine.style, {
        width: baseWidth + 'px',
        height: height + 'px',
        background: book.spineColor || generateSpineColor(book),
        border: '1px solid rgba(0,0,0,0.3)',
        borderRadius: '4px 4px 0 0',
        boxShadow: '2px 4px 8px rgba(0,0,0,0.5), inset -1px 0 2px rgba(0,0,0,0.2)',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'grab'
    });

    // Add title
    spine.appendChild(createSpineTitle(book.title || 'Untitled', baseWidth));

    // Add author if there's room
    if (baseWidth > 50 && book.author) {
        spine.appendChild(createSpineAuthor(book.author, baseWidth));
    }

    // Add event listeners
    spine.addEventListener('mouseenter', () => {
        showNotePopup(notePopup, formatBookTooltip(book));
    });
    spine.addEventListener('mouseleave', () => hideNotePopup(notePopup));
    spine.addEventListener('click', () => showBookDetails(book));

    return spine;
}

function createSpineTitle(title, width) {
    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.className = 'book-spine-title';
    
    Object.assign(titleEl.style, {
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        position: 'absolute',
        top: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: `clamp(10px, ${width * FONT_SCALE}px, 18px)`,
        fontWeight: 'bold',
        color: '#eee',
        textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        height: '70%',
        display: 'flex',
        alignItems: 'center',
        userSelect: 'none'
    });

    return titleEl;
}

function createSpineAuthor(author, width) {
    const authorEl = document.createElement('div');
    authorEl.textContent = author;
    authorEl.className = 'book-spine-author';
    
    Object.assign(authorEl.style, {
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        fontSize: `clamp(8px, ${width * 0.09}px, 14px)`,
        color: 'rgba(255,255,255,0.7)',
        position: 'absolute',
        bottom: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxHeight: '25%',
        userSelect: 'none'
    });

    return authorEl;
}

function applyScaling(booksRow, totalPages, containerWidth) {
    const usableWidth = containerWidth * 0.95;
    const softMax = bookshelfSettings.maxPagesPerShelf;
    const hardMax = softMax * 1.15;
    
    let scale = 1;
    const naturalWidth = totalPages * BASE_PX_PER_PAGE;

    if (totalPages > hardMax) {
        // Heavy compression for overcrowded shelves
        scale = usableWidth / naturalWidth;
    } else if (totalPages > softMax) {
        // Moderate compression
        scale = Math.min(1, usableWidth / naturalWidth);
    } else if (bookshelfSettings.justify) {
        // Expand to fill width
        scale = usableWidth / naturalWidth;
    } else {
        // Natural size, cap at usable width
        scale = Math.min(1.2, usableWidth / naturalWidth);
    }

    // Apply scaling to each spine
    Array.from(booksRow.children).forEach(spine => {
        const baseWidth = parseFloat(spine.dataset.baseWidth) || 60;
        let newWidth = baseWidth * scale;
        
        // Enforce min/max constraints
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH * 1.5, newWidth));
        
        spine.style.width = newWidth + 'px';

        // Adjust font sizes proportionally
        const title = spine.querySelector('.book-spine-title');
        const author = spine.querySelector('.book-spine-author');
        
        if (title) {
            title.style.fontSize = `clamp(9px, ${newWidth * FONT_SCALE}px, 18px)`;
        }
        if (author) {
            author.style.fontSize = `clamp(8px, ${newWidth * 0.09}px, 14px)`;
        }

        // Slight height adjustment for extreme compression
        if (scale < 0.6) {
            const currentHeight = parseFloat(spine.style.height);
            spine.style.height = (currentHeight * 0.95) + 'px';
        }
    });
}

function generateSpineColor(book) {
    // Generate color based on genre, or use a varied palette
    const colors = [
        '#8B4513', '#2F4F4F', '#483D8B', '#2E8B57', '#8B0000',
        '#4B0082', '#556B2F', '#800000', '#191970', '#8B4789'
    ];
    
    if (book.genre) {
        const hash = book.genre.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    }
    
    return '#333';
}

function formatBookTooltip(book) {
    const parts = [
        book.title,
        book.author ? `by ${book.author}` : null,
        book.pages ? `${book.pages} pages` : null,
        book.rating ? `★`.repeat(book.rating) : null,
        book.exclusiveShelf
    ].filter(Boolean);
    
    return parts.join(' • ');
}

function createNewShelfZone() {
    const newShelfZone = document.createElement('div');
    newShelfZone.className = 'new-shelf-zone';
    
    Object.assign(newShelfZone.style, {
        height: '100px',
        border: '2px dashed #555',
        borderRadius: '8px',
        margin: '20px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#777',
        fontSize: '0.95em',
        transition: 'all 0.2s ease'
    });
    
    newShelfZone.textContent = '+ Drop here to create new shelf';
    
    newShelfZone.addEventListener('dragover', e => {
        e.preventDefault();
        newShelfZone.style.borderColor = '#888';
        newShelfZone.style.background = 'rgba(255,255,255,0.02)';
    });
    
    newShelfZone.addEventListener('dragleave', () => {
        newShelfZone.style.borderColor = '#555';
        newShelfZone.style.background = 'transparent';
    });
    
    newShelfZone.addEventListener('drop', e => {
        e.preventDefault();
        newShelfZone.style.borderColor = '#555';
        newShelfZone.style.background = 'transparent';
        
        const order = Number(e.dataTransfer.getData('text/plain'));
        if (!order) return;
        
        // Remove from old shelf
        bookshelfShelves.forEach(shelf => {
            const idx = shelf.indexOf(order);
            if (idx !== -1) shelf.splice(idx, 1);
        });
        
        // Create new shelf with this book
        bookshelfShelves.push([order]);
        
        // Clean up empty shelves
        bookshelfShelves = bookshelfShelves.filter(shelf => shelf.length > 0);
        
        saveBookshelfToLocal();
        renderBookshelf();
    });
    
    return newShelfZone;
}

function makeDroppable(row, shelfIdx) {
    row.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(row, e.clientX);
        const draggable = document.querySelector('.dragging');
        if (!draggable) return;
        
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

        // Clean up empty shelves
        bookshelfShelves = bookshelfShelves.filter(shelf => shelf.length > 0);

        // Add to this shelf at position
        const afterEl = getDragAfterElement(row, e.clientX);
        let insertIdx = 0;
        if (afterEl) {
            const afterOrder = Number(afterEl.dataset.order);
            insertIdx = bookshelfShelves[shelfIdx].indexOf(afterOrder);
        } else {
            insertIdx = bookshelfShelves[shelfIdx].length;
        }

        bookshelfShelves[shelfIdx].splice(insertIdx, 0, order);
        saveBookshelfToLocal();
        renderBookshelf();
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
    modal.style.background = 'rgba(0,0,0,0.85)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '2000';
    modal.style.backdropFilter = 'blur(4px)';

    const card = document.createElement('div');
    card.style.background = 'linear-gradient(135deg, #2a2a2a 0%, #1e1e1e 100%)';
    card.style.padding = '32px';
    card.style.borderRadius = '16px';
    card.style.maxWidth = '550px';
    card.style.width = '90%';
    card.style.maxHeight = '85vh';
    card.style.overflowY = 'auto';
    card.style.color = '#eee';
    card.style.boxShadow = '0 20px 60px rgba(0,0,0,0.5)';
    card.style.border = '1px solid #444';

    const readsText = book.reads?.length > 0 
        ? `${book.reads.length} time${book.reads.length > 1 ? 's' : ''}` 
        : '0';

    card.innerHTML = `
        <h3 style="margin: 0 0 20px 0; font-size: 1.6em; color: #fff;">${book.title}</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
            <p style="margin: 0;"><strong style="color: #aaa;">Author:</strong> ${book.author || 'Unknown'}</p>
            <p style="margin: 0;"><strong style="color: #aaa;">Pages:</strong> ${book.pages || 'Unknown'}</p>
            <p style="margin: 0;"><strong style="color: #aaa;">Status:</strong> ${book.exclusiveShelf}</p>
            <p style="margin: 0;"><strong style="color: #aaa;">Rating:</strong> ${'★'.repeat(book.rating || 0)}${'☆'.repeat(5 - (book.rating || 0))}</p>
            <p style="margin: 0;"><strong style="color: #aaa;">Reads:</strong> ${readsText}</p>
            <p style="margin: 0;"><strong style="color: #aaa;">Quotes:</strong> ${book.quotes?.length || 0}</p>
        </div>
        ${book.notes ? `
            <div style="margin-top: 16px; padding: 16px; background: rgba(0,0,0,0.3); border-radius: 8px; border-left: 3px solid #555;">
                <strong style="color: #aaa;">Notes:</strong>
                <p style="margin: 8px 0 0 0; line-height: 1.5;">${book.notes.substring(0, 300)}${book.notes.length > 300 ? '...' : ''}</p>
            </div>
        ` : ''}
        ${bookshelfSettings.customEditEnabled ? `
            <hr style="border: none; border-top: 1px solid #444; margin: 24px 0;">
            <div style="display: grid; gap: 16px;">
                <label style="display: flex; flex-direction: column; gap: 6px;">
                    <span style="color: #aaa; font-size: 0.9em;">Custom Height (80-500px)</span>
                    <input type="number" id="editHeight" min="80" max="500" value="${book.customHeight || ''}" 
                           style="padding: 8px; background: #1a1a1a; border: 1px solid #444; border-radius: 6px; color: #eee;">
                </label>
                <label style="display: flex; flex-direction: column; gap: 6px;">
                    <span style="color: #aaa; font-size: 0.9em;">Spine Color</span>
                    <input type="color" id="editSpineColor" value="${book.spineColor || '#333333'}"
                           style="padding: 4px; background: #1a1a1a; border: 1px solid #444; border-radius: 6px; height: 40px;">
                </label>
                <button id="saveCustom" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition: background 0.2s;">
                    Save Customizations
                </button>
            </div>
        ` : ''}
        <button id="closeDetails" style="margin-top: 24px; padding: 10px 24px; background: #444; color: white; border: none; border-radius: 6px; cursor: pointer; float: right; transition: background 0.2s;">
            Close
        </button>
    `;

    modal.appendChild(card);
    document.body.appendChild(modal);

    // Event listeners
    modal.addEventListener('click', e => {
        if (e.target === modal) document.body.removeChild(modal);
    });

    document.getElementById('closeDetails')?.addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    if (bookshelfSettings.customEditEnabled) {
        const saveBtn = document.getElementById('saveCustom');
        saveBtn?.addEventListener('mouseenter', () => {
            saveBtn.style.background = '#45a049';
        });
        saveBtn?.addEventListener('mouseleave', () => {
            saveBtn.style.background = '#4CAF50';
        });
        
        saveBtn?.addEventListener('click', () => {
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
        if (currentPages + pages > softMax * 1.05 && currentShelf.length > 0) {
            bookshelfShelves.push(currentShelf.map(b => b.importOrder));
            currentShelf = [];
            currentPages = 0;
        }
        currentShelf.push(book);
        currentPages += pages;
    });
    
    if (currentShelf.length > 0) {
        bookshelfShelves.push(currentShelf.map(b => b.importOrder));
    }

    saveBookshelfToLocal();
    renderBookshelf();
}

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
    });

    // Drag start/end on spines (delegated)
    const container = document.getElementById('bookshelfContainer');
    container?.addEventListener('dragstart', e => {
        if (e.target.classList.contains('book-spine')) {
            e.target.classList.add('dragging');
            e.target.style.opacity = '0.5';
            e.dataTransfer.setData('text/plain', e.target.dataset.order);
        }
    });

    container?.addEventListener('dragend', e => {
        if (e.target.classList.contains('book-spine')) {
            e.target.classList.remove('dragging');
            e.target.style.opacity = '1';
        }
    });

    const maxPagesInput = document.getElementById('maxPagesShelf');
    if (maxPagesInput) {
        maxPagesInput.value = bookshelfSettings.maxPagesPerShelf;
        maxPagesInput.addEventListener('input', e => {
            const newMax = Math.max(1000, Number(e.target.value) || 15000);
            bookshelfSettings.maxPagesPerShelf = newMax;
            saveBookshelfToLocal();
            renderBookshelf();
        });
    }
}

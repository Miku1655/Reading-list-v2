let tempCoverDataUrls = {};

async function preloadAndConvertCovers(booksNeedingCovers) {
    const promises = booksNeedingCovers.map(async (book) => {
        if (!book.coverUrl) {
            tempCoverDataUrls[book.importOrder] = generatePlaceholderDataUrl(book.title);
            return;
        }
        
        // If already a data URL, use it directly
        if (book.coverUrl.startsWith("data:")) {
            tempCoverDataUrls[book.importOrder] = book.coverUrl;
            return;
        }
        
        // Download the cover and convert to data URL (local copy)
        try {
            const response = await fetch(book.coverUrl);
            if (!response.ok) throw new Error("Fetch failed");
            
            const blob = await response.blob();
            const reader = new FileReader();
            
            await new Promise((resolve, reject) => {
                reader.onload = () => {
                    tempCoverDataUrls[book.importOrder] = reader.result;
                    resolve();
                };
                reader.onerror = () => {
                    console.warn(`Failed to convert cover for ${book.title}`);
                    tempCoverDataUrls[book.importOrder] = generatePlaceholderDataUrl(book.title);
                    resolve(); // Don't reject, just use placeholder
                };
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.warn(`Failed to load cover for ${book.title}:`, e.message);
            // Use placeholder for any failures
            tempCoverDataUrls[book.importOrder] = generatePlaceholderDataUrl(book.title);
        }
    });
    
    await Promise.all(promises);
}

function openYearReview() {
    const modal = document.getElementById("yearReviewModal");
    modal.style.display = "flex";
    // Add fade-in animation
    setTimeout(() => modal.classList.add('modal-visible'), 10);
    
    tempCoverDataUrls = {};
    const perYear = calculatePerYear();
    const years = Object.keys(perYear).map(Number).sort((a, b) => b - a);
    
    if (years.length === 0) {
        document.getElementById("yearReviewContent").innerHTML = '<p class="review-no-data">No finished reads yet — come back when you have some!</p>';
        document.getElementById("reviewYearSelect").innerHTML = "";
        return;
    }
    
    const select = document.getElementById("reviewYearSelect");
    select.innerHTML = "";
    let defaultYear = new Date().getFullYear();
    if (!perYear[defaultYear] || perYear[defaultYear].books === 0) {
        defaultYear = years[0];
    }
    
    years.forEach(y => {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        if (y === defaultYear) opt.selected = true;
        select.appendChild(opt);
    });
    
    generateYearReview(defaultYear);
}

async function generateYearReview(year) {
    const content = document.getElementById("yearReviewContent");
    content.innerHTML = `
        <div class="review-loading">
            <div class="loading-spinner"></div>
            <p><strong>Preparing your Year in Review...</strong></p>
            <p style="color:#999; font-size:0.9em;">Downloading covers for perfect display & export</p>
        </div>
    `;

    const perYear = calculatePerYear();
    const yearData = perYear[year] || { books: 0, pages: 0 };

    if (yearData.books === 0) {
        content.innerHTML = '<p class="review-no-data">No books finished in ' + year + '.</p>';
        return;
    }

    const finishedThisYear = new Set();
    const rereadThisYear = [];
    const authorCount = {};
    const allBooksThisYear = [];

    books.forEach(book => {
        let finishesInYear = 0;
        book.reads.forEach(read => {
            if (read.finished) {
                const d = new Date(read.finished);
                if (d.getFullYear() === year) {
                    finishesInYear++;
                    finishedThisYear.add(book);
                    if (!allBooksThisYear.includes(book)) allBooksThisYear.push(book);
                }
            }
        });
        if (finishesInYear > 0) {
            if (finishesInYear > 1) rereadThisYear.push({ book, count: finishesInYear });
            const auth = book.author || "Unknown";
            authorCount[auth] = (authorCount[auth] || 0) + finishesInYear;
        }
    });

    const finishedBooks = Array.from(finishedThisYear);

    // Download all covers locally before rendering
    tempCoverDataUrls = {};
    await preloadAndConvertCovers(allBooksThisYear);

    let newFavourites = finishedBooks.filter(b => profile.favourites.includes(b.importOrder));
    newFavourites.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    newFavourites = newFavourites.slice(0, 10);

    rereadThisYear.sort((a, b) => b.count - a.count);
    const topReread = rereadThisYear.slice(0, 5);

    const topAuthors = Object.entries(authorCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    let html = `<div class="review-header">
        <div class="review-year-badge">${year}</div>
        <div class="review-nick">${profile.nick ? profile.nick + "'s" : "My"} Reading Journey</div>
        <h2>Year in Review</h2>
    </div>`;

    html += '<div class="review-stats-grid">';
    html += `<div class="review-stats-block" style="animation-delay: 0.1s;">
        <div class="stats-icon">📚</div>
        <div class="stats-label">Books Finished</div>
        <strong class="stats-number">${yearData.books}</strong>
    </div>`;
    html += `<div class="review-stats-block" style="animation-delay: 0.2s;">
        <div class="stats-icon">📖</div>
        <div class="stats-label">Pages Read</div>
        <strong class="stats-number">${yearData.pages.toLocaleString()}</strong>
    </div>`;
    html += `<div class="review-stats-block" style="animation-delay: 0.3s;">
        <div class="stats-icon">✨</div>
        <div class="stats-label">Unique Titles</div>
        <strong class="stats-number">${finishedBooks.length}</strong>
    </div>`;
    html += '</div>';

    if (newFavourites.length > 0) {
        html += '<div class="review-section"><h3>✨ New Favourites of the Year</h3><div class="review-top-list">';
        newFavourites.forEach((b, idx) => {
            const coverUrl = tempCoverDataUrls[b.importOrder];
            const ratingStars = b.rating > 0 ? '⭐'.repeat(Math.round(b.rating)) : '';
            const ratingText = b.rating > 0 
                ? `<div class="book-rating">${ratingStars} <span>${b.rating}/5</span></div>` 
                : `<div class="book-rating-empty">Unrated</div>`;
            html += `<div class="review-book-card" style="animation-delay: ${0.1 * idx}s;">
                <img src="${coverUrl}" alt="Cover" class="book-cover">
                <div class="review-book-info">
                    <strong>${escapeHtml(b.title)}</strong>
                    <small>by ${escapeHtml(b.author || "Unknown")}</small>
                    ${ratingText}
                </div>
            </div>`;
        });
        html += '</div></div>';
    }

    if (topReread.length > 0) {
        html += '<div class="review-section"><h3>🔄 Most Re-read</h3><div class="review-top-list">';
        topReread.forEach((item, idx) => {
            const b = item.book;
            const coverUrl = tempCoverDataUrls[b.importOrder];
            html += `<div class="review-book-card" style="animation-delay: ${0.1 * idx}s;">
                <img src="${coverUrl}" alt="Cover" class="book-cover">
                <div class="review-book-info">
                    <strong>${escapeHtml(b.title)}</strong>
                    <small>by ${escapeHtml(b.author || "Unknown")}</small>
                    <div class="reread-badge">${item.count}× this year</div>
                </div>
            </div>`;
        });
        html += '</div></div>';
    }

    if (topAuthors.length > 0) {
        const isTie = topAuthors.length > 1 && topAuthors[0][1] === topAuthors[1][1];
        html += '<div class="review-section"><h3>👤 Most Read Author' + (isTie ? 's' : '') + '</h3>';
        html += '<div class="author-showcase">';
        topAuthors.forEach(([auth, count], i) => {
            html += `<div class="author-card" style="animation-delay: ${0.1 * i}s;">
                <div class="author-name">${escapeHtml(auth)}</div>
                <div class="author-count">${count} ${count > 1 ? "books" : "book"}</div>
            </div>`;
        });
        html += '</div></div>';
    }

    html += '<div class="review-section"><h3>🎨 Your Reading Collage</h3>';
    html += '<div class="review-collage">';
    finishedBooks.forEach((b, idx) => {
        const coverUrl = tempCoverDataUrls[b.importOrder];
        html += `<div class="collage-item" style="animation-delay: ${0.02 * idx}s;">
            <img src="${coverUrl}" alt="${escapeHtml(b.title)}" title="${escapeHtml(b.title)}">
        </div>`;
    });
    html += '</div></div>';

    content.innerHTML = html;
    
    // Trigger animations
    setTimeout(() => {
        content.querySelectorAll('.review-stats-block, .review-book-card, .author-card, .collage-item').forEach(el => {
            el.classList.add('animated');
        });
    }, 50);
}

// Helper function to escape HTML and prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Generate placeholder as data URL to avoid CORS issues
function generatePlaceholderDataUrl(title) {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 450;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // Gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, 450);
    gradient.addColorStop(0, '#e0e0e0');
    gradient.addColorStop(1, '#c0c0c0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 300, 450);
    
    // Text
    ctx.fillStyle = '#888';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const words = title.split(' ');
    const maxWidth = 260;
    let lines = [];
    let currentLine = '';
    
    words.forEach(word => {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    });
    if (currentLine) lines.push(currentLine);
    
    lines = lines.slice(0, 4); // Max 4 lines
    const lineHeight = 30;
    const startY = 225 - ((lines.length - 1) * lineHeight / 2);
    
    lines.forEach((line, i) => {
        ctx.fillText(line, 150, startY + i * lineHeight);
    });
    
    return canvas.toDataURL('image/png');
}

async function captureCleanPanel() {
    const panel = document.getElementById("yearReviewPanel");
    const header = document.getElementById("reviewHeader");
    const footer = document.getElementById("reviewFooter");

    // Hide UI controls for clean export
    const originalHeaderDisplay = header.style.display;
    const originalFooterDisplay = footer.style.display;
    header.style.display = "none";
    footer.style.display = "none";

    // Wait for all images to be fully loaded
    const images = panel.querySelectorAll('img');
    await Promise.all(Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
            setTimeout(resolve, 3000);
        });
    }));

    // Small delay to ensure DOM updates and animations settle
    await new Promise(resolve => setTimeout(resolve, 300));

    const canvas = await html2canvas(panel, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
        allowTaint: false,
        imageTimeout: 0,
        removeContainer: true
    });

    // Restore UI
    header.style.display = originalHeaderDisplay;
    footer.style.display = originalFooterDisplay;

    return canvas;
}

async function exportReviewAsPNG() {
    const exportBtn = document.getElementById("exportReviewPNG");
    const originalText = exportBtn.textContent;
    
    try {
        exportBtn.textContent = "Generating PNG...";
        exportBtn.disabled = true;
        
        const canvas = await captureCleanPanel();
        const link = document.createElement("a");
        const year = document.getElementById("reviewYearSelect").value;
        link.download = `Year-in-Review-${year}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        
        exportBtn.textContent = "✓ Downloaded!";
        setTimeout(() => {
            exportBtn.textContent = originalText;
            exportBtn.disabled = false;
        }, 2000);
    } catch (e) {
        console.error("PNG export error:", e);
        alert("PNG export failed. Please try again or contact support if the issue persists.");
        exportBtn.textContent = originalText;
        exportBtn.disabled = false;
    }
}

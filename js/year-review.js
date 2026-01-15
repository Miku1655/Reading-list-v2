let tempCoverDataUrls = {}; // Temporary in-memory cache, cleared on close/change

async function preloadAndConvertCovers(booksNeedingCovers) {
    const promises = booksNeedingCovers.map(async (book) => {
        if (!book.coverUrl || book.coverUrl.startsWith("data:")) {
            return; // Skip if no URL or already data URL
        }
        try {
            const response = await fetch(book.coverUrl, { mode: 'cors' }); // Best effort CORS
            if (!response.ok) throw new Error("Failed");
            const blob = await response.blob();
            const reader = new FileReader();
            await new Promise((resolve, reject) => {
                reader.onload = () => {
                    tempCoverDataUrls[book.importOrder] = reader.result;
                    resolve();
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.warn(`Failed to fetch cover for ${book.title}:`, e);
            // Fallback: keep original URL (rare, but html2canvas might still capture it)
            tempCoverDataUrls[book.importOrder] = book.coverUrl;
        }
    });
    await Promise.all(promises);
}

function openYearReview() {
    const modal = document.getElementById("yearReviewModal");
    modal.style.display = "flex";
    tempCoverDataUrls = {}; // Clear any old temp data

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
    content.innerHTML = '<p style="text-align:center; padding:60px; color:#777;"><strong>Loading covers for perfect display & export...</strong><br><span style="display:inline-block; margin-top:20px; width:40px; height:40px; border:4px solid #eee; border-top:4px solid #333; border-radius:50%; animation:spin 1s linear infinite;"></span></p><style>@keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } }</style>';

    const perYear = calculatePerYear();
    const yearData = perYear[year] || { books: 0, pages: 0 };

    if (yearData.books === 0) {
        content.innerHTML = '<p class="review-no-data">No books finished in ' + year + '.</p>';
        return;
    }

    const finishedThisYear = new Set();
    const rereadThisYear = [];
    const authorCount = {};

    const allBooksThisYear = []; // For cover fetching

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

    // Preload/convert covers
    tempCoverDataUrls = {}; // Reset for this year
    await preloadAndConvertCovers(allBooksThisYear);

    // New Favourites of the Year
    let newFavourites = finishedBooks.filter(b => profile.favourites.includes(b.importOrder));
    newFavourites.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    newFavourites = newFavourites.slice(0, 10);

    // Most re-read
    rereadThisYear.sort((a, b) => b.count - a.count);
    const topReread = rereadThisYear.slice(0, 5);

    // Top authors
    const topAuthors = Object.entries(authorCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    let html = `<div class="review-header">
        <div class="review-nick">${profile.nick ? profile.nick + "'s" : "My"} Reading</div>
        <h2>Year in Review ${year}</h2>
    </div>`;

    html += '<div class="review-stats-grid">';
    html += `<div class="review-stats-block"><div>Books Finished</div><strong>${yearData.books}</strong></div>`;
    html += `<div class="review-stats-block"><div>Pages Read</div><strong>${yearData.pages.toLocaleString()}</strong></div>`;
    html += `<div class="review-stats-block"><div>Unique Titles</div><strong>${finishedBooks.length}</strong></div>`;
    html += '</div>';

    if (newFavourites.length > 0) {
        html += '<h3 style="text-align:center; margin:40px 0 20px;">New Favourites of the Year</h3><div class="review-top-list">';
        newFavourites.forEach(b => {
            const coverUrl = tempCoverDataUrls[b.importOrder] || b.coverUrl || "https://via.placeholder.com/300x450?text=No+Cover";
            const ratingText = b.rating > 0 ? `<div>Rating: ${b.rating}/5</div>` : `<div>Unrated</div>`;
            html += `<div class="review-book-card"><img src="${coverUrl}" alt="Cover"><div class="review-book-info"><strong>${b.title}</strong><small>by ${b.author || "Unknown"}</small>${ratingText}</div></div>`;
        });
        html += '</div>';
    } else {
        html += '<p style="text-align:center; color:#888; font-style:italic; margin:40px 0;">No new favourites this year.</p>';
    }

    if (topReread.length > 0) {
        html += '<h3 style="text-align:center; margin:40px 0 20px;">Most Re-read</h3><div class="review-top-list">';
        topReread.forEach(item => {
            const b = item.book;
            const coverUrl = tempCoverDataUrls[b.importOrder] || b.coverUrl || "https://via.placeholder.com/300x450?text=No+Cover";
            html += `<div class="review-book-card"><img src="${coverUrl}" alt="Cover"><div class="review-book-info"><strong>${b.title}</strong><small>by ${b.author || "Unknown"}</small><div>Read ${item.count} times this year</div></div></div>`;
        });
        html += '</div>';
    }

    if (topAuthors.length > 0) {
        html += '<h3 style="text-align:center; margin:40px 0 20px;">Most Read Author' + (topAuthors.length > 1 && topAuthors[0][1] === topAuthors[1][1] ? "s" : "") + '</h3>';
        html += '<p style="font-size:1.4em; text-align:center; font-weight:500;">';
        topAuthors.forEach(([auth, count], i) => {
            if (i > 0) html += i === topAuthors.length - 1 ? " and " : ", ";
            html += `<strong>${auth}</strong> (${count} ${count > 1 ? "books" : "book"})`;
        });
        html += '</p>';
    }

    html += '<h3 style="text-align:center; margin:40px 0 20px;">Cover Collage</h3>';
    html += '<div class="review-collage">';
    finishedBooks.forEach(b => {
        const coverUrl = tempCoverDataUrls[b.importOrder] || b.coverUrl || "https://via.placeholder.com/300x450?text=No+Cover";
        html += `<img src="${coverUrl}" alt="${b.title}">`;
    });
    html += '</div>';

    content.innerHTML = html;
}

// Export functions (no preload needed now — data URLs are inline)
async function exportReviewAsPNG() {
    const panel = document.getElementById("yearReviewPanel");
    try {
        const canvas = await html2canvas(panel, {
            scale: 2,
            backgroundColor: "#ffffff",
            logging: false
        });
        const link = document.createElement("a");
        link.download = `Year-in-Review-${document.getElementById("reviewYearSelect").value}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    } catch (e) {
        alert("PNG export failed — try again after covers finish loading.");
    }
}

async function exportReviewAsPDF() {
    const panel = document.getElementById("yearReviewPanel");
    try {
        const canvas = await html2canvas(panel, { scale: 2, backgroundColor: "#ffffff" });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF.jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = imgWidth / pdfWidth;
        let heightLeft = imgHeight / ratio;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight / ratio);
        heightLeft -= pdfHeight;

        while (heightLeft >= 0) {
            pdf.addPage();
            position -= pdfHeight;
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight / ratio);
            heightLeft -= pdfHeight;
        }

        pdf.save(`Year-in-Review-${document.getElementById("reviewYearSelect").value}.pdf`);
    } catch (e) {
        alert("PDF export failed — try again after covers finish loading.");
    }
}

function openYearReview() {
    const modal = document.getElementById("yearReviewModal");
    modal.style.display = "flex";

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

function generateYearReview(year) {
    const content = document.getElementById("yearReviewContent");
    const perYear = calculatePerYear();
    const yearData = perYear[year] || { books: 0, pages: 0 };

    if (yearData.books === 0) {
        content.innerHTML = '<p class="review-no-data">No books finished in ' + year + '.</p>';
        return;
    }

    // Collect books finished this year (unique books with at least one finish in year)
    const finishedThisYear = new Set();
    const ratedThisYear = [];
    const rereadThisYear = [];
    const authorCount = {};

    books.forEach(book => {
        let finishesInYear = 0;
        book.reads.forEach(read => {
            if (read.finished) {
                const d = new Date(read.finished);
                if (d.getFullYear() === year) {
                    finishesInYear++;
                    finishedThisYear.add(book);
                }
            }
        });
        if (finishesInYear > 0) {
            if (book.rating > 0) {
                ratedThisYear.push({ book, rating: book.rating });
            }
            if (finishesInYear > 1 || getReadCount(book) > 1) {
                rereadThisYear.push({ book, count: finishesInYear });
            }
            const auth = book.author || "Unknown";
            authorCount[auth] = (authorCount[auth] || 0) + finishesInYear;
        }
    });

    const finishedBooks = Array.from(finishedThisYear);

    // Avg rating
    const avgRating = ratedThisYear.length
        ? (ratedThisYear.reduce((s, r) => s + r.rating, 0) / ratedThisYear.length).toFixed(1)
        : "-";

    // Top rated
    ratedThisYear.sort((a, b) => b.rating - a.rating);
    const topRated = ratedThisYear.slice(0, 5);

    // Top re-read
    rereadThisYear.sort((a, b) => b.count - a.count);
    const topReread = rereadThisYear.slice(0, 5);

    // Top author
    const topAuthors = Object.entries(authorCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    let html = `<h3 style="text-align:center; border-bottom:2px solid #333; padding-bottom:12px;">${year}</h3>`;
    html += '<div class="review-stats-grid">';
    html += `<div class="review-stats-block"><div>Books finished</div><strong>${yearData.books}</strong></div>`;
    html += `<div class="review-stats-block"><div>Pages read</div><strong>${yearData.pages.toLocaleString()}</strong></div>`;
    html += `<div class="review-stats-block"><div>Average rating</div><strong>${avgRating}</strong></div>`;
    html += `<div class="review-stats-block"><div>Unique titles</div><strong>${finishedBooks.length}</strong></div>`;
    html += '</div>';

    if (topRated.length > 0) {
        html += '<h3>Top Rated Books</h3><div class="review-top-list">';
        topRated.forEach(item => {
            const b = item.book;
            const cover = b.coverUrl ? `<img src="${b.coverUrl}" alt="Cover">` : '<div style="width:80px;height:120px;background:#ddd;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#999;font-size:0.9em;">No cover</div>';
            html += `<div class="review-book-card">${cover}<div class="review-book-info"><strong>${b.title}</strong><small>by ${b.author || "Unknown"}</small><br><strong>Rating: ${b.rating}/5</strong></div></div>`;
        });
        html += '</div>';
    }

    if (topReread.length > 0) {
        html += '<h3>Most Re-read</h3><div class="review-top-list">';
        topReread.forEach(item => {
            const b = item.book;
            const cover = b.coverUrl ? `<img src="${b.coverUrl}" alt="Cover">` : '<div style="width:80px;height:120px;background:#ddd;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#999;font-size:0.9em;">No cover</div>';
            html += `<div class="review-book-card">${cover}<div class="review-book-info"><strong>${b.title}</strong><small>by ${b.author || "Unknown"}</small><br><strong>Read ${item.count} time${item.count > 1 ? "s" : ""} this year</strong></div></div>`;
        });
        html += '</div>';
    }

    if (topAuthors.length > 0) {
        html += '<h3>Most Read Author' + (topAuthors.length > 1 && topAuthors[0][1] === topAuthors[1][1] ? "s" : "") + '</h3>';
        html += '<p style="font-size:1.2em; text-align:center;">';
        topAuthors.forEach(([auth, count], i) => {
            if (i > 0) html += i === topAuthors.length - 1 ? " and " : ", ";
            html += `<strong>${auth}</strong> (${count} ${count === 1 ? "book" : "books"})`;
        });
        html += '</p>';
    }

    html += '<h3>Cover Collage</h3>';
    html += '<div class="review-collage">';
    finishedBooks.forEach(b => {
        const src = b.coverUrl || "https://via.placeholder.com/300x450?text=No+Cover";
        html += `<img src="${src}" alt="${b.title}">`;
    });
    html += '</div>';

    content.innerHTML = html;
}

// Export functions
async function exportReviewAsPNG() {
    const panel = document.getElementById("yearReviewPanel");
    const canvas = await html2canvas(panel, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const link = document.createElement("a");
    link.download = `Year-in-Review-${document.getElementById("reviewYearSelect").value}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

async function exportReviewAsPDF() {
    const panel = document.getElementById("yearReviewPanel");
    const canvas = await html2canvas(panel, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF.jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width, canvas.height]
    });
    const width = pdf.internal.pageSize.getWidth();
    const height = pdf.internal.pageSize.getHeight();

    pdf.addImage(imgData, "PNG", 0, 0, width, height);

    if (canvas.height > height) {
        // Simple multi-page if needed (split vertically)
        let position = 0;
        while (position < canvas.height) {
            position += height;
            if (position < canvas.height) {
                pdf.addPage();
                pdf.addImage(imgData, "PNG", 0, -position, width, canvas.height);
            }
        }
    }

    pdf.save(`Year-in-Review-${document.getElementById("reviewYearSelect").value}.pdf`);
}

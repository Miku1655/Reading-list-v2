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
            if (book.rating > 0) ratedThisYear.push({ book, rating: book.rating });
            if (finishesInYear > 1) rereadThisYear.push({ book, count: finishesInYear });
            const auth = book.author || "Unknown";
            authorCount[auth] = (authorCount[auth] || 0) + finishesInYear;
        }
    });

    const finishedBooks = Array.from(finishedThisYear);

    const avgRating = ratedThisYear.length
        ? (ratedThisYear.reduce((s, r) => s + r.rating, 0) / ratedThisYear.length).toFixed(1)
        : "-";

    ratedThisYear.sort((a, b) => b.rating - a.rating);
    const topRated = ratedThisYear.slice(0, 5);

    rereadThisYear.sort((a, b) => b.count - a.count);
    const topReread = rereadThisYear.slice(0, 5);

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
    html += `<div class="review-stats-block"><div>Average Rating</div><strong>${avgRating}</strong></div>`;
    html += `<div class="review-stats-block"><div>Unique Titles</div><strong>${finishedBooks.length}</strong></div>`;
    html += '</div>';

    if (topRated.length > 0) {
        html += '<h3 style="text-align:center; margin:40px 0 20px;">Top Rated Books</h3><div class="review-top-list">';
        topRated.forEach(item => {
            const b = item.book;
            const cover = b.coverUrl 
                ? `<img src="${b.coverUrl}" crossorigin="anonymous" alt="Cover">`
                : `<div class="review-no-cover">${b.title.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,3)}</div>`;
            html += `<div class="review-book-card">${cover}<div class="review-book-info"><strong>${b.title}</strong><small>by ${b.author || "Unknown"}</small><div>Rating: ${b.rating}/5</div></div></div>`;
        });
        html += '</div>';
    }

    if (topReread.length > 0) {
        html += '<h3 style="text-align:center; margin:40px 0 20px;">Most Re-read</h3><div class="review-top-list">';
        topReread.forEach(item => {
            const b = item.book;
            const cover = b.coverUrl 
                ? `<img src="${b.coverUrl}" crossorigin="anonymous" alt="Cover">`
                : `<div class="review-no-cover">${b.title.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,3)}</div>`;
            html += `<div class="review-book-card">${cover}<div class="review-book-info"><strong>${b.title}</strong><small>by ${b.author || "Unknown"}</small><div>Read ${item.count} times this year</div></div></div>`;
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
        if (b.coverUrl) {
            html += `<img src="${b.coverUrl}" crossorigin="anonymous" alt="${b.title}">`;
        } else {
            html += `<div class="review-no-cover">${b.title.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,3)}</div>`;
        }
    });
    html += '</div>';

    content.innerHTML = html;
}

async function exportReviewAsPNG() {
    const panel = document.getElementById("yearReviewPanel");
    try {
        const canvas = await html2canvas(panel, {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: "#ffffff",
            logging: false
        });
        const link = document.createElement("a");
        link.download = `Year-in-Review-${document.getElementById("reviewYearSelect").value}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    } catch (e) {
        alert("PNG export failed (likely due to some external covers). Try again or check console.");
    }
}

async function exportReviewAsPDF() {
    const panel = document.getElementById("yearReviewPanel");
    try {
        const canvas = await html2canvas(panel, {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: "#ffffff"
        });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF.jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = imgWidth / pdfWidth;
        const imgScaledHeight = imgHeight / ratio;

        let heightLeft = imgScaledHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgScaledHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > 0) {
            position = -pdfHeight * pdf.internal.getCurrentPageInfo().pageNumber; // better positioning
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgScaledHeight);
            heightLeft -= pdfHeight;
        }

        pdf.save(`Year-in-Review-${document.getElementById("reviewYearSelect").value}.pdf`);
    } catch (e) {
        alert("PDF export failed (likely due to some external covers). Try again or check console.");
    }
}

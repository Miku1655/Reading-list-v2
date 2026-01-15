async function preloadImages() {
    const images = document.querySelectorAll("#yearReviewPanel img");
    const promises = [];
    images.forEach(img => {
        if (img.src && !img.complete) {
            const promise = new Promise((resolve, reject) => {
                const newImg = new Image();
                newImg.crossOrigin = "anonymous";
                newImg.onload = resolve;
                newImg.onerror = resolve; // continue even if fails
                newImg.src = img.src;
            });
            promises.push(promise);
        }
    });
    await Promise.all(promises);
}

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
            if (finishesInYear > 1) rereadThisYear.push({ book, count: finishesInYear });
            const auth = book.author || "Unknown";
            authorCount[auth] = (authorCount[auth] || 0) + finishesInYear;
        }
    });

    const finishedBooks = Array.from(finishedThisYear);

    // New Favourites of the Year
    let newFavourites = finishedBooks.filter(b => profile.favourites.includes(b.importOrder));
    newFavourites.sort((a, b) => (b.rating || 0) - (a.rating || 0)); // highest rating first
    newFavourites = newFavourites.slice(0, 10); // limit for layout

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
            const cover = b.coverUrl 
                ? `<img src="${b.coverUrl}" crossorigin="anonymous" alt="Cover">`
                : `<div class="review-no-cover">${b.title.split(' ').map(w => w[0]?.toUpperCase() || '').join('').slice(0,3)}</div>`;
            const ratingText = b.rating > 0 ? `<div>Rating: ${b.rating}/5</div>` : `<div>Unrated</div>`;
            html += `<div class="review-book-card">${cover}<div class="review-book-info"><strong>${b.title}</strong><small>by ${b.author || "Unknown"}</small>${ratingText}</div></div>`;
        });
        html += '</div>';
    } else {
        html += '<p style="text-align:center; color:#888; font-style:italic; margin:40px 0;">No new favourites this year.</p>';
    }

    if (topReread.length > 0) {
        html += '<h3 style="text-align:center; margin:40px 0 20px;">Most Re-read</h3><div class="review-top-list">';
        topReread.forEach(item => {
            const b = item.book;
            const cover = b.coverUrl 
                ? `<img src="${b.coverUrl}" crossorigin="anonymous" alt="Cover">`
                : `<div class="review-no-cover">${b.title.split(' ').map(w => w[0]?.toUpperCase() || '').join('').slice(0,3)}</div>`;
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
            html += `<div class="review-no-cover">${b.title.split(' ').map(w => w[0]?.toUpperCase() || '').join('').slice(0,3)}</div>`;
        }
    });
    html += '</div>';

    content.innerHTML = html;
}

async function exportReviewAsPNG() {
    await preloadImages();
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
        alert("PNG export failed. Some covers may not have loaded in time.");
    }
}

async function exportReviewAsPDF() {
    await preloadImages();
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
        const imgWidth = canvas.width / 2; // account for scale
        const imgHeight = canvas.height / 2;
        const ratio = imgWidth / pdfWidth;
        let heightLeft = imgHeight / ratio;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight / ratio);
        heightLeft -= pdfHeight;

        while (heightLeft >= 0) {
            pdf.addPage();
            position = heightLeft - imgHeight / ratio;
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight / ratio);
            heightLeft -= pdfHeight;
        }

        pdf.save(`Year-in-Review-${document.getElementById("reviewYearSelect").value}.pdf`);
    } catch (e) {
        alert("PDF export failed. Some covers may not have loaded in time.");
    }
}

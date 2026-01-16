function renderStats() {
    const container = document.getElementById("stats");
    const ctx = document.getElementById("statsChart").getContext("2d");
    if (window.statsChart && typeof window.statsChart.destroy === 'function') {
        window.statsChart.destroy();
    }
    const perYear = calculatePerYear();
    const readBooks = books.filter(b => b.exclusiveShelf === "read");
    const dnfBooks = books.filter(b => b.exclusiveShelf === "dnf");
    const pagesRead = readBooks.reduce((s, b) => s + (b.pages || 0) * getReadCount(b), 0);
    const authorStats = {};
    readBooks.forEach(b => {
        const auth = b.author || "Unknown";
        if (!authorStats[auth]) authorStats[auth] = { count: 0, ratingSum: 0, rated: 0 };
        authorStats[auth].count++;
        if (b.rating > 0) {
            authorStats[auth].ratingSum += b.rating;
            authorStats[auth].rated++;
        }
    });
    const topByCount = Object.entries(authorStats).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
    const topByAvg = Object.entries(authorStats)
        .filter(([, s]) => s.count >= minAuthorBooks && s.rated > 0)
        .map(([a, s]) => [a, (s.ratingSum / s.rated).toFixed(2), s.rated])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    let longest = null, shortest = null, mostReread = null;
    let maxYearBooks = 0, maxYearPages = 0, maxYearBooksYear = null, maxYearPagesYear = null;
    readBooks.forEach(b => {
        if (!longest || b.pages > longest.pages) longest = b;
        if (!shortest || (b.pages > 0 && b.pages < shortest.pages)) shortest = b;
        if (!mostReread || getReadCount(b) > getReadCount(mostReread || {})) mostReread = b;
    });
    Object.entries(perYear).forEach(([y, s]) => {
        if (s.books > maxYearBooks) { maxYearBooks = s.books; maxYearBooksYear = y; }
        if (s.pages > maxYearPages) { maxYearPages = s.pages; maxYearPagesYear = y; }
    });
    const speeds = calculateReadingSpeeds();
    const dist = calculateDistributions();
    const statusData = {
        labels: ["Read", "Currently Reading", "To Read", "DNF"],
        values: [dist.status.read, dist.status["currently-reading"], dist.status["to-read"], dist.status.dnf]
    };
    const languageData = prepareChartData(dist.language);
    const countryData = prepareChartData(dist.country);
    const genreData = prepareChartData(dist.genre);
    let html = '<div class="stats-upper">';
    html += '<div class="stats-block"><h2>Overall Stats</h2>';
    html += '<div class="stats-grid">';
    html += `<div>Total books</div><div>${books.length || 0}</div>`;
    html += `<div>Read</div><div>${readBooks.length}</div>`;
    html += `<div>DNF</div><div>${dnfBooks.length}</div>`;
    html += `<div>Pages read (× count)</div><div>${pagesRead}</div>`;
    html += '</div></div>';
    html += '<div class="stats-block"><h2>Favorite Authors</h2><div class="stats-list">';
    html += '<strong>By books read:</strong><br>';
    topByCount.forEach(([a, s]) => html += `• ${a}: ${s.count} book${s.count > 1 ? 's' : ''}<br>`);
    html += `<br><strong>By average rating (min ${minAuthorBooks} books):</strong><br>`;
    if (topByAvg.length === 0) html += "No authors meet minimum<br>";
    topByAvg.forEach(([a, avg, rated]) => html += `• ${a}: ${avg} (${rated} rated)<br>`);
    html += '</div></div>';
    html += '<div class="stats-block"><h2>Personal Records</h2><div class="stats-list">';
    if (longest) html += `Longest book: <strong>${longest.title}</strong> (${longest.pages} pages)<br>`;
    if (shortest) html += `Shortest book: <strong>${shortest.title}</strong> (${shortest.pages} pages)<br>`;
    if (mostReread && getReadCount(mostReread) > 1) html += `Most re-read: <strong>${mostReread.title}</strong> (${getReadCount(mostReread)} times)<br>`;
    if (maxYearBooksYear) html += `Most books in a year: ${maxYearBooks} (${maxYearBooksYear})<br>`;
    if (maxYearPagesYear) html += `Most pages in a year: ${maxYearPages} (${maxYearPagesYear})<br>`;
    html += '</div></div>';
    html += '<div class="stats-block"><h2>Reading Speed</h2><div class="stats-list">';
    html += `<strong>Average:</strong> ${speeds.avg} pages/day<br>`;
    if (speeds.fastest) html += `<strong>Fastest:</strong> ${speeds.fastest.book.title} (${speeds.fastest.speed.toFixed(1)} p/d over ${speeds.fastest.days.toFixed(1)} days)<br>`;
    if (speeds.slowest) html += `<strong>Slowest:</strong> ${speeds.slowest.book.title} (${speeds.slowest.speed.toFixed(1)} p/d over ${speeds.slowest.days.toFixed(1)} days)<br>`;
    html += '</div></div>';
    html += '<div class="stats-block"><h2>Book Status</h2><div class="stats-list">';
    statusData.labels.forEach((label, i) => {
        const count = statusData.values[i];
        const perc = dist.totalBooks > 0 ? (count / dist.totalBooks * 100).toFixed(0) : 0;
        html += `${label}: ${count} (${perc}%)<br>`;
    });
    html += `Total books: ${dist.totalBooks}`;
    html += '</div></div>';
    html += '<div class="stats-block"><h2>Languages</h2>';
if (dist.readCount === 0) {
    html += '<div class="stats-list">No books marked as read yet.</div>';
} else {
    // Sort descending by count, then alphabetically on ties
    const sortedLanguages = [...languageData.labels]
        .map((label, i) => ({ label, count: languageData.values[i] }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    html += '<div class="stats-scroll-container stats-list">';
    sortedLanguages.forEach(item => {
        const perc = (item.count / dist.readCount * 100).toFixed(0);
        html += `<div>• ${item.label || 'Unknown'}: ${item.count} (${perc}%)</div>`;
    });
    html += '</div>';
    html += `<br><small>Among ${dist.readCount} read books • ${sortedLanguages.length} unique</small>`;
}
html += '</div>';

// ── Countries ────────────────────────────────────────────────────────────────
html += '<div class="stats-block"><h2>Countries</h2>';
if (dist.readCount === 0) {
    html += '<div class="stats-list">No books marked as read yet.</div>';
} else {
    const sortedCountries = [...countryData.labels]
        .map((label, i) => ({ label, count: countryData.values[i] }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    html += '<div class="stats-scroll-container stats-list">';
    sortedCountries.forEach(item => {
        const perc = (item.count / dist.readCount * 100).toFixed(0);
        html += `<div>• ${item.label || 'Unknown'}: ${item.count} (${perc}%)</div>`;
    });
    html += '</div>';
    html += `<br><small>Among ${dist.readCount} read books • ${sortedCountries.length} unique</small>`;
}
html += '</div>';

// ── Genres ───────────────────────────────────────────────────────────────────
html += '<div class="stats-block"><h2>Genres</h2>';
if (dist.readCount === 0) {
    html += '<div class="stats-list">No books marked as read yet.</div>';
} else {
    const sortedGenres = [...genreData.labels]
        .map((label, i) => ({ label, count: genreData.values[i] }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    html += '<div class="stats-scroll-container stats-list">';
    sortedGenres.forEach(item => {
        const perc = (item.count / dist.readCount * 100).toFixed(0);
        html += `<div>• ${item.label || 'Unknown'}: ${item.count} (${perc}%)</div>`;
    });
    html += '</div>';
    html += `<br><small>Among ${dist.readCount} read books • ${sortedGenres.length} unique</small>`;
}
html += '</div>';
    
    html += '</div></div>';
    html += '</div>'; // close stats-upper
    html += '<div class="stats-year-block"><h2>By Year</h2><div class="stats-list">';
    if (Object.keys(perYear).length === 0) {
        html += "none";
    } else {
        Object.keys(perYear).sort((a, b) => b - a).forEach(y => {
            html += `${y}: ${perYear[y].books} books, ${perYear[y].pages} pages<br>`;
        });
    }
    html += '</div></div>';
    container.innerHTML = html;

    const labels = Object.keys(perYear).sort((a,b) => a - b);

    // Yearly bar chart with fallback
    const barContainer = document.getElementById("statsChartContainer");
    if (labels.length > 0) {
        const booksData = labels.map(y => perYear[y].books);
        const pagesData = labels.map(y => perYear[y].pages);
        window.statsChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [
                { label: 'Books', data: booksData, backgroundColor: 'rgba(75, 192, 192, 0.6)', yAxisID: 'y' },
                { label: 'Pages', data: pagesData, backgroundColor: 'rgba(153, 102, 255, 0.6)', yAxisID: 'y1' }
            ]},
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, position: 'left', ticks: { color: '#eee' }, grid: { color: '#333' } },
                    y1: { beginAtZero: true, position: 'right', ticks: { color: '#eee' }, grid: { drawOnChartArea: false } }
                },
                plugins: { legend: { labels: { color: '#eee' } } }
            }
        });
    }

    // Doughnut charts (unchanged)
    const pieColors = [
        'rgba(255, 99, 132, 0.8)',
        'rgba(54, 162, 235, 0.8)',
        'rgba(255, 206, 86, 0.8)',
        'rgba(75, 192, 192, 0.8)',
        'rgba(153, 102, 255, 0.8)',
        'rgba(255, 159, 64, 0.8)',
        'rgba(199, 199, 199, 0.8)',
        'rgba(255, 159, 192, 0.8)',
        'rgba(83, 192, 192, 0.8)',
        'rgba(156, 102, 255, 0.8)'
    ];
    function createDoughnut(id, data, titleText) {
        const ctxPie = document.getElementById(id).getContext("2d");
        if (window[id + "Chart"]) window[id + "Chart"].destroy();
        const total = data.values.reduce((a, b) => a + b, 0);
        if (total === 0) return;
        const bg = pieColors.slice(0, data.labels.length);
        window[id + "Chart"] = new Chart(ctxPie, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.values,
                    backgroundColor: bg
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: '#eee' } },
                    title: {
                        display: true,
                        text: titleText,
                        color: '#eee',
                        font: { size: 14 }
                    }
                }
            }
        });
    }
    createDoughnut("statusChart", statusData, "Status Distribution");
    createDoughnut("languageChart", languageData, "Language Distribution" + (dist.readCount > 0 ? ` (${dist.readCount} read books)` : ""));
    createDoughnut("countryChart", countryData, "Country Distribution" + (dist.readCount > 0 ? ` (${dist.readCount} read books)` : ""));
    createDoughnut("genreChart", genreData, "Genre Distribution" + (dist.readCount > 0 ? ` (${dist.readCount} read books)` : ""));

        // Cumulative line chart – deferred for reliable sizing on initial load
    const cumulativeContainer = document.getElementById("cumulativeChartContainer");
    const ctxLine = document.getElementById("cumulativeChart")?.getContext("2d");
    if (!ctxLine) {
        console.warn("Cumulative canvas not ready yet");
        cumulativeContainer.innerHTML = '<p style="text-align:center; color:#aaa; padding:120px 20px;">Loading chart...</p>';
        return;
    }
    if (window.cumulativeChart && typeof window.cumulativeChart.destroy === 'function') {
        window.cumulativeChart.destroy();
    }

    setTimeout(() => {
        if (labels.length > 0) {
            let cumBooks = 0;
            let cumPages = 0;
            const cumBooksData = [];
            const cumPagesData = [];

            labels.forEach(y => {
                cumBooks += perYear[y].books;
                cumPages += perYear[y].pages;
                cumBooksData.push(cumBooks);
                cumPagesData.push(cumPages);
            });

            window.cumulativeChart = new Chart(ctxLine, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Cumulative Books',
                            data: cumBooksData,
                            borderColor: 'rgba(75, 192, 192, 1)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            fill: true,
                            tension: 0.3,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Cumulative Pages',
                            data: cumPagesData,
                            borderColor: 'rgba(153, 102, 255, 1)',
                            backgroundColor: 'rgba(153, 102, 255, 0.2)',
                            fill: true,
                            tension: 0.3,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y: { beginAtZero: true, position: 'left', ticks: { color: '#eee' }, grid: { color: '#333' } },
                        y1: { beginAtZero: true, position: 'right', ticks: { color: '#eee' }, grid: { drawOnChartArea: false } },
                        x: { ticks: { color: '#eee' }, grid: { color: '#333' } }
                    },
                    plugins: {
                        legend: { labels: { color: '#eee' } },
                        title: {
                            display: true,
                            text: 'Cumulative Reading Progress Over Time',
                            color: '#eee',
                            font: { size: 16 }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.dataset.label + ': ' + context.parsed.y.toLocaleString();
                                }
                            }
                        }
                    }
                }
            });
        } 
    }, 100); // Small delay for DOM settle – reliable without noticeable lag
}

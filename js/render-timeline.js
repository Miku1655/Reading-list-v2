function renderTimeline() {
    const container = document.getElementById("timelineContainer");
    if (!container) {
        console.error("Timeline container not found in DOM!");
        return;
    }
    container.innerHTML = "";
    const entries = [];
    books.forEach(b => {
        if (b.reads) {
            b.reads.forEach(read => {
                if (read.finished) {
                    entries.push({ book: b, date: new Date(read.finished) });
                }
            });
        }
    });
    if (entries.length === 0) {
        container.innerHTML = "<p style='text-align:center; color:#aaa; padding:80px; font-size:1.1em;'>No finished reads yet!<br><br>Mark some books as finished to build your reading timeline.</p>";
        return;
    }
    entries.sort((a, b) => b.date - a.date);
    const groups = {};
    const userLocale = navigator.language || 'en-US';
    entries.forEach(entry => {
        const year = entry.date.getFullYear();
        const monthNum = entry.date.getMonth() + 1;
        const monthPadded = String(monthNum).padStart(2, '0');
        const monthName = entry.date.toLocaleString(userLocale, { month: 'long' });
        const key = `${year}-${monthPadded}`;
        if (!groups[key]) groups[key] = { display: `${year} ${monthName}`, entries: [] };
        groups[key].entries.push(entry);
    });
    const sortedKeys = Object.keys(groups).sort().reverse();
    sortedKeys.forEach(key => {
        const g = groups[key];
        const div = document.createElement("div");
        div.innerHTML = `<h4>${g.display} (${g.entries.length} read${g.entries.length > 1 ? 's' : ''})</h4>`;
        const ul = document.createElement("ul");
        g.entries.forEach(entry => {
            const li = document.createElement("li");
            if (showCoversInTimeline && entry.book.coverUrl) {
                const img = document.createElement("img");
                img.src = entry.book.coverUrl;
                img.alt = "Cover";
                img.style.maxHeight = "80px";
                img.style.marginRight = "12px";
                img.style.verticalAlign = "middle";
                img.onerror = () => img.remove();
                li.appendChild(img);
            }
            const textDiv = document.createElement("span");
            const readDate = entry.date.toLocaleDateString(userLocale);
            textDiv.innerHTML = `<strong>${entry.book.title}</strong> by ${entry.book.author || "Unknown"} (${entry.book.rating || "unrated"}) — finished ${readDate}`;
            li.appendChild(textDiv);
            ul.appendChild(li);
        });
        div.appendChild(ul);
        container.appendChild(div);
    });
}

function renderQuotes() {
    const container = document.getElementById("quotesContainer");
    container.innerHTML = "";

    const allQuotes = [];
    books.forEach(b => {
        if (b.quotes && b.quotes.length) {
            b.quotes.forEach(q => {
                if (q.text.trim()) {
                    allQuotes.push({ ...q, book: b });
                }
            });
        }
    });

    if (allQuotes.length === 0) {
        container.innerHTML = "<p>No quotes added yet. Edit books to add some!</p>";
        return;
    }

    // Simple list for now
    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.padding = "0";
    allQuotes.forEach(q => {
        const li = document.createElement("li");
        li.style.marginBottom = "16px";
        li.style.padding = "12px";
        li.style.background = "#222";
        li.style.borderRadius = "6px";
        li.innerHTML = `
            <blockquote style="margin:0 0 8px; font-style:italic;">"${q.text}"</blockquote>
            <div style="color:#aaa; font-size:0.9em;">
                From <strong>${q.book.title}</strong> by ${q.book.author || "Unknown"}
                ${q.page ? ` — p.${q.page}` : ''}
                ${q.date ? ` (${new Date(q.date).toLocaleDateString()})` : ''}
                ${q.favorite ? ' ★ Favorite' : ''}
            </div>
        `;
        ul.appendChild(li);
    });
    container.appendChild(ul);
}

function renderQuotes() {
    const container = document.getElementById("quotesContainer");
    if (!container) return;

    container.innerHTML = "<p>Loading quotes...</p>";

    const allQuotes = [];
    books.forEach(book => {
        (book.quotes || []).forEach(quote => {
            if (quote.text?.trim()) {
                allQuotes.push({ ...quote, book });
            }
        });
    });

    if (allQuotes.length === 0) {
        container.innerHTML = "<p style='color:#aaa;'>No quotes added yet. Edit some books to add memorable passages!</p>";
        return;
    }

    let html = "";
    allQuotes.forEach(q => {
        html += `
            <div style="margin:16px 0; padding:12px; background:#222; border-radius:6px;">
                <blockquote style="margin:0 0 8px; font-style:italic; white-space:pre-wrap;">"${q.text}"</blockquote>
                <div style="color:#aaa; font-size:0.9em;">
                    — <strong>${q.book.title}</strong> by ${q.book.author || "Unknown"}
                    ${q.page ? ` (p.${q.page})` : ""}
                    ${q.date ? ` • ${new Date(q.date).toLocaleDateString()}` : ""}
                    ${q.favorite ? " ★" : ""}
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

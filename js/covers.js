async function fetchCover(book) {
    let query = "";
    if (book.isbn) {
        query = `isbn:${book.isbn}`;
    } else if (book.title) {
        query = `intitle:${encodeURIComponent(book.title)}`;
        if (book.author) query += `+inauthor:${encodeURIComponent(book.author)}`;
    } else {
        return null;
    }
    try {
        const resp = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=10`);
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.totalItems === 0) return null;
        for (const item of data.items || []) {
            const links = item.volumeInfo.imageLinks;
            if (links && (links.thumbnail || links.smallThumbnail)) {
                return (links.thumbnail || links.smallThumbnail).replace(/^http:/, 'https:');
            }
        }
        return null;
    } catch (e) {
        console.error(e);
        return null;
    }
}

function updateCoversCount() {
    const count = books.filter(b => b.coverUrl).length;
    const total = books.length;
    document.getElementById("coversCount").textContent =
        `${count} of ${total} books have covers (remote URLs – no disk space used by the app)`;
}

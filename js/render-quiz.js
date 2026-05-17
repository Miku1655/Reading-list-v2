// render-quiz.js - Fixed: no immediate reveal, hide author until next/reveal

let currentQuizBook = null;
let currentQuizType = null;
let _quizListenersAttached = false; // FIX: prevent stacking listeners on every tab visit

function getEligibleBooks() {
    return books.filter(b => b.exclusiveShelf === "read" || b.exclusiveShelf === "dnf");
}

function getRandomBook() {
    const eligible = getEligibleBooks();
    if (eligible.length === 0) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
}

function renderQuizPrompt(book, type) {
    const promptEl = document.getElementById("quizPrompt");
    const nextBtn  = document.getElementById("quizNextBtn");

    if (!book) {
        promptEl.innerHTML = "<p style='color:#aaa;'>No read or DNF books yet — add some to start quizzing!</p>";
        nextBtn.style.display = "none";
        return;
    }

    let html = `<strong>${book.title}</strong>`;
    if (book.series) {
        html += ` (${book.series}`;
        if (book.seriesNumber) html += ` #${book.seriesNumber}`;
        html += ")";
    }
    html += "<br>";

    if (type === "location" || type === "year") {
        html += `<em>${book.author}</em>`;
    } else if (type === "author") {
        html += `<p style="margin: 30px 0; font-style: italic; color: #888;">(Think: who is the author?)</p>`;
    }

    if (type === "author") {
        promptEl.innerHTML = `<p style="margin-bottom:20px; font-size:1.3em;">Who wrote this book?</p>` + html;
    } else if (type === "location") {
        promptEl.innerHTML = `<p style="margin-bottom:20px; font-size:1.3em;">Where is this book on your physical shelf?</p>` + html;
    } else if (type === "year") {
        promptEl.innerHTML = `<p style="margin-bottom:20px; font-size:1.3em;">What year did you finish reading this?</p>` + html;
    }

    nextBtn.style.display  = "inline-block";
    nextBtn.textContent    = "Reveal + Next →";
}

function showRevealAndNext() {
    if (!currentQuizBook || !currentQuizType) return;

    const promptEl = document.getElementById("quizPrompt");
    let revealHtml = `<div style="margin:24px 0; padding:18px; background:#2a2a2a; border:1px solid #555; border-radius:10px;">`;

    if (currentQuizType === "author") {
        const count = currentQuizBook.reads?.filter(r => r.finished).length || 0;
        revealHtml += `<strong>Author:</strong> ${currentQuizBook.author}<br>`;
        revealHtml += `<em>Reads: ${count}</em>`;
    } else if (currentQuizType === "location") {
        revealHtml += `<em>Got it in mind? Maybe time to check your shelves... 📚</em>`;
    } else if (currentQuizType === "year") {
        const finishedDates = currentQuizBook.reads?.filter(r => r.finished).map(r => new Date(r.finished)) || [];
        if (finishedDates.length > 0) {
            const firstYear = new Date(Math.min(...finishedDates)).getFullYear();
            revealHtml += `<strong>First finished:</strong> ${firstYear}<br>`;
            if (finishedDates.length > 1) {
                const lastYear = new Date(Math.max(...finishedDates)).getFullYear();
                revealHtml += `<em>${finishedDates.length} reads (last: ${lastYear})</em>`;
            }
        } else {
            revealHtml += `<em>No finish date recorded yet</em>`;
        }
    }

    revealHtml += `</div>`;
    promptEl.innerHTML += revealHtml;

    setTimeout(() => {
        const nextBook = getRandomBook();
        currentQuizBook = nextBook;
        renderQuizPrompt(nextBook, currentQuizType);
    }, 1800);
}

function startOrNextQuiz() {
    const type = document.getElementById("quizTypeSelect").value;
    currentQuizType = type;

    const book = getRandomBook();
    currentQuizBook = book;

    if (!book) {
        document.getElementById("quizPrompt").innerHTML = "<p style='color:#aaa;'>No eligible books found.</p>";
        document.getElementById("quizNextBtn").style.display = "none";
        return;
    }

    renderQuizPrompt(book, type);
}

// FIX: attach listeners only once regardless of how many times renderQuiz is called
function initQuizListeners() {
    if (_quizListenersAttached) return;

    const startBtn = document.getElementById("quizStartBtn");
    const nextBtn  = document.getElementById("quizNextBtn");
    const select   = document.getElementById("quizTypeSelect");

    if (!startBtn || !nextBtn || !select) return;

    startBtn.addEventListener("click", startOrNextQuiz);
    nextBtn.addEventListener("click", showRevealAndNext);

    _quizListenersAttached = true;
}

window.renderQuiz = function () {
    const tab = document.getElementById("tab-quiz");
    if (tab && tab.classList.contains("active")) {
        initQuizListeners();
    }
};

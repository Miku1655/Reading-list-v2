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
    const nextBtn = document.getElementById("quizNextBtn");
    
    if (!book) {
        promptEl.innerHTML = "<p style='color:#aaa;'>No read or DNF books yet — add some to start quizzing!</p>";
        nextBtn.style.display = "none";
        return;
    }
    
    let html = `<strong>${book.title}</strong>`;
    if (book.series) html += ` (${book.series}`;
    if (book.seriesNumber) html += ` #${book.seriesNumber}`;
    if (book.series) html += ")";
    html += `<br><em>${book.author}</em>`;
    
    if (type === "location") {
        // Just title + author — user thinks about physical location
        promptEl.innerHTML = html;
    } else if (type === "author") {
        promptEl.innerHTML = `<p style="margin-bottom:20px;">Who wrote this book?</p>` + html;
    } else if (type === "year") {
        promptEl.innerHTML = `<p style="margin-bottom:20px;">In what year did you finish this?</p>` + html;
    }
    
    nextBtn.style.display = "inline-block";
}

function startOrNextQuiz() {
    const type = document.getElementById("quizTypeSelect").value;
    const book = getRandomBook();
    
    if (!book) {
        document.getElementById("quizPrompt").innerHTML = "<p style='color:#aaa;'>No eligible books (read or DNF) found.</p>";
        document.getElementById("quizNextBtn").style.display = "none";
        return;
    }
    
    renderQuizPrompt(book, type);
    
    // Attach the current book & type to the Next button for reveal logic
    document.getElementById("quizNextBtn").onclick = () => showAnswer(book, type);
}

function showAnswer(book, type) {
    const promptEl = document.getElementById("quizPrompt");
    let answerHtml = `<div style="margin:20px 0; padding:16px; background:#2a2a2a; border-radius:8px; border:1px solid #555;">`;
    
    if (type === "author") {
        answerHtml += `<strong>Author:</strong> ${book.author}<br>`;
        const count = book.reads?.filter(r => r.finished).length || 0;
        answerHtml += `<em>Reads: ${count}</em>`;
    } else if (type === "location") {
        // No data to reveal → just encouragement or skip
        answerHtml += `<em>Think about its place... maybe it's time to reorganize? 📚</em>`;
    } else if (type === "year") {
        const finishedDates = book.reads?.filter(r => r.finished).map(r => new Date(r.finished)) || [];
        if (finishedDates.length > 0) {
            const firstYear = new Date(Math.min(...finishedDates)).getFullYear();
            answerHtml += `<strong>First finished:</strong> ${firstYear}<br>`;
            if (finishedDates.length > 1) {
                const lastYear = new Date(Math.max(...finishedDates)).getFullYear();
                answerHtml += `<em>${finishedDates.length} reads total (last: ${lastYear})</em>`;
            }
        } else {
            answerHtml += `<em>No finish date recorded</em>`;
        }
    }
    
    answerHtml += `</div><p style="margin-top:16px;">Click Next for another book</p>`;
    promptEl.innerHTML += answerHtml;
    
    // Change next button to restart feel
    document.getElementById("quizNextBtn").textContent = "Next Book →";
}

function initQuizTab() {
    const startBtn = document.getElementById("quizStartBtn");
    const nextBtn = document.getElementById("quizNextBtn");
    const select = document.getElementById("quizTypeSelect");
    
    if (!startBtn || !nextBtn || !select) return;
    
    startBtn.addEventListener("click", startOrNextQuiz);
    nextBtn.addEventListener("click", startOrNextQuiz); // reuse same function
    
    // Optional: start automatically on tab switch (comment out if unwanted)
    // startOrNextQuiz();
}

// Export for ui-core.js
window.renderQuiz = function() {
    const tab = document.getElementById("tab-quiz");
    if (tab && tab.classList.contains("active")) {
        initQuizTab();
        // Optional: auto-start first question
        // startOrNextQuiz();
    }
};

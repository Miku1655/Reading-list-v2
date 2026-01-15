function addChallenge() {
    const name = document.getElementById("challengeName").value.trim();
    if (!name) return alert("Please enter a name");

    const type = document.getElementById("challengeType").value;
    const value = document.getElementById("challengeValue").value.trim();
    if (!value) return alert("Please enter a value (e.g. tag name)");

    const target = Number(document.getElementById("challengeTarget").value) || 1;
    const yearly = document.getElementById("challengeYearly").checked;
    const year = yearly ? Number(document.getElementById("challengeYear").value) || getCurrentYear() : null;

    const newChallenge = {
        id: Date.now(),
        name,
        description: document.getElementById("challengeDesc").value.trim(),
        type,
        value,
        targetCount: target,
        yearly,
        year,
        completedBooks: [],
        createdAt: Date.now()
    };

    challenges.push(newChallenge);
    saveChallengesToLocal();
    renderChallengesList();
    clearChallengeForm();
    alert("Challenge added!");
}

function clearChallengeForm() {
    document.getElementById("challengeName").value = "";
    document.getElementById("challengeDesc").value = "";
    document.getElementById("challengeValue").value = "";
    document.getElementById("challengeTarget").value = "5";
    document.getElementById("challengeYearly").checked = false;
    document.getElementById("challengeYear").value = getCurrentYear();
}

function renderChallengesList() {
    const container = document.getElementById("challengesList");
    if (!container) return;

    container.innerHTML = "";

    if (challenges.length === 0) {
        container.innerHTML = "<p style='color:#aaa;'>No custom challenges yet. Create one above!</p>";
        return;
    }

    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.padding = "0";

    challenges.forEach(c => {
        const progress = calculateChallengeProgress(c);
        const percent = Math.min(100, Math.round((progress.current / c.targetCount) * 100));
        const isComplete = progress.current >= c.targetCount;

        const li = document.createElement("li");
        li.style.margin = "12px 0";
        li.style.padding = "12px";
        li.style.background = "#222";
        li.style.borderRadius = "6px";
        li.innerHTML = `
            <strong>${c.name}</strong> 
            <small style="color:#aaa;">(${c.type}: ${c.value})</small>
            ${c.yearly ? `<br><small>Year: ${c.year}</small>` : ''}
            ${c.description ? `<br><small>${c.description}</small>` : ''}
            <br>
            Progress: ${progress.current} / ${c.targetCount} 
            ${isComplete ? ' ✓ Completed!' : ''}
            <div class="progress-bar-container" style="margin-top:8px;">
                <div class="progress-bar-fill" style="width:${percent}%; background:${isComplete ? '#8bc34a' : '#4caf50'};"></div>
            </div>
            <button onclick="deleteChallenge(${c.id})" style="margin-top:8px; background:#444; color:#ff6b6b;">Delete</button>
        `;
        ul.appendChild(li);
    });

    container.appendChild(ul);
}

function deleteChallenge(id) {
    if (!confirm("Delete this challenge?")) return;
    challenges = challenges.filter(c => c.id !== id);
    saveChallengesToLocal();
    renderChallengesList();
}

function calculateChallengeProgress(challenge) {
    let matchingBooks = books.filter(b => {
        if (b.exclusiveShelf !== "read") return false;
        if (challenge.yearly && challenge.year) {
            const latestFinish = getLatestFinished(b);
            if (!latestFinish) return false;
            if (new Date(latestFinish).getFullYear() !== challenge.year) return false;
        }

        switch (challenge.type) {
            case "tag": return (b.tags || []).includes(challenge.value);
            case "author": return b.author?.toLowerCase().includes(challenge.value.toLowerCase());
            case "country": return b.country?.toLowerCase() === challenge.value.toLowerCase();
            case "series": return b.series === challenge.value;
            case "genre": return b.genre?.toLowerCase() === challenge.value.toLowerCase();
            default: return false;
        }
    });

    const count = matchingBooks.length;
    const bookIds = matchingBooks.map(b => b.importOrder);

    // Update completedBooks for persistence if needed
    challenge.completedBooks = bookIds;

    return { current: count, books: matchingBooks };
}

// Toggle yearly input visibility
document.getElementById("challengeYearly")?.addEventListener("change", e => {
    document.getElementById("challengeYearLabel").style.display = e.target.checked ? "inline" : "none";
});

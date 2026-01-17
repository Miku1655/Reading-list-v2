// Core tab/button events
document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
document.getElementById("addBook").addEventListener("click", () => openEditModal());
document.getElementById("searchInput").addEventListener("input", renderTable);
document.getElementById("shelfFilter").addEventListener("change", renderTable);
document.getElementById("refreshWaitingBtn").addEventListener("click", renderWaitingWidget);
document.getElementById("refreshRediscoverBtn").addEventListener("click", renderRediscoverWidget);
document.getElementById("refreshQuoteBtn")?.addEventListener("click", renderQuoteOfTheDay);
document.querySelectorAll("th[data-col]").forEach(th => th.addEventListener("click", () => {
    if (sortState.column === th.dataset.col) {
        sortState.direction *= -1;
    } else {
        sortState.column = th.dataset.col;
        sortState.direction = 1;
    }
    updateSortIndicators();
    renderTable();
}));
document.getElementById("sortRecent").addEventListener("click", () => {
    if (sortState.column === null) {
        sortState.direction *= -1;
    } else {
        sortState.column = null;
        sortState.direction = -1;
    }
    updateSortIndicators();
    renderTable();
});

// Close modal handlers
document.getElementById("closeEdit").addEventListener("click", () => {
    const collapsed = [];
    document.querySelectorAll(".edit-section").forEach((sec, idx) => {
        if (sec.classList.contains("collapsed")) collapsed.push(idx);
    });
    localStorage.setItem("reading_edit_collapsed_sections", JSON.stringify(collapsed));
    closeEditModal();
});
document.getElementById("editModal").addEventListener("click", e => {
    if (e.target === document.getElementById("editModal")) closeEditModal();
});

// Cloud sync buttons
document.getElementById("saveCloudBtn").addEventListener("click", () => {
    if (!currentUser) return alert("Sign in first");
    if (!confirm("Overwrite cloud data with current local data?")) return;
    const dataToSave = {
        books: books,
        profile: profile,
        goals: goals,
        challenges: challenges,
        shelfColors: shelfColors,
        settings: {
            showNumbers: document.getElementById("showNumbers").checked,
            minAuthorBooks: minAuthorBooks,
            showCoversTimeline: showCoversInTimeline,
            showYearGoalProgress: showYearGoalProgress
        }
    };
    userRef.set(dataToSave)
        .then(() => alert("Saved to cloud successfully!"))
        .catch(err => alert("Save failed: " + err.message));
});
document.getElementById("loadCloudBtn").addEventListener("click", () => {
    if (!currentUser) return alert("Sign in first");
    if (!confirm("Overwrite local data with cloud data? This cannot be undone.")) return;
    userRef.once("value")
        .then(snap => {
            const data = snap.val();
            if (!data) return alert("No data in cloud");
            books = data.books || [];
            profile = data.profile || { favourites: [], favouriteSeries: [] };
            goals = data.goals || {};
            shelfColors = data.shelfColors || {};
            challenges = data.challenges || [];
            challenges.forEach(c => {
                if (!c.id) c.id = Date.now() + Math.random(); // ensure unique ID
            });
            const settings = data.settings || {};
            document.getElementById("showNumbers").checked = settings.showNumbers ?? true;
            minAuthorBooks = settings.minAuthorBooks ?? 2;
            document.getElementById("minAuthorBooks").value = minAuthorBooks;
            showCoversInTimeline = settings.showCoversTimeline ?? false;
            document.getElementById("showCoversTimeline").checked = showCoversInTimeline;
            showYearGoalProgress = settings.showYearGoalProgress ?? true;
            document.getElementById("showYearGoalProgress").checked = showYearGoalProgress;
            hideToReadExceptOwnShelf = settings.hideToReadExceptOwnShelf ?? false;
            document.getElementById("hideToReadExceptOwn").checked = hideToReadExceptOwnShelf;
            document.getElementById("profileNick").value = profile.nick || "";
            document.getElementById("profileBio").value = profile.bio || "";
            if (profile.picture) document.getElementById("profilePic").src = profile.picture;
           
            saveBooksToLocal();
            localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
            localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
            localStorage.setItem(SHELF_COLORS_KEY, JSON.stringify(shelfColors));
            saveChallengesToLocal();
            renderAll();
            alert("Loaded from cloud successfully!");
        })
        .catch(err => alert("Load failed: " + err.message));
});
document.getElementById("saveCoversCloud").addEventListener("click", () => {
    if (!currentUser) return alert("Sign in first");
    if (!confirm("Save covers to cloud (separate from main data)?")) return;
    const covers = {};
    books.forEach(b => {
        if (b.coverUrl) covers[b.importOrder] = b.coverUrl;
    });
    userRef.child("covers").set(covers)
        .then(() => alert("Covers saved to cloud!"))
        .catch(err => alert("Save failed: " + err.message));
});
document.getElementById("loadCoversCloud").addEventListener("click", () => {
    if (!currentUser) return alert("Sign in first");
    if (!confirm("Load covers from cloud? This will overwrite local covers.")) return;
    userRef.child("covers").once("value")
        .then(snap => {
            const covers = snap.val() || {};
            let changed = false;
            books.forEach(b => {
                const newUrl = covers[b.importOrder];
                if (newUrl && newUrl !== b.coverUrl) {
                    b.coverUrl = newUrl;
                    changed = true;
                }
            });
            if (changed) {
                saveBooksToLocal();
                renderAll();
            }
            alert("Covers loaded!");
        })
        .catch(err => alert("Load failed: " + err.message));
});
document.getElementById("deleteCoversCloud").addEventListener("click", () => {
    if (!currentUser) return alert("Sign in first");
    if (!confirm("Delete all covers from cloud? This is irreversible.")) return;
    userRef.child("covers").remove()
        .then(() => alert("Covers deleted from cloud!"))
        .catch(err => alert("Delete failed: " + err.message));
});
// Covers management
document.getElementById("fetchAllCovers").addEventListener("click", async () => {
    const missing = books.filter(b => !b.coverUrl && b.title);
    if (missing.length === 0) return alert("No books are missing covers.");
    if (!confirm(`Auto-fetch covers for ${missing.length} book(s)? This may take a while.`)) return;
    let found = 0;
    for (const b of missing) {
        const url = await fetchCover(b);
        if (url) {
            b.coverUrl = url;
            found++;
            saveBooksToLocal();
            renderAll();
        }
        await new Promise(r => setTimeout(r, 800)); // rate limit
    }
    alert(`Done! Found covers for ${found} book(s).`);
});
document.getElementById("clearLocalCovers").addEventListener("click", () => {
    if (!confirm("Remove ALL cover URLs from local data? This is irreversible locally.")) return;
    books.forEach(b => b.coverUrl = null);
    saveBooksToLocal();
    renderAll();
    alert("All local covers cleared.");
});
// Import/Export/Clear
document.getElementById("fileInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const text = ev.target.result;
        if (file.name.toLowerCase().endsWith(".json")) {
            importJSON(text);
        } else if (file.name.toLowerCase().endsWith(".csv")) {
            if (confirm("Import CSV (Goodreads format)? This will replace your current list.")) {
                parseCSV(text);
            }
        } else {
            alert("Please select a .json or .csv file");
        }
    };
    reader.readAsText(file);
});
document.getElementById("exportData").addEventListener("click", () => {
    const data = { books, profile, goals, shelfColors };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reading-list-export.json";
    a.click();
    URL.revokeObjectURL(url);
});
document.getElementById("clearStorage").addEventListener("click", () => {
    if (confirm("Clear all local data? (Cloud data stays if signed in)")) {
        localStorage.clear();
        books = [];
        profile = { favourites: [], favouriteSeries: [] };
        goals = {};
        shelfColors = {};
        loadLocalData();
        renderAll();
    }
});
// Goals
document.getElementById("goalYear").addEventListener("change", () => {
    loadGoalsForYear();
    renderChallengesTab();
});
document.getElementById("saveGoal").addEventListener("click", () => {
    const year = Number(document.getElementById("goalYear").value) || new Date().getFullYear();
    const booksG = Number(document.getElementById("yearBooksGoal").value) || 0;
    const pages = Number(document.getElementById("yearPagesGoal").value) || 0;
    if (booksG || pages) {
        goals[year] = { books: booksG, pages };
    } else {
        delete goals[year];
    }
    localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
    renderChallengesTab();
    renderYearGoalProgress();
});
document.getElementById("removeGoal").addEventListener("click", () => {
    const year = Number(document.getElementById("goalYear").value);
    if (goals[year] && confirm(`Remove goals for ${year}?`)) {
        delete goals[year];
        localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
        loadGoalsForYear();
        renderChallengesTab();
        renderYearGoalProgress();
    }
});
// Settings
document.getElementById("showNumbers").addEventListener("change", e => {
    const value = e.target.checked;
    localStorage.setItem(SHOW_NUM_KEY, JSON.stringify(value));
    renderTable();  // usually needed after this setting changes
});
document.getElementById("showYearGoalProgress").addEventListener("change", e => {
    showYearGoalProgress = e.target.checked;
    localStorage.setItem(SHOW_YEAR_GOAL_PROGRESS_KEY, JSON.stringify(showYearGoalProgress));
    renderYearGoalProgress();
});
document.getElementById("minAuthorBooks").addEventListener("change", () => {
    minAuthorBooks = Math.max(1, Number(document.getElementById("minAuthorBooks").value) || 2);
    localStorage.setItem(MIN_AUTHOR_BOOKS_KEY, minAuthorBooks);
    renderStats();
});
document.getElementById("showCoversTimeline").addEventListener("change", e => {
    showCoversInTimeline = e.target.checked;
    localStorage.setItem(SHOW_COVERS_TIMELINE_KEY, JSON.stringify(showCoversInTimeline));
    renderTimeline();
});
document.getElementById("hideToReadExceptOwn").addEventListener("change", e => {
    hideToReadExceptOwnShelf = e.target.checked;
    localStorage.setItem(HIDE_TO_READ_KEY, JSON.stringify(hideToReadExceptOwnShelf));
    renderTable();
});
// Profile
document.getElementById("profilePic").addEventListener("click", () => document.getElementById("profilePicInput").click());
document.getElementById("profilePicInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        profile.picture = ev.target.result;
        document.getElementById("profilePic").src = profile.picture;
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    };
    reader.readAsDataURL(file);
});

let profileSaveTimeout;
document.getElementById("profileNick").addEventListener("input", () => {
    clearTimeout(profileSaveTimeout);
    profileSaveTimeout = setTimeout(() => {
        profile.nick = document.getElementById("profileNick").value.trim();
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }, 800);
});
document.getElementById("profileBio").addEventListener("input", () => {
    clearTimeout(profileSaveTimeout);
    profileSaveTimeout = setTimeout(() => {
        profile.bio = document.getElementById("profileBio").value.trim();
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }, 800);
});
// Modal fetch cover
document.getElementById("fetchCoverBtn").addEventListener("click", async () => {
    const title = document.getElementById("editTitle").value.trim();
    if (!title) return alert("Enter a title first.");
    const tempBook = {
        title: title,
        author: document.getElementById("editAuthor").value.trim()
    };
    const url = await fetchCover(tempBook);
    const preview = document.getElementById("coverPreview");
    if (url) {
        document.getElementById("editCoverUrl").value = url;
        preview.src = url;
        preview.style.display = "block";
    } else {
        alert("No cover found for this book.");
    }
});
// Search info
document.getElementById("filterInfo").addEventListener("click", () => {
    alert(`Search syntax:
• Normal words → title / author / series / notes
• rated>3 rated=0 (unrated) rated>=4 etc.
• pages>300 pages<=100 pages=500
• year>=-50 year<10 year=-500 (negative = BC)
• cover=true/false or cover=1/0
• lang:english, language:jap, lang:none
• country:japan, country:usa, country:none
• genre:fantasy, genre:mystery, genre:none
• tag:mood, tag:prize, tag:none
• added:2024, added>2023-06-01, added:none
Combine with spaces (AND).`);
});
// Auth buttons
document.getElementById("signInBtn").addEventListener("click", () => {
    const email = document.getElementById("authEmail").value.trim();
    const pass = document.getElementById("authPassword").value;
    if (!email || !pass) return alert("Enter email and password");
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert("Sign in error: " + err.message));
});
document.getElementById("signUpBtn").addEventListener("click", () => {
    const email = document.getElementById("authEmail").value.trim();
    const pass = document.getElementById("authPassword").value;
    if (!email || !pass) return alert("Enter email and password");
    auth.createUserWithEmailAndPassword(email, pass).catch(err => alert("Sign up error: " + err.message));
});
document.getElementById("signOutBtn").addEventListener("click", () => auth.signOut());

// Initial load
document.addEventListener("DOMContentLoaded", () => {
    initApp(); // From ui-core.js
    document.getElementById("goalYear").value = new Date().getFullYear();
    loadGoalsForYear();
    if (localStorage.getItem(TAB_KEY) === "constellation") {
        setTimeout(initConstellation, 100); // give time for canvas to exist
    }
});

document.getElementById("addChallenge")?.addEventListener("click", addChallenge);
document.getElementById("challengeYearly")?.addEventListener("change", e => {
    document.getElementById("challengeYearLabel").style.display = e.target.checked ? "inline" : "none";
});

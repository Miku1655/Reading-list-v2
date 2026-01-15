function createNotePopup() {
    notePopup = document.createElement("div");
    notePopup.style.position = "absolute";
    notePopup.style.background = "#222";
    notePopup.style.color = "#eee";
    notePopup.style.padding = "8px";
    notePopup.style.border = "1px solid #444";
    notePopup.style.borderRadius = "4px";
    notePopup.style.zIndex = "3000";
    notePopup.style.display = "none";
    notePopup.style.maxWidth = "300px";
    notePopup.style.pointerEvents = "none";
    document.body.appendChild(notePopup);
}

function showNotePopup(popup, text) {
    popup.textContent = text;
    popup.style.display = "block";
    document.addEventListener("mousemove", moveNotePopup);
}

function hideNotePopup(popup) {
    popup.style.display = "none";
    document.removeEventListener("mousemove", moveNotePopup);
}

function moveNotePopup(e) {
    if (!notePopup) return;
    notePopup.style.left = (e.clientX + 15) + "px";
    notePopup.style.top = (e.clientY + 20) + "px";
}

function switchTab(name) {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === "tab-" + name));
    localStorage.setItem(TAB_KEY, name);

    // Tab-specific immediate actions (minimal, fast)
    if (name === "options") { renderShelfManager(); updateCoversCount(); }
    if (name === "profile") {
        renderProfileStats();
        renderRecentBooks();
        renderFavourites();
        renderWaitingWidget();
        renderOnThisDay()
    }
    if (name === "list") renderYearGoalProgress();

    renderTable(); // always fast

    // Full refresh including heavy tab-specific renders
    renderAll();
}

function renderAll() {
    populateShelfFilter();
    renderTable();
    renderProfileStats();
    renderRecentBooks();
    renderFavourites();
    renderYearGoalProgress();
    renderWaitingWidget();
    updateCoversCount();
    if (document.querySelector('.tab.active')?.dataset.tab === "options") renderShelfManager();

    // Tab-specific heavy renders (charts/timeline/challenges) – safe & consistent
    const activeTab = document.querySelector('.tab.active')?.dataset.tab;
    if (activeTab === "stats") renderStats();
    if (activeTab === "timeline") renderTimeline();
    if (activeTab === "challenges") {
        loadGoalsForYear();
        renderChallengesTab();
    }
}

function renderShelfManager() {
    const container = document.getElementById("shelfManager");
    container.innerHTML = "";
    const set = new Set();
    books.forEach(b => (b.shelves || []).forEach(s => set.add(s)));
    [...set].sort().forEach(shelf => {
        const div = document.createElement("div");
        div.style.marginBottom = "8px";
        div.innerHTML = `
            <input type="text" value="${shelf}" style="width:150px;" class="shelfName">
            <input type="color" value="${shelfColors[shelf] || '#888888'}" class="shelfColor">
            <button class="renameShelf">Rename</button>
            <button class="deleteShelf">Delete</button>
        `;
        container.appendChild(div);
        div.querySelector(".shelfColor").addEventListener("input", e => {
            shelfColors[shelf] = e.target.value;
            localStorage.setItem(SHELF_COLORS_KEY, JSON.stringify(shelfColors));
            renderTable();
        });
        div.querySelector(".renameShelf").addEventListener("click", () => {
            const newName = div.querySelector(".shelfName").value.trim();
            if (!newName || newName === shelf) return;
            if (!confirm(`Rename "${shelf}" → "${newName}" everywhere?`)) return;
            books.forEach(b => {
                if (b.shelves) b.shelves = b.shelves.map(s => s === shelf ? newName : s);
            });
            shelfColors[newName] = shelfColors[shelf] || '#888888';
            delete shelfColors[shelf];
            localStorage.setItem(SHELF_COLORS_KEY, JSON.stringify(shelfColors));
            saveBooksToLocal();
            renderAll();
        });
        div.querySelector(".deleteShelf").addEventListener("click", () => {
            if (!confirm(`Remove shelf "${shelf}" from all books?`)) return;
            books.forEach(b => {
                if (b.shelves) b.shelves = b.shelves.filter(s => s !== shelf);
            });
            delete shelfColors[shelf];
            localStorage.setItem(SHELF_COLORS_KEY, JSON.stringify(shelfColors));
            saveBooksToLocal();
            renderAll();
        });
    });
}

// All event listeners
document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
document.getElementById("addBook").addEventListener("click", () => openEditModal());
document.getElementById("searchInput").addEventListener("input", renderTable);
document.getElementById("shelfFilter").addEventListener("change", renderTable);
document.getElementById("refreshWaitingBtn").addEventListener("click", renderWaitingWidget);
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
function updateSortIndicators() {
    document.querySelectorAll(".sort").forEach(s => s.textContent = "");
    document.getElementById("recentSortIndicator").textContent = "";
    if (sortState.column) {
        const el = document.querySelector(`th[data-col="${sortState.column}"] .sort`);
        if (el) el.textContent = sortState.direction > 0 ? "▲" : "▼";
    } else {
        document.getElementById("recentSortIndicator").textContent = sortState.direction === -1 ? "▼" : "▲";
    }
}

// Close modal handlers
document.getElementById("closeEdit").addEventListener("click", () => {
    // Save collapsed on close too
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

// Initial load
const savedTab = localStorage.getItem(TAB_KEY) || "list";
switchTab(savedTab);
renderAll();

function loadGoalsForYear() {
    const year = Number(document.getElementById("goalYear").value) || new Date().getFullYear();
    document.getElementById("goalYear").value = year;
    const g = goals[year] || {};
    document.getElementById("yearBooksGoal").value = g.books || "";
    document.getElementById("yearPagesGoal").value = g.pages || "";
}

// Cloud sync buttons
document.getElementById("saveCloudBtn").addEventListener("click", () => {
    if (!currentUser) return alert("Sign in first");
    if (!confirm("Overwrite cloud data with current local data?")) return;
    const dataToSave = {
        books: books,
        profile: profile,
        goals: goals,
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
            const settings = data.settings || {};
            document.getElementById("showNumbers").checked = settings.showNumbers ?? true;
            minAuthorBooks = settings.minAuthorBooks ?? 2;
            minAuthorBooksInput.value = minAuthorBooks;
            showCoversInTimeline = settings.showCoversTimeline ?? false;
            document.getElementById("showCoversTimeline").checked = showCoversInTimeline;
            showYearGoalProgress = settings.showYearGoalProgress ?? true;
            document.getElementById("showYearGoalProgress").checked = showYearGoalProgress;
            document.getElementById("profileNick").value = profile.nick || "";
            document.getElementById("profileBio").value = profile.bio || "";
            if (profile.picture) document.getElementById("profilePic").src = profile.picture;
            
            saveBooksToLocal();
            localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
            localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
            localStorage.setItem(SHELF_COLORS_KEY, JSON.stringify(shelfColors));
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

// New function
function renderChallengesTab() {
    const container = document.getElementById("challengesProgressContainer");
    if (!container) return;
    let html = "";
    const currentYear = getCurrentYear();
    const stats = getYearStats(currentYear);
    const goal = goals[currentYear] || {};
    const daysElapsed = getDaysElapsed(currentYear);

    html += `<div class="stats-block"><h2>${currentYear} Pace & Projection</h2><div class="stats-list">`;
    html += `Finished so far (${daysElapsed} days into the year): <strong>${stats.books} books</strong>, <strong>${stats.pages} pages</strong><br><br>`;
    if (daysElapsed > 0) {
        const booksPace = (stats.books / daysElapsed).toFixed(2);
        const pagesPace = Math.round(stats.pages / daysElapsed);
        html += `Current pace: <strong>${booksPace} books/day</strong>, <strong>${pagesPace} pages/day</strong><br><br>`;
        const projectedBooks = calculateProjection(stats.books, currentYear);
        const projectedPages = calculateProjection(stats.pages, currentYear);
        html += `Projected by Dec 31: <strong>${projectedBooks} books</strong>, <strong>${projectedPages} pages</strong><br><br>`;
    } else {
        html += `Year just started – no pace data yet.<br><br>`;
    }

    if (goal.books || goal.pages) {
        html += `<strong>Goal Progress</strong><br>`;
        if (goal.books) {
            const rawPercent = goal.books > 0 ? (stats.books / goal.books * 100) : 0;
            const percent = Math.min(100, Math.round(rawPercent));
            let text = `${stats.books} / ${goal.books} (${Math.round(rawPercent)}%)`;
            if (stats.books >= goal.books) text += ` ✓ Goal completed (+${stats.books - goal.books} extra)`;
            html += `${text}<br>`;
            html += `<div class="progress-bar-container"><div class="progress-bar-fill books-fill" style="width:${percent}%;"></div></div>`;
        }
        if (goal.pages) {
            const rawPercent = goal.pages > 0 ? (stats.pages / goal.pages * 100) : 0;
            const percent = Math.min(100, Math.round(rawPercent));
            let text = `${stats.pages} / ${goal.pages} (${Math.round(rawPercent)}%)`;
            if (stats.pages >= goal.pages) text += ` ✓ Goal completed (+${stats.pages - goal.pages} extra)`;
            html += `${text}<br>`;
            html += `<div class="progress-bar-container"><div class="progress-bar-fill pages-fill" style="width:${percent}%;"></div></div>`;
        }
    } else {
        html += `<em>No goals set for ${currentYear} yet.</em>`;
    }
    html += `</div></div>`;

    const selectedYear = Number(document.getElementById("goalYear").value) || currentYear;
    if (selectedYear !== currentYear) {
        const sStats = getYearStats(selectedYear);
        const sGoal = goals[selectedYear] || {};
        if (sGoal.books || sGoal.pages) {
            html += `<div class="stats-block" style="margin-top:20px;"><h2>Goal Progress for ${selectedYear}</h2><div class="stats-list">`;
            html += `Finished: ${sStats.books} books, ${sStats.pages} pages<br><br>`;
            if (sGoal.books) {
                const rawPercent = sGoal.books > 0 ? (sStats.books / sGoal.books * 100) : 0;
                const percent = Math.min(100, Math.round(rawPercent));
                let text = `${sStats.books} / ${sGoal.books} (${Math.round(rawPercent)}%)`;
                if (sStats.books >= sGoal.books) text += ` (completed)`;
                html += `${text}<br>`;
                html += `<div class="progress-bar-container"><div class="progress-bar-fill books-fill" style="width:${percent}%;"></div></div>`;
            }
            if (sGoal.pages) {
                const rawPercent = sGoal.pages > 0 ? (sStats.pages / sGoal.pages * 100) : 0;
                const percent = Math.min(100, Math.round(rawPercent));
                let text = `${sStats.pages} / ${sGoal.pages} (${Math.round(rawPercent)}%)`;
                if (sStats.pages >= sGoal.pages) text += ` (completed)`;
                html += `${text}<br>`;
                html += `<div class="progress-bar-container"><div class="progress-bar-fill pages-fill" style="width:${percent}%;"></div></div>`;
            }
            html += `</div></div>`;
        }
    }

    container.innerHTML = html;
}

// Settings
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

// Auth buttons (already handled by listener, but add clicks if needed)
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

// Year in Review modal
document.getElementById("openYearReview").addEventListener("click", openYearReview);
document.getElementById("closeYearReview").addEventListener("click", () => {
    document.getElementById("yearReviewModal").style.display = "none";
});
document.getElementById("yearReviewModal").addEventListener("click", e => {
    if (e.target === document.getElementById("yearReviewModal")) {
        document.getElementById("yearReviewModal").style.display = "none";
    }
});
document.getElementById("reviewYearSelect").addEventListener("change", async e => {
    tempCoverDataUrls = {}; // Clear old
    await generateYearReview(Number(e.target.value));
});

document.getElementById("closeYearReview").addEventListener("click", () => {
    document.getElementById("yearReviewModal").style.display = "none";
    tempCoverDataUrls = {}; // Clear memory
});
document.getElementById("exportReviewPNG").addEventListener("click", exportReviewAsPNG);
document.getElementById("exportReviewPDF").addEventListener("click", exportReviewAsPDF);
// Initial setup
document.getElementById("goalYear").value = new Date().getFullYear();
loadGoalsForYear();

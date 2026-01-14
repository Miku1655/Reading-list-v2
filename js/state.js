// Global state
let currentUser = null;
let userRef = null;
let editingBook = null;
let books = [];
let nextImportOrder = 1;
let sortState = { column: null, direction: -1 }; // -1 = newest first for recent sort
let shelfColors = {};
let goals = {};
let profile = { favourites: [], favouriteSeries: [] };
let draggedElement = null;
let minAuthorBooks = 2;
let showCoversInTimeline = false;
let showYearGoalProgress = true;
let notePopup = null;

// Element references (we'll get these in ui.js later, but declare here if needed)

// Load from localStorage on start
function loadLocalData() {
    const savedBooks = localStorage.getItem(STORAGE_KEY);
    if (savedBooks) {
        try { books = JSON.parse(savedBooks); } catch { books = []; }
    } else {
        books = [];
    }

    let maxOrder = 0;
    books.forEach(b => {
        if (!b.importOrder) b.importOrder = nextImportOrder++;
        maxOrder = Math.max(maxOrder, b.importOrder ?? 0);

        // Migrate old read data if needed
        if (!Array.isArray(b.reads)) {
            b.reads = [];
            if (b.dateRead) {
                const finishDates = b.dateRead.split(",").map(d => d.trim()).filter(Boolean);
                finishDates.forEach(fd => {
                    const fTs = new Date(fd).getTime();
                    if (!isNaN(fTs)) {
                        b.reads.push({ started: b.dateStarted || null, finished: fTs });
                    }
                });
            }
            if (b.exclusiveShelf === "currently-reading" && b.dateStarted) {
                const sTs = new Date(b.dateStarted).getTime();
                if (!isNaN(sTs)) {
                    b.reads.push({ started: sTs, finished: null });
                }
            }
            delete b.dateRead;
            delete b.dateStarted;
            delete b.readCount;
            delete b.lastFinished;
        }
        if (!Array.isArray(b.tags)) b.tags = [];
    });
    nextImportOrder = maxOrder + 1;

    const savedProfile = localStorage.getItem(PROFILE_KEY);
    profile = savedProfile ? JSON.parse(savedProfile) : { favourites: [], favouriteSeries: [] };
    profile.favourites = (profile.favourites || []).filter(id => typeof id === 'number' && books.some(b => b.importOrder === id));
    profile.favouriteSeries = (profile.favouriteSeries || []).filter(s => typeof s === 'string');

    goals = JSON.parse(localStorage.getItem(GOALS_KEY) || "{}");
    shelfColors = JSON.parse(localStorage.getItem(SHELF_COLORS_KEY) || "{}");

    // Settings
    document.getElementById("showNumbers").checked = JSON.parse(localStorage.getItem(SHOW_NUM_KEY) || "true");
    minAuthorBooks = Number(localStorage.getItem(MIN_AUTHOR_BOOKS_KEY)) || 2;
    minAuthorBooksInput.value = minAuthorBooks;
    showCoversInTimeline = JSON.parse(localStorage.getItem(SHOW_COVERS_TIMELINE_KEY) || "false");
    document.getElementById("showCoversTimeline").checked = showCoversInTimeline;
    showYearGoalProgress = JSON.parse(localStorage.getItem(SHOW_YEAR_GOAL_PROGRESS_KEY) || "true");
    document.getElementById("showYearGoalProgress").checked = showYearGoalProgress;

    // Profile fields
    document.getElementById("profileNick").value = profile.nick || "";
    document.getElementById("profileBio").value = profile.bio || "";
    if (profile.picture) document.getElementById("profilePic").src = profile.picture;

    loadGoalsForYear();
    updateCoversCount();
}

function saveBooksToLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

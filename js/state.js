// Element references needed early (for loadLocalData)
const minAuthorBooksInput = document.getElementById("minAuthorBooks");
const showCoversTimelineCheckbox = document.getElementById("showCoversTimeline");
const showYearGoalProgressCheckbox = document.getElementById("showYearGoalProgress");
const profileNickInput = document.getElementById("profileNick");
const profileBioTextarea = document.getElementById("profileBio");
const profilePicImg = document.getElementById("profilePic");
const coversCountP = document.getElementById("coversCount");
const goalYearInput = document.getElementById("goalYear");
const yearBooksGoalInput = document.getElementById("yearBooksGoal");
const yearPagesGoalInput = document.getElementById("yearPagesGoal");

// Global state (rest unchanged)
let currentUser = null;
let userRef = null;
let editingBook = null;
let books = [];
let nextImportOrder = 1;
let sortState = { column: null, direction: -1 };
let shelfColors = {};
let goals = {};
let profile = { favourites: [], favouriteSeries: [] };
let draggedElement = null;
let minAuthorBooks = 2;
let showCoversInTimeline = false;
let challenges = [];
let showYearGoalProgress = true;
let notePopup = null;

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
    
    if (!Array.isArray(b.reads)) {
        b.reads = [];
        // (migration code unchanged)
    }
    if (!Array.isArray(b.tags)) b.tags = [];
    if (!Array.isArray(b.quotes)) {
        b.quotes = [];
    }
    const savedChallenges = localStorage.getItem(CHALLENGES_KEY);
challenges = savedChallenges ? JSON.parse(savedChallenges) : [];

// Migration: ensure id exists for old ones (if any)
challenges.forEach(c => {
    if (!c.id) c.id = Date.now() + Math.random(); // simple unique
});
});
    nextImportOrder = maxOrder + 1;

    const savedProfile = localStorage.getItem(PROFILE_KEY);
    profile = savedProfile ? JSON.parse(savedProfile) : { favourites: [], favouriteSeries: [] };
    // (filter code unchanged)

    goals = JSON.parse(localStorage.getItem(GOALS_KEY) || "{}");
    shelfColors = JSON.parse(localStorage.getItem(SHELF_COLORS_KEY) || "{}");

    // Settings
    document.getElementById("showNumbers").checked = JSON.parse(localStorage.getItem(SHOW_NUM_KEY) || "true");
    minAuthorBooks = Number(localStorage.getItem(MIN_AUTHOR_BOOKS_KEY)) || 2;
    minAuthorBooksInput.value = minAuthorBooks;
    showCoversInTimeline = JSON.parse(localStorage.getItem(SHOW_COVERS_TIMELINE_KEY) || "false");
    showCoversTimelineCheckbox.checked = showCoversInTimeline;
    showYearGoalProgress = JSON.parse(localStorage.getItem(SHOW_YEAR_GOAL_PROGRESS_KEY) || "true");
    showYearGoalProgressCheckbox.checked = showYearGoalProgress;

    // Profile
    profileNickInput.value = profile.nick || "";
    profileBioTextarea.value = profile.bio || "";
    if (profile.picture) profilePicImg.src = profile.picture;

    loadGoalsForYear();
    updateCoversCount();
}

function saveBooksToLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

function loadGoalsForYear() {
    const year = Number(goalYearInput.value) || new Date().getFullYear();
    goalYearInput.value = year;
    const g = goals[year] || {};
    yearBooksGoalInput.value = g.books || "";
    yearPagesGoalInput.value = g.pages || "";
}

function updateCoversCount() {
    const count = books.filter(b => b.coverUrl).length;
    const total = books.length;
    coversCountP.textContent =
        `${count} of ${total} books have covers (remote URLs – no disk space used by the app)`;
}

function saveChallengesToLocal() {
    localStorage.setItem(CHALLENGES_KEY, JSON.stringify(challenges));
}

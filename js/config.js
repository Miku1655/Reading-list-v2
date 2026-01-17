// Firebase config (keep this exact – it's public anyway)
const firebaseConfig = {
  apiKey: "AIzaSyA8UlXHK1HPSeKAuCfEquonyjnT24ZWjcA",
  authDomain: "readinglist-75c4a.firebaseapp.com",
  databaseURL: "https://readinglist-75c4a-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "readinglist-75c4a",
  storageBucket: "readinglist-75c4a.firebasestorage.app",
  messagingSenderId: "717466374536",
  appId: "1:717466374536:web:a331148d9d3c378dd0ea3d"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// Storage keys
const STORAGE_KEY = "reading_list_data";
const SHOW_NUM_KEY = "reading_list_show_numbers";
const TAB_KEY = "reading_list_active_tab";
const GOALS_KEY = "reading_goals_per_year";
const SHELF_COLORS_KEY = "reading_shelf_colors";
const PROFILE_KEY = "reading_list_profile";
const MIN_AUTHOR_BOOKS_KEY = "reading_min_author_books";
const SHOW_COVERS_TIMELINE_KEY = "reading_show_covers_timeline";
const SHOW_YEAR_GOAL_PROGRESS_KEY = "reading_show_year_goal_progress";
const CHALLENGES_KEY = "reading_challenges";
const DAILY_NOTES_KEY = "reading_daily_notes";
const HIDE_TO_READ_KEY = "reading_hide_to_read_except_own_shelf";

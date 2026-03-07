// alt-titles.js
// Helper functions for alternative title language support

const TITLE_LANG_KEY = "reading_title_lang_pref";
let titleLangPref = "original"; // "original" | "pl" | "en" | "ja"

// Language normalisation: maps various spellings → canonical lang code
const LANG_ALIASES = {
    // Polish
    "pl": "pl", "polish": "pl", "polski": "pl", "polskie": "pl",
    // English
    "en": "en", "english": "en", "ang": "en", "angielski": "en",
    // Japanese
    "ja": "ja", "japanese": "ja", "jp": "ja", "japonski": "ja",
    "japoński": "ja", "japońskie": "ja"
};

/**
 * Returns the canonical language code ("pl"|"en"|"ja"|null) for a book's language field.
 */
function getBookLangCode(book) {
    const raw = (book.language || "").trim().toLowerCase();
    return LANG_ALIASES[raw] || null;
}

/**
 * Returns the preferred display title for a book.
 * Falls back to original title if the preferred alt title is unavailable.
 */
function getDisplayTitle(book) {
    if (!book) return "";
    const pref = titleLangPref;
    if (pref === "original") return book.title || "";

    const bookLang = getBookLangCode(book);

    // If the book is already in the preferred language, just return original title
    if (bookLang === pref) return book.title || "";

    const altTitles = book.altTitles || {};
    const alt = altTitles[pref];
    if (alt && alt.trim()) return alt.trim();

    // Fallback to original
    return book.title || "";
}

/**
 * Load titleLangPref from localStorage and sync the select element.
 */
function loadTitleLangPref() {
    titleLangPref = localStorage.getItem(TITLE_LANG_KEY) || "original";
    const sel = document.getElementById("titleLangPref");
    if (sel) sel.value = titleLangPref;
}

/**
 * Save titleLangPref to localStorage and re-render wherever titles appear.
 */
function saveTitleLangPref(val) {
    titleLangPref = val;
    localStorage.setItem(TITLE_LANG_KEY, val);
    renderTable?.();
    // Re-render battle if active
    if (document.getElementById("tab-battle")?.classList.contains("active")) {
        renderBattle?.();
    }
}

function getReadCount(book) {
    return book.reads ? book.reads.filter(r => r.finished !== null).length : 0;
}
function getLatestFinished(book) {
    if (!book.reads || book.reads.length === 0) return 0;
    const finished = book.reads.map(r => r.finished).filter(t => t !== null);
    return finished.length > 0 ? Math.max(...finished) : 0;
}
function getCurrentReadStart(book) {
    if (!book.reads || book.reads.length === 0) return 0;
    const current = book.reads.find(r => r.finished === null);
    return current ? current.started || 0 : 0;
}
function getSortTimestamp(book) {
 
    const latestFinished = getLatestFinished(book);
    if (latestFinished > 0) return latestFinished;
    const currentStart = getCurrentReadStart(book);
    if (currentStart > 0) return currentStart;
    return book.dateAdded || 0;
}
function compare(a, b, col) {
    let av = a[col];
    let bv = b[col];
    if (col === "year") {
        av = av ?? Infinity;
        bv = bv ?? Infinity;
        return av - bv;
    }
    if (col === "pages" || col === "rating") {
        av = av ?? 0;
        bv = bv ?? 0;
        return av - bv;
    }
    if (col === "lastRead") {
        return getLatestFinished(a) - getLatestFinished(b);
    }
    if (col === "readCount") {
        return getReadCount(a) - getReadCount(b);
    }
    if (col === "shelves") {
        av = [a.exclusiveShelf, ...(a.shelves || [])].join(", ");
        bv = [b.exclusiveShelf, ...(b.shelves || [])].join(", ");
    }
    av = av ?? "";
    bv = bv ?? "";
    return String(av).localeCompare(String(bv));
}
function calculateReadingSpeeds() {
    const validReads = [];
    books.forEach(book => {
        if (!book.reads || book.pages <= 0) return;
        book.reads.forEach(read => {
            if (read.started !== null && read.finished !== null) {
                const days = (read.finished - read.started) / (1000 * 60 * 60 * 24);
                if (days > 0) {
                    validReads.push({
                        book: book,
                        speed: book.pages / days,
                        days: days
                    });
                }
            }
        });
    });
    if (validReads.length === 0) {
        return { avg: "0", fastest: null, slowest: null };
    }
    const speeds = validReads.map(r => r.speed);
    const avg = (speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(1);
    validReads.sort((a, b) => b.speed - a.speed);
    const fastest = validReads[0];
    const slowest = validReads[validReads.length - 1];
    return { avg, fastest, slowest };
}
function calculatePerYear() {
    const perYear = {};
    books.forEach(b => {
        if (!b.reads) return;
        b.reads.forEach(read => {
            if (!read.finished) return;
            let timestamp = read.finished;
            if (typeof timestamp === 'string') {
                timestamp = Date.parse(timestamp);
                if (isNaN(timestamp)) {
                    const cleaned = timestamp.trim().replace(/(\d+)(st|nd|rd|th)/, '$1');
                    timestamp = Date.parse(cleaned);
                }
                if (isNaN(timestamp)) {
                    console.warn("Could not parse finished date – skipping:", read.finished, "in book:", b.title || "unknown");
                    return;
                }
            } else if (typeof timestamp === 'number') {
            } else {
                console.warn("Unexpected finished type – skipping:", typeof timestamp, read.finished, "in book:", b.title);
                return;
            }
            const dt = new Date(timestamp);
            const y = dt.getFullYear();
            if (isNaN(y)) {
                console.warn("Invalid year after parsing – skipping:", read.finished);
                return;
            }
            perYear[y] = perYear[y] || { books: 0, pages: 0 };
            perYear[y].books++;
            perYear[y].pages += b.pages || 0;
        });
    });
    return perYear;
}
function calculateDistributions() {
    const readBooks = books.filter(b => b.exclusiveShelf === "read");
    const status = { read: 0, "currently-reading": 0, "to-read": 0, dnf: 0 };
    books.forEach(b => {
        const shelf = b.exclusiveShelf || "to-read";
        status[shelf]++;
    });
    const language = {};
    const country = {};
    const genre = {};
    readBooks.forEach(b => {
        const l = (b.language || "").trim() || "Unknown";
        language[l] = (language[l] || 0) + 1;
        const c = (b.country || "").trim() || "Unknown";
        country[c] = (country[c] || 0) + 1;
        const g = (b.genre || "").trim() || "Unknown";
        genre[g] = (genre[g] || 0) + 1;
    });
    return {
        status,
        language,
        country,
        genre,
        readCount: readBooks.length,
        totalBooks: books.length
    };
}
function prepareChartData(map, maxItems = 8) {
    const sorted = Object.entries(map).sort(([,a], [,b]) => b - a);
    const top = sorted.slice(0, maxItems);
    const other = sorted.slice(maxItems).reduce((sum, [,c]) => sum + c, 0);
    const labels = top.map(([k]) => k);
    const values = top.map(([,v]) => v);
    if (other > 0) {
        labels.push("Other");
        values.push(other);
    }
    return { labels, values };
}
function getCurrentYear() {
    return new Date().getFullYear();
}
function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}
function getDaysInYear(year) {
    return isLeapYear(year) ? 366 : 365;
}
function getDaysElapsed(year) {
    const currentYear = getCurrentYear();
    if (year !== currentYear) return getDaysInYear(year);
    const now = new Date();
    const start = new Date(currentYear, 0, 1);
    const diffMs = now - start;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}
function calculateProjection(current, year) {
    const daysElapsed = getDaysElapsed(year);
    if (daysElapsed === 0) return current;
    const daily = current / daysElapsed;
    return Math.round(daily * getDaysInYear(year));
}
function getYearStats(year) {
    return calculatePerYear()[year] || { books: 0, pages: 0 };
}

function getSeriesProgress(seriesName) {
    const seriesBooks = books.filter(b => b.series === seriesName);
    if (seriesBooks.length === 0) return null;
    const total = seriesBooks.length;
    const completed = seriesBooks.filter(b => b.exclusiveShelf === "read").length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percent };
}

// Country name normalization to ISO alpha-2 (lowercase for SVG path ids)
// Expand with more variants as you see mismatches in your data
const countryToIso = {
    "Afghanistan": "af",
    "Albania": "al",
    "Algeria": "dz",
    "American Samoa": "as",
    "Andorra": "ad",
    "Angola": "ao",
    "Anguilla": "ai",
    "Antarctica": "aq",
    "Antigua and Barbuda": "ag",
    "Argentina": "ar",
    "Armenia": "am",
    "Aruba": "aw",
    "Australia": "au",
    "Austria": "at",
    "Azerbaijan": "az",
    "Bahamas": "bs",
    "Bahrain": "bh",
    "Bangladesh": "bd",
    "Barbados": "bb",
    "Belarus": "by",
    "Belgium": "be",
    "Belize": "bz",
    "Benin": "bj",
    "Bermuda": "bm",
    "Bhutan": "bt",
    "Bolivia": "bo",
    "Bosnia and Herzegovina": "ba",  // fixed spelling
    "Botswana": "bw",
    "Brazil": "br",
    "British Virgin Islands": "vg",
    "Brunei": "bn",
    "Bulgaria": "bg",
    "Burkina Faso": "bf",
    "Burundi": "bi",
    "Cambodia": "kh",
    "Cameroon": "cm",
    "Canada": "ca",
    "Cape Verde": "cv",
    "Cayman Islands": "ky",
    "Central African Republic": "cf",
    "Chad": "td",
    "Chile": "cl",
    "China": "cn",
    "Colombia": "co",
    "Comoros": "km",
    "Congo": "cg",
    "Cook Islands": "ck",
    "Costa Rica": "cr",
    "Cote d'Ivoire": "ci",
    "Croatia": "hr",
    "Cuba": "cu",
    "Cyprus": "cy",
    "Czech Republic": "cz",
    "Czechia": "cz",                    // common alternative
    "Democratic Republic of the Congo": "cd",
    "Denmark": "dk",
    "Djibouti": "dj",
    "Dominica": "dm",
    "Dominican Republic": "do",
    "Ecuador": "ec",
    "Egypt": "eg",
    "El Salvador": "sv",
    "Equatorial Guinea": "gq",
    "Eritrea": "er",
    "Estonia": "ee",
    "Eswatini": "sz",                   // formerly Swaziland
    "Ethiopia": "et",
    "Falkland Islands": "fk",
    "Faroe Islands": "fo",
    "Fiji": "fj",
    "Finland": "fi",
    "France": "fr",
    "French Guiana": "gf",
    "French Polynesia": "pf",
    "French Southern Territories": "tf",
    "Gabon": "ga",
    "Gambia": "gm",
    "Georgia": "ge",
    "Germany": "de",
    "Ghana": "gh",
    "Gibraltar": "gi",
    "Greece": "gr",
    "Greenland": "gl",
    "Grenada": "gd",
    "Guadeloupe": "gp",
    "Guam": "gu",
    "Guatemala": "gt",
    "Guernsey": "gg",
    "Guinea": "gn",
    "Guinea-Bissau": "gw",
    "Guyana": "gy",
    "Haiti": "ht",
    "Honduras": "hn",
    "Hong Kong": "hk",
    "Hungary": "hu",
    "Iceland": "is",
    "India": "in",
    "Indonesia": "id",
    "Iran": "ir",
    "Iraq": "iq",
    "Ireland": "ie",
    "Isle of Man": "im",
    "Israel": "il",
    "Italy": "it",
    "Jamaica": "jm",
    "Japan": "jp",
    "Jersey": "je",
    "Jordan": "jo",
    "Kazakhstan": "kz",
    "Kenya": "ke",
    "Kiribati": "ki",
    "Kosovo": "xk",                     // not always in maps, but common
    "Kuwait": "kw",
    "Kyrgyzstan": "kg",
    "Laos": "la",
    "Latvia": "lv",
    "Lebanon": "lb",
    "Lesotho": "ls",
    "Liberia": "lr",
    "Libya": "ly",
    "Liechtenstein": "li",
    "Lithuania": "lt",
    "Luxembourg": "lu",
    "Macau": "mo",
    "Madagascar": "mg",
    "Malawi": "mw",
    "Malaysia": "my",
    "Maldives": "mv",
    "Mali": "ml",
    "Malta": "mt",
    "Marshall Islands": "mh",
    "Martinique": "mq",
    "Mauritania": "mr",
    "Mauritius": "mu",
    "Mexico": "mx",
    "Micronesia": "fm",
    "Moldova": "md",
    "Monaco": "mc",
    "Mongolia": "mn",
    "Montenegro": "me",
    "Morocco": "ma",
    "Mozambique": "mz",
    "Myanmar": "mm",
    "Namibia": "na",
    "Nauru": "nr",
    "Nepal": "np",
    "Netherlands": "nl",
    "New Caledonia": "nc",
    "New Zealand": "nz",
    "Nicaragua": "ni",
    "Niger": "ne",
    "Nigeria": "ng",
    "Niue": "nu",
    "North Korea": "kp",
    "North Macedonia": "mk",            // formerly Macedonia
    "Northern Mariana Islands": "mp",
    "Norway": "no",
    "Oman": "om",
    "Pakistan": "pk",
    "Palau": "pw",
    "Palestine": "ps",
    "Panama": "pa",
    "Papua New Guinea": "pg",
    "Paraguay": "py",
    "Peru": "pe",
    "Philippines": "ph",
    "Poland": "pl",
    "Portugal": "pt",
    "Puerto Rico": "pr",
    "Qatar": "qa",
    "Romania": "ro",
    "Russia": "ru",
    "Rwanda": "rw",
    "Réunion": "re",
    "Samoa": "ws",
    "San Marino": "sm",
    "Saudi Arabia": "sa",
    "Senegal": "sn",
    "Serbia": "rs",
    "Seychelles": "sc",
    "Sierra Leone": "sl",
    "Singapore": "sg",
    "Slovakia": "sk",
    "Slovenia": "si",
    "Solomon Islands": "sb",
    "Somalia": "so",
    "South Africa": "za",
    "South Korea": "kr",
    "South Sudan": "ss",
    "Spain": "es",
    "Sri Lanka": "lk",
    "Sudan": "sd",
    "Suriname": "sr",
    "Sweden": "se",
    "Switzerland": "ch",
    "Syria": "sy",
    "Taiwan": "tw",
    "Tajikistan": "tj",
    "Tanzania": "tz",
    "Thailand": "th",
    "Timor-Leste": "tl",
    "Togo": "tg",
    "Tonga": "to",
    "Trinidad and Tobago": "tt",
    "Tunisia": "tn",
    "Turkey": "tr",
    "Turkmenistan": "tm",
    "Tuvalu": "tv",
    "Uganda": "ug",
    "Ukraine": "ua",
    "United Arab Emirates": "ae",
    "United Kingdom": "gb",
    "United States": "us",
    "Uruguay": "uy",
    "Uzbekistan": "uz",
    "Vanuatu": "vu",
    "Vatican City": "va",
    "Venezuela": "ve",
    "Vietnam": "vn",
    "Virgin Islands": "vi",             // US Virgin Islands
    "Western Sahara": "eh",
    "Yemen": "ye",
    "Zambia": "zm",
    "Zimbabwe": "zw",

    // Common variants / abbreviations (add more as you notice mismatches)
    "USA": "us",
    "United States of America": "us",
    "UK": "gb",
    "England": "gb",
    "Scotland": "gb",
    "Wales": "gb",
    "Great Britain": "gb",
    "Korea": "kr",                      // defaults to South
    "South Korea": "kr",
    "North Korea": "kp",
    "Czech": "cz",
    "Czechoslovakia": "cz",             // historical, but sometimes used
    "Swaziland": "sz",                  // old name for Eswatini
    "Burma": "mm",                      // old name for Myanmar
    "Persia": "ir",                     // historical for Iran
};

function normalizeCountryName(name) {
    if (!name) return null;
    name = name.trim();
    
    // Direct lookup (case-sensitive, but most entries are Title Case)
    if (countryToIso[name]) return countryToIso[name];
    
    // Try case-insensitive
    const lowerName = name.toLowerCase();
    for (const key in countryToIso) {
        if (key.toLowerCase() === lowerName) {
            return countryToIso[key];
        }
    }
    
    // Last resort fallback (not great, but better than nothing)
    return name.toUpperCase().slice(0, 2).toLowerCase();
}

function getCountriesRead() {
    const readBooks = books.filter(b => b.exclusiveShelf === "read" && b.country);
    const countryCount = {};
    readBooks.forEach(b => {
        const code = normalizeCountryName(b.country);
        if (code) {
            if (!countryCount[code]) {
                countryCount[code] = { count: 0, titles: [] };
            }
            countryCount[code].count++;
            if (!countryCount[code].titles.includes(b.title)) {
                countryCount[code].titles.push(b.title);
            }
        }
    });
    return countryCount;
}

function getCountryProgress() {
    const read = Object.keys(getCountriesRead()).length;
    return { read, total: 195 }; // approx sovereign countries
}

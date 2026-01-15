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
// Includes common variants; add more from your book data if needed (e.g., if a book has "U.S.A.", add "U.S.A.": "us")
const countryToIso = {
    "Afghanistan": "AF",
    "Albania": "AL",
    "Algeria": "DZ",
    "American Samoa": "AS",
    "Andorra": "AD",
    "Angola": "AO",
    "Anguilla": "AI",
    "Antarctica": "AQ",
    "Antigua and Barbuda": "AG",
    "Argentina": "AR",
    "Armenia": "AM",
    "Aruba": "AW",
    "Australia": "AU",
    "Austria": "AT",
    "Azerbaijan": "AZ",
    "Bahamas": "BS",
    "Bahrain": "BH",
    "Bangladesh": "BD",
    "Barbados": "BB",
    "Belarus": "BY",
    "Belgium": "BE",
    "Belize": "BZ",
    "Benin": "BJ",
    "Bermuda": "BM",
    "Bhutan": "BT",
    "Bolivia": "BO",
    "Bosnia and Herzegovina": "BA",
    "Botswana": "BW",
    "Brazil": "BR",
    "British Virgin Islands": "VG",
    "Brunei": "BN",
    "Bulgaria": "BG",
    "Burkina Faso": "BF",
    "Burundi": "BI",
    "Cambodia": "KH",
    "Cameroon": "CM",
    "Canada": "CA",
    "Cape Verde": "CV",
    "Cayman Islands": "KY",
    "Central African Republic": "CF",
    "Chad": "TD",
    "Chile": "CL",
    "China": "CN",
    "Colombia": "CO",
    "Comoros": "KM",
    "Congo": "CG",
    "Cook Islands": "CK",
    "Costa Rica": "CR",
    "Cote d'Ivoire": "CI",
    "Croatia": "HR",
    "Cuba": "CU",
    "Cyprus": "CY",
    "Czech Republic": "CZ",
    "Czechia": "CZ",
    "Democratic Republic of the Congo": "CD",
    "Denmark": "DK",
    "Djibouti": "DJ",
    "Dominica": "DM",
    "Dominican Republic": "DO",
    "Ecuador": "EC",
    "Egypt": "EG",
    "El Salvador": "SV",
    "Equatorial Guinea": "GQ",
    "Eritrea": "ER",
    "Estonia": "EE",
    "Eswatini": "SZ",
    "Ethiopia": "ET",
    "Falkland Islands": "FK",
    "Faroe Islands": "FO",
    "Fiji": "FJ",
    "Finland": "FI",
    "France": "FR",
    "French Guiana": "GF",
    "French Polynesia": "PF",
    "French Southern Territories": "TF",
    "Gabon": "GA",
    "Gambia": "GM",
    "Georgia": "GE",
    "Germany": "DE",
    "Ghana": "GH",
    "Gibraltar": "GI",
    "Greece": "GR",
    "Greenland": "GL",
    "Grenada": "GD",
    "Guadeloupe": "GP",
    "Guam": "GU",
    "Guatemala": "GT",
    "Guernsey": "GG",
    "Guinea": "GN",
    "Guinea-Bissau": "GW",
    "Guyana": "GY",
    "Haiti": "HT",
    "Honduras": "HN",
    "Hong Kong": "HK",
    "Hungary": "HU",
    "Iceland": "IS",
    "India": "IN",
    "Indonesia": "ID",
    "Iran": "IR",
    "Iraq": "IQ",
    "Ireland": "IE",
    "Isle of Man": "IM",
    "Israel": "IL",
    "Italy": "IT",
    "Jamaica": "JM",
    "Japan": "JP",
    "Jersey": "JE",
    "Jordan": "JO",
    "Kazakhstan": "KZ",
    "Kenya": "KE",
    "Kiribati": "KI",
    "Kosovo": "XK",
    "Kuwait": "KW",
    "Kyrgyzstan": "KG",
    "Laos": "LA",
    "Latvia": "LV",
    "Lebanon": "LB",
    "Lesotho": "LS",
    "Liberia": "LR",
    "Libya": "LY",
    "Liechtenstein": "LI",
    "Lithuania": "LT",
    "Luxembourg": "LU",
    "Macau": "MO",
    "Madagascar": "MG",
    "Malawi": "MW",
    "Malaysia": "MY",
    "Maldives": "MV",
    "Mali": "ML",
    "Malta": "MT",
    "Marshall Islands": "MH",
    "Martinique": "MQ",
    "Mauritania": "MR",
    "Mauritius": "MU",
    "Mexico": "MX",
    "Micronesia": "FM",
    "Moldova": "MD",
    "Monaco": "MC",
    "Mongolia": "MN",
    "Montenegro": "ME",
    "Morocco": "MA",
    "Mozambique": "MZ",
    "Myanmar": "MM",
    "Namibia": "NA",
    "Nauru": "NR",
    "Nepal": "NP",
    "Netherlands": "NL",
    "New Caledonia": "NC",
    "New Zealand": "NZ",
    "Nicaragua": "NI",
    "Niger": "NE",
    "Nigeria": "NG",
    "Niue": "NU",
    "North Korea": "KP",
    "North Macedonia": "MK",
    "Northern Mariana Islands": "MP",
    "Norway": "NO",
    "Oman": "OM",
    "Pakistan": "PK",
    "Palau": "PW",
    "Palestine": "PS",
    "Panama": "PA",
    "Papua New Guinea": "PG",
    "Paraguay": "PY",
    "Peru": "PE",
    "Philippines": "PH",
    "Poland": "PL",
    "Portugal": "PT",
    "Puerto Rico": "PR",
    "Qatar": "QA",
    "Romania": "RO",
    "Russia": "RU",
    "Rwanda": "RW",
    "Réunion": "RE",
    "Samoa": "WS",
    "San Marino": "SM",
    "Saudi Arabia": "SA",
    "Senegal": "SN",
    "Serbia": "RS",
    "Seychelles": "SC",
    "Sierra Leone": "SL",
    "Singapore": "SG",
    "Slovakia": "SK",
    "Slovenia": "SI",
    "Solomon Islands": "SB",
    "Somalia": "SO",
    "South Africa": "ZA",
    "South Korea": "KR",
    "South Sudan": "SS",
    "Spain": "ES",
    "Sri Lanka": "LK",
    "Sudan": "SD",
    "Suriname": "SR",
    "Sweden": "SE",
    "Switzerland": "CH",
    "Syria": "SY",
    "Taiwan": "TW",
    "Tajikistan": "TJ",
    "Tanzania": "TZ",
    "Thailand": "TH",
    "Timor-Leste": "TL",
    "Togo": "TG",
    "Tonga": "TO",
    "Trinidad and Tobago": "TT",
    "Tunisia": "TN",
    "Turkey": "TR",
    "Turkmenistan": "TM",
    "Tuvalu": "TV",
    "Uganda": "UG",
    "Ukraine": "UA",
    "United Arab Emirates": "AE",
    "United Kingdom": "GB",
    "United States": "US",
    "Uruguay": "UY",
    "Uzbekistan": "UZ",
    "Vanuatu": "VU",
    "Vatican City": "VA",
    "Venezuela": "VE",
    "Vietnam": "VN",
    "Virgin Islands": "VI",
    "Western Sahara": "EH",
    "Yemen": "YE",
    "Zambia": "ZM",
    "Zimbabwe": "ZW",
    // Variants (add more if your books use them)
    "Burma": "MM",
    "Czech": "CZ",
    "England": "GB",
    "Great Britain": "GB",
    "Ivory Coast": "CI",
    "Korea": "KR",
    "Macedonia": "MK",
    "Persia": "IR",
    "Scotland": "GB",
    "Swaziland": "SZ",
    "U.S.": "US",
    "U.S.A.": "US",
    "UK": "GB",
    "USA": "US",
    "United States of America": "US",
    "Wales": "GB",
    "West Sahara": "EH"
};

function normalizeCountryName(name) {
    if (!name) return null;
    name = name.trim();
    if (countryToIso[name]) return countryToIso[name]; // now uppercase
    const lowerName = name.toLowerCase();
    for (const key in countryToIso) {
        if (key.toLowerCase() === lowerName) {
            return countryToIso[key]; // uppercase
        }
    }
    console.warn(`No country code match for "${name}"`);
    return null;
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
    console.log("Detected read countries:", countryCount); // Debug: Check console for what was found
    return countryCount;
}
function getCountryProgress() {
    const read = Object.keys(getCountriesRead()).length;
    return { read, total: 195 }; // approx sovereign countries
}

// ============================================================
//  BookDuel – js/battle.js
//  Rating system: Glicko-inspired win-rate with opponent
//  strength weighting. Replaces the previous ELO+bounds system
//  that caused instability and "frozen" rankings.
//
//  Core principles:
//  1. MONOTONIC   — winning always helps, losing always hurts
//  2. STABLE      — veterans move slowly, newcomers move fast
//  3. RECOVERABLE — more duels always refine placement
//  4. TRANSPARENT — win%, match count, strength displayed
//  5. NO DECAY    — idle books never drift without a duel
// ============================================================

const BATTLE_KEY          = "reading_battle_data";
const BATTLE_LIMIT_KEY    = "reading_battle_ranking_limit";
const BATTLE_COMPLEX_KEY  = "reading_battle_complex";   // "off"|"2"–"10"
const BATTLE_POOL_MODE_KEY = "reading_battle_pool_mode";
const BATTLE_FOCUS_KEY    = "reading_battle_focus";
const DEFAULT_RANKING_LIMIT = 20;

// ── Rating scale ──────────────────────────────────────────────
// Books start at 1000. Range is roughly 0–3000.
// A win against an equal opponent is worth ~32 pts at K=32.
const RATING_START   = 1000;
const RATING_MAX     = 3000;
const RATING_MIN     = 1;
const K_BASE         = 32;   // max points per duel for a veteran
const K_PROVISIONAL  = 64;   // first 5 duels — move faster
const PROVISIONAL_N  = 5;    // duels before "veteran" status

// ── Persistent preferences ────────────────────────────────────
let battleData         = null;
let battleRankingLimit = DEFAULT_RANKING_LIMIT;
let battleComplexMode  = "off";
let battlePoolMode     = "standard";
let battleFocus        = "0";

// ── Live session ──────────────────────────────────────────────
let battleSession  = null;
let duelStartTime  = null;
let battleView     = "play";

// ============================================================
//  SESSION CONFIGS  (unchanged from original — UI depends on these)
// ============================================================
const SESSION_CONFIGS = {
    sprint:   { label: "Sprint",    size: 30,       kMx: 1.0, sessionWeight: 0.3,  emoji: "⚡" },
    standard: { label: "Standard",  size: 75,       kMx: 1.0, sessionWeight: 0.75, emoji: "📖" },
    marathon: { label: "Marathon",  size: 150,      kMx: 1.0, sessionWeight: 1.0,  emoji: "🏃" },
    deep:     { label: "Deep Dive", size: Infinity, kMx: 1.0, sessionWeight: 1.5,  emoji: "🌊" }
};

function getSessionConfig() {
    return SESSION_CONFIGS[battlePoolMode] || SESSION_CONFIGS.standard;
}

// ============================================================
//  STORAGE
// ============================================================
function loadBattleData() {
    const raw    = localStorage.getItem(BATTLE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    battleData = {
        sessions:  parsed.sessions  || [],
        bookStats: parsed.bookStats || {},
        blacklist: parsed.blacklist || []
    };
    battleRankingLimit = Number(localStorage.getItem(BATTLE_LIMIT_KEY)) || DEFAULT_RANKING_LIMIT;
    battleComplexMode  = localStorage.getItem(BATTLE_COMPLEX_KEY)    || "off";
    battlePoolMode     = localStorage.getItem(BATTLE_POOL_MODE_KEY)   || "standard";
    battleFocus        = localStorage.getItem(BATTLE_FOCUS_KEY)       || "0";
    migrateLegacyStats();
}

function saveBattleData() {
    localStorage.setItem(BATTLE_KEY, JSON.stringify(battleData));
}

function saveBattleComplexMode(val) {
    battleComplexMode = val;
    localStorage.setItem(BATTLE_COMPLEX_KEY, val);
}
function saveBattlePoolMode(val) {
    battlePoolMode = val;
    localStorage.setItem(BATTLE_POOL_MODE_KEY, val);
}
function saveBattleFocus(val) {
    battleFocus = val;
    localStorage.setItem(BATTLE_FOCUS_KEY, val);
}
function saveBattleRankingLimit(val) {
    battleRankingLimit = Math.max(1, Number(val) || DEFAULT_RANKING_LIMIT);
    localStorage.setItem(BATTLE_LIMIT_KEY, String(battleRankingLimit));
}
function saveBattleComplexSetting(val) { saveBattleComplexMode(val); }

function resetBattleStats() {
    if (!confirm("Reset all BookDuel rankings and session history? The blacklist will be kept.")) return;
    battleData.sessions  = [];
    battleData.bookStats = {};
    battleSession = null;
    duelStartTime = null;
    saveBattleData();
    renderBattle();
}

function resetBlacklist() {
    if (!confirm("Clear the entire BookDuel blacklist?")) return;
    battleData.blacklist = [];
    saveBattleData();
    renderBattle();
}

// ============================================================
//  MIGRATION  — convert old ELO/bounds stats to new format
//  Preserves win/loss counts; derives a clean rating from them.
// ============================================================
function migrateLegacyStats() {
    if (battleData._newRatingSystem) return;

    let changed = false;
    Object.keys(battleData.bookStats).forEach(id => {
        const s = battleData.bookStats[id];
        if (!s) return;

        // Old system had rating, lo, hi, wins, losses, interactions, etc.
        // New system needs: rating, wins, losses, appearances, sessionWins
        const wins   = s.wins   || 0;
        const losses = s.losses || 0;
        const total  = wins + losses;

        if (total > 0) {
            // Derive a sensible starting rating from win rate
            const winRate = wins / total;
            s.rating = Math.round(RATING_START + (winRate - 0.5) * 600);
            s.rating = Math.max(RATING_MIN, Math.min(RATING_MAX, s.rating));
        } else {
            s.rating = RATING_START;
        }

        // Strip old fields that no longer apply
        delete s.lo;
        delete s.hi;
        delete s.interactions;
        delete s.lastSeenSession;
        delete s.lastSeenAt;
        delete s.decayWeight;
        delete s.tiersEncountered;

        s.wins        = wins;
        s.losses      = losses;
        s.appearances = s.appearances || total;
        s.sessionWins = s.sessionWins || 0;

        changed = true;
    });

    if (changed || !battleData._newRatingSystem) {
        battleData._newRatingSystem = true;
        saveBattleData();
    }
}

// ============================================================
//  STAT HELPERS
// ============================================================
function ensureBookStat(id) {
    if (!battleData.bookStats[id]) {
        battleData.bookStats[id] = {
            rating:      RATING_START,
            wins:        0,
            losses:      0,
            appearances: 0,
            sessionWins: 0
        };
    }
    const s = battleData.bookStats[id];
    if (s.rating      === undefined) s.rating      = RATING_START;
    if (s.wins        === undefined) s.wins        = 0;
    if (s.losses      === undefined) s.losses      = 0;
    if (s.appearances === undefined) s.appearances = 0;
    if (s.sessionWins === undefined) s.sessionWins = 0;
    return s;
}

function getBookById(importOrder) {
    return books.find(b => b.importOrder === importOrder) || null;
}

function getDuels(stat) {
    return (stat.wins || 0) + (stat.losses || 0);
}

function getWinRate(stat) {
    const d = getDuels(stat);
    return d > 0 ? stat.wins / d : null;
}

// Confidence label based purely on number of duels
function confidenceLabel(stat) {
    const d = getDuels(stat);
    if (d === 0)   return { label: "Unranked",   color: "#666" };
    if (d < 5)     return { label: "Uncertain",  color: "#c0392b" };
    if (d < 15)    return { label: "Developing", color: "#e67e22" };
    if (d < 30)    return { label: "Established",color: "#f1c40f" };
    return               { label: "Confident",   color: "#2ecc71" };
}

// ============================================================
//  CORE RATING  — clean, predictable, no hidden multipliers
//
//  Uses standard Elo expected-value formula. K is simply:
//    64 if fewer than PROVISIONAL_N duels (new book, move fast)
//    32 otherwise (veteran, stable)
//
//  No session weighting, no pool ceiling dampening, no decay.
//  The result is fully deterministic from the match outcome.
// ============================================================
function eloExpected(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function kFactor(stat) {
    return getDuels(stat) < PROVISIONAL_N ? K_PROVISIONAL : K_BASE;
}

function applyRating(winnerId, loserId) {
    const ws = ensureBookStat(winnerId);
    const ls = ensureBookStat(loserId);

    const expected = eloExpected(ws.rating, ls.rating);

    const wK = kFactor(ws);
    const lK = kFactor(ls);

    ws.rating = Math.min(RATING_MAX, Math.round(ws.rating + wK * (1 - expected)));
    ls.rating = Math.max(RATING_MIN, Math.round(ls.rating - lK * (1 - expected)));

    ws.wins   += 1;
    ls.losses += 1;
}

// Draw: both move toward each other's rating slightly
function applyDraw(idA, idB) {
    const sa = ensureBookStat(idA);
    const sb = ensureBookStat(idB);

    const expA = eloExpected(sa.rating, sb.rating);
    const kA   = kFactor(sa);
    const kB   = kFactor(sb);

    sa.rating = Math.min(RATING_MAX, Math.max(RATING_MIN,
        Math.round(sa.rating + kA * (0.5 - expA))));
    sb.rating = Math.min(RATING_MAX, Math.max(RATING_MIN,
        Math.round(sb.rating + kB * (0.5 - (1 - expA)))));

    // Draws count as half a win/loss each for display purposes
    sa.wins   += 0.5;
    sa.losses += 0.5;
    sb.wins   += 0.5;
    sb.losses += 0.5;
}

// ============================================================
//  HELPERS
// ============================================================
function getBattlePool() {
    const blacklistSet = new Set(battleData.blacklist || []);
    return books.filter(b =>
        (b.exclusiveShelf === "read" || b.exclusiveShelf === "currently-reading") &&
        !blacklistSet.has(b.importOrder)
    );
}

function fmtMs(ms) {
    if (!ms || ms <= 0) return "–";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(ts) {
    if (!ts) return "–";
    return new Date(ts).toLocaleDateString();
}

// ============================================================
//  POOL SAMPLING  — tier-aware, focus-weighted
//  Simplified: tiers are now purely rating quartiles, no
//  entanglement with the bounds system.
// ============================================================
function getRatingTierBoundaries(pool) {
    if (!pool || pool.length === 0) return [800, 1000, 1200];
    const rated = pool
        .map(b => ensureBookStat(b.importOrder).rating)
        .sort((a, b) => a - b);
    const q = p => rated[Math.floor(p * (rated.length - 1))];
    return [q(0.25), q(0.5), q(0.75)];
}

function getRatingTier(rating, boundaries) {
    if (rating <= boundaries[0]) return 0;
    if (rating <= boundaries[1]) return 1;
    if (rating <= boundaries[2]) return 2;
    return 3;
}

function samplePool(allBooks, targetSize, focus, boundaries) {
    if (focus === "random" || allBooks.length <= targetSize) {
        return allBooks.slice().sort(() => Math.random() - 0.5).slice(0, targetSize);
    }

    const tiers   = [[], [], [], [], []]; // 0-3 rated tiers, 4 = unranked
    allBooks.forEach(b => {
        const s = battleData.bookStats[b.importOrder];
        if (!s || getDuels(s) === 0) {
            tiers[4].push(b);
        } else {
            tiers[getRatingTier(s.rating, boundaries)].push(b);
        }
    });

    const focusNum = Number(focus) || 0;
    const baseWeights = [1, 1, 1, 1];
    if (focusNum < 0) {
        baseWeights[0] += Math.abs(focusNum) * 1.5;
        baseWeights[1] += Math.abs(focusNum) * 0.5;
    } else if (focusNum > 0) {
        baseWeights[3] += focusNum * 1.5;
        baseWeights[2] += focusNum * 0.5;
    }

    const freshCount = Math.min(tiers[4].length, Math.max(1, Math.round(targetSize * 0.15)));
    const remaining  = targetSize - freshCount;
    const totalW     = baseWeights.reduce((a, b) => a + b, 0);
    const alloc      = baseWeights.map((w, i) =>
        tiers[i].length > 0 ? Math.max(1, Math.round((w / totalW) * remaining)) : 0
    );

    let allocated = alloc.reduce((a, b) => a + b, 0);
    while (allocated > remaining) {
        const idx = alloc
            .map((a, i) => ({ i, ratio: tiers[i].length > 0 ? a / tiers[i].length : 999 }))
            .sort((a, b) => b.ratio - a.ratio)[0].i;
        if (alloc[idx] > 1) { alloc[idx]--; allocated--; } else break;
    }
    while (allocated < remaining) {
        const idx = alloc
            .map((a, i) => ({ i, ratio: tiers[i].length > 0 ? (tiers[i].length - a) / tiers[i].length : -1 }))
            .sort((a, b) => b.ratio - a.ratio)[0].i;
        if (alloc[idx] < tiers[idx].length) { alloc[idx]++; allocated++; } else break;
    }

    const result = tiers[4].sort(() => Math.random() - 0.5).slice(0, freshCount);
    alloc.forEach((n, i) => {
        result.push(...tiers[i].sort(() => Math.random() - 0.5).slice(0, n));
    });
    return result.sort(() => Math.random() - 0.5);
}

// ============================================================
//  BLACKLIST
// ============================================================
function isBlacklisted(importOrder) {
    return (battleData.blacklist || []).includes(importOrder);
}

function toggleBlacklist(importOrder) {
    if (!battleData.blacklist) battleData.blacklist = [];
    const idx = battleData.blacklist.indexOf(importOrder);
    if (idx === -1) battleData.blacklist.push(importOrder);
    else            battleData.blacklist.splice(idx, 1);
    saveBattleData();
    renderBattleBlacklist();
    renderBattleSubNav();
    if (battleView === "play" && !battleSession) renderBattlePlay();
}

function clearBlacklist() {
    if (!confirm("Remove all books from the blacklist?")) return;
    battleData.blacklist = [];
    saveBattleData();
    renderBattleBlacklist();
    renderBattleSubNav();
    if (battleView === "play" && !battleSession) renderBattlePlay();
}

function blacklistAllButFirst(series) {
    const seriesBooks = books
        .filter(b => b.series === series &&
            (b.exclusiveShelf === "read" || b.exclusiveShelf === "currently-reading"))
        .sort((a, b) => (a.seriesNumber ?? 999) - (b.seriesNumber ?? 999) || a.title.localeCompare(b.title));
    if (!battleData.blacklist) battleData.blacklist = [];
    seriesBooks.slice(1).forEach(b => {
        if (!battleData.blacklist.includes(b.importOrder)) battleData.blacklist.push(b.importOrder);
    });
    battleData.blacklist = battleData.blacklist.filter(id => id !== seriesBooks[0]?.importOrder);
    saveBattleData();
    renderBattleBlacklist();
    renderBattleSubNav();
    if (battleView === "play" && !battleSession) renderBattlePlay();
}

function blacklistSeries(series) {
    const seriesBooks = books.filter(b =>
        b.series === series && (b.exclusiveShelf === "read" || b.exclusiveShelf === "currently-reading")
    );
    if (!battleData.blacklist) battleData.blacklist = [];
    seriesBooks.forEach(b => {
        if (!battleData.blacklist.includes(b.importOrder)) battleData.blacklist.push(b.importOrder);
    });
    saveBattleData();
    renderBattleBlacklist();
    renderBattleSubNav();
    if (battleView === "play" && !battleSession) renderBattlePlay();
}

function unblacklistSeries(series) {
    const ids = new Set(
        books.filter(b => b.series === series &&
            (b.exclusiveShelf === "read" || b.exclusiveShelf === "currently-reading"))
            .map(b => b.importOrder)
    );
    battleData.blacklist = (battleData.blacklist || []).filter(id => !ids.has(id));
    saveBattleData();
    renderBattleBlacklist();
    renderBattleSubNav();
    if (battleView === "play" && !battleSession) renderBattlePlay();
}

// ============================================================
//  SESSION START
// ============================================================
function startNewSession() {
    const allBooks = getBattlePool();
    const cfg      = getSessionConfig();
    const slots    = battleComplexMode === "off" ? 0 : Number(battleComplexMode);
    const minBooks = Math.max(slots > 0 ? slots + 1 : 2, 2);

    if (allBooks.length < minBooks) {
        alert(`You need at least ${minBooks} eligible books to play!`);
        return;
    }

    const boundaries = getRatingTierBoundaries(allBooks);
    const targetSize = Math.min(allBooks.length, cfg.size);
    const sampled    = samplePool(allBooks, targetSize, battleFocus, boundaries);

    sampled.forEach(b => ensureBookStat(b.importOrder).appearances++);
    saveBattleData();

    if (slots > 0) {
        beginComplexSetup(sampled, slots);
        return;
    }

    battleSession = {
        mode:       "classic",
        pool:       sampled.map(b => b.importOrder),
        poolMode:   battlePoolMode,
        roundIndex: 0,
        startedAt:  Date.now(),
        rounds:     []
    };
    duelStartTime = Date.now();
    renderBattlePlay();
}

// ============================================================
//  CLASSIC SESSION
// ============================================================
function pickNextPair() {
    return [battleSession.pool[0], battleSession.pool[1]];
}

function chooseSide(winnerId) {
    if (!battleSession || battleSession.mode !== "classic") return;
    const now      = Date.now();
    const duration = duelStartTime ? now - duelStartTime : null;
    const pair     = pickNextPair();
    const loserId  = pair.find(id => id !== winnerId);

    battleSession.roundIndex++;
    battleSession.rounds.push({
        winner: winnerId, loser: loserId,
        roundIndex: battleSession.roundIndex, durationMs: duration
    });

    applyRating(winnerId, loserId);
    saveBattleData();
    battleSession.pool = battleSession.pool.filter(id => id !== loserId);

    if (battleSession.pool.length === 1) finishSession();
    else { duelStartTime = Date.now(); renderBattlePlay(); }
}

function finishSession() {
    const winnerId = battleSession.pool[0];
    ensureBookStat(winnerId).sessionWins++;
    const sessionRecord = {
        date:     Date.now(),
        poolSize: battleSession.rounds.length + 1,
        winner:   winnerId,
        mode:     "classic",
        poolMode: battleSession.poolMode,
        rounds:   battleSession.rounds.slice()
    };
    battleData.sessions.push(sessionRecord);
    saveBattleData();
    renderBattleWinner(winnerId, sessionRecord);
    battleSession = null;
}

function abandonSession() {
    if (!confirm("Abandon this session? Rating changes made so far remain.")) return;
    battleSession = null;
    duelStartTime = null;
    renderBattlePlay();
}

// ============================================================
//  COMPLEX: SETUP
// ============================================================
function beginComplexSetup(sampled, slots) {
    battleSession = {
        mode:       "complex-setup",
        slots,
        poolMode:   battlePoolMode,
        shelf:      sampled.slice(0, slots).map(b => b.importOrder),
        queue:      sampled.slice(slots).map(b => b.importOrder),
        totalBooks: sampled.length,
        startedAt:  Date.now()
    };
    renderBattlePlay();
}

function shelfMoveUp(index) {
    if (!battleSession || index <= 0) return;
    const s = battleSession.shelf;
    [s[index - 1], s[index]] = [s[index], s[index - 1]];
    renderBattlePlay();
}

function shelfMoveDown(index) {
    if (!battleSession) return;
    const s = battleSession.shelf;
    if (index >= s.length - 1) return;
    [s[index], s[index + 1]] = [s[index + 1], s[index]];
    renderBattlePlay();
}

function confirmComplexSetup() {
    if (!battleSession || battleSession.mode !== "complex-setup") return;
    const { shelf, queue, slots, totalBooks } = battleSession;

    // Apply ratings for initial shelf ordering
    for (let i = 0; i < shelf.length - 1; i++) {
        applyRating(shelf[i], shelf[i + 1]);
    }
    saveBattleData();

    battleSession = {
        mode:       "complex",
        slots,
        poolMode:   battleSession.poolMode,
        shelf:      [...shelf],
        queue:      [...queue],
        roundIndex: shelf.length - 1,
        startedAt:  Date.now(),
        rounds:     [],
        totalBooks
    };
    duelStartTime = Date.now();
    renderBattlePlay();
}

// ============================================================
//  COMPLEX: PLAY
// ============================================================
function applyRejectElo(shelf, challenger) {
    // Challenger loses to the weakest book on the shelf
    const weakest = shelf[shelf.length - 1];
    applyRating(weakest, challenger);
    // Also loses to each book it was compared to (approximate: all of them)
    shelf.slice(0, -1).forEach(id => applyRating(id, challenger));
}

function complexChoose(slotIndex) {
    if (!battleSession || battleSession.mode !== "complex") return;
    const now        = Date.now();
    const duration   = duelStartTime ? now - duelStartTime : null;
    const challenger = battleSession.queue[0];
    const shelf      = battleSession.shelf;
    const slots      = battleSession.slots;

    battleSession.roundIndex++;

    if (slotIndex === -1) {
        applyRejectElo(shelf, challenger);
        battleSession.rounds.push({
            action: "reject", challenger, shelfSnapshot: [...shelf],
            durationMs: duration, roundIndex: battleSession.roundIndex
        });
    } else {
        // Challenger beats everyone from slotIndex downward
        for (let i = slotIndex; i < shelf.length; i++) {
            applyRating(challenger, shelf[i]);
        }
        // Challenger loses to everyone above slotIndex
        for (let i = 0; i < slotIndex; i++) {
            applyRating(shelf[i], challenger);
        }
        const eliminated = shelf[shelf.length - 1];
        battleSession.shelf = [
            ...shelf.slice(0, slotIndex),
            challenger,
            ...shelf.slice(slotIndex, slots - 1)
        ];
        battleSession.rounds.push({
            action: "swap", slotIndex, challenger, eliminated,
            shelfSnapshot: [...shelf],
            durationMs: duration, roundIndex: battleSession.roundIndex
        });
    }

    saveBattleData();
    battleSession.queue = battleSession.queue.slice(1);

    if (battleSession.queue.length === 0) finishComplexSession();
    else { duelStartTime = Date.now(); renderBattlePlay(); }
}

function finishComplexSession() {
    const shelf = battleSession.shelf;
    const winnerId = shelf[0];

    for (let i = 0; i < shelf.length - 1; i++) {
        applyRating(shelf[i], shelf[i + 1]);
    }

    ensureBookStat(winnerId).sessionWins++;
    saveBattleData();

    const sessionRecord = {
        date:     Date.now(),
        poolSize: battleSession.totalBooks,
        winner:   winnerId,
        shelf:    [...shelf],
        mode:     "complex",
        slots:    battleSession.slots,
        poolMode: battleSession.poolMode,
        rounds:   battleSession.rounds.slice()
    };
    battleData.sessions.push(sessionRecord);
    saveBattleData();
    renderComplexWinner(sessionRecord);
    battleSession = null;
}

// ============================================================
//  QUICK CALIBRATION
//  Picks pairs by maximum rating overlap (most informative).
//  Clean implementation: no cooldown complexity, just pick the
//  highest-value unseen pair each round.
// ============================================================
const QCALIB_COOLDOWN = 8;

function scoreQCalibPair(idA, idB) {
    const sa  = ensureBookStat(idA);
    const sb  = ensureBookStat(idB);
    const gap = Math.abs(sa.rating - sb.rating);
    // Prefer close ratings (high information) and books with few duels
    const noveltyA = Math.max(0, PROVISIONAL_N - getDuels(sa));
    const noveltyB = Math.max(0, PROVISIONAL_N - getDuels(sb));
    return (1000 - gap) + (noveltyA + noveltyB) * 100;
}

function pickQCalibPair(pool, recentPairs) {
    const eligible = pool.length >= 2 ? pool : null;
    if (!eligible) return null;

    // Sort by rating for candidate selection
    const sorted = eligible
        .slice()
        .sort((a, b) => {
            const sa = battleData.bookStats[a.importOrder];
            const sb = battleData.bookStats[b.importOrder];
            return (sb ? sb.rating : RATING_START) - (sa ? sa.rating : RATING_START);
        })
        .slice(0, 40);

    let bestScore = -Infinity, bestA = null, bestB = null;
    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            const idA    = sorted[i].importOrder;
            const idB    = sorted[j].importOrder;
            const pairKey = [idA, idB].sort().join(",");
            if (recentPairs.has(pairKey)) continue;
            const score = scoreQCalibPair(idA, idB);
            if (score > bestScore) { bestScore = score; bestA = idA; bestB = idB; }
        }
    }
    if (!bestA && eligible.length >= 2) {
        // All on cooldown — just pick closest ratings
        bestA = sorted[0].importOrder;
        bestB = sorted[1].importOrder;
    }
    return bestA ? [bestA, bestB] : null;
}

function startQuickCalib() {
    const pool = getBattlePool();
    if (pool.length < 2) { alert("Need at least 2 eligible books."); return; }
    pool.forEach(b => ensureBookStat(b.importOrder).appearances++);
    saveBattleData();

    const firstPair = pickQCalibPair(pool, new Set());
    if (!firstPair) { alert("Not enough pairs to calibrate."); return; }

    battleSession = {
        mode:        "quick-calib",
        pool:        pool.map(b => b.importOrder),
        currentPair: firstPair,
        roundsDone:  0,
        recentPairs: new Map(),
        results:     [],
        startedAt:   Date.now()
    };
    duelStartTime = Date.now();
    switchBattleView("play");
    renderBattlePlay();
}

function qcalibChoose(winnerId) {
    if (!battleSession || battleSession.mode !== "quick-calib") return;
    const now      = Date.now();
    const duration = duelStartTime ? now - duelStartTime : null;
    const sess     = battleSession;
    const [idA, idB] = sess.currentPair;
    const loserId  = winnerId === idA ? idB : idA;

    applyRating(winnerId, loserId);
    saveBattleData();

    const wStat = ensureBookStat(winnerId);
    const lStat = ensureBookStat(loserId);
    sess.results.push({
        winner: winnerId, loser: loserId,
        winnerRating: wStat.rating, loserRating: lStat.rating,
        durationMs: duration
    });
    sess.roundsDone++;

    const pairKey = [idA, idB].sort().join(",");
    sess.recentPairs.set(pairKey, sess.roundsDone);
    for (const [k, setAt] of sess.recentPairs) {
        if (sess.roundsDone - setAt >= QCALIB_COOLDOWN) sess.recentPairs.delete(k);
    }

    const poolBooks = getBattlePool().filter(b => sess.pool.includes(b.importOrder));
    const cooledSet = new Set(sess.recentPairs.keys());
    const nextPair  = pickQCalibPair(poolBooks, cooledSet);

    if (!nextPair) { qcalibFinish(); return; }
    sess.currentPair = nextPair;
    duelStartTime    = Date.now();
    renderBattlePlay();
}

function qcalibDraw() {
    if (!battleSession || battleSession.mode !== "quick-calib") return;
    const sess       = battleSession;
    const [idA, idB] = sess.currentPair;

    applyDraw(idA, idB);
    saveBattleData();

    sess.results.push({ draw: true, idA, idB });
    sess.roundsDone++;

    const pairKey = [idA, idB].sort().join(",");
    sess.recentPairs.set(pairKey, sess.roundsDone);
    for (const [k, setAt] of sess.recentPairs) {
        if (sess.roundsDone - setAt >= QCALIB_COOLDOWN) sess.recentPairs.delete(k);
    }

    const poolBooks = getBattlePool().filter(b => sess.pool.includes(b.importOrder));
    const cooledSet = new Set(sess.recentPairs.keys());
    const nextPair  = pickQCalibPair(poolBooks, cooledSet);

    if (!nextPair) { qcalibFinish(); return; }
    sess.currentPair = nextPair;
    duelStartTime    = Date.now();
    renderBattlePlay();
}

function qcalibFinish() {
    const el   = document.getElementById("battlePlayView");
    const sess = battleSession;
    if (!el) return;

    const totalRounds = sess ? sess.roundsDone : 0;
    const totalMs     = sess ? sess.results.reduce((s, r) => s + (r.durationMs || 0), 0) : 0;
    const avgMs       = totalRounds > 0 ? Math.round(totalMs / totalRounds) : 0;
    const narrowed    = sess ? new Set([
        ...sess.results.map(r => r.winner).filter(Boolean),
        ...sess.results.map(r => r.loser).filter(Boolean),
        ...sess.results.filter(r => r.draw).flatMap(r => [r.idA, r.idB])
    ]).size : 0;

    el.innerHTML = `
        <div class="battle-winner-screen">
            <div class="battle-winner-crown">⚡</div>
            <h2>Quick Calibration Done</h2>
            <div class="battle-session-summary">
                <div class="battle-summary-row"><span>Duels played</span><strong>${totalRounds}</strong></div>
                <div class="battle-summary-row"><span>Books updated</span><strong>${narrowed}</strong></div>
                <div class="battle-summary-row"><span>Avg decision</span><strong>${fmtMs(avgMs)}</strong></div>
            </div>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;flex-wrap:wrap;">
                <button class="battle-start-btn" onclick="startQuickCalib()">⚡ Run Again</button>
                <button onclick="switchBattleView('rankings')" style="padding:10px 24px;">🏆 Rankings</button>
                <button onclick="calibStop()" style="padding:10px 24px;">✓ Done</button>
            </div>
        </div>`;
    battleSession = null;
}

// ============================================================
//  CALIBRATION MODE
//  Bisection: pick the opponent closest to the midpoint of
//  the book's plausible range, narrowing each round.
//  Range is derived purely from ratings of beaten/lost books.
// ============================================================
const CALIB_K_MX = 1.5;

function buildCalibQueue() {
    const pool = getBattlePool();
    return pool
        .map(b => ({ b, duels: getDuels(ensureBookStat(b.importOrder)) }))
        .sort((a, b) => a.duels - b.duels)
        .map(x => x.b.importOrder);
}

function startCalibTarget(targetId, remainingQueue) {
    const stat = ensureBookStat(targetId);
    return {
        mode:          "calibration",
        targetId,
        rangeMin:      RATING_MIN,
        rangeMax:      RATING_MAX,
        probesDone:    0,
        probesMax:     6,
        results:       [],
        usedOpponents: new Set(),
        remainingQueue,
        startedAt:     Date.now(),
        _calibPair:    null
    };
}

function pickCalibOpponent(rangeMin, rangeMax, targetId, usedOpponents) {
    const mid  = Math.round((rangeMin + rangeMax) / 2);
    const pool = getBattlePool().filter(b =>
        b.importOrder !== targetId &&
        !usedOpponents.has(b.importOrder)
    );
    if (pool.length === 0) return null;
    return pool
        .map(b => {
            const s = battleData.bookStats[b.importOrder];
            const r = s ? s.rating : RATING_START;
            return { b, dist: Math.abs(r - mid) };
        })
        .sort((a, b) => a.dist - b.dist)[0].b;
}

function startCalibration() {
    const queue = buildCalibQueue();
    if (queue.length === 0) { alert("No eligible books to calibrate!"); return; }
    battleSession = startCalibTarget(queue[0], queue.slice(1));
    duelStartTime = Date.now();
    switchBattleView("play");
    renderBattlePlay();
}

function startCalibSingle(importOrder) {
    if (battleSession) {
        if (!confirm("This will interrupt your current session. Continue?")) return;
    }
    const queue = buildCalibQueue().filter(id => id !== importOrder);
    battleSession = startCalibTarget(importOrder, queue);
    duelStartTime = Date.now();
    switchBattleView("play");
    renderBattlePlay();
}

function calibChoose(winnerId) {
    if (!battleSession || battleSession.mode !== "calibration") return;
    const now      = Date.now();
    const duration = duelStartTime ? now - duelStartTime : null;
    const sess     = battleSession;
    const targetId = sess.targetId;

    const opponent = pickCalibOpponent(sess.rangeMin, sess.rangeMax, targetId, sess.usedOpponents);
    if (!opponent) { calibNextBook(); return; }
    const opponentId = opponent.importOrder;

    sess.usedOpponents.add(opponentId);

    const targetWon    = winnerId === targetId;
    const actualWinner = targetWon ? targetId : opponentId;
    const actualLoser  = targetWon ? opponentId : targetId;

    const oppRating = ensureBookStat(opponentId).rating;

    // Apply rating with stronger K for calibration
    const ws = ensureBookStat(actualWinner);
    const ls = ensureBookStat(actualLoser);
    const exp = eloExpected(ws.rating, ls.rating);
    const kW  = Math.round(kFactor(ws) * CALIB_K_MX);
    const kL  = Math.round(kFactor(ls) * CALIB_K_MX);
    ws.rating = Math.min(RATING_MAX, Math.round(ws.rating + kW * (1 - exp)));
    ls.rating = Math.max(RATING_MIN, Math.round(ls.rating - kL * (1 - exp)));
    ws.wins   += 1;
    ls.losses += 1;
    saveBattleData();

    // Narrow bisection range
    if (targetWon) sess.rangeMin = Math.max(sess.rangeMin, oppRating);
    else           sess.rangeMax = Math.min(sess.rangeMax, oppRating);

    if (sess.rangeMin >= sess.rangeMax) {
        sess.rangeMin = Math.max(RATING_MIN, sess.rangeMax - 100);
        sess.rangeMax = Math.min(RATING_MAX, sess.rangeMin + 100);
    }

    sess.results.push({ opponentId, opponentRating: oppRating, targetWon, durationMs: duration });
    sess.probesDone++;
    sess._calibPair = null;

    const nextOpponent = pickCalibOpponent(sess.rangeMin, sess.rangeMax, targetId, sess.usedOpponents);
    if (!nextOpponent) { calibNextBook(); return; }
    duelStartTime = Date.now();
    renderBattlePlay();
}

function calibDraw() {
    if (!battleSession || battleSession.mode !== "calibration") return;
    const sess     = battleSession;
    const targetId = sess.targetId;
    const opponent = pickCalibOpponent(sess.rangeMin, sess.rangeMax, targetId, sess.usedOpponents);
    if (!opponent) { calibNextBook(); return; }

    sess.usedOpponents.add(opponent.importOrder);
    const oppRating = ensureBookStat(opponent.importOrder).rating;
    applyDraw(targetId, opponent.importOrder);
    saveBattleData();

    const margin = Math.round((sess.rangeMax - sess.rangeMin) * 0.2);
    sess.rangeMin = Math.max(sess.rangeMin, oppRating - margin);
    sess.rangeMax = Math.min(sess.rangeMax, oppRating + margin);

    sess.results.push({ opponentId: opponent.importOrder, opponentRating: oppRating, targetWon: null, draw: true });
    sess.probesDone++;
    sess._calibPair = null;

    const nextOpponent = pickCalibOpponent(sess.rangeMin, sess.rangeMax, targetId, sess.usedOpponents);
    if (!nextOpponent) { calibNextBook(); return; }
    duelStartTime = Date.now();
    renderBattlePlay();
}

function calibNextBook() {
    const queue = battleSession?.remainingQueue || [];
    if (queue.length === 0) {
        renderCalibResult();
        return;
    }
    battleSession = startCalibTarget(queue[0], queue.slice(1));
    duelStartTime = Date.now();
    renderBattlePlay();
}

function calibStop() {
    battleSession = null;
    duelStartTime = null;
    renderBattlePlay();
}

// ============================================================
//  KEYBOARD SUPPORT
// ============================================================
function battleKeyHandler(e) {
    if (battleView !== "play") return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (battleSession?.mode === "complex-setup") return;
    if (!battleSession) return;

    if (battleSession.mode === "classic") {
        if (e.key === "ArrowLeft"  || e.key === "1") { e.preventDefault(); flashCard("left");  chooseSide(pickNextPair()[0]); }
        if (e.key === "ArrowRight" || e.key === "2") { e.preventDefault(); flashCard("right"); chooseSide(pickNextPair()[1]); }
        return;
    }

    if (battleSession.mode === "calibration") {
        const pair = battleSession._calibPair;
        if (!pair) return;
        if (e.key === "ArrowLeft"  || e.key === "1") { e.preventDefault(); flashCard("left");  calibChoose(pair[0]); }
        if (e.key === "ArrowRight" || e.key === "2") { e.preventDefault(); flashCard("right"); calibChoose(pair[1]); }
        if (e.key === "ArrowDown"  || e.key === " ") { e.preventDefault(); calibDraw(); }
        if (e.key === "n" || e.key === "N")           { e.preventDefault(); calibNextBook(); }
        return;
    }

    if (battleSession.mode === "quick-calib") {
        const pair = battleSession.currentPair;
        if (!pair) return;
        if (e.key === "ArrowLeft"  || e.key === "1") { e.preventDefault(); flashCard("left");  qcalibChoose(pair[0]); }
        if (e.key === "ArrowRight" || e.key === "2") { e.preventDefault(); flashCard("right"); qcalibChoose(pair[1]); }
        if (e.key === "ArrowDown"  || e.key === " ") { e.preventDefault(); qcalibDraw(); }
        return;
    }

    if (battleSession.mode === "complex") {
        const slots = battleSession.slots;
        if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); flashComplexSlot("reject"); complexChoose(-1); return; }
        if (/^[0-9]$/.test(e.key)) {
            const n = e.key === "0" ? 10 : Number(e.key);
            if (n >= 1 && n <= slots) { e.preventDefault(); flashComplexSlot(n - 1); complexChoose(n - 1); }
            return;
        }
        if (slots <= 3) {
            if (e.key === "ArrowDown")  { e.preventDefault(); flashComplexSlot("reject"); complexChoose(-1); }
            if (e.key === "ArrowLeft")  { e.preventDefault(); flashComplexSlot(0); complexChoose(0); }
            if (slots === 2 && e.key === "ArrowRight") { e.preventDefault(); flashComplexSlot(1); complexChoose(1); }
            if (slots === 3 && e.key === "ArrowUp")    { e.preventDefault(); flashComplexSlot(1); complexChoose(1); }
            if (slots === 3 && e.key === "ArrowRight") { e.preventDefault(); flashComplexSlot(2); complexChoose(2); }
        }
    }
}

function flashCard(side) {
    const arena = document.querySelector(".battle-arena");
    if (!arena) return;
    const cards = arena.querySelectorAll(".battle-card");
    const idx   = side === "left" ? 0 : 1;
    if (cards[idx]) {
        cards[idx].style.borderColor = "#5cb85c";
        cards[idx].style.background  = "#1e2a1e";
        setTimeout(() => {
            if (cards[idx]) { cards[idx].style.borderColor = ""; cards[idx].style.background = ""; }
        }, 120);
    }
}

function flashComplexSlot(slotIndexOrReject) {
    if (slotIndexOrReject === "reject") {
        const btn = document.querySelector(".complex-reject-btn");
        if (btn) { btn.style.background = "#5a2a2a"; setTimeout(() => { if (btn) btn.style.background = ""; }, 120); }
        return;
    }
    const els = document.querySelectorAll(".complex-shelf-slot");
    const el  = els[slotIndexOrReject];
    if (el) {
        el.style.borderColor = "#5cb85c";
        el.style.background  = "#1e2a1e";
        setTimeout(() => { if (el) { el.style.borderColor = ""; el.style.background = ""; } }, 120);
    }
}

document.addEventListener("keydown", battleKeyHandler);

// ============================================================
//  RANKING
// ============================================================
function getRankedBooks() {
    return Object.entries(battleData.bookStats)
        .map(([id, stat]) => ({ id: Number(id), stat }))
        .filter(e => e.stat !== null && e.stat !== undefined && getBookById(e.id) !== null)
        .sort((a, b) => {
            const aPlayed = getDuels(a.stat) > 0;
            const bPlayed = getDuels(b.stat) > 0;
            if (aPlayed !== bPlayed) return aPlayed ? -1 : 1;
            return b.stat.rating - a.stat.rating;
        });
}

// ============================================================
//  RENDER — MAIN ENTRY
// ============================================================
window.renderBattle = function () {
    loadBattleData();
    const tab = document.getElementById("tab-battle");
    if (!tab || !tab.classList.contains("active")) return;
    renderBattleSubNav();
    switchBattleView(battleView);
};

function renderBattleSubNav() {
    const nav = document.getElementById("battleSubNav");
    if (!nav) return;
    const blCount = (battleData.blacklist || []).length;
    nav.innerHTML = `
        <button onclick="switchBattleView('play')"      class="battle-subnav ${battleView==='play'      ?'active':''}">▶ Play</button>
        <button onclick="switchBattleView('rankings')"  class="battle-subnav ${battleView==='rankings'  ?'active':''}">🏆 Rankings</button>
        <button onclick="switchBattleView('stats')"     class="battle-subnav ${battleView==='stats'     ?'active':''}">📊 Stats</button>
        <button onclick="switchBattleView('blacklist')" class="battle-subnav ${battleView==='blacklist' ?'active':''}">🚫 Blacklist${blCount > 0 ? ` (${blCount})` : ''}</button>
        <button onclick="switchBattleView('export')"    class="battle-subnav ${battleView==='export'    ?'active':''}">📋 Export</button>
    `;
}

function switchBattleView(view) {
    battleView = view;
    renderBattleSubNav();

    if (!document.getElementById("battleExportView")) {
        const tab = document.getElementById("tab-battle");
        if (tab) {
            const d = document.createElement("div");
            d.id = "battleExportView";
            d.style.display = "none";
            tab.appendChild(d);
        }
    }

    document.getElementById("battlePlayView").style.display      = view === "play"      ? "block" : "none";
    document.getElementById("battleRankingsView").style.display  = view === "rankings"  ? "block" : "none";
    document.getElementById("battleStatsView").style.display     = view === "stats"     ? "block" : "none";
    document.getElementById("battleBlacklistView").style.display = view === "blacklist" ? "block" : "none";
    const exportEl = document.getElementById("battleExportView");
    if (exportEl) exportEl.style.display = view === "export" ? "block" : "none";

    if (view === "play")      renderBattlePlay();
    if (view === "rankings")  renderBattleRankings();
    if (view === "stats")     renderBattleStats();
    if (view === "blacklist") renderBattleBlacklist();
    if (view === "export")    renderBattleExport();
}

// ============================================================
//  PLAY VIEW
// ============================================================
function renderBattlePlay() {
    const el = document.getElementById("battlePlayView");
    if (!el) return;

    if (battleSession?.mode === "complex-setup")  { renderComplexSetup(el);   return; }
    if (battleSession?.mode === "complex")         { renderComplexPlay(el);    return; }
    if (battleSession?.mode === "calibration")     { renderCalibPlay(el);      return; }
    if (battleSession?.mode === "quick-calib")     { renderQuickCalibPlay(el); return; }
    if (!battleSession)                            { renderLobby(el);          return; }

    // Classic play
    const pool     = battleSession.pool;
    const total    = battleSession.rounds.length + pool.length;
    const done     = battleSession.rounds.length;
    const progress = total > 1 ? Math.round((done / (total - 1)) * 100) : 100;
    const [idA, idB] = pickNextPair();
    const bookA = getBookById(idA), bookB = getBookById(idB);
    if (!bookA || !bookB) return;

    const cfg = getSessionConfig();
    el.innerHTML = `
        <div class="battle-progress-bar-wrap">
            <div class="battle-progress-label">${cfg.emoji} ${cfg.label} &nbsp;·&nbsp; Round ${done + 1} of ${total - 1} &nbsp;·&nbsp; ${pool.length} survivors</div>
            <div class="battle-progress-track"><div class="battle-progress-fill" style="width:${progress}%"></div></div>
        </div>
        <div class="battle-arena">
            ${renderBookCard(bookA, idA)}
            <div class="battle-vs">VS</div>
            ${renderBookCard(bookB, idB)}
        </div>
        <p class="battle-hint">Tap a book — or use ← → or 1 2 keys.</p>
        <button class="battle-abandon-btn" onclick="abandonSession()">✕ Abandon session</button>`;
}

function renderLobby(el) {
    const pool    = getBattlePool();
    const blCount = (battleData.blacklist || []).length;
    const cfg     = getSessionConfig();
    const slots   = battleComplexMode === "off" ? 0 : Number(battleComplexMode);
    const actualSize = Math.min(pool.length, cfg.size);

    let keyHint = "";
    if (slots === 0)      keyHint = "Keys: ← → or 1 2";
    else if (slots === 2) keyHint = "Keys: ← → or 1 2 · Space/↓ = reject";
    else if (slots === 3) keyHint = "Keys: ← ↑ → or 1 2 3 · Space/↓ = reject";
    else                  keyHint = `Keys: 1–${slots <= 9 ? slots : "9, 0=10"} · Space = reject`;

    // Stats summary
    const allStats     = Object.values(battleData.bookStats).filter(Boolean);
    const unranked     = allStats.filter(s => getDuels(s) === 0).length;
    const totalDueled  = allStats.filter(s => getDuels(s) > 0).length;

    el.innerHTML = `
        <div class="battle-lobby">
            <h2>⚔ BookDuel</h2>

            <div class="lobby-mode-grid">
                ${Object.entries(SESSION_CONFIGS).map(([key, c]) => `
                    <button class="lobby-mode-btn ${battlePoolMode === key ? 'active' : ''}"
                            onclick="saveBattlePoolMode('${key}'); renderBattlePlay()">
                        <span class="lobby-mode-emoji">${c.emoji}</span>
                        <span class="lobby-mode-label">${c.label}</span>
                        <span class="lobby-mode-size">${c.size === Infinity ? 'All' : c.size} books</span>
                    </button>`).join("")}
                <button class="lobby-mode-btn lobby-mode-calib"
                        onclick="startCalibration()">
                    <span class="lobby-mode-emoji">🔬</span>
                    <span class="lobby-mode-label">Calibrate</span>
                    <span class="lobby-mode-size">Few duels first</span>
                </button>
                <button class="lobby-mode-btn lobby-mode-qcalib"
                        onclick="startQuickCalib()">
                    <span class="lobby-mode-emoji">⚡</span>
                    <span class="lobby-mode-label">Quick Calib</span>
                    <span class="lobby-mode-size">Smart pairs</span>
                </button>
            </div>

            <div class="lobby-config-row">
                <div class="lobby-config-item">
                    <label>Pool focus</label>
                    <select onchange="saveBattleFocus(this.value); renderBattlePlay()" style="background:#1a1a1a;color:#ddd;border:1px solid #444;padding:4px 8px;border-radius:4px;">
                        <option value="random" ${battleFocus==="random"?"selected":""}>🎲 Pure random</option>
                        <option value="-2"     ${battleFocus==="-2"?"selected":""}>⬇ Bottom-heavy</option>
                        <option value="-1"     ${battleFocus==="-1"?"selected":""}>↙ Lower-mid focus</option>
                        <option value="0"      ${battleFocus==="0"?"selected":""}>⚖ Balanced</option>
                        <option value="1"      ${battleFocus==="1"?"selected":""}>↗ Upper-mid focus</option>
                        <option value="2"      ${battleFocus==="2"?"selected":""}>⬆ Top-heavy</option>
                    </select>
                </div>
                <div class="lobby-config-item">
                    <label>Duel style</label>
                    <select onchange="saveBattleComplexMode(this.value); renderBattlePlay()" style="background:#1a1a1a;color:#ddd;border:1px solid #444;padding:4px 8px;border-radius:4px;">
                        <option value="off" ${battleComplexMode==="off"?"selected":""}>Classic</option>
                        ${[2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}" ${battleComplexMode===String(n)?"selected":""}>${n} slots</option>`).join("")}
                    </select>
                </div>
            </div>

            <div class="lobby-pool-info">
                📚 ${pool.length} eligible &nbsp;·&nbsp; This session: ~${actualSize} books
                ${blCount > 0 ? `<span class="battle-pool-blacklisted">&nbsp;·&nbsp; ${blCount} blacklisted</span>` : ""}
                ${unranked > 0 ? `<span style="color:#e67e22;">&nbsp;·&nbsp; ${unranked} unranked</span>` : ""}
            </div>

            ${battleData.sessions.length > 0 ? `
                <p style="color:#aaa;font-size:0.85em;margin-bottom:16px;">
                    Sessions: <strong>${battleData.sessions.length}</strong> &nbsp;|&nbsp;
                    Books ranked: <strong>${totalDueled}</strong>
                </p>` : ""}

            <button class="battle-start-btn" onclick="startNewSession()">
                ${cfg.emoji} Start ${cfg.label} Session
            </button>

            ${pool.length < Math.max(2, slots + 1) ? `<p class="battle-warn">⚠ Not enough books${blCount > 0 ? ' — check blacklist' : ''}.</p>` : ""}
            <p style="color:#555;font-size:0.8em;margin-top:10px;">${keyHint}</p>
        </div>`;
}

// ── Complex setup ──────────────────────────────────────────────
function renderComplexSetup(el) {
    const shelf = battleSession.shelf;
    const slots = battleSession.slots;

    let rowsHtml = "";
    shelf.forEach((id, i) => {
        const b     = getBookById(id);
        const cover = b?.coverUrl ? `<img src="${b.coverUrl}" class="battle-shelf-thumb" alt="" onerror="this.style.display='none'">` : `<div class="battle-shelf-thumb-placeholder">📖</div>`;
        const stars = b?.rating > 0 ? `<div class="battle-stars" style="font-size:0.8em">${"★".repeat(b.rating)}${"☆".repeat(5-b.rating)}</div>` : "";
        const label = ["🥇","🥈","🥉"][i] || `#${i+1}`;
        rowsHtml += `
            <div class="setup-shelf-row">
                <div class="setup-slot-label">${label}</div>${cover}
                <div class="setup-book-info"><strong>${b?.title||"?"}</strong><small>${b?.author||""}</small>${stars}</div>
                <div class="setup-controls">
                    ${i > 0       ? `<button onclick="shelfMoveUp(${i})"   class="setup-btn">▲</button>` : `<span class="setup-btn-placeholder"></span>`}
                    ${i < slots-1 ? `<button onclick="shelfMoveDown(${i})" class="setup-btn">▼</button>` : `<span class="setup-btn-placeholder"></span>`}
                </div>
            </div>`;
    });

    el.innerHTML = `
        <div class="complex-setup-screen">
            <h2>📋 Set Your Starting Shelf</h2>
            <p style="color:#aaa;font-size:0.9em;margin-bottom:20px;">
                These ${slots} books start on your shelf. Use ▲ ▼ to rank them — slot 1 is your top pick.
            </p>
            <div class="setup-shelf-list">${rowsHtml}</div>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;flex-wrap:wrap;">
                <button class="battle-start-btn" onclick="confirmComplexSetup()">✓ Start session</button>
                <button class="battle-abandon-btn" onclick="abandonSession()">✕ Cancel</button>
            </div>
        </div>`;
}

// ── Complex play ───────────────────────────────────────────────
function renderComplexPlay(el) {
    const sess       = battleSession;
    const slots      = sess.slots;
    const shelf      = sess.shelf;
    const challenger = sess.queue[0];
    const book       = getBookById(challenger);
    const done       = sess.rounds.length;
    const total      = sess.totalBooks - slots;
    const progress   = total > 0 ? Math.round((done / total) * 100) : 100;
    if (!book) return;

    let keyHint;
    if (slots === 2) keyHint = "← or 1 = slot 1 &nbsp;·&nbsp; → or 2 = slot 2 &nbsp;·&nbsp; Space/↓ = reject";
    else if (slots === 3) keyHint = "← or 1 · ↑ or 2 · → or 3 &nbsp;·&nbsp; Space/↓ = reject";
    else keyHint = `Keys 1–${slots <= 9 ? slots : "9, 0=10"} for slots &nbsp;·&nbsp; Space = reject`;

    const cover = book.coverUrl ? `<img src="${book.coverUrl}" class="battle-cover" alt="" onerror="this.style.display='none'">` : `<div class="battle-cover-placeholder">📖</div>`;
    const stars = book.rating > 0 ? `<div class="battle-stars">${"★".repeat(book.rating)}${"☆".repeat(5-book.rating)}</div>` : "";

    let shelfHtml = "";
    shelf.forEach((id, i) => {
        const sb     = getBookById(id);
        const scover = sb?.coverUrl ? `<img src="${sb.coverUrl}" class="battle-shelf-thumb" alt="" onerror="this.style.display='none'">` : `<div class="battle-shelf-thumb-placeholder">📖</div>`;
        const sstars = sb?.rating > 0 ? `<div class="battle-stars" style="font-size:0.75em">${"★".repeat(sb.rating)}${"☆".repeat(5-sb.rating)}</div>` : "";
        const slotLabel = ["🥇","🥈","🥉"][i] || `#${i+1}`;
        const keyLabel  = i < 9 ? `[${i+1}]` : `[0]`;
        shelfHtml += `
            <div class="complex-shelf-slot" onclick="complexChoose(${i})">
                <div class="complex-slot-label">${slotLabel} ${keyLabel}</div>${scover}
                <div class="complex-slot-info"><strong>${sb?.title||"?"}</strong><small>${sb?.author||""}</small>${sstars}</div>
                <div class="complex-slot-hint">swap in here</div>
            </div>`;
    });

    const cfg = getSessionConfig();
    el.innerHTML = `
        <div class="battle-progress-bar-wrap">
            <div class="battle-progress-label">${cfg.emoji} ${cfg.label} &nbsp;·&nbsp; Challenger ${done+1} of ${total} &nbsp;·&nbsp; ${sess.queue.length} remaining</div>
            <div class="battle-progress-track"><div class="battle-progress-fill" style="width:${progress}%"></div></div>
        </div>
        <div class="complex-arena">
            <div class="complex-challenger">
                <div class="complex-challenger-label">⚔ Challenger</div>${cover}
                <div class="battle-card-info">
                    <div class="battle-card-title">${book.title}</div>
                    <div class="battle-card-author">${book.author||""}</div>${stars}
                </div>
            </div>
            <div class="complex-shelf">
                <div class="complex-shelf-label">Your Shelf</div>
                <div class="complex-shelf-slots">${shelfHtml}</div>
                <button class="complex-reject-btn" onclick="complexChoose(-1)">✕ Reject challenger [Space]</button>
            </div>
        </div>
        <p class="battle-hint">${keyHint}</p>
        <button class="battle-abandon-btn" onclick="abandonSession()">✕ Abandon session</button>`;
}

// ── Calibration play ───────────────────────────────────────────
function renderCalibPlay(el) {
    const sess     = battleSession;
    const targetId = sess.targetId;
    const target   = getBookById(targetId);
    if (!target) { calibNextBook(); return; }

    const opponent = pickCalibOpponent(sess.rangeMin, sess.rangeMax, targetId, sess.usedOpponents);
    if (!opponent) { calibNextBook(); return; }

    // Store for keyboard handler
    sess._calibPair = [targetId, opponent.importOrder];

    const tStat   = ensureBookStat(targetId);
    const oppStat = ensureBookStat(opponent.importOrder);
    const ranked  = getRankedBooks();
    const oppRank = ranked.findIndex(e => e.id === opponent.importOrder) + 1;
    const tRank   = ranked.findIndex(e => e.id === targetId) + 1;
    const tDuels  = getDuels(tStat);
    const conf    = confidenceLabel(tStat);

    const tCover = target.coverUrl   ? `<img src="${target.coverUrl}"   class="battle-cover" alt="" onerror="this.style.display='none'">` : `<div class="battle-cover-placeholder">📖</div>`;
    const oCover = opponent.coverUrl ? `<img src="${opponent.coverUrl}" class="battle-cover" alt="" onerror="this.style.display='none'">` : `<div class="battle-cover-placeholder">📖</div>`;
    const tStars = target.rating   > 0 ? `<div class="battle-stars">${"★".repeat(target.rating)}${"☆".repeat(5-target.rating)}</div>` : "";
    const oStars = opponent.rating > 0 ? `<div class="battle-stars">${"★".repeat(opponent.rating)}${"☆".repeat(5-opponent.rating)}</div>` : "";

    const winRate   = getWinRate(tStat);
    const winRateTxt = winRate !== null ? `${Math.round(winRate*100)}% W (${tStat.wins}W/${tStat.losses}L)` : "no duels yet";

    const pct = Math.round((sess.probesDone / sess.probesMax) * 100);

    const reasoning = `
        <div class="calib-reasoning">
            <div class="calib-reason-row">
                <span>📍 Calibrating:</span>
                <strong>${target.title}</strong>
                ${tRank > 0 ? `<span style="color:#666;">currently #${tRank}</span>` : ""}
            </div>
            <div class="calib-reason-row">
                <span>📊 Record:</span>
                <strong style="color:${conf.color}">${winRateTxt} &nbsp;·&nbsp; ${conf.label}</strong>
                <span style="color:#666;">(${tDuels} duel${tDuels!==1?"s":""})</span>
            </div>
            <div class="calib-reason-row">
                <span>🎯 Search range:</span>
                <strong>${sess.rangeMin.toLocaleString()} – ${sess.rangeMax.toLocaleString()}</strong>
                <span style="color:#666;">opponent is near midpoint (${Math.round((sess.rangeMin+sess.rangeMax)/2).toLocaleString()})</span>
            </div>
            <div class="calib-reason-row">
                <span>🔍 Opponent rank:</span>
                <span>~#${oppRank||"?"} · rated ${oppStat.rating.toLocaleString()} · ${getDuels(oppStat)} duels</span>
            </div>
        </div>`;

    el.innerHTML = `
        <div class="battle-progress-bar-wrap">
            <div class="battle-progress-label">🔬 Calibrating: <em>${target.title}</em> &nbsp;·&nbsp; ${sess.remainingQueue.length} queued</div>
            <div class="battle-progress-track"><div class="battle-progress-fill" style="width:${pct}%"></div></div>
        </div>
        ${reasoning}
        <div class="battle-arena">
            <div class="battle-card" onclick="calibChoose(${targetId})">
                ${tCover}
                <div class="battle-card-info">
                    <div class="battle-card-title">${target.title}</div>
                    <div class="battle-card-author">${target.author||""}</div>
                    ${tStars}
                    <div class="calib-target-badge">🔬 Target</div>
                </div>
            </div>
            <div class="calib-vs-col">
                <div class="battle-vs">VS</div>
                <button class="calib-draw-btn" onclick="calibDraw()">↕ Same level</button>
            </div>
            <div class="battle-card" onclick="calibChoose(${opponent.importOrder})">
                ${oCover}
                <div class="battle-card-info">
                    <div class="battle-card-title">${opponent.title}</div>
                    <div class="battle-card-author">${opponent.author||""}</div>
                    ${oStars}
                    <div style="font-size:0.75em;color:#777;margin-top:4px;">Rank ~#${oppRank||"?"} · ${oppStat.rating}</div>
                </div>
            </div>
        </div>
        <p class="battle-hint">← → or 1 2 to pick &nbsp;·&nbsp; ↓ or Space = same level &nbsp;·&nbsp; N = next book</p>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:8px;">
            ${sess.remainingQueue.length > 0 ? `<button class="battle-abandon-btn" style="background:#1a2a1a;border-color:#3a5a3a;color:#8bc88b;" onclick="calibNextBook()">→ Next book</button>` : ""}
            <button class="battle-abandon-btn" onclick="calibStop()">✕ Stop</button>
        </div>`;
}

function renderCalibResult() {
    const el   = document.getElementById("battlePlayView");
    if (!el) return;
    const sess = battleSession;
    const stat = ensureBookStat(sess.targetId);
    const book = getBookById(sess.targetId);
    const ranked   = getRankedBooks();
    const newRank  = ranked.findIndex(e => e.id === sess.targetId) + 1;
    const conf     = confidenceLabel(stat);
    const winRate  = getWinRate(stat);
    const cover    = book?.coverUrl ? `<img src="${book.coverUrl}" class="battle-winner-cover" style="width:80px;height:120px;" alt="" onerror="this.style.display='none'">` : `<div style="font-size:3em;">📖</div>`;

    let probeRows = "";
    sess.results.forEach((r, i) => {
        const opp         = getBookById(r.opponentId);
        const resultColor = r.draw ? '#888' : (r.targetWon ? '#5cb85c' : '#c0392b');
        const resultText  = r.draw ? "Draw ≈" : (r.targetWon ? "Won ✓" : "Lost ✗");
        probeRows += `<tr>
            <td>${i+1}</td>
            <td>${opp ? opp.title : "?"}</td>
            <td style="color:${resultColor}">${resultText}</td>
            <td style="color:#888;">${r.opponentRating?.toLocaleString?.() ?? "?"}</td>
        </tr>`;
    });

    const hasMore = sess.remainingQueue.length > 0;

    el.innerHTML = `
        <div class="battle-winner-screen">
            <div class="battle-winner-crown">🔬</div>
            <h2>Calibration Complete</h2>
            ${cover}
            <div class="battle-winner-title">${book?.title || "?"}</div>
            <div class="battle-winner-author">${book?.author || ""}</div>
            <div class="battle-session-summary">
                <div class="battle-summary-row"><span>New rank</span><strong>#${newRank || "?"}</strong></div>
                <div class="battle-summary-row"><span>Rating</span><strong>${stat.rating.toLocaleString()}</strong></div>
                <div class="battle-summary-row"><span>Win rate</span><strong>${winRate !== null ? Math.round(winRate*100)+"%" : "–"} (${stat.wins}W / ${stat.losses}L)</strong></div>
                <div class="battle-summary-row"><span>Confidence</span><strong style="color:${conf.color}">${conf.label}</strong></div>
            </div>
            <div class="battle-stats-section" style="margin-top:16px;">
                <h3 style="font-size:0.9em;color:#aaa;">Probe history</h3>
                <table class="battle-stats-table">
                    <thead><tr><th>#</th><th>Opponent</th><th>Result</th><th>Opp. rating</th></tr></thead>
                    <tbody>${probeRows}</tbody>
                </table>
            </div>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;flex-wrap:wrap;">
                ${hasMore ? `<button class="battle-start-btn" onclick="calibNextBook()">🔬 Next book (${sess.remainingQueue.length} queued)</button>` : ""}
                <button onclick="calibStop()" style="padding:10px 24px;">✓ Done</button>
                <button onclick="switchBattleView('rankings')" style="padding:10px 24px;">🏆 Rankings</button>
            </div>
        </div>`;
}

// ── Quick Calib play ───────────────────────────────────────────
function renderQuickCalibPlay(el) {
    const sess       = battleSession;
    const [idA, idB] = sess.currentPair;
    const bookA      = getBookById(idA);
    const bookB      = getBookById(idB);
    if (!bookA || !bookB) { qcalibFinish(); return; }

    const sA = ensureBookStat(idA);
    const sB = ensureBookStat(idB);

    function cardHtml(book, id, stat) {
        const cover  = book.coverUrl ? `<img src="${book.coverUrl}" class="battle-cover" alt="" onerror="this.style.display='none'">` : `<div class="battle-cover-placeholder">📖</div>`;
        const stars  = book.rating > 0 ? `<div class="battle-stars">${"★".repeat(book.rating)}${"☆".repeat(5-book.rating)}</div>` : "";
        const duels  = getDuels(stat);
        const wr     = getWinRate(stat);
        const conf   = confidenceLabel(stat);
        const wrTxt  = wr !== null ? `${Math.round(wr*100)}% W` : "–";
        return `
            <div class="battle-card qcalib-card" onclick="qcalibChoose(${id})">
                ${cover}
                <div class="battle-card-info">
                    <div class="battle-card-title">${book.title}</div>
                    <div class="battle-card-author">${book.author||""}</div>
                    ${stars}
                    <div class="qcalib-range-bar" style="margin-top:8px;">
                        <div style="display:flex;justify-content:space-between;font-size:0.72em;color:#777;">
                            <span>Rating: ${stat.rating.toLocaleString()}</span>
                            <span style="color:${conf.color}">${conf.label}</span>
                        </div>
                        <div style="font-size:0.68em;color:#555;margin-top:2px;">${wrTxt} · ${duels} duel${duels!==1?"s":""}</div>
                    </div>
                </div>
            </div>`;
    }

    const gap     = Math.abs(sA.rating - sB.rating);
    const infoLine = gap < 100
        ? `Very close ratings (${sA.rating} vs ${sB.rating}) — this will be decisive`
        : `Ratings: ${sA.rating} vs ${sB.rating} — gap of ${gap}`;

    el.innerHTML = `
        <div class="battle-progress-bar-wrap">
            <div class="battle-progress-label">⚡ Quick Calibration &nbsp;·&nbsp; ${sess.roundsDone} duels played</div>
            <div class="battle-progress-track" style="background:#1a1a2a;">
                <div class="battle-progress-fill" style="width:100%;background:linear-gradient(90deg,#2a2a6a,#4a4aaa);opacity:0.4;"></div>
            </div>
        </div>
        <p class="qcalib-info-line">${infoLine}</p>
        <div class="battle-arena">
            ${cardHtml(bookA, idA, sA)}
            <div class="calib-vs-col">
                <div class="battle-vs">VS</div>
                <button class="calib-draw-btn" onclick="qcalibDraw()">↕ Same level</button>
            </div>
            ${cardHtml(bookB, idB, sB)}
        </div>
        <p class="battle-hint">Tap a book or ← → / 1 2 · ↓ or Space = same level · Stop any time.</p>
        <button class="battle-abandon-btn" onclick="qcalibFinish()">✓ Stop &amp; save</button>`;
}

// ── Winner screens ─────────────────────────────────────────────
function renderBookCard(book, id) {
    const cover = book.coverUrl ? `<img src="${book.coverUrl}" class="battle-cover" alt="" onerror="this.style.display='none'">` : `<div class="battle-cover-placeholder">📖</div>`;
    const stars = book.rating > 0 ? `<div class="battle-stars">${"★".repeat(book.rating)}${"☆".repeat(5-book.rating)}</div>` : "";
    return `<div class="battle-card" onclick="chooseSide(${id})">${cover}<div class="battle-card-info"><div class="battle-card-title">${book.title}</div><div class="battle-card-author">${book.author||""}</div>${stars}</div></div>`;
}

function renderBattleWinner(winnerId, session) {
    const el      = document.getElementById("battlePlayView");
    if (!el) return;
    const winner  = getBookById(winnerId);
    const stat    = battleData.bookStats[winnerId] || {};
    const last    = session.rounds[session.rounds.length - 1];
    const runnerUp = getBookById(last?.loser);
    const timed   = session.rounds.filter(r => r.durationMs != null && r.durationMs > 0).sort((a,b) => a.durationMs - b.durationMs);
    const fastest = timed[0], slowest = timed[timed.length-1];
    const cover   = winner?.coverUrl ? `<img src="${winner.coverUrl}" class="battle-winner-cover" alt="" onerror="this.style.display='none'">` : `<div class="battle-cover-placeholder" style="font-size:4em;">📖</div>`;
    const cfg     = SESSION_CONFIGS[session.poolMode] || SESSION_CONFIGS.standard;
    const conf    = confidenceLabel(stat);
    const winRate = getWinRate(stat);

    el.innerHTML = `
        <div class="battle-winner-screen">
            <div class="battle-winner-crown">👑</div>
            <h2>${cfg.emoji} ${cfg.label} Champion</h2>
            ${cover}
            <div class="battle-winner-title">${winner?.title||"Unknown"}</div>
            <div class="battle-winner-author">${winner?.author||""}</div>
            <div class="battle-session-summary">
                <div class="battle-summary-row"><span>Books in session</span><strong>${session.poolSize}</strong></div>
                <div class="battle-summary-row"><span>Rounds played</span><strong>${session.rounds.length}</strong></div>
                ${runnerUp ? `<div class="battle-summary-row"><span>Runner-up</span><strong>${runnerUp.title}</strong></div>` : ""}
                ${fastest  ? `<div class="battle-summary-row"><span>Fastest pick</span><strong>${fmtMs(fastest.durationMs)}</strong></div>` : ""}
                ${slowest && slowest !== fastest ? `<div class="battle-summary-row"><span>Slowest pick</span><strong>${fmtMs(slowest.durationMs)}</strong></div>` : ""}
                <div class="battle-summary-row"><span>Rating</span><strong>${stat.rating || RATING_START}</strong></div>
                <div class="battle-summary-row"><span>Win rate</span><strong>${winRate !== null ? Math.round(winRate*100)+"%" : "–"} (${stat.wins||0}W / ${stat.losses||0}L)</strong></div>
                <div class="battle-summary-row"><span>Confidence</span><strong style="color:${conf.color}">${conf.label}</strong></div>
                <div class="battle-summary-row"><span>Session wins</span><strong>${stat.sessionWins||0}</strong></div>
            </div>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;flex-wrap:wrap;">
                <button class="battle-start-btn" onclick="startNewSession()">▶ Play Again</button>
                <button onclick="switchBattleView('rankings')" style="padding:10px 24px;">🏆 Rankings</button>
                <button onclick="switchBattleView('stats')"    style="padding:10px 24px;">📊 Stats</button>
            </div>
        </div>`;
}

function renderComplexWinner(session) {
    const el    = document.getElementById("battlePlayView");
    if (!el) return;
    const shelf = session.shelf;
    const podium = ["🥇","🥈","🥉"];
    const cfg    = SESSION_CONFIGS[session.poolMode] || SESSION_CONFIGS.standard;

    let podiumHtml = "";
    shelf.forEach((id, i) => {
        const b     = getBookById(id);
        const cover = b?.coverUrl ? `<img src="${b.coverUrl}" class="battle-winner-cover" style="width:80px;height:120px;" alt="" onerror="this.style.display='none'">` : `<div style="font-size:3em;">📖</div>`;
        podiumHtml += `<div class="complex-podium-entry"><div style="font-size:2em;">${podium[i]||`#${i+1}`}</div>${cover}<strong>${b?.title||"?"}</strong><small style="color:#aaa;">${b?.author||""}</small></div>`;
    });

    const timed   = session.rounds.filter(r => r.durationMs != null && r.durationMs > 0).sort((a,b) => a.durationMs - b.durationMs);
    const fastest = timed[0], slowest = timed[timed.length-1];
    const swaps   = session.rounds.filter(r => r.action === "swap").length;
    const rejects = session.rounds.filter(r => r.action === "reject").length;

    el.innerHTML = `
        <div class="battle-winner-screen">
            <div class="battle-winner-crown">🏆</div>
            <h2>${cfg.emoji} ${cfg.label} — Top ${shelf.length}</h2>
            <div class="complex-podium">${podiumHtml}</div>
            <div class="battle-session-summary">
                <div class="battle-summary-row"><span>Books judged</span><strong>${session.poolSize}</strong></div>
                <div class="battle-summary-row"><span>Swaps</span><strong>${swaps}</strong></div>
                <div class="battle-summary-row"><span>Rejected</span><strong>${rejects}</strong></div>
                ${fastest ? `<div class="battle-summary-row"><span>Fastest</span><strong>${fmtMs(fastest.durationMs)}</strong></div>` : ""}
                ${slowest && slowest !== fastest ? `<div class="battle-summary-row"><span>Slowest</span><strong>${fmtMs(slowest.durationMs)}</strong></div>` : ""}
            </div>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;flex-wrap:wrap;">
                <button class="battle-start-btn" onclick="startNewSession()">▶ Play Again</button>
                <button onclick="switchBattleView('rankings')" style="padding:10px 24px;">🏆 Rankings</button>
                <button onclick="switchBattleView('stats')"    style="padding:10px 24px;">📊 Stats</button>
            </div>
        </div>`;
}

// ============================================================
//  RANKINGS VIEW
// ============================================================
function renderBattleRankings() {
    const el = document.getElementById("battleRankingsView");
    if (!el) return;
    const ranked  = getRankedBooks();
    const limited = ranked.slice(0, battleRankingLimit);
    const medals  = ["🥇","🥈","🥉"];

    if (ranked.length === 0) {
        el.innerHTML = `<p style="color:#aaa;margin:40px;text-align:center;">No rankings yet — play a session first!</p>`;
        return;
    }

    const hasEvidence = limited.filter(e => getDuels(e.stat) > 0);
    const noEvidence  = limited.filter(e => getDuels(e.stat) === 0);

    let html = `
        <h2 style="margin-bottom:4px;">📖 BookDuel Rankings</h2>
        <p style="color:#888;margin-bottom:16px;font-size:0.9em;">
            ${ranked.length} books ranked &nbsp;·&nbsp; Sorted by rating
        </p>
        <div class="battle-rankings-table">
            <div class="battle-rank-header">
                <span class="rh-num">#</span>
                <span class="rh-book">Book</span>
                <span class="rh-rating">Rating</span>
                <span class="rh-range">Win rate</span>
                <span class="rh-win">Duels</span>
                <span class="rh-ev">Confidence</span>
                <span class="rh-calib"></span>
            </div>`;

    function renderRow(entry, i) {
        const book = getBookById(entry.id);
        if (!book) return "";
        const s        = entry.stat;
        const duels    = getDuels(s);
        const winRate  = getWinRate(s);
        const winPct   = winRate !== null ? Math.round(winRate * 100) : null;
        const conf     = confidenceLabel(s);
        const cover    = book.coverUrl ? `<img src="${book.coverUrl}" class="battle-rank-thumb" alt="" onerror="this.style.display='none'">` : `<div class="battle-rank-thumb-placeholder">📖</div>`;
        const undefeated = s.losses === 0 && s.wins > 0 ? `<span class="battle-badge badge-undefeated">Undefeated</span>` : "";

        // Win rate bar (0–100%)
        const winBarHtml = winPct !== null ? `
            <div class="range-bar-wrap" title="${winPct}% win rate">
                <div class="range-bar-track">
                    <div class="range-bar-fill" style="left:0;width:${winPct}%;background:${winPct>=50?'#4a8a4a':'#8a4a4a'};"></div>
                    <div class="range-bar-point" style="left:50%;background:#555;"></div>
                </div>
                <div class="range-bar-labels">
                    <span>0%</span><span style="color:#aaa">${winPct}%</span><span>100%</span>
                </div>
            </div>` : `<span style="color:#444;font-size:0.8em;">no duels</span>`;

        const rankLabel = i < 3 ? medals[i] : (i + 1);
        return `
        <div class="battle-rank-row ${i < 3 ? 'top-three' : ''}">
            <span class="rh-num battle-rank-num">${rankLabel}</span>
            <span class="rh-book battle-rank-book">
                ${cover}
                <span>
                    <strong>${book.title}</strong>
                    <small style="color:#aaa;display:block;">${book.author||""}</small>
                    ${undefeated}
                </span>
            </span>
            <span class="rh-rating battle-rank-pts">
                <span class="battle-rating-num">${s.rating.toLocaleString()}</span>
            </span>
            <span class="rh-range">${winBarHtml}</span>
            <span class="rh-win">${duels > 0 ? duels : "–"}</span>
            <span class="rh-ev">
                <div class="evidence-cell">
                    <div class="evidence-bar-track"><div class="evidence-bar-fill" style="width:${Math.min(100,Math.round(duels/30*100))}%;background:${conf.color}"></div></div>
                    <span class="evidence-label" style="color:${conf.color}">${conf.label}</span>
                </div>
            </span>
            <span class="rh-calib"><button class="rank-calib-btn" onclick="startCalibSingle(${entry.id})" title="Recalibrate">🔬</button></span>
        </div>`;
    }

    hasEvidence.forEach((entry, i) => { html += renderRow(entry, i); });

    if (noEvidence.length > 0) {
        html += `<div class="rank-unranked-divider">
            <span>⬇ ${noEvidence.length} unplayed book${noEvidence.length!==1?"s":""} — no duels yet</span>
        </div>`;
        noEvidence.forEach((entry, i) => { html += renderRow(entry, hasEvidence.length + i); });
    }

    html += `</div>`;
    if (ranked.length > battleRankingLimit) {
        html += `<p style="color:#666;font-size:0.85em;margin-top:12px;text-align:center;">
            Showing top ${battleRankingLimit} of ${ranked.length}. Increase limit in Options.</p>`;
    }
    el.innerHTML = html;
}

// ============================================================
//  BLACKLIST VIEW  (unchanged logic)
// ============================================================
function renderBattleBlacklist() {
    const el = document.getElementById("battleBlacklistView");
    if (!el) return;
    const eligible = books
        .filter(b => b.exclusiveShelf === "read" || b.exclusiveShelf === "currently-reading")
        .sort((a, b) => a.title.localeCompare(b.title));
    const blacklistSet     = new Set(battleData.blacklist || []);
    const blacklistedCount = eligible.filter(b => blacklistSet.has(b.importOrder)).length;
    const bySeries = {}, noSeries = [];
    eligible.forEach(b => {
        if (b.series) { if (!bySeries[b.series]) bySeries[b.series] = []; bySeries[b.series].push(b); }
        else noSeries.push(b);
    });

    let html = `
        <div class="battle-blacklist-header">
            <div>
                <h2>🚫 Blacklist</h2>
                <p class="battle-blacklist-desc">Blacklisted books are excluded from all Duel sessions.<br>
                <em>Tip for series:</em> use "Keep only #1" so the whole series is represented by its first book.</p>
            </div>
            <div class="battle-blacklist-summary">
                <strong>${blacklistedCount}</strong> / <strong>${eligible.length}</strong> blacklisted
                ${blacklistedCount > 0 ? `<br><button class="battle-blacklist-clear" onclick="clearBlacklist()">Clear all</button>` : ""}
            </div>
        </div>`;

    const seriesNames = Object.keys(bySeries).sort();
    if (seriesNames.length > 0) {
        html += `<div class="battle-blacklist-section"><h3>By Series</h3>`;
        seriesNames.forEach(series => {
            const sb = bySeries[series].sort((a, b) => (a.seriesNumber??999)-(b.seriesNumber??999) || a.title.localeCompare(b.title));
            const allBl = sb.every(b => blacklistSet.has(b.importOrder));
            const allButFirstBl = sb.length > 1 && sb.slice(1).every(b => blacklistSet.has(b.importOrder)) && !blacklistSet.has(sb[0].importOrder);
            const seriesEsc = series.replace(/\\/g,"\\\\").replace(/'/g,"\\'");
            html += `<div class="battle-blacklist-series">
                <div class="battle-blacklist-series-header">
                    <strong>${series}</strong>
                    <span style="color:#777;font-size:0.85em;">${sb.length} book${sb.length!==1?'s':''}</span>
                    ${sb.length > 1 ? `
                        <button class="battle-bl-shortcut ${allButFirstBl?'active':''}" onclick="blacklistAllButFirst('${seriesEsc}')">Keep only #1</button>
                        <button class="battle-bl-shortcut ${allBl?'active':''}" onclick="blacklistSeries('${seriesEsc}')">Blacklist all</button>
                        <button class="battle-bl-shortcut" onclick="unblacklistSeries('${seriesEsc}')">Clear series</button>` : ""}
                </div>
                <div class="battle-blacklist-books">`;
            sb.forEach(b => {
                const isbl = blacklistSet.has(b.importOrder);
                const numLabel = b.seriesNumber != null ? `<span class="battle-bl-num">#${b.seriesNumber}</span>` : "";
                const cover = b.coverUrl ? `<img src="${b.coverUrl}" class="battle-bl-thumb" alt="" onerror="this.style.display='none'">` : `<div class="battle-bl-thumb-placeholder">📖</div>`;
                html += `<div class="battle-bl-book ${isbl?'blacklisted':''}" onclick="toggleBlacklist(${b.importOrder})">${cover}<div class="battle-bl-book-info">${numLabel}<span class="battle-bl-book-title">${b.title}</span></div><div class="battle-bl-toggle">${isbl?'🚫':'✓'}</div></div>`;
            });
            html += `</div></div>`;
        });
        html += `</div>`;
    }
    if (noSeries.length > 0) {
        html += `<div class="battle-blacklist-section"><h3>Standalone Books</h3><div class="battle-blacklist-books">`;
        noSeries.forEach(b => {
            const isbl = blacklistSet.has(b.importOrder);
            const cover = b.coverUrl ? `<img src="${b.coverUrl}" class="battle-bl-thumb" alt="" onerror="this.style.display='none'">` : `<div class="battle-bl-thumb-placeholder">📖</div>`;
            html += `<div class="battle-bl-book ${isbl?'blacklisted':''}" onclick="toggleBlacklist(${b.importOrder})">${cover}<div class="battle-bl-book-info"><span class="battle-bl-book-title">${b.title}</span><span class="battle-bl-book-author">${b.author||""}</span></div><div class="battle-bl-toggle">${isbl?'🚫':'✓'}</div></div>`;
        });
        html += `</div></div>`;
    }
    if (eligible.length === 0) html += `<p style="color:#aaa;text-align:center;margin-top:40px;">No read or currently-reading books yet.</p>`;
    el.innerHTML = html;
}

// ============================================================
//  STATS VIEW
// ============================================================
function renderBattleStats() {
    const el = document.getElementById("battleStatsView");
    if (!el) return;
    const sessions = battleData.sessions;
    if (sessions.length === 0) {
        el.innerHTML = `<p style="color:#aaa;margin:40px;text-align:center;">No stats yet — play a session first!</p>`;
        return;
    }

    const totalDuels = sessions.reduce((s, sess) => s + sess.rounds.length, 0);
    const totalBooks = Object.values(battleData.bookStats).filter(s => s && getDuels(s) > 0).length;
    const allRounds  = sessions.flatMap(s => s.rounds);

    const normalizedRounds = allRounds.map(r => {
        if (r.winner !== undefined) return r;
        if (r.action === "swap") return { winner: r.challenger, loser: (r.shelfSnapshot||[])[r.slotIndex], durationMs: r.durationMs };
        if (r.action === "reject") { const snap = r.shelfSnapshot||[]; return { winner: snap[snap.length-1], loser: r.challenger, durationMs: r.durationMs }; }
        return { winner: null, loser: null, durationMs: r.durationMs };
    });

    const timedRounds   = normalizedRounds.filter(r => r.durationMs != null && r.durationMs > 0);
    const sortedFastest = timedRounds.slice().sort((a,b) => a.durationMs - b.durationMs).slice(0,5);
    const sortedSlowest = timedRounds.slice().sort((a,b) => b.durationMs - a.durationMs).slice(0,5);
    const avgMs         = timedRounds.length > 0 ? timedRounds.reduce((s,r) => s+r.durationMs,0)/timedRounds.length : 0;

    const ranked = getRankedBooks();
    const dominant = ranked
        .filter(e => e.stat.appearances >= 3)
        .map(e => ({ ...e, winRate: e.stat.wins / Math.max(1, getDuels(e.stat)) }))
        .sort((a,b) => b.winRate - a.winRate)[0];

    const guiltyPleasure = ranked
        .filter((e,i) => i < Math.ceil(ranked.length/2) && e.stat.sessionWins > 0)
        .map(e => ({ ...e, book: getBookById(e.id) }))
        .filter(e => e.book && e.book.rating > 0 && e.book.rating <= 3)
        .sort((a,b) => a.book.rating - b.book.rating)[0];

    const rankIndex = {};
    ranked.forEach((e,i) => { rankIndex[e.id] = i; });
    let biggestUpset = null;
    normalizedRounds.forEach(r => {
        if (!r.winner || !r.loser) return;
        const wi = rankIndex[r.winner] ?? 9999, li = rankIndex[r.loser] ?? 9999;
        if (li < wi) { const gap = wi - li; if (!biggestUpset || gap > biggestUpset.gap) biggestUpset = { gap, winner: r.winner, loser: r.loser }; }
    });

    const modeCounts = {};
    sessions.forEach(s => { const k = s.poolMode || "standard"; modeCounts[k] = (modeCounts[k]||0) + 1; });

    let html = `<h2>📊 BookDuel Stats</h2>
        <div class="battle-stats-grid">
            ${statCard("🎮","Sessions Played",sessions.length)}
            ${statCard("⚔","Total Decisions",totalDuels)}
            ${statCard("📚","Books Ranked",totalBooks)}
            ${statCard("⏱","Avg Decision",fmtMs(Math.round(avgMs)))}
        </div>
        <div class="battle-stats-section"><h3>🎮 Session Modes</h3><div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;">
            ${Object.entries(SESSION_CONFIGS).map(([k,c]) => `<span style="color:#aaa;">${c.emoji} ${c.label}: <strong>${modeCounts[k]||0}</strong></span>`).join("")}
        </div></div>`;

    if (sortedFastest.length > 0) {
        html += `<div class="battle-stats-section"><h3>⚡ Fastest Decisions (Top 5)</h3>
            <table class="battle-stats-table"><thead><tr><th>#</th><th>Chosen</th><th>Rejected</th><th>Time</th></tr></thead><tbody>`;
        sortedFastest.forEach((r,i) => {
            const w = r.winner ? getBookById(r.winner) : null, l = r.loser ? getBookById(r.loser) : null;
            html += `<tr><td>${i+1}</td><td>${w?w.title:"–"}</td><td style="color:#888;">${l?l.title:"–"}</td><td class="battle-time-fast">${fmtMs(r.durationMs)}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }

    if (sortedSlowest.length > 0) {
        html += `<div class="battle-stats-section"><h3>🤔 Hardest Decisions (Top 5 Slowest)</h3>
            <table class="battle-stats-table"><thead><tr><th>#</th><th>Chosen</th><th>Rejected</th><th>Time</th></tr></thead><tbody>`;
        sortedSlowest.forEach((r,i) => {
            const w = r.winner ? getBookById(r.winner) : null, l = r.loser ? getBookById(r.loser) : null;
            html += `<tr><td>${i+1}</td><td>${w?w.title:"–"}</td><td style="color:#888;">${l?l.title:"–"}</td><td class="battle-time-slow">${fmtMs(r.durationMs)}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }

    html += `<div class="battle-stats-section"><h3>✨ Highlights</h3><div class="battle-highlights-grid">`;
    if (dominant) { const db = getBookById(dominant.id); html += highlightCard("👑 Most Dominant", db?db.title:"–", `${Math.round(dominant.winRate*100)}% win rate (min. 3 appearances)`); }
    if (guiltyPleasure) { const gb = guiltyPleasure.book; html += highlightCard("🙈 Guilty Pleasure", gb.title, `Top half of rankings but only ${"★".repeat(gb.rating)} (${gb.rating}/5 stars)`); }
    if (biggestUpset) { const wu = getBookById(biggestUpset.winner), lu = getBookById(biggestUpset.loser); html += highlightCard("🎯 Biggest Upset", wu?wu.title:"–", `Knocked out ${lu?lu.title:"–"} despite being ranked ${biggestUpset.gap} spots lower`); }
    html += `</div></div>`;

    html += `<div class="battle-stats-section"><h3>📋 Session History</h3>
        <table class="battle-stats-table">
            <thead><tr><th>Date</th><th>Mode</th><th>Pool</th><th>Rounds</th><th>Champion / Shelf</th></tr></thead><tbody>`;
    sessions.slice().reverse().forEach(sess => {
        const w   = getBookById(sess.winner);
        const cfg = SESSION_CONFIGS[sess.poolMode] || SESSION_CONFIGS.standard;
        const modeTag = sess.mode === "complex"
            ? `<span style="color:#aaa;font-size:0.8em;">${cfg.emoji} ${cfg.label} · ${sess.slots}s</span>`
            : `<span style="color:#aaa;font-size:0.8em;">${cfg.emoji} ${cfg.label}</span>`;
        const podium = sess.shelf
            ? sess.shelf.map(id => { const b = getBookById(id); return b?b.title:"?"; }).join(" › ")
            : (w ? w.title : sess.winner);
        html += `<tr><td>${fmtDate(sess.date)}</td><td>${modeTag}</td><td>${sess.poolSize}</td><td>${sess.rounds.length}</td><td>👑 ${podium}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    el.innerHTML = html;
}

function statCard(icon, label, value) {
    return `<div class="battle-stat-card"><div class="battle-stat-icon">${icon}</div><div class="battle-stat-value">${value}</div><div class="battle-stat-label">${label}</div></div>`;
}
function highlightCard(title, main, sub) {
    return `<div class="battle-highlight-card"><div class="battle-highlight-title">${title}</div><div class="battle-highlight-main">${main}</div><div class="battle-highlight-sub">${sub}</div></div>`;
}

// ============================================================
//  EXPORT VIEW
// ============================================================
const _exportPrefs = {
    includeRank:   true,
    includeTitle:  true,
    includeAuthor: true,
    includeRating: false,
    includeWinRate: false,
    includeDuels:  false,
    limit:         0,
    onlyRanked:    true,
    titleLang:     "original",
};

function renderBattleExport() {
    const el = document.getElementById("battleExportView");
    if (!el) return;

    const p = _exportPrefs;
    const ranked = getRankedBooks().map(e => ({
        book: getBookById(e.id),
        stat: e.stat
    })).filter(e => e.book);

    const pool    = p.onlyRanked ? ranked.filter(e => getDuels(e.stat) > 0) : ranked;
    const limited = p.limit > 0 ? pool.slice(0, p.limit) : pool;

    const lines = limited.map(({ book: b, stat: s }, i) => {
        const parts = [];
        if (p.includeRank)    parts.push(`#${i + 1}`);
        if (p.includeTitle) {
            const _bookLang    = getBookLangCode(b);
            let _exportTitle   = b.title || "Untitled";
            if (p.titleLang !== "original" && _bookLang !== p.titleLang) {
                const _alt = (b.altTitles || {})[p.titleLang];
                if (_alt && _alt.trim()) _exportTitle = _alt.trim();
            }
            parts.push(_exportTitle);
        }
        if (p.includeAuthor && b.author)  parts.push(`by ${b.author}`);
        if (p.includeRating && s)         parts.push(`[${s.rating}]`);
        if (p.includeWinRate && s) {
            const wr = getWinRate(s);
            parts.push(`${wr !== null ? Math.round(wr*100)+"%" : "–"} W`);
        }
        if (p.includeDuels && s)          parts.push(`${getDuels(s)} duels`);
        return parts.join(" · ");
    }).filter(line => line.trim());

    const previewText = lines.join("\n") || "(nothing to show)";

    const chk = (key, label) => `
        <label class="export-option">
            <input type="checkbox" ${p[key] ? "checked" : ""} onchange="_exportPrefs['${key}']=this.checked;renderBattleExport()">
            ${label}
        </label>`;

    el.innerHTML = `
        <div class="battle-blacklist-wrap" style="max-width:680px;">
            <h3 style="margin:0 0 18px;color:#e8e8e8;">📋 Export Rankings</h3>

            <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:20px;">
                <div>
                    <div style="font-size:0.75em;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Include</div>
                    ${chk("includeRank",    "# Rank")}
                    ${chk("includeTitle",   "Title")}
                    ${chk("includeAuthor",  "Author")}
                    ${chk("includeRating",  "Rating score")}
                    ${chk("includeWinRate", "Win %")}
                    ${chk("includeDuels",   "Duel count")}
                </div>
                <div>
                    <div style="font-size:0.75em;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Filter</div>
                    ${chk("onlyRanked", "Ranked books only")}
                    <label class="export-option" style="margin-top:10px;display:flex;align-items:center;gap:8px;">
                        <span style="white-space:nowrap;">Limit to top</span>
                        <input type="number" min="0" max="9999" value="${p.limit || ""}"
                            placeholder="all"
                            style="width:64px;background:#1e1e1e;border:1px solid #333;color:#e8e8e8;padding:3px 6px;border-radius:4px;font-size:0.9em;"
                            oninput="_exportPrefs.limit=parseInt(this.value)||0;renderBattleExport()">
                        <span style="color:#666;">places &nbsp;(0 = all)</span>
                    </label>
                </div>
                <div>
                    <div style="font-size:0.75em;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Title Language</div>
                    <label class="export-option" style="display:flex;align-items:center;gap:8px;">
                        <select onchange="_exportPrefs.titleLang=this.value;renderBattleExport()"
                            style="background:#1e1e1e;border:1px solid #333;color:#e8e8e8;padding:4px 8px;border-radius:4px;font-size:0.9em;">
                            <option value="original" ${p.titleLang==='original'?'selected':''}>Original</option>
                            <option value="pl" ${p.titleLang==='pl'?'selected':''}>🇵🇱 Polish</option>
                            <option value="en" ${p.titleLang==='en'?'selected':''}>🇬🇧 English</option>
                            <option value="ja" ${p.titleLang==='ja'?'selected':''}>🇯🇵 Japanese</option>
                        </select>
                        <span style="color:#666;white-space:nowrap;">where available</span>
                    </label>
                </div>
            </div>

            <div style="font-size:0.75em;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">
                Preview &nbsp;<span style="color:#555;text-transform:none;">${limited.length} book${limited.length !== 1 ? "s" : ""}</span>
            </div>
            <textarea id="exportPreviewArea" readonly
                style="width:100%;box-sizing:border-box;min-height:260px;background:#141414;border:1px solid #2a2a2a;
                       color:#ccc;font-family:monospace;font-size:0.85em;padding:12px;border-radius:6px;
                       resize:vertical;line-height:1.6;"
            >${previewText}</textarea>

            <div style="margin-top:12px;display:flex;align-items:center;gap:12px;">
                <button onclick="exportCopyText()"
                    style="padding:10px 28px;background:#2a4a2a;border:1px solid #4a7a4a;
                           color:#8bc88b;border-radius:6px;cursor:pointer;font-size:0.95em;font-weight:600;">
                    📋 Copy to clipboard
                </button>
                <span id="exportCopyConfirm" style="color:#5cb85c;font-size:0.85em;opacity:0;transition:opacity 0.4s;"></span>
            </div>
        </div>`;
}

function exportCopyText() {
    const area    = document.getElementById("exportPreviewArea");
    if (!area) return;
    const confirm = document.getElementById("exportCopyConfirm");
    const show    = () => {
        if (confirm) { confirm.textContent = "✓ Copied!"; confirm.style.opacity = "1"; setTimeout(() => { confirm.style.opacity = "0"; }, 2000); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(area.value).then(show).catch(() => { area.select(); document.execCommand("copy"); show(); });
    } else {
        area.select();
        document.execCommand("copy");
        show();
    }
}

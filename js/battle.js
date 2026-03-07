// ============================================================
//  BookDuel – ranking game
//  File: js/battle.js
// ============================================================

const BATTLE_KEY            = "reading_battle_data";
const BATTLE_LIMIT_KEY      = "reading_battle_ranking_limit";
const BATTLE_COMPLEX_KEY    = "reading_battle_complex";   // "off"|"2"-"10"
const BATTLE_POOL_MODE_KEY  = "reading_battle_pool_mode"; // "sprint"|"standard"|"marathon"|"deep"
const BATTLE_FOCUS_KEY      = "reading_battle_focus";     // "-2"|"-1"|"0"|"1"|"2"|"random"
const DEFAULT_RANKING_LIMIT = 20;

// ---------- persistent prefs ----------
let battleData         = null;
let battleRankingLimit = DEFAULT_RANKING_LIMIT;
let battleComplexMode  = "off";
let battlePoolMode     = "standard";  // sprint|standard|marathon|deep
let battleFocus        = "0";         // -2=bottom-heavy … 2=top-heavy, "random"=pure random

// ---------- live session ----------
let battleSession  = null;
let duelStartTime  = null;
let battleView     = "play";

// ============================================================
//  SESSION CONFIG
// ============================================================
const SESSION_CONFIGS = {
    sprint:   { label: "Sprint",   size: 30,  kMx: 0.6,  sessionWeight: 0.3,  emoji: "⚡" },
    standard: { label: "Standard", size: 75,  kMx: 1.0,  sessionWeight: 0.75, emoji: "📖" },
    marathon: { label: "Marathon", size: 150, kMx: 1.1,  sessionWeight: 1.0,  emoji: "🏃" },
    deep:     { label: "Deep Dive",size: Infinity, kMx: 1.25, sessionWeight: 1.5, emoji: "🌊" }
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
    battleComplexMode  = localStorage.getItem(BATTLE_COMPLEX_KEY)   || "off";
    battlePoolMode     = localStorage.getItem(BATTLE_POOL_MODE_KEY)  || "standard";
    battleFocus        = localStorage.getItem(BATTLE_FOCUS_KEY)      || "0";
    migrateBookStats();
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

function resetBattleStats() {
    if (!confirm("Reset all BookDuel rankings and session history? The blacklist will be kept. This cannot be undone.")) return;
    battleData.sessions  = [];
    battleData.bookStats = {};
    battleSession = null;
    duelStartTime = null;
    saveBattleData();
    renderBattle();
}

function resetBlacklist() {
    if (!confirm("Clear the entire BookDuel blacklist? Rankings and history will be kept.")) return;
    battleData.blacklist = [];
    saveBattleData();
    renderBattle();
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

function getBookById(importOrder) {
    return books.find(b => b.importOrder === importOrder) || null;
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
//  ELO SCALE — fixed 0–3000, midpoint 1500 (chess-style)
//
//  Previously dynamic (5 × bookCount), which caused scale inflation
//  as books were added: existing ratings didn't rescale, so the
//  distribution compressed toward the bottom over time.
//  Fixed scale means ratings are stable and intuitive.
// ============================================================
function getEloMidpoint() { return 1500; }
function getEloMax()      { return 3000; }
function getEloStart()    { return  750; } // 25% — books earn their way up

// ============================================================
//  BOUNDS SYSTEM  (lo / hi uncertainty range)
//
//  Every book tracks a plausible range [lo, hi] alongside its
//  point-estimate `rating`. The range only ever tightens:
//
//    Winner beats opponent at R:  lo = max(lo, opponent.lo)
//    Loser loses to opponent at R: hi = min(hi, opponent.hi)  (capped softly)
//
//  Fresh books: lo=1, hi=eloMax  (we know nothing)
//  Sort key for rankings = lo  (uncertain books sink to bottom)
//  Display: show `rating` as point estimate, (lo–hi) as range band
//
//  Evidence = 1 - (hi - lo) / eloMax
//    → 0% when range is fully open, ~100% when range is tight
// ============================================================

function getBoundsSpread(stat) {
    const lo = stat.lo ?? 1;
    const hi = stat.hi ?? getEloMax();
    return hi - lo;
}

// Evidence purely from range tightness — semantically correct
function getEvidenceScore(stat) {
    if (!stat) return 0;
    const spread = getBoundsSpread(stat);
    return Math.max(0, 1 - spread / getEloMax());
}

function evidenceLabel(score) {
    if (score < 0.15) return { label: "Uncertain",   color: "#c0392b" };
    if (score < 0.40) return { label: "Developing",  color: "#e67e22" };
    if (score < 0.70) return { label: "Established", color: "#f1c40f" };
    return                   { label: "Confident",   color: "#2ecc71" };
}

// ============================================================
//  BOUNDS + RATING INTEGRATION
//
//  Every duel nudges lo/hi bounds, scaled by opponent's evidence:
//    Low evidence opponent  → tiny nudge (we don't trust their position)
//    High evidence opponent → larger nudge (their position is reliable)
//
//  nudgeFraction = 0.03 + 0.12 × opponentEvidence²
//    → ranges from ~3% (unknown opponent) to ~15% (confident opponent)
//    of the gap between current bound and opponent's rating.
//
//  Rating anchoring:
//    Below "Established" (<70% evidence): rating = pure Elo point estimate
//    At "Established" (≥70% evidence):   rating = midpoint of [lo, hi]
//    This means well-calibrated books' rankings are driven by proven range,
//    not accumulated Elo drift.
// ============================================================

// ============================================================
//  BOUNDS UPDATE
//
//  When A beats B:
//  1. Base nudge: lo rises, hi falls — gentle when opponent is uncertain,
//     stronger when opponent is well-known.
//  2. Surprise factor: if the win/loss contradicts the current range
//     (e.g. you beat someone far above your hi, or lose to someone far
//     below your lo), the range shifts aggressively to correct itself.
//     The range should reflect reality — a book that beats a 1500 while
//     ranged at 600–800 is obviously misplaced.
// ============================================================
function nudgeBounds(winnerId, loserId) {
    const ws  = battleData.bookStats[winnerId];
    const ls  = battleData.bookStats[loserId];
    if (!ws || !ls) return;

    const eloMax    = getEloMax();
    const wEv = getEvidenceScore(ws);
    const lEv = getEvidenceScore(ls);

    const wLo = ws.lo ?? 1;
    const wHi = ws.hi ?? eloMax;
    const lLo = ls.lo ?? 1;
    const lHi = ls.hi ?? eloMax;

    // ── Winner ──────────────────────────────────────────────────────────
    // How surprising is this win? If loser's rating is above winner's hi,
    // the win directly contradicts the range — shift aggressively.
    const loserRating = ls.rating ?? lLo;
    const winnerSurprise = Math.max(0, loserRating - wHi); // how far above winner's hi the loser was

    if (winnerSurprise > 0) {
        // Contradicting evidence: shift the whole range up toward loser's rating
        const shift = Math.round(winnerSurprise * (0.4 + 0.4 * lEv));
        ws.lo = Math.min(eloMax, wLo + shift);
        ws.hi = Math.min(eloMax, wHi + shift);
    } else {
        // Normal case: nudge lo up within existing range
        const nudge = 0.04 + 0.18 * (lEv ** 2);
        const gap   = loserRating - wLo;
        if (gap > 0) ws.lo = Math.round(wLo + gap * nudge);
    }

    // ── Loser ───────────────────────────────────────────────────────────
    const winnerRating = ws.rating ?? wLo;
    const loserSurprise = Math.max(0, lLo - winnerRating); // how far below loser's lo the winner was

    if (loserSurprise > 0) {
        // Contradicting evidence: shift whole range down toward winner's rating
        const shift = Math.round(loserSurprise * (0.4 + 0.4 * wEv));
        ls.lo = Math.max(1, lLo - shift);
        ls.hi = Math.max(1, lHi - shift);
    } else {
        // Normal case: nudge hi down
        const nudge = 0.04 + 0.18 * (wEv ** 2);
        const gap   = lHi - winnerRating;
        if (gap > 0) ls.hi = Math.round(lHi - gap * nudge);
    }

    // Clamp and sanity
    ws.lo = Math.max(1,       Math.min(ws.lo ?? wLo, ws.hi ?? eloMax));
    ls.hi = Math.max(ls.lo ?? 1, Math.min(ls.hi ?? lHi, eloMax));

    anchorRatingToRange(ws);
    anchorRatingToRange(ls);
}

function anchorRatingToRange(stat) {
    if (!stat) return;
    const evidence = getEvidenceScore(stat);
    if (evidence >= 0.7) {
        // Confident: rating = midpoint of proven range
        stat.rating = Math.round(((stat.lo ?? 1) + (stat.hi ?? getEloMax())) / 2);
    }
    // Below 0.7: leave rating as pure Elo — it's still the best estimate we have
}

// Apply a draw in calibration: both books declared same level
function applyDrawBounds(idA, idB) {
    const sa = battleData.bookStats[idA];
    const sb = battleData.bookStats[idB];
    if (!sa || !sb) return;

    const eloMax = getEloMax();
    // Treat draw as if both have high evidence of being at the same level —
    // use a strong nudge toward each other's rating
    const center = Math.round((sa.rating + sb.rating) / 2);
    const band   = 400;
    sa.lo = Math.max(sa.lo ?? 1,      center - band);
    sa.hi = Math.min(sa.hi ?? eloMax, center + band);
    sb.lo = Math.max(sb.lo ?? 1,      center - band);
    sb.hi = Math.min(sb.hi ?? eloMax, center + band);
    sa.lo = Math.min(sa.lo, sa.hi);
    sb.lo = Math.min(sb.lo, sb.hi);

    // Small Elo nudge toward each other
    const expA = eloExpected(sa.rating, sb.rating);
    const K    = 32;
    sa.rating  = Math.max(1, Math.min(eloMax, Math.round(sa.rating + K * (0.5 - expA))));
    sb.rating  = Math.max(1, Math.min(eloMax, Math.round(sb.rating + K * (0.5 - (1 - expA)))));
    anchorRatingToRange(sa);
    anchorRatingToRange(sb);
    sa.interactions = (sa.interactions || 0) + 1;
    sb.interactions = (sb.interactions || 0) + 1;
}

// Keep these for tier tracking (used in pool sampling)
function recordTierEncountered(stat, opponentId) {
    if (!stat.tiersEncountered) stat.tiersEncountered = [];
    const tier = getEloTier(ensureBookStat(opponentId).rating);
    if (!stat.tiersEncountered.includes(tier)) stat.tiersEncountered.push(tier);
}

// ============================================================
//  TIER SYSTEM (0=bottom … 3=top, computed dynamically)
// ============================================================
function computeTierBoundaries(pool) {
    if (!pool || pool.length === 0) {
        const mid = getEloMidpoint();
        return [mid * 0.25, mid * 0.75, mid * 1.25];
    }
    const sorted = pool.map(b => {
        const s = battleData.bookStats[b.importOrder];
        return s ? s.rating : getEloStart();
    }).sort((a, b) => a - b);
    const q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
    return [q(0.25), q(0.5), q(0.75)];
}

function getEloTier(rating, boundaries) {
    const b = boundaries || computeTierBoundaries(getBattlePool());
    if (rating <= b[0]) return 0;
    if (rating <= b[1]) return 1;
    if (rating <= b[2]) return 2;
    return 3;
}

// ============================================================
//  MIGRATION
// ============================================================
function migrateBookStats() {
    const NEW_MAX = 3000;
    let changed = false;

    // ── Step 1: Detect & rescale from old dynamic scale ──────────────────
    const allStats = Object.values(battleData.bookStats).filter(Boolean);
    if (allStats.length > 0) {
        const maxRating = Math.max(...allStats.map(s => s.rating ?? 0).filter(r => r > 0));
        const needsRescale = maxRating > 0 && maxRating < 2400 && !battleData._scaleMigrated3k;

        if (needsRescale) {
            // Infer old max: treat observed max as ~80th percentile of old scale
            const oldMax = Math.max(500, Math.round(maxRating / 0.8));
            const scale  = NEW_MAX / oldMax;
            allStats.forEach(stat => {
                if (stat.rating !== undefined) stat.rating = Math.max(1, Math.min(NEW_MAX, Math.round(stat.rating * scale)));
                if (stat.lo     !== undefined) stat.lo     = Math.max(1, Math.min(NEW_MAX, Math.round(stat.lo * scale)));
                if (stat.hi     !== undefined) stat.hi     = Math.max(1, Math.min(NEW_MAX, Math.round(stat.hi * scale)));
                // After rescale ensure lo ≤ hi
                if (stat.lo !== undefined && stat.hi !== undefined) stat.lo = Math.min(stat.lo, stat.hi);
        // Reset any collapsed bounds (lo===hi) — artifact of previous broken logic.
        // Wide open is honest; calibration will narrow them deliberately.
        if (stat.lo !== undefined && stat.hi !== undefined && stat.hi - stat.lo < 50) {
            stat.lo = 1;
            stat.hi = NEW_MAX;
        }
            });
            battleData._scaleMigrated3k = true;
            // Clear old flag so we don't double-apply
            delete battleData._scaleMigrated;
            changed = true;
        } else if (!battleData._scaleMigrated3k) {
            battleData._scaleMigrated3k = true;
            changed = true;
        }
    }

    // ── Step 2: Field defaults ────────────────────────────────────────────
    allStats.forEach(stat => {
        if (!stat) return;
        if (stat.rating          === undefined) { stat.rating          = getEloStart(); changed = true; }
        if (stat.interactions    === undefined) { stat.interactions    = (stat.wins || 0) + (stat.losses || 0); changed = true; }
        if (stat.lastSeenSession === undefined) { stat.lastSeenSession = 0;      changed = true; }
        if (stat.decayWeight     === undefined) { stat.decayWeight     = 0;      changed = true; }
        if (stat.tiersEncountered=== undefined) { stat.tiersEncountered= [];     changed = true; }
        if (stat.lo              === undefined) {
            const n = stat.interactions || 0;
            if (n === 0) {
                stat.lo = 1; stat.hi = NEW_MAX;
            } else {
                const spread = Math.max(200, NEW_MAX * Math.max(0.1, 0.8 - n * 0.03));
                stat.lo = Math.max(1,        Math.round(stat.rating - spread / 2));
                stat.hi = Math.min(NEW_MAX,  Math.round(stat.rating + spread / 2));
            }
            changed = true;
        }
        // Clamp to new scale
        stat.rating = Math.max(1,  Math.min(NEW_MAX, stat.rating ?? getEloStart()));
        stat.lo     = Math.max(1,  Math.min(NEW_MAX, stat.lo ?? 1));
        stat.hi     = Math.max(1,  Math.min(NEW_MAX, stat.hi ?? NEW_MAX));
        stat.lo     = Math.min(stat.lo, stat.hi);
        // Reset any tight/collapsed bounds — these are artifacts of broken prior logic.
        // Only calibration should narrow bounds; anything < 500 wide is suspect.
        if (stat.hi - stat.lo < 500 && (stat.interactions ?? 0) < 20) {
            stat.lo = 1;
            stat.hi = NEW_MAX;
            changed = true;
        }
    });

    if (changed) saveBattleData();
}

function ensureBookStat(id) {
    const eloMax = getEloMax(); // always 3000
    if (!battleData.bookStats[id]) {
        battleData.bookStats[id] = {
            rating:           getEloStart(), // 750 — earn upward, not drift from midpoint
            lo:               1,
            hi:               eloMax,
            wins:             0,
            losses:           0,
            appearances:      0,
            sessionWins:      0,
            interactions:     0,
            lastSeenSession:  battleData.sessions.length,
            lastSeenAt:       0,
            decayWeight:      0,
            tiersEncountered: []
        };
    }
    const s = battleData.bookStats[id];
    if (s.rating          === undefined) s.rating          = getEloStart();
    if (s.lo              === undefined) { s.lo = 1; s.hi = eloMax; }
    if (s.hi              === undefined) s.hi              = eloMax;
    if (s.interactions    === undefined) s.interactions    = (s.wins || 0) + (s.losses || 0);
    if (s.lastSeenSession === undefined) s.lastSeenSession = 0;
    if (s.decayWeight     === undefined) s.decayWeight     = 0;
    if (s.tiersEncountered=== undefined) s.tiersEncountered= [];
    return s;
}

// ============================================================
//  CORE ELO
//
//  Uses standard logistic expected-value formula (chess Elo, divisor 400)
//  instead of linear ratio — this correctly handles all rating magnitudes
//  and ensures the winner always rates higher than the loser over time.
//
//  kScale     : external multiplier (pool mode, calibration, etc.)
//  poolCeiling: only dampens when session pool is genuinely low-tier
//               (pool average < 60% of global midpoint). Ignores ceiling
//               for strong sessions so top performers aren't throttled.
// ============================================================

// Standard logistic Elo expected value
function eloExpected(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// Provisional K: new books move faster but not explosively (2× / 1.5×, not 3× / 2×)
function provisionalMx(stat) {
    const n = stat.interactions;
    if (n <  5) return 2.0;
    if (n < 10) return 1.5;
    return 1.0;
}

// Top-vs-top: high-Elo duels are high-stakes
function topMatchupMx(ws, ls) {
    return (ws.rating > getEloMax() * 0.65 && ls.rating > getEloMax() * 0.65) ? 1.8 : 1.0;
}

function applyElo(winnerId, loserId, roundIndex, totalRounds, kScale = 1.0, poolCeiling = null, poolAvg = null) {
    const ws = ensureBookStat(winnerId);
    const ls = ensureBookStat(loserId);

    // Record tier exposure for evidence
    recordTierEncountered(ws, loserId);
    recordTierEncountered(ls, winnerId);

    const K           = 64;
    const roundWeight = totalRounds > 0 ? roundIndex / totalRounds : 1;
    const baseK       = K * (1 + roundWeight) * kScale;

    const winnerK = baseK * provisionalMx(ws) * topMatchupMx(ws, ls);
    const loserK  = baseK * provisionalMx(ls) * topMatchupMx(ws, ls);

    // Standard logistic expected value (correct Elo formula)
    const expected = eloExpected(ws.rating, ls.rating);

    const loserPlayed  = ls.wins + ls.losses;
    const loserWinRate = loserPlayed > 0 ? ls.wins / loserPlayed : 0.5;
    const chronicMx    = loserWinRate < 0.25 ? 1.5 : 1.0;

    let winnerGain = winnerK * (1 - expected);

    // Pool ceiling dampening — ONLY for genuinely low-tier sessions.
    // If the pool average is above 60% of midpoint, the session has real
    // competition and we must not throttle legitimate winners.
    const mid = getEloMidpoint();
    const isLowTierSession = poolAvg !== null && poolAvg < mid * 0.6;
    if (isLowTierSession && poolCeiling !== null && ws.rating > poolCeiling) {
        const overshoot = (ws.rating - poolCeiling) / Math.max(1, poolCeiling);
        const damp      = Math.max(0.3, 1 - overshoot * 1.0);
        winnerGain     *= damp;
    }

    ws.rating = Math.min(getEloMax(), Math.round(ws.rating + winnerGain));
    ls.rating = Math.max(1,           Math.round(ls.rating - loserK * (1 - expected) * chronicMx));

    ws.wins         += 1;
    ls.losses       += 1;
    ws.interactions += 1;
    ls.interactions += 1;

    // Nudge bounds based on duel outcome (scaled by opponent's evidence)
    // then anchor rating to range midpoint if evidence is strong enough
    nudgeBounds(winnerId, loserId);
}

// Saves immediately — used in classic mode per-round
function awardPoints(winnerId, loserId, roundIndex, totalRounds, poolCeiling = null, poolAvg = null) {
    applyElo(winnerId, loserId, roundIndex, totalRounds, 1.0, poolCeiling, poolAvg);
    saveBattleData();
}

// ============================================================
//  REJECT ELO (complex mode)
// ============================================================
function applyRejectElo(shelf, challenger, durationMs, roundIndex, totalRounds, poolCeiling = null, poolAvg = null) {
    const cs    = ensureBookStat(challenger);
    const kMx   = getSessionConfig().kMx;

    const ms      = Math.max(200, Math.min(3000, durationMs || 200));
    const timeMod = 1.0 - 0.7 * ((ms - 200) / 2800);

    const shelfRatings = shelf.map(id => ensureBookStat(id).rating);
    const shelfAvg     = shelfRatings.reduce((a, b) => a + b, 0) / shelfRatings.length;
    const shelfStrMod  = Math.max(0.3, Math.min(1.0, shelfAvg / getEloMax()));

    const isBorderline = cs.rating > shelfAvg;
    const opponents    = isBorderline
        ? shelf.slice(0, Math.ceil(shelf.length / 2))
        : shelf;

    const kScale = timeMod * shelfStrMod * kMx;

    opponents.forEach(shelfId => {
        applyElo(shelfId, challenger, roundIndex, totalRounds, kScale, poolCeiling, poolAvg);
    });
}

// ============================================================
//  DECAY (weighted-session based)
//
//  Each session mode contributes a sessionWeight to each seen book's
//  decayWeight accumulator. When (currentTotalWeight - book.decayWeight)
//  exceeds 3.0 (≈ 3 Standard sessions), and the book hasn't been seen
//  in 24h, nudge rating 1.5% × missedWeight toward midpoint.
// ============================================================
function getTotalDecayWeight() {
    return battleData.sessions.reduce((sum, s) => {
        const cfg = SESSION_CONFIGS[s.poolMode] || SESSION_CONFIGS.standard;
        return sum + cfg.sessionWeight;
    }, 0);
}

function applyDecay() {
    const mid          = getEloMidpoint();
    const totalWeight  = getTotalDecayWeight();
    const now          = Date.now();
    const oneDayMs     = 86400000;
    let changed        = false;

    Object.values(battleData.bookStats).forEach(stat => {
        if (!stat) return;
        const missedWeight = totalWeight - (stat.decayWeight || 0);
        if (missedWeight < 3.0) return;
        if (stat.lastSeenAt && (now - stat.lastSeenAt) < oneDayMs) return;
        const effectiveMissed = Math.min(missedWeight, 10);
        const decayRate  = 1 - (0.015 * effectiveMissed);
        stat.rating = Math.round(mid + (stat.rating - mid) * decayRate);
        stat.rating = Math.max(1, Math.min(getEloMax(), stat.rating));
        changed = true;
    });

    if (changed) saveBattleData();
}

function markSeen(id) {
    const stat           = ensureBookStat(id);
    const totalWeight    = getTotalDecayWeight();
    stat.lastSeenSession = battleData.sessions.length;
    stat.lastSeenAt      = Date.now();
    stat.decayWeight     = totalWeight; // "caught up" to current weight
}

// ============================================================
//  TIER-AWARE POOL SAMPLING
//
//  focus: -2=bottom-heavy, -1=lower-mid, 0=balanced, 1=upper-mid, 2=top-heavy
//         "random" = pure random (no tier logic)
//
//  Always includes unranked ("fresh") books proportionally.
//  Minimum 1 book from each tier to ensure cross-tier Elo movement.
// ============================================================
function samplePool(allBooks, targetSize, focus, boundaries) {
    if (focus === "random" || allBooks.length <= targetSize) {
        return allBooks.slice().sort(() => Math.random() - 0.5).slice(0, targetSize);
    }

    // Bucket by tier
    const tiers = [[], [], [], [], []]; // 0-3 = tiers, 4 = fresh (no stat)
    allBooks.forEach(b => {
        const stat = battleData.bookStats[b.importOrder];
        if (!stat || stat.interactions === 0) {
            tiers[4].push(b);
        } else {
            tiers[getEloTier(stat.rating, boundaries)].push(b);
        }
    });

    // Base allocation weights per tier [bottom, lower-mid, upper-mid, top]
    // focus shifts weight toward one end
    const focusNum = Number(focus) || 0;
    const baseWeights = [1, 1, 1, 1];
    if (focusNum < 0) {
        baseWeights[0] += Math.abs(focusNum) * 1.5;
        baseWeights[1] += Math.abs(focusNum) * 0.5;
    } else if (focusNum > 0) {
        baseWeights[3] += focusNum * 1.5;
        baseWeights[2] += focusNum * 0.5;
    }

    // Fresh books always get ~15% of slots
    const freshCount = Math.min(tiers[4].length, Math.max(1, Math.round(targetSize * 0.15)));
    const remaining  = targetSize - freshCount;
    const totalWeight = baseWeights.reduce((a, b) => a + b, 0);

    // Allocate with minimum 1 per non-empty tier
    const alloc = baseWeights.map((w, i) =>
        tiers[i].length > 0 ? Math.max(1, Math.round((w / totalWeight) * remaining)) : 0
    );

    // Trim/expand to hit remaining exactly
    let allocated = alloc.reduce((a, b) => a + b, 0);
    while (allocated > remaining) {
        // Remove from the most over-represented tier
        const idx = alloc.map((a, i) => ({ i, ratio: tiers[i].length > 0 ? a / tiers[i].length : 999 }))
                         .sort((a, b) => b.ratio - a.ratio)[0].i;
        if (alloc[idx] > 1) { alloc[idx]--; allocated--; } else break;
    }
    while (allocated < remaining) {
        const idx = alloc.map((a, i) => ({ i, ratio: tiers[i].length > 0 ? (tiers[i].length - a) / tiers[i].length : -1 }))
                         .sort((a, b) => b.ratio - a.ratio)[0].i;
        if (alloc[idx] < tiers[idx].length) { alloc[idx]++; allocated++; } else break;
    }

    const result = [];
    // Pick fresh books
    result.push(...tiers[4].sort(() => Math.random() - 0.5).slice(0, freshCount));
    // Pick from each tier
    alloc.forEach((n, i) => {
        result.push(...tiers[i].sort(() => Math.random() - 0.5).slice(0, n));
    });

    return result.sort(() => Math.random() - 0.5);
}

// Compute the session pool ceiling (90th percentile of pool Elo at start)
function computePoolCeiling(poolIds) {
    const ratings = poolIds.map(id => {
        const s = battleData.bookStats[id];
        return s ? s.rating : getEloStart();
    }).sort((a, b) => a - b);
    if (ratings.length === 0) return getEloMax();
    const idx = Math.floor(0.90 * (ratings.length - 1));
    return ratings[idx];
}

// ============================================================
//  EVIDENCE SPREAD ENFORCEMENT
//  After session ends, gently push winners up and losers down
//  to prevent rating clumping near midpoint.
// ============================================================
function enforceSpread(participantIds, poolCeiling) {
    const mid    = getEloMidpoint();
    const eloMax = getEloMax();
    let changed  = false;

    // Count how many participants are within 10% of midpoint
    const clumpThreshold = eloMax * 0.10;
    const clumped = participantIds.filter(id => {
        const s = battleData.bookStats[id];
        return s && Math.abs(s.rating - mid) < clumpThreshold;
    });
    if (clumped.length / participantIds.length < 0.4) return; // spread is fine

    participantIds.forEach(id => {
        const s = battleData.bookStats[id];
        if (!s) return;
        const dist = s.rating - mid;
        if (Math.abs(dist) < clumpThreshold) {
            // Nudge away from midpoint based on win rate
            const played   = s.wins + s.losses;
            const winRate  = played > 0 ? s.wins / played : 0.5;
            const nudge    = Math.round((winRate - 0.5) * eloMax * 0.04);
            s.rating = Math.max(1, Math.min(eloMax, s.rating + nudge));
            changed = true;
        }
    });
    if (changed) saveBattleData();
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
//  SESSION START — shared entry point
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

    applyDecay();

    const boundaries  = computeTierBoundaries(allBooks);
    const targetSize  = Math.min(allBooks.length, cfg.size);
    const sampled     = samplePool(allBooks, targetSize, battleFocus, boundaries);
    const sampledIds  = sampled.map(b => b.importOrder);
    const poolCeiling = computePoolCeiling(sampledIds);
    const poolAvg     = sampledIds.reduce((sum, id) => {
        const s = battleData.bookStats[id];
        return sum + (s ? s.rating : getEloMidpoint());
    }, 0) / Math.max(1, sampledIds.length);

    sampled.forEach(b => {
        ensureBookStat(b.importOrder).appearances++;
        markSeen(b.importOrder);
    });
    saveBattleData();

    if (slots > 0) {
        beginComplexSetup(sampled, slots, poolCeiling, poolAvg);
        return;
    }

    battleSession = {
        mode:         "classic",
        pool:         sampled.map(b => b.importOrder),
        poolMode:     battlePoolMode,
        poolCeiling,
        poolAvg,
        roundIndex:   0,
        startedAt:    Date.now(),
        rounds:       []
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
    const kMx      = getSessionConfig().kMx;

    battleSession.roundIndex++;
    const totalRounds = battleSession.pool.length + battleSession.rounds.length - 1;
    battleSession.rounds.push({ winner: winnerId, loser: loserId, roundIndex: battleSession.roundIndex, durationMs: duration });
    markSeen(winnerId); markSeen(loserId);
    applyElo(winnerId, loserId, battleSession.roundIndex, totalRounds, kMx, battleSession.poolCeiling, battleSession.poolAvg);
    saveBattleData();
    battleSession.pool = battleSession.pool.filter(id => id !== loserId);

    if (battleSession.pool.length === 1) finishSession();
    else { duelStartTime = Date.now(); renderBattlePlay(); }
}

function finishSession() {
    const winnerId = battleSession.pool[0];
    ensureBookStat(winnerId).sessionWins++;
    enforceSpread(battleSession.rounds.flatMap(r => [r.winner, r.loser]).filter(Boolean), battleSession.poolCeiling);
    const sessionRecord = {
        date: Date.now(), poolSize: battleSession.rounds.length + 1,
        winner: winnerId, mode: "classic",
        poolMode: battleSession.poolMode,
        rounds: battleSession.rounds.slice()
    };
    battleData.sessions.push(sessionRecord);
    saveBattleData();
    renderBattleWinner(winnerId, sessionRecord);
    battleSession = null;
}

function abandonSession() {
    if (!confirm("Abandon this session? Elo changes made so far remain.")) return;
    battleSession = null;
    duelStartTime = null;
    renderBattlePlay();
}

// ============================================================
//  COMPLEX: SETUP PHASE
// ============================================================
function beginComplexSetup(sampled, slots, poolCeiling, poolAvg) {
    battleSession = {
        mode:         "complex-setup",
        slots,
        poolMode:     battlePoolMode,
        poolCeiling,
        poolAvg,
        shelf:        sampled.slice(0, slots).map(b => b.importOrder),
        queue:        sampled.slice(slots).map(b => b.importOrder),
        totalBooks:   sampled.length,
        startedAt:    Date.now()
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
    const { shelf, queue, slots, totalBooks, poolCeiling, poolAvg } = battleSession;
    const totalRounds = totalBooks - 1;
    const kMx = getSessionConfig().kMx;

    for (let i = 0; i < shelf.length - 1; i++) {
        markSeen(shelf[i]); markSeen(shelf[i + 1]);
        applyElo(shelf[i], shelf[i + 1], i + 1, totalRounds, kMx, poolCeiling, poolAvg);
    }
    saveBattleData();

    battleSession = {
        mode: "complex", slots,
        poolMode: battleSession.poolMode,
        poolCeiling,
        poolAvg,
        shelf: [...shelf], queue: [...queue],
        roundIndex: shelf.length - 1,
        startedAt: Date.now(), rounds: [], totalBooks
    };
    duelStartTime = Date.now();
    renderBattlePlay();
}

// ============================================================
//  COMPLEX: PLAY PHASE
// ============================================================
function complexChoose(slotIndex) {
    if (!battleSession || battleSession.mode !== "complex") return;

    const now         = Date.now();
    const duration    = duelStartTime ? now - duelStartTime : null;
    const challenger  = battleSession.queue[0];
    const shelf       = battleSession.shelf;
    const slots       = battleSession.slots;
    const totalRounds = battleSession.totalBooks - 1;
    const kMx         = getSessionConfig().kMx;
    const ceiling     = battleSession.poolCeiling;
    const poolAvg     = battleSession.poolAvg;

    battleSession.roundIndex++;

    if (slotIndex === -1) {
        markSeen(challenger);
        applyRejectElo(shelf, challenger, duration, battleSession.roundIndex, totalRounds, ceiling, poolAvg);
        battleSession.rounds.push({
            action: "reject", challenger, shelfSnapshot: [...shelf],
            durationMs: duration, roundIndex: battleSession.roundIndex
        });
    } else {
        for (let i = slotIndex; i < shelf.length; i++) {
            markSeen(challenger); markSeen(shelf[i]);
            applyElo(challenger, shelf[i], battleSession.roundIndex, totalRounds, kMx, ceiling, poolAvg);
        }
        for (let i = 0; i < slotIndex; i++) {
            markSeen(shelf[i]); markSeen(challenger);
            applyElo(shelf[i], challenger, battleSession.roundIndex, totalRounds, kMx, ceiling, poolAvg);
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
    const shelf       = battleSession.shelf;
    const winnerId    = shelf[0];
    const totalRounds = battleSession.totalBooks - 1;
    const kMx         = getSessionConfig().kMx;
    const ceiling     = battleSession.poolCeiling;
    const poolAvg     = battleSession.poolAvg;

    for (let i = 0; i < shelf.length - 1; i++) {
        applyElo(shelf[i], shelf[i + 1], totalRounds, totalRounds, kMx, ceiling, poolAvg);
    }

    battleSession.rounds
        .filter(r => r.action === "reject")
        .forEach(r => applyRejectElo(
            r.shelfSnapshot || shelf, r.challenger, r.durationMs,
            totalRounds, totalRounds, ceiling, poolAvg
        ));

    ensureBookStat(winnerId).sessionWins++;
    const allParticipants = [
        ...shelf,
        ...battleSession.rounds.map(r => r.challenger || r.loser).filter(Boolean)
    ];
    enforceSpread([...new Set(allParticipants)], ceiling);
    saveBattleData();

    const sessionRecord = {
        date: Date.now(), poolSize: battleSession.totalBooks,
        winner: winnerId, shelf: [...shelf],
        mode: "complex", slots: battleSession.slots,
        poolMode: battleSession.poolMode,
        rounds: battleSession.rounds.slice()
    };
    battleData.sessions.push(sessionRecord);
    saveBattleData();
    renderComplexWinner(sessionRecord);
    battleSession = null;
}

// ============================================================
//  QUICK CALIBRATION MODE
//
//  Rapid-fire "would you rather" where every pair is chosen to
//  maximise information gain for both books simultaneously.
//
//  Pair scoring:
//    overlap    = max(0, min(A.hi,B.hi) - max(A.lo,B.lo))
//    avgSpread  = (A.hi-A.lo + B.hi-B.lo) / 2
//    ratingGap  = |A.rating - B.rating|
//    score      = overlap × avgSpread / (1 + ratingGap)
//
//  After each duel bounds update for both books:
//    winner.lo = max(winner.lo, loser.lo)    — winner is above loser's floor
//    loser.hi  = min(loser.hi,  winner.rating) — loser is below winner
//
//  Real Elo (1.5× K) also applied — duels count for rankings.
//  Recently-duelled pairs are cooled down for QCALIB_COOLDOWN rounds
//  to prevent the same pair reappearing immediately.
//  Non-transitivity (A>B>C>A) is handled naturally by bounds + logistic Elo.
// ============================================================

const QCALIB_K_MX      = 1.2;
const QCALIB_COOLDOWN  = 12;   // rounds before a pair can repeat — long enough to see many other pairs
const QCALIB_MAX_ELO_CHANGE = 200; // max total Elo a book can gain/lose in one quick-calib session

function scoreQCalibPair(idA, idB) {
    const sa = ensureBookStat(idA);
    const sb = ensureBookStat(idB);
    const loA = sa.lo ?? 1, hiA = sa.hi ?? getEloMax();
    const loB = sb.lo ?? 1, hiB = sb.hi ?? getEloMax();
    const overlap   = Math.max(0, Math.min(hiA, hiB) - Math.max(loA, loB));
    const avgSpread = ((hiA - loA) + (hiB - loB)) / 2;
    const ratingGap = Math.abs(sa.rating - sb.rating);
    return (overlap * avgSpread) / (1 + ratingGap);
}

function pickQCalibPair(pool, recentPairs) {
    // Build candidate pairs sorted by score descending
    // Only consider books with at least some overlap potential (hi > 1)
    const eligible = pool.filter(b => {
        const s = battleData.bookStats[b.importOrder];
        return !s || (s.hi ?? getEloMax()) > (s.lo ?? 1) + 50; // has meaningful spread
    });
    if (eligible.length < 2) return pool.length >= 2 ? [pool[0].importOrder, pool[1].importOrder] : null;

    let bestScore = -1, bestA = null, bestB = null;
    // Sample top candidates to avoid O(n²) on large libraries
    // Sort by spread descending, check top 30
    const candidates = eligible
        .map(b => {
            const s = battleData.bookStats[b.importOrder];
            return { b, spread: (s ? (s.hi ?? getEloMax()) - (s.lo ?? 1) : getEloMax()) };
        })
        .sort((a, b) => b.spread - a.spread)
        .slice(0, 30)
        .map(x => x.b);

    for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
            const idA = candidates[i].importOrder;
            const idB = candidates[j].importOrder;
            const pairKey = [idA, idB].sort().join(",");
            if (recentPairs.has(pairKey)) continue; // cooled down
            const score = scoreQCalibPair(idA, idB);
            if (score > bestScore) {
                bestScore = score;
                bestA = idA; bestB = idB;
            }
        }
    }
    if (!bestA) {
        // All top pairs on cooldown — just pick highest-spread uncooled pair
        for (let i = 0; i < eligible.length && !bestA; i++) {
            for (let j = i + 1; j < eligible.length && !bestA; j++) {
                const pairKey = [eligible[i].importOrder, eligible[j].importOrder].sort().join(",");
                if (!recentPairs.has(pairKey)) {
                    bestA = eligible[i].importOrder;
                    bestB = eligible[j].importOrder;
                }
            }
        }
    }
    return bestA ? [bestA, bestB] : null;
}

function startQuickCalib() {
    const pool = getBattlePool();
    if (pool.length < 2) { alert("Need at least 2 eligible books."); return; }
    applyDecay();
    pool.forEach(b => markSeen(b.importOrder));
    saveBattleData();

    // Record each book's starting rating so we can cap total movement
    const startRatings = {};
    pool.forEach(b => {
        const s = battleData.bookStats[b.importOrder];
        startRatings[b.importOrder] = s ? s.rating : getEloMidpoint();
    });

    const firstPair = pickQCalibPair(pool, new Set());
    if (!firstPair) { alert("Not enough pairs to calibrate."); return; }

    battleSession = {
        mode:         "quick-calib",
        pool:         pool.map(b => b.importOrder),
        currentPair:  firstPair,
        roundsDone:   0,
        recentPairs:  new Map(),   // pairKey → roundDone (for cooldown)
        startRatings,             // cap Elo movement per book
        results:      [],
        startedAt:    Date.now()
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

    markSeen(winnerId); markSeen(loserId);

    // Apply Elo but cap total movement per book for this session
    const wStatBefore = ensureBookStat(winnerId).rating;
    const lStatBefore = ensureBookStat(loserId).rating;
    applyElo(winnerId, loserId, 1, 1, QCALIB_K_MX);

    // Enforce per-session Elo cap — prevent a book from being nuked by repeat matchups
    const wStat = ensureBookStat(winnerId);
    const lStat = ensureBookStat(loserId);
    const wStart = sess.startRatings[winnerId] ?? wStatBefore;
    const lStart = sess.startRatings[loserId]  ?? lStatBefore;
    if (wStat.rating - wStart >  QCALIB_MAX_ELO_CHANGE) wStat.rating = wStart + QCALIB_MAX_ELO_CHANGE;
    if (lStart - lStat.rating >  QCALIB_MAX_ELO_CHANGE) lStat.rating = lStart - QCALIB_MAX_ELO_CHANGE;

    saveBattleData();

    sess.results.push({
        winner: winnerId, loser: loserId,
        winnerRatingAfter: wStat.rating, loserRatingAfter: lStat.rating,
        durationMs: duration
    });

    sess.roundsDone++;

    // Add pair to cooldown — expires after QCALIB_COOLDOWN more rounds
    const pairKey = [idA, idB].sort().join(",");
    sess.recentPairs.set(pairKey, sess.roundsDone);
    // Expire cooldowns that are old enough
    for (const [k, setAt] of sess.recentPairs) {
        if (sess.roundsDone - setAt >= QCALIB_COOLDOWN) sess.recentPairs.delete(k);
    }

    // Pick next pair — pass cooled set so picker avoids them
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
    const sess = battleSession;
    const [idA, idB] = sess.currentPair;

    markSeen(idA); markSeen(idB);
    applyDrawBounds(idA, idB);

    // Clamp draw Elo movement to session cap too
    const sA = ensureBookStat(idA), sB = ensureBookStat(idB);
    const startA = sess.startRatings[idA] ?? sA.rating;
    const startB = sess.startRatings[idB] ?? sB.rating;
    sA.rating = Math.max(startA - QCALIB_MAX_ELO_CHANGE, Math.min(startA + QCALIB_MAX_ELO_CHANGE, sA.rating));
    sB.rating = Math.max(startB - QCALIB_MAX_ELO_CHANGE, Math.min(startB + QCALIB_MAX_ELO_CHANGE, sB.rating));

    saveBattleData();

    sess.results.push({ winner: null, loser: null, draw: true, idA, idB });
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
    const sess = battleSession;
    const el   = document.getElementById("battlePlayView");
    if (!el) return;

    const totalRounds = sess ? sess.roundsDone : 0;
    const totalMs     = sess ? sess.results.reduce((s, r) => s + (r.durationMs || 0), 0) : 0;
    const avgMs       = totalRounds > 0 ? Math.round(totalMs / totalRounds) : 0;

    const narrowed = sess ? new Set([
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

//  Each probe picks the opponent whose rating is closest to
//  (lo+hi)/2, halving the range on each outcome.
//  usedOpponents prevents the same duel appearing twice.
// ============================================================
const CALIB_PROBES_PER_BOOK = 6;
const CALIB_K_MX = 1.5;

function buildCalibQueue() {
    const pool = getBattlePool();
    return pool
        .map(b => {
            const stat = battleData.bookStats[b.importOrder];
            return { b, evidence: stat ? getEvidenceScore(stat) : 0 };
        })
        .sort((a, b) => a.evidence - b.evidence)
        .map(x => x.b.importOrder);
}

function startCalibTarget(targetId, remainingQueue) {
    const stat   = ensureBookStat(targetId);
    const eloMax = getEloMax();
    // Use the book's actual uncertainty range as the bisection range
    const lo = stat.lo ?? 1;
    const hi = stat.hi ?? eloMax;

    return {
        mode:          "calibration",
        targetId,
        lo, hi,
        probesDone:    0,
        probesMax:     CALIB_PROBES_PER_BOOK,
        results:       [],
        usedOpponents: new Set(),   // prevent duplicate duels
        remainingQueue,
        startedAt:     Date.now()
    };
}

function pickCalibOpponent(lo, hi, targetId, usedOpponents) {
    const mid  = Math.round((lo + hi) / 2);
    const pool = getBattlePool().filter(b =>
        b.importOrder !== targetId &&
        !(usedOpponents && usedOpponents.has(b.importOrder))
    );
    if (pool.length === 0) return null;
    return pool
        .map(b => {
            const s = battleData.bookStats[b.importOrder];
            const r = s ? s.rating : getEloMidpoint();
            return { b, dist: Math.abs(r - mid) };
        })
        .sort((a, b) => a.dist - b.dist)[0].b;
}

function startCalibration() {
    applyDecay();
    const queue = buildCalibQueue();
    if (queue.length === 0) { alert("No eligible books to calibrate!"); return; }
    battleSession = startCalibTarget(queue[0], queue.slice(1));
    duelStartTime = Date.now();
    switchBattleView("play");
    renderBattlePlay();
}

// Launch calibration for one specific book, skipping the queue
function startCalibSingle(importOrder) {
    if (battleSession) {
        if (!confirm("This will interrupt your current session. Continue?")) return;
    }
    applyDecay();
    // Build remaining queue from low-evidence books, excluding the target
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

    // Resolve the current opponent from the rendered pair
    const opponent = pickCalibOpponent(sess.lo, sess.hi, targetId, sess.usedOpponents);
    if (!opponent) { calibNextBook(); return; }
    const opponentId = opponent.importOrder;

    sess.usedOpponents.add(opponentId);

    const actualWinner = winnerId;
    const actualLoser  = actualWinner === targetId ? opponentId : targetId;
    const targetWon    = actualWinner === targetId;

    const oppStat = ensureBookStat(opponentId);
    sess.results.push({
        opponentId,
        opponentRating: oppStat.rating,
        targetWon,
        durationMs: duration,
        lo: sess.lo, hi: sess.hi
    });

    // Apply Elo
    markSeen(targetId); markSeen(opponentId);
    applyElo(actualWinner, actualLoser, sess.probesDone + 1, CALIB_PROBES_PER_BOOK, CALIB_K_MX);
    saveBattleData();

    // Narrow the bisection range using the opponent's rating as the pivot
    const pivot = oppStat.rating;
    if (targetWon) {
        sess.lo = Math.max(sess.lo, pivot);  // target is above pivot
    } else {
        sess.hi = Math.min(sess.hi, pivot);  // target is below pivot
    }
    // Also write the narrowed range back to the stat so it persists
    const tStat = ensureBookStat(targetId);
    tStat.lo = Math.max(tStat.lo ?? 1, sess.lo);
    tStat.hi = Math.min(tStat.hi ?? getEloMax(), sess.hi);
    tStat.lo = Math.min(tStat.lo, tStat.hi); // safety clamp
    anchorRatingToRange(tStat);
    saveBattleData();

    sess.probesDone++;

    // No auto-finish on probe count — user decides when done via "Next book" or "Stop".
    // Only auto-advance if no usable opponents remain for this book.
    const nextOpponent = pickCalibOpponent(sess.lo, sess.hi, targetId, sess.usedOpponents);
    if (!nextOpponent) {
        calibNextBook();
    } else {
        duelStartTime = Date.now();
        renderBattlePlay();
    }
}

function calibDraw() {
    if (!battleSession || battleSession.mode !== "calibration") return;
    const sess     = battleSession;
    const targetId = sess.targetId;
    const opponent = pickCalibOpponent(sess.lo, sess.hi, targetId, sess.usedOpponents);
    if (!opponent) { calibNextBook(); return; }
    const opponentId = opponent.importOrder;

    sess.usedOpponents.add(opponentId);
    markSeen(targetId); markSeen(opponentId);

    applyDrawBounds(targetId, opponentId);

    // For bisection: draw means target sits at opponent's rating — narrow both sides
    const pivot = ensureBookStat(opponentId).rating;
    const margin = Math.round((sess.hi - sess.lo) * 0.2); // keep small band around pivot
    sess.lo = Math.max(sess.lo, pivot - margin);
    sess.hi = Math.min(sess.hi, pivot + margin);

    // Write back
    const tStat = ensureBookStat(targetId);
    tStat.lo = Math.max(tStat.lo ?? 1, sess.lo);
    tStat.hi = Math.min(tStat.hi ?? getEloMax(), sess.hi);
    tStat.lo = Math.min(tStat.lo, tStat.hi);
    saveBattleData();

    sess.results.push({ opponentId, opponentRating: pivot, targetWon: null, draw: true, lo: sess.lo, hi: sess.hi });
    sess.probesDone++;

    // Same as calibChoose — never auto-finish, only move on if no opponents left
    const nextOpponent = pickCalibOpponent(sess.lo, sess.hi, targetId, sess.usedOpponents);
    if (!nextOpponent) {
        calibNextBook();
    } else {
        duelStartTime = Date.now();
        renderBattlePlay();
    }
}

function calibNextBook() {
    const queue = battleSession?.remainingQueue || [];
    if (queue.length === 0) {
        // No more books — show final summary
        renderCalibResult();
        return;
    }
    // Auto-advance to next book without showing a result screen
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
        if (e.key === "n" || e.key === "N") { e.preventDefault(); calibNextBook(); }
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
        cards[idx].style.borderColor = "#5cb85c"; cards[idx].style.background = "#1e2a1e";
        setTimeout(() => { if (cards[idx]) { cards[idx].style.borderColor = ""; cards[idx].style.background = ""; } }, 120);
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
        el.style.borderColor = "#5cb85c"; el.style.background = "#1e2a1e";
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
            const aPlayed = (a.stat.interactions || 0) > 0;
            const bPlayed = (b.stat.interactions || 0) > 0;
            // Unplayed books always sink below played books
            if (aPlayed !== bPlayed) return aPlayed ? -1 : 1;
            // Both played or both unplayed: sort by point-estimate rating
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

    // Ensure export div exists (may not be in older index.html versions)
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
//  PLAY VIEW — LOBBY + ACTIVE SESSIONS
// ============================================================
function renderBattlePlay() {
    const el = document.getElementById("battlePlayView");
    if (!el) return;

    if (battleSession?.mode === "complex-setup")  { renderComplexSetup(el);  return; }
    if (battleSession?.mode === "complex")         { renderComplexPlay(el);   return; }
    if (battleSession?.mode === "calibration")     { renderCalibPlay(el);     return; }
    if (battleSession?.mode === "quick-calib")     { renderQuickCalibPlay(el); return; }

    if (!battleSession) { renderLobby(el); return; }

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

    // Key hints
    let keyHint = "";
    if (slots === 0)      keyHint = "Keys: ← → or 1 2";
    else if (slots === 2) keyHint = "Keys: ← → or 1 2 · Space/↓ = reject";
    else if (slots === 3) keyHint = "Keys: ← ↑ → or 1 2 3 · Space/↓ = reject";
    else                  keyHint = `Keys: 1–${slots <= 9 ? slots : "9, 0=10"} · Space = reject`;

    // Focus label
    const focusLabels = { "-2": "Bottom-heavy", "-1": "Lower-mid focus", "0": "Balanced", "1": "Upper-mid focus", "2": "Top-heavy", "random": "Pure random" };

    // Evidence summary
    const allStats    = Object.values(battleData.bookStats).filter(Boolean);
    const lowEvidence = allStats.filter(s => getEvidenceScore(s) < 0.2).length;

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
                <button class="lobby-mode-btn lobby-mode-calib ${battleSession?.mode === 'calibration' ? 'active' : ''}"
                        onclick="startCalibration()">
                    <span class="lobby-mode-emoji">🔬</span>
                    <span class="lobby-mode-label">Calibrate</span>
                    <span class="lobby-mode-size">Low-evidence</span>
                </button>
                <button class="lobby-mode-btn lobby-mode-qcalib ${battleSession?.mode === 'quick-calib' ? 'active' : ''}"
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
                ${lowEvidence > 0 ? `<span style="color:#e67e22;">&nbsp;·&nbsp; ${lowEvidence} uncertain</span>` : ""}
            </div>

            ${battleData.sessions.length > 0 ? `
                <p style="color:#aaa;font-size:0.85em;margin-bottom:16px;">
                    Sessions: <strong>${battleData.sessions.length}</strong> &nbsp;|&nbsp;
                    Ranked: <strong>${Object.keys(battleData.bookStats).length}</strong>
                </p>` : ""}

            <button class="battle-start-btn" onclick="startNewSession()">
                ${cfg.emoji} Start ${cfg.label} Session
            </button>

            ${pool.length < Math.max(2, slots + 1) ? `<p class="battle-warn">⚠ Not enough books${blCount > 0 ? ' — check blacklist' : ''}.</p>` : ""}
            <p style="color:#555;font-size:0.8em;margin-top:10px;">${keyHint}</p>
        </div>`;
}

// ── Complex setup ──
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
                    ${i > 0        ? `<button onclick="shelfMoveUp(${i})"   class="setup-btn">▲</button>` : `<span class="setup-btn-placeholder"></span>`}
                    ${i < slots-1  ? `<button onclick="shelfMoveDown(${i})" class="setup-btn">▼</button>` : `<span class="setup-btn-placeholder"></span>`}
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

// ── Complex play ──
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
    else if (slots === 3) keyHint = "← or 1 = slot 1 &nbsp;·&nbsp; ↑ or 2 = slot 2 &nbsp;·&nbsp; → or 3 = slot 3 &nbsp;·&nbsp; Space/↓ = reject";
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

// ── Calibration play ──
function renderCalibPlay(el) {
    const sess     = battleSession;
    const targetId = sess.targetId;
    const target   = getBookById(targetId);
    if (!target) { calibNextBook(); return; }

    const opponent = pickCalibOpponent(sess.lo, sess.hi, targetId, sess.usedOpponents);
    if (!opponent) { calibNextBook(); return; }

    // Store current pair for keyboard handler
    sess._calibPair = [targetId, opponent.importOrder];

    const stat       = ensureBookStat(targetId);
    const evidence   = getEvidenceScore(stat);
    const evInfo     = evidenceLabel(evidence);
    const oppStat    = ensureBookStat(opponent.importOrder);
    const ranked     = getRankedBooks();
    const oppRank    = ranked.findIndex(e => e.id === opponent.importOrder) + 1;
    const targetRank = ranked.findIndex(e => e.id === targetId) + 1;

    const pct   = Math.round((sess.probesDone / sess.probesMax) * 100);
    const rangeSize = sess.hi - sess.lo;

    const tCover = target.coverUrl   ? `<img src="${target.coverUrl}"   class="battle-cover" alt="" onerror="this.style.display='none'">` : `<div class="battle-cover-placeholder">📖</div>`;
    const oCover = opponent.coverUrl ? `<img src="${opponent.coverUrl}" class="battle-cover" alt="" onerror="this.style.display='none'">` : `<div class="battle-cover-placeholder">📖</div>`;
    const tStars = target.rating   > 0 ? `<div class="battle-stars">${"★".repeat(target.rating)}${"☆".repeat(5-target.rating)}</div>` : "";
    const oStars = opponent.rating > 0 ? `<div class="battle-stars">${"★".repeat(opponent.rating)}${"☆".repeat(5-opponent.rating)}</div>` : "";

    const reasoning = `
        <div class="calib-reasoning">
            <div class="calib-reason-row">
                <span>📍 Calibrating:</span>
                <strong>${target.title}</strong>
                ${targetRank > 0 ? `<span style="color:#666;">currently #${targetRank}</span>` : ""}
            </div>
            <div class="calib-reason-row">
                <span>🎯 Plausible range:</span>
                <strong>${sess.lo.toLocaleString()} – ${sess.hi.toLocaleString()}</strong>
                <span style="color:#666;">(±${Math.round(rangeSize/2).toLocaleString()} · ${sess.probesDone} probe${sess.probesDone!==1?'s':''} done)</span>
            </div>
            <div class="calib-reason-row">
                <span>🔍 Why this opponent:</span>
                <span>Rated ${oppStat.rating.toLocaleString()} (rank ~#${oppRank||"?"}) — near the midpoint of the current range.
                Win → range becomes <em>${oppStat.rating.toLocaleString()}–${sess.hi.toLocaleString()}</em>.
                Loss → range becomes <em>${sess.lo.toLocaleString()}–${oppStat.rating.toLocaleString()}</em>.</span>
            </div>
            <div class="calib-reason-row">
                <span>📊 Evidence:</span>
                <span style="color:${evInfo.color}">${evInfo.label} (${Math.round(evidence*100)}%)</span>
            </div>
        </div>`;

    el.innerHTML = `
        <div class="battle-progress-bar-wrap">
            <div class="battle-progress-label">🔬 Calibrating: <em>${target.title}</em> &nbsp;·&nbsp; ${sess.remainingQueue.length} book${sess.remainingQueue.length!==1?'s':''} queued</div>
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
                <button class="calib-draw-btn" onclick="calibDraw()" title="About the same level [↓ or Space]">
                    ↕ Same level
                </button>
            </div>
            <div class="battle-card" onclick="calibChoose(${opponent.importOrder})">
                ${oCover}
                <div class="battle-card-info">
                    <div class="battle-card-title">${opponent.title}</div>
                    <div class="battle-card-author">${opponent.author||""}</div>
                    ${oStars}
                    <div style="font-size:0.75em;color:#777;margin-top:4px;">Rank ~#${oppRank||"?"}</div>
                </div>
            </div>
        </div>
        <p class="battle-hint">← → or 1 2 to pick &nbsp;·&nbsp; ↓ or Space = same level &nbsp;·&nbsp; N = next book</p>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:8px;">
            ${sess.remainingQueue.length > 0 ? `<button class="battle-abandon-btn" style="background:#1a2a1a;border-color:#3a5a3a;color:#8bc88b;" onclick="calibNextBook()">→ Next book</button>` : ''}
            <button class="battle-abandon-btn" onclick="calibStop()">✕ Stop</button>
        </div>`;
}

function renderCalibResult() {
    const el   = document.getElementById("battlePlayView");
    if (!el) return;
    const sess = battleSession;
    const stat = ensureBookStat(sess.targetId);
    const book = getBookById(sess.targetId);
    const ranked = getRankedBooks();
    const newRank = ranked.findIndex(e => e.id === sess.targetId) + 1;
    const evidence = getEvidenceScore(stat);
    const evInfo   = evidenceLabel(evidence);
    const cover    = book?.coverUrl ? `<img src="${book.coverUrl}" class="battle-winner-cover" style="width:80px;height:120px;" alt="" onerror="this.style.display='none'">` : `<div style="font-size:3em;">📖</div>`;

    let probeRows = "";
    sess.results.forEach((r, i) => {
        const opp = getBookById(r.opponentId);
        const resultColor = r.draw ? '#888' : (r.targetWon ? '#5cb85c' : '#c0392b');
        const resultText  = r.draw ? "Draw ≈" : (r.targetWon ? "Won ✓" : "Lost ✗");
        probeRows += `<tr>
            <td>${i+1}</td>
            <td>${opp ? opp.title : "?"}</td>
            <td style="color:${resultColor}">${resultText}</td>
            <td style="color:#888;">${r.lo.toLocaleString()}–${r.hi.toLocaleString()}</td>
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
                <div class="battle-summary-row"><span>New estimated rank</span><strong>#${newRank || "?"}</strong></div>
                <div class="battle-summary-row"><span>Duel rating</span><strong>${stat.rating.toLocaleString()} / ${getEloMax().toLocaleString()}</strong></div>
                <div class="battle-summary-row"><span>Evidence strength</span><strong style="color:${evInfo.color}">${evInfo.label} (${Math.round(evidence*100)}%)</strong></div>
                <div class="battle-summary-row"><span>Settled range</span><strong>${sess.lo.toLocaleString()} – ${sess.hi.toLocaleString()}</strong></div>
            </div>
            <div class="battle-stats-section" style="margin-top:16px;">
                <h3 style="font-size:0.9em;color:#aaa;">Probe history</h3>
                <table class="battle-stats-table">
                    <thead><tr><th>#</th><th>Opponent</th><th>Result</th><th>Range after</th></tr></thead>
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

function renderBookCard(book, id) {
    const cover = book.coverUrl ? `<img src="${book.coverUrl}" class="battle-cover" alt="" onerror="this.style.display='none'">` : `<div class="battle-cover-placeholder">📖</div>`;
    const stars = book.rating > 0 ? `<div class="battle-stars">${"★".repeat(book.rating)}${"☆".repeat(5-book.rating)}</div>` : "";
    return `<div class="battle-card" onclick="chooseSide(${id})">${cover}<div class="battle-card-info"><div class="battle-card-title">${book.title}</div><div class="battle-card-author">${book.author||""}</div>${stars}</div></div>`;
}

// ── Quick Calibration play ──
function renderQuickCalibPlay(el) {
    const sess    = battleSession;
    const [idA, idB] = sess.currentPair;
    const bookA   = getBookById(idA);
    const bookB   = getBookById(idB);
    if (!bookA || !bookB) { qcalibFinish(); return; }

    const sA = ensureBookStat(idA);
    const sB = ensureBookStat(idB);
    const eloMax = getEloMax();

    // Show range indicators on each card
    function cardHtml(book, id, stat) {
        const cover  = book.coverUrl ? `<img src="${book.coverUrl}" class="battle-cover" alt="" onerror="this.style.display='none'">` : `<div class="battle-cover-placeholder">📖</div>`;
        const stars  = book.rating > 0 ? `<div class="battle-stars">${"★".repeat(book.rating)}${"☆".repeat(5-book.rating)}</div>` : "";
        const lo     = stat.lo ?? 1;
        const hi     = stat.hi ?? eloMax;
        const ev     = getEvidenceScore(stat);
        const evInfo = evidenceLabel(ev);
        const loPct  = Math.round((lo / eloMax) * 100);
        const hiPct  = Math.round((hi / eloMax) * 100);
        const rPct   = Math.round((stat.rating / eloMax) * 100);
        const rangeBar = `
            <div class="qcalib-range-bar" title="${lo.toLocaleString()}–${hi.toLocaleString()}">
                <div class="range-bar-track" style="height:5px;">
                    <div class="range-bar-fill" style="left:${loPct}%;width:${hiPct-loPct}%"></div>
                    <div class="range-bar-point" style="left:${rPct}%"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.68em;color:#555;margin-top:2px;">
                    <span>${lo.toLocaleString()}</span>
                    <span style="color:${evInfo.color};font-size:0.9em;">${evInfo.label}</span>
                    <span>${hi.toLocaleString()}</span>
                </div>
            </div>`;
        return `
            <div class="battle-card qcalib-card" onclick="qcalibChoose(${id})">
                ${cover}
                <div class="battle-card-info">
                    <div class="battle-card-title">${book.title}</div>
                    <div class="battle-card-author">${book.author||""}</div>
                    ${stars}
                    ${rangeBar}
                </div>
            </div>`;
    }

    // Show what this duel will resolve
    const loAB = Math.max(sA.lo ?? 1,    sB.lo ?? 1);
    const hiAB = Math.min(sA.hi ?? eloMax, sB.hi ?? eloMax);
    const overlap = Math.max(0, hiAB - loAB);
    const infoLine = overlap > 50
        ? `Shared range: <strong>${loAB.toLocaleString()}–${hiAB.toLocaleString()}</strong> — this duel will resolve <strong>±${Math.round(overlap/2).toLocaleString()}</strong> for both`
        : `Comparing nearby books to sharpen their bounds`;

    el.innerHTML = `
        <div class="battle-progress-bar-wrap">
            <div class="battle-progress-label">⚡ Quick Calibration &nbsp;·&nbsp; ${sess.roundsDone} duels played &nbsp;·&nbsp; ← → or 1 2</div>
            <div class="battle-progress-track" style="background:#1a1a2a;">
                <div class="battle-progress-fill" style="width:100%;background:linear-gradient(90deg,#2a2a6a,#4a4aaa);opacity:0.4;"></div>
            </div>
        </div>
        <p class="qcalib-info-line">${infoLine}</p>
        <div class="battle-arena">
            ${cardHtml(bookA, idA, sA)}
            <div class="calib-vs-col">
                <div class="battle-vs">VS</div>
                <button class="calib-draw-btn" onclick="qcalibDraw()" title="About the same level [↓ or Space]">
                    ↕ Same level
                </button>
            </div>
            ${cardHtml(bookB, idB, sB)}
        </div>
        <p class="battle-hint">Tap a book or ← → / 1 2 · ↓ or Space = same level · Stop any time.</p>
        <button class="battle-abandon-btn" onclick="qcalibFinish()">✓ Stop &amp; save</button>`;
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
    const evidence = getEvidenceScore(stat);
    const evInfo   = evidenceLabel(evidence);

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
                <div class="battle-summary-row"><span>Duel rating</span><strong>${stat.rating||getEloMidpoint()} / ${getEloMax()}</strong></div>
                <div class="battle-summary-row"><span>Evidence</span><strong style="color:${evInfo.color}">${evInfo.label}</strong></div>
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
    const el     = document.getElementById("battlePlayView");
    if (!el) return;
    const shelf  = session.shelf;
    const podium = ["🥇","🥈","🥉"];
    const cfg    = SESSION_CONFIGS[session.poolMode] || SESSION_CONFIGS.standard;

    let podiumHtml = "";
    shelf.forEach((id, i) => {
        const b = getBookById(id);
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
    const eloMax  = getEloMax(), eloMid = getEloMidpoint();

    if (ranked.length === 0) {
        el.innerHTML = `<p style="color:#aaa;margin:40px;text-align:center;">No rankings yet — play a session first!</p>`;
        return;
    }

    // Split into ranked (have lo > 1 or some wins) and unranked (fully open range, no wins)
    const hasEvidence = limited.filter(e => e.stat.interactions > 0 || (e.stat.lo ?? 1) > 1);
    const noEvidence  = limited.filter(e => e.stat.interactions === 0 && (e.stat.lo ?? 1) <= 1);

    let html = `
        <h2 style="margin-bottom:4px;">📖 BookDuel Rankings</h2>
        <p style="color:#888;margin-bottom:16px;font-size:0.9em;">
            ${ranked.length} books ranked &nbsp;·&nbsp; Fixed scale 0–3000 &nbsp;·&nbsp; Sorted by rating
        </p>
        <div class="battle-rankings-table">
            <div class="battle-rank-header">
                <span class="rh-num">#</span>
                <span class="rh-book">Book</span>
                <span class="rh-rating">Rating</span>
                <span class="rh-range">Range</span>
                <span class="rh-win">W%</span>
                <span class="rh-ev">Evidence</span>
                <span class="rh-calib"></span>
            </div>`;

    function renderRow(entry, i) {
        const book = getBookById(entry.id);
        if (!book) return "";
        const s       = entry.stat;
        const played  = s.wins + s.losses;
        const winPct  = played > 0 ? Math.round((s.wins / played) * 100) : null;
        const cover   = book.coverUrl ? `<img src="${book.coverUrl}" class="battle-rank-thumb" alt="" onerror="this.style.display='none'">` : `<div class="battle-rank-thumb-placeholder">📖</div>`;
        const undefeated = s.losses === 0 && s.wins > 0 ? `<span class="battle-badge badge-undefeated">Undefeated</span>` : "";
        const lo      = s.lo ?? 1;
        const hi      = s.hi ?? eloMax;
        const spread  = hi - lo;
        const ratingPct = Math.round((s.rating / eloMax) * 100);
        const loPct     = Math.round((lo / eloMax) * 100);
        const hiPct     = Math.round((hi / eloMax) * 100);
        const evidence  = getEvidenceScore(s);
        const evInfo    = evidenceLabel(evidence);
        const evPct     = Math.round(evidence * 100);

        const rangeBar = `
            <div class="range-bar-wrap" title="Range: ${lo.toLocaleString()}–${hi.toLocaleString()}">
                <div class="range-bar-track">
                    <div class="range-bar-fill" style="left:${loPct}%;width:${hiPct-loPct}%"></div>
                    <div class="range-bar-point" style="left:${ratingPct}%"></div>
                </div>
                <div class="range-bar-labels">
                    <span>${lo.toLocaleString()}</span>
                    <span>${hi.toLocaleString()}</span>
                </div>
            </div>`;

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
            <span class="rh-range">${rangeBar}</span>
            <span class="rh-win">${winPct !== null ? winPct + "%" : "–"}</span>
            <span class="rh-ev">
                <div class="evidence-cell">
                    <div class="evidence-bar-track"><div class="evidence-bar-fill" style="width:${evPct}%;background:${evInfo.color}"></div></div>
                    <span class="evidence-label" style="color:${evInfo.color}">${evInfo.label}</span>
                </div>
            </span>
            <span class="rh-calib"><button class="rank-calib-btn" onclick="startCalibSingle(${entry.id})" title="Recalibrate">🔬</button></span>
        </div>`;
    }

    hasEvidence.forEach((entry, i) => { html += renderRow(entry, i); });

    if (noEvidence.length > 0) {
        html += `<div class="rank-unranked-divider">
            <span>⬇ ${noEvidence.length} unplayed book${noEvidence.length!==1?"s":""} — range fully open, sorted to bottom</span>
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
    const totalBooks = Object.keys(battleData.bookStats).length;
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
    const dominant = ranked.filter(e => e.stat.appearances >= 3)
        .map(e => ({ ...e, winRate: e.stat.wins / Math.max(1, e.stat.wins+e.stat.losses) }))
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

    // Mode breakdown
    const modeCounts = {};
    sessions.forEach(s => { const k = s.poolMode || (s.mode === "classic" ? "standard" : "complex"); modeCounts[k] = (modeCounts[k]||0) + 1; });

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
    const ratedRanked = ranked.filter(e => { const b = getBookById(e.id); return b && b.rating > 0; });
    if (ratedRanked.length >= 3) { const half = Math.ceil(ratedRanked.length/2); const topAvg = (ratedRanked.slice(0,half).reduce((s,e)=>s+getBookById(e.id).rating,0)/half).toFixed(1); html += highlightCard("⭐ Duel vs Stars", `Top avg: ${topAvg} ★`, `Your highest-duelled books average ${topAvg} stars`); }
    html += `</div></div>`;

    html += `<div class="battle-stats-section"><h3>📋 Session History</h3>
        <table class="battle-stats-table">
            <thead><tr><th>Date</th><th>Mode</th><th>Pool</th><th>Rounds</th><th>Champion / Shelf</th></tr></thead><tbody>`;
    sessions.slice().reverse().forEach(sess => {
        const w = getBookById(sess.winner);
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

// ============================================================
//  SMALL HELPERS
// ============================================================
function statCard(icon, label, value) {
    return `<div class="battle-stat-card"><div class="battle-stat-icon">${icon}</div><div class="battle-stat-value">${value}</div><div class="battle-stat-label">${label}</div></div>`;
}
function highlightCard(title, main, sub) {
    return `<div class="battle-highlight-card"><div class="battle-highlight-title">${title}</div><div class="battle-highlight-main">${main}</div><div class="battle-highlight-sub">${sub}</div></div>`;
}

function saveBattleRankingLimit(val) {
    battleRankingLimit = Math.max(1, Number(val) || DEFAULT_RANKING_LIMIT);
    localStorage.setItem(BATTLE_LIMIT_KEY, String(battleRankingLimit));
}
function saveBattleComplexSetting(val) { saveBattleComplexMode(val); }

// ============================================================
//  EXPORT / COPY VIEW
// ============================================================

const _exportPrefs = {
    includeRank:   true,
    includeTitle:  true,
    includeAuthor: true,
    includeRating: false,
    includeRange:  false,
    includeWinPct: false,
    limit:         0,
    onlyRanked:    true,
};

function renderBattleExport() {
    const el = document.getElementById("battleExportView");
    if (!el) return;

    const p = _exportPrefs;
    // getRankedBooks returns [{id, stat}] — resolve full book objects here
    const ranked = getRankedBooks().map(e => ({
        book: getBookById(e.id),
        stat: e.stat
    })).filter(e => e.book);

    const pool = p.onlyRanked
        ? ranked.filter(e => (e.stat.interactions || 0) > 0)
        : ranked;
    const limited = p.limit > 0 ? pool.slice(0, p.limit) : pool;

    const lines = limited.map(({ book: b, stat: s }, i) => {
        const parts = [];
        if (p.includeRank)   parts.push(`#${i + 1}`);
        if (p.includeTitle)  parts.push(b.title || "Untitled");
        if (p.includeAuthor && b.author) parts.push(`by ${b.author}`);
        if (p.includeRating && s) parts.push(`[${Math.round(s.rating)}]`);
        if (p.includeRange  && s) parts.push(`(${Math.round(s.lo || 0)}–${Math.round(s.hi || 3000)})`);
        if (p.includeWinPct && s) {
            const total = (s.wins || 0) + (s.losses || 0);
            const pct = total > 0 ? Math.round(s.wins / total * 100) : "—";
            parts.push(`${pct}% W`);
        }
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
                    ${chk("includeRank",   "# Rank")}
                    ${chk("includeTitle",  "Title")}
                    ${chk("includeAuthor", "Author")}
                    ${chk("includeRating", "Elo rating")}
                    ${chk("includeRange",  "Range (lo–hi)")}
                    ${chk("includeWinPct", "Win %")}
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
    const area = document.getElementById("exportPreviewArea");
    if (!area) return;
    const confirm = document.getElementById("exportCopyConfirm");
    const show = () => {
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

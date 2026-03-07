// ============================================================
//  BookDuel – "Would You Rather" ranking game
//  File: js/battle.js
// ============================================================

const BATTLE_KEY            = "reading_battle_data";
const BATTLE_LIMIT_KEY      = "reading_battle_ranking_limit";
const BATTLE_COMPLEX_KEY    = "reading_battle_complex";   // "off"|"2"-"10"
const DEFAULT_RANKING_LIMIT = 20;

// ---------- persistent state ----------
let battleData         = null;
let battleRankingLimit = DEFAULT_RANKING_LIMIT;
let battleComplexMode  = "off";   // "off" | "2".."10"

// ---------- live session (in-memory only, survives tab switches) ----------
let battleSession  = null;
let duelStartTime  = null;

// ---------- sub-view ----------
let battleView = "play";

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
    battleComplexMode  = localStorage.getItem(BATTLE_COMPLEX_KEY) || "off";
    migrateBookStats();
}

function saveBattleData() {
    localStorage.setItem(BATTLE_KEY, JSON.stringify(battleData));
}

function saveBattleComplexMode(val) {
    battleComplexMode = val;
    localStorage.setItem(BATTLE_COMPLEX_KEY, val);
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
//  SCORING  (Elo-style live rating)
//
//  Scale: 0 to 10 x totalEligible. Midpoint = 5 x totalEligible.
//  K = 64. roundWeight = roundIndex / totalRounds (finals ~2x).
//  lossMultiplier = 1.5 if loser win rate < 25% (chronic losers sink faster).
//  applyElo() does NOT save — callers batch-save for efficiency.
// ============================================================
function getEloMidpoint() {
    const total = books.filter(b =>
        b.exclusiveShelf === "read" || b.exclusiveShelf === "currently-reading"
    ).length;
    return Math.max(50, 5 * total);
}

function getEloMax() {
    return getEloMidpoint() * 2;
}

function migrateBookStats() {
    const mid = getEloMidpoint();
    let changed = false;
    Object.values(battleData.bookStats).forEach(stat => {
        if (stat && stat.rating === undefined) {
            stat.rating = mid;
            changed = true;
        }
    });
    if (changed) saveBattleData();
}

function applyElo(winnerId, loserId, roundIndex, totalRounds) {
    const ws = ensureBookStat(winnerId);
    const ls = ensureBookStat(loserId);

    const K           = 64;
    const roundWeight = totalRounds > 0 ? roundIndex / totalRounds : 1;
    const effectiveK  = K * (1 + roundWeight);
    const expected    = ws.rating / (ws.rating + ls.rating);

    const loserPlayed      = ls.wins + ls.losses;
    const loserWinRate     = loserPlayed > 0 ? ls.wins / loserPlayed : 0.5;
    const lossMultiplier   = loserWinRate < 0.25 ? 1.5 : 1.0;

    ws.rating = Math.min(getEloMax(), Math.round(ws.rating + effectiveK * (1 - expected)));
    ls.rating = Math.max(1,           Math.round(ls.rating - effectiveK * expected * lossMultiplier));
    ws.wins   += 1;
    ls.losses += 1;
}

// Public single-duel wrapper — saves immediately (classic mode per-round)
function awardPoints(winnerId, loserId, roundIndex, totalRounds) {
    applyElo(winnerId, loserId, roundIndex, totalRounds);
    saveBattleData();
}

function ensureBookStat(id) {
    if (!battleData.bookStats[id]) {
        battleData.bookStats[id] = {
            rating:      getEloMidpoint(),
            wins:        0,
            losses:      0,
            appearances: 0,
            sessionWins: 0
        };
    }
    const stat = battleData.bookStats[id];
    if (stat.rating === undefined) stat.rating = getEloMidpoint();
    return stat;
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
//  SESSION LOGIC — CLASSIC MODE
// ============================================================
function startNewSession() {
    const pool  = getBattlePool();
    const slots = battleComplexMode === "off" ? 0 : Number(battleComplexMode);
    const minBooks = slots > 0 ? slots + 1 : 2;
    if (pool.length < minBooks) {
        alert(`You need at least ${minBooks} eligible books to play!`);
        return;
    }

    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    shuffled.forEach(b => ensureBookStat(b.importOrder).appearances++);
    saveBattleData();

    if (slots > 0) {
        beginComplexSetup(shuffled, slots);
        return;
    }

    battleSession = {
        mode:       "classic",
        pool:       shuffled.map(b => b.importOrder),
        roundIndex: 0,
        startedAt:  Date.now(),
        rounds:     []
    };
    duelStartTime = Date.now();
    renderBattlePlay();
}

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
    const totalRounds = battleSession.pool.length + battleSession.rounds.length - 1;
    battleSession.rounds.push({ winner: winnerId, loser: loserId, roundIndex: battleSession.roundIndex, durationMs: duration });
    awardPoints(winnerId, loserId, battleSession.roundIndex, totalRounds);
    battleSession.pool = battleSession.pool.filter(id => id !== loserId);

    if (battleSession.pool.length === 1) finishSession();
    else { duelStartTime = Date.now(); renderBattlePlay(); }
}

function finishSession() {
    const winnerId = battleSession.pool[0];
    ensureBookStat(winnerId).sessionWins++;
    const sessionRecord = {
        date: Date.now(), poolSize: battleSession.rounds.length + 1,
        winner: winnerId, mode: "classic", rounds: battleSession.rounds.slice()
    };
    battleData.sessions.push(sessionRecord);
    saveBattleData();
    renderBattleWinner(winnerId, sessionRecord);
    battleSession = null;
}

function abandonSession() {
    if (!confirm("Abandon this session? Progress will be lost but Elo changes already made this session remain.")) return;
    battleSession = null;
    duelStartTime = null;
    renderBattlePlay();
}

// ============================================================
//  SESSION LOGIC — COMPLEX: SETUP PHASE
//  First N books shown to user for reordering before play begins.
// ============================================================
function beginComplexSetup(shuffled, slots) {
    battleSession = {
        mode:       "complex-setup",
        slots,
        shelf:      shuffled.slice(0, slots).map(b => b.importOrder),
        queue:      shuffled.slice(slots).map(b => b.importOrder),
        totalBooks: shuffled.length,
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
    const shelf      = battleSession.shelf;
    const queue      = battleSession.queue;
    const slots      = battleSession.slots;
    const totalBooks = battleSession.totalBooks;
    const totalRounds = totalBooks - 1;

    // Award initial Elo within shelf: slot 0 beats slot 1 beats …
    for (let i = 0; i < shelf.length - 1; i++) {
        applyElo(shelf[i], shelf[i + 1], i + 1, totalRounds);
    }
    saveBattleData();

    battleSession = {
        mode: "complex", slots,
        shelf: [...shelf], queue: [...queue],
        roundIndex: shelf.length - 1,
        startedAt: Date.now(), rounds: [], totalBooks
    };
    duelStartTime = Date.now();
    renderBattlePlay();
}

// ============================================================
//  SESSION LOGIC — COMPLEX: PLAY PHASE
//  slotIndex: 0-based slot to swap into, or -1 to reject.
//
//  Reject: ALL shelf books beat challenger.
//  Swap into slot N: challenger beats slots N..end, loses to slots 0..N-1.
//                    Last slot is eliminated via bump chain.
// ============================================================
function complexChoose(slotIndex) {
    if (!battleSession || battleSession.mode !== "complex") return;

    const now        = Date.now();
    const duration   = duelStartTime ? now - duelStartTime : null;
    const challenger = battleSession.queue[0];
    const shelf      = battleSession.shelf;
    const slots      = battleSession.slots;
    const totalRounds = battleSession.totalBooks - 1;

    battleSession.roundIndex++;

    if (slotIndex === -1) {
        // All shelf books beat the challenger
        shelf.forEach(shelfId => applyElo(shelfId, challenger, battleSession.roundIndex, totalRounds));
        battleSession.rounds.push({
            action: "reject", challenger,
            shelfSnapshot: [...shelf],
            durationMs: duration, roundIndex: battleSession.roundIndex
        });
    } else {
        // Challenger beats slots from slotIndex onward
        for (let i = slotIndex; i < shelf.length; i++) {
            applyElo(challenger, shelf[i], battleSession.roundIndex, totalRounds);
        }
        // Challenger loses to slots above slotIndex
        for (let i = 0; i < slotIndex; i++) {
            applyElo(shelf[i], challenger, battleSession.roundIndex, totalRounds);
        }
        const eliminated = shelf[shelf.length - 1];
        const newShelf   = [
            ...shelf.slice(0, slotIndex),
            challenger,
            ...shelf.slice(slotIndex, slots - 1)
        ];
        battleSession.rounds.push({
            action: "swap", slotIndex, challenger, eliminated,
            shelfSnapshot: [...shelf],
            durationMs: duration, roundIndex: battleSession.roundIndex
        });
        battleSession.shelf = newShelf;
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

    // Enforce final shelf order
    for (let i = 0; i < shelf.length - 1; i++) {
        applyElo(shelf[i], shelf[i + 1], totalRounds, totalRounds);
    }

    // Each shelf book beats every rejected book
    const rejectedIds = battleSession.rounds
        .filter(r => r.action === "reject").map(r => r.challenger);
    rejectedIds.forEach(rejId => {
        shelf.forEach(shelfId => applyElo(shelfId, rejId, totalRounds, totalRounds));
    });

    ensureBookStat(winnerId).sessionWins++;
    saveBattleData();

    const sessionRecord = {
        date: Date.now(), poolSize: battleSession.totalBooks,
        winner: winnerId, shelf: [...shelf],
        mode: "complex", slots: battleSession.slots,
        rounds: battleSession.rounds.slice()
    };
    battleData.sessions.push(sessionRecord);
    saveBattleData();
    renderComplexWinner(sessionRecord);
    battleSession = null;
}

// ============================================================
//  KEYBOARD SUPPORT
//
//  Classic:        ← → or 1 2
//  Complex 2-slot: ← → or 1 2 · Space/↓ = reject
//  Complex 3-slot: ← ↑ → or 1 2 3 · Space/↓ = reject
//  Complex 4-10:   1-9 (0=slot10) · Space = reject
// ============================================================
function battleKeyHandler(e) {
    if (battleView !== "play") return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (battleSession?.mode === "complex-setup") return; // setup uses buttons only

    if (!battleSession) return;

    if (battleSession.mode === "classic") {
        if (e.key === "ArrowLeft"  || e.key === "1") { e.preventDefault(); flashCard("left");  chooseSide(pickNextPair()[0]); }
        if (e.key === "ArrowRight" || e.key === "2") { e.preventDefault(); flashCard("right"); chooseSide(pickNextPair()[1]); }
        return;
    }

    if (battleSession.mode === "complex") {
        const slots = battleSession.slots;

        if (e.key === " " || e.key === "Spacebar") {
            e.preventDefault(); flashComplexSlot("reject"); complexChoose(-1); return;
        }

        // Number keys 1-9 and 0 (0 = slot 10)
        if (/^[0-9]$/.test(e.key)) {
            const n = e.key === "0" ? 10 : Number(e.key);
            if (n >= 1 && n <= slots) { e.preventDefault(); flashComplexSlot(n - 1); complexChoose(n - 1); }
            return;
        }

        // Arrow keys for 2 and 3 slots (plus ↓ = reject for both)
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
        .sort((a, b) => b.stat.rating - a.stat.rating);
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
    `;
}

function switchBattleView(view) {
    battleView = view;
    renderBattleSubNav();
    document.getElementById("battlePlayView").style.display      = view === "play"      ? "block" : "none";
    document.getElementById("battleRankingsView").style.display  = view === "rankings"  ? "block" : "none";
    document.getElementById("battleStatsView").style.display     = view === "stats"     ? "block" : "none";
    document.getElementById("battleBlacklistView").style.display = view === "blacklist" ? "block" : "none";
    if (view === "play")      renderBattlePlay();
    if (view === "rankings")  renderBattleRankings();
    if (view === "stats")     renderBattleStats();
    if (view === "blacklist") renderBattleBlacklist();
}

// ============================================================
//  PLAY VIEW
// ============================================================
function renderBattlePlay() {
    const el = document.getElementById("battlePlayView");
    if (!el) return;

    if (battleSession?.mode === "complex-setup") { renderComplexSetup(el); return; }
    if (battleSession?.mode === "complex")        { renderComplexPlay(el);  return; }

    if (!battleSession) {
        const pool    = getBattlePool();
        const blCount = (battleData.blacklist || []).length;
        const slots   = battleComplexMode === "off" ? 0 : Number(battleComplexMode);
        const modeLabel = slots === 0
            ? "Classic — pick your favourite until one champion remains."
            : `Complex (${slots} slots) — judge each challenger against your shelf.`;
        let keyHint = "";
        if (slots === 0)      keyHint = "Keys: ← → or 1 2";
        else if (slots === 2) keyHint = "Keys: ← → or 1 2 · Space/↓ = reject";
        else if (slots === 3) keyHint = "Keys: ← ↑ → or 1 2 3 · Space/↓ = reject";
        else                  keyHint = `Keys: 1–${slots <= 9 ? slots : "9, 0=10"} · Space = reject`;

        el.innerHTML = `
            <div class="battle-lobby">
                <h2>⚔ BookDuel</h2>
                <p class="battle-lobby-sub">${modeLabel}</p>
                <div class="battle-pool-info">
                    📚 ${pool.length} book${pool.length !== 1 ? 's' : ''} in pool
                    ${blCount > 0 ? `<span class="battle-pool-blacklisted">&nbsp;·&nbsp; ${blCount} blacklisted</span>` : ""}
                </div>
                ${battleData.sessions.length > 0 ? `
                    <p style="color:#aaa;font-size:0.9em;margin-bottom:20px;">
                        Sessions played: <strong>${battleData.sessions.length}</strong> &nbsp;|&nbsp;
                        Books ranked: <strong>${Object.keys(battleData.bookStats).length}</strong>
                    </p>` : ""}
                <button class="battle-start-btn" onclick="startNewSession()">Start New Duel Session</button>
                ${pool.length < Math.max(2, slots + 1) ? `<p class="battle-warn">⚠ Not enough eligible books${blCount > 0 ? ' — check your blacklist' : ''}.</p>` : ""}
                <p style="color:#555;font-size:0.8em;margin-top:12px;">${keyHint}</p>
            </div>`;
        return;
    }

    // Classic play
    const pool     = battleSession.pool;
    const total    = battleSession.rounds.length + pool.length;
    const done     = battleSession.rounds.length;
    const progress = total > 1 ? Math.round((done / (total - 1)) * 100) : 100;
    const [idA, idB] = pickNextPair();
    const bookA = getBookById(idA), bookB = getBookById(idB);
    if (!bookA || !bookB) return;

    el.innerHTML = `
        <div class="battle-progress-bar-wrap">
            <div class="battle-progress-label">Round ${done + 1} of ${total - 1} &nbsp;·&nbsp; ${pool.length} survivors</div>
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

// ── Setup: reorder initial shelf ──
function renderComplexSetup(el) {
    const shelf = battleSession.shelf;
    const slots = battleSession.slots;

    let rowsHtml = "";
    shelf.forEach((id, i) => {
        const b     = getBookById(id);
        const cover = b?.coverUrl
            ? `<img src="${b.coverUrl}" class="battle-shelf-thumb" alt="" onerror="this.style.display='none'">`
            : `<div class="battle-shelf-thumb-placeholder">📖</div>`;
        const stars = b?.rating > 0
            ? `<div class="battle-stars" style="font-size:0.8em">${"★".repeat(b.rating)}${"☆".repeat(5 - b.rating)}</div>` : "";
        const label = ["🥇","🥈","🥉"][i] || `#${i+1}`;
        rowsHtml += `
            <div class="setup-shelf-row">
                <div class="setup-slot-label">${label}</div>
                ${cover}
                <div class="setup-book-info">
                    <strong>${b?.title || "?"}</strong>
                    <small>${b?.author || ""}</small>
                    ${stars}
                </div>
                <div class="setup-controls">
                    ${i > 0         ? `<button onclick="shelfMoveUp(${i})"   class="setup-btn">▲</button>` : `<span class="setup-btn-placeholder"></span>`}
                    ${i < slots - 1 ? `<button onclick="shelfMoveDown(${i})" class="setup-btn">▼</button>` : `<span class="setup-btn-placeholder"></span>`}
                </div>
            </div>`;
    });

    el.innerHTML = `
        <div class="complex-setup-screen">
            <h2>📋 Set Your Starting Shelf</h2>
            <p style="color:#aaa;font-size:0.9em;margin-bottom:20px;">
                These ${slots} books fill your shelf before challengers begin.
                Use ▲ ▼ to rank them — slot 1 is your top pick.
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

    const cover = book.coverUrl
        ? `<img src="${book.coverUrl}" class="battle-cover" alt="cover" onerror="this.style.display='none'">`
        : `<div class="battle-cover-placeholder">📖</div>`;
    const stars = book.rating > 0
        ? `<div class="battle-stars">${"★".repeat(book.rating)}${"☆".repeat(5 - book.rating)}</div>` : "";

    let shelfHtml = "";
    shelf.forEach((id, i) => {
        const sb     = getBookById(id);
        const scover = sb?.coverUrl
            ? `<img src="${sb.coverUrl}" class="battle-shelf-thumb" alt="" onerror="this.style.display='none'">`
            : `<div class="battle-shelf-thumb-placeholder">📖</div>`;
        const sstars = sb?.rating > 0
            ? `<div class="battle-stars" style="font-size:0.75em">${"★".repeat(sb.rating)}${"☆".repeat(5 - sb.rating)}</div>` : "";
        const slotLabel = ["🥇","🥈","🥉"][i] || `#${i+1}`;
        const keyLabel  = i < 9 ? `[${i+1}]` : `[0]`;
        shelfHtml += `
            <div class="complex-shelf-slot" onclick="complexChoose(${i})">
                <div class="complex-slot-label">${slotLabel} ${keyLabel}</div>
                ${scover}
                <div class="complex-slot-info">
                    <strong>${sb?.title || "?"}</strong>
                    <small>${sb?.author || ""}</small>
                    ${sstars}
                </div>
                <div class="complex-slot-hint">swap in here</div>
            </div>`;
    });

    el.innerHTML = `
        <div class="battle-progress-bar-wrap">
            <div class="battle-progress-label">Challenger ${done + 1} of ${total} &nbsp;·&nbsp; ${sess.queue.length} remaining</div>
            <div class="battle-progress-track"><div class="battle-progress-fill" style="width:${progress}%"></div></div>
        </div>
        <div class="complex-arena">
            <div class="complex-challenger">
                <div class="complex-challenger-label">⚔ Challenger</div>
                ${cover}
                <div class="battle-card-info">
                    <div class="battle-card-title">${book.title}</div>
                    <div class="battle-card-author">${book.author || ""}</div>
                    ${stars}
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

function renderBookCard(book, id) {
    const cover = book.coverUrl
        ? `<img src="${book.coverUrl}" class="battle-cover" alt="cover" onerror="this.style.display='none'">`
        : `<div class="battle-cover-placeholder">📖</div>`;
    const stars = book.rating > 0
        ? `<div class="battle-stars">${"★".repeat(book.rating)}${"☆".repeat(5 - book.rating)}</div>` : "";
    return `
        <div class="battle-card" onclick="chooseSide(${id})">
            ${cover}
            <div class="battle-card-info">
                <div class="battle-card-title">${book.title}</div>
                <div class="battle-card-author">${book.author || ""}</div>
                ${stars}
            </div>
        </div>`;
}

function renderBattleWinner(winnerId, session) {
    const el       = document.getElementById("battlePlayView");
    if (!el) return;
    const winner   = getBookById(winnerId);
    const stat     = battleData.bookStats[winnerId] || {};
    const last     = session.rounds[session.rounds.length - 1];
    const runnerUp = getBookById(last?.loser);
    const timed    = session.rounds.filter(r => r.durationMs != null && r.durationMs > 0)
                                    .sort((a, b) => a.durationMs - b.durationMs);
    const fastest  = timed[0];
    const slowest  = timed[timed.length - 1];
    const cover    = winner?.coverUrl
        ? `<img src="${winner.coverUrl}" class="battle-winner-cover" alt="" onerror="this.style.display='none'">`
        : `<div class="battle-cover-placeholder" style="font-size:4em;">📖</div>`;

    el.innerHTML = `
        <div class="battle-winner-screen">
            <div class="battle-winner-crown">👑</div>
            <h2>Session Champion</h2>
            ${cover}
            <div class="battle-winner-title">${winner?.title || "Unknown"}</div>
            <div class="battle-winner-author">${winner?.author || ""}</div>
            <div class="battle-session-summary">
                <div class="battle-summary-row"><span>Books in session</span><strong>${session.poolSize}</strong></div>
                <div class="battle-summary-row"><span>Rounds played</span><strong>${session.rounds.length}</strong></div>
                ${runnerUp ? `<div class="battle-summary-row"><span>Runner-up</span><strong>${runnerUp.title}</strong></div>` : ""}
                ${fastest  ? `<div class="battle-summary-row"><span>Fastest pick</span><strong>${fmtMs(fastest.durationMs)}</strong></div>` : ""}
                ${slowest && slowest !== fastest ? `<div class="battle-summary-row"><span>Slowest pick</span><strong>${fmtMs(slowest.durationMs)}</strong></div>` : ""}
                <div class="battle-summary-row"><span>Winner's Duel Rating</span><strong>${stat.rating || getEloMidpoint()} / ${getEloMax()}</strong></div>
                <div class="battle-summary-row"><span>Session wins</span><strong>${stat.sessionWins || 0}</strong></div>
            </div>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;flex-wrap:wrap;">
                <button class="battle-start-btn" onclick="startNewSession()">▶ Play Again</button>
                <button onclick="switchBattleView('rankings')" style="padding:10px 24px;">🏆 See Rankings</button>
                <button onclick="switchBattleView('stats')"    style="padding:10px 24px;">📊 Full Stats</button>
            </div>
        </div>`;
}

function renderComplexWinner(session) {
    const el     = document.getElementById("battlePlayView");
    if (!el) return;
    const shelf  = session.shelf;
    const podium = ["🥇","🥈","🥉"];

    let podiumHtml = "";
    shelf.forEach((id, i) => {
        const b = getBookById(id);
        const cover = b?.coverUrl
            ? `<img src="${b.coverUrl}" class="battle-winner-cover" style="width:80px;height:120px;" alt="" onerror="this.style.display='none'">`
            : `<div style="font-size:3em;">📖</div>`;
        podiumHtml += `
            <div class="complex-podium-entry">
                <div style="font-size:2em;">${podium[i] || `#${i+1}`}</div>
                ${cover}
                <strong>${b?.title || "?"}</strong>
                <small style="color:#aaa;">${b?.author || ""}</small>
            </div>`;
    });

    const timed   = session.rounds.filter(r => r.durationMs != null && r.durationMs > 0)
                                   .sort((a, b) => a.durationMs - b.durationMs);
    const fastest = timed[0];
    const slowest = timed[timed.length - 1];
    const swaps   = session.rounds.filter(r => r.action === "swap").length;
    const rejects = session.rounds.filter(r => r.action === "reject").length;

    el.innerHTML = `
        <div class="battle-winner-screen">
            <div class="battle-winner-crown">🏆</div>
            <h2>Session Complete — Your Top ${shelf.length}</h2>
            <div class="complex-podium">${podiumHtml}</div>
            <div class="battle-session-summary">
                <div class="battle-summary-row"><span>Books judged</span><strong>${session.poolSize}</strong></div>
                <div class="battle-summary-row"><span>Swaps made</span><strong>${swaps}</strong></div>
                <div class="battle-summary-row"><span>Rejected</span><strong>${rejects}</strong></div>
                ${fastest ? `<div class="battle-summary-row"><span>Fastest decision</span><strong>${fmtMs(fastest.durationMs)}</strong></div>` : ""}
                ${slowest && slowest !== fastest ? `<div class="battle-summary-row"><span>Slowest decision</span><strong>${fmtMs(slowest.durationMs)}</strong></div>` : ""}
            </div>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;flex-wrap:wrap;">
                <button class="battle-start-btn" onclick="startNewSession()">▶ Play Again</button>
                <button onclick="switchBattleView('rankings')" style="padding:10px 24px;">🏆 See Rankings</button>
                <button onclick="switchBattleView('stats')"    style="padding:10px 24px;">📊 Full Stats</button>
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
    const eloMax  = getEloMax();
    const eloMid  = getEloMidpoint();

    if (ranked.length === 0) {
        el.innerHTML = `<p style="color:#aaa;margin:40px;text-align:center;">No rankings yet — play a session first!</p>`;
        return;
    }

    let html = `
        <h2 style="margin-bottom:4px;">📖 BookDuel Rankings</h2>
        <p style="color:#888;margin-bottom:20px;font-size:0.9em;">
            Top ${Math.min(battleRankingLimit, ranked.length)} books &nbsp;·&nbsp;
            Scale: 0 – ${eloMax.toLocaleString()} &nbsp;·&nbsp; Neutral midpoint: ${eloMid.toLocaleString()}
        </p>
        <div class="battle-rankings-table">
            <div class="battle-rank-header">
                <span>#</span><span>Book</span><span>Rating</span><span>Win%</span><span>Wins</span><span>Sessions</span><span>🏆</span>
            </div>`;

    limited.forEach((entry, i) => {
        const book = getBookById(entry.id);
        if (!book) return;
        const s      = entry.stat;
        const played = s.wins + s.losses;
        const winPct = played > 0 ? Math.round((s.wins / played) * 100) : 0;
        const cover  = book.coverUrl
            ? `<img src="${book.coverUrl}" class="battle-rank-thumb" alt="" onerror="this.style.display='none'">`
            : `<div class="battle-rank-thumb-placeholder">📖</div>`;
        const crown      = s.sessionWins > 0 ? "👑".repeat(Math.min(s.sessionWins, 5)) : "–";
        const undefeated = s.losses === 0 && s.wins > 0 ? `<span class="battle-badge badge-undefeated">Undefeated</span>` : "";
        const veteran    = s.appearances >= 5           ? `<span class="battle-badge badge-veteran">Veteran</span>` : "";
        const ratingPct  = Math.round((s.rating / eloMax) * 100);
        const ratingDisp = `<div class="battle-rating-cell">
            <span class="battle-rating-num">${s.rating.toLocaleString()}</span>
            <div class="battle-rating-bar-track"><div class="battle-rating-bar-fill" style="width:${ratingPct}%"></div></div>
        </div>`;

        html += `
        <div class="battle-rank-row ${i < 3 ? 'top-three' : ''}">
            <span class="battle-rank-num">${medals[i] || (i + 1)}</span>
            <span class="battle-rank-book">
                ${cover}
                <span>
                    <strong>${book.title}</strong>
                    <small style="color:#aaa;display:block;">${book.author || ""}</small>
                    <span>${undefeated}${veteran}</span>
                </span>
            </span>
            <span class="battle-rank-pts">${ratingDisp}</span>
            <span>${winPct}%</span>
            <span>${s.wins}</span>
            <span>${s.appearances}</span>
            <span>${crown}</span>
        </div>`;
    });

    html += `</div>`;
    if (ranked.length > battleRankingLimit) {
        html += `<p style="color:#666;font-size:0.85em;margin-top:12px;text-align:center;">
            Showing top ${battleRankingLimit} of ${ranked.length} ranked books. Increase limit in Options.</p>`;
    }
    el.innerHTML = html;
}

// ============================================================
//  BLACKLIST VIEW
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
                <p class="battle-blacklist-desc">
                    Blacklisted books are excluded from all Duel sessions.<br>
                    <em>Tip for series:</em> use "Keep only #1" so the whole series is represented by its first book.
                </p>
            </div>
            <div class="battle-blacklist-summary">
                <strong>${blacklistedCount}</strong> / <strong>${eligible.length}</strong> books blacklisted
                ${blacklistedCount > 0 ? `<br><button class="battle-blacklist-clear" onclick="clearBlacklist()">Clear all</button>` : ""}
            </div>
        </div>`;

    const seriesNames = Object.keys(bySeries).sort();
    if (seriesNames.length > 0) {
        html += `<div class="battle-blacklist-section"><h3>By Series</h3>`;
        seriesNames.forEach(series => {
            const sb = bySeries[series].sort((a, b) =>
                (a.seriesNumber ?? 999) - (b.seriesNumber ?? 999) || a.title.localeCompare(b.title));
            const allBl         = sb.every(b => blacklistSet.has(b.importOrder));
            const allButFirstBl = sb.length > 1 && sb.slice(1).every(b => blacklistSet.has(b.importOrder)) && !blacklistSet.has(sb[0].importOrder);
            const seriesEsc     = series.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
            html += `
                <div class="battle-blacklist-series">
                    <div class="battle-blacklist-series-header">
                        <strong>${series}</strong>
                        <span style="color:#777;font-size:0.85em;">${sb.length} book${sb.length !== 1 ? 's' : ''}</span>
                        ${sb.length > 1 ? `
                            <button class="battle-bl-shortcut ${allButFirstBl ? 'active' : ''}" onclick="blacklistAllButFirst('${seriesEsc}')">Keep only #1</button>
                            <button class="battle-bl-shortcut ${allBl ? 'active' : ''}" onclick="blacklistSeries('${seriesEsc}')">Blacklist all</button>
                            <button class="battle-bl-shortcut" onclick="unblacklistSeries('${seriesEsc}')">Clear series</button>` : ""}
                    </div>
                    <div class="battle-blacklist-books">`;
            sb.forEach(b => {
                const isbl     = blacklistSet.has(b.importOrder);
                const numLabel = b.seriesNumber != null ? `<span class="battle-bl-num">#${b.seriesNumber}</span>` : "";
                const cover    = b.coverUrl
                    ? `<img src="${b.coverUrl}" class="battle-bl-thumb" alt="" onerror="this.style.display='none'">`
                    : `<div class="battle-bl-thumb-placeholder">📖</div>`;
                html += `
                    <div class="battle-bl-book ${isbl ? 'blacklisted' : ''}" onclick="toggleBlacklist(${b.importOrder})">
                        ${cover}
                        <div class="battle-bl-book-info">${numLabel}<span class="battle-bl-book-title">${b.title}</span></div>
                        <div class="battle-bl-toggle" title="${isbl ? 'Remove' : 'Add'}">${isbl ? '🚫' : '✓'}</div>
                    </div>`;
            });
            html += `</div></div>`;
        });
        html += `</div>`;
    }

    if (noSeries.length > 0) {
        html += `<div class="battle-blacklist-section"><h3>Standalone Books</h3><div class="battle-blacklist-books">`;
        noSeries.forEach(b => {
            const isbl  = blacklistSet.has(b.importOrder);
            const cover = b.coverUrl
                ? `<img src="${b.coverUrl}" class="battle-bl-thumb" alt="" onerror="this.style.display='none'">`
                : `<div class="battle-bl-thumb-placeholder">📖</div>`;
            html += `
                <div class="battle-bl-book ${isbl ? 'blacklisted' : ''}" onclick="toggleBlacklist(${b.importOrder})">
                    ${cover}
                    <div class="battle-bl-book-info">
                        <span class="battle-bl-book-title">${b.title}</span>
                        <span class="battle-bl-book-author">${b.author || ""}</span>
                    </div>
                    <div class="battle-bl-toggle">${isbl ? '🚫' : '✓'}</div>
                </div>`;
        });
        html += `</div></div>`;
    }

    if (eligible.length === 0) {
        html += `<p style="color:#aaa;text-align:center;margin-top:40px;">No read or currently-reading books yet.</p>`;
    }
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

    // Normalize both classic and complex rounds into {winner, loser, durationMs}
    const normalizedRounds = allRounds.map(r => {
        if (r.winner !== undefined) return r; // classic
        if (r.action === "swap") {
            const displaced = (r.shelfSnapshot || [])[r.slotIndex];
            return { winner: r.challenger, loser: displaced, durationMs: r.durationMs };
        }
        if (r.action === "reject") {
            const snap    = r.shelfSnapshot || [];
            const weakest = snap[snap.length - 1];
            return { winner: weakest, loser: r.challenger, durationMs: r.durationMs };
        }
        return { winner: null, loser: null, durationMs: r.durationMs };
    });

    const timedRounds   = normalizedRounds.filter(r => r.durationMs != null && r.durationMs > 0);
    const sortedFastest = timedRounds.slice().sort((a, b) => a.durationMs - b.durationMs).slice(0, 5);
    const sortedSlowest = timedRounds.slice().sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);
    const avgMs         = timedRounds.length > 0
        ? timedRounds.reduce((s, r) => s + r.durationMs, 0) / timedRounds.length : 0;

    const ranked = getRankedBooks();

    const dominant = ranked
        .filter(e => e.stat.appearances >= 3)
        .map(e => ({ ...e, winRate: e.stat.wins / Math.max(1, e.stat.wins + e.stat.losses) }))
        .sort((a, b) => b.winRate - a.winRate)[0];

    // Guilty Pleasure: top-half ranked, has a session win, rated ≤3 stars
    const guiltyPleasure = ranked
        .filter((e, i) => i < Math.ceil(ranked.length / 2) && e.stat.sessionWins > 0)
        .map(e => ({ ...e, book: getBookById(e.id) }))
        .filter(e => e.book && e.book.rating > 0 && e.book.rating <= 3)
        .sort((a, b) => a.book.rating - b.book.rating)[0];

    const rankIndex = {};
    ranked.forEach((e, i) => { rankIndex[e.id] = i; });
    let biggestUpset = null;
    normalizedRounds.forEach(r => {
        if (!r.winner || !r.loser) return;
        const wi = rankIndex[r.winner] ?? 9999;
        const li = rankIndex[r.loser]  ?? 9999;
        if (li < wi) {
            const gap = wi - li;
            if (!biggestUpset || gap > biggestUpset.gap) biggestUpset = { gap, winner: r.winner, loser: r.loser };
        }
    });

    let html = `<h2>📊 BookDuel Stats</h2>
        <div class="battle-stats-grid">
            ${statCard("🎮", "Sessions Played", sessions.length)}
            ${statCard("⚔",  "Total Decisions", totalDuels)}
            ${statCard("📚", "Books Ranked",    totalBooks)}
            ${statCard("⏱",  "Avg Decision",    fmtMs(Math.round(avgMs)))}
        </div>`;

    if (sortedFastest.length > 0) {
        html += `<div class="battle-stats-section">
            <h3>⚡ Fastest Decisions (Top 5)</h3>
            <table class="battle-stats-table">
                <thead><tr><th>#</th><th>Chosen / kept</th><th>Rejected / eliminated</th><th>Time</th></tr></thead><tbody>`;
        sortedFastest.forEach((r, i) => {
            const w = r.winner ? getBookById(r.winner) : null;
            const l = r.loser  ? getBookById(r.loser)  : null;
            html += `<tr><td>${i+1}</td><td>${w ? w.title : "–"}</td><td style="color:#888;">${l ? l.title : "–"}</td><td class="battle-time-fast">${fmtMs(r.durationMs)}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }

    if (sortedSlowest.length > 0) {
        html += `<div class="battle-stats-section">
            <h3>🤔 Hardest Decisions (Top 5 Slowest)</h3>
            <table class="battle-stats-table">
                <thead><tr><th>#</th><th>Chosen / kept</th><th>Rejected / eliminated</th><th>Time</th></tr></thead><tbody>`;
        sortedSlowest.forEach((r, i) => {
            const w = r.winner ? getBookById(r.winner) : null;
            const l = r.loser  ? getBookById(r.loser)  : null;
            html += `<tr><td>${i+1}</td><td>${w ? w.title : "–"}</td><td style="color:#888;">${l ? l.title : "–"}</td><td class="battle-time-slow">${fmtMs(r.durationMs)}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }

    html += `<div class="battle-stats-section"><h3>✨ Highlights</h3><div class="battle-highlights-grid">`;

    if (dominant) {
        const db = getBookById(dominant.id);
        html += highlightCard("👑 Most Dominant", db ? db.title : "–",
            `${Math.round(dominant.winRate * 100)}% win rate (min. 3 appearances)`);
    }
    if (guiltyPleasure) {
        const gb = guiltyPleasure.book;
        html += highlightCard("🙈 Guilty Pleasure", gb.title,
            `Top half of duel rankings but only ${"★".repeat(gb.rating)} (${gb.rating}/5 stars)`);
    }
    if (biggestUpset) {
        const wu = getBookById(biggestUpset.winner);
        const lu = getBookById(biggestUpset.loser);
        html += highlightCard("🎯 Biggest Upset", wu ? wu.title : "–",
            `Knocked out ${lu ? lu.title : "–"} despite being ranked ${biggestUpset.gap} spots lower`);
    }

    const ratedRanked = ranked.filter(e => { const b = getBookById(e.id); return b && b.rating > 0; });
    if (ratedRanked.length >= 3) {
        const half   = Math.ceil(ratedRanked.length / 2);
        const topAvg = (ratedRanked.slice(0, half).reduce((s, e) => s + getBookById(e.id).rating, 0) / half).toFixed(1);
        html += highlightCard("⭐ Duel vs Stars", `Top-ranked avg: ${topAvg} ★`,
            `Your highest-duelled books average ${topAvg} stars`);
    }

    html += `</div></div>
        <div class="battle-stats-section">
            <h3>📋 Session History</h3>
            <table class="battle-stats-table">
                <thead><tr><th>Date</th><th>Mode</th><th>Pool</th><th>Rounds</th><th>Champion / Shelf</th></tr></thead><tbody>`;

    sessions.slice().reverse().forEach(sess => {
        const w       = getBookById(sess.winner);
        const modeTag = sess.mode === "complex"
            ? `<span style="color:#aaa;font-size:0.8em;">Complex ${sess.slots}s</span>`
            : `<span style="color:#aaa;font-size:0.8em;">Classic</span>`;
        const podium  = sess.shelf
            ? sess.shelf.map(id => { const b = getBookById(id); return b ? b.title : "?"; }).join(" › ")
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
    return `<div class="battle-stat-card">
        <div class="battle-stat-icon">${icon}</div>
        <div class="battle-stat-value">${value}</div>
        <div class="battle-stat-label">${label}</div>
    </div>`;
}

function highlightCard(title, main, sub) {
    return `<div class="battle-highlight-card">
        <div class="battle-highlight-title">${title}</div>
        <div class="battle-highlight-main">${main}</div>
        <div class="battle-highlight-sub">${sub}</div>
    </div>`;
}

// ============================================================
//  OPTIONS (called from ui-events.js / ui-core.js)
// ============================================================
function saveBattleRankingLimit(val) {
    battleRankingLimit = Math.max(1, Number(val) || DEFAULT_RANKING_LIMIT);
    localStorage.setItem(BATTLE_LIMIT_KEY, String(battleRankingLimit));
}

function saveBattleComplexSetting(val) {
    saveBattleComplexMode(val);
}

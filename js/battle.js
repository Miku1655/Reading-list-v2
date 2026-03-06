// ============================================================
//  BookDuel – "Would You Rather" ranking game
//  File: js/battle.js
// ============================================================

const BATTLE_KEY = "reading_battle_data";
const BATTLE_LIMIT_KEY = "reading_battle_ranking_limit";
const DEFAULT_RANKING_LIMIT = 20;

// ---------- state ----------
let battleData = null;          // persisted object
let battleRankingLimit = DEFAULT_RANKING_LIMIT;

// current live session
let battleSession = null;       // { pool:[], currentPair:[], roundIndex, startedAt, rounds:[] }
let duelStartTime = null;       // timestamp when the current pair was shown

// ---------- sub-view ----------
let battleView = "play";        // "play" | "rankings" | "stats"

// ============================================================
//  STORAGE
// ============================================================
function loadBattleData() {
    const raw = localStorage.getItem(BATTLE_KEY);
    battleData = raw ? JSON.parse(raw) : { sessions: [], bookStats: {} };
    battleRankingLimit = Number(localStorage.getItem(BATTLE_LIMIT_KEY)) || DEFAULT_RANKING_LIMIT;
}

function saveBattleData() {
    localStorage.setItem(BATTLE_KEY, JSON.stringify(battleData));
}

function resetBattleData() {
    if (!confirm("Reset ALL BookDuel data? This will erase rankings, stats and session history. This cannot be undone.")) return;
    battleData = { sessions: [], bookStats: {} };
    battleSession = null;
    saveBattleData();
    renderBattle();
}

// ============================================================
//  HELPERS
// ============================================================
function getBattlePool() {
    return books.filter(b =>
        b.exclusiveShelf === "read" || b.exclusiveShelf === "currently-reading"
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
//  SCORING  (Duel Points)
//
//  Each win scores:  roundWeight × max(1, opponentPoints)
//  roundWeight = roundIndex  (1-based, so final of N books = N-1)
//  Loser gets 40% consolation.
// ============================================================
function awardPoints(winnerId, loserId, roundIndex) {
    const ws = ensureBookStat(winnerId);
    const ls = ensureBookStat(loserId);

    const opponentPts = Math.max(1, ls.totalPoints);
    const points = roundIndex * opponentPts;
    const consolation = Math.round(points * 0.4);

    ws.totalPoints += points;
    ws.wins += 1;
    ls.totalPoints += consolation;
    ls.losses += 1;
}

function ensureBookStat(id) {
    if (!battleData.bookStats[id]) {
        battleData.bookStats[id] = {
            totalPoints: 0,
            wins: 0,
            losses: 0,
            appearances: 0,
            sessionWins: 0
        };
    }
    return battleData.bookStats[id];
}

// ============================================================
//  SESSION LOGIC
// ============================================================
function startNewSession() {
    const pool = getBattlePool();
    if (pool.length < 2) {
        alert("You need at least 2 read / currently-reading books to play BookDuel!");
        return;
    }

    // shuffle
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);

    // record appearances
    shuffled.forEach(b => ensureBookStat(b.importOrder).appearances++);

    battleSession = {
        pool: shuffled.map(b => b.importOrder),
        roundIndex: 0,
        startedAt: Date.now(),
        rounds: []
    };

    renderBattlePlay();
}

function pickNextPair() {
    // pool has survivors; pick first two
    const pool = battleSession.pool;
    return [pool[0], pool[1]];
}

function chooseSide(winnerId) {
    if (!battleSession) return;
    const now = Date.now();
    const duration = duelStartTime ? now - duelStartTime : null;

    const pair = pickNextPair();
    const loserId = pair.find(id => id !== winnerId);

    battleSession.roundIndex++;
    battleSession.rounds.push({
        winner: winnerId,
        loser: loserId,
        roundIndex: battleSession.roundIndex,
        durationMs: duration
    });

    // award points
    awardPoints(winnerId, loserId, battleSession.roundIndex);

    // remove loser from pool
    battleSession.pool = battleSession.pool.filter(id => id !== loserId);

    if (battleSession.pool.length === 1) {
        finishSession();
    } else {
        duelStartTime = Date.now();
        renderBattlePlay();
    }
}

function finishSession() {
    const winnerId = battleSession.pool[0];
    ensureBookStat(winnerId).sessionWins++;

    const sessionRecord = {
        date: Date.now(),
        poolSize: battleSession.rounds.length + 1,
        winner: winnerId,
        rounds: battleSession.rounds.slice()
    };

    battleData.sessions.push(sessionRecord);
    saveBattleData();

    renderBattleWinner(winnerId, sessionRecord);
    battleSession = null;
}

// ============================================================
//  RANKING  (sorted by totalPoints desc)
// ============================================================
function getRankedBooks() {
    const entries = Object.entries(battleData.bookStats)
        .map(([id, stat]) => ({ id: Number(id), stat }))
        .filter(e => {
            const b = getBookById(e.id);
            return b !== null;
        })
        .sort((a, b) => b.stat.totalPoints - a.stat.totalPoints);
    return entries;
}

// ============================================================
//  RENDER – MAIN ENTRY
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
    nav.innerHTML = `
        <button onclick="switchBattleView('play')"      class="battle-subnav ${battleView==='play'?'active':''}">▶ Play</button>
        <button onclick="switchBattleView('rankings')"  class="battle-subnav ${battleView==='rankings'?'active':''}">🏆 Rankings</button>
        <button onclick="switchBattleView('stats')"     class="battle-subnav ${battleView==='stats'?'active':''}">📊 Stats</button>
    `;
}

function switchBattleView(view) {
    battleView = view;
    renderBattleSubNav();
    document.getElementById("battlePlayView").style.display      = view === "play"     ? "block" : "none";
    document.getElementById("battleRankingsView").style.display  = view === "rankings" ? "block" : "none";
    document.getElementById("battleStatsView").style.display     = view === "stats"    ? "block" : "none";

    if (view === "play")     renderBattlePlay();
    if (view === "rankings") renderBattleRankings();
    if (view === "stats")    renderBattleStats();
}

// ============================================================
//  PLAY VIEW
// ============================================================
function renderBattlePlay() {
    const el = document.getElementById("battlePlayView");
    if (!el) return;

    if (!battleSession) {
        // lobby screen
        const pool = getBattlePool();
        el.innerHTML = `
            <div class="battle-lobby">
                <h2>⚔ BookDuel</h2>
                <p class="battle-lobby-sub">Choose between two books — keep picking your favourite until one champion remains.</p>
                <div class="battle-pool-info">📚 ${pool.length} books eligible (read + currently-reading)</div>
                ${battleData.sessions.length > 0 ? `<p style="color:#aaa; font-size:0.9em;">Sessions played: <strong>${battleData.sessions.length}</strong> &nbsp;|&nbsp; Rankings accumulated: <strong>${Object.keys(battleData.bookStats).length}</strong> books</p>` : ""}
                <button class="battle-start-btn" onclick="startNewSession()">Start New Duel Session</button>
                ${pool.length < 2 ? `<p class="battle-warn">⚠ Add at least 2 read books to play.</p>` : ""}
            </div>
        `;
        return;
    }

    const pool = battleSession.pool;
    const total = battleSession.rounds.length + pool.length;
    const done  = battleSession.rounds.length;
    const progress = Math.round((done / (total - 1)) * 100);

    const [idA, idB] = pickNextPair();
    const bookA = getBookById(idA);
    const bookB = getBookById(idB);
    if (!bookA || !bookB) return;

    duelStartTime = duelStartTime || Date.now();

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
        <p class="battle-hint">Tap the book you prefer to keep it alive.</p>
        <button class="battle-abandon-btn" onclick="abandonSession()">✕ Abandon session</button>
    `;
}

function renderBookCard(book, id) {
    const cover = book.coverUrl
        ? `<img src="${book.coverUrl}" class="battle-cover" alt="cover" onerror="this.style.display='none'">`
        : `<div class="battle-cover-placeholder">📖</div>`;
    const stars = book.rating > 0
        ? `<div class="battle-stars">${"★".repeat(book.rating)}${"☆".repeat(5 - book.rating)}</div>`
        : "";
    return `
        <div class="battle-card" onclick="chooseSide(${id})">
            ${cover}
            <div class="battle-card-info">
                <div class="battle-card-title">${book.title}</div>
                <div class="battle-card-author">${book.author || ""}</div>
                ${stars}
            </div>
        </div>
    `;
}

function renderBattleWinner(winnerId, session) {
    const el = document.getElementById("battlePlayView");
    if (!el) return;

    const winner = getBookById(winnerId);
    const stat   = battleData.bookStats[winnerId] || {};

    // find runner-up: loser of the final round
    const finalRound = session.rounds[session.rounds.length - 1];
    const runnerUp = getBookById(finalRound.loser);

    // fastest / slowest of this session
    const timed = session.rounds.filter(r => r.durationMs != null).sort((a, b) => a.durationMs - b.durationMs);
    const fastest = timed[0];
    const slowest = timed[timed.length - 1];

    const cover = winner?.coverUrl
        ? `<img src="${winner.coverUrl}" class="battle-winner-cover" alt="cover" onerror="this.style.display='none'">`
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
                ${fastest ? `<div class="battle-summary-row"><span>Fastest pick</span><strong>${fmtMs(fastest.durationMs)}</strong></div>` : ""}
                ${slowest ? `<div class="battle-summary-row"><span>Slowest pick</span><strong>${fmtMs(slowest.durationMs)}</strong></div>` : ""}
                <div class="battle-summary-row"><span>All-time Duel Points for winner</span><strong>${stat.totalPoints || 0}</strong></div>
                <div class="battle-summary-row"><span>Champion's all-time session wins</span><strong>${stat.sessionWins || 0}</strong></div>
            </div>

            <div style="display:flex; gap:12px; justify-content:center; margin-top:24px; flex-wrap:wrap;">
                <button class="battle-start-btn" onclick="startNewSession()">▶ Play Again</button>
                <button onclick="switchBattleView('rankings')" style="padding:10px 24px;">🏆 See Rankings</button>
                <button onclick="switchBattleView('stats')" style="padding:10px 24px;">📊 Full Stats</button>
            </div>
        </div>
    `;
}

function abandonSession() {
    if (!confirm("Abandon this session? Progress will be lost but points already awarded this session remain.")) return;
    battleSession = null;
    renderBattlePlay();
}

// ============================================================
//  RANKINGS VIEW
// ============================================================
function renderBattleRankings() {
    const el = document.getElementById("battleRankingsView");
    if (!el) return;

    const ranked = getRankedBooks();
    const limited = ranked.slice(0, battleRankingLimit);

    if (ranked.length === 0) {
        el.innerHTML = `<p style="color:#aaa; margin:40px; text-align:center;">No rankings yet — play a session first!</p>`;
        return;
    }

    const medals = ["🥇","🥈","🥉"];

    let html = `<h2 style="margin-bottom:4px;">📖 BookDuel Rankings</h2>
    <p style="color:#888; margin-bottom:20px; font-size:0.9em;">Top ${battleRankingLimit} books · based on accumulated Duel Points across all sessions</p>
    <div class="battle-rankings-table">
        <div class="battle-rank-header">
            <span>#</span><span>Book</span><span>Points</span><span>Win%</span><span>Wins</span><span>Sessions</span><span>🏆</span>
        </div>`;

    limited.forEach((entry, i) => {
        const book = getBookById(entry.id);
        if (!book) return;
        const s = entry.stat;
        const played = s.wins + s.losses;
        const winPct = played > 0 ? Math.round((s.wins / played) * 100) : 0;
        const medal  = medals[i] || "";
        const cover  = book.coverUrl
            ? `<img src="${book.coverUrl}" class="battle-rank-thumb" alt="" onerror="this.style.display='none'">`
            : `<div class="battle-rank-thumb-placeholder">📖</div>`;
        const crown  = s.sessionWins > 0 ? `${"👑".repeat(Math.min(s.sessionWins, 5))}` : "–";
        const undefeated = s.losses === 0 && s.wins > 0 ? `<span class="battle-badge badge-undefeated">Undefeated</span>` : "";
        const veteran    = s.appearances >= 5 ? `<span class="battle-badge badge-veteran">Veteran</span>` : "";

        html += `
        <div class="battle-rank-row ${i < 3 ? 'top-three' : ''}">
            <span class="battle-rank-num">${medal || (i + 1)}</span>
            <span class="battle-rank-book">
                ${cover}
                <span>
                    <strong>${book.title}</strong>
                    <small style="color:#aaa; display:block;">${book.author || ""}</small>
                    <span>${undefeated}${veteran}</span>
                </span>
            </span>
            <span class="battle-rank-pts">${s.totalPoints.toLocaleString()}</span>
            <span>${winPct}%</span>
            <span>${s.wins}</span>
            <span>${s.appearances}</span>
            <span>${crown}</span>
        </div>`;
    });

    html += `</div>`;

    if (ranked.length > battleRankingLimit) {
        html += `<p style="color:#666; font-size:0.85em; margin-top:12px; text-align:center;">Showing top ${battleRankingLimit} of ${ranked.length} ranked books. Increase limit in Options.</p>`;
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
        el.innerHTML = `<p style="color:#aaa; margin:40px; text-align:center;">No stats yet — play a session first!</p>`;
        return;
    }

    const totalDuels   = sessions.reduce((s, sess) => s + sess.rounds.length, 0);
    const totalBooks   = Object.keys(battleData.bookStats).length;
    const allRounds    = sessions.flatMap(s => s.rounds);
    const timedRounds  = allRounds.filter(r => r.durationMs != null && r.durationMs > 0);

    // Fastest / slowest top 5
    const sortedFastest = timedRounds.slice().sort((a, b) => a.durationMs - b.durationMs).slice(0, 5);
    const sortedSlowest = timedRounds.slice().sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);

    // Most dominant (win rate, min 3 appearances)
    const ranked = getRankedBooks();
    const dominant = ranked
        .filter(e => e.stat.appearances >= 3)
        .map(e => ({ ...e, winRate: e.stat.wins / (e.stat.wins + e.stat.losses) }))
        .sort((a, b) => b.winRate - a.winRate)[0];

    // Guilty pleasure: high duel rank, low star rating
    const guiltyPleasure = ranked
        .filter((e, i) => i < Math.ceil(ranked.length / 2))   // top half of rankings
        .map(e => ({ ...e, book: getBookById(e.id) }))
        .filter(e => e.book && e.book.rating > 0 && e.book.rating <= 3)
        .sort((a, b) => a.book.rating - b.book.rating)[0];

    // Biggest upset: highest-ranked (by index in global ranking) beat by a lower-ranked
    let biggestUpset = null;
    const rankIndex = {};
    ranked.forEach((e, i) => { rankIndex[e.id] = i; });
    allRounds.forEach(r => {
        const wi = rankIndex[r.winner] ?? 9999;
        const li = rankIndex[r.loser]  ?? 9999;
        if (li < wi) {   // loser was ranked higher → upset
            const gap = wi - li;
            if (!biggestUpset || gap > biggestUpset.gap) {
                biggestUpset = { gap, winner: r.winner, loser: r.loser };
            }
        }
    });

    // Average decision time
    const avgMs = timedRounds.length > 0
        ? timedRounds.reduce((s, r) => s + r.durationMs, 0) / timedRounds.length
        : 0;

    // ---- build HTML ----
    let html = `<h2>📊 BookDuel Stats</h2>`;

    // Overview cards
    html += `<div class="battle-stats-grid">
        ${statCard("🎮", "Sessions Played", sessions.length)}
        ${statCard("⚔", "Total Duels", totalDuels)}
        ${statCard("📚", "Books Ranked", totalBooks)}
        ${statCard("⏱", "Avg Decision", fmtMs(Math.round(avgMs)))}
    </div>`;

    // Fastest decisions top 5
    if (sortedFastest.length > 0) {
        html += `<div class="battle-stats-section">
            <h3>⚡ Fastest Decisions (Top 5)</h3>
            <table class="battle-stats-table">
                <thead><tr><th>#</th><th>Winner kept</th><th>Eliminated</th><th>Time</th></tr></thead>
                <tbody>`;
        sortedFastest.forEach((r, i) => {
            const w = getBookById(r.winner);
            const l = getBookById(r.loser);
            html += `<tr>
                <td>${i + 1}</td>
                <td>${w ? w.title : r.winner}</td>
                <td style="color:#888;">${l ? l.title : r.loser}</td>
                <td class="battle-time-fast">${fmtMs(r.durationMs)}</td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    }

    // Slowest decisions top 5
    if (sortedSlowest.length > 0) {
        html += `<div class="battle-stats-section">
            <h3>🤔 Hardest Decisions (Top 5 Slowest)</h3>
            <table class="battle-stats-table">
                <thead><tr><th>#</th><th>Winner kept</th><th>Eliminated</th><th>Time</th></tr></thead>
                <tbody>`;
        sortedSlowest.forEach((r, i) => {
            const w = getBookById(r.winner);
            const l = getBookById(r.loser);
            html += `<tr>
                <td>${i + 1}</td>
                <td>${w ? w.title : r.winner}</td>
                <td style="color:#888;">${l ? l.title : r.loser}</td>
                <td class="battle-time-slow">${fmtMs(r.durationMs)}</td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    }

    // Highlights
    html += `<div class="battle-stats-section"><h3>✨ Highlights</h3><div class="battle-highlights-grid">`;

    if (dominant) {
        const db = getBookById(dominant.id);
        html += highlightCard("👑 Most Dominant",
            db ? db.title : "–",
            `${Math.round(dominant.winRate * 100)}% win rate (min. 3 sessions)`);
    }

    if (guiltyPleasure) {
        const gb = guiltyPleasure.book;
        html += highlightCard("🙈 Guilty Pleasure",
            gb.title,
            `Ranked top ${Math.ceil(ranked.length / 2)} in duels but rated ${"★".repeat(gb.rating)} (${gb.rating}/5 stars)`);
    }

    if (biggestUpset) {
        const wu = getBookById(biggestUpset.winner);
        const lu = getBookById(biggestUpset.loser);
        html += highlightCard("🎯 Biggest Upset",
            wu ? wu.title : "–",
            `Knocked out ${lu ? lu.title : "–"} despite being ranked ${biggestUpset.gap} spots lower`);
    }

    // Star vs duel rank correlation note
    const ratedRanked = ranked.filter(e => { const b = getBookById(e.id); return b && b.rating > 0; });
    if (ratedRanked.length >= 3) {
        const topDuelAvgStars = (ratedRanked.slice(0, Math.ceil(ratedRanked.length / 2))
            .reduce((s, e) => s + getBookById(e.id).rating, 0) / Math.ceil(ratedRanked.length / 2)).toFixed(1);
        html += highlightCard("⭐ Duel vs Stars",
            `Top-ranked avg: ${topDuelAvgStars} ★`,
            `Your highest-duelled books average ${topDuelAvgStars} stars`);
    }

    html += `</div></div>`;

    // Session history
    html += `<div class="battle-stats-section">
        <h3>📋 Session History</h3>
        <table class="battle-stats-table">
            <thead><tr><th>Date</th><th>Pool</th><th>Rounds</th><th>Champion</th></tr></thead>
            <tbody>`;
    sessions.slice().reverse().forEach(sess => {
        const w = getBookById(sess.winner);
        html += `<tr>
            <td>${fmtDate(sess.date)}</td>
            <td>${sess.poolSize}</td>
            <td>${sess.rounds.length}</td>
            <td>👑 ${w ? w.title : sess.winner}</td>
        </tr>`;
    });
    html += `</tbody></table></div>`;

    el.innerHTML = html;
}

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
//  OPTIONS  (called from options tab)
// ============================================================
function saveBattleRankingLimit(val) {
    battleRankingLimit = Math.max(1, Number(val) || DEFAULT_RANKING_LIMIT);
    localStorage.setItem(BATTLE_LIMIT_KEY, String(battleRankingLimit));
}

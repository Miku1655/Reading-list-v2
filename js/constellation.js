// js/constellation.js - Reading Constellation visualization

const CONSTELLATION_CANVAS_ID = 'constellationCanvas';
const CONSTELLATION_TOOLTIP_ID = 'constellationTooltip';
const ctx = constellationCtx;

let constellationCanvas = null;
let constellationCtx = null;
let constellationBooks = [];
let hoveredBook = null;

const ratingColors = [
    '#a0a0a0',     // 0 / unrated - dim grayish white
    '#87ceeb',     // 1 - sky blue (cool, dim)
    '#add8e6',     // 2 - light blue
    '#f0f8ff',     // 3 - alice blue (neutral white)
    '#fffacd',     // 4 - lemon chiffon (warm light yellow)
    '#ffd700'      // 5 - gold (bright warm)
];

function initConstellation() {
    constellationCanvas = document.getElementById(CONSTELLATION_CANVAS_ID);
    if (!constellationCanvas) return;
    constellationCtx = constellationCanvas.getContext('2d');

    // Initial settings if not exist
    if (!settings) settings = {};
    if (!settings.constellation) {
        settings.constellation = {
            mode: 'timeline',
            showSeriesLines: true,
            showAuthorLines: true,
            showFavoritesGlow: true
        };
    }

    // Sync controls with settings
    const modeSelect = document.getElementById('constellationMode');
    const seriesChk = document.getElementById('showSeriesLines');
    const authorChk = document.getElementById('showAuthorLines');
    const glowChk = document.getElementById('showFavoritesGlow');

    if (modeSelect) modeSelect.value = settings.constellation.mode;
    if (seriesChk) seriesChk.checked = settings.constellation.showSeriesLines;
    if (authorChk) authorChk.checked = settings.constellation.showAuthorLines;
    if (glowChk) glowChk.checked = settings.constellation.showFavoritesGlow;

    // Event listeners for controls
    document.getElementById('constellationMode')?.addEventListener('change', updateConstellationSettings);
    document.getElementById('showSeriesLines')?.addEventListener('change', updateConstellationSettings);
    document.getElementById('showAuthorLines')?.addEventListener('change', updateConstellationSettings);
    document.getElementById('showFavoritesGlow')?.addEventListener('change', updateConstellationSettings);
    document.getElementById('redrawConstellation')?.addEventListener('click', () => renderConstellation(true));

    // Resize handling
    window.addEventListener('resize', debounce(resizeConstellationCanvas, 200));

    resizeConstellationCanvas();
    prepareConstellationData();
    renderConstellation();
}

function updateConstellationSettings() {
    settings.constellation = {
        mode: document.getElementById('constellationMode').value,
        showSeriesLines: document.getElementById('showSeriesLines').checked,
        showAuthorLines: document.getElementById('showAuthorLines').checked,
        showFavoritesGlow: document.getElementById('showFavoritesGlow').checked
    };
    localStorage.setItem('settings', JSON.stringify(settings)); // assuming you have SETTINGS_KEY or similar
    renderConstellation();
}

function resizeConstellationCanvas() {
    if (!constellationCanvas) return;
    const container = constellationCanvas.parentElement;
    constellationCanvas.width = container.clientWidth * devicePixelRatio;
    constellationCanvas.height = container.clientHeight * devicePixelRatio;
    constellationCanvas.style.width = container.clientWidth + 'px';
    constellationCanvas.style.height = container.clientHeight + 'px';
    constellationCtx.scale(devicePixelRatio, devicePixelRatio);
    renderConstellation();
}

function prepareConstellationData() {
    constellationBooks = books
        .filter(b => b.exclusiveShelf === 'read' && b.reads?.some(r => r.finished))
        .map(b => ({
            ...b,
            finishedDates: b.reads.filter(r => r.finished).map(r => r.finished),
            lastFinished: Math.max(...b.reads.filter(r => r.finished).map(r => r.finished || 0)),
            isFavorite: profile.favourites?.includes(b.importOrder)
        }));
}

function getStarSize(pages) {
    if (!pages || pages < 1) return 2;
    return 2 + Math.log(pages / 10) * 3.5; // 50p=~3px, 100p=~5px, 500p=~12px, 1200=~18px, 5000=~25px
}

function getStarColor(rating) {
    const idx = Math.round(rating || 0);
    return ratingColors[Math.min(idx, 5)];
}

function drawStar(constellationCtx, cx, cy, size, color, glow = false) {
    constellationCtx.save();
    constellationCtx.beginPath();
    constellationCtx.arc(cx, cy, size, 0, Math.PI * 2);
    constellationCtx.closePath();

    // Base subtle glow for all stars (twinkle effect)
    constellationCtx.shadowColor = '#ffffff';
    constellationCtx.shadowBlur = 4;

    if (glow) {
        // Stronger glow for favorites
        constellationCtx.shadowColor = '#ffd700'; // Goldish for visibility
        constellationCtx.shadowBlur = 20; // More pronounced
        constellationCtx.shadowOffsetX = 0;
        constellationCtx.shadowOffsetY = 0;
    }

    constellationCtx.fillStyle = color;
    constellationCtx.fill();

    ctx.shadowBlur = 0; // Reset
    ctx.restore();
}

function drawConnection(ctx, x1, y1, x2, y2, isSeries = false) {
    constellationCtx.beginPath();
    constellationCtx.moveTo(x1, y1);
    constellationCtx.lineTo(x2, y2);
    constellationCtx.strokeStyle = isSeries ? '#66a3ff' : '#cccccc'; // Blueish for series, gray for author
    constellationCtx.lineWidth = isSeries ? 1.2 : 0.6; // Thicker for series
    constellationCtx.setLineDash(isSeries ? [4, 6] : []); // Dashed only for series
    constellationCtx.globalAlpha = 0.35; // Softer to avoid clutter
    constellationCtx.stroke();
    constellationCtx.setLineDash([]);
    constellationCtx.globalAlpha = 1;
}

function calculatePositions(mode) {
    const w = constellationCanvas.width / devicePixelRatio;
    const h = constellationCanvas.height / devicePixelRatio;
    let positions = constellationBooks.map(() => ({x: Math.random() * w, y: Math.random() * h})); // Start random

    if (mode === 'timeline') {
        const minTime = Math.min(...constellationBooks.map(b => b.lastFinished || 0));
        const maxTime = Math.max(...constellationBooks.map(b => b.lastFinished || 0));
        const timeRange = maxTime - minTime || 1;
        positions = constellationBooks.map((book, i) => {
            const baseX = 40 + ((book.lastFinished - minTime) / timeRange) * (w - 80);
            const jitterX = (Math.sin(i * 0.3) * 40) + (Math.random() - 0.5) * 20;
            const baseY = h / 2 + (book.rating || 2.5) * (h / 10);
            const jitterY = (Math.cos(i * 0.5) * 60) + (Math.random() - 0.5) * 40;
            return {x: baseX + jitterX, y: baseY + jitterY};
        });
    } else if (mode === 'rating-pages') {
        const maxPages = Math.max(...constellationBooks.map(b => b.pages || 100), 100);
        positions = constellationBooks.map(book => {
            const baseX = 40 + ((book.pages || 100) / maxPages) * (w - 80);
            const jitterX = (Math.random() - 0.5) * 60;
            const baseY = h - 40 - ((book.rating || 0) / 5) * (h - 80);
            const jitterY = (Math.random() - 0.5) * 80;
            return {x: baseX + jitterX, y: baseY + jitterY};
        });
    } else { // Clustered constellation with forces
        // Group by author/series for attraction
        const groups = {};
        constellationBooks.forEach((b, i) => {
            const key = (b.series || '') + '|' + (b.author || '');
            if (!groups[key]) groups[key] = [];
            groups[key].push(i);
        });

        // Simple force sim: 15 iterations
        for (let iter = 0; iter < 15; iter++) {
            constellationBooks.forEach((book, i) => {
                let fx = 0, fy = 0;
                const p = positions[i];
                const mass = getStarSize(book.pages) / 10; // Bigger stars attract more

                // Repel all others
                for (let j = 0; j < constellationBooks.length; j++) {
                    if (i === j) continue;
                    const p2 = positions[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.hypot(dx, dy) + 0.1;
                    const repel = (100 / dist) * (1 / dist); // Stronger close repel
                    fx += dx * repel;
                    fy += dy * repel;
                }

                // Attract within group (author/series)
                const group = Object.values(groups).find(g => g.includes(i));
                if (group) {
                    group.forEach(j => {
                        if (i === j) return;  // just skip this iteration
                        const p2 = positions[j];
                        const dx = p2.x - p.x;
                        const dy = p2.y - p.y;
                        const dist = Math.hypot(dx, dy) + 0.1;
                        const attract = (dist / 200) * mass;
                        fx += dx * attract;
                        fy += dy * attract;
                    });
                }

                // Apply forces, dampen, bound
                p.x += fx * 0.05;
                p.y += fy * 0.05;
                p.x = Math.max(40, Math.min(w - 40, p.x));
                p.y = Math.max(40, Math.min(h - 40, p.y));
            });
        }
    }

    return positions;
}

function renderConstellation(force = false) {
    if (!constellationCtx || !constellationCanvas) return;

    const w = constellationCanvas.width / devicePixelRatio;
    const h = constellationCanvas.height / devicePixelRatio;

    // Background - space
    constellationCtx.fillStyle = '#000814';
    constellationCtx.fillRect(0, 0, w, h);

    // Tiny background stars
    constellationCtx.fillStyle = '#ffffff';
    for (let i = 0; i < 200; i++) { // More but softer
        const x = Math.random() * w;
        const y = Math.random() * h;
        const size = Math.random() * 1.5 + 0.5;
        constellationCtx.globalAlpha = Math.random() * 0.4 + 0.2;
        constellationCtx.fillRect(x, y, size, size);
}
    constellationCtx.globalAlpha = 1;

    if (constellationBooks.length === 0) {
        constellationCtx.fillStyle = '#666';
        constellationCtx.font = '18px Roboto';
        constellationCtx.textAlign = 'center';
        constellationCtx.fillText('No finished books yet...', w/2, h/2);
        return;
    }

    const positions = calculatePositions(settings.constellation.mode);
    const tooltip = document.getElementById(CONSTELLATION_TOOLTIP_ID);

    // Draw connections first (behind stars)
    if (settings.constellation.showAuthorLines) {
    for (let i = 0; i < constellationBooks.length; i++) {
        for (let j = i + 1; j < constellationBooks.length; j++) {
            const b1 = constellationBooks[i];
            const b2 = constellationBooks[j];
            const p1 = positions[i];
            const p2 = positions[j];
            if (b1.author && b1.author === b2.author) {
                drawConnection(constellationCtx, p1.x, p1.y, p2.x, p2.y, false);
            }
        }
    }
}
if (settings.constellation.showSeriesLines) {
    for (let i = 0; i < constellationBooks.length; i++) {
        for (let j = i + 1; j < constellationBooks.length; j++) {
            const b1 = constellationBooks[i];
            const b2 = constellationBooks[j];
            const p1 = positions[i];
            const p2 = positions[j];
            if (b1.series && b1.series === b2.series) {
                drawConnection(constellationCtx, p1.x, p1.y, p2.x, p2.y, true);
            }
        }
    }
}

    // Draw stars
    constellationBooks.forEach((book, i) => {
        const {x, y} = positions[i];
        const size = getStarSize(book.pages);
        const color = getStarColor(book.rating);
        const glow = settings.constellation.showFavoritesGlow && book.isFavorite;

        drawStar(constellationCtx, x, y, size, color, glow);

        // Hit area for hover/click
        constellationCtx.save();
        constellationCtx.beginPath();
        constellationCtx.arc(x, y, size + 8, 0, Math.PI * 2);
        constellationCtx.restore();
    });

    // Hover effect
    constellationCanvas.onmousemove = (e) => {
        const rect = constellationCanvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (constellationCanvas.width / rect.width) / devicePixelRatio;
        const my = (e.clientY - rect.top) * (constellationCanvas.height / rect.height) / devicePixelRatio;

        hoveredBook = null;
        for (let i = 0; i < constellationBooks.length; i++) {
            const {x, y} = positions[i];
            const size = getStarSize(constellationBooks[i].pages) + 8;
            if (Math.hypot(mx - x, my - y) < size) {
                hoveredBook = constellationBooks[i];
                break;
            }
        }

        if (hoveredBook) {
            tooltip.style.display = 'block';
            const rect = constellationCanvas.getBoundingClientRect();
            const tooltipWidth = tooltip.offsetWidth || 200;  // fallback if not yet rendered
            tooltip.style.left = (e.clientX - tooltipWidth / 2) + 'px';           // center horizontally
            tooltip.style.top = (e.clientY - 50) + 'px';                          // ~50px above cursor
            tooltip.innerHTML = `
                <strong>${hoveredBook.title}</strong><br>
                ${hoveredBook.author}<br>
                Rating: ${hoveredBook.rating || '—'} • Pages: ${hoveredBook.pages || '?'}
            `;
        } else {
            tooltip.style.display = 'none';
        }
    };

    constellationCanvas.onclick = (e) => {
        if (hoveredBook) {
            editingBook = hoveredBook;
            openEditModal(); // from books.js
        }
    };

    constellationCanvas.onmouseleave = () => {
        tooltip.style.display = 'none';
        hoveredBook = null;
    };
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Export for ui-core.js
window.initConstellation = initConstellation;
window.renderConstellation = renderConstellation;
window.prepareConstellationData = prepareConstellationData;

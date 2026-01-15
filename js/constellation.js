// js/constellation.js - Reading Constellation visualization

const CONSTELLATION_CANVAS_ID = 'constellationCanvas';
const CONSTELLATION_TOOLTIP_ID = 'constellationTooltip';

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
    if (!pages || pages < 1) return 5;
    return 4 + Math.sqrt(pages / 30) * 2; // ~4–18 px range
}

function getStarColor(rating) {
    const idx = Math.round(rating || 0);
    return ratingColors[Math.min(idx, 5)];
}

function drawStar(ctx, cx, cy, size, color, glow = false) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.closePath();

    // Base subtle glow for all stars (twinkle effect)
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 4;

    if (glow) {
        // Stronger glow for favorites
        ctx.shadowColor = '#ffd700'; // Goldish for visibility
        ctx.shadowBlur = 20; // More pronounced
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    ctx.fillStyle = color;
    ctx.fill();

    ctx.shadowBlur = 0; // Reset
    ctx.restore();
}

function drawConnection(ctx, x1, y1, x2, y2, isSeries = false) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = isSeries ? '#66a3ff' : '#cccccc'; // Blueish for series, gray for author
    ctx.lineWidth = isSeries ? 1.2 : 0.6; // Thicker for series
    ctx.setLineDash(isSeries ? [4, 6] : []); // Dashed only for series
    ctx.globalAlpha = 0.35; // Softer to avoid clutter
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
}

function calculatePositions(mode) {
    const w = constellationCanvas.width / devicePixelRatio;
    const h = constellationCanvas.height / devicePixelRatio;
    const positions = new Array(constellationBooks.length);

    if (mode === 'timeline') {
        if (constellationBooks.length === 0) return positions;
        const minTime = Math.min(...constellationBooks.map(b => b.lastFinished));
        const maxTime = Math.max(...constellationBooks.map(b => b.lastFinished));
        const timeRange = maxTime - minTime || 1;
        constellationBooks.forEach((book, i) => {
            const x = 40 + ((book.lastFinished - minTime) / timeRange) * (w - 80);
            const y = h * 0.2 + Math.sin(i * 0.7) * 60 + (book.rating || 2.5) * 30;
            positions[i] = {x, y};
        });
    } else if (mode === 'rating-pages') {
        const maxPages = Math.max(...constellationBooks.map(b => b.pages || 100), 100);
        constellationBooks.forEach((book, i) => {
            const x = 40 + ((book.pages || 100) / maxPages) * (w - 80);
            const y = h - 40 - ((book.rating || 0) / 5) * (h - 80);
            positions[i] = {x, y};
        });
    } else { // random constellation
        const placed = [];
        constellationBooks.forEach((book, i) => {
            let attempts = 0;
            let x, y;
            do {
                x = Math.random() * (w - 80) + 40;
                y = Math.random() * (h - 80) + 40;
                attempts++;
            } while (placed.some(p => Math.hypot(p.x - x, p.y - y) < 45) && attempts < 80);

            placed.push({x, y});
            positions[i] = {x, y};
        });
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
    for (let i = 0; i < 120; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        constellationCtx.globalAlpha = Math.random() * 0.5 + 0.3;
        constellationCtx.fillRect(x, y, 1, 1);
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
            tooltip.style.left = (e.clientX + 15) + 'px';
            tooltip.style.top = (e.clientY + 15) + 'px';
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

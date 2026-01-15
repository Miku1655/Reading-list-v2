const CONSTELLATION_CANVAS_ID = 'constellationCanvas';
const CONSTELLATION_TOOLTIP_ID = 'constellationTooltip';

let constellationCanvas = null;
let constellationCtx = null;
let constellationBooks = [];
let hoveredBook = null;

const ratingColors = [
    '#a0a0a0',     // 0 / unrated
    '#87ceeb',     // 1
    '#add8e6',     // 2
    '#f0f8ff',     // 3
    '#fffacd',     // 4
    '#ffd700'      // 5
];

function initConstellation() {
    constellationCanvas = document.getElementById(CONSTELLATION_CANVAS_ID);
    if (!constellationCanvas) {
        console.warn('Constellation canvas not found');
        return;
    }
    constellationCtx = constellationCanvas.getContext('2d');
    if (!constellationCtx) {
        console.error('Failed to get 2D context');
        return;
    }

    if (!settings) settings = {};
    if (!settings.constellation) {
        settings.constellation = {
            mode: 'constellation',  // Default to improved random
            showSeriesLines: true,
            showAuthorLines: true,
            showFavoritesGlow: true
        };
    }

    const modeSelect = document.getElementById('constellationMode');
    const seriesChk = document.getElementById('showSeriesLines');
    const authorChk = document.getElementById('showAuthorLines');
    const glowChk = document.getElementById('showFavoritesGlow');

    if (modeSelect) modeSelect.value = settings.constellation.mode;
    if (seriesChk) seriesChk.checked = settings.constellation.showSeriesLines;
    if (authorChk) authorChk.checked = settings.constellation.showAuthorLines;
    if (glowChk) glowChk.checked = settings.constellation.showFavoritesGlow;

    document.getElementById('constellationMode')?.addEventListener('change', updateConstellationSettings);
    document.getElementById('showSeriesLines')?.addEventListener('change', updateConstellationSettings);
    document.getElementById('showAuthorLines')?.addEventListener('change', updateConstellationSettings);
    document.getElementById('showFavoritesGlow')?.addEventListener('change', updateConstellationSettings);
    document.getElementById('redrawConstellation')?.addEventListener('click', () => renderConstellation(true));

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
    localStorage.setItem('settings', JSON.stringify(settings));
    renderConstellation();
}

function resizeConstellationCanvas() {
    if (!constellationCanvas) return;
    const container = constellationCanvas.parentElement;
    if (!container) return;

    constellationCanvas.width = container.clientWidth * devicePixelRatio;
    constellationCanvas.height = container.clientHeight * devicePixelRatio;
    constellationCanvas.style.width = container.clientWidth + 'px';
    constellationCanvas.style.height = container.clientHeight + 'px';
    constellationCtx.scale(devicePixelRatio, devicePixelRatio);

    renderConstellation();
}

function prepareConstellationData() {
    if (!books) {
        console.warn('books array not available');
        constellationBooks = [];
        return;
    }
    constellationBooks = books
        .filter(b => b.exclusiveShelf === 'read' && b.reads?.some(r => r.finished))
        .map(b => ({
            ...b,
            finishedDates: b.reads.filter(r => r.finished).map(r => r.finished),
            lastFinished: Math.max(...b.reads.filter(r => r.finished).map(r => r.finished || 0)),
            isFavorite: profile?.favourites?.includes(b.importOrder) || false
        }));
}

function getStarSize(pages) {
    if (!pages || pages < 1) return 1;  // Tiny specks
    return 1 + Math.pow(pages / 50, 0.7) * 4;  // Aggressive: 50p≈1.5px, 500p≈10px, 1200p≈20px, 3000p≈30px
}

function getStarColor(rating) {
    const idx = Math.round(rating || 0);
    return ratingColors[Math.min(idx, 5)];
}

function drawStar(cx, cy, size, color, glow = false) {
    if (!constellationCtx) return;

    constellationCtx.save();
    constellationCtx.beginPath();
    constellationCtx.arc(cx, cy, size, 0, Math.PI * 2);
    constellationCtx.closePath();

    constellationCtx.shadowColor = '#ffffff';
    constellationCtx.shadowBlur = 3 + size / 5;  // Scale glow with size for depth

    if (glow) {
        constellationCtx.shadowColor = '#ffd700';
        constellationCtx.shadowBlur = 25 + size / 3;  // Stronger, size-scaled
    }

    constellationCtx.globalAlpha = 0.8 + Math.random() * 0.2;  // Slight opacity jitter for twinkle
    constellationCtx.fillStyle = color;
    constellationCtx.fill();

    constellationCtx.globalAlpha = 1;
    constellationCtx.shadowBlur = 0;
    constellationCtx.restore();
}

function drawConnection(x1, y1, x2, y2, isSeries = false) {
    if (!constellationCtx) return;

    constellationCtx.beginPath();
    constellationCtx.moveTo(x1, y1);
    // Curved for natural flow: midpoint control point with offset
    const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * 30;
    const my = (y1 + y2) / 2 + (Math.random() - 0.5) * 30;
    constellationCtx.quadraticCurveTo(mx, my, x2, y2);

    constellationCtx.strokeStyle = isSeries ? '#66a3ff' : '#cccccc';
    constellationCtx.lineWidth = isSeries ? 1.4 : 0.7;
    constellationCtx.setLineDash(isSeries ? [3, 7] : []);
    constellationCtx.globalAlpha = 0.25 + Math.random() * 0.1;  // Faint, varied
    constellationCtx.stroke();
    constellationCtx.setLineDash([]);
    constellationCtx.globalAlpha = 1;
}

function calculatePositions(mode) {
    if (!constellationCanvas) return [];
    const w = constellationCanvas.width / devicePixelRatio;
    const h = constellationCanvas.height / devicePixelRatio;
    // Start in central cloud for better distribution
    let positions = constellationBooks.map(() => ({
        x: w / 2 + (Math.random() - 0.5) * w / 3,
        y: h / 2 + (Math.random() - 0.5) * h / 3
    }));

    if (mode === 'timeline') {
        const minTime = Math.min(...constellationBooks.map(b => b.lastFinished || 0));
        const maxTime = Math.max(...constellationBooks.map(b => b.lastFinished || 0));
        const timeRange = maxTime - minTime || 1;
        positions = constellationBooks.map((book, i) => {
            const baseX = 20 + ((book.lastFinished - minTime) / timeRange) * (w - 40);
            const jitterX = Math.sin(i * 0.4) * 60 + (Math.random() - 0.5) * 40;
            const baseY = 20 + (book.rating || 2.5) / 5 * (h - 40);  // Full height spread
            const jitterY = Math.cos(i * 0.6) * 100 + (Math.random() - 0.5) * 80;
            return {x: baseX + jitterX, y: baseY + jitterY};
        });
    } else if (mode === 'rating-pages') {
        const maxPages = Math.max(...constellationBooks.map(b => b.pages || 100), 100);
        const logMax = Math.log(maxPages + 1);  // Log scale for spread
        positions = constellationBooks.map(book => {
            const logPages = Math.log((book.pages || 100) + 1);
            const baseX = 20 + (logPages / logMax) * (w - 40);  // Even spread for short/long
            const jitterX = (Math.random() - 0.5) * 100;
            const baseY = h - 20 - ((book.rating || 0) / 5) * (h - 40);
            const jitterY = (Math.random() - 0.5) * 120;
            return {x: baseX + jitterX, y: baseY + jitterY};
        });
    } else {  // Constellation mode: natural clusters
        const groups = {};
        constellationBooks.forEach((b, i) => {
            const key = (b.series || '') + '|' + (b.author || '') + '|' + (b.genre || '') + '|' + (b.country || '');
            if (!groups[key]) groups[key] = [];
            groups[key].push(i);
        });

        for (let iter = 0; iter < 20; iter++) {  // More iterations for smoothness
            constellationBooks.forEach((book, i) => {
                let fx = 0, fy = 0;
                const p = positions[i];
                const mass = getStarSize(book.pages) / 5;  // Amplified mass influence

                // Stronger repulsion with randomness
                for (let j = 0; j < constellationBooks.length; j++) {
                    if (i === j) continue;
                    const p2 = positions[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.hypot(dx, dy) + 0.01;
                    const repel = (180 / dist) * (1 / dist) * (1 + Math.random() * 0.5);  // Varied, stronger
                    fx += dx * repel;
                    fy += dy * repel;
                }

                // Attraction: tighter for series, looser for author/genre
                const group = Object.values(groups).find(g => g.includes(i));
                if (group) {
                    group.forEach(j => {
                        if (i === j) return;
                        const p2 = positions[j];
                        const dx = p2.x - p.x;
                        const dy = p2.y - p.y;
                        const dist = Math.hypot(dx, dy) + 0.01;
                        const attractStrength = constellationBooks[i].series === constellationBooks[j].series ? 0.8 : 0.4;  // Tighter series
                        const attract = (dist / 150) * mass * attractStrength * (1 + Math.random() * 0.3);  // Varied pull
                        fx += dx * attract;
                        fy += dy * attract;
                    });
                }

                // Apply with damping + slight random drift for organic feel
                p.x += fx * 0.03 + (Math.random() - 0.5) * 2;
                p.y += fy * 0.03 + (Math.random() - 0.5) * 2;
                p.x = Math.max(20, Math.min(w - 20, p.x));
                p.y = Math.max(20, Math.min(h - 20, p.y));
            });
        }
    }

    return positions;
}

function renderConstellation(force = false) {
    if (!constellationCtx || !constellationCanvas) return;

    const w = constellationCanvas.width / devicePixelRatio;
    const h = constellationCanvas.height / devicePixelRatio;

    // Background: subtle milky way gradient + stars
    const gradient = constellationCtx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h)/2);
    gradient.addColorStop(0, '#001f3f');  // Deep navy center
    gradient.addColorStop(1, '#000814');  // Darker edges
    constellationCtx.fillStyle = gradient;
    constellationCtx.fillRect(0, 0, w, h);

    // Background stars: clustered in "bands"
    constellationCtx.fillStyle = '#ffffff';
    for (let i = 0; i < 400; i++) {  // More for density
        const clusterX = w / 2 + (Math.random() - 0.5) * w / 2;  // Bias to center band
        const x = clusterX + (Math.random() - 0.5) * 100;
        const y = Math.random() * h;
        const size = Math.random() * 2 + 0.5;
        constellationCtx.globalAlpha = Math.random() * 0.5 + 0.3;
        constellationCtx.fillRect(x, y, size, size);
    }
    constellationCtx.globalAlpha = 1;

    if (constellationBooks.length === 0) {
        constellationCtx.fillStyle = '#888';
        constellationCtx.font = '20px Roboto';
        constellationCtx.textAlign = 'center';
        constellationCtx.fillText('No finished books yet... Add some to light up the sky!', w/2, h/2);
        return;
    }

    const positions = calculatePositions(settings.constellation.mode);
    const tooltip = document.getElementById(CONSTELLATION_TOOLTIP_ID);

    // Draw connections
    if (settings.constellation.showAuthorLines) {
        for (let i = 0; i < constellationBooks.length; i++) {
            for (let j = i + 1; j < constellationBooks.length; j++) {
                const b1 = constellationBooks[i];
                const b2 = constellationBooks[j];
                const p1 = positions[i];
                const p2 = positions[j];
                if (b1.author && b1.author === b2.author) {
                    drawConnection(p1.x, p1.y, p2.x, p2.y, false);
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
                    drawConnection(p1.x, p1.y, p2.x, p2.y, true);
                }
            }
        }
    }

    // Draw stars
    constellationBooks.forEach((book, i) => {
        const {x, y} = positions[i];
        const size = getStarSize(book.pages) * (0.9 + Math.random() * 0.2);  // Jitter for variety
        const color = getStarColor(book.rating);
        const glow = settings.constellation.showFavoritesGlow && book.isFavorite;
        drawStar(x, y, size, color, glow);
    });

    // Hover & click
    constellationCanvas.onmousemove = (e) => {
        const rect = constellationCanvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (constellationCanvas.width / rect.width) / devicePixelRatio;
        const my = (e.clientY - rect.top) * (constellationCanvas.height / rect.height) / devicePixelRatio;

        hoveredBook = null;
        for (let i = 0; i < constellationBooks.length; i++) {
            const {x, y} = positions[i];
            const size = getStarSize(constellationBooks[i].pages) + 10;
            if (Math.hypot(mx - x, my - y) < size) {
                hoveredBook = constellationBooks[i];
                break;
            }
        }

        if (hoveredBook) {
            tooltip.style.display = 'block';
            const tooltipWidth = tooltip.offsetWidth || 200;
            tooltip.style.left = (e.clientX - tooltipWidth / 2) + 'px';
            tooltip.style.top = (e.clientY) + 'px';
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
            openEditModal();
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

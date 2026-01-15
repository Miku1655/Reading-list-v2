const CONSTELLATION_CANVAS_ID = 'constellationCanvas';
const CONSTELLATION_TOOLTIP_ID = 'constellationTooltip';

let constellationCanvas = null;
let constellationCtx = null;
let constellationBooks = [];
let hoveredBook = null;

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
    if (!pages || pages < 50) return 0.8 + Math.random() * 0.6;       // tiny faint stars
    if (pages < 200) return 1.2 + Math.random() * 0.8;
    if (pages < 500) return 2.0 + Math.random() * 1.2;
    if (pages < 1000) return 3.5 + Math.random() * 2;
    if (pages < 1500) return 5 + Math.random() * 4;
    return 10 + Math.random() * 8;   // only the real epics are noticeably bigger
}

function getStarColor(rating) {
    // Almost all white, just very subtle tint
    const base = 0.9 + rating/50;   // 0.9–1.0 brightness
    if (rating <= 1) return `rgba(220,220,255,${base})`;  // very cool blue-white
    if (rating <= 3) return `rgba(255,255,255,${base})`;  // pure white
    return `rgba(255,245,220,${base})`;                    // very faint warm tint for 4–5
}
function drawStar(cx, cy, size, color, glow = false) {
    if (!constellationCtx) return;

    constellationCtx.save();
    constellationCtx.globalAlpha = 0.7 + Math.random() * 0.3; // natural twinkling variation

    // Core star
    constellationCtx.beginPath();
    constellationCtx.arc(cx, cy, size, 0, Math.PI * 2);
    constellationCtx.fillStyle = color;
    constellationCtx.fill();

    // Very subtle halo/glow
    if (glow || size > 3) {
        constellationCtx.shadowColor = glow ? '#fff7d4' : '#ffffff';
        constellationCtx.shadowBlur = glow ? 12 : 6;
        constellationCtx.fillStyle = color;
        constellationCtx.fill();
    }

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
    constellationCtx.lineWidth = isSeries ? 0.9 : 0.5;
    constellationCtx.setLineDash(isSeries ? [3, 7] : []);
    constellationCtx.globalAlpha = 0.25 + Math.random() * 0.1;  // Faint, varied
    constellationCtx.stroke();
    constellationCtx.setLineDash([]);
    constellationCtx.globalAlpha = 0.12 + Math.random() * 0.08;
}

function calculatePositions(mode) {
    if (!constellationCanvas) return [];
    const w = constellationCanvas.width / devicePixelRatio;
    const h = constellationCanvas.height / devicePixelRatio;

    // === NEW: Start positions in a very loose, natural cloud ===
    let positions = constellationBooks.map(() => ({
        x: w * (0.2 + Math.random() * 0.6),           // mostly middle 60%, not corners
        y: h * (0.15 + Math.random() * 0.7)
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
            const key = (b.series || '') + '|' + (b.author || '');
            if (!groups[key]) groups[key] = [];
            groups[key].push(i);
        });

        const centerX = w / 2;
        const centerY = h / 2;

        // === Gentle multi-step relaxation (not full physics sim) ===
        for (let iter = 0; iter < 12; iter++) {   // fewer iterations = less clumping
            constellationBooks.forEach((book, i) => {
                let fx = 0, fy = 0;
                const p = positions[i];
                const mass = Math.sqrt(getStarSize(book.pages));  // sqrt so big books still stand out, but don't dominate

                // 1. Very gentle repulsion (only when too close)
                for (let j = 0; j < constellationBooks.length; j++) {
                    if (i === j) continue;
                    const p2 = positions[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > 0 && dist < 120) {   // only repel when fairly close
                        const repel = (120 - dist) / 120 * 0.8;
                        fx += dx * repel;
                        fy += dy * repel;
                    }
                }

                // 2. Soft attraction only for meaningful groups (series > author)
                const group = groups[Object.keys(groups).find(k => {
                    const ids = groups[k];
                    return ids.includes(i);
                })];
                if (group && group.length > 1) {
                    group.forEach(j => {
                        if (i === j) return;
                        const p2 = positions[j];
                        const dx = p2.x - p.x;
                        const dy = p2.y - p.y;
                        const dist = Math.hypot(dx, dy);
                        if (dist > 200) return;   // don't pull from too far
                        const strength = constellationBooks[i].series === constellationBooks[j].series ? 0.7 : 0.35;
                        const attract = (dist < 80 ? 0 : (dist - 80) / 300) * strength;
                        fx += dx * attract;
                        fy += dy * attract;
                    });
                }

                // 3. Very gentle drift toward center (prevents corners)
                const toCenterX = centerX - p.x;
                const toCenterY = centerY - p.y;
                const centerDist = Math.hypot(toCenterX, toCenterY);
                if (centerDist > 100) {
                    fx += toCenterX * 0.0008;
                    fy += toCenterY * 0.0008;
                }

                // Apply movement + tiny organic jitter
                p.x += fx * 0.8 + (Math.random() - 0.5) * 1.5;
                p.y += fy * 0.8 + (Math.random() - 0.5) * 1.5;
            });
        }

        // Final soft clamp – allow some to be near edge, but not stuck in corner
        positions.forEach(p => {
            p.x = Math.max(60, Math.min(w - 60, p.x));
            p.y = Math.max(60, Math.min(h - 60, p.y));
        });
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
            tooltip.style.top = (e.clientY - 190) + 'px';
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

// js/constellation.js - Reading Constellation visualization

const CONSTELLATION_CANVAS_ID = 'constellationCanvas';
const CONSTELLATION_TOOLTIP_ID = 'constellationTooltip';

let constellationCanvas = null;
let constellationCtx = null;
let constellationBooks = [];
let hoveredBook = null;
let cachedPositions = {}; // Cache: mode → positions array
let currentSunIndex = -1;

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
            mode: 'constellation',
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
    const oldMode = settings.constellation.mode;
    settings.constellation = {
        mode: document.getElementById('constellationMode').value,
        showSeriesLines: document.getElementById('showSeriesLines').checked,
        showAuthorLines: document.getElementById('showAuthorLines').checked,
        showFavoritesGlow: document.getElementById('showFavoritesGlow').checked
    };
    localStorage.setItem('settings', JSON.stringify(settings));
    if (oldMode !== settings.constellation.mode) {
        delete cachedPositions[oldMode];
    }
    renderConstellation(oldMode !== settings.constellation.mode);
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
            isFavorite: profile?.favourites?.includes(b.importOrder) ||
            (b.series && profile?.favouriteSeries?.includes(b.series)) || false
        }));
}

function getStarSize(pages) {
    if (!pages || pages < 50) return 0.8 + Math.random() * 0.6;
    if (pages < 200) return 1.2 + Math.random() * 0.8;
    if (pages < 500) return 2.0 + Math.random() * 1.2;
    if (pages < 1000) return 3.5 + Math.random() * 2;
    if (pages < 1500) return 5 + Math.random() * 4;
    return 10 + Math.random() * 8;
}

function getStarColor(rating) {
    const base = 0.9 + rating / 50;
    if (rating <= 1) return `rgba(220,220,255,${base})`;
    if (rating <= 3) return `rgba(255,255,255,${base})`;
    return `rgba(255,245,220,${base})`;
}

function drawStar(cx, cy, size, color, glow = false) {
    if (!constellationCtx) return;
    constellationCtx.save();

    // Core star (slightly brighter for favourites)
    constellationCtx.globalAlpha = 0.8 + Math.random() * 0.2;
    constellationCtx.beginPath();
    constellationCtx.arc(cx, cy, size, 0, Math.PI * 2);
    constellationCtx.fillStyle = glow ? '#ffffff' : color; // pure white for favourites to stand out
    constellationCtx.fill();

    // Base subtle halo for all larger stars
    if (size > 3) {
        constellationCtx.shadowColor = '#ffffff';
        constellationCtx.shadowBlur = 8;
        constellationCtx.fillStyle = color;
        constellationCtx.fill();
    }

    // Stronger, more visible glow + pulse for favourites (individual or series)
    if (glow) {
        // Outer glowing ring (bigger and brighter)
        constellationCtx.shadowColor = '#ffeb3b'; // golden
        constellationCtx.shadowBlur = 40 + Math.sin(Date.now() / 800) * 10; // stronger pulse range
        constellationCtx.fillStyle = 'rgba(255, 235, 59, 0.5)'; // more opaque yellow
        constellationCtx.beginPath();
        constellationCtx.arc(cx, cy, size * 2.5, 0, Math.PI * 2); // much larger halo
        constellationCtx.fill();

        // Inner bright core pulse (makes it pop)
        constellationCtx.shadowColor = '#ffffff';
        constellationCtx.shadowBlur = 15 + Math.sin(Date.now() / 600) * 5;
        constellationCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        constellationCtx.beginPath();
        constellationCtx.arc(cx, cy, size * 1.2, 0, Math.PI * 2);
        constellationCtx.fill();
    }

    constellationCtx.restore();
}

function drawConnection(x1, y1, x2, y2, isSeries = false) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const maxDist = isSeries ? 340 : 240;
    if (dist > maxDist) return;

    // Control points for smooth bezier curve
    const mx1 = x1 + dx * 0.3 + (Math.random() - 0.5) * 40;
    const my1 = y1 + dy * 0.3 + (Math.random() - 0.5) * 40;
    const mx2 = x1 + dx * 0.7 + (Math.random() - 0.5) * 40;
    const my2 = y1 + dy * 0.7 + (Math.random() - 0.5) * 40;

    constellationCtx.beginPath();
    constellationCtx.moveTo(x1, y1);
    constellationCtx.bezierCurveTo(mx1, my1, mx2, my2, x2, y2);

    if (isSeries) {
        constellationCtx.strokeStyle = '#88ccff';           // brighter cyan-blue
        constellationCtx.lineWidth = 1.4;                   // thicker
        constellationCtx.setLineDash([4, 8]);               // longer dashes
    } else {
        constellationCtx.strokeStyle = '#ccd6ff';           // soft lavender-white
        constellationCtx.lineWidth = 0.9;                   // slightly thicker
    }

    // Fade less aggressively – stays visible longer
    const alpha = 0.25 + 0.50 * (1 - dist / maxDist);   // 0.75 → 0.25 range
    constellationCtx.globalAlpha = alpha;
    constellationCtx.stroke();
    constellationCtx.setLineDash([]);
    constellationCtx.globalAlpha = 1;
}

function calculatePositions(mode) {
    if (!constellationCanvas) return [];
    const w = constellationCanvas.width / devicePixelRatio;
    const h = constellationCanvas.height / devicePixelRatio;

    let positions = constellationBooks.map(() => ({
        x: w * (0.2 + Math.random() * 0.6),
        y: h * (0.15 + Math.random() * 0.7)
    }));

    let sunIndex = -1;  // ← declare here, outside if/else
    let maxPages = 0;

    if (mode === 'timeline') {
        const minTime = Math.min(...constellationBooks.map(b => b.lastFinished || 0));
        const maxTime = Math.max(...constellationBooks.map(b => b.lastFinished || 0));
        const timeRange = maxTime - minTime || 1;
        positions = constellationBooks.map((book, i) => {
            const baseX = 20 + ((book.lastFinished - minTime) / timeRange) * (w - 40);
            const jitterX = Math.sin(i * 0.4) * 60 + (Math.random() - 0.5) * 40;
            const baseY = 20 + (book.rating || 2.5) / 5 * (h - 40);
            const jitterY = Math.cos(i * 0.6) * 100 + (Math.random() - 0.5) * 80;
            return {x: baseX + jitterX, y: baseY + jitterY};
        });
    } else if (mode === 'rating-pages') {
        const maxPages = Math.max(...constellationBooks.map(b => b.pages || 100), 100);
        const logMax = Math.log(maxPages + 1);
        positions = constellationBooks.map(book => {
            const logPages = Math.log((book.pages || 100) + 1);
            const baseX = 20 + (logPages / logMax) * (w - 40);
            const jitterX = (Math.random() - 0.5) * 100;
            const baseY = h - 20 - ((book.rating || 0) / 5) * (h - 40);
            const jitterY = (Math.random() - 0.5) * 120;
            return {x: baseX + jitterX, y: baseY + jitterY};
        });
    } else { // Constellation mode

    const groups = {};
    constellationBooks.forEach((b, i) => {
        const key = (b.series || '') + '|' + (b.author || '') + '|' + (b.country || '');
        if (!groups[key]) groups[key] = [];
        groups[key].push(i);
    });

    // Sun = max pages
    let maxPages = 0;
    let sunIndex = 0;
    constellationBooks.forEach((b, i) => {
        if (b.pages > maxPages) {
            maxPages = b.pages;
            sunIndex = i;
        }
    });

    const sortedByPages = [...constellationBooks].sort((a, b) => b.pages - a.pages);
    const planetCount = Math.max(3, Math.min(12, Math.round(constellationBooks.length * 0.22)));
    const planetIndices = sortedByPages.slice(0, planetCount).map(b => 
        constellationBooks.findIndex(bb => bb.importOrder === b.importOrder)
    );

    // Nicer initial placement
    positions = constellationBooks.map((_, i) => {
        if (i === sunIndex) {
            return { x: w / 2, y: h / 2 };
        }
        if (planetIndices.includes(i)) {
            // Planets in wider, more elegant orbits
            const angle = Math.random() * Math.PI * 2;
            const radius = 110 + Math.random() * 240; // wider spread
            return {
                x: w / 2 + Math.cos(angle) * radius,
                y: h / 2 + Math.sin(angle) * radius
            };
        }
        // Others: gentle spiral/cloud feel instead of pure random square
        const t = Math.random() * 7;
        const r = 50 + Math.sqrt(t) * 150;
        const theta = t * 2.1 + Math.random() * 0.7;
        return {
            x: w / 2 + Math.cos(theta) * r + (Math.random() - 0.5) * 90,
            y: h / 2 + Math.sin(theta) * r + (Math.random() - 0.5) * 90
        };
    });

    const aspectRatio = w / h;
    const borderStrength = 0.20 * (aspectRatio > 1 ? aspectRatio : 1 / aspectRatio);

    // Smoother physics with more iterations and damping
    const iterations = 30;
    const damping   = 0.58;

    for (let iter = 0; iter < iterations; iter++) {
        constellationBooks.forEach((book, i) => {
            if (i === sunIndex) return;
            let fx = 0, fy = 0;
            const p = positions[i];
            const mass = getStarSize(book.pages) / 8;

            // Repulsion – gentler within same series/author
            for (let j = 0; j < constellationBooks.length; j++) {
                if (i === j) continue;
                const p2 = positions[j];
                const dx = p.x - p2.x;
                const dy = p.y - p2.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 160) {
                    const isSameSeries = book.series === constellationBooks[j].series;
                    const isSameAuthor = book.author === constellationBooks[j].author;
                    let repel = (160 - dist) / 160;
                    if (isSameSeries)  repel *= 0.22;   // much softer clustering
                    if (isSameAuthor)  repel *= 0.55;
                    const strength = dist < 75 ? 1.35 : 0.85;
                    const force = repel * strength;
                    fx += dx * force;
                    fy += dy * force;
                }
            }

            // Group attraction – stronger for series
            const group = Object.values(groups).find(g => g.includes(i));
            if (group && group.length > 1) {
                group.forEach(j => {
                    if (i === j) return;
                    const p2 = positions[j];
                    const dx = p2.x - p.x;
                    const dy = p2.y - p.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > 280) return;
                    const strength = book.series === constellationBooks[j].series ? 2.3 : 0.65;
                    const attract = Math.max(0, (dist - 35) / 220) * strength;
                    fx += dx * attract;
                    fy += dy * attract;
                });
            }

            // Sun attraction
            const sunP = positions[sunIndex];
            const toSunX = sunP.x - p.x;
            const toSunY = sunP.y - p.y;
            const sunDist = Math.hypot(toSunX, toSunY);
            const sunStrength = planetIndices.includes(i) ? 0.88 : 0.38;
            const sunAttract = (sunDist / 320) * sunStrength * mass;
            fx += toSunX * sunAttract;
            fy += toSunY * sunAttract;

            // Planet-to-planet mild attraction (for regular books)
            if (!planetIndices.includes(i)) {
                planetIndices.forEach(j => {
                    if (i === j) return;
                    const p2 = positions[j];
                    const dx = p2.x - p.x;
                    const dy = p2.y - p.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > 380) return;
                    const attract = (380 - dist) / 380 * 0.14 * mass;
                    fx += dx * attract;
                    fy += dy * attract;
                });
            }

            // Border repulsion – slightly asymmetric & softer
            const margin = 150;
            const borderK = borderStrength;
            fx += Math.max(0, (margin - p.x)         / margin) * borderK * 55;
            fx -= Math.max(0, (margin - (w - p.x))   / margin) * borderK * 40; // weaker push from right
            fy += Math.max(0, (margin - p.y)         / margin) * borderK * 55;
            fy -= Math.max(0, (margin - (h - p.y))   / margin) * borderK * 45;

            // Apply with damping + very light organic jitter
            p.x += fx * damping + (Math.random() - 0.5) * 1.4;
            p.y += fy * damping + (Math.random() - 0.5) * 1.4;
        });
    }

    // Final gentle clamp with nicer randomization
    positions.forEach(p => {
        const padding = 22;
        if (p.x < padding)    p.x = padding    + Math.random() * 38;
        if (p.x > w - padding) p.x = w - padding - Math.random() * 38;
        if (p.y < padding)    p.y = padding    + Math.random() * 38;
        if (p.y > h - padding) p.y = h - padding - Math.random() * 38;
    });

    currentSunIndex = sunIndex;
    return positions;
}
}

function renderConstellation(force = false) {
    if (!constellationCtx || !constellationCanvas) return;

    const w = constellationCanvas.width / devicePixelRatio;
    const h = constellationCanvas.height / devicePixelRatio;

    constellationCtx.clearRect(0, 0, w, h);

    const gradient = constellationCtx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h)/2);
    gradient.addColorStop(0, '#001f3f');
    gradient.addColorStop(1, '#000814');
    constellationCtx.fillStyle = gradient;
    constellationCtx.fillRect(0, 0, w, h);

    // Milky Way band
    const milkyGradient = constellationCtx.createLinearGradient(0, h*0.3, 0, h*0.7);
    milkyGradient.addColorStop(0, 'rgba(40,20,80,0.12)');
    milkyGradient.addColorStop(0.5, 'rgba(100,60,180,0.25)');
    milkyGradient.addColorStop(1, 'rgba(40,20,80,0.12)');
    constellationCtx.fillStyle = milkyGradient;
    constellationCtx.fillRect(0, h*0.3, w, h*0.4);

    // Background tiny stars
    constellationCtx.fillStyle = '#ffffff';
    for (let i = 0; i < 600; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const size = Math.random() * 1.2 + 0.3;
        constellationCtx.globalAlpha = Math.random() * 0.3 + 0.2;
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

    let positions = cachedPositions[settings.constellation.mode];
    if (force || !positions) {
        positions = calculatePositions(settings.constellation.mode);
        cachedPositions[settings.constellation.mode] = positions;
    }

    const tooltip = document.getElementById(CONSTELLATION_TOOLTIP_ID);

    // Draw connections (only if close)
    if (settings.constellation.showAuthorLines) {
        for (let i = 0; i < constellationBooks.length; i++) {
            for (let j = i + 1; j < constellationBooks.length; j++) {
                const b1 = constellationBooks[i];
                const b2 = constellationBooks[j];
                const p1 = positions[i];
                const p2 = positions[j];
                if (b1.author && b1.author === b2.author) {
                    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
                    if (dist > 200) continue; // max distance
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
                    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
                     if (dist > 320) continue; // max distance
                    drawConnection(p1.x, p1.y, p2.x, p2.y, true);
                }
            }
        }
    }

    // Draw stars
    // Draw stars
constellationBooks.forEach((book, i) => {
    const {x, y} = positions[i];
    let size = getStarSize(book.pages) * (0.9 + Math.random() * 0.2);
    const color = getStarColor(book.rating);
    const glow = settings.constellation.showFavoritesGlow && book.isFavorite;

    // Sun is 1.5× bigger + extra warm glow
    if (i === currentSunIndex) {
        size *= 1.5;
        // Extra sun-specific warm halo (even without glow toggle)
        constellationCtx.shadowColor = '#ffd700'; // bright gold
        constellationCtx.shadowBlur = 50 + Math.sin(Date.now() / 700) * 15;
        constellationCtx.fillStyle = 'rgba(255, 215, 0, 0.45)';
        constellationCtx.beginPath();
        constellationCtx.arc(x, y, size * 1.9, 0, Math.PI * 2);
        constellationCtx.fill();
    }

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
            tooltip.style.top = (e.clientY - 180) + 'px'; // better position, adjust if needed
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

window.initConstellation = initConstellation;
window.renderConstellation = renderConstellation;
window.prepareConstellationData = prepareConstellationData;

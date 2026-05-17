// js/share.js — Public list sharing via Firebase

const SHARE_KEY = "reading_share_id";

async function generateShareLink() {
    if (!currentUser) {
        alert("You need to be signed in to Firebase to create a share link.");
        return;
    }

    const shareId = currentUser.uid;

    const publicBooks = books.map(b => ({
        title:          b.title,
        author:         b.author,
        series:         b.series         || null,
        seriesNumber:   b.seriesNumber   ?? null,
        rating:         b.rating         || 0,
        pages:          b.pages          || 0,
        year:           b.year           || null,
        exclusiveShelf: b.exclusiveShelf,
        shelves:        b.shelves        || [],
        language:       b.language       || null,
        country:        b.country        || null,
        genre:          b.genre          || null,
        tags:           b.tags           || [],
        notes:          b.notes          || null,
        emojis:         b.emojis         || [],
        altTitles:      b.altTitles      || {},
        reads:          b.reads          || [],
        importOrder:    b.importOrder,
        dateAdded:      b.dateAdded      || null,
        // Skip data: URIs — too large for Firebase and won't transfer usefully
        coverUrl: (b.coverUrl && !b.coverUrl.startsWith("data:")) ? b.coverUrl : null
    }));

    // Build a clean profile object — always include nick, bio, favourites, favouriteSeries
    // Skip data: URI profile pictures (too large for Firebase)
    const publicProfile = {
        nick:            profile.nick             || "",
        bio:             profile.bio              || "",
        favourites:      profile.favourites       || [],
        favouriteSeries: profile.favouriteSeries  || [],
        picture: (profile.picture && !profile.picture.startsWith("data:"))
            ? profile.picture : null
    };

    const publicData = {
        books:   publicBooks,
        profile: publicProfile,
        goals:   goals        || {},
        sharedAt: Date.now()
    };

    try {
        await db.ref("public/" + shareId).set(publicData);

        // Keep the search profile index in sync with updated booksCount
        await publishProfile?.();

        const url = `${location.origin}${location.pathname}?view=${shareId}`;
        localStorage.setItem(SHARE_KEY, shareId);
        updateShareUI(url);

        try {
            await navigator.clipboard.writeText(url);
            alert(`Share link copied to clipboard!\n\n${url}\n\nAnyone with this link can view your list in read-only mode.`);
        } catch {
            prompt("Copy this share link:", url);
        }
    } catch (err) {
        alert("Failed to create share link: " + err.message);
    }
}

async function revokeShareLink() {
    const shareId = localStorage.getItem(SHARE_KEY);
    if (!shareId) return;
    if (!currentUser) { alert("Sign in first."); return; }
    if (!confirm("Revoke share link? Anyone using it will lose access.")) return;

    try {
        await db.ref("public/" + shareId).remove();
        localStorage.removeItem(SHARE_KEY);
        updateShareUI(null);
        alert("Share link revoked.");
    } catch (err) {
        alert("Failed to revoke: " + err.message);
    }
}

function updateShareUI(url) {
    const revokeBtn = document.getElementById("revokeShareBtn");
    const container = document.getElementById("shareLinkContainer");
    const linkEl    = document.getElementById("currentShareLink");

    if (url) {
        if (revokeBtn) revokeBtn.style.display = "inline-block";
        if (container) container.style.display  = "block";
        if (linkEl)  { linkEl.href = url; linkEl.textContent = url; }
    } else {
        if (revokeBtn) revokeBtn.style.display = "none";
        if (container) container.style.display  = "none";
    }
}

async function loadSharedView(shareId) {
    const banner = document.getElementById("sharedViewBanner");

    try {
        const snap = await db.ref("public/" + shareId).once("value");
        const data = snap.val();

        if (!data) {
            if (banner) {
                banner.style.cssText = "display:block; background:#2a1a1a; border:1px solid #5a3a3a; color:#c66; padding:10px 16px; margin-bottom:12px; border-radius:6px; font-size:0.95em;";
                banner.innerHTML = "⚠ This share link is no longer valid or has been revoked.";
            }
            return false;
        }

        // Load shared data into global state
        books   = data.books || [];

        // Restore profile — always fall back gracefully so nick/bio/favourites all work
        profile = data.profile || {};
        if (!profile.favourites)      profile.favourites      = [];
        if (!profile.favouriteSeries) profile.favouriteSeries = [];

        // Restore reading goals if present (used in challenges/stats tab)
        goals = data.goals || {};

        shelfColors = {};

        const maxOrder  = books.reduce((m, b) => Math.max(m, b.importOrder || 0), 0);
        nextImportOrder = maxOrder + 1;

        const nick       = profile.nick || "Someone";
        const sharedDate = data.sharedAt
            ? new Date(data.sharedAt).toLocaleDateString()
            : "";

        if (banner) {
            banner.innerHTML = `
                👁 Viewing <strong>${nick}'s reading list</strong>
                <span style="color:#5a8a5a;">(read-only${sharedDate ? " · last updated " + sharedDate : ""})</span>
                &emsp;
                <a href="${location.origin}${location.pathname}"
                   style="color:#aaa; text-decoration:underline;">← Your own list</a>`;
            banner.style.display = "block";
        }

        // Flag checked by openEditModal to prevent any edits
        window.__sharedView = true;

        // Populate profile UI fields so the Profile tab renders correctly
        const nickEl = document.getElementById("profileNick");
        const bioEl  = document.getElementById("profileBio");
        const picEl  = document.getElementById("profilePic");
        if (nickEl) nickEl.value  = profile.nick  || "";
        if (bioEl)  bioEl.value   = profile.bio   || "";
        if (picEl && profile.picture) picEl.src   = profile.picture;

        // Hide controls that don't apply to a viewer
        [
            "#addBook",
            "#sortRecent",
            "#filterInfo",
            ".tab[data-tab='options']",
            ".tab[data-tab='challenges']",
            ".tab[data-tab='battle']",
            ".tab[data-tab='quotes']",
            ".tab[data-tab='search']"
        ].forEach(sel => {
            document.querySelectorAll(sel).forEach(el => el.style.display = "none");
        });

        populateShelfFilter();
        renderAll();
        return true;

    } catch (err) {
        if (banner) {
            banner.style.cssText = "display:block; background:#2a1a1a; border:1px solid #5a3a3a; color:#c66; padding:10px 16px; margin-bottom:12px; border-radius:6px; font-size:0.95em;";
            banner.innerHTML = `⚠ Failed to load shared list: ${err.message}`;
        }
        return false;
    }
}

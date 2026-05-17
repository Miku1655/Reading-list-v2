// js/profile-search.js
// Profile search and privacy — searchable public index at profiles/{uid}

// ── Publish / unpublish ───────────────────────────────────────────────────────

async function publishProfile() {
    if (!currentUser) return;

    if (!profileSearchable) {
        // Remove from search index; share link at public/{uid} is unaffected
        await db.ref("profiles/" + currentUser.uid).remove();
        return;
    }

    const readBooks = books.filter(b => b.exclusiveShelf === "read");
    const nick = profile.nick?.trim() || "Anonymous";

    await db.ref("profiles/" + currentUser.uid).set({
        nick:       nick,
        nickLower:  nick.toLowerCase(),
        bio:        profile.bio?.trim() || "",
        picture:    (profile.picture && !profile.picture.startsWith("data:"))
                        ? profile.picture : null,
        booksCount: readBooks.length,
        updatedAt:  Date.now(),
        searchable: true
    });
}

// ── Search ────────────────────────────────────────────────────────────────────

async function searchProfiles(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null; // null = too short (distinct from empty results)

    const snap = await db.ref("profiles")
        .orderByChild("nickLower")
        .startAt(q)
        .endAt(q + "\uf8ff")
        .limitToFirst(20)
        .once("value");

    const results = [];
    snap.forEach(child => {
        // Exclude own profile from results
        if (currentUser && child.key === currentUser.uid) return;
        results.push({ uid: child.key, ...child.val() });
    });
    return results;
}

// ── View a found profile ──────────────────────────────────────────────────────

async function viewFoundProfile(uid) {
    const resultsEl = document.getElementById("profileSearchResults");

    // Show loading state in the results area
    const loadingDiv = document.createElement("div");
    loadingDiv.style.cssText = "text-align:center; padding:24px; color:#aaa;";
    loadingDiv.textContent = "Loading profile…";
    if (resultsEl) {
        resultsEl.innerHTML = "";
        resultsEl.appendChild(loadingDiv);
    }

    const snap = await db.ref("public/" + uid).once("value");
    const data = snap.val();

    if (!data) {
        if (resultsEl) {
            resultsEl.innerHTML = `<p style="color:#c66; text-align:center; padding:20px;">
                This user hasn't generated a public share link yet, so their full list
                isn't available. They may still appear in search once they do.
            </p>`;
        }
        return;
    }

    // Reuse the existing share view pathway — it handles everything
    await loadSharedView(uid);
    switchTab("list");
}

// ── Render search results ─────────────────────────────────────────────────────

function renderSearchResults(results, query) {
    const container = document.getElementById("profileSearchResults");
    if (!container) return;

    if (results === null) {
        container.innerHTML = `<p style="color:#888; text-align:center; padding:16px;">
            Enter at least 2 characters to search.
        </p>`;
        return;
    }

    if (results.length === 0) {
        container.innerHTML = `<p style="color:#aaa; text-align:center; padding:24px;">
            No users found matching <strong style="color:#eee;">"${escapeSearchHtml(query)}"</strong>.
        </p>`;
        return;
    }

    let html = `<p style="color:#888; font-size:0.85em; margin-bottom:16px;">
        ${results.length} result${results.length !== 1 ? "s" : ""} for
        <strong style="color:#ccc;">"${escapeSearchHtml(query)}"</strong>
    </p>`;

    results.forEach(r => {
        const avatarHtml = r.picture
            ? `<img src="${escapeSearchHtml(r.picture)}" alt=""
                   style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid #444;flex-shrink:0;"
                   onerror="this.style.display='none'">`
            : `<div style="width:52px;height:52px;border-radius:50%;background:#333;border:2px solid #444;
                            display:flex;align-items:center;justify-content:center;font-size:1.4em;flex-shrink:0;">
                    📚
               </div>`;

        const bioHtml = r.bio
            ? `<div style="color:#aaa;font-size:0.85em;margin-top:4px;
                           white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:380px;">
                    ${escapeSearchHtml(r.bio.slice(0, 120))}${r.bio.length > 120 ? "…" : ""}
               </div>`
            : "";

        const booksHtml = r.booksCount > 0
            ? `<span style="font-size:0.8em;color:#8bc34a;margin-top:4px;display:block;">
                   📖 ${r.booksCount} book${r.booksCount !== 1 ? "s" : ""} read
               </span>`
            : "";

        html += `
            <div style="display:flex;align-items:center;gap:16px;padding:14px 16px;
                        background:#1a1a1a;border:1px solid #333;border-radius:8px;
                        margin-bottom:10px;">
                ${avatarHtml}
                <div style="flex:1;min-width:0;">
                    <strong style="font-size:1.05em;">${escapeSearchHtml(r.nick || "Anonymous")}</strong>
                    ${bioHtml}
                    ${booksHtml}
                </div>
                <button onclick="viewFoundProfile('${r.uid}')"
                        style="padding:7px 18px;background:#2a3a1a;border:1px solid #5a7a3a;
                               color:#8bc34a;border-radius:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;">
                    View profile
                </button>
            </div>`;
    });

    container.innerHTML = html;
}

// ── Render the Search tab itself ──────────────────────────────────────────────

function renderSearchTab() {
    // The static HTML is in index.html; this function handles dynamic state only.
    // Restore input value if any, keep results as-is.
    const input = document.getElementById("profileSearchInput");
    if (input) input.focus();
}

// ── Small helper (avoids pulling in the full escapeHtml from year-review) ────
function escapeSearchHtml(str) {
    if (!str) return "";
    const d = document.createElement("div");
    d.textContent = String(str);
    return d.innerHTML;
}

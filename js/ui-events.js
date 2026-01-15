// Core tab/button events
document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
document.getElementById("addBook").addEventListener("click", () => openEditModal());
document.getElementById("searchInput").addEventListener("input", renderTable);
document.getElementById("shelfFilter").addEventListener("change", renderTable);
document.getElementById("refreshWaitingBtn").addEventListener("click", renderWaitingWidget);
document.querySelectorAll("th[data-col]").forEach(th => th.addEventListener("click", () => {
    if (sortState.column === th.dataset.col) {
        sortState.direction *= -1;
    } else {
        sortState.column = th.dataset.col;
        sortState.direction = 1;
    }
    updateSortIndicators();
    renderTable();
}));
document.getElementById("sortRecent").addEventListener("click", () => {
    if (sortState.column === null) {
        sortState.direction *= -1;
    } else {
        sortState.column = null;
        sortState.direction = -1;
    }
    updateSortIndicators();
    renderTable();
});

// Close modal handlers
document.getElementById("closeEdit").addEventListener("click", () => {
    const collapsed = [];
    document.querySelectorAll(".edit-section").forEach((sec, idx) => {
        if (sec.classList.contains("collapsed")) collapsed.push(idx);
    });
    localStorage.setItem("reading_edit_collapsed_sections", JSON.stringify(collapsed));
    closeEditModal();
});
document.getElementById("editModal").addEventListener("click", e => {
    if (e.target === document.getElementById("editModal")) closeEditModal();
});

// Cloud sync buttons
// (all the cloud, covers, import/export, clear, goals, settings, profile, modal fetch, search info, auth — exact code from your ui.js, unchanged)

// Year in Review moved to ui-year-review.js

// Call init after DOM loaded
document.addEventListener("DOMContentLoaded", initApp);

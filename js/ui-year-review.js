// Year in Review modal listeners
document.getElementById("openYearReview").addEventListener("click", openYearReview);

document.getElementById("closeYearReview").addEventListener("click", () => {
    const modal = document.getElementById("yearReviewModal");
    modal.classList.remove('modal-visible');
    setTimeout(() => {
        modal.style.display = "none";
        tempCoverDataUrls = {}; // Clear memory
    }, 300);
});

document.getElementById("yearReviewModal").addEventListener("click", e => {
    if (e.target === document.getElementById("yearReviewModal")) {
        const modal = document.getElementById("yearReviewModal");
        modal.classList.remove('modal-visible');
        setTimeout(() => {
            modal.style.display = "none";
            tempCoverDataUrls = {};
        }, 300);
    }
});

document.getElementById("reviewYearSelect").addEventListener("change", async e => {
    tempCoverDataUrls = {};
    await generateYearReview(Number(e.target.value));
});

document.getElementById("exportReviewPNG").addEventListener("click", exportReviewAsPNG);

// Year in Review modal listeners
document.getElementById("openYearReview").addEventListener("click", openYearReview);
document.getElementById("closeYearReview").addEventListener("click", () => {
    document.getElementById("yearReviewModal").style.display = "none";
    tempCoverDataUrls = {}; // Clear memory
});
document.getElementById("yearReviewModal").addEventListener("click", e => {
    if (e.target === document.getElementById("yearReviewModal")) {
        document.getElementById("yearReviewModal").style.display = "none";
        tempCoverDataUrls = {};
    }
});
document.getElementById("reviewYearSelect").addEventListener("change", async e => {
    tempCoverDataUrls = {};
    await generateYearReview(Number(e.target.value));
});
document.getElementById("exportReviewPNG").addEventListener("click", exportReviewAsPNG);
document.getElementById("exportReviewPDF").addEventListener("click", exportReviewAsPDF);

function renderMap() {
    const svg = document.getElementById("worldMapSVG");
    if (!svg) return;

    const countriesRead = getCountriesRead();
    console.log("Detected read countries (keys should be CZ, JP, GB, FR, US):", Object.keys(countriesRead));

    const { read, total } = getCountryProgress();
    document.getElementById("mapProgress").innerHTML = 
        `Progress: <strong>${read} / ${total}</strong> countries (${Math.round(read/total*100)}%)`;

    const tooltip = document.getElementById("mapTooltip");

    // Debug: log some path ids to understand the SVG structure
    const allPaths = svg.querySelectorAll("path");
    console.log(`Total <path> elements found: ${allPaths.length}`);

    // Log first 5 and last 5 ids (to sample)
    const sampleIds = [];
    allPaths.forEach((p, i) => {
        if (i < 5 || i >= allPaths.length - 5) {
            const id = p.getAttribute("id") || "(no id)";
            sampleIds.push(`#${i}: id="${id}"`);
        }
    });
    console.log("Sample path ids:", sampleIds.join(" | "));

    // Specifically search for expected countries (case insensitive)
    ["cz", "jp", "gb", "fr", "us", "CZ", "JP", "GB", "FR", "US"].forEach(expected => {
        const found = svg.querySelector(`path[id="${expected}"]`) || svg.querySelector(`path[id="${expected.toUpperCase()}"]`);
        console.log(`Looking for ${expected.toUpperCase()}: ${found ? "FOUND" : "NOT FOUND"}`);
    });

    // Normal rendering loop (with normalization attempt)
    allPaths.forEach(path => {
        let id = path.getAttribute("id");
        if (!id || id.length !== 2) return;

        const upperId = id.toUpperCase();
        const data = countriesRead[upperId];

        if (data && data.count > 0) {
            console.log(`Coloring ${upperId} (title: ${data.titles[0] || "?"})`);
            path.classList.add("read");
            // ... rest of your mouseenter/leave code ...
        } else {
            path.classList.remove("read");
        }
    });
}

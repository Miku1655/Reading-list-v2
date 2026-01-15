function renderMap() {
    const svg = document.getElementById("worldMapSVG");
    if (!svg) return;

    const countriesRead = getCountriesRead(); // keys: "CZ", "JP", "GB", "FR", "US"

    const { read, total } = getCountryProgress();
    document.getElementById("mapProgress").innerHTML = 
        `Progress: <strong>${read} / ${total}</strong> countries (${Math.round(read/total*100)}%)`;

    const tooltip = document.getElementById("mapTooltip");

    // Select all paths, but look up the country code from the nearest <g> parent
    svg.querySelectorAll("path").forEach(path => {
        // Find the closest <g> ancestor that has an id (the country group)
        let group = path.closest("g[id]");
        if (!group) return; // skip paths not in a country group

        let code = group.getAttribute("id");
        if (!code || code.length !== 2 || code.startsWith("_")) return; // skip special like "_somaliland"

        // Normalize to uppercase to match your countriesRead keys
        const upperCode = code.toUpperCase();

        const data = countriesRead[upperCode];
        if (data && data.count > 0) {
            // Color the entire group (or just the path — but group is safer for multi-path)
            group.classList.add("read");   // ← add to <g> so all paths inside get colored
            // Or color individual path: path.classList.add("read");

            path.addEventListener("mouseenter", e => {
                let fullName = upperCode;
                for (const [name, iso] of Object.entries(countryToIso)) {
                    if (iso.toUpperCase() === upperCode) {
                        fullName = name;
                        break;
                    }
                }
                let html = `<strong>${fullName}</strong> (${upperCode}): ${data.count} book${data.count > 1 ? 's' : ''}<br>`;
                if (data.titles.length <= 5) {
                    html += data.titles.map(t => `• ${t}`).join("<br>");
                } else {
                    html += data.titles.slice(0,5).map(t => `• ${t}`).join("<br>") + `<br>+ ${data.titles.length - 5} more`;
                }
                tooltip.innerHTML = html;
                tooltip.style.display = "block";
                tooltip.style.left = (e.clientX + 15) + "px";
                tooltip.style.top = (e.clientY + 15) + "px";
            });

            path.addEventListener("mouseleave", () => {
                tooltip.style.display = "none";
            });
        }
    });
}

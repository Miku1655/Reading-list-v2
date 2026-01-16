function renderMap() {
    const svg = document.getElementById("worldMapSVG");
    if (!svg) return;

    const countriesRead = getCountriesRead(); // keys: "CZ", "JP", "GB", "FR", "US"

    const { read, total } = getCountryProgress();
    document.getElementById("mapProgress").innerHTML = 
        `Progress: <strong>${read} / ${total}</strong> countries (${Math.round(read/total*100)}%)`;

    const tooltip = document.getElementById("mapTooltip");

   // Loop over all paths, but determine code from path OR its closest group
svg.querySelectorAll("path").forEach(path => {
    // Try to find group first
    let group = path.closest("g[id]");
    let code;

    if (group && group.id && group.id.length === 2 && !group.id.startsWith("_")) {
        // Group exists and has valid 2-letter id → use group's id
        code = group.id.toUpperCase();
    } else if (path.id && path.id.length === 2 && !path.id.startsWith("_")) {
        // No valid group → use path's own id (standalone country)
        code = path.id.toUpperCase();
    } else {
        return; // skip invalid/no id
    }

    const data = countriesRead[code];
    if (data && data.count > 0) {
        // Color the actual path (works for both standalone and inside group)
        path.classList.add("read");

        // Optional: also color other paths in the same group if it's a group
        if (group) {
            group.querySelectorAll("path").forEach(p => p.classList.add("read"));
        }

        // Tooltip (keep attached to the hovered path)
        path.addEventListener("mouseenter", e => {
            let fullName = code;
            for (const [name, iso] of Object.entries(countryToIso)) {
                if (iso.toUpperCase() === code) {
                    fullName = name;
                    break;
                }
            }
            let html = `${fullName} (${code}): ${data.count} book${data.count > 1 ? 's' : ''}<br>`;
            if (data.titles.length <= 5) {
                html += data.titles.map(t => `• ${t}`).join("<br>");
            } else {
                html += data.titles.slice(0,5).map(t => `• ${t}`).join("<br>") +
                        `<br>+ ${data.titles.length - 5} more`;
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

function renderMap() {
    const svg = document.getElementById("worldMapSVG");
    if (!svg) return;

    const countriesRead = getCountriesRead();  // keys are uppercase: "JP", "GB", etc.

    const { read, total } = getCountryProgress();

    document.getElementById("mapProgress").innerHTML = 
        `Progress: <strong>${read} / ${total}</strong> countries (${Math.round(read/total*100)}%)`;

    const tooltip = document.getElementById("mapTooltip");

    svg.querySelectorAll("path").forEach(path => {
        let code = path.getAttribute("id");
        if (!code || code.length !== 2) return;

        // ← KEY CHANGE: force uppercase to match your countryToIso values
        code = code.toUpperCase();
console.log("SVG path id:", path.getAttribute("id"));  // ← add this
console.log("Looking up code:", code.toUpperCase());   // ← add this
        const data = countriesRead[code];
        if (data && data.count > 0) {
            path.classList.add("read");

            path.addEventListener("mouseenter", e => {
                // Full name lookup (already good from previous version)
                let fullName = code;
                for (const [name, iso] of Object.entries(countryToIso)) {
                    if (iso === code) {
                        fullName = name;
                        break;
                    }
                }
                let html = `<strong>${fullName}</strong> (${code}): ${data.count} book${data.count > 1 ? 's' : ''}<br>`;
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
        } else {
            path.classList.remove("read");
        }
    });
}

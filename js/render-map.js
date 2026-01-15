function renderMap() {
    const svg = document.getElementById("worldMapSVG");
    if (!svg) return;

    const countriesRead = getCountriesRead(); // keys now uppercase like "CZ"
    const { read, total } = getCountryProgress();

    document.getElementById("mapProgress").innerHTML = 
        `Progress: <strong>${read} / ${total}</strong> countries (${Math.round(read/total*100)}%)`;

    const tooltip = document.getElementById("mapTooltip");

    svg.querySelectorAll("path").forEach(path => {
        let code = path.getAttribute("id");
        if (!code || code.length !== 2) return;

        code = code.toUpperCase(); // ensure consistency, though ids are likely already upper

        const data = countriesRead[code];
        if (data && data.count > 0) {
            path.classList.add("read");

            path.addEventListener("mouseenter", e => {
                // Full name in tooltip instead of code
                let fullName = code; // fallback
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

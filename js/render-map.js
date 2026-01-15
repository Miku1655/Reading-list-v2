function renderMap() {
    const svg = document.getElementById("worldMapSVG");
    if (!svg) return;

    const countriesRead = getCountriesRead();
    const { read, total } = getCountryProgress();

    document.getElementById("mapProgress").innerHTML = 
        `Progress: <strong>${read} / ${total}</strong> countries (${Math.round(read/total*100)}%)`;

    const tooltip = document.getElementById("mapTooltip");

    svg.querySelectorAll("path").forEach(path => {
        const code = path.getAttribute("id");
        if (!code || code.length !== 2) return;

        const data = countriesRead[code.toUpperCase()];
        if (data && data.count > 0) {
            path.classList.add("read");
            // Optional: shade by count (e.g. darker for more books)
            const intensity = Math.min(255, 80 + data.count * 30);
            path.style.fill = `rgb(76, ${intensity}, 80)`;

            path.addEventListener("mouseenter", e => {
                let html = `<strong>${code}</strong>: ${data.count} book${data.count > 1 ? 's' : ''}<br>`;
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

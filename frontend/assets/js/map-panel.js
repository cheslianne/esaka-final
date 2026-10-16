(function () {
    function escapeText(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function statusMeta(status) {
        const value = String(status || "").toUpperCase();
        if (value.includes("SURPLUS") || value.includes("OVERSUPPLY")) {
            return { key: "surplus", label: "Surplus", color: "#C0392B" };
        }
        if (value.includes("BALANCE")) {
            return { key: "balanced", label: "Balanced", color: "#14532D" };
        }
        if (value.includes("DEFICIT")) {
            return { key: "deficit", label: "Deficit", color: "#A16207" };
        }
        return { key: "nodata", label: "No Data", color: "#202824" };
    }

    function matchesStatus(status, selectedStatus) {
        const value = String(status || "").toUpperCase();
        if (selectedStatus === "all") return true;
        if (selectedStatus === "SURPLUS") {
            return value.includes("SURPLUS") || value.includes("OVERSUPPLY");
        }
        if (selectedStatus === "NODATA") {
            return !value || value === "NO DATA";
        }
        return value.includes(selectedStatus);
    }

    window.mapStatusMatches = matchesStatus;

    window.setMapStatusFilter = function (status) {
        const select = document.getElementById("filterStatus");
        window.mapPanelStatusFilter = status;
        if (select && Array.from(select.options).some((option) => option.value === status)) {
            select.value = status;
            select.dispatchEvent(new Event("change"));
        } else {
            window.renderFilteredMapMarkers?.();
        }
    };

    window.renderMunicipalityMapPanel = function ({ data, markers, map }) {
        const chipRow = document.getElementById("mapStatusSummary");
        const municipalityList = document.getElementById("mapMunicipalityList");
        if (!chipRow || !municipalityList) return;

        const commodity = document.getElementById("filterCommodity")?.value || "all";
        const statusSelect = document.getElementById("filterStatus");
        const selectedStatus = statusSelect?.value || window.mapPanelStatusFilter || "all";
        const counts = { surplus: 0, balanced: 0, deficit: 0, nodata: 0 };
        const rows = [];

        (Array.isArray(data) ? data : []).forEach((municipalityData) => {
            const commodityItems = (Array.isArray(municipalityData.commodities)
                ? municipalityData.commodities
                : []
            ).filter((item) => {
                const commodityMatch = commodity === "all"
                    || String(item.commodity || "").toLowerCase() === commodity.toLowerCase();
                return commodityMatch;
            });

            commodityItems.forEach((item) => {
                counts[statusMeta(item.status).key] += 1;
            });

            const items = commodityItems.filter((item) => matchesStatus(item.status, selectedStatus));
            if (!items.length) return;

            const tags = items.map((item) => {
                const meta = statusMeta(item.status);
                const volume = typeof item.surplus_deficit === "number"
                    ? ` (${formatVolume(item.surplus_deficit)})`
                    : "";
                return `<span class="pc-tag ${meta.key}">${escapeText(item.commodity || "—")} · ${meta.label}${volume}</span>`;
            }).join("");

            rows.push(`
                <button class="pc-muni-row" type="button" data-municipality="${escapeText(municipalityData.municipality)}">
                    <span class="pc-muni-name">${escapeText(municipalityData.municipality || "—")}</span>
                    <span class="pc-muni-tags">${tags}</span>
                </button>
            `);
        });

        chipRow.innerHTML = `
            <button type="button" class="pc-status-chip surplus" data-status-filter="SURPLUS"><span class="dot"></span>Surplus/Oversupply <span class="count">${counts.surplus}</span></button>
            <button type="button" class="pc-status-chip balanced" data-status-filter="BALANCED"><span class="dot"></span>Balanced <span class="count">${counts.balanced}</span></button>
            <button type="button" class="pc-status-chip deficit" data-status-filter="DEFICIT"><span class="dot"></span>Deficit <span class="count">${counts.deficit}</span></button>
            <button type="button" class="pc-status-chip nodata" data-status-filter="NODATA"><span class="dot"></span>No Data <span class="count">${counts.nodata}</span></button>
        `;
        municipalityList.innerHTML = rows.length
            ? rows.join("")
            : `<div class="pc-empty">No municipalities match the current filters.</div>`;

        municipalityList.querySelectorAll("[data-municipality]").forEach((row) => {
            row.addEventListener("click", () => {
                const municipalityMarkers = markers?.[row.dataset.municipality] || [];
                const target = municipalityMarkers[0];
                if (!target || !map) return;
                map.setView(target.marker.getLatLng(), 14, { animate: true });
                target.marker.openPopup();
            });
        });
        chipRow.querySelectorAll("[data-status-filter]").forEach((chip) => {
            chip.addEventListener("click", () => {
                const status = chip.dataset.statusFilter;
                const current = document.getElementById("filterStatus")?.value
                    || window.mapPanelStatusFilter
                    || "all";
                window.setMapStatusFilter?.(current === status ? "all" : status);
            });
        });
    };
}());

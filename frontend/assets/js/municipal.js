/* ============================================================
   E SAKA — MUNICIPAL COORDINATOR DASHBOARD
   With Municipal Summary Tab (period-based aggregation)
============================================================ */

const API_BASE_URL = window.API_BASE_URL || "https://esaka-backend-production.up.railway.app";

const MUNICIPAL_PENDING_ENDPOINT =
    `${API_BASE_URL}/api/report-submissions/for-municipal-validation`;

const SENT_TO_PROVINCIAL_ENDPOINT =
    `${API_BASE_URL}/api/report-submissions/sent-to-provincial`;

const AWAITING_REVISION_ENDPOINT =
    `${API_BASE_URL}/api/report-submissions/awaiting-aew-revision`;

const BULK_APPROVE_ENDPOINT =
    `${API_BASE_URL}/api/report-submissions/bulk-approve`;

const MUNICIPAL_SUMMARY_ENDPOINT =
    `${API_BASE_URL}/api/report-submissions/municipal-summary`;


/* ============================================================
   STATE
============================================================ */

let pendingReports = [];
let sentReports = [];
let awaitingRevisionReports = [];
let selectedReportIds = new Set();
let selectedReport = null;
let currentSentToProvincialFilter = "all";

// Summary state
let currentSummaryPeriod = {
    start: null,
    end: null,
    preset: "this-week",
};
let currentSummaryData = null;

let MUNICIPALITY_MAP_RAW_DATA = [];
let mapMarkersLayer = null;


/* ============================================================
   AUTH HELPERS
============================================================ */

function getAuthToken() {
    return "cookie-session";
}

function getAuthHeaders(extra = {}) {
    const token = getAuthToken();
    const headers = {
        "Content-Type": "application/json",
        ...extra
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}


/* ============================================================
   FETCH WITH TIMEOUT
============================================================ */

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        const contentType = response.headers.get("content-type") || "";
        let data = null;

        if (contentType.includes("application/json")) {
            data = await response.json();
        } else {
            const text = await response.text();
            data = text ? { detail: text } : null;
        }

        if (!response.ok) {
            let detail = data?.detail || data?.message || `HTTP ${response.status}`;

            if (Array.isArray(detail)) {
                detail = detail
                    .map(e => {
                        if (typeof e === "string") return e;
                        if (e.msg) {
                            const loc = Array.isArray(e.loc) ? e.loc.join(".") : "";
                            return loc ? `${loc}: ${e.msg}` : e.msg;
                        }
                        return JSON.stringify(e);
                    })
                    .join("; ");
            } else if (typeof detail === "object") {
                detail = JSON.stringify(detail);
            }

            throw new Error(detail);
        }

        return data;

    } catch (err) {
        if (err.name === "AbortError") {
            throw new Error(`API request timed out after ${timeoutMs / 1000} seconds.`);
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}


/* ============================================================
   USER PROFILE
============================================================ */

function getInitials(name) {
    if (!name) return "--";

    const cleaned = String(name)
        .replace(/^(aew|mcoord|admin|user|municipal|provincial|pcoord|da)[_\s-]+/i, "")
        .replace(/[_\-.]+/g, " ")
        .trim();

    if (!cleaned) return "--";

    const parts = cleaned.split(/\s+/).filter(Boolean);

    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();

    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatRole(role) {
    if (!role) return "";
    return String(role).replace(/_/g, " ").toUpperCase();
}

function setupUserProfile() {
    // Priority: user_display_name > full_name > name > username
    const storedName =
        localStorage.getItem("user_display_name") ||
        localStorage.getItem("full_name") ||
        localStorage.getItem("name") ||
        localStorage.getItem("username");

    const storedRole = localStorage.getItem("role");
    const storedAvatar = localStorage.getItem("user_avatar_src");

    const nameEl = document.getElementById("userDisplayName");
    const roleEl = document.getElementById("userDisplayRole");
    const initEl = document.getElementById("userDisplayInitials");

    if (nameEl && storedName) nameEl.textContent = storedName;
    if (roleEl && storedRole) roleEl.textContent = formatRole(storedRole);

    // Show avatar image if saved, otherwise show initials
    if (initEl) {
        if (storedAvatar) {
            initEl.innerHTML = `<img src="${storedAvatar}" alt="Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            initEl.style.background = "transparent";
        } else {
            initEl.textContent = getInitials(storedName || storedRole);
        }
    }
}


/* ============================================================
   SIDEBAR
============================================================ */

function initSidebar() {
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const sidebar = document.getElementById("sidebar");

    if (!hamburgerBtn || !sidebar) return;

    let hoverTimer = null;

    hamburgerBtn.addEventListener("mouseenter", () => {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
        sidebar.classList.add("open");
        setTimeout(() => {
            if (window.leafletMap) window.leafletMap.invalidateSize();
        }, 300);
    });

    sidebar.addEventListener("mouseenter", () => {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    });

    sidebar.addEventListener("mouseleave", () => {
        hoverTimer = setTimeout(() => {
            sidebar.classList.remove("open");
        }, 200);
    });

    document.addEventListener("click", (e) => {
        if (!sidebar.contains(e.target) && !hamburgerBtn.contains(e.target)) {
            sidebar.classList.remove("open");
        }
    });

    sidebar.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", () => sidebar.classList.remove("open"));
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") sidebar.classList.remove("open");
    });
}


/* ============================================================
   VIEW NAVIGATION
============================================================ */

function initViewNavigation() {
    const navButtons = document.querySelectorAll(".nav-item[data-view]");
    const views = document.querySelectorAll(".view");

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const key = btn.dataset.view;

            views.forEach(v => v.classList.remove("active-view"));
            const target = document.getElementById("view-" + key);
            if (target) target.classList.add("active-view");

            navButtons.forEach(b => b.classList.toggle("active", b === btn));

            if (key === "map" && window.leafletMap) {
                setTimeout(() => window.leafletMap.invalidateSize(), 50);
            }

            // Lazy-load summary when tab opened
            if (key === "summary" && !currentSummaryData) {
                loadMunicipalSummary();
            }
        });
    });
}


/* ============================================================
   MAP
============================================================ */

const municipalityCoordinates = {
    "Angeles City": [15.1450, 120.5887],
    "Apalit": [14.9470, 120.7700],
    "Arayat": [15.1500, 120.7690],
    "Bacolor": [15.0000, 120.6520],
    "Candaba": [15.0950, 120.8260],
    "Floridablanca": [14.9770, 120.5280],
    "Guagua": [14.9650, 120.6350],
    "Lubao": [14.9400, 120.6000],
    "Mabalacat": [15.2230, 120.5740],
    "Macabebe": [14.9080, 120.7150],
    "Magalang": [15.2160, 120.6630],
    "Masantol": [14.8960, 120.7100],
    "Mexico": [15.0640, 120.7190],
    "Minalin": [14.9670, 120.6840],
    "Porac": [15.0710, 120.5420],
    "San Fernando": [15.0343, 120.6840],
    "San Luis": [15.0400, 120.7870],
    "San Simon": [14.9990, 120.7800],
    "Santa Ana": [15.0950, 120.7720],
    "Santa Rita": [15.0190, 120.6110],
    "Santo Tomas": [14.9950, 120.7090]
};

function initMap() {
    const mapEl = document.getElementById("map");
    if (!mapEl || typeof L === "undefined") return;

    const pampangaBounds = L.latLngBounds([14.85, 120.35], [15.35, 120.95]);

    const map = L.map("map", {
        maxBounds: pampangaBounds,
        maxBoundsViscosity: 1.0,
        minZoom: 10
    }).setView([15.0794, 120.6200], 10);

    window.leafletMap = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18
    }).addTo(map);
}

async function loadMunicipalityMapData() {
    try {
        if (!window.leafletMap) return;

        const res = await fetch(
            `${API_BASE_URL}/api/planting-intents/municipality-map`,
            { headers: { "Accept": "application/json" } }
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const result = await res.json();
        if (!result.data || !Array.isArray(result.data)) return;

        MUNICIPALITY_MAP_RAW_DATA = result.data;
        renderFilteredMapMarkers();

        document.getElementById('filterCommodity')?.addEventListener('change', renderFilteredMapMarkers);
        document.getElementById('filterStatus')?.addEventListener('change', renderFilteredMapMarkers);

    } catch (err) {
        console.error("Map load error:", err);
    }
}

// ✅ NEW: Color-coded marker rendering (galing File 2)
function renderFilteredMapMarkers() {
    if (!window.leafletMap) return;

    if (mapMarkersLayer) {
        window.leafletMap.removeLayer(mapMarkersLayer);
    }

    mapMarkersLayer = L.layerGroup().addTo(window.leafletMap);
    const markerIndex = {};

    const selectedCommodity = document.getElementById('filterCommodity')?.value || 'all';
    const selectedStatus = document.getElementById('filterStatus')?.value
        || window.mapPanelStatusFilter
        || 'all';

    MUNICIPALITY_MAP_RAW_DATA.forEach(md => {
        const baseCoordinates = municipalityCoordinates[md.municipality];
        if (!baseCoordinates || !Array.isArray(md.commodities)) return;

        const filteredCommodities = md.commodities.filter(item => {
            const commodityMatch = selectedCommodity === 'all' ||
                (item.commodity || "").toLowerCase() === selectedCommodity.toLowerCase();
            const statusVal = (item.status || "").toUpperCase();

            let statusMatch = true;
            if (selectedStatus !== 'all') {
                statusMatch = window.mapStatusMatches?.(statusVal, selectedStatus)
                    ?? statusVal.includes(selectedStatus);
            }

            return commodityMatch && statusMatch;
        });

        const totalFiltered = filteredCommodities.length;

        filteredCommodities.forEach((item, index) => {
            const commodity = item.commodity;
            const status = (item.status || "").toUpperCase();

            const offsetLat = baseCoordinates[0] + (index - (totalFiltered / 2)) * 0.0025;
            const offsetLng = baseCoordinates[1] + (index - (totalFiltered / 2)) * 0.0025;
            const markerCoordinates = [offsetLat, offsetLng];

            let markerColor = "#6c757d"; // Gray = No Data

            if (status.includes("SURPLUS") || status.includes("OVERSUPPLY")) {
                markerColor = "#C0392B"; // Red
            } else if (status.includes("BALANCE")) {
                markerColor = "#2E7D32"; // Green
            } else if (status.includes("DEFICIT")) {
                markerColor = "#D97706"; // Amber
            }

            const customIcon = L.divIcon({
                className: 'custom-map-marker',
                html: `<div style="
                    background-color: ${markerColor};
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    border: 2px solid white;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                "></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            const popupContent = `
                <div style="min-width:180px;">
                    <strong>Municipality:</strong> ${escapeHtml(md.municipality)}
                    <br><br>
                    <strong>Commodity:</strong> ${escapeHtml(commodity)}
                    <br>
                    <strong>Status:</strong> <span style="font-weight:700; color:${markerColor};">${escapeHtml(status || 'NO DATA')}</span>
                </div>
            `;

            const marker = L.marker(markerCoordinates, { icon: customIcon })
                .addTo(mapMarkersLayer)
                .bindPopup(popupContent);
            if (!markerIndex[md.municipality]) markerIndex[md.municipality] = [];
            markerIndex[md.municipality].push({ marker, item });
        });
    });
    window.renderMunicipalityMapPanel?.({
        data: MUNICIPALITY_MAP_RAW_DATA,
        markers: markerIndex,
        map: window.leafletMap,
    });
}


/* ============================================================
   HELPERS
============================================================ */

function formatDate(dateString) {
    if (!dateString) return "—";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric"
    });
}

function formatDateLong(dateString) {
    if (!dateString) return "—";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric"
    });
}

function formatDateTimeLong(dateString) {
    if (!dateString) return "—";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function formatRole(role) {
    if (!role) return "—";
    return String(role).replace(/_/g, " ").toUpperCase();
}

function getActionStyle(action) {
    const a = String(action || "").toUpperCase();
    if (a === "SUBMITTED")
        return { icon: "📤", label: "Submitted", color: "#2980B9" };
    if (a === "RESUBMITTED")                                              
        return { icon: "🔄", label: "Resubmitted", color: "#2980B9" };   
    if (a === "APPROVED")
        return { icon: "✓", label: "Approved", color: "#2E7D32" };
    if (a === "REVISION_REQUIRED")
        return { icon: "⚠", label: "Revision Required", color: "#C0392B" };
    if (a === "PULLED")
        return { icon: "↩", label: "Pulled to Draft", color: "#D97706" };
    if (a === "STATUS_CHANGED")
        return { icon: "•", label: "Status Changed", color: "#6c757d" };
    return { icon: "•", label: a || "Action", color: "#6c757d" };
}


function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatKg(value) {
    const n = Number(value) || 0;
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " kg";
}

function toDateInputValue(value) {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.substring(0, 10);
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function statusLabelAndClass(status) {
    const s = String(status || "").toUpperCase();

    if (s === "SUBMITTED_MUNICIPAL_PENDING") {
        return { text: "Municipal Pending", cls: "pending" };
    }
    if (s === "SUBMITTED_MUNICIPAL_FLAGGED") {
        return { text: "Municipal Flagged", cls: "flagged" };
    }
    if (s === "SUBMITTED_PROVINCIAL_PENDING") {
        return { text: "Provincial Pending", cls: "provincial" };
    }
    if (s === "SUBMITTED_PROVINCIAL_FLAGGED") {
        return { text: "Provincial Flagged", cls: "flagged" };
    }
    if (s === "SUBMITTED_REGIONAL_PENDING") {
        return { text: "Regional Pending", cls: "rfo" };
    }
    if (s === "SUBMITTED_REGIONAL_FLAGGED") {
        return { text: "Regional Flagged", cls: "flagged" };
    }
    if (s === "SUBMITTED_REGIONAL_APPROVED") {
        return { text: "Approved", cls: "approved" };
    }
    if (s === "DRAFT") {
        return { text: "Draft", cls: "draft" };
    }

    return { text: s || "—", cls: "pending" };
}


/* ============================================================
   LOAD PENDING REPORTS
============================================================ */

async function loadPendingReports() {
    const tbody = document.getElementById("pendingReportsBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="padding:30px; text-align:center; color:#999;">Loading reports...</td></tr>`;

    try {
        const data = await fetchJsonWithTimeout(
            MUNICIPAL_PENDING_ENDPOINT,
            { method: "GET", headers: getAuthHeaders({ "Accept": "application/json" }) },
            10000
        );

        pendingReports = Array.isArray(data) ? data : [];
        selectedReportIds = new Set();

        renderPendingReports();
        updateBulkApproveButton();
        updateReportSummaryCards(); 

    } catch (err) {
        console.error("Load pending error:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="padding:30px; text-align:center; color:#C0392B;">
                    Failed to load pending reports.
                    <br><small>${escapeHtml(err.message || "Unable to load reports.")}</small>
                </td>
            </tr>
        `;
        const badge = document.getElementById("pendingCountBadge");
        if (badge) badge.textContent = "0";
        pendingReports = [];
        selectedReportIds = new Set();
        updateBulkApproveButton();
    }
}

function renderPendingReports() {
    const tbody = document.getElementById("pendingReportsBody");
    if (!tbody) return;

    const reports = pendingReports.filter(report => {
        const s = String(report.status || "").toUpperCase();
        return s === "SUBMITTED_MUNICIPAL_PENDING" || s === "FOR_MUNICIPAL_VALIDATION";
    });

    const badge = document.getElementById("pendingCountBadge");
    if (badge) badge.textContent = reports.length;

    tbody.innerHTML = "";

    if (reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding:30px; text-align:center; color:#999;">No pending reports.</td></tr>`;
        return;
    }

    reports.forEach(report => {
        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.dataset.reportId = report.report_id;

        const checked = selectedReportIds.has(report.report_id) ? "checked" : "";
        if (checked) tr.classList.add("selected");

        const sl = statusLabelAndClass(report.status);

        tr.innerHTML = `
            <td class="center-col" onclick="event.stopPropagation()">
                <input type="checkbox" class="row-check" data-report-id="${escapeHtml(report.report_id)}" ${checked}>
            </td>
            <td class="center-col" style="font-weight: 600;">#${escapeHtml(report.report_id)}</td>
            <td>${escapeHtml(report.title || "—")}</td>
            <td>${escapeHtml(report.commodity || "—")}</td>
            <td>${escapeHtml(report.municipality || "—")}</td>
            <td class="center-col">${formatDate(report.planting_date)}</td>
            <td class="center-col">${report.estimated_yield ?? "—"}</td>
            <td class="center-col">
                <span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>
            </td>
        `;

        tr.addEventListener("click", (e) => {
            if (e.target.closest("input[type=checkbox]")) return;
            openReportDetail(report);
        });

        tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".row-check").forEach(cb => {
        cb.addEventListener("change", (e) => {
            const id = Number(e.target.dataset.reportId);
            const row = e.target.closest("tr");

            if (e.target.checked) {
                selectedReportIds.add(id);
                if (row) row.classList.add("selected");
            } else {
                selectedReportIds.delete(id);
                if (row) row.classList.remove("selected");
            }

            updateSelectAllCheckbox();
            updateBulkApproveButton();
        });
    });

    updateSelectAllCheckbox();
}


/* ============================================================
   LOAD AWAITING REVISION
============================================================ */

async function loadAwaitingRevision() {
    const tbody = document.getElementById("awaitingRevisionBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">Loading reports...</td></tr>`;

    try {
        const data = await fetchJsonWithTimeout(
            AWAITING_REVISION_ENDPOINT,
            { method: "GET", headers: getAuthHeaders({ "Accept": "application/json" }) },
            10000
        );

        awaitingRevisionReports = Array.isArray(data) ? data : [];
        renderAwaitingRevision();
        updateReportSummaryCards(); 

    } catch (err) {
        console.error("Load awaiting revision error:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#C0392B;">Failed to load reports.</td></tr>`;
        const badge = document.getElementById("awaitingRevisionCountBadge");
        if (badge) badge.textContent = "0";
        awaitingRevisionReports = [];
    }
}

function renderAwaitingRevision() {
    const tbody = document.getElementById("awaitingRevisionBody");
    if (!tbody) return;

    const badge = document.getElementById("awaitingRevisionCountBadge");
    if (badge) badge.textContent = awaitingRevisionReports.length;

    tbody.innerHTML = "";

    if (awaitingRevisionReports.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding:30px; text-align:center; color:#999;">
                    No reports awaiting revision.
                </td>
            </tr>
        `;
        return;
    }

    awaitingRevisionReports.forEach(report => {
        const sl = statusLabelAndClass(report.status);
        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.dataset.reportId = report.report_id;

        // ✅ Use flagged_at first; fall back gracefully
        const flaggedDate = report.flagged_at 
            || report.updated_at 
            || report.submitted_at;

        tr.innerHTML = `
            <td class="center-col" style="font-weight: 600;">#${escapeHtml(report.report_id)}</td>
            <td>${escapeHtml(report.title || "—")}</td>
            <td>${escapeHtml(report.commodity || "—")}</td>
            <td>${escapeHtml(report.municipality || "—")}</td>
            <td class="center-col">${formatDate(flaggedDate)}</td>
            <td class="center-col">
                <span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>
            </td>
        `;

        tr.addEventListener("click", () => openReportDetail(report));
        tbody.appendChild(tr);
    });
}



/* ============================================================
   LOAD SENT TO PROVINCIAL
============================================================ */

async function loadSentToProvincial() {
    const tbody = document.getElementById("sentToProvincialBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">Loading reports...</td></tr>`;

    try {
        const data = await fetchJsonWithTimeout(
            SENT_TO_PROVINCIAL_ENDPOINT,
            { method: "GET", headers: getAuthHeaders({ "Accept": "application/json" }) },
            10000
        );

        sentReports = Array.isArray(data) ? data : [];
        renderSentReports();
        updateReportSummaryCards(); 

    } catch (err) {
        console.error("Load sent error:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#C0392B;">Failed to load reports.</td></tr>`;
        const badge = document.getElementById("sentCountBadge");
        if (badge) badge.textContent = "0";
        sentReports = [];
    }
}

function renderSentReports() {
    const tbody = document.getElementById("sentToProvincialBody");
    if (!tbody) return;

    const dateHeader = document.getElementById("sentDateColumnHeader");
    if (dateHeader) {
        dateHeader.textContent =
            currentSentToProvincialFilter === "approved" ? "Approved At" : "Submitted";
    }

    let filteredReports = sentReports;

    if (currentSentToProvincialFilter === "pending") {
        filteredReports = sentReports.filter(function(report) {
            const status = String(report.status || "").toUpperCase();
            return status === "SUBMITTED_PROVINCIAL_PENDING" ||
                   status === "SUBMITTED_PROVINCIAL_FLAGGED" ||
                   status === "SUBMITTED_REGIONAL_PENDING" ||
                   status === "SUBMITTED_REGIONAL_FLAGGED";
        });
    } else if (currentSentToProvincialFilter === "approved") {
        filteredReports = sentReports.filter(function(report) {
            const status = String(report.status || "").toUpperCase();
            return status === "SUBMITTED_REGIONAL_APPROVED" ||
                   status === "FINAL_APPROVED";
        });
    }

    const badge = document.getElementById("sentCountBadge");
    if (badge) badge.textContent = filteredReports.length;

    tbody.innerHTML = "";

    if (filteredReports.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding:30px; text-align:center; color:#999;">
                    ${currentSentToProvincialFilter === "all"
                        ? "No reports sent to Provincial yet."
                        : currentSentToProvincialFilter === "approved"
                            ? "No approved reports yet."
                            : "No pending reports."}
                </td>
            </tr>
        `;
        return;
    }

    filteredReports.forEach(report => {
        const sl = statusLabelAndClass(report.status);
        const isFlagged = sl.cls === "flagged";

        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.dataset.reportId = report.report_id;

        if (isFlagged) tr.style.background = "#FFF5F5";

        let dateValue = "—";
        if (currentSentToProvincialFilter === "approved") {
            dateValue = formatDate(report.approved_at || report.updated_at || report.submitted_at);
        } else {
            dateValue = formatDate(report.submitted_at);
        }

        tr.innerHTML = `
            <td class="center-col" style="font-weight: 600;">#${escapeHtml(report.report_id)}</td>
            <td>${escapeHtml(report.title || "—")}</td>
            <td>${escapeHtml(report.commodity || "—")}</td>
            <td>${escapeHtml(report.municipality || "—")}</td>
            <td class="center-col">${dateValue}</td>
            <td class="center-col">
                <span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>
            </td>
        `;

        tr.addEventListener("click", () => openReportDetail(report));
        tbody.appendChild(tr);
    });
}

/* ============================================================
   REPORT SUMMARY CARDS
============================================================ */
function updateReportSummaryCards() {
    // Pending = rows sa pending table (excl. empty state)
    const pendingCount = pendingReports.filter(report => {
        const s = String(report.status || "").toUpperCase();
        return s === "SUBMITTED_MUNICIPAL_PENDING" || s === "FOR_MUNICIPAL_VALIDATION";
    }).length;

    // Awaiting revision
    const revisionCount = awaitingRevisionReports.length;

    // Sent to Provincial = lahat ng nasa sentReports
    const provincialCount = sentReports.length;

    // Approved = mga may status na regional approved o final approved
    const approvedCount = sentReports.filter(report => {
        const s = String(report.status || "").toUpperCase();
        return s === "SUBMITTED_REGIONAL_APPROVED" || s === "FINAL_APPROVED";
    }).length;

    const setCount = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setCount("reportCountPending", pendingCount);
    setCount("reportCountRevision", revisionCount);
    setCount("reportCountProvincial", provincialCount);
    setCount("reportCountApproved", approvedCount);
}
/* ============================================================
   FILTER PILLS — SENT TO PROVINCIAL
============================================================ */

function initSentToProvincialFilter() {
    const pills = document.querySelectorAll("#sentToProvincialFilterPills .filter-pill");
    if (!pills.length) return;

    pills.forEach(pill => {
        pill.addEventListener("click", () => {
            pills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");

            currentSentToProvincialFilter = pill.dataset.filter || "all";
            renderSentReports();
        });
    });
}


/* ============================================================
   SEARCH
============================================================ */

function initSearch() {
    const input = document.getElementById("reportSearchInput");
    if (!input) return;

    input.addEventListener("input", () => {
        const term = input.value.trim().toLowerCase();
        const tbody = document.getElementById("pendingReportsBody");
        if (!tbody) return;

        const rows = tbody.querySelectorAll("tr[data-report-id]");
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? "" : "none";
        });

        updateSelectAllCheckbox();
    });
}


/* ============================================================
   SELECT ALL
============================================================ */

function updateSelectAllCheckbox() {
    const cb = document.getElementById("selectAllCheckbox");
    if (!cb) return;

    const visibleCheckboxes = document.querySelectorAll(
        "#pendingReportsBody tr:not([style*='display: none']) .row-check"
    );

    const totalVisible = visibleCheckboxes.length;
    const checkedVisible = Array.from(visibleCheckboxes).filter(c => c.checked).length;

    if (totalVisible === 0 || checkedVisible === 0) {
        cb.checked = false;
        cb.indeterminate = false;
    } else if (checkedVisible === totalVisible) {
        cb.checked = true;
        cb.indeterminate = false;
    } else {
        cb.checked = false;
        cb.indeterminate = true;
    }
}


/* ============================================================
   BULK APPROVE
============================================================ */

function updateBulkApproveButton() {
    const btn = document.getElementById("bulkApproveBtn");
    if (!btn) return;

    if (selectedReportIds.size > 0) {
        btn.disabled = false;
        btn.textContent = `Approve ${selectedReportIds.size} & Send to Provincial`;
    } else {
        btn.disabled = true;
        btn.textContent = "Approve Selected & Send to Provincial";
    }
}

function initBulkActions() {
    const selectAllCb = document.getElementById("selectAllCheckbox");
    const selectAllBtn = document.getElementById("selectAllPendingBtn");
    const bulkBtn = document.getElementById("bulkApproveBtn");

    if (selectAllCb) {
        selectAllCb.addEventListener("change", (e) => {
            const checked = e.target.checked;
            const checkboxes = document.querySelectorAll(
                "#pendingReportsBody tr:not([style*='display: none']) .row-check"
            );

            checkboxes.forEach(cb => {
                if (cb.checked !== checked) {
                    cb.checked = checked;
                    cb.dispatchEvent(new Event("change", { bubbles: true }));
                }
            });
        });
    }

    if (selectAllBtn) {
        selectAllBtn.addEventListener("click", () => {
            const checkboxes = document.querySelectorAll(
                "#pendingReportsBody tr:not([style*='display: none']) .row-check"
            );
            if (checkboxes.length === 0) return;

            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            checkboxes.forEach(cb => {
                cb.checked = !allChecked;
                cb.dispatchEvent(new Event("change", { bubbles: true }));
            });
        });
    }

    if (bulkBtn) {
        bulkBtn.addEventListener("click", () => {
            if (selectedReportIds.size === 0) return;
            openBulkApproveModal();
        });
    }

    const cancelBtn = document.getElementById("bulkApproveCancelBtn");
    const confirmBtn = document.getElementById("bulkApproveConfirmBtn");

    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            document.getElementById("bulkApproveModal")?.classList.remove("show");
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener("click", bulkApproveSelected);
    }
}

function openBulkApproveModal() {
    const modal = document.getElementById("bulkApproveModal");
    const text = document.getElementById("bulkApproveText");
    if (!modal || !text) return;

    const n = selectedReportIds.size;
    text.textContent =
        `Approve ${n} report${n > 1 ? "s" : ""} and send to Provincial?` +
        ` This action will forward the selected report${n > 1 ? "s" : ""} as-is.`;

    modal.classList.add("show");
}

async function bulkApproveSelected() {
    const confirmBtn = document.getElementById("bulkApproveConfirmBtn");
    const cancelBtn = document.getElementById("bulkApproveCancelBtn");

    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "Processing..."; }
    if (cancelBtn) cancelBtn.disabled = true;

    try {
        const result = await fetchJsonWithTimeout(
            BULK_APPROVE_ENDPOINT,
            {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    report_ids: Array.from(selectedReportIds)
                })
            },
            15000
        );

        document.getElementById("bulkApproveModal")?.classList.remove("show");

        openModal(
            `${result.approved_count || 0} report${(result.approved_count || 0) > 1 ? "s" : ""} approved and sent to Provincial.`
        );

        selectedReportIds.clear();

        await Promise.allSettled([
            loadPendingReports(),
            loadAwaitingRevision(),
            loadSentToProvincial()
        ]);

    } catch (err) {
        console.error("Bulk approve error:", err);
        document.getElementById("bulkApproveModal")?.classList.remove("show");
        openModal(`Error: ${err.message}`);
    } finally {
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = "Confirm"; }
        if (cancelBtn) cancelBtn.disabled = false;
    }
}


/* ============================================================
   OPEN REPORT DETAIL
============================================================ */

async function openReportDetail(report) {
    if (!report) return;

    selectedReport = report;

    // ---------------- VIEW SWITCHING ----------------
    const mainHeader = document.getElementById("reportsMainHeader");
    if (mainHeader) mainHeader.style.display = "none";

    const pendingView = document.getElementById("pendingReportsView");
    const sentView = document.getElementById("sentToProvincialView");
    const awaitingView = document.getElementById("awaitingRevisionView");
    const detailView = document.getElementById("individualDetailView");
     const summaryCards = document.getElementById("reportSummaryCards");
    if (summaryCards) summaryCards.style.display = "none";

    if (pendingView) pendingView.style.display = "none";
    if (sentView) sentView.style.display = "none";
    if (awaitingView) awaitingView.style.display = "none";
    if (detailView) {
        detailView.classList.remove("hidden-element");
        detailView.style.display = "block";
    }

    // ---------------- RESET SUB-SECTIONS ----------------
    const summaryWrapper = document.getElementById("reportSummaryCardWrapper");
    const summaryBody = document.getElementById("reportSummaryBody");
    const historyContainer = document.getElementById("validationTimelineContainer");

    if (summaryWrapper) summaryWrapper.style.display = "none";
    if (summaryBody) summaryBody.innerHTML = "";
    if (historyContainer) {
        historyContainer.innerHTML = `
            <div style="color: var(--muted); font-style: italic; font-size: 13px;">
                Loading history...
            </div>
        `;
    }

    // ---------------- ELEMENT REFS ----------------
    const titleEl        = document.getElementById("detailReportTitle");
    const subtitleEl     = document.getElementById("detailReportSubtitle");
    const idEl           = document.getElementById("detailReportId");
    const municipalityEl = document.getElementById("detailReportMunicipality");
    const statusEl       = document.getElementById("detailReportStatus");
    const dateEl         = document.getElementById("detailReportDate");
    const encodedByEl    = document.getElementById("detailReportEncodedBy");
    const yieldEl        = document.getElementById("detailReportYield");
    const notesEl        = document.getElementById("detailReportNotes");
    const attachmentsEl  = document.getElementById("detailReportAttachments");
    const intentsBody    = document.getElementById("detailReportIntentsBody");
    const remarksEl      = document.getElementById("remarksTextarea");
    const flagBtn        = document.getElementById("flagBtn");
    const approveBtn     = document.getElementById("approveBtn");
    const backBtn        = document.getElementById("backToPendingBtn");
    const resubmitBtn    = document.getElementById("resubmitReportBtn");

    // ---------------- STATUS FLAGS ----------------
    const statusUpper = String(report.status || "").toUpperCase();
    const isMunicipalPending  = statusUpper === "SUBMITTED_MUNICIPAL_PENDING";
    const isProvincialFlagged = statusUpper === "SUBMITTED_PROVINCIAL_FLAGGED";
    const isRegionalFlagged   = statusUpper === "SUBMITTED_REGIONAL_FLAGGED";
    const isMunicipalFlagged  = statusUpper === "SUBMITTED_MUNICIPAL_FLAGGED";

    // ✅ Can this user take action on this report?
    // Only pending (Municipal awaiting) OR flagged by higher level
    const canTakeAction = isMunicipalPending || isProvincialFlagged || isRegionalFlagged;

    // ---------------- BASIC INFO (from list data) ----------------
    if (titleEl) titleEl.textContent = report.title || `Report #${report.report_id}`;
    if (subtitleEl) subtitleEl.textContent = `Report #${report.report_id} • ${report.municipality || ""}`;
    if (idEl) idEl.textContent = report.report_id ?? "—";
    if (municipalityEl) municipalityEl.textContent = report.municipality || "—";
    if (dateEl) dateEl.textContent = formatDate(report.submitted_at) || "—";
    if (encodedByEl) encodedByEl.textContent = report.encoded_by_name || "—";
    if (yieldEl) yieldEl.textContent = report.estimated_yield ?? "—";
    if (notesEl) notesEl.textContent = report.notes || "—";

    const sl = statusLabelAndClass(report.status);
    if (statusEl) {
        statusEl.innerHTML = `<span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>`;
    }

    // ---------------- REMARKS TEXTAREA (conditional) ----------------
    const remarksRow = remarksEl ? remarksEl.closest(".notes-row") : null;

    if (remarksEl) {
        remarksEl.value = "";
        remarksEl.style.borderColor = "var(--border)";
        remarksEl.style.borderWidth = "1.5px";

        if (canTakeAction) {
            remarksEl.readOnly = false;
            remarksEl.disabled = false;
            remarksEl.style.background = "#FFFFFF";
            remarksEl.style.color = "var(--ink)";
            remarksEl.style.cursor = "text";
            remarksEl.placeholder = "Type your comment here...";
            if (remarksRow) remarksRow.style.display = "flex";
        } else {
            // ✅ Read-only mode — hide the whole row
            remarksEl.readOnly = true;
            remarksEl.disabled = true;
            remarksEl.style.background = "#F6F3EB";
            remarksEl.style.color = "var(--muted)";
            remarksEl.style.cursor = "not-allowed";
            remarksEl.placeholder = "No action available for this status.";
            if (remarksRow) remarksRow.style.display = "none";
        }
    }

    // ---------------- BUTTON VISIBILITY ----------------
    if (resubmitBtn) resubmitBtn.style.display = "none";

    if (isMunicipalPending) {
        // Municipal can approve or flag
        if (backBtn) { backBtn.style.display = "inline-flex"; backBtn.textContent = "Back to Reports"; }
        if (flagBtn) {
            flagBtn.style.display = "inline-flex";
            flagBtn.textContent = "Return to AEW for Revision";
            flagBtn.disabled = false;
        }
        if (approveBtn) {
            approveBtn.style.display = "inline-flex";
            approveBtn.textContent = "Approve & Send to Provincial";
            approveBtn.disabled = false;
        }
    } else if (isMunicipalFlagged) {
        // ✅ Municipal already flagged — wait for AEW revision. READ-ONLY.
        if (backBtn) { backBtn.style.display = "inline-flex"; backBtn.textContent = "Back to Reports"; }
        if (flagBtn) flagBtn.style.display = "none";
        if (approveBtn) approveBtn.style.display = "none";
    } else if (isProvincialFlagged) {
        // ✅ Provincial flagged — Municipal can re-flag or resubmit
        if (backBtn) { backBtn.style.display = "inline-flex"; backBtn.textContent = "Back to Reports"; }
        if (flagBtn) {
            flagBtn.style.display = "inline-flex";
            flagBtn.textContent = "Return to AEW for Revision";
            flagBtn.disabled = false;
        }
        if (approveBtn) approveBtn.style.display = "none";
        if (resubmitBtn) {
            resubmitBtn.style.display = "inline-flex";
            resubmitBtn.textContent = "Resubmit to Provincial";
            resubmitBtn.disabled = false;
        }
    } else if (isRegionalFlagged) {
        // ✅ Regional flagged — read-only for Municipal
        // (Provincial should handle this first)
        if (backBtn) { backBtn.style.display = "inline-flex"; backBtn.textContent = "Return"; }
        if (flagBtn) flagBtn.style.display = "none";
        if (approveBtn) approveBtn.style.display = "none";
        if (resubmitBtn) resubmitBtn.style.display = "none";

        // Also hide remarks input para hindi magulo
        if (remarksEl) {
            remarksEl.readOnly = true;
            remarksEl.style.background = "#F6F3EB";
            remarksEl.style.color = "var(--muted)";
            remarksEl.style.cursor = "default";
            remarksEl.placeholder = "Read-only — report is at Regional level.";
        }
        const remarksRow = remarksEl ? remarksEl.closest(".notes-row") : null;
        if (remarksRow) remarksRow.style.display = "none";
    } else {
        // Any other status — read-only
        if (backBtn) { backBtn.style.display = "inline-flex"; backBtn.textContent = "Back"; }
        if (flagBtn) flagBtn.style.display = "none";
        if (approveBtn) approveBtn.style.display = "none";
    }

    // ---------------- FETCH FULL REPORT ----------------
    try {
        const full = await fetchJsonWithTimeout(
            `${API_BASE_URL}/api/raw-plant-reports/${report.report_id}`,
            {
                method: "GET",
                headers: getAuthHeaders({ "Accept": "application/json" })
            },
            10000
        );

        console.log("Full report loaded:", full);

        // ============================================================
        // ✅ Bind proper values from FULL report (not list data)
        // ============================================================
        if (dateEl) {
            dateEl.textContent = formatDate(
                full.submitted_at || full.created_at
            ) || "—";
        }

        if (notesEl) {
            notesEl.textContent =
                full.notes
                || full.narrative
                || full.remarks
                || "—";
        }

        if (encodedByEl) {
            encodedByEl.textContent =
                full.encoded_by_name
                || report.encoded_by_name
                || "—";
        }

        if (yieldEl) {
            yieldEl.textContent =
                full.estimated_yield != null
                    ? full.estimated_yield
                    : "—";
        }

        if (titleEl) {
            titleEl.textContent = full.title || `Report #${full.report_id}`;
        }

        // Re-bind status pill in case full has different status
        if (statusEl && full.status) {
            const fullSl = statusLabelAndClass(full.status);
            statusEl.innerHTML = `<span class="status-pill ${fullSl.cls}">${escapeHtml(fullSl.text)}</span>`;
        }

        // ---------------- RENDER ATTACHMENTS ----------------
        renderAttachments(full.attachments || []);

        // ---------------- RENDER INTENTS TABLE ----------------
        renderDetailIntents(full.planting_intents || []);

        // ---------------- RENDER SUMMARY CARD ----------------
        const intents = Array.isArray(full.planting_intents) ? full.planting_intents : [];
        if (intents.length > 0) {
            renderReportSummaryCard(intents, {
                municipality: full.municipality || report.municipality,
                submitted_at: full.submitted_at || full.created_at,
                created_at: full.created_at,
                report_id: full.report_id,
                title: full.title,
            });
        }

        // ---------------- RENDER VALIDATION TIMELINE ----------------
        renderValidationTimeline(full.validation_history || []);

    } catch (err) {
        console.error("Fetch full report error:", err);

        if (attachmentsEl) {
            attachmentsEl.textContent = "Unable to load attachments.";
            attachmentsEl.style.color = "#C0392B";
        }

        if (intentsBody) {
            intentsBody.innerHTML = `
                <tr>
                    <td colspan="9" style="padding:20px; text-align:center; color:#C0392B;">
                        Failed to load intents: ${escapeHtml(err.message)}
                    </td>
                </tr>
            `;
        }

        if (historyContainer) {
            historyContainer.innerHTML = `
                <div style="color: #C0392B; font-size: 13px;">
                    Failed to load timeline: ${escapeHtml(err.message)}
                </div>
            `;
        }
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}


/* ============================================================
   📜 RENDER VALIDATION TIMELINE
============================================================ */

function renderValidationTimeline(history) {
    const container = document.getElementById("validationTimelineContainer");
    if (!container) return;

    if (!Array.isArray(history) || history.length === 0) {
        container.innerHTML = `
            <div style="
                padding: 20px;
                text-align: center;
                color: var(--muted);
                font-size: 13px;
                font-style: italic;
                background: #FAF8F5;
                border: 1px dashed var(--border-light);
                border-radius: 8px;
            ">
                No validation history recorded yet.
            </div>
        `;
        return;
    }

    const html = history.map((h, idx) => {
        const style = getActionStyle(h.action);
        const isLast = idx === history.length - 1;

        // ✅ Strip old [Role: Name] prefix for backwards compatibility
        let cleanRemarks = h.remarks || "";
        cleanRemarks = cleanRemarks.replace(/^\[[^\]]+\]\s*/, "").trim();

        const remarksHtml = cleanRemarks
            ? `<div class="timeline-remarks">${escapeHtml(cleanRemarks)}</div>`
            : "";

        const dateHtml = h.created_at
            ? `<span class="timeline-date">${escapeHtml(formatDateTimeLong(h.created_at))}</span>`
            : "";

        return `
            <div class="timeline-item">
                <div class="timeline-marker" style="background:${style.color};">
                    ${style.icon}
                </div>
                ${!isLast ? '<div class="timeline-line"></div>' : ''}
                <div class="timeline-content">
                    <div class="timeline-header">
                        <span class="timeline-action" style="color:${style.color};">
                            ${escapeHtml(style.label)}
                        </span>
                        ${dateHtml}
                    </div>
                    <div class="timeline-meta">
                        <strong>${escapeHtml(h.performed_by_name || "Unknown User")}</strong>
                        <span class="timeline-role">${escapeHtml(formatRole(h.role))}</span>
                    </div>
                    ${remarksHtml}
                </div>
            </div>
        `;
    }).join("");

    container.innerHTML = `<div class="validation-timeline">${html}</div>`;
}


/* ============================================================
   📊 RENDER REPORT SUMMARY CARD (AEW-style preview)
   Adapted from aew.js renderReportSummary() for single report view
============================================================ */

function renderReportSummaryCard(intents, meta) {
    const wrapper = document.getElementById("reportSummaryCardWrapper");
    const body = document.getElementById("reportSummaryBody");
    const coveragePeriodEl = document.getElementById("summaryCoveragePeriod");

    if (!wrapper || !body) return;

    if (!Array.isArray(intents) || intents.length === 0) {
        wrapper.style.display = "none";
        return;
    }

    wrapper.style.display = "block";

    const selected = intents;
    const selectedCount = selected.length;

    // -------- AGGREGATE METRICS --------
    const totalVolume = selected.reduce((sum, i) => sum + (Number(i.volume) || 0), 0);

    const uniqueFarmers = new Set(
        selected.map(i => i.farmer_id || i.farmer_name).filter(Boolean)
    );
    const uniqueFarmerCount = uniqueFarmers.size;

    const pendingCount = selected.filter(i => {
        const s = String(i.status || i.plant_status_at_submission || "").toUpperCase();
        return s === "SUBMITTED" || s === "SUBMITTED_MUNICIPAL_PENDING";
    }).length;

    const harvestedIntents = selected.filter(i =>
        (i.finalized_status_at_submission || i.finalized_status || "").toUpperCase() === "HARVESTED"
    );

    const harvestedVolume = harvestedIntents.reduce((sum, i) => {
        const actual = Number(i.actual_harvest_volume);
        const planned = Number(i.volume);
        return sum + (actual > 0 ? actual : (planned || 0));
    }, 0);

    const harvestRate = selectedCount > 0
        ? Math.round((harvestedIntents.length / selectedCount) * 100)
        : 0;

    const totalActualHarvest = selected.reduce((sum, i) => {
        const v = Number(i.actual_harvest_volume);
        return sum + (v > 0 ? v : 0);
    }, 0);

    // -------- COVERAGE PERIOD --------
    if (coveragePeriodEl) {
        const submittedAt = meta?.submitted_at || meta?.created_at;
        if (submittedAt) {
            const reportDate = new Date(submittedAt);
            if (!isNaN(reportDate.getTime())) {
                const weekStart = new Date(reportDate);
                weekStart.setDate(reportDate.getDate() - 6);
                const fmt = d => d.toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric"
                });
                coveragePeriodEl.textContent =
                    `Coverage: ${fmt(weekStart)} – ${fmt(reportDate)}`;
            } else {
                coveragePeriodEl.textContent = "Coverage: —";
            }
        } else {
            coveragePeriodEl.textContent = "Coverage: —";
        }
    }

    // -------- BY COMMODITY --------
    const byCommodity = {};
    selected.forEach(intent => {
        const c = intent.commodity || "Unknown";
        if (!byCommodity[c]) byCommodity[c] = { count: 0, volume: 0 };
        byCommodity[c].count += 1;
        byCommodity[c].volume += Number(intent.volume) || 0;
    });

    // -------- BY BARANGAY --------
    const byBarangay = {};
    selected.forEach(intent => {
        let b = intent.barangay;
        if (!b && intent.location) {
            b = String(intent.location).split(",")[0].trim();
        }
        if (!b) b = intent.municipality || "Unknown";
        if (!byBarangay[b]) byBarangay[b] = { count: 0, volume: 0 };
        byBarangay[b].count += 1;
        byBarangay[b].volume += Number(intent.volume) || 0;
    });

    // -------- BY STATUS --------
    const byStatus = {
        "NOT PLANTED": { count: 0, volume: 0, label: "Not Planted", color: "#6c757d" },
        "PLANTED":     { count: 0, volume: 0, label: "Planted",     color: "#D97706" },
        "HARVESTED":   { count: 0, volume: 0, label: "Harvested",   color: "#2E7D32" },
        "MEDIATING":   { count: 0, volume: 0, label: "Mediating",   color: "#2980B9" },
    };

    selected.forEach(intent => {
        const s = (intent.finalized_status_at_submission || intent.finalized_status || "NOT PLANTED").toUpperCase();
        if (byStatus[s]) {
            byStatus[s].count += 1;
            byStatus[s].volume += Number(intent.volume) || 0;
        }
    });

    // -------- YIELD PERFORMANCE --------
    const yieldPlanned = totalVolume;
    const yieldActual = totalActualHarvest;
    const hasActualData = yieldActual > 0;
    const variancePct = hasActualData && yieldPlanned > 0
        ? Math.round(((yieldActual - yieldPlanned) / yieldPlanned) * 100)
        : 0;

    // -------- PLANTING WINDOW --------
    const plantingDates = selected
        .map(i => i.planting_date)
        .filter(Boolean)
        .map(d => new Date(d))
        .filter(d => !isNaN(d.getTime()));

    const harvestDates = selected
        .map(i => i.harvest_date)
        .filter(Boolean)
        .map(d => new Date(d))
        .filter(d => !isNaN(d.getTime()));

    // -------- BUILD HTML --------
    let html = "";

    // KPI ROW 1
    html += `
        <div class="summary-kpi-grid">
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">✓ Selected Intents</div>
                <div class="summary-kpi-value">${selectedCount}</div>
                <div class="summary-kpi-subtext">Included in this report</div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">📦 Total Volume</div>
                <div class="summary-kpi-value">${formatKg(totalVolume)}</div>
                <div class="summary-kpi-subtext">Across ${selectedCount} intent${selectedCount !== 1 ? "s" : ""}</div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">👥 Unique Farmers</div>
                <div class="summary-kpi-value">${uniqueFarmerCount}</div>
                <div class="summary-kpi-subtext">Beneficiaries in this report</div>
            </div>
        </div>
    `;

    // KPI ROW 2
    html += `
        <div class="summary-kpi-grid">
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">⏳ Pending Validation</div>
                <div class="summary-kpi-value" style="color:${pendingCount > 0 ? "#D97706" : "#2E7D32"};">
                    ${pendingCount}
                </div>
                <div class="summary-kpi-subtext">Awaiting status update</div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">🌾 Harvested Volume</div>
                <div class="summary-kpi-value" style="color:#2E7D32;">${formatKg(harvestedVolume)}</div>
                <div class="summary-kpi-subtext">${harvestedIntents.length} of ${selectedCount} harvested</div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">🌾 Harvest Rate</div>
                <div class="summary-kpi-value" style="color:${
                    harvestRate === 100 ? "#2E7D32"
                    : harvestRate > 0 ? "#D97706"
                    : "#6c757d"
                };">${harvestRate}%</div>
                <div class="summary-kpi-subtext">Completion ratio</div>
            </div>
        </div>
    `;

    // BREAKDOWN GRID
    html += `<div class="summary-breakdown-grid">`;

    // By Commodity
    html += `
        <div>
            <div class="summary-breakdown-title">🌾 By Commodity</div>
            <div class="summary-breakdown-body">
    `;
    const commodityEntries = Object.entries(byCommodity).sort((a, b) => b[1].volume - a[1].volume);
    if (commodityEntries.length === 0) {
        html += `<span style="color: var(--muted); font-style: italic;">No data.</span>`;
    } else {
        commodityEntries.forEach(([name, d]) => {
            html += `
                <div class="summary-breakdown-row">
                    <span style="font-weight: 600;">${escapeHtml(name)}</span>
                    <span style="font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums;">
                        ${d.count} · <b style="color:var(--green-dark);">${formatKg(d.volume)}</b>
                    </span>
                </div>
            `;
        });
    }
    html += `</div></div>`;

    // By Barangay
    html += `
        <div>
            <div class="summary-breakdown-title">📍 By Barangay</div>
            <div class="summary-breakdown-body">
    `;
    const barangayEntries = Object.entries(byBarangay).sort((a, b) => b[1].volume - a[1].volume);
    if (barangayEntries.length === 0) {
        html += `<span style="color: var(--muted); font-style: italic;">No data.</span>`;
    } else if (barangayEntries.length === 1) {
        html += `
            <div style="color: var(--muted); font-style: italic; font-size: 12px;">
                All intents from <b>${escapeHtml(barangayEntries[0][0])}</b>
            </div>
        `;
    } else {
        barangayEntries.forEach(([name, d]) => {
            html += `
                <div class="summary-breakdown-row">
                    <span style="font-weight: 600;">📍 ${escapeHtml(name)}</span>
                    <span style="font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums;">
                        ${d.count} · <b style="color:var(--green-dark);">${formatKg(d.volume)}</b>
                    </span>
                </div>
            `;
        });
    }
    html += `</div></div>`;

    // By Status
    html += `
        <div>
            <div class="summary-breakdown-title">📋 By Finalized Status</div>
            <div class="summary-breakdown-body">
    `;
    Object.values(byStatus).forEach(d => {
        const isZero = d.count === 0;
        html += `
            <div class="summary-breakdown-row" style="opacity:${isZero ? 0.45 : 1};">
                <span style="font-weight: 600; color:${isZero ? 'var(--muted)' : 'var(--ink)'};">
                    <span style="
                        display: inline-block;
                        width: 8px; height: 8px;
                        border-radius: 50%;
                        background: ${d.color};
                        margin-right: 8px;
                    "></span>
                    ${d.label}
                </span>
                <span style="font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums;">
                    ${d.count} · <b style="color:${isZero ? 'var(--muted)' : d.color};">${formatKg(d.volume)}</b>
                </span>
            </div>
        `;
    });
    html += `</div></div>`;

    html += `</div>`; // end breakdown grid

    // INSIGHTS
    html += `<div class="summary-insight-grid">`;

    // Yield Performance
    html += `<div class="summary-insight-card green">`;
    html += `
        <div style="
            font-size: 11px; font-weight: 700; color: var(--muted);
            text-transform: uppercase; letter-spacing: 0.06em;
            margin-bottom: 10px; padding-bottom: 6px;
            border-bottom: 1px solid var(--border-light);
        ">📊 Yield Performance</div>
    `;
    if (hasActualData) {
        let varianceColor = "#2E7D32";
        let varianceIcon = "↑";
        let varianceLabel = "surplus";
        if (variancePct < 0) {
            varianceColor = "#C0392B";
            varianceIcon = "↓";
            varianceLabel = "shortfall";
        } else if (variancePct === 0) {
            varianceColor = "#6c757d";
            varianceIcon = "→";
            varianceLabel = "on target";
        }

        html += `
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: var(--muted);">Expected (planned):</span>
                <b>${yieldPlanned.toLocaleString("en-US")} kg</b>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="color: var(--muted);">Actual (harvested):</span>
                <b>${yieldActual.toLocaleString("en-US")} kg</b>
            </div>
            <div style="
                display: inline-block; padding: 4px 12px;
                background: ${varianceColor}15; border-radius: 6px;
                font-size: 13px; font-weight: 700; color: ${varianceColor};
            ">
                ${varianceIcon} ${Math.abs(variancePct)}% ${varianceLabel}
            </div>
            <div style="margin-top: 8px; font-size: 11px; color: var(--muted); font-style: italic;">
                Based on ${harvestedIntents.length} of ${selectedCount} harvested
            </div>
        `;
    } else {
        html += `<span style="color: var(--muted); font-style: italic;">No actual harvest volume recorded yet.</span>`;
    }
    html += `</div>`;

    // Planting Window
    html += `<div class="summary-insight-card orange">`;
    html += `
        <div style="
            font-size: 11px; font-weight: 700; color: var(--muted);
            text-transform: uppercase; letter-spacing: 0.06em;
            margin-bottom: 10px; padding-bottom: 6px;
            border-bottom: 1px solid var(--border-light);
        ">📅 Planting Window</div>
    `;

    if (plantingDates.length > 0) {
        const earliest = new Date(Math.min.apply(null, plantingDates));
        const latest = new Date(Math.max.apply(null, plantingDates));
        const spanDays = Math.round((latest - earliest) / (1000 * 60 * 60 * 24));

        html += `
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: var(--muted);">🌱 Earliest:</span>
                <b>${formatDateLong(earliest)}</b>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: var(--muted);">Latest:</span>
                <b>${formatDateLong(latest)}</b>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--muted);">Span:</span>
                <b>${spanDays} day${spanDays !== 1 ? "s" : ""}</b>
            </div>
        `;

        if (harvestDates.length > 0) {
            const earliestH = new Date(Math.min.apply(null, harvestDates));
            const latestH = new Date(Math.max.apply(null, harvestDates));
            const spanH = Math.round((latestH - earliestH) / (1000 * 60 * 60 * 24));

            html += `
                <div style="
                    margin-top: 10px; padding-top: 10px;
                    border-top: 1px dashed var(--border-light);
                ">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: var(--muted);">🌾 Harvest earliest:</span>
                        <b>${formatDateLong(earliestH)}</b>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: var(--muted);">Harvest latest:</span>
                        <b>${formatDateLong(latestH)}</b>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--muted);">Harvest span:</span>
                        <b>${spanH} day${spanH !== 1 ? "s" : ""}</b>
                    </div>
                </div>
            `;
        }
    } else {
        html += `<span style="color: var(--muted); font-style: italic;">No planting dates available.</span>`;
    }
    html += `</div>`;

    html += `</div>`; // end insights grid

    // FOOTER
    const preparedBy = localStorage.getItem("full_name")
        || localStorage.getItem("name")
        || localStorage.getItem("username")
        || "Municipal Coordinator";
    const generatedAt = new Date().toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit"
    });

    html += `
        <div class="summary-footer">
            <div>
                <b style="color: var(--ink);">Report:</b> #${escapeHtml(String(meta?.report_id || "—"))} — ${escapeHtml(meta?.title || "—")}
            </div>
            <div>
                <b style="color: var(--ink);">Viewed by:</b> ${escapeHtml(preparedBy)} at ${escapeHtml(generatedAt)}
            </div>
        </div>
    `;

    body.innerHTML = html;
}


/* ============================================================
   RENDER ATTACHMENTS
============================================================ */

function renderAttachments(attachments) {
    const container = document.getElementById("detailReportAttachments");
    if (!container) return;

    if (!Array.isArray(attachments) || attachments.length === 0) {
        container.textContent = "No attachments";
        container.style.color = "var(--muted)";
        return;
    }

    container.style.color = "var(--ink)";
    container.innerHTML = attachments.map(file => {
        const name = file.filename || file.file_name || "Attachment";
        const storedName = file.stored_name || "";
        const reportId = selectedReport?.report_id;

        const url = storedName && reportId
            ? `${API_BASE_URL}/api/raw-plant-reports/${reportId}/attachments/${storedName}`
            : null;

        if (url) {
            return `
                <div style="margin-bottom: 8px; padding: 12px 16px; background: #FFFFFF; border: 1.5px solid var(--border); border-radius: 8px; display: flex; align-items: center; gap: 10px;">
                    <div style="width: 36px; height: 36px; border-radius: 8px; background: var(--green-light); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 18px;">📎</div>
                    <div style="flex: 1; min-width: 0;">
                        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="color: var(--green-dark); font-weight: 700; text-decoration: none; font-size: 13.5px;">
                            ${escapeHtml(name)}
                        </a>
                        <div style="font-size: 11px; color: var(--muted); margin-top: 2px;">Click to view attachment</div>
                    </div>
                </div>
            `;
        }

        return `<div style="margin-bottom: 6px;">📎 ${escapeHtml(name)}</div>`;
    }).join("");
}


/* ============================================================
   RENDER DETAIL INTENTS
============================================================ */

function renderDetailIntents(intents) {
    const tbody = document.getElementById("detailReportIntentsBody");
    if (!tbody) return;

    if (!Array.isArray(intents) || intents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="padding:20px; text-align:center; color:#999;">No intents included.</td></tr>`;
        return;
    }

    tbody.innerHTML = intents.map(intent => {
        const id = intent.planting_intent_id ?? "—";
        const farmer = intent.farmer_name || "—";
        const commodity = intent.commodity || "—";

        const plannedVol = Number(intent.volume) || 0;
        const actualVol = Number(intent.actual_harvest_volume) || 0;
        const hasActual = actualVol > 0;

        const plannedPlanting = intent.planting_date ? formatDate(intent.planting_date) : "—";
        const plannedHarvest = intent.harvest_date ? formatDate(intent.harvest_date) : "—";

        const actualPlanting = intent.actual_planting_date
            ? formatDate(intent.actual_planting_date)
            : null;
        const actualHarvest = intent.actual_harvest_date
            ? formatDate(intent.actual_harvest_date)
            : null;

        // ---- Helper: render actual date with variance badge ----
        function renderActualDate(actual, planned) {
            if (!actual) {
                return `<span style="color: #BBB; font-style: italic;">Not yet recorded</span>`;
            }
            let varianceBadge = "";
            if (planned) {
                const plannedDate = new Date(planned);
                const actualDate = new Date(actual);
                const diffDays = Math.round((actualDate - plannedDate) / (1000 * 60 * 60 * 24));
                if (diffDays === 0) {
                    varianceBadge = `<span style="font-size: 10px; color: #2E7D32; margin-left: 6px;">(on time)</span>`;
                } else if (diffDays > 0) {
                    varianceBadge = `<span style="font-size: 10px; color: #D97706; margin-left: 6px;">(+${diffDays}d)</span>`;
                } else {
                    varianceBadge = `<span style="font-size: 10px; color: #2980B9; margin-left: 6px;">(${diffDays}d)</span>`;
                }
            }
            return `<span style="color: var(--ink); font-weight: 600;">${actual}</span>${varianceBadge}`;
        }

        // ---- Helper: render status pill ----
        const statusUpper = (intent.finalized_status_at_submission || intent.finalized_status || "NOT PLANTED").toUpperCase();
        let statusText = "Not Planted";
        let bgColor = "#6c757d";
        if (statusUpper === "PLANTED")        { statusText = "Planted";    bgColor = "#D97706"; }
        else if (statusUpper === "HARVESTED") { statusText = "Harvested";  bgColor = "#2E7D32"; }
        else if (statusUpper === "MEDIATING") { statusText = "Mediating";  bgColor = "#2980B9"; }

        return `
            <tr>
                <td class="center-col" style="font-weight: 600;">
                    #${escapeHtml(String(id))}
                </td>
                <td>${escapeHtml(farmer)}</td>
                <td>${escapeHtml(commodity)}</td>
                <td class="center-col">
                    <div style="font-weight: 600;">${plannedVol.toLocaleString("en-US")} kg</div>
                    ${hasActual ? `
                        <div style="font-size: 11px; color: #2E7D32; margin-top: 2px;">
                            ✓ ${actualVol.toLocaleString("en-US")} kg actual
                        </div>
                    ` : `
                        <div style="font-size: 11px; color: #BBB; margin-top: 2px; font-style: italic;">
                            not harvested
                        </div>
                    `}
                </td>
                <td class="center-col" style="background: #FAFAFA;">
                    ${escapeHtml(plannedPlanting)}
                </td>
                <td class="center-col" style="background: #FFFBF5;">
                    ${renderActualDate(actualPlanting, intent.planting_date)}
                </td>
                <td class="center-col" style="background: #FAFAFA;">
                    ${escapeHtml(plannedHarvest)}
                </td>
                <td class="center-col" style="background: #FFFBF5;">
                    ${renderActualDate(actualHarvest, intent.harvest_date)}
                </td>
                <td class="center-col">
                    <span class="status-pill" style="
                        display:inline-block;
                        padding:3px 12px;
                        border-radius:999px;
                        font-size:11px;
                        font-weight:700;
                        color:#FFFFFF;
                        background-color:${bgColor};
                    ">${escapeHtml(statusText)}</span>
                </td>
            </tr>
        `;
    }).join("");
}


/* ============================================================
   CLOSE REPORT DETAIL
============================================================ */

function closeReportDetail() {
    selectedReport = null;

    const detailView = document.getElementById("individualDetailView");
    const pendingView = document.getElementById("pendingReportsView");
    const sentView = document.getElementById("sentToProvincialView");
    const awaitingView = document.getElementById("awaitingRevisionView");

    if (detailView) {
        detailView.style.display = "none";
        detailView.classList.add("hidden-element");
    }

    if (pendingView) pendingView.style.display = "block";
    if (sentView) sentView.style.display = "block";
    if (awaitingView) awaitingView.style.display = "block";

    const mainHeader = document.getElementById("reportsMainHeader");
    if (mainHeader) mainHeader.style.display = "flex";
    const summaryCards = document.getElementById("reportSummaryCards");
    if (summaryCards) summaryCards.style.display = "grid";

}


/* ============================================================
   FLAG FOR REVISION
============================================================ */

function initFlagButton() {
    const flagBtn = document.getElementById("flagBtn");
    if (!flagBtn) return;

    flagBtn.addEventListener("click", () => {
        if (!selectedReport) {
            openModal("No report selected.", {
                title: "Error",
                icon: "⚠",
                iconBg: "#FEE2E2",
                titleColor: "#C0392B",
            });
            return;
        }

        const validatorId = localStorage.getItem("user_id");
        const accessToken = getAuthToken();

        if (!validatorId || !accessToken) {
            openModal("Please log in again.", {
                title: "Session Expired",
                icon: "⚠",
                iconBg: "#FEE2E2",
                titleColor: "#C0392B",
            });
            return;
        }

        const remarksEl = document.getElementById("remarksTextarea");
        const remarksInput = remarksEl?.value?.trim() || "";

        // ============================================================
        // ✅ STEP 1: Validation — remarks required
        // ============================================================
        if (!remarksInput) {
            showActionConfirm({
                title: "Remarks Required",
                message: "Please enter your revision remarks in the text area before flagging this report. <br><br>The AEW needs to know <strong>what to fix.</strong>",
                confirmText: "OK, I'll Add Remarks",
                confirmColor: "#D97706",
                cancelText: "Cancel",
                onConfirm: () => {
                    remarksEl?.focus();
                    remarksEl?.scrollIntoView({ behavior: "smooth", block: "center" });
                },
            });
            return;
        }

        const remarks = remarksInput;

        // ============================================================
        // ✅ STEP 2: Build structured details
        // ============================================================
        const reportTitle = selectedReport.title || `Report #${selectedReport.report_id}`;
        const municipality = selectedReport.municipality || "—";

        const detailsHtml = `
            <div style="display:grid; grid-template-columns: auto 1fr; gap: 6px 14px;">
                <span style="font-weight:700;">Report:</span>
                <span>${escapeHtml(reportTitle)}</span>
                <span style="font-weight:700;">Municipality:</span>
                <span>${escapeHtml(municipality)}</span>
                <span style="font-weight:700;">Your remarks:</span>
                <span style="font-style:italic; color:#C0392B;">"${escapeHtml(remarks)}"</span>
            </div>
        `;

        // ============================================================
        // ✅ STEP 3: Show styled confirmation modal
        // ============================================================
        showActionConfirm({
            title: "Return to AEW for Revision?",
            message: "This report will be returned to the AEW for revision. <br><strong>The AEW will need to resubmit it after making changes.</strong>",
            details: detailsHtml,
            confirmText: "Return to AEW",
            confirmColor: "#C0392B",
            cancelText: "Cancel",
            onConfirm: async () => {
                flagBtn.disabled = true;
                flagBtn.textContent = "Processing...";

                try {
                    const tokenType = localStorage.getItem("token_type") || "bearer";

                    const url =
                        `${API_BASE_URL}/api/report-submissions/${selectedReport.report_id}/revision` +
                        `?validator_id=${encodeURIComponent(validatorId)}` +
                        `&validator_role=municipal_coordinator` +
                        `&remarks=${encodeURIComponent(remarks)}`;

                    const res = await fetch(url, {
                        method: "POST",
                        headers: {
                            "Accept": "application/json",
                            "Authorization": `${tokenType} ${accessToken}`
                        }
                    });

                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.detail || `HTTP ${res.status}`);
                    }

                    flagBtn.classList.add("active");
                    flagBtn.textContent = "Flagged ✓";

                    // ✅ Styled success modal
                    openModal(
                        "Return successful. The report is now available in the AEW dashboard under Flagged Reports. It will return to Municipal Pending after the AEW resubmits it.",
                        {
                            title: "Returned Successfully",
                            icon: "⚠",
                            iconBg: "#FEF3C7",
                            titleColor: "#D97706",
                        }
                    );

                    setTimeout(async () => {
                        closeReportDetail();
                        await loadPendingReports();
                        await loadAwaitingRevision();
                        await loadSentToProvincial();
                    }, 800);

                } catch (err) {
                    console.error("Flag error:", err);
                    openModal(err.message || "Failed to flag report.", {
                        title: "Flag Failed",
                        icon: "⚠",
                        iconBg: "#FEE2E2",
                        titleColor: "#C0392B",
                    });
                    flagBtn.classList.remove("active");
                    flagBtn.textContent = "Return to AEW for Revision";
                } finally {
                    flagBtn.disabled = false;
                }
            },
        });
    });
}



/* ============================================================
   APPROVE (INDIVIDUAL)
============================================================ */

function initApproveButton() {
    const approveBtn = document.getElementById("approveBtn");
    if (!approveBtn) return;

    approveBtn.addEventListener("click", () => {
        if (!selectedReport) {
            openModal("No report selected.", {
                title: "Error",
                icon: "⚠",
                iconBg: "#FEE2E2",
                titleColor: "#C0392B",
            });
            return;
        }

        const validatorId = localStorage.getItem("user_id");
        const accessToken = getAuthToken();

        if (!validatorId || !accessToken) {
            openModal("Please log in again.", {
                title: "Session Expired",
                icon: "⚠",
                iconBg: "#FEE2E2",
                titleColor: "#C0392B",
            });
            return;
        }

        const remarksInput = document.getElementById("remarksTextarea")?.value?.trim();
        const remarks = remarksInput || null;

        // ============================================================
        // ✅ STEP 1: Build structured details
        // ============================================================
        const reportTitle = selectedReport.title || `Report #${selectedReport.report_id}`;
        const municipality = selectedReport.municipality || "—";
        const commodity = selectedReport.commodity || "—";
        const intentCount = selectedReport.intent_count ?? "—";

        const detailsHtml = `
            <div style="display:grid; grid-template-columns: auto 1fr; gap: 6px 14px;">
                <span style="font-weight:700;">Report:</span>
                <span>${escapeHtml(reportTitle)}</span>
                <span style="font-weight:700;">Municipality:</span>
                <span>${escapeHtml(municipality)}</span>
                <span style="font-weight:700;">Commodity:</span>
                <span>${escapeHtml(commodity)}</span>
                <span style="font-weight:700;">Intents:</span>
                <span>${escapeHtml(String(intentCount))}</span>
                ${remarks ? `
                    <span style="font-weight:700;">Your remarks:</span>
                    <span style="font-style:italic;">"${escapeHtml(remarks)}"</span>
                ` : ""}
            </div>
        `;

        // ============================================================
        // ✅ STEP 2: Show styled confirmation modal
        // ============================================================
        showActionConfirm({
            title: "Approve & Send to Provincial?",
            message: "This report will be forwarded to the Provincial Coordinator for validation. <br><strong>This action cannot be undone.</strong>",
            details: detailsHtml,
            confirmText: "Approve & Send",
            confirmColor: "#2E7D32",
            cancelText: "Cancel",
            onConfirm: async () => {
                approveBtn.disabled = true;
                approveBtn.textContent = "Processing...";

                try {
                    const tokenType = localStorage.getItem("token_type") || "bearer";

                    const url =
                        `${API_BASE_URL}/api/report-submissions/${selectedReport.report_id}/approve` +
                        `?validator_id=${validatorId}` +
                        `&validator_role=municipal_coordinator` +
                        (remarks ? `&remarks=${encodeURIComponent(remarks)}` : "");

                    const res = await fetch(url, {
                        method: "POST",
                        headers: {
                            "Accept": "application/json",
                            "Authorization": `${tokenType} ${accessToken}`
                        }
                    });

                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.detail || `HTTP ${res.status}`);
                    }

                    approveBtn.classList.add("active");
                    approveBtn.textContent = "Approved ✓";

                    // ✅ Styled success modal
                    openModal(
                        "The report has been successfully forwarded to the Provincial Coordinator for validation.",
                        {
                            title: "Approved & Sent",
                            icon: "✓",
                            iconBg: "#D1FAE5",
                            titleColor: "#2E7D32",
                        }
                    );

                    setTimeout(async () => {
                        closeReportDetail();
                        await loadPendingReports();
                        await loadSentToProvincial();
                    }, 800);

                } catch (err) {
                    console.error("Approve error:", err);
                    openModal(err.message || "Failed to approve report.", {
                        title: "Approval Failed",
                        icon: "⚠",
                        iconBg: "#FEE2E2",
                        titleColor: "#C0392B",
                    });
                    approveBtn.classList.remove("active");
                    approveBtn.textContent = "Approve & Send to Provincial";
                } finally {
                    approveBtn.disabled = false;
                }
            },
        });
    });
}



/* ============================================================
   RESUBMIT TO PROVINCIAL
============================================================ */

function initResubmitButton() {
    const resubmitBtn = document.getElementById("resubmitReportBtn");
    if (!resubmitBtn) return;

    resubmitBtn.addEventListener("click", () => {
        if (!selectedReport) {
            openModal("No report selected.", {
                title: "Error",
                icon: "⚠",
                iconBg: "#FEE2E2",
                titleColor: "#C0392B",
            });
            return;
        }

        const remarksEl = document.getElementById("remarksTextarea");
        const remarksInput = remarksEl?.value?.trim() || "";
        const remarks = remarksInput || null;

        const reportTitle = selectedReport.title || `Report #${selectedReport.report_id}`;
        const municipality = selectedReport.municipality || "—";

        const detailsHtml = `
            <div style="display:grid; grid-template-columns: auto 1fr; gap: 6px 14px;">
                <span style="font-weight:700;">Report:</span>
                <span>${escapeHtml(reportTitle)}</span>
                <span style="font-weight:700;">Municipality:</span>
                <span>${escapeHtml(municipality)}</span>
                ${remarks ? `
                    <span style="font-weight:700;">Your remarks:</span>
                    <span style="font-style:italic;">"${escapeHtml(remarks)}"</span>
                ` : ""}
            </div>
        `;

        showActionConfirm({
            title: "Resubmit to Provincial?",
            message: "This report will be sent back to the Provincial Coordinator. <br><strong>Make sure all issues have been addressed.</strong>",
            details: detailsHtml,
            confirmText: "Yes, Resubmit",
            confirmColor: "#2E7D32",
            cancelText: "Cancel",
            onConfirm: async () => {
                resubmitBtn.disabled = true;
                resubmitBtn.textContent = "Processing...";

                try {
                    const url =
                        `${API_BASE_URL}/api/report-submissions/${selectedReport.report_id}/approve` +
                        `?validator_id=${localStorage.getItem("user_id")}` +
                        `&validator_role=municipal_coordinator` +
                        (remarks ? `&remarks=${encodeURIComponent(remarks)}` : "");

                    const res = await fetch(url, {
                        method: "POST",
                        headers: getAuthHeaders()
                    });

                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.detail || `HTTP ${res.status}`);
                    }

                    openModal(
                        "The report has been successfully resubmitted to the Provincial Coordinator.",
                        {
                            title: "Resubmitted",
                            icon: "✓",
                            iconBg: "#D1FAE5",
                            titleColor: "#2E7D32",
                        }
                    );

                    setTimeout(async () => {
                        closeReportDetail();
                        await loadPendingReports();
                        await loadAwaitingRevision();
                        await loadSentToProvincial();
                    }, 800);

                } catch (err) {
                    console.error("Resubmit error:", err);
                    openModal(err.message || "Failed to resubmit report.", {
                        title: "Resubmit Failed",
                        icon: "⚠",
                        iconBg: "#FEE2E2",
                        titleColor: "#C0392B",
                    });
                    resubmitBtn.disabled = false;
                    resubmitBtn.textContent = "Resubmit to Provincial";
                }
            },
        });
    });
}



/* ============================================================
   MODAL HELPER
============================================================ */

function openModal(message, options = {}) {
    const {
        title = "Success",
        icon = "✓",
        iconBg = "var(--green-light)",
        titleColor = "var(--green-dark)",
    } = options;

    const modal = document.getElementById("reportModal");
    const text = document.getElementById("reportModalText");
    const titleEl = document.getElementById("reportModalTitle");
    const iconEl = document.getElementById("reportModalIcon");
    const closeBtn = document.getElementById("reportModalConfirmBtn");

    // Fallback kung wala ang modal
    if (!modal || !text) {
        alert(message);
        return;
    }

    if (titleEl) {
        titleEl.textContent = title;
        titleEl.style.color = titleColor;
    }

    if (iconEl) {
        iconEl.textContent = icon;
        iconEl.style.background = iconBg;
    }

    text.textContent = message;

    if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        newCloseBtn.addEventListener("click", () => {
            modal.classList.remove("show");
        });
    }

    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.remove("show");
    };

    modal.classList.add("show");
}


/* ============================================================
   ACTION CONFIRMATION MODAL
============================================================ */

function showActionConfirm({
    title = "Confirm Action",
    message = "Are you sure?",
    details = null,
    confirmText = "Confirm",
    cancelText = "Cancel",
    confirmColor = "#5B6B4F",
    onConfirm,
    onCancel = null,
} = {}) {
    const modal = document.getElementById("actionConfirmModal");
    const titleEl = document.getElementById("actionConfirmTitle");
    const messageEl = document.getElementById("actionConfirmMessage");
    const detailsEl = document.getElementById("actionConfirmDetails");
    const okBtn = document.getElementById("actionConfirmOkBtn");
    const cancelBtn = document.getElementById("actionConfirmCancelBtn");

    // Fallback sa native confirm kung wala ang modal markup
    if (!modal || !titleEl || !messageEl || !okBtn || !cancelBtn) {
        ESaka.confirm(message, { title, confirmText }).then(ok => { if (ok && onConfirm) onConfirm(); });
        return;
    }

    titleEl.textContent = title;
    messageEl.innerHTML = message;

    if (details && details.trim()) {
        detailsEl.innerHTML = details;
        detailsEl.style.display = "block";
    } else {
        detailsEl.innerHTML = "";
        detailsEl.style.display = "none";
    }

    okBtn.textContent = confirmText;
    okBtn.style.background = confirmColor;
    cancelBtn.textContent = cancelText;

    // ✅ Clean clone para hindi mag-stack ng listeners sa sunod-sunod na actions
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newOkBtn.addEventListener("click", () => {
        modal.classList.remove("show");
        onConfirm && onConfirm();
    });

    newCancelBtn.addEventListener("click", () => {
        modal.classList.remove("show");
        onCancel && onCancel();
    });

    // Click outside to close (treated as cancel)
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove("show");
            onCancel && onCancel();
        }
    };

    modal.classList.add("show");
}




/* ============================================================
   📊 MUNICIPAL SUMMARY — PERIOD PICKER
============================================================ */

function getPeriodPreset(preset) {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = now.getDay(); // 0=Sun
    const diffToMonday = day === 0 ? -6 : 1 - day;
    startOfWeek.setDate(now.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    switch (preset) {
        case "this-week":
            return { start: startOfWeek, end: endOfWeek };

        case "last-week": {
            const s = new Date(startOfWeek);
            s.setDate(s.getDate() - 7);
            const e = new Date(s);
            e.setDate(s.getDate() + 6);
            e.setHours(23, 59, 59, 999);
            return { start: s, end: e };
        }

        case "this-month": {
            const s = new Date(now.getFullYear(), now.getMonth(), 1);
            const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            return { start: s, end: e };
        }

        case "last-30": {
            const e = new Date(now);
            e.setHours(23, 59, 59, 999);
            const s = new Date(now);
            s.setDate(s.getDate() - 29);
            s.setHours(0, 0, 0, 0);
            return { start: s, end: e };
        }

        case "this-quarter": {
            const q = Math.floor(now.getMonth() / 3);
            const s = new Date(now.getFullYear(), q * 3, 1);
            const e = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
            return { start: s, end: e };
        }

        case "all-time":
        default:
            return { start: null, end: null };
    }
}

function applyPeriodToInputs(period) {
    const startInput = document.getElementById("summaryPeriodStart");
    const endInput = document.getElementById("summaryPeriodEnd");

    if (startInput) startInput.value = period.start ? toDateInputValue(period.start) : "";
    if (endInput) endInput.value = period.end ? toDateInputValue(period.end) : "";
}

function initSummaryPeriodPicker() {
    const pills = document.querySelectorAll(".summary-quick-pills .filter-pill");
    const applyBtn = document.getElementById("applySummaryPeriodBtn");
    const printBtn = document.getElementById("printSummaryBtn");

    // Set default: this week
    const initial = getPeriodPreset("this-week");
    currentSummaryPeriod.start = initial.start;
    currentSummaryPeriod.end = initial.end;
    currentSummaryPeriod.preset = "this-week";
    applyPeriodToInputs(initial);

    pills.forEach(pill => {
        pill.addEventListener("click", () => {
            pills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");

            const preset = pill.dataset.period;
            const period = getPeriodPreset(preset);

            currentSummaryPeriod.start = period.start;
            currentSummaryPeriod.end = period.end;
            currentSummaryPeriod.preset = preset;

            applyPeriodToInputs(period);
            loadMunicipalSummary();
        });
    });

    if (applyBtn) {
        applyBtn.addEventListener("click", () => {
            const startInput = document.getElementById("summaryPeriodStart").value;
            const endInput = document.getElementById("summaryPeriodEnd").value;

            currentSummaryPeriod.start = startInput ? new Date(startInput) : null;
            currentSummaryPeriod.end = endInput ? new Date(endInput + "T23:59:59") : null;
            currentSummaryPeriod.preset = "custom";

            // Deselect preset pills
            pills.forEach(p => p.classList.remove("active"));

            loadMunicipalSummary();
        });
    }

    if (printBtn) {
        printBtn.addEventListener("click", () => {
            window.print();
        });
    }
}


/* ============================================================
   📊 LOAD MUNICIPAL SUMMARY
============================================================ */

async function loadMunicipalSummary() {
    const loadingCard = document.getElementById("summaryLoadingCard");
    const contentCard = document.getElementById("summaryContentCard");

    if (loadingCard) {
        loadingCard.style.display = "block";
        loadingCard.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #777; font-size: 15px;">
                Loading summary...
            </div>
        `;
    }
    if (contentCard) contentCard.style.display = "none";

    try {
        const params = new URLSearchParams();
        if (currentSummaryPeriod.start) {
            params.append("period_start", currentSummaryPeriod.start.toISOString());
        }
        if (currentSummaryPeriod.end) {
            params.append("period_end", currentSummaryPeriod.end.toISOString());
        }

        const url = `${MUNICIPAL_SUMMARY_ENDPOINT}?${params.toString()}`;
        console.log("Fetching municipal summary:", url);

        const data = await fetchJsonWithTimeout(
            url,
            { method: "GET", headers: getAuthHeaders({ "Accept": "application/json" }) },
            15000
        );

        currentSummaryData = data;

        if (loadingCard) loadingCard.style.display = "none";
        if (contentCard) contentCard.style.display = "block";

        renderMunicipalSummary(data);

    } catch (err) {
        console.error("Load municipal summary error:", err);

        if (loadingCard) {
            loadingCard.style.display = "block";
            loadingCard.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #C0392B; font-size: 15px;">
                    <div style="font-size: 40px; margin-bottom: 10px;">⚠️</div>
                    <strong>Failed to load summary.</strong>
                    <br><small style="color: #999;">${escapeHtml(err.message || "Please check the FastAPI server.")}</small>
                    <br><br>
                    <button onclick="loadMunicipalSummary()" style="padding: 8px 20px; background: #2E7D32; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        🔄 Retry
                    </button>
                </div>
            `;
        }
        if (contentCard) contentCard.style.display = "none";
    }
}


/* ============================================================
   📊 RENDER MUNICIPAL SUMMARY
   (Ported + adapted from AEW's renderReportSummary)
============================================================ */

function renderMunicipalSummary(data) {
    const container = document.getElementById("municipalSummaryContent");
    if (!container) return;

    const intents = Array.isArray(data.intents) ? data.intents : [];
    const municipality = data.municipality || "Municipality";
    const reportCount = data.report_count || 0;

    const periodStart = data.period_start ? new Date(data.period_start) : null;
    const periodEnd = data.period_end ? new Date(data.period_end) : null;

    // ============================================================
    // EMPTY STATE
    // ============================================================
    if (intents.length === 0) {
        container.innerHTML = `
            <div style="
                padding: 60px 40px;
                text-align: center;
                color: var(--muted);
            ">
                <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.4;">📊</div>
                <div style="font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 6px;">
                    No reports found for this period
                </div>
                <div style="font-size: 13px; line-height: 1.5;">
                    ${municipality} has no submissions between
                    <b>${periodStart ? formatDateLong(periodStart) : "the beginning"}</b>
                    and
                    <b>${periodEnd ? formatDateLong(periodEnd) : "now"}</b>.
                </div>
                <div style="margin-top: 20px; font-size: 12px; color: var(--muted);">
                    Try adjusting the period above.
                </div>
            </div>
        `;
        return;
    }

    // ============================================================
    // AGGREGATE METRICS
    // ============================================================
    const selectedCount = intents.length;

    const totalVolume = intents.reduce((sum, i) => sum + (Number(i.volume) || 0), 0);

    const uniqueFarmers = new Set(
        intents.map(i => i.farmer_id || i.farmer_name).filter(Boolean)
    );
    const uniqueFarmerCount = uniqueFarmers.size;

    // ✅ FIX: Count REPORTS pending municipal validation (not intents)
    const pendingReportIds = new Set();
    intents.forEach(i => {
        if (i.report_status === "SUBMITTED_MUNICIPAL_PENDING") {
            pendingReportIds.add(i.report_id);
        }
    });
    const pendingCount = Number(data.pending_report_count) || 0;

    const harvestedIntents = intents.filter(i =>
        (i.finalized_status || "").toUpperCase() === "HARVESTED"
    );

    const harvestedVolume = harvestedIntents.reduce((sum, i) => {
        const actual = Number(i.actual_harvest_volume);
        const planned = Number(i.volume);
        return sum + (actual > 0 ? actual : (planned || 0));
    }, 0);

    const harvestRate = selectedCount > 0
        ? Math.round((harvestedIntents.length / selectedCount) * 100)
        : 0;

    const totalActualHarvest = intents.reduce((sum, i) => {
        const v = Number(i.actual_harvest_volume);
        return sum + (v > 0 ? v : 0);
    }, 0);

    // ============================================================
    // BY COMMODITY
    // ============================================================
    const byCommodity = {};
    intents.forEach(intent => {
        const c = intent.commodity || "Unknown";
        if (!byCommodity[c]) byCommodity[c] = { count: 0, volume: 0, harvested: 0 };
        byCommodity[c].count += 1;
        byCommodity[c].volume += Number(intent.volume) || 0;
        if ((intent.finalized_status || "").toUpperCase() === "HARVESTED") {
            byCommodity[c].harvested += 1;
        }
    });

    // ============================================================
    // BY BARANGAY
    // ============================================================
    const byBarangay = {};
    intents.forEach(intent => {
        let b = intent.barangay;
        if (!b && intent.location) {
            b = String(intent.location).split(",")[0].trim();
        }
        if (!b) b = intent.municipality || "Unknown";

        if (!byBarangay[b]) byBarangay[b] = { count: 0, volume: 0 };
        byBarangay[b].count += 1;
        byBarangay[b].volume += Number(intent.volume) || 0;
    });

    // ============================================================
    // BY STATUS
    // ============================================================
    const byStatus = {
        "NOT PLANTED": { count: 0, volume: 0, label: "Not Planted", color: "#6c757d" },
        "PLANTED":     { count: 0, volume: 0, label: "Planted",     color: "#D97706" },
        "HARVESTED":   { count: 0, volume: 0, label: "Harvested",   color: "#2E7D32" },
        "MEDIATING":   { count: 0, volume: 0, label: "Mediating",   color: "#2980B9" }
    };

    intents.forEach(intent => {
        const s = (intent.finalized_status || "NOT PLANTED").toUpperCase();
        if (byStatus[s]) {
            byStatus[s].count += 1;
            byStatus[s].volume += Number(intent.volume) || 0;
        }
    });

    // ============================================================
    // YIELD PERFORMANCE
    // ============================================================
    const yieldPlanned = totalVolume;
    const yieldActual = totalActualHarvest;
    const hasActualData = yieldActual > 0;
    const variancePct = hasActualData && yieldPlanned > 0
        ? Math.round(((yieldActual - yieldPlanned) / yieldPlanned) * 100)
        : 0;

    // ============================================================
    // PLANTING WINDOW
    // ============================================================
    const plantingDates = intents
        .map(i => i.planting_date)
        .filter(Boolean)
        .map(d => new Date(d))
        .filter(d => !isNaN(d.getTime()));

    const harvestDates = intents
        .map(i => i.harvest_date)
        .filter(Boolean)
        .map(d => new Date(d))
        .filter(d => !isNaN(d.getTime()));

    // ============================================================
    // BUILD HTML
    // ============================================================
    const periodLabel = periodStart && periodEnd
        ? `${formatDateLong(periodStart)} – ${formatDateLong(periodEnd)}`
        : "All time";

    const preparedBy = localStorage.getItem("full_name")
        || localStorage.getItem("name")
        || localStorage.getItem("username")
        || "Municipal Coordinator";

    const generatedAt = new Date().toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit"
    });

    let html = "";

    // ------------------------------------------------------------
    // HEADER
    // ------------------------------------------------------------
    html += `
        <div style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 18px;
            padding-bottom: 14px;
            border-bottom: 1.5px solid var(--border-light);
            flex-wrap: wrap;
            gap: 12px;
        ">
            <div>
                <div style="
                    font-size: 14px;
                    font-weight: 800;
                    color: var(--green-dark);
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                ">📊 Municipal Summary</div>
                <div style="font-size: 11px; color: var(--muted); margin-top: 3px;">
                    ${escapeHtml(municipality)} • Coverage: ${escapeHtml(periodLabel)}
                </div>
            </div>
            <div style="
                font-size: 11px;
                font-weight: 700;
                color: var(--green-dark);
                background: var(--green-light);
                padding: 5px 12px;
                border-radius: 999px;
            ">
                ${reportCount} report${reportCount !== 1 ? "s" : ""} included
            </div>
        </div>
    `;

    // ------------------------------------------------------------
    // KPI ROW 1
    // ------------------------------------------------------------
    html += `
        <div class="summary-kpi-grid">
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">✓ Total Intents</div>
                <div class="summary-kpi-value">${selectedCount}</div>
                <div class="summary-kpi-subtext">Across ${reportCount} report${reportCount !== 1 ? "s" : ""}</div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">📦 Total Volume</div>
                <div class="summary-kpi-value">${formatKg(totalVolume)}</div>
                <div class="summary-kpi-subtext">Planned estimate</div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">👥 Unique Farmers</div>
                <div class="summary-kpi-value">${uniqueFarmerCount}</div>
                <div class="summary-kpi-subtext">Beneficiaries in period</div>
            </div>
        </div>
    `;

    // ------------------------------------------------------------
    // KPI ROW 2
    // ============================================================
    // ✅ FIXED: Reports count instead of intents count
    // ============================================================
    html += `
        <div class="summary-kpi-grid">
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">⏳ Pending Reports</div>
                <div class="summary-kpi-value" style="color:${pendingCount > 0 ? "#D97706" : "#2E7D32"};">
                    ${pendingCount}
                </div>
                <div class="summary-kpi-subtext">
                    ${pendingCount === 1 ? "report awaiting your review" : "reports awaiting your review"}
                </div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">🌾 Harvested Volume</div>
                <div class="summary-kpi-value" style="color:#2E7D32;">${formatKg(harvestedVolume)}</div>
                <div class="summary-kpi-subtext">${harvestedIntents.length} of ${selectedCount} harvested</div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">🌾 Harvest Rate</div>
                <div class="summary-kpi-value" style="color:${
                    harvestRate === 100 ? "#2E7D32"
                    : harvestRate > 0 ? "#D97706"
                    : "#6c757d"
                };">${harvestRate}%</div>
                <div class="summary-kpi-subtext">Completion ratio</div>
            </div>
        </div>
    `;

    // ------------------------------------------------------------
    // BREAKDOWNS
    // ------------------------------------------------------------
    html += `<div class="summary-breakdown-grid">`;

    // By Commodity
    html += `
        <div>
            <div class="summary-breakdown-title">🌾 By Commodity</div>
            <div class="summary-breakdown-body">
    `;
    const commodityEntries = Object.entries(byCommodity).sort((a, b) => b[1].volume - a[1].volume);
    if (commodityEntries.length === 0) {
        html += `<span style="color: var(--muted); font-style: italic;">No data.</span>`;
    } else {
        commodityEntries.forEach(([name, d]) => {
            html += `
                <div class="summary-breakdown-row">
                    <span style="font-weight: 600;">${escapeHtml(name)}</span>
                    <span style="font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums;">
                        ${d.count} · <b style="color:var(--green-dark);">${formatKg(d.volume)}</b>
                    </span>
                </div>
            `;
        });
    }
    html += `</div></div>`;

    // By Barangay
    html += `
        <div>
            <div class="summary-breakdown-title">📍 By Barangay</div>
            <div class="summary-breakdown-body">
    `;
    const barangayEntries = Object.entries(byBarangay).sort((a, b) => b[1].volume - a[1].volume);
    if (barangayEntries.length === 0) {
        html += `<span style="color: var(--muted); font-style: italic;">No data.</span>`;
    } else if (barangayEntries.length === 1) {
        html += `
            <div style="color: var(--muted); font-style: italic; font-size: 12px;">
                All intents from <b>${escapeHtml(barangayEntries[0][0])}</b>
            </div>
        `;
    } else {
        barangayEntries.forEach(([name, d]) => {
            html += `
                <div class="summary-breakdown-row">
                    <span style="font-weight: 600;">📍 ${escapeHtml(name)}</span>
                    <span style="font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums;">
                        ${d.count} · <b style="color:var(--green-dark);">${formatKg(d.volume)}</b>
                    </span>
                </div>
            `;
        });
    }
    html += `</div></div>`;

    // By Status
    html += `
        <div>
            <div class="summary-breakdown-title">📋 By Finalized Status</div>
            <div class="summary-breakdown-body">
    `;
    Object.values(byStatus).forEach(d => {
        const isZero = d.count === 0;
        html += `
            <div class="summary-breakdown-row" style="opacity:${isZero ? 0.45 : 1};">
                <span style="font-weight: 600; color:${isZero ? 'var(--muted)' : 'var(--ink)'};">
                    <span style="
                        display: inline-block;
                        width: 8px; height: 8px;
                        border-radius: 50%;
                        background: ${d.color};
                        margin-right: 8px;
                    "></span>
                    ${d.label}
                </span>
                <span style="font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums;">
                    ${d.count} · <b style="color:${isZero ? 'var(--muted)' : d.color};">${formatKg(d.volume)}</b>
                </span>
            </div>
        `;
    });
    html += `</div></div>`;

    html += `</div>`; // end breakdown grid

    // ------------------------------------------------------------
    // INSIGHTS — Yield Performance + Planting Window
    // ------------------------------------------------------------
    html += `<div class="summary-insight-grid">`;

    // Yield Performance
    html += `<div class="summary-insight-card green">`;
    html += `
        <div style="
            font-size: 11px;
            font-weight: 700;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin-bottom: 10px;
            padding-bottom: 6px;
            border-bottom: 1px solid var(--border-light);
        ">📊 Yield Performance</div>
    `;
    if (hasActualData) {
        let varianceColor = "#2E7D32";
        let varianceIcon = "↑";
        let varianceLabel = "surplus";
        if (variancePct < 0) {
            varianceColor = "#C0392B";
            varianceIcon = "↓";
            varianceLabel = "shortfall";
        } else if (variancePct === 0) {
            varianceColor = "#6c757d";
            varianceIcon = "→";
            varianceLabel = "on target";
        }

        html += `
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: var(--muted);">Expected (planned):</span>
                <b>${yieldPlanned.toLocaleString("en-US")} kg</b>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="color: var(--muted);">Actual (harvested):</span>
                <b>${yieldActual.toLocaleString("en-US")} kg</b>
            </div>
            <div style="
                display: inline-block;
                padding: 4px 12px;
                background: ${varianceColor}15;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 700;
                color: ${varianceColor};
            ">
                ${varianceIcon} ${Math.abs(variancePct)}% ${varianceLabel}
            </div>
            <div style="margin-top: 8px; font-size: 11px; color: var(--muted); font-style: italic;">
                Based on ${harvestedIntents.length} of ${selectedCount} harvested
            </div>
        `;
    } else {
        html += `<span style="color: var(--muted); font-style: italic;">No actual harvest volume recorded yet.</span>`;
    }
    html += `</div>`;

    // Planting Window
    html += `<div class="summary-insight-card orange">`;
    html += `
        <div style="
            font-size: 11px;
            font-weight: 700;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin-bottom: 10px;
            padding-bottom: 6px;
            border-bottom: 1px solid var(--border-light);
        ">📅 Planting Window</div>
    `;

    if (plantingDates.length > 0) {
        const earliest = new Date(Math.min.apply(null, plantingDates));
        const latest = new Date(Math.max.apply(null, plantingDates));
        const spanDays = Math.round((latest - earliest) / (1000 * 60 * 60 * 24));

        html += `
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: var(--muted);">🌱 Earliest:</span>
                <b>${formatDateLong(earliest)}</b>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: var(--muted);">Latest:</span>
                <b>${formatDateLong(latest)}</b>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--muted);">Span:</span>
                <b>${spanDays} day${spanDays !== 1 ? "s" : ""}</b>
            </div>
        `;

        if (harvestDates.length > 0) {
            const earliestH = new Date(Math.min.apply(null, harvestDates));
            const latestH = new Date(Math.max.apply(null, harvestDates));
            const spanH = Math.round((latestH - earliestH) / (1000 * 60 * 60 * 24));

            html += `
                <div style="
                    margin-top: 10px;
                    padding-top: 10px;
                    border-top: 1px dashed var(--border-light);
                ">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: var(--muted);">🌾 Harvest earliest:</span>
                        <b>${formatDateLong(earliestH)}</b>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: var(--muted);">Harvest latest:</span>
                        <b>${formatDateLong(latestH)}</b>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--muted);">Harvest span:</span>
                        <b>${spanH} day${spanH !== 1 ? "s" : ""}</b>
                    </div>
                </div>
            `;
        }
    } else {
        html += `<span style="color: var(--muted); font-style: italic;">No planting dates available.</span>`;
    }
    html += `</div>`;

    html += `</div>`; // end insights grid

    // ------------------------------------------------------------
    // FOOTER
    // ------------------------------------------------------------
    html += `
        <div class="summary-footer">
            <div>
                <b style="color: var(--ink);">Prepared by:</b> ${escapeHtml(preparedBy)}
            </div>
            <div>
                <b style="color: var(--ink);">Generated:</b> ${escapeHtml(generatedAt)}
            </div>
        </div>
    `;

    container.innerHTML = html;
}

    /* ============================================================
   PROFILE & AVATAR PERSISTENCE (Municipal Coordinator)
============================================================ */

function initProfileModal() {
    const openProfileBtn = document.getElementById("openProfileBtn");
    const profileModal = document.getElementById("profileModal");
    const closeProfileModalBtn = document.getElementById("closeProfileModalBtn");
    const profileForm = document.getElementById("profileForm");

    const profileUsername = document.getElementById("profileUsername");
    const profileFirstName = document.getElementById("profileFirstName");
    const profileLastName = document.getElementById("profileLastName");
    const avatarOptions = document.querySelectorAll(".avatar-option");

    const customAlertModal = document.getElementById("customAlertModal");
    const customAlertText = document.getElementById("customAlertText");
    const closeCustomAlertBtn = document.getElementById("closeCustomAlertBtn");

    if (!openProfileBtn || !profileModal) return;

    function showCustomAlert(message) {
        if (customAlertText) customAlertText.textContent = message;
        if (customAlertModal) customAlertModal.classList.add("show");
    }

    closeCustomAlertBtn?.addEventListener("click", () => {
        customAlertModal?.classList.remove("show");
    });

    let currentSelectedSrc = localStorage.getItem("user_avatar_src") || "../images/1.png";

    function loadSavedProfile() {
        // Load saved display name
        const savedName = localStorage.getItem("user_display_name");
        if (savedName) {
            const displayNameEl = document.getElementById("userDisplayName");
            if (displayNameEl) displayNameEl.textContent = savedName;
        }

        // Load saved avatar
        const savedAvatar = localStorage.getItem("user_avatar_src");
        if (savedAvatar) {
            currentSelectedSrc = savedAvatar;
            const avatarBox = document.querySelector(".user-info .avatar");
            if (avatarBox) {
                avatarBox.innerHTML = '<img src="' + savedAvatar + '" alt="Avatar">';
                avatarBox.style.background = "transparent";
            }
        }
    }

    loadSavedProfile();

    // Open profile modal
    openProfileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const currentName = document.getElementById("userDisplayName")?.textContent || "Juan Dela Cruz";
        const nameParts = currentName.trim().split(" ");

        if (profileFirstName) profileFirstName.value = nameParts[0] || "";
        if (profileLastName) profileLastName.value = nameParts.slice(1).join(" ") || "";

        if (profileUsername) {
            profileUsername.value = localStorage.getItem("username") || localStorage.getItem("user_id") || "mcoord_user_01";
        }

        avatarOptions.forEach(opt => {
            opt.classList.toggle("selected", opt.dataset.avatarImg === currentSelectedSrc);
        });

        profileModal.classList.add("show");
    });

    // Avatar selection
    avatarOptions.forEach(opt => {
        opt.addEventListener("click", () => {
            avatarOptions.forEach(el => el.classList.remove("selected"));
            opt.classList.add("selected");
            currentSelectedSrc = opt.dataset.avatarImg;
        });
    });

    // Close modal
    closeProfileModalBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        profileModal.classList.remove("show");
    });

    // Close on overlay click
    profileModal.addEventListener("click", (e) => {
        if (e.target === profileModal) profileModal.classList.remove("show");
    });

    // Save profile
    profileForm?.addEventListener("submit", (e) => {
        e.preventDefault();

        const fName = profileFirstName.value.trim();
        const lName = profileLastName.value.trim();
        if (!fName || !lName) {
            showCustomAlert("Pakisagutan ang lahat ng kinakailangang fields.");
            return;
        }

        localStorage.setItem("user_display_name", fName + " " + lName);
        localStorage.setItem("user_avatar_src", currentSelectedSrc);

        loadSavedProfile();

        profileModal.classList.remove("show");
        showCustomAlert("Profile updated and saved successfully!");
    });
}

/* ============================================================
   INITIALIZATION
============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
    console.log("Municipal dashboard loaded.");

    const role = localStorage.getItem("role");
    if (role !== "Municipal Coordinator" && role !== "Municipal") {
        const dashboards = {
            "Agricultural Extension Worker": "aew.html",
            "AEW": "aew.html",
            "Provincial Coordinator": "provincial.html",
            "Provincial": "provincial.html",
            "DA-RFO Officer": "da.html",
            "DA-RFO": "da.html",
            "System Administrator": "system-admin.html",
        };
        const dashboard = dashboards[role];
        if (dashboard) {
            window.location.replace(dashboard);
            return;
        }
    }

    initSidebar();
    initViewNavigation();
    initMap();
    loadMunicipalityMapData();
    setupUserProfile();
    initProfileModal(); 
    initSearch();
    initBulkActions();
    initFlagButton();
    initApproveButton();
    initSentToProvincialFilter();
    initResubmitButton();
    initSummaryPeriodPicker();

    const backBtn = document.getElementById("backToPendingBtn");
    if (backBtn) {
        backBtn.addEventListener("click", closeReportDetail);
    }

    const modalConfirm = document.getElementById("reportModalConfirmBtn");
    if (modalConfirm) {
        modalConfirm.addEventListener("click", () => {
            document.getElementById("reportModal")?.classList.remove("show");
        });
    }

    await Promise.allSettled([
        loadPendingReports(),
        loadAwaitingRevision(),
        loadSentToProvincial()
    ]);

    // Preload summary if currently visible
    const summaryView = document.getElementById("view-summary");
    if (summaryView && summaryView.classList.contains("active-view")) {
        loadMunicipalSummary();
    }

    document.addEventListener("click", (e) => {
        if (e.target && e.target.id === "reportSummaryToggle") {
            const body = document.getElementById("reportSummaryBody");
            const toggle = e.target;
            if (!body) return;

            const isHidden = body.style.display === "none";
            body.style.display = isHidden ? "block" : "none";
            toggle.textContent = isHidden ? "Hide ▲" : "Show ▼";
        }
    });

});
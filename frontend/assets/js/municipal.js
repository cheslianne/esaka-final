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

/* ============================================================
   USER PROFILE — user-scoped avatar storage
============================================================ */

function getScopedAvatarKey() {
    const userId = localStorage.getItem("user_id") || "anonymous";
    return `user_avatar_src_${userId}`;
}

function setupUserProfile() {
    const storedName =
        localStorage.getItem("user_display_name") ||
        localStorage.getItem("full_name") ||
        localStorage.getItem("name") ||
        localStorage.getItem("username");

    const storedRole = localStorage.getItem("role");
    const storedAvatar = localStorage.getItem(getScopedAvatarKey());

    const nameEl = document.getElementById("userDisplayName");
    const roleEl = document.getElementById("userDisplayRole");
    const initEl = document.getElementById("userDisplayInitials");

    if (nameEl && storedName) nameEl.textContent = storedName;
    if (roleEl && storedRole) roleEl.textContent = formatRole(storedRole);

    if (initEl) {
        if (storedAvatar) {
            initEl.innerHTML = `<img src="${storedAvatar}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
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
    const pendingCount = pendingReports.filter(report => {
        const s = String(report.status || "").toUpperCase();
        return s === "SUBMITTED_MUNICIPAL_PENDING" || s === "FOR_MUNICIPAL_VALIDATION";
    }).length;

    const revisionCount = awaitingRevisionReports.length;
    const provincialCount = sentReports.length;

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

    // Hide the reports header and the three list views; show the detail view.
    const mainHeader = document.getElementById("reportsMainHeader");
    if (mainHeader) mainHeader.style.display = "none";

    // Keep the individual report screen isolated: dashboard KPI cards belong only
    // to the reports list and must not remain above the report details.
    const statusCards = document.getElementById("municipalStatusCards");
    if (statusCards) statusCards.style.display = "none";

    const pendingView = document.getElementById("pendingReportsView");
    const sentView = document.getElementById("sentToProvincialView");
    const awaitingView = document.getElementById("awaitingRevisionView");
    const detailView = document.getElementById("individualDetailView");

    if (pendingView) pendingView.style.display = "none";
    if (sentView) sentView.style.display = "none";
    if (awaitingView) awaitingView.style.display = "none";
    if (detailView) {
        detailView.classList.remove("hidden-element");
        detailView.style.display = "block";
    }

    const summaryWrapper = document.getElementById("reportSummaryCardWrapper");
    const summaryBody = document.getElementById("reportSummaryBody");
    const historyContainer = document.getElementById("validationTimelineContainer");

    if (summaryWrapper) summaryWrapper.style.display = "none";
    if (summaryBody) summaryBody.innerHTML = "";
    const varPanel = document.getElementById("varianceRemarksPanel");
    if (varPanel) varPanel.style.display = "none";
    if (historyContainer) {
        historyContainer.innerHTML = `
            <div style="color: var(--muted); font-style: italic; font-size: 13px;">
                Loading history...
            </div>
        `;
    }

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

    const statusUpper = String(report.status || "").toUpperCase();
    const isMunicipalPending  = statusUpper === "SUBMITTED_MUNICIPAL_PENDING";
    const isProvincialFlagged = statusUpper === "SUBMITTED_PROVINCIAL_FLAGGED";
    const isRegionalFlagged   = statusUpper === "SUBMITTED_REGIONAL_FLAGGED";
    const isMunicipalFlagged  = statusUpper === "SUBMITTED_MUNICIPAL_FLAGGED";

    const canTakeAction = isMunicipalPending || isProvincialFlagged || isRegionalFlagged;

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
            remarksEl.readOnly = true;
            remarksEl.disabled = true;
            remarksEl.style.background = "#F6F3EB";
            remarksEl.style.color = "var(--muted)";
            remarksEl.style.cursor = "not-allowed";
            remarksEl.placeholder = "No action available for this status.";
            if (remarksRow) remarksRow.style.display = "none";
        }
    }

    if (resubmitBtn) resubmitBtn.style.display = "none";

    if (isMunicipalPending) {
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
        if (backBtn) { backBtn.style.display = "inline-flex"; backBtn.textContent = "Back to Reports"; }
        if (flagBtn) flagBtn.style.display = "none";
        if (approveBtn) approveBtn.style.display = "none";
    } else if (isProvincialFlagged) {
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
        if (backBtn) { backBtn.style.display = "inline-flex"; backBtn.textContent = "Return"; }
        if (flagBtn) flagBtn.style.display = "none";
        if (approveBtn) approveBtn.style.display = "none";
        if (resubmitBtn) resubmitBtn.style.display = "none";

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
        if (backBtn) { backBtn.style.display = "inline-flex"; backBtn.textContent = "Back"; }
        if (flagBtn) flagBtn.style.display = "none";
        if (approveBtn) approveBtn.style.display = "none";
    }

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

        if (statusEl && full.status) {
            const fullSl = statusLabelAndClass(full.status);
            statusEl.innerHTML = `<span class="status-pill ${fullSl.cls}">${escapeHtml(fullSl.text)}</span>`;
        }

        renderAttachments(full.attachments || []);

        renderDetailIntents(full.planting_intents || []);

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
    const plural = (n, word) => `${n} ${word}${n !== 1 ? "s" : ""}`;
    const statusOf = (i) => String(i.finalized_status_at_submission || i.finalized_status || "NOT PLANTED").toUpperCase();

    if (coveragePeriodEl) {
        const submittedAt = meta?.submitted_at || meta?.created_at;
        const reportDate = submittedAt ? new Date(submittedAt) : null;
        if (reportDate && !isNaN(reportDate.getTime())) {
            const weekStart = new Date(reportDate);
            weekStart.setDate(reportDate.getDate() - 6);
            const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            coveragePeriodEl.textContent = `Coverage: ${fmt(weekStart)} – ${fmt(reportDate)}`;
        } else {
            coveragePeriodEl.textContent = "Coverage: —";
        }
    }

    const totalVolume = selected.reduce((sum, i) => sum + (Number(i.volume) || 0), 0);
    const uniqueFarmerCount = new Set(selected.map(i => i.farmer_id || i.farmer_name).filter(Boolean)).size;

    const byCommodity = {};
    const byBarangay = {};
    selected.forEach(intent => {
        const c = intent.commodity || "Unknown";
        if (!byCommodity[c]) byCommodity[c] = { count: 0, volume: 0 };
        byCommodity[c].count += 1;
        byCommodity[c].volume += Number(intent.volume) || 0;

        let b = intent.barangay;
        if (!b && intent.location) b = String(intent.location).split(",")[0].trim();
        if (!b) b = intent.municipality || "Unknown";
        if (!byBarangay[b]) byBarangay[b] = { count: 0, volume: 0 };
        byBarangay[b].count += 1;
        byBarangay[b].volume += Number(intent.volume) || 0;
    });

    const breakdownRows = (map, icon) => {
        const entries = Object.entries(map).sort((a, b) => b[1].volume - a[1].volume);
        if (entries.length === 0) return `<span style="color:var(--muted);font-style:italic;">No data.</span>`;
        return entries.map(([name, d]) => `
            <div class="summary-seven-row">
                <span style="font-weight:600;">${icon}${escapeHtml(name)}</span>
                <span style="color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap;">
                    ${d.count} · <b style="color:var(--ink);">${formatKg(d.volume)}</b>
                </span>
            </div>`).join("");
    };

    const harvested = selected.filter(i => statusOf(i) === "HARVESTED");
    const withActual = harvested.filter(i => Number(i.actual_harvest_volume) > 0);
    const yieldActual = withActual.reduce((s, i) => s + Number(i.actual_harvest_volume), 0);
    const yieldPlanned = withActual.reduce((s, i) => s + (Number(i.volume) || 0), 0);

    let yieldHtml;
    if (yieldActual > 0) {
        const pct = yieldPlanned > 0 ? Math.round(((yieldActual - yieldPlanned) / yieldPlanned) * 100) : 0;
        let color = "#16A34A", icon = "↑", label = "surplus";
        if (pct < 0) { color = "#DC2626"; icon = "↓"; label = "shortfall"; }
        else if (pct === 0) { color = "#6c757d"; icon = "→"; label = "on target"; }
        
        yieldHtml = `
            <div class="summary-seven-row"><span style="color:var(--muted);">Expected (planned):</span><b>${yieldPlanned.toLocaleString("en-US")} kg</b></div>
            <div class="summary-seven-row"><span style="color:var(--muted);">Actual (harvested):</span><b>${yieldActual.toLocaleString("en-US")} kg</b></div>
            <div style="margin-top:10px;">
                <span style="display:inline-block;padding:4px 10px;background:${color}15;border-radius:6px;font-size:11px;font-weight:700;color:${color};">
                    ${icon} ${Math.abs(pct)}% ${label}
                </span>
            </div>
            <div style="margin-top:8px;font-size:10px;color:var(--muted);font-style:italic;">
                Based on ${withActual.length} of ${selectedCount} harvested
            </div>`;
    } else {
        yieldHtml = `<span style="color:var(--muted);font-style:italic;">No actual harvest volume recorded yet.</span>`;
    }

    const toDates = (key) => selected.map(i => i[key]).filter(Boolean).map(d => new Date(`${String(d).slice(0, 10)}T00:00:00`)).filter(d => !isNaN(d.getTime()));
    const plantingDates = toDates("planting_date");
    const harvestDates = toDates("harvest_date");
    const span = (arr) => {
        const lo = new Date(Math.min.apply(null, arr));
        const hi = new Date(Math.max.apply(null, arr));
        return { lo, hi, days: Math.round((hi - lo) / 86400000) };
    };
    const row = (label, value) => `<div class="summary-seven-row"><span style="color:var(--muted);">${label}</span><b>${value}</b></div>`;

    let windowHtml;
    if (plantingDates.length > 0) {
        const p = span(plantingDates);
        windowHtml = row("🌱 Earliest:", formatDate(p.lo)) + row("Latest:", formatDate(p.hi)) + row("Span:", plural(p.days, "day"));
        if (harvestDates.length > 0) {
            const hv = span(harvestDates);
            windowHtml += `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border-light);">`
                + row("🌾 Harvest earliest:", formatDate(hv.lo))
                + row("Harvest latest:", formatDate(hv.hi))
                + row("Harvest span:", plural(hv.days, "day"))
                + `</div>`;
        }
    } else {
        windowHtml = `<span style="color:var(--muted);font-style:italic;">No planting dates available.</span>`;
    }

    let html = `
        <div class="summary-seven-grid">
            <div class="summary-seven-card">
                <div class="summary-seven-title">✓ SELECTED INTENTS</div>
                <div class="summary-seven-value">${selectedCount}</div>
                <div class="summary-seven-sub">${selectedCount === 1 ? "Intent included" : "Intents included"}</div>
            </div>
            <div class="summary-seven-card">
                <div class="summary-seven-title">📦 TOTAL VOLUME</div>
                <div class="summary-seven-value">${formatKg(totalVolume)}</div>
                <div class="summary-seven-sub">Sum of estimated volumes</div>
            </div>
            <div class="summary-seven-card">
                <div class="summary-seven-title">👥 UNIQUE FARMERS</div>
                <div class="summary-seven-value">${uniqueFarmerCount}</div>
                <div class="summary-seven-sub">${uniqueFarmerCount === 1 ? "1 beneficiary" : `${uniqueFarmerCount} beneficiaries`}</div>
            </div>
            <div class="summary-seven-card">
                <div class="summary-seven-title">🌾 BY COMMODITY</div>
                ${breakdownRows(byCommodity, "")}
            </div>
            <div class="summary-seven-card">
                <div class="summary-seven-title">📍 BY BARANGAY</div>
                ${breakdownRows(byBarangay, "📍 ")}
            </div>
            <div class="summary-seven-card">
                <div class="summary-seven-title">📊 YIELD PERFORMANCE</div>
                ${yieldHtml}
            </div>
            <div class="summary-seven-card">
                <div class="summary-seven-title">📅 PLANTING WINDOW</div>
                ${windowHtml}
            </div>
        </div>`;

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
   DATE VARIANCE HELPERS
============================================================ */

function isIntentDateVariance(plan, actual) {
    if (!plan || !actual) return false;
    return String(plan).slice(0, 10) !== String(actual).slice(0, 10);
}

function getDayDiff(plannedDate, actualDate) {
    if (!plannedDate || !actualDate) return null;
    const p = new Date(`${String(plannedDate).slice(0, 10)}T00:00:00`);
    const a = new Date(`${String(actualDate).slice(0, 10)}T00:00:00`);
    if (isNaN(p.getTime()) || isNaN(a.getTime())) return null;
    return Math.round((a - p) / 86400000);
}

function formatDateSafe(value) {
    if (!value) return "—";
    const iso = String(value).slice(0, 10);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getVarianceRemark(intent) {
    return String((intent && (intent.comment_snapshot || intent.comment)) || "").trim();
}

function getIntentVariances(intent) {
    const out = [];
    if (isIntentDateVariance(intent.planting_date, intent.actual_planting_date)) {
        out.push({ label: "Planting", planned: intent.planting_date, actual: intent.actual_planting_date,
                   diff: getDayDiff(intent.planting_date, intent.actual_planting_date) });
    }
    if (isIntentDateVariance(intent.harvest_date, intent.actual_harvest_date)) {
        out.push({ label: "Harvest", planned: intent.harvest_date, actual: intent.actual_harvest_date,
                   diff: getDayDiff(intent.harvest_date, intent.actual_harvest_date) });
    }
    return out;
}

function renderVarianceDateBox(v) {
    let diffLabel = "", diffColor = "#6c757d";
    if (v.diff) {
        const n = Math.abs(v.diff);
        diffLabel = `${n} day${n === 1 ? "" : "s"} ${v.diff > 0 ? "late" : "early"}`;
        diffColor = v.diff > 0 ? "#D97706" : "#2980B9";
    }
    return `
        <div class="variance-date-box">
            <div style="font-size:10px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">${escapeHtml(v.label)}</div>
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--muted);">Planned:</span><b>${escapeHtml(formatDateSafe(v.planned))}</b></div>
            <div style="display:flex;justify-content:space-between;gap:8px;margin-top:2px;"><span style="color:var(--muted);">Actual:</span><b>${escapeHtml(formatDateSafe(v.actual))}</b></div>
            ${diffLabel ? `<div style="margin-top:4px;padding-top:4px;border-top:1px dashed #FCD34D;font-size:11px;font-weight:700;text-align:right;color:${diffColor};">${diffLabel}</div>` : ""}
        </div>`;
}

/* ============================================================
   DATE VARIANCE REMARKS PANEL
============================================================ */

function renderVarianceRemarksPanel(intents) {
    const panel = document.getElementById("varianceRemarksPanel");
    const body = document.getElementById("varianceRemarksBody");
    if (!panel || !body) return;

    const withVariances = (Array.isArray(intents) ? intents : []).filter(i => getIntentVariances(i).length > 0 || getVarianceRemark(i));
    
    if (withVariances.length === 0) {
        panel.style.display = "none";
        body.innerHTML = "";
        return;
    }
    panel.style.display = "block";

    body.innerHTML = withVariances.map(intent => {
        const variances = getIntentVariances(intent);
        const remark = getVarianceRemark(intent);
        
        let boxesHtml = "";
        variances.forEach(v => {
            const isPlanting = v.label === "Planting";
            const borderColor = isPlanting ? "#10B981" : "#3B82F6"; // Green for planting, Blue for harvest
            const diffColor = v.diff > 0 ? "#D97706" : "#2563EB";
            
            boxesHtml += `
                <div style="background:#FFF;border:1px solid var(--border);border-radius:8px;overflow:hidden;flex:1;">
                    <div style="padding:8px 12px;background:#F8FAFC;border-bottom:1px solid var(--border);font-size:10px;font-weight:800;color:#64748B;text-transform:uppercase;">
                        ${isPlanting ? 'PLANTING' : 'HARVEST'}
                    </div>
                    <div style="padding:12px;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                            <span style="font-size:12px;color:var(--muted);">Planned:</span>
                            <b style="font-size:12px;color:var(--ink);">${escapeHtml(formatDateSafe(v.planned))}</b>
                        </div>
                        <div style="display:flex;justify-content:space-between;">
                            <span style="font-size:12px;color:var(--muted);">Actual:</span>
                            <b style="font-size:12px;color:var(--ink);">${escapeHtml(formatDateSafe(v.actual))}</b>
                        </div>
                        ${v.diff ? `<div style="margin-top:8px;font-size:11px;font-weight:700;color:${diffColor};text-align:right;">${Math.abs(v.diff)} day${Math.abs(v.diff)===1?'':'s'} ${v.diff > 0 ? 'late' : 'early'}</div>` : ""}
                    </div>
                </div>
            `;
        });

        return `
            <div class="variance-card" style="background:#FFFCF5; border:1px solid #FCD34D; border-radius:10px; overflow:hidden;">
                <div style="padding:12px 16px; background:#FFF; border-bottom:1px solid #FCD34D; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:12px;font-weight:800;color:#92400E;background:#FEF3C7;padding:2px 8px;border-radius:6px;">#${escapeHtml(String(intent.planting_intent_id ?? "—"))}</span>
                    <span style="font-size:13px;font-weight:700;color:var(--ink);">${escapeHtml(intent.farmer_name || "N/A")}</span>
                    <span style="font-size:12px;color:var(--muted);">· ${escapeHtml(intent.commodity || "N/A")}</span>
                    <span class="variance-badge" style="margin-left:auto;">⚠️ ${variances.map(v => v.label).join(" + ")}</span>
                </div>
                <div style="padding:16px; display:flex; gap:12px; flex-wrap:wrap;">
                    ${boxesHtml}
                </div>
                ${remark ? `
                <div style="padding:12px 16px; background:#FFF; border-top:1px dashed #FCD34D;">
                    <div style="font-size:10px;font-weight:800;color:#92400E;text-transform:uppercase;margin-bottom:4px;">Remark</div>
                    <div style="font-size:12px;color:var(--ink);">${escapeHtml(remark)}</div>
                </div>` : `
                <div style="padding:12px 16px; background:#FFF; border-top:1px dashed #FCD34D; font-style:italic; font-size:12px; color:#94A3B8;">
                    No remark recorded for this variance.
                </div>`}
            </div>
        `;
    }).join("");
}


/* ============================================================
   RENDER DETAIL INTENTS
============================================================ */

function renderDetailIntents(intents) {
    const tbody = document.getElementById("detailReportIntentsBody");
    if (!tbody) return;

    // I-set ang badge para sa date variance
    const badgeEl = document.getElementById("detailVarianceBadge");
    if (badgeEl) {
        const hasVariances = intents.some(i => getIntentVariances(i).length > 0 || getVarianceRemark(i));
        badgeEl.style.display = hasVariances ? "inline-block" : "none";
    }

    if (!Array.isArray(intents) || intents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="padding:20px; text-align:center; color:#999;">No intents included.</td></tr>`;
        renderVarianceRemarksPanel([]);
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

        const actualPlanting = intent.actual_planting_date ? formatDate(intent.actual_planting_date) : null;
        const actualHarvest = intent.actual_harvest_date ? formatDate(intent.actual_harvest_date) : null;

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

        const statusUpper = (intent.finalized_status_at_submission || intent.finalized_status || "NOT PLANTED").toUpperCase();
        let statusText = "Not Planted";
        let bgColor = "#6c757d";
        if (statusUpper === "PLANTED")        { statusText = "Planted";    bgColor = "#D97706"; }
        else if (statusUpper === "HARVESTED") { statusText = "Harvested";  bgColor = "#2E7D32"; }
        else if (statusUpper === "MEDIATING") { statusText = "Mediating";  bgColor = "#2980B9"; }

        const varianceLabels = getIntentVariances(intent).map(v => v.label);
        const varianceCell = varianceLabels.length
            ? `<span class="variance-badge">⚠️ ${varianceLabels.join(" + ")}</span>`
            : `<span style="color:#9CA3AF;">—</span>`;

        // DITO ANG TAMANG PAG-GAMIT NG BACKTICKS PARA SA HTML
        return `
            <tr>
                <td class="center-col" style="font-weight: 600;">
                    #${escapeHtml(String(id))}
                </td>
                <td>${escapeHtml(farmer)}</td>
                <td>${escapeHtml(commodity)}</td>
                <td class="center-col">
                    <div style="font-weight: 700; color: var(--ink);">${plannedVol.toLocaleString("en-US")} kg</div>
                    ${hasActual ? `
                        <div style="font-size: 11px; color: #16A34A; margin-top: 2px; font-weight:600;">
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
                <td class="center-col">${varianceCell}</td>
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

    renderVarianceRemarksPanel(intents);
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

    const statusCards = document.getElementById("municipalStatusCards");
    if (statusCards) statusCards.style.display = "grid";
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
                    flagBtn.textContent = "Returned ✓";

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
============================================================ */

function renderMunicipalSummary(data) {
    const container = document.getElementById("municipalSummaryContent");
    if (!container) return;

    const intents = Array.isArray(data.intents) ? data.intents : [];
    const municipality = data.municipality || "Municipality";
    const reportCount = data.report_count || 0;

    const periodStart = data.period_start ? new Date(data.period_start) : null;
    const periodEnd = data.period_end ? new Date(data.period_end) : null;

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

    const selectedCount = intents.length;

    const totalVolume = intents.reduce((sum, i) => sum + (Number(i.volume) || 0), 0);

    const uniqueFarmers = new Set(
        intents.map(i => i.farmer_id || i.farmer_name).filter(Boolean)
    );
    const uniqueFarmerCount = uniqueFarmers.size;

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

    const yieldPlanned = totalVolume;
    const yieldActual = totalActualHarvest;
    const hasActualData = yieldActual > 0;
    const variancePct = hasActualData && yieldPlanned > 0
        ? Math.round(((yieldActual - yieldPlanned) / yieldPlanned) * 100)
        : 0;

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

    html += `<div class="summary-breakdown-grid">`;

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

    html += `</div>`;

    html += `<div class="summary-insight-grid">`;

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

    html += `</div>`;

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

function initProfileDropdown() {
    const openBtn    = document.getElementById("openProfileBtn");
    const dropdown   = document.getElementById("profileDropdown");
    const editBtn    = document.getElementById("menuEditProfile");
    const signOutBtn = document.getElementById("menuSignOut");

    if (!openBtn || !dropdown) return;

    openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
    });

    document.addEventListener("click", (e) => {
        if (!dropdown.contains(e.target) && !openBtn.contains(e.target)) {
            dropdown.style.display = "none";
        }
    });

    editBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.style.display = "none";
        openBtn.dispatchEvent(new CustomEvent("open-profile"));
    });

    signOutBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.style.display = "none";

        showActionConfirm({
            title: "Sign Out Confirmation",
            message: "Are you sure you want to sign out of eSaka?",
            confirmText: "Sign Out",
            confirmColor: "#C0392B",
            cancelText: "Cancel",
            onConfirm: () => {
                localStorage.clear();
                window.location.href = "../index.html";
            },
        });
    });
}

function initProfileModal() {
    const openProfileBtn   = document.getElementById("openProfileBtn");
    const profileModal     = document.getElementById("profileModal");
    const closeProfileBtn  = document.getElementById("closeProfileModalBtn");
    const profileForm      = document.getElementById("profileForm");
    const customAlertModal = document.getElementById("customAlertModal");
    const customAlertText  = document.getElementById("customAlertText");
    const closeCustomBtn   = document.getElementById("closeCustomAlertBtn");

    if (!openProfileBtn || !profileModal) return;

    function showCustomAlert(msg) {
        if (customAlertText) customAlertText.textContent = msg;
        if (customAlertModal) customAlertModal.classList.add("show");
    }
    closeCustomBtn?.addEventListener("click", () =>
        customAlertModal?.classList.remove("show")
    );

    let currentSelectedSrc = "../images/1.png";

    async function loadProfileIntoModal(event) {
        if (event) event.stopPropagation();
        const userId = localStorage.getItem("user_id");
        if (!userId) return showCustomAlert("Session expired. Please log in again.");

        try {
            const user = await fetchJsonWithTimeout(
                `${API_BASE_URL}/api/users/${userId}`,
                { method: "GET", headers: getAuthHeaders({ "Accept": "application/json" }) },
                10000
            );

            document.getElementById("profileFirstName").value = user.first_name || "";
            document.getElementById("profileLastName").value  = user.last_name  || "";
            document.getElementById("profileUsername").value  = user.username   || "";

            let avatarFile = user.avatar;
            if (!avatarFile) {
                const saved = localStorage.getItem(getScopedAvatarKey());
                if (saved) avatarFile = saved.split("/").pop();
            }

            currentSelectedSrc = avatarFile
                ? `../images/${avatarFile}`
                : "../images/1.png";

            let matched = false;
            document.querySelectorAll(".avatar-option").forEach(opt => {
                const isMatch = opt.dataset.avatarImg === currentSelectedSrc;
                opt.classList.toggle("selected", isMatch);
                if (isMatch) matched = true;
            });
            if (!matched) {
                const first = document.querySelector(".avatar-option");
                if (first) {
                    first.classList.add("selected");
                    currentSelectedSrc = first.dataset.avatarImg || "../images/1.png";
                }
            }

            profileModal.classList.add("show");
        } catch (err) {
            console.error("Failed to load profile:", err);
            showCustomAlert("Could not load profile data. Please try again.");
        }
    }

    openProfileBtn.addEventListener("open-profile", loadProfileIntoModal);

    document.querySelectorAll(".avatar-option").forEach(opt => {
        opt.addEventListener("click", () => {
            document.querySelectorAll(".avatar-option").forEach(el => el.classList.remove("selected"));
            opt.classList.add("selected");
            currentSelectedSrc = opt.dataset.avatarImg;
        });
    });

    closeProfileBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        profileModal.classList.remove("show");
    });
    profileModal.addEventListener("click", (e) => {
        if (e.target === profileModal) profileModal.classList.remove("show");
    });

    profileForm?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const userId = localStorage.getItem("user_id");
        const fName  = document.getElementById("profileFirstName").value.trim();
        const lName  = document.getElementById("profileLastName").value.trim();

        if (!fName || !lName) return showCustomAlert("Please fill in all required fields.");
        if (!userId)          return showCustomAlert("Session expired. Please log in again.");

        const avatarFilename = currentSelectedSrc.split("/").pop();
        const saveBtn = profileForm.querySelector('button[type="submit"]');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving..."; }

        try {
            const updatedUser = await apiRequest(`${API_BASE_URL}/api/users/${userId}`, {
                method: "PUT",
                body: JSON.stringify({
                    first_name: fName,
                    last_name: lName,
                    avatar: avatarFilename
                })
            });

            const serverFirst  = updatedUser?.first_name || fName;
            const serverLast   = updatedUser?.last_name  || lName;
            const serverAvatar = updatedUser?.avatar     || avatarFilename;

            localStorage.setItem("user_display_name", `${serverFirst} ${serverLast}`);
            localStorage.setItem("full_name",         `${serverFirst} ${serverLast}`);
            localStorage.setItem(getScopedAvatarKey(), `../images/${serverAvatar}`);

            const displayNameEl = document.getElementById("userDisplayName");
            if (displayNameEl) displayNameEl.textContent = `${serverFirst} ${serverLast}`;

            const avatarBox = document.querySelector(".user-info .avatar");
            if (avatarBox) {
                avatarBox.innerHTML = `<img src="../images/${serverAvatar}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                avatarBox.style.background = "transparent";
            }

            profileModal.classList.remove("show");
            showCustomAlert("Profile updated and saved successfully!");

        } catch (err) {
            console.error("Update error:", err);
            showCustomAlert(err.message || "Failed to update profile.");
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save Changes"; }
        }
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
    initProfileDropdown();
    initProfileModal(); 
    initSearch();
    initBulkActions();
    initFlagButton();
    initApproveButton();
    initSentToProvincialFilter();
    initResubmitButton();
    initSummaryPeriodPicker();

    const topbarEl = document.querySelector(".topbar");
    if (topbarEl) {
        window.addEventListener("scroll", () => {
            topbarEl.classList.toggle("scrolled", window.scrollY > 8);
        }, { passive: true });
    }

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

/* ============================================================
   REPORTING UX ALIGNMENT + SUMMARY EXPORTS
   (Individual report exports removed per requirement.)
============================================================ */
(function () {
    const PAGE_SIZE = 8;
    const paginationState = {
        pendingReportsBody: 1,
        awaitingRevisionBody: 1,
        sentToProvincialBody: 1
    };
    const tableConfigs = [
        { bodyId: "pendingReportsBody", hostId: "pendingReportsPagination", label: "pending reports" },
        { bodyId: "awaitingRevisionBody", hostId: "awaitingRevisionPagination", label: "revision reports" },
        { bodyId: "sentToProvincialBody", hostId: "sentReportsPagination", label: "sent reports" }
    ];
    let searchTerm = "";

    function safeText(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[ch]);
    }

    function visibleRows(body) {
        return Array.from(body.querySelectorAll("tr[data-report-id]")).filter(row => {
            const matchesSearch = !searchTerm || row.textContent.toLowerCase().includes(searchTerm);
            row.dataset.searchMatch = matchesSearch ? "1" : "0";
            return matchesSearch;
        });
    }

    function paginateTable(config) {
        const body = document.getElementById(config.bodyId);
        const host = document.getElementById(config.hostId);
        if (!body || !host) return;

        const allRows = Array.from(body.querySelectorAll("tr[data-report-id]"));
        const matches = visibleRows(body);
        const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));

        paginationState[config.bodyId] = Math.min(
            paginationState[config.bodyId] || 1,
            pageCount
        );

        const page = paginationState[config.bodyId];
        const start = (page - 1) * PAGE_SIZE;
        const onPage = new Set(matches.slice(start, start + PAGE_SIZE));

        allRows.forEach(row => {
            row.style.display = onPage.has(row) ? "" : "none";
        });

        const fragment = document.createDocumentFragment();

        const addLabel = (className, text) => {
            const el = document.createElement("span");
            el.textContent = text;
            if (className) el.className = className;
            fragment.appendChild(el);
        };

        const addButton = (action, text, disabled) => {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.pageAction = action;
            button.textContent = text;
            button.disabled = disabled;

            button.addEventListener("click", () => {
                paginationState[config.bodyId] =
                    action === "prev"
                        ? Math.max(1, page - 1)
                        : Math.min(pageCount, page + 1);

                paginateTable(config);
            });

            fragment.appendChild(button);
        };

        addLabel(
            "pagination-range",
            matches.length
                ? `${start + 1}–${Math.min(start + PAGE_SIZE, matches.length)} of ${matches.length} ${config.label}`
                : `0 ${config.label}`
        );

        addButton("prev", "Previous", page <= 1);
        addLabel("pagination-page", `Page ${page} / ${pageCount}`);
        addButton("next", "Next", page >= pageCount);

        host.replaceChildren(fragment);
    }

    function refreshReportTables() {
        tableConfigs.forEach(paginateTable);
        if (typeof updateSelectAllCheckbox === "function") updateSelectAllCheckbox();
    }

    const wrapRender = (name) => {
        const original = window[name] || (typeof globalThis !== "undefined" ? globalThis[name] : null);
        if (typeof original !== "function" || original.__reportEnhancementWrapped) return;
        const wrapped = function (...args) {
            const result = original.apply(this, args);
            if (result && typeof result.then === "function") {
                return result.finally(refreshReportTables);
            }
            refreshReportTables();
            return result;
        };
        wrapped.__reportEnhancementWrapped = true;
        try { window[name] = wrapped; } catch (_) {}
    };
    ["renderPendingReports", "renderAwaitingRevision", "renderSentReports"].forEach(wrapRender);

    function reportCycleInfo() {
        const name = localStorage.getItem("municipal_export_prepared_by") || localStorage.getItem("user_display_name") || localStorage.getItem("full_name") ||
            localStorage.getItem("name") || localStorage.getItem("username") || "";
        const role = localStorage.getItem("municipal_export_position") || localStorage.getItem("role") || "";
        const municipalityRaw = localStorage.getItem("municipality") || localStorage.getItem("office_location") ||
            localStorage.getItem("user_municipality") || localStorage.getItem("municipality_name") || "";
        const municipality = /^(municipality not set|not set|undefined|null)$/i.test(municipalityRaw.trim()) ? "" : municipalityRaw.trim();
        return { name, role, municipality };
    }

    function loadJsPDF() {
        if (getJsPDFConstructor()) return Promise.resolve(getJsPDFConstructor());
        if (window.__municipalJsPdfPromise) return window.__municipalJsPdfPromise;
        window.__municipalJsPdfPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
            script.onload = () => getJsPDFConstructor() ? resolve(getJsPDFConstructor()) : reject(new Error("jsPDF loaded but was not initialized"));
            script.onerror = () => reject(new Error("Could not load jsPDF. Check your internet connection."));
            document.head.appendChild(script);
        });
        return window.__municipalJsPdfPromise;
    }

    function getJsPDFConstructor() {
        return window.jspdf?.jsPDF || window.jsPDF || null;
    }

    function cleanExportText(value) {
        return String(value ?? "").replace(/[\u{1F300}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "").replace(/\uFE0F/g, "").trim();
    }

    function createStructuredPdfBlob(root, title, signatureInfo = {}) {
        const JsPDF = getJsPDFConstructor();
        if (!JsPDF) throw new Error("jsPDF is unavailable. Please refresh and try again.");

        const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

        const info = reportCycleInfo();
        const municipality = cleanExportText(
            signatureInfo.municipality || info.municipality || currentSummaryData?.municipality || "Guagua"
        );
        const reportTitle = cleanExportText(signatureInfo.title || title || "MUNICIPAL SUMMARY REPORT");
        const preparedByName = cleanExportText(signatureInfo.preparedBy || info.name || "");
        const positionText = cleanExportText(signatureInfo.position || info.role || "");
        const officeText = `Municipal Agriculture Office${municipality ? ", " + municipality : ""}`;

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        const contentWidth = pageWidth - margin * 2;
        const bottomLimit = pageHeight - 18;

        // eSaka palette
        const navy = [11, 56, 42];        // #0B382A  primary
        const green = [20, 83, 45];       // #14532D  secondary
        const gold = [234, 179, 8];       // #EAB308  tertiary
        const tint = [227, 238, 231];     // #E3EEE7
        const gray = [243, 247, 244];     // zebra rows
        const rule = [207, 222, 213];     // hairlines
        const textColor = [32, 40, 36];   // #202824
        const muted = [95, 107, 100];     // #5F6B64

        const reportingPeriod = cleanExportText(signatureInfo.reportingPeriod || "Selected reporting period");
        const generatedAt = new Date().toLocaleString("en-PH", { dateStyle: "short", timeStyle: "short" });

        const clean = root.cloneNode(true);

        clean.querySelectorAll(
            "button, textarea, input, select, .report-detail-export, #validationHistoryWrapper, .export-signatures, .no-print, .report-pagination"
        ).forEach(el => el.remove());

        // Remove Appendix/Data Consistency Notes from the DOM if they exist
        clean.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, div").forEach(el => {
            if (/appendix|data consistency notes/i.test(el.textContent)) el.remove();
        });

        const textOf = el => el
            ? cleanExportText((el.innerText || el.textContent || "").replace(/\s+/g, " "))
            : "";

        const fit = (text, width, size, style = "normal") => {
            doc.setFont("helvetica", style);
            doc.setFontSize(size);
            return doc.splitTextToSize(cleanExportText(text), width)[0] || "";
        };

        let y = 0;
        let headerCount = 0;
        let certDrawn = false;

        const drawInfoStrip = () => {
            const top = y;
            const height = 17;
            doc.setFillColor(...gray);
            doc.setDrawColor(...rule);
            doc.setLineWidth(0.25);
            doc.roundedRect(margin, top, contentWidth, height, 1.6, 1.6, "FD");

            const cells = [
                { w: 0.22, label: "MUNICIPALITY", value: municipality || "-", sub: "Municipal Agriculture Office" },
                { w: 0.27, label: "REPORTING PERIOD", value: reportingPeriod, sub: "" },
                { w: 0.31, label: "PREPARED BY", value: preparedByName || "-", sub: positionText },
                { w: 0.20, label: "GENERATED", value: generatedAt, sub: "eSaka system" }
            ];

            let x = margin + 4;
            cells.forEach((cell, index) => {
                const cw = contentWidth * cell.w;
                const inner = cw - 6;

                doc.setFont("helvetica", "bold");
                doc.setFontSize(5.8);
                doc.setTextColor(...muted);
                doc.text(cell.label, x, top + 5);

                doc.setFont("helvetica", "bold");
                doc.setFontSize(8.2);
                doc.setTextColor(...navy);
                doc.text(fit(cell.value, inner, 8.2, "bold"), x, top + 10);

                if (cell.sub) {
                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(6.4);
                    doc.setTextColor(...muted);
                    doc.text(fit(cell.sub, inner, 6.4), x, top + 14);
                }

                x += cw;
                if (index < cells.length - 1) {
                    doc.setDrawColor(...rule);
                    doc.setLineWidth(0.2);
                    doc.line(x - 3, top + 3, x - 3, top + height - 3);
                }
            });

            y = top + height + 6;
        };

        const drawHeader = () => {
            const first = headerCount === 0;
            headerCount += 1;

            if (first) {
                doc.setFillColor(...navy);
                doc.rect(0, 0, pageWidth, 31, "F");
                doc.setFillColor(...gold);
                doc.rect(0, 31, pageWidth, 1.6, "F");

                // brand mark
                doc.setFillColor(...gold);
                doc.roundedRect(margin, 7.5, 14, 14, 2.4, 2.4, "F");
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.setTextColor(...navy);
                doc.text("eS", margin + 7, 16.4, { align: "center" });

                doc.setFont("helvetica", "bold");
                doc.setFontSize(7.4);
                doc.setTextColor(...gold);
                doc.text("DEPARTMENT OF AGRICULTURE", margin + 19, 10.6);

                doc.setFont("helvetica", "normal");
                doc.setFontSize(7.6);
                doc.setTextColor(214, 230, 220);
                doc.text(`Office of the Municipal Agriculture - ${municipality}`, margin + 19, 14.8);

                doc.setFont("helvetica", "bold");
                doc.setFontSize(15);
                doc.setTextColor(255, 255, 255);
                doc.text(fit(reportTitle.toUpperCase(), contentWidth - 19, 15, "bold"), margin + 19, 24.2);

                y = 39;
                drawInfoStrip();
            } else {
                doc.setFillColor(...navy);
                doc.rect(0, 0, pageWidth, 11, "F");
                doc.setFillColor(...gold);
                doc.rect(0, 11, pageWidth, 0.9, "F");

                doc.setFont("helvetica", "bold");
                doc.setFontSize(8);
                doc.setTextColor(255, 255, 255);
                doc.text(fit(`eSaka  |  ${reportTitle}`, contentWidth * 0.7, 8, "bold"), margin, 7.1);

                doc.setFont("helvetica", "normal");
                doc.setTextColor(214, 230, 220);
                doc.text(municipality, pageWidth - margin, 7.1, { align: "right" });

                y = 19;
            }
        };

        const drawFooter = (page, total) => {
            doc.setDrawColor(...gold);
            doc.setLineWidth(0.6);
            doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            doc.setTextColor(...navy);
            doc.text("eSaka", margin, pageHeight - 8.4);

            doc.setFont("helvetica", "normal");
            doc.setTextColor(...muted);
            doc.text(
                fit(`${municipality}  |  ${reportingPeriod}`, contentWidth - 40, 7),
                margin + 10, pageHeight - 8.4
            );
            doc.setFontSize(6.4);
            doc.text(`Generated ${generatedAt}`, margin, pageHeight - 4.6);

            doc.setFontSize(7);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...navy);
            doc.text(`Page ${page} of ${total}`, pageWidth - margin, pageHeight - 8.4, { align: "right" });
        };

        const newPage = () => {
            doc.addPage();
            drawHeader();
        };

        const ensureSpace = height => {
            if (y + height > bottomLimit) newPage();
        };

        const addText = (text, opts = {}) => {
            text = cleanExportText(text);
            if (!text) return;

            const size = opts.size || 9;
            doc.setFont("helvetica", opts.bold ? "bold" : "normal");
            doc.setFontSize(size);
            doc.setTextColor(...(opts.color || textColor));

            const lines = doc.splitTextToSize(text, contentWidth - (opts.indent || 0));
            const lineHeight = opts.lineHeight || size * 0.48;
            const height = lines.length * lineHeight + (opts.after ?? 2);

            ensureSpace(height);
            doc.text(lines, margin + (opts.indent || 0), y);
            y += height;
        };

        const isNumericCell = value => {
            const s = String(value ?? "").trim();
            return s !== "" && /^[-+]?[\d.,\s]+(%|kg|days?|intents?)?$/i.test(s);
        };

        const addTableRows = inputRows => {
            const rows = (inputRows || []).filter(
                row => Array.isArray(row) && row.some(value => String(value ?? "").trim() !== "")
            );
            if (!rows.length) return;

            const colCount = Math.max(1, ...rows.map(row => row.length));
            const sample = rows.slice(0, Math.min(rows.length, 20));

            const weights = Array.from({ length: colCount }, (_, col) => {
                const maxLen = Math.max(5, ...sample.map(row => String(row[col] ?? "").length));
                return Math.max(0.55, Math.min(2.2, Math.sqrt(maxLen)));
            });

            const totalWeight = weights.reduce((a, b) => a + b, 0);
            const widths = weights.map(weight => contentWidth * weight / totalWeight);

            const numericCols = Array.from({ length: colCount }, (_, col) => {
                const body = rows.slice(1).map(row => row[col]).filter(v => String(v ?? "").trim() !== "");
                return body.length > 0 && body.every(isNumericCell);
            });

            const drawRow = (row, header, rowIndex) => {
                doc.setFont("helvetica", header ? "bold" : "normal");
                doc.setFontSize(header ? 7 : 6.9);

                const wrapped = Array.from({ length: colCount }, (_, col) =>
                    doc.splitTextToSize(cleanExportText(row[col] ?? ""), Math.max(7, widths[col] - 3.4))
                );

                const rowHeight = Math.max(header ? 7.6 : 6.8, ...wrapped.map(lines => lines.length * 3.1 + 3.2));

                if (y + rowHeight > bottomLimit) {
                    newPage();
                    if (!header) drawRow(rows[0], true, 0);
                }

                let x = margin;
                for (let col = 0; col < colCount; col++) {
                    const width = widths[col];

                    if (header) doc.setFillColor(...green);
                    else if (rowIndex % 2 === 0) doc.setFillColor(...gray);
                    else doc.setFillColor(255, 255, 255);
                    doc.rect(x, y, width, rowHeight, "F");

                    doc.setDrawColor(...(header ? gold : rule));
                    doc.setLineWidth(header ? 0.5 : 0.15);
                    doc.line(x, y + rowHeight, x + width, y + rowHeight);

                    doc.setFont("helvetica", header ? "bold" : "normal");
                    doc.setFontSize(header ? 7 : 6.9);
                    doc.setTextColor(...(header ? [255, 255, 255] : textColor));

                    if (numericCols[col]) {
                        doc.text(wrapped[col] || [""], x + width - 1.8, y + 4.4, { align: "right" });
                    } else {
                        doc.text(wrapped[col] || [""], x + 1.8, y + 4.4);
                    }
                    x += width;
                }
                y += rowHeight;
            };

            rows.forEach((row, index) => drawRow(row, index === 0, index));
            y += 5;
        };

        const addKpiCards = grid => {
            const cards = Array.from(grid.children).filter(card => card.nodeType === 1);
            if (!cards.length) return;

            const cols = 3;
            const gap = 3.5;
            const cardWidth = (contentWidth - gap * (cols - 1)) / cols;
            const cardHeight = 21;

            cards.forEach((card, index) => {
                const label = textOf(card.querySelector(".summary-kpi-label, .summary-seven-label, .kpi-label, h3, h4")) || "Key Metric";
                const value = textOf(card.querySelector(".summary-kpi-value, .summary-seven-value, .kpi-value, strong, .value")) || "-";
                const sub = textOf(card.querySelector(".summary-kpi-subtext, .summary-seven-subtext, .kpi-subtext, small, p"));

                const col = index % cols;
                if (col === 0) ensureSpace(cardHeight + 3.5);

                const x = margin + col * (cardWidth + gap);
                const top = y;

                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(...rule);
                doc.setLineWidth(0.3);
                doc.roundedRect(x, top, cardWidth, cardHeight, 1.8, 1.8, "FD");

                doc.setFillColor(...green);
                doc.roundedRect(x, top, 2.2, cardHeight, 1.1, 1.1, "F");

                doc.setFont("helvetica", "bold");
                doc.setFontSize(6.2);
                doc.setTextColor(...muted);
                doc.text(fit(label.toUpperCase(), cardWidth - 8, 6.2, "bold"), x + 5, top + 5.2);

                doc.setFont("helvetica", "bold");
                doc.setFontSize(13.5);
                doc.setTextColor(...navy);
                doc.text(fit(value, cardWidth - 8, 13.5, "bold"), x + 5, top + 12.4);

                if (sub) {
                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(6);
                    doc.setTextColor(...muted);
                    doc.text(fit(sub, cardWidth - 8, 6), x + 5, top + 17.6);
                }

                if (col === cols - 1 || index === cards.length - 1) y += cardHeight + 3.5;
            });

            y += 2;
        };

        // Two-column certification: Prepared by (left) | Received by (right), each with a signature line.
        const drawCertificationBlock = () => {
            const blockHeight = 52;
            ensureSpace(blockHeight + 4);
            y += 1;

            const top = y;
            const padding = 7;
            const gap = 16;
            const colWidth = (contentWidth - padding * 2 - gap) / 2;

            doc.setFillColor(...gray);
            doc.setDrawColor(...rule);
            doc.setLineWidth(0.25);
            doc.roundedRect(margin, top, contentWidth, blockHeight, 2, 2, "FD");
            doc.setFillColor(...gold);
            doc.rect(margin + 2, top, contentWidth - 4, 0.9, "F");

            const columns = [
                {
                    x: margin + padding,
                    label: "PREPARED BY",
                    name: preparedByName,
                    line1: positionText,
                    line2: officeText
                },
                {
                    x: margin + padding + colWidth + gap,
                    label: "RECEIVED BY",
                    name: "",
                    line1: "Provincial Agriculture Office",
                    line2: "Name, position and signature"
                }
            ];

            columns.forEach(col => {
                const center = col.x + colWidth / 2;
                const lineY = top + 29;

                doc.setFont("helvetica", "bold");
                doc.setFontSize(7);
                doc.setTextColor(...green);
                doc.text(col.label, col.x, top + 8);

                // signature line
                doc.setDrawColor(...navy);
                doc.setLineWidth(0.45);
                doc.line(col.x, lineY, col.x + colWidth, lineY);

                if (col.name) {
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(9.5);
                    doc.setTextColor(...navy);
                    doc.text(fit(col.name, colWidth, 9.5, "bold"), center, lineY + 5, { align: "center" });
                } else {
                    doc.setFont("helvetica", "italic");
                    doc.setFontSize(7);
                    doc.setTextColor(...muted);
                    doc.text("Signature over printed name", center, lineY + 4.6, { align: "center" });
                }

                doc.setFont("helvetica", "normal");
                doc.setFontSize(7.6);
                doc.setTextColor(...textColor);
                if (col.line1) doc.text(fit(col.line1, colWidth, 7.6), center, lineY + 9.4, { align: "center" });

                doc.setFontSize(6.8);
                doc.setTextColor(...muted);
                if (col.line2) doc.text(fit(col.line2, colWidth, 6.8), center, lineY + 13.4, { align: "center" });

                // date line
                doc.setFont("helvetica", "normal");
                doc.setFontSize(7);
                doc.setTextColor(...muted);
                doc.text("Date:", col.x, top + blockHeight - 4.2);
                doc.setDrawColor(...muted);
                doc.setLineWidth(0.2);
                doc.line(col.x + 9, top + blockHeight - 4.6, col.x + colWidth * 0.62, top + blockHeight - 4.6);
            });

            y = top + blockHeight + 4;
            certDrawn = true;
        };

        const walk = node => {
            if (!node || node.nodeType !== 1) return;

            if (node.dataset && node.dataset.certification) {
                drawCertificationBlock();
                return;
            }

            if (node.classList?.contains("summary-kpi-grid") || node.classList?.contains("summary-seven-grid")) {
                addKpiCards(node);
                return;
            }

            if (node.tagName === "TABLE") {
                const rows = Array.from(node.querySelectorAll("tr")).map(tr =>
                    Array.from(tr.querySelectorAll("th,td")).map(textOf)
                );
                addTableRows(rows);
                return;
            }

            if (/^H[1-6]$/.test(node.tagName)) {
                const heading = textOf(node).replace(/^\d{1,2}\s*\|\s*/, "");
                if (!heading || /appendix|data consistency notes/i.test(heading)) return;

                ensureSpace(17);
                y += 2;

                doc.setFillColor(...tint);
                doc.roundedRect(margin, y - 4.5, contentWidth, 7.4, 1, 1, "F");
                doc.setFillColor(...gold);
                doc.rect(margin, y - 4.5, 1.9, 7.4, "F");

                doc.setFont("helvetica", "bold");
                doc.setFontSize(node.tagName === "H1" || node.tagName === "H2" ? 9.6 : 8.6);
                doc.setTextColor(...navy);
                doc.text(fit(heading, contentWidth - 9, node.tagName === "H1" || node.tagName === "H2" ? 9.6 : 8.6, "bold"), margin + 5, y + 0.4);

                y += 7.4;
                return;
            }

            if (node.tagName === "P" || node.tagName === "LI" || node.tagName === "BLOCKQUOTE") {
                addText(textOf(node), { indent: node.tagName === "LI" ? 4 : 0, after: 2 });
                return;
            }

            const directText = Array.from(node.childNodes).filter(child => child.nodeType === 3).map(child => child.textContent).join(" ").replace(/\s+/g, " ").trim();
            if (directText && !node.querySelector("table") && !/appendix|data consistency notes/i.test(directText)) {
                addText(directText, { after: 2 });
            }

            Array.from(node.children).forEach(walk);
        };

        drawHeader();
        walk(clean);

        // Reports that carry no certification section still get the signature block.
        if (!certDrawn) {
            ensureSpace(17);
            y += 4;
            doc.setFillColor(...tint);
            doc.roundedRect(margin, y - 4.5, contentWidth, 7.4, 1, 1, "F");
            doc.setFillColor(...gold);
            doc.rect(margin, y - 4.5, 1.9, 7.4, "F");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.6);
            doc.setTextColor(...navy);
            doc.text("CERTIFICATION", margin + 5, y + 0.4);
            y += 9;
            drawCertificationBlock();
        }

        const pageCount = doc.getNumberOfPages();
        for (let page = 1; page <= pageCount; page++) {
            doc.setPage(page);
            drawFooter(page, pageCount);
        }

        return doc.output("blob");
    }

    let pdfPreviewState = { root: null, filename: "municipal_report.pdf", title: "Municipal Report", signatureInfo: {}, blob: null, objectUrl: null };

    function ensurePdfPreviewModal() {
        let modal = document.getElementById("municipalPdfPreviewModal");
        if (modal) return modal;
        modal = document.createElement("div");
        modal.id = "municipalPdfPreviewModal";
        modal.style.cssText = "display:none;position:fixed;inset:0;z-index:100000;background:rgba(13,25,18,.68);padding:20px;box-sizing:border-box;align-items:center;justify-content:center;";
        modal.innerHTML = `
          <section role="dialog" aria-modal="true" aria-labelledby="municipalPdfPreviewTitle" style="background:#f7f9f6;color:#202824;width:min(1180px,98vw);max-height:96vh;overflow:auto;border-radius:16px;box-shadow:0 20px 70px rgba(0,0,0,.3);padding:22px;box-sizing:border-box;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;">
              <div><h2 id="municipalPdfPreviewTitle" style="margin:0;color:#174b36;font-size:22px;">PDF Preview</h2><p style="margin:5px 0 0;color:#64716a;font-size:13px;">Review the actual PDF before downloading.</p></div>
              <button type="button" id="municipalPdfPreviewClose" aria-label="Close PDF preview" style="border:0;background:transparent;font-size:28px;cursor:pointer;color:#425148;">×</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;background:#fff;border:1px solid #dce5dd;border-radius:12px;padding:14px;margin-bottom:14px;">
              <label style="font-size:13px;font-weight:700;">Prepared by
                <input id="municipalPdfPreparedBy" type="text" autocomplete="name" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border:1px solid #cbd6ce;border-radius:8px;font:inherit;" />
              </label>
              <label style="font-size:13px;font-weight:700;">Position
                <input id="municipalPdfPosition" type="text" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border:1px solid #cbd6ce;border-radius:8px;font:inherit;" />
              </label>
              <div style="display:flex;align-items:end;gap:8px;flex-wrap:wrap;">
                <button type="button" id="municipalPdfGeneratePreview" style="background:#245b43;color:#fff;border:0;border-radius:8px;padding:11px 15px;font-weight:700;cursor:pointer;">Generate Preview</button>
                <button type="button" id="municipalPdfDownloadFinal" disabled style="background:#c4cec7;color:#fff;border:0;border-radius:8px;padding:11px 15px;font-weight:700;cursor:not-allowed;">Download PDF</button>
              </div>
            </div>
            <p id="municipalPdfPreviewStatus" role="status" style="font-size:13px;color:#64716a;margin:8px 0 12px;">Enter the preparer details, then generate the preview.</p>
            <div id="municipalPdfPreviewFrameWrap" style="display:none;background:#5a625d;border-radius:10px;padding:8px;">
              <iframe id="municipalPdfPreviewFrame" title="Generated PDF preview" style="display:block;width:100%;height:62vh;border:0;border-radius:6px;background:#fff;"></iframe>
            </div>
          </section>`;
        document.body.appendChild(modal);
        const close = () => {
            modal.style.display = "none";
            if (pdfPreviewState.objectUrl) URL.revokeObjectURL(pdfPreviewState.objectUrl);
            pdfPreviewState.objectUrl = null;
            pdfPreviewState.blob = null;
            const frame = document.getElementById("municipalPdfPreviewFrame");
            if (frame) frame.removeAttribute("src");
            const wrap = document.getElementById("municipalPdfPreviewFrameWrap");
            if (wrap) wrap.style.display = "none";
            const download = document.getElementById("municipalPdfDownloadFinal");
            if (download) { download.disabled = true; download.style.background = "#c4cec7"; download.style.cursor = "not-allowed"; }
        };
        document.getElementById("municipalPdfPreviewClose").addEventListener("click", close);
        modal.addEventListener("click", event => { if (event.target === modal) close(); });
        document.addEventListener("keydown", event => { if (event.key === "Escape" && modal.style.display === "flex") close(); });
        document.getElementById("municipalPdfGeneratePreview").addEventListener("click", async () => {
            const status = document.getElementById("municipalPdfPreviewStatus");
            const preparedBy = document.getElementById("municipalPdfPreparedBy").value.trim();
            const position = document.getElementById("municipalPdfPosition").value.trim();
            if (!preparedBy || !position) {
                status.textContent = "Please fill in both Prepared by and Position before generating the PDF preview.";
                status.style.color = "#b42318";
                return;
            }
            try { await loadJsPDF(); } catch (loadError) {
                status.textContent = "Could not load the PDF engine. Check your internet connection, refresh, and try again.";
                status.style.color = "#b42318";
                console.error(loadError);
                return;
            }
            const generateBtn = document.getElementById("municipalPdfGeneratePreview");
            const downloadBtn = document.getElementById("municipalPdfDownloadFinal");
            generateBtn.disabled = true;
            generateBtn.textContent = "Generating preview…";
            status.style.color = "#64716a";
            status.textContent = "Generating the actual PDF. Please wait…";
            try {
                if (pdfPreviewState.objectUrl) URL.revokeObjectURL(pdfPreviewState.objectUrl);
                pdfPreviewState.objectUrl = null;
                pdfPreviewState.blob = null;
                pdfPreviewState.signatureInfo = {
                    ...(pdfPreviewState.signatureInfo || {}),
                    preparedBy,
                    position
                };
                localStorage.setItem("municipal_export_prepared_by", preparedBy);
                localStorage.setItem("municipal_export_position", position);
                if (pdfPreviewState.signatureInfo.title) localStorage.setItem("municipal_export_report_title", pdfPreviewState.signatureInfo.title);
                if (pdfPreviewState.signatureInfo.municipality) localStorage.setItem("municipality", pdfPreviewState.signatureInfo.municipality);
                pdfPreviewState.blob = createStructuredPdfBlob(pdfPreviewState.root, pdfPreviewState.title, pdfPreviewState.signatureInfo);
                pdfPreviewState.objectUrl = URL.createObjectURL(pdfPreviewState.blob);
                document.getElementById("municipalPdfPreviewFrame").src = pdfPreviewState.objectUrl;
                document.getElementById("municipalPdfPreviewFrameWrap").style.display = "block";
                downloadBtn.disabled = false;
                downloadBtn.style.background = "#245b43";
                downloadBtn.style.cursor = "pointer";
                status.textContent = "Preview ready. Review every page above, then download when satisfied. You can edit the fields and regenerate the preview.";
                status.style.color = "#245b43";
            } catch (error) {
                console.error("PDF preview generation failed", error);
                status.textContent = "Could not generate the PDF preview. Please try again.";
                status.style.color = "#b42318";
            } finally {
                generateBtn.disabled = false;
                generateBtn.textContent = "Generate Preview";
            }
        });
        document.getElementById("municipalPdfDownloadFinal").addEventListener("click", () => {
            if (!pdfPreviewState.blob) return;
            const url = pdfPreviewState.objectUrl || URL.createObjectURL(pdfPreviewState.blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = pdfPreviewState.filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
        });
        return modal;
    }

    async function downloadPdf(root, filename, title, signatureInfo = {}) {
        if (!root) { alert("There is no report content to export."); return; }
        try {
            await loadJsPDF();
            const info = reportCycleInfo();
            const exportTitle = cleanExportText(signatureInfo.title || title || "Municipal Report");
            const exportInfo = {
                ...signatureInfo,
                title: exportTitle,
                municipality: cleanExportText(signatureInfo.municipality || info.municipality || localStorage.getItem("municipality") || ""),
                preparedBy: cleanExportText(signatureInfo.preparedBy || localStorage.getItem("municipal_export_prepared_by") || info.name || ""),
                position: cleanExportText(signatureInfo.position || localStorage.getItem("municipal_export_position") || info.role || "")
            };
            const modal = ensurePdfPreviewModal();
            if (pdfPreviewState.objectUrl) URL.revokeObjectURL(pdfPreviewState.objectUrl);
            pdfPreviewState = {
                root,
                filename: filename || "municipal_report.pdf",
                title: exportTitle,
                signatureInfo: exportInfo,
                blob: null,
                objectUrl: null
            };
            document.getElementById("municipalPdfPreparedBy").value = exportInfo.preparedBy;
            document.getElementById("municipalPdfPosition").value = exportInfo.position;
            document.getElementById("municipalPdfPreviewTitle").textContent = `${exportTitle} — PDF Preview`;
            document.getElementById("municipalPdfPreviewStatus").textContent = "Review the report details, then generate the PDF preview before downloading.";
            modal.style.display = "flex";
        } catch (error) {
            console.error("PDF preview could not be opened", error);
            alert("Could not open the PDF preview. Please refresh the dashboard and try again.");
        }
    }

    function loadExcelJS() {
        if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
        if (window.__municipalExcelJsPromise) return window.__municipalExcelJsPromise;
        window.__municipalExcelJsPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
            script.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error("ExcelJS did not initialize"));
            script.onerror = () => reject(new Error("Could not load ExcelJS"));
            document.head.appendChild(script);
        });
        return window.__municipalExcelJsPromise;
    }

    function ensureSummaryExportConfirmationModal() {
        let modal = document.getElementById("municipalSummaryExportConfirmModal");
        if (modal) return modal;
        modal = document.createElement("div");
        modal.id = "municipalSummaryExportConfirmModal";
        modal.style.cssText = "display:none;position:fixed;inset:0;z-index:100001;background:rgba(13,25,18,.65);padding:20px;box-sizing:border-box;align-items:center;justify-content:center;";
        modal.innerHTML = `
          <section role="dialog" aria-modal="true" aria-labelledby="municipalSummaryConfirmTitle" style="background:#fff;color:#202824;width:min(560px,96vw);border-radius:16px;padding:24px;box-shadow:0 20px 70px rgba(0,0,0,.3);">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:12px;">
              <div><h2 id="municipalSummaryConfirmTitle" style="margin:0;color:#174b36;font-size:21px;">Confirm Summary Export</h2><p id="municipalSummaryConfirmDescription" style="margin:7px 0 18px;color:#64716a;font-size:13px;">Confirm the reporting period and preparer details before exporting.</p></div>
              <button type="button" id="municipalSummaryConfirmClose" aria-label="Close confirmation" style="border:0;background:transparent;font-size:26px;cursor:pointer;">×</button>
            </div>
            <div style="background:#f3f7f4;border:1px solid #dce5dd;border-radius:10px;padding:12px;margin-bottom:16px;font-size:13px;line-height:1.7;">
              <label style="display:block;font-size:13px;font-weight:700;margin-bottom:8px;">Report Title <span style="color:#b42318">*</span><input id="municipalSummaryConfirmReportTitle" type="text" value="Municipal Summary Report" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #cbd6ce;border-radius:8px;font:inherit;" /></label>
              <label style="display:block;font-size:13px;font-weight:700;margin-bottom:8px;">Municipality <span style="color:#b42318">*</span><input id="municipalSummaryConfirmMunicipality" type="text" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #cbd6ce;border-radius:8px;font:inherit;" /></label>
              <div><strong>Reporting period:</strong> <span id="municipalSummaryConfirmPeriod"></span></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr;gap:12px;">
              <label style="font-size:13px;font-weight:700;">Prepared by <span style="color:#b42318">*</span><input id="municipalSummaryConfirmPreparedBy" type="text" autocomplete="name" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;border:1px solid #cbd6ce;border-radius:8px;font:inherit;" /></label>
              <label style="font-size:13px;font-weight:700;">Position <span style="color:#b42318">*</span><input id="municipalSummaryConfirmPosition" type="text" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;border:1px solid #cbd6ce;border-radius:8px;font:inherit;" /></label>
            </div>
            <p id="municipalSummaryConfirmError" role="status" style="min-height:18px;margin:8px 0;color:#b42318;font-size:12px;"></p>
            <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
              <button type="button" id="municipalSummaryConfirmCancel" style="background:#fff;color:#33463b;border:1px solid #cbd6ce;border-radius:8px;padding:11px 15px;font-weight:700;cursor:pointer;">Cancel</button>
              <button type="button" id="municipalSummaryConfirmProceed" style="background:#245b43;color:#fff;border:0;border-radius:8px;padding:11px 16px;font-weight:700;cursor:pointer;">Confirm & Download</button>
            </div>
          </section>`;
        document.body.appendChild(modal);
        const close = () => { modal.style.display = "none"; };
        document.getElementById("municipalSummaryConfirmClose").addEventListener("click", close);
        document.getElementById("municipalSummaryConfirmCancel").addEventListener("click", close);
        modal.addEventListener("click", event => { if (event.target === modal) close(); });
        document.addEventListener("keydown", event => { if (event.key === "Escape" && modal.style.display === "flex") close(); });
        document.getElementById("municipalSummaryConfirmProceed").addEventListener("click", async () => {
            const preparedBy = document.getElementById("municipalSummaryConfirmPreparedBy").value.trim();
            const position = document.getElementById("municipalSummaryConfirmPosition").value.trim();
            const title = document.getElementById("municipalSummaryConfirmReportTitle").value.trim();
            const municipality = document.getElementById("municipalSummaryConfirmMunicipality").value.trim();
            const error = document.getElementById("municipalSummaryConfirmError");
            if (!title || !municipality || !preparedBy || !position) { error.textContent = "Please complete Report Title, Municipality, Prepared by, and Position."; return; }
            localStorage.setItem("municipal_export_report_title", title);
            localStorage.setItem("municipality", municipality);
            localStorage.setItem("municipal_export_prepared_by", preparedBy);
            localStorage.setItem("municipal_export_position", position);
            const signatureInfo = { preparedBy, position, title, municipality };
            const type = modal.dataset.exportType;
            close();
            if (type === "pdf") await exportMunicipalSummaryPdf(signatureInfo);
            else await exportMunicipalSummaryXlsx(signatureInfo);
        });
        return modal;
    }

    function showSummaryExportConfirmation(type) {
        const source = document.getElementById("municipalSummaryContent");
        if (!source || !source.innerText.trim()) { alert("The summary has not loaded yet. Please wait for it to finish loading."); return; }
        const modal = ensureSummaryExportConfirmationModal();
        const info = reportCycleInfo();
        const from = document.getElementById("summaryPeriodStart")?.value || "All Time";
        const to = document.getElementById("summaryPeriodEnd")?.value || "All Time";
        modal.dataset.exportType = type;
        document.getElementById("municipalSummaryConfirmTitle").textContent = type === "pdf" ? "Confirm Summary PDF Export" : "Confirm Summary Excel Export";
        document.getElementById("municipalSummaryConfirmDescription").textContent = type === "pdf" ? "Confirm the report details, then review the generated PDF preview before downloading." : "Check the reporting period and enter the details that should appear in the exported file.";
        document.getElementById("municipalSummaryConfirmMunicipality").value = info.municipality || "";
        document.getElementById("municipalSummaryConfirmReportTitle").value = localStorage.getItem("municipal_export_report_title") || "Municipal Summary Report";
        document.getElementById("municipalSummaryConfirmPeriod").textContent = `${from} to ${to}`;
        document.getElementById("municipalSummaryConfirmPreparedBy").value = localStorage.getItem("municipal_export_prepared_by") || info.name || "";
        document.getElementById("municipalSummaryConfirmPosition").value = localStorage.getItem("municipal_export_position") || info.role || "";
        document.getElementById("municipalSummaryConfirmError").textContent = "";
        document.getElementById("municipalSummaryConfirmProceed").textContent = type === "pdf" ? "Confirm & Preview PDF" : "Confirm & Download Excel";
        modal.style.display = "flex";
    }

    function getMunicipalSummaryIntentRows() {
        const source = currentSummaryData && Array.isArray(currentSummaryData.intents) ? currentSummaryData.intents : [];
        const value = v => (v === null || v === undefined || String(v).trim() === "" ? "—" : String(v).trim());
        const dateValue = v => {
            if (!v) return "—";
            try { return typeof formatDate === "function" ? formatDate(v) : new Date(v).toLocaleDateString("en-PH"); }
            catch (_) { return value(v); }
        };
        return source.map((i, index) => {
            const variances = typeof getIntentVariances === "function" ? getIntentVariances(i).map(v => v.label) : [];
            const remark = typeof getVarianceRemark === "function" ? getVarianceRemark(i) : (i.variance_remark || i.comment || "");
            const barangay = i.barangay || (i.location ? String(i.location).split(",")[0].trim() : "") || "—";
            return {
                intentId: value(i.planting_intent_id ?? i.intent_id ?? i.id ?? index + 1),
                reportId: value(i.report_id ?? i.submission_id),
                reportTitle: value(i.report_title || i.title || i.report_name),
                farmer: value(i.farmer_name || i.farmer || i.name),
                commodity: value(i.commodity),
                barangay: value(barangay),
                plannedVolume: Number(i.volume) || 0,
                actualVolume: Number(i.actual_harvest_volume ?? i.actual_volume) || 0,
                plannedPlanting: dateValue(i.planting_date),
                actualPlanting: dateValue(i.actual_planting_date),
                plannedHarvest: dateValue(i.harvest_date),
                actualHarvest: dateValue(i.actual_harvest_date),
                status: value(i.finalized_status_at_submission || i.finalized_status || i.status),
                reportStatus: value(i.report_status),
                variance: variances.length ? variances.join(", ") : "None recorded",
                remark: value(remark),
                raw: i
            };
        });
    }

    function getMunicipalSummaryInsights() {
        const rows = getMunicipalSummaryIntentRows();
        const countBy = key => {
            const counts = new Map();
            rows.forEach(r => { const label = String(key(r) || "Unknown").trim() || "Unknown"; counts.set(label, (counts.get(label) || 0) + 1); });
            return [...counts.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        };
        const top = list => list.length ? `${list[0][0]} (${list[0][1]} intents)` : "No data";
        const totalPlanned = rows.reduce((sum,r) => sum + r.plannedVolume, 0);
        const totalActual = rows.reduce((sum,r) => sum + r.actualVolume, 0);
        const withVariance = rows.filter(r => r.variance !== "None recorded");
        const varianceCounts = new Map();
        rows.forEach(r => r.variance.split(", ").filter(x => x && x !== "None recorded").forEach(x => varianceCounts.set(x, (varianceCounts.get(x) || 0) + 1)));
        const topVariance = [...varianceCounts.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        const uniqueReports = new Set(rows.map(r => r.reportId).filter(x => x !== "—"));
        const uniqueFarmers = new Set(rows.map(r => r.farmer).filter(x => x !== "—"));
        const statusCounts = countBy(r => r.status);
        const commodityCounts = countBy(r => r.commodity);
        const barangayCounts = countBy(r => r.barangay);
        return [
            ["Insight", "Finding", "Count / Value"],
            ["Individual intents included", String(rows.length), rows.length],
            ["Unique reports represented", String(uniqueReports.size || (rows.length ? "Not supplied by summary data" : 0)), uniqueReports.size],
            ["Unique farmers represented", String(uniqueFarmers.size), uniqueFarmers.size],
            ["Most common commodity", commodityCounts.length ? commodityCounts[0][0] : "No data", commodityCounts.length ? commodityCounts[0][1] : 0],
            ["Most represented barangay", barangayCounts.length ? barangayCounts[0][0] : "No data", barangayCounts.length ? barangayCounts[0][1] : 0],
            ["Most common finalized status", statusCounts.length ? statusCounts[0][0] : "No data", statusCounts.length ? statusCounts[0][1] : 0],
            ["Intents with date variance", String(withVariance.length), withVariance.length],
            ["Most common variance type", topVariance.length ? topVariance[0][0] : "None recorded", topVariance.length ? topVariance[0][1] : 0],
            ["Total planned volume", String(totalPlanned), totalPlanned],
            ["Total actual harvest volume recorded", String(totalActual), totalActual]
        ];
    }

    async function exportMunicipalSummaryPdf(signatureInfo = {}) {
        const source = document.getElementById("municipalSummaryContent");

        if (!source || !source.innerText.trim()) {
            alert("The summary has not loaded yet. Please wait for it to finish loading.");
            return;
        }

        const from = document.getElementById("summaryPeriodStart")?.value || "All Time";
        const to = document.getElementById("summaryPeriodEnd")?.value || "All Time";
        const model = getMunicipalSummaryExportModel(signatureInfo);

        const root = document.createElement("div");
        root.style.cssText =
            "width:100%;font-family:Arial,sans-serif;color:#262626;font-size:10px;line-height:1.35;";

        const makeSection = (headingText, rows, isCertification = false) => {
            const section = document.createElement("section");
            section.style.cssText = "margin:8px 0 13px;page-break-inside:avoid;";

            const heading = document.createElement("h3");
            heading.textContent = headingText;
            heading.style.cssText =
                "font-size:11px;font-weight:700;color:#0B382A;margin:8px 0 5px;padding-bottom:4px;border-bottom:1px solid #EAB308;";
            section.appendChild(heading);

            if (isCertification) {
                const certEl = document.createElement("div");
                certEl.dataset.certification = "1";
                certEl.textContent = "Certification";
                section.appendChild(certEl);
            } else {
                const table = document.createElement("table");
                table.style.cssText =
                    "width:100%;border-collapse:collapse;font-size:8px;margin:5px 0 9px;";

                (rows || []).forEach((row, rowIndex) => {
                    const tr = document.createElement("tr");

                    row.forEach(value => {
                        const cell = document.createElement(
                            rowIndex === 0 ? "th" : "td"
                        );

                        cell.textContent = cleanExportText(value);
                        cell.style.cssText =
                            `border:1px solid #BFBFBF;padding:4px;text-align:left;vertical-align:top;` +
                            (
                                rowIndex === 0
                                    ? "background:#0B382A;color:#FFFFFF;font-weight:700;"
                                    : rowIndex % 2 === 0
                                        ? "background:#EEF4F0;color:#262626;"
                                        : "background:#FFFFFF;color:#262626;"
                            );

                        tr.appendChild(cell);
                    });

                    table.appendChild(tr);
                });

                section.appendChild(table);
            }

            root.appendChild(section);
        };

        const kpiGrid = document.createElement("div");
        kpiGrid.className = "summary-kpi-grid";
        kpiGrid.style.cssText =
            "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0 12px;";

        model.metrics.slice(1, 7).forEach(row => {
            const card = document.createElement("div");
            card.className = "summary-kpi-card";
            card.style.cssText =
                "border:1px solid #0B382A;border-left:4px solid #EAB308;padding:7px;background:#FFFFFF;min-height:48px;";

            const label = document.createElement("div");
            label.className = "summary-kpi-label";
            label.textContent = row[0] || "Metric";
            label.style.cssText = "font-size:7px;color:#0B382A;font-weight:700;";

            const value = document.createElement("strong");
            value.className = "summary-kpi-value";
            value.textContent = row[1] || "—";
            value.style.cssText =
                "display:block;font-size:13px;color:#0B382A;margin:3px 0;";

            const sub = document.createElement("small");
            sub.className = "summary-kpi-subtext";
            sub.textContent = row[2] || "";
            sub.style.cssText = "font-size:6px;color:#595959;";

            card.append(label, value, sub);
            kpiGrid.appendChild(card);
        });

        const kpiHeading = document.createElement("h3");
        kpiHeading.textContent = "KPI Dashboard";
        kpiHeading.style.cssText =
            "font-size:11px;font-weight:700;color:#0B382A;margin:7px 0 4px;";

        root.append(kpiHeading, kpiGrid);

        model.reportSections
            .filter(section => section.key !== "kpis")
            .forEach(section => {
                makeSection(
                    section.title,
                    section.rows,
                    section.key === "certification"
                );
            });

        await downloadPdf(
            root,
            `municipal_summary_${from}_${to}.pdf`,
            model.title,
            {
                ...signatureInfo,
                municipality: model.municipality,
                reportingPeriod: `${from} to ${to}`
            }
        );
    }

    function getMunicipalSummaryExportModel(signatureInfo = {}) {
        const source = document.getElementById("municipalSummaryContent");
        const info = reportCycleInfo();
        const from = document.getElementById("summaryPeriodStart")?.value || "All Time";
        const to = document.getElementById("summaryPeriodEnd")?.value || "All Time";
        const intents = getMunicipalSummaryIntentRows();

        const title =
            signatureInfo.title ||
            localStorage.getItem("municipal_export_report_title") ||
            "Municipal Summary Report";

        const municipality =
            signatureInfo.municipality ||
            info.municipality ||
            currentSummaryData?.municipality ||
            "Guagua";

        const preparedBy = signatureInfo.preparedBy || info.name || "";
        const position = signatureInfo.position || info.role || "";
        const generated = new Date().toLocaleString("en-PH");

        const metricCards = Array.from(
            source?.querySelectorAll(
                ".summary-kpi-grid > .summary-kpi-card, .summary-seven-grid > *"
            ) || []
        ).slice(0, 6);

        const metrics = [["Metric", "Value", "Details"]];

        metricCards.forEach(card => {
            const pick = selector =>
                card.querySelector(selector)?.innerText?.trim() || "";

            metrics.push([
                cleanExportText(
                    pick(".summary-kpi-label, .summary-seven-label, .kpi-label, h3, h4") ||
                    "Key Metric"
                ),
                cleanExportText(
                    pick(".summary-kpi-value, .summary-seven-value, .kpi-value, strong, .value") ||
                    "—"
                ),
                cleanExportText(
                    pick(".summary-kpi-subtext, .summary-seven-subtext, .kpi-subtext, small, p")
                )
            ]);
        });

        const totalPlanned = intents.reduce(
            (sum, row) => sum + (Number(row.plannedVolume) || 0),
            0
        );

        const totalActual = intents.reduce(
            (sum, row) => sum + (Number(row.actualVolume) || 0),
            0
        );

        const uniqueFarmers = new Set(
            intents
                .map(row => row.farmer)
                .filter(value => value && value !== "—")
        ).size;

        const harvestedCount = intents.filter(
            row => String(row.status).toLowerCase().includes("harvested")
        ).length;

        const harvestRate = intents.length
            ? Math.round(harvestedCount / intents.length * 100)
            : 0;

        const pendingReports = Number(
            currentSummaryData?.pending_report_count ??
            currentSummaryData?.pending_reports ??
            0
        );

        if (metrics.length === 1) {
            metrics.push(
                ["Total Intents", String(intents.length), "Planting intent records"],
                ["Total Volume", `${totalPlanned} kg`, "Planned volume"],
                ["Unique Farmers", String(uniqueFarmers), "Distinct farmers represented"],
                ["Pending Reports", String(pendingReports), "Reports awaiting review"],
                ["Harvested Volume", `${totalActual} kg`, "Actual harvest volume recorded"],
                ["Harvest Rate", `${harvestRate}%`, `${harvestedCount} harvested intents`]
            );
        }

        while (metrics.length < 7) {
            metrics.push([
                `Metric ${metrics.length}`,
                "—",
                "Not supplied by summary data"
            ]);
        }

        const groupBy = keyFn => {
            const map = new Map();

            intents.forEach(row => {
                const key = String(keyFn(row) || "Unknown").trim() || "Unknown";
                const item = map.get(key) || { count: 0, volume: 0 };

                item.count += 1;
                item.volume += Number(row.plannedVolume) || 0;
                map.set(key, item);
            });

            return [...map.entries()].sort(
                (a, b) => b[1].volume - a[1].volume || a[0].localeCompare(b[0])
            );
        };

        const commodityRows = [["Commodity", "Count", "Planned Volume"]];
        groupBy(row => row.commodity).forEach(([key, value]) => {
            commodityRows.push([key, value.count, `${value.volume} kg`]);
        });

        const barangayRows = [["Barangay", "Count", "Planned Volume"]];
        groupBy(row => row.barangay).forEach(([key, value]) => {
            barangayRows.push([key, value.count, `${value.volume} kg`]);
        });

        const statusOrder = ["NOT PLANTED", "PLANTED", "HARVESTED", "MEDIATING"];
        const statusLabels = {
            "NOT PLANTED": "Not Planted",
            "PLANTED": "Planted",
            "HARVESTED": "Harvested",
            "MEDIATING": "Mediating"
        };

        const statusMap = new Map();

        intents.forEach(row => {
            const key = String(row.status || "Not Planted").toUpperCase();
            const item = statusMap.get(key) || { count: 0, volume: 0 };

            item.count += 1;
            item.volume += Number(row.plannedVolume) || 0;
            statusMap.set(key, item);
        });

        const statusRows = [["Finalized Status", "Count", "Planned Volume"]];

        statusOrder.forEach(key => {
            const value = statusMap.get(key) || { count: 0, volume: 0 };
            statusRows.push([
                statusLabels[key],
                value.count,
                `${value.volume} kg`
            ]);
        });

        [...statusMap.entries()]
            .filter(([key]) => !statusOrder.includes(key))
            .forEach(([key, value]) => {
                statusRows.push([key, value.count, `${value.volume} kg`]);
            });

        const shortfall = totalPlanned > 0
            ? Math.round((totalPlanned - totalActual) / totalPlanned * 100)
            : 0;

        const yieldRows = [
            ["Measure", "Value"],
            ["Expected", `${totalPlanned} kg`],
            ["Actual", `${totalActual} kg`],
            ["Shortfall", totalPlanned > 0 ? `${shortfall}%` : "Not calculable"]
        ];

        const dateRange = field => {
            const values = intents
                .map(row => row.raw?.[field])
                .filter(Boolean)
                .map(raw => new Date(raw))
                .filter(date => !Number.isNaN(date.getTime()))
                .sort((a, b) => a - b);

            if (!values.length) return ["—", "—", "—"];

            const fmt = date =>
                typeof formatDate === "function"
                    ? formatDate(date)
                    : date.toLocaleDateString("en-PH");

            return [
                fmt(values[0]),
                fmt(values[values.length - 1]),
                `${Math.round(
                    (values[values.length - 1] - values[0]) / 86400000
                )} days`
            ];
        };

        const windowRows = [
            ["Milestone", "Earliest", "Latest", "Span"],
            ["Planting", ...dateRange("planting_date")],
            ["Harvest", ...dateRange("harvest_date")]
        ];

        const intentRows = [[
            "Intent ID", "Report ID", "Report Title", "Farmer", "Commodity",
            "Barangay", "Planned Volume (kg)", "Actual Harvest (kg)",
            "Planned Planting", "Actual Planting", "Planned Harvest",
            "Actual Harvest", "Finalized Status", "Report Status",
            "Variance Type", "Variance Remark"
        ]];

        intents.forEach(row => {
            intentRows.push([
                row.intentId,
                row.reportId,
                row.reportTitle,
                row.farmer,
                row.commodity,
                row.barangay,
                row.plannedVolume,
                row.actualVolume,
                row.plannedPlanting,
                row.actualPlanting,
                row.plannedHarvest,
                row.actualHarvest,
                row.status,
                row.reportStatus,
                row.variance,
                row.remark === "—" ? "" : row.remark
            ]);
        });

        const varianceRows = [[
            "Intent ID", "Planned Planting", "Actual Planting",
            "Planned Harvest", "Actual Harvest", "Variance Type", "Remarks"
        ]];

        intents.forEach(row => {
            varianceRows.push([
                row.intentId,
                row.plannedPlanting,
                row.actualPlanting,
                row.plannedHarvest,
                row.actualHarvest,
                row.variance,
                row.remark === "—" ? "" : row.remark
            ]);
        });

        const insightRows = getMunicipalSummaryInsights();

        const metadata = [
            ["Reporting Period", `${from} to ${to}`],
            ["Coverage", municipality],
            [
                "Reports Included",
                currentSummaryData?.report_count ??
                new Set(
                    intents
                        .map(row => row.reportId)
                        .filter(value => value !== "—")
                ).size
            ],
            ["Generated", generated],
            ["Prepared by", preparedBy],
            ["Position", position]
        ];

        const reportSections = [
            {
                key: "kpis",
                title: "02 | KPI DASHBOARD",
                rows: metrics
            },
            {
                key: "metadata",
                title: "03 | REPORT METADATA",
                rows: [["Field", "Value"], ...metadata]
            },
            {
                key: "commodity",
                title: "04 | BY COMMODITY",
                rows: commodityRows
            },
            {
                key: "barangay",
                title: "05 | BY BARANGAY",
                rows: barangayRows
            },
            {
                key: "status",
                title: "06 | BY FINALIZED STATUS",
                rows: statusRows
            },
            {
                key: "yield",
                title: "07 | YIELD PERFORMANCE",
                rows: yieldRows
            },
            {
                key: "window",
                title: "08 | PLANTING & HARVEST WINDOW",
                rows: windowRows
            },
            {
                key: "insights",
                title: "09 | COMMON FINDINGS AND CYCLE INSIGHTS",
                rows: insightRows
            },
            {
                key: "intents",
                title: `10 | INDIVIDUAL INTENT RECORDS (${intents.length})`,
                rows: intentRows
            },
            {
                key: "variance",
                title: "11 | PLANTING, HARVEST, AND VARIANCE DETAILS",
                rows: varianceRows
            },
            {
                key: "certification",
                title: "12 | CERTIFICATION BLOCK",
                rows: [
                    ["Field", "Details"],
                    ["Prepared by", preparedBy || ""],
                    ["Received by / Date", "Provincial Agriculture Office"]
                ]
            }
        ];

        return {
            source,
            from,
            to,
            title,
            municipality,
            preparedBy,
            position,
            generated,
            intents,
            metrics,
            metadata,
            commodityRows,
            barangayRows,
            statusRows,
            yieldRows,
            windowRows,
            insightRows,
            intentRows,
            varianceRows,
            reportSections
        };
    }

    function buildMunicipalSummaryWorkbook(ExcelJS, model) {
        const C = {
            primary: "FF0B382A", secondary: "FF14532D", gold: "FFEAB308", tint: "FFE3EEE7",
            zebra: "FFF3F7F4", line: "FFDCE5DD", ink: "FF202824", muted: "FF5F6B64", white: "FFFFFFFF",
            amber: "FF9A5A00", amberTint: "FFFEF3C7", good: "FF17603A", blue: "FF1F5F8B"
        };
        const solid = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
        const thin = argb => ({ style: "thin", color: { argb } });

        const subtitle =
            `Office of the Municipal Agriculture - ${model.municipality} | Reporting period: ${model.from} to ${model.to} | Generated: ${model.generated}`;
        const officeText = `Municipal Agriculture Office, ${model.municipality}`;
        const intents = Array.isArray(model.intents) ? model.intents : [];

        const wb = new ExcelJS.Workbook();
        wb.creator = "eSaka Municipal Agriculture";
        wb.title = model.title;
        wb.subject = model.title;
        wb.created = new Date();
        wb.modified = new Date();

        const num = v => Number(v) || 0;
        const blank = v => (v === null || v === undefined || v === "—" ? "" : v);
        const toDate = v => {
            if (!v) return null;
            const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
            const d = new Date(v);
            return Number.isNaN(d.getTime()) ? null : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        };
        const dayDiff = (a, b) => (a && b ? Math.round((b - a) / 86400000) : "");

        const newSheet = (name, tabColor, heading, lastCol, widths, landscape = true) => {
            const ws = wb.addWorksheet(name, {
                properties: { tabColor: { argb: tabColor } },
                views: [{ showGridLines: false }]
            });
            widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

            ws.mergeCells(1, 1, 1, lastCol);
            const c1 = ws.getCell(1, 1);
            c1.value = "DEPARTMENT OF AGRICULTURE  |  eSaka";
            c1.fill = solid(C.primary);
            c1.font = { bold: true, size: 14, color: { argb: C.white } };
            c1.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
            ws.getRow(1).height = 30;

            ws.mergeCells(2, 1, 2, lastCol);
            const c2 = ws.getCell(2, 1);
            c2.value = heading;
            c2.fill = solid(C.tint);
            c2.font = { bold: true, size: 12, color: { argb: C.primary } };
            c2.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
            c2.border = { left: { style: "thick", color: { argb: C.gold } } };
            ws.getRow(2).height = 24;

            ws.mergeCells(3, 1, 3, lastCol);
            const c3 = ws.getCell(3, 1);
            c3.value = subtitle;
            c3.font = { italic: true, size: 9, color: { argb: C.muted } };
            c3.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
            ws.getRow(3).height = 20;

            ws.pageSetup = {
                orientation: landscape ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9,
                margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 }
            };
            ws.headerFooter = { oddFooter: "&LeSaka | Municipal Agriculture&CPrepared by " + (model.preparedBy || "") + "&RPage &P of &N" };
            return ws;
        };

        const sectionHeading = (ws, row, lastCol, text) => {
            ws.mergeCells(row, 1, row, lastCol);
            const c = ws.getCell(row, 1);
            c.value = text;
            c.fill = solid(C.tint);
            c.font = { bold: true, size: 11, color: { argb: C.primary } };
            c.alignment = { vertical: "middle", indent: 1 };
            c.border = { left: { style: "thick", color: { argb: C.gold } } };
            ws.getRow(row).height = 22;
        };

        const statusFont = value => {
            const v = String(value || "").toLowerCase();
            if (v.includes("harvested") || v.includes("approved")) return { bold: true, size: 10, color: { argb: C.good } };
            if (v.includes("not planted") || v.includes("pending") || v.includes("flagged")) return { bold: true, size: 10, color: { argb: C.amber } };
            if (v.includes("planted")) return { bold: true, size: 10, color: { argb: C.secondary } };
            if (v.includes("mediating")) return { bold: true, size: 10, color: { argb: C.blue } };
            return null;
        };

        const writeTable = (ws, headerRow, headers, rows, o = {}) => {
            const align = o.align || {};
            headers.forEach((h, i) => {
                const c = ws.getCell(headerRow, i + 1);
                c.value = h;
                c.fill = solid(C.secondary);
                c.font = { bold: true, size: 10, color: { argb: C.white } };
                c.alignment = { vertical: "middle", horizontal: align[i] || "left", wrapText: true };
                c.border = { bottom: { style: "medium", color: { argb: C.gold } } };
            });
            ws.getRow(headerRow).height = 32;

            rows.forEach((row, ri) => {
                const r = headerRow + 1 + ri;
                row.forEach((v, ci) => {
                    const c = ws.getCell(r, ci + 1);
                    c.value = v === undefined || v === null ? "" : v;
                    c.font = { size: 10, color: { argb: C.ink } };
                    c.alignment = { vertical: "middle", horizontal: align[ci] || "left", wrapText: true };
                    c.border = { bottom: thin(C.line) };
                    if (ri % 2 === 1) c.fill = solid(C.zebra);
                    if (o.numFmt && o.numFmt[ci]) c.numFmt = o.numFmt[ci];
                    if (o.statusCols && o.statusCols.includes(ci)) {
                        const f = statusFont(typeof v === "object" && v ? v.result : v);
                        if (f) c.font = f;
                    }
                });
                ws.getRow(r).height = o.rowHeight || 21;
            });

            const lastRow = headerRow + rows.length;

            if (o.totals && rows.length) {
                const tr = lastRow + 1;
                headers.forEach((_, i) => {
                    const c = ws.getCell(tr, i + 1);
                    c.fill = solid(C.tint);
                    c.font = { bold: true, size: 10, color: { argb: C.primary } };
                    c.alignment = { vertical: "middle", horizontal: align[i] || "left" };
                    c.border = { top: thin(C.secondary), bottom: { style: "medium", color: { argb: C.gold } } };
                });
                ws.getCell(tr, 1).value = "TOTAL";
                o.totals.forEach(ci => {
                    const L = ws.getColumn(ci + 1).letter;
                    const c = ws.getCell(tr, ci + 1);
                    c.value = {
                        formula: `SUM(${L}${headerRow + 1}:${L}${lastRow})`,
                        result: rows.reduce((s, row) => s + num(row[ci]), 0)
                    };
                    if (o.numFmt && o.numFmt[ci]) c.numFmt = o.numFmt[ci];
                });
                ws.getRow(tr).height = 24;
            }
            return { headerRow, firstRow: headerRow + 1, lastRow };
        };

        const VOL = "#,##0.00";
        const DATE = "dd mmm yyyy";
        const DELTA = "+0;-0;0";
        const PCT = "0.0%";
        const rowsFor = {}; // sheet name -> data rows, used by the Overview index

        /* ---------------------------------------------------- OVERVIEW */
        const ov = newSheet("Overview", C.primary, "SUMMARY OVERVIEW", 4, [32, 34, 48, 14], false);
        let r = 5;
        sectionHeading(ov, r, 4, "KEY METRICS");
        r += 1;
        const metricRows = (model.metrics || []).slice(1).map(m => [m[0], m[1], m[2] || ""]);
        const mt = writeTable(ov, r, ["Metric", "Value", "Details"], metricRows, { align: { 1: "right" }, rowHeight: 22 });
        r = mt.lastRow + 2;

        sectionHeading(ov, r, 4, "REPORT DETAILS");
        r += 1;
        const detailRows = [
            ["Municipality", model.municipality],
            ["Office", officeText],
            ["Reporting period", `${model.from} to ${model.to}`],
            ["Reports included", (model.metadata.find(m => m[0] === "Reports Included") || [])[1] ?? ""],
            ["Individual intents", intents.length],
            ["Prepared by", model.preparedBy || ""],
            ["Position", model.position || ""],
            ["Generated", model.generated]
        ];
        const dt = writeTable(ov, r, ["Field", "Value"], detailRows, { rowHeight: 20 });
        r = dt.lastRow + 2;

        const indexAnchorRow = r; // filled in after the other sheets exist

        /* ---------------------------------------------------- INTENTS */
        const intentHeaders = [
            "Intent ID", "Report ID", "Report Title", "Farmer", "Commodity", "Barangay",
            "Planned Volume (kg)", "Actual Harvest (kg)", "Volume Var. %",
            "Planned Planting", "Actual Planting", "Planting Diff. (days)",
            "Planned Harvest", "Actual Harvest", "Harvest Diff. (days)",
            "Finalized Status", "Report Status", "Variance Type", "Remarks"
        ];
        const it = newSheet("Intents", C.secondary, `INDIVIDUAL INTENT RECORDS (${intents.length})`, intentHeaders.length,
            [10, 10, 28, 24, 16, 18, 14, 14, 11, 14, 14, 12, 14, 14, 12, 16, 22, 18, 46]);
        const IH = 5;
        const intentRows = intents.map((row, i) => {
            const rr = IH + 1 + i;
            const raw = row.raw || {};
            const pp = toDate(raw.planting_date), ap = toDate(raw.actual_planting_date);
            const ph = toDate(raw.harvest_date), ah = toDate(raw.actual_harvest_date);
            const idNum = Number(row.intentId);
            return [
                Number.isFinite(idNum) && String(row.intentId).trim() !== "" ? idNum : blank(row.intentId),
                blank(row.reportId), blank(row.reportTitle), blank(row.farmer), blank(row.commodity), blank(row.barangay),
                num(row.plannedVolume),
                num(row.actualVolume) > 0 ? num(row.actualVolume) : "",
                {
                    formula: `IF(OR(H${rr}="",G${rr}=0),"",(H${rr}-G${rr})/G${rr})`,
                    result: num(row.actualVolume) > 0 && num(row.plannedVolume) > 0
                        ? (num(row.actualVolume) - num(row.plannedVolume)) / num(row.plannedVolume) : ""
                },
                pp || "", ap || "",
                { formula: `IF(OR(J${rr}="",K${rr}=""),"",K${rr}-J${rr})`, result: dayDiff(pp, ap) },
                ph || "", ah || "",
                { formula: `IF(OR(M${rr}="",N${rr}=""),"",N${rr}-M${rr})`, result: dayDiff(ph, ah) },
                blank(row.status), blank(row.reportStatus),
                row.variance === "None recorded" ? "" : blank(row.variance),
                row.remark === "—" ? "" : blank(row.remark)
            ];
        });
        const itT = writeTable(it, IH, intentHeaders, intentRows, {
            align: { 0: "center", 1: "center", 6: "right", 7: "right", 8: "right", 9: "center", 10: "center", 11: "center", 12: "center", 13: "center", 14: "center" },
            numFmt: { 6: VOL, 7: VOL, 8: PCT, 9: DATE, 10: DATE, 11: DELTA, 12: DATE, 13: DATE, 14: DELTA },
            statusCols: [15, 16],
            totals: [6, 7],
            rowHeight: 22
        });
        intentRows.forEach((row, i) => {
            const rr = IH + 1 + i;
            if (row[17]) {
                const c = it.getCell(rr, 18);
                c.fill = solid(C.amberTint);
                c.font = { bold: true, size: 10, color: { argb: C.amber } };
            }
            [12, 15].forEach(col => {
                const res = row[col - 1] && row[col - 1].result;
                if (res !== "" && res !== undefined && res !== 0) it.getCell(rr, col).font = { bold: true, size: 10, color: { argb: C.amber } };
            });
        });
        if (intentRows.length) {
            it.autoFilter = { from: { row: IH, column: 1 }, to: { row: IH + intentRows.length, column: intentHeaders.length } };
        } else {
            it.mergeCells(IH + 1, 1, IH + 1, 8);
            it.getCell(IH + 1, 1).value = "No intents found for the selected period and filters.";
            it.getCell(IH + 1, 1).font = { italic: true, color: { argb: C.muted } };
        }
        it.views = [{ state: "frozen", xSplit: 1, ySplit: IH, showGridLines: false }];
        rowsFor["Intents"] = intentRows.length;

        /* ---------------------------------------------------- DATE VARIANCES */
        const varHeaders = [
            "Intent ID", "Farmer", "Commodity", "Barangay", "Variance Type",
            "Planned Planting", "Actual Planting", "Planting Diff. (days)",
            "Planned Harvest", "Actual Harvest", "Harvest Diff. (days)", "Remarks"
        ];
        const vsheet = newSheet("Date Variances", C.gold, "DATE VARIANCES AND REMARKS", varHeaders.length,
            [10, 24, 16, 18, 18, 14, 14, 12, 14, 14, 12, 60]);
        const withVariance = intents.filter(row => row.variance !== "None recorded" || (row.remark && row.remark !== "—"));
        if (withVariance.length) {
            const VH = 5;
            const vRows = withVariance.map((row, i) => {
                const rr = VH + 1 + i;
                const raw = row.raw || {};
                const pp = toDate(raw.planting_date), ap = toDate(raw.actual_planting_date);
                const ph = toDate(raw.harvest_date), ah = toDate(raw.actual_harvest_date);
                const idNum = Number(row.intentId);
                return [
                    Number.isFinite(idNum) && String(row.intentId).trim() !== "" ? idNum : blank(row.intentId),
                    blank(row.farmer), blank(row.commodity), blank(row.barangay),
                    row.variance === "None recorded" ? "" : blank(row.variance),
                    pp || "", ap || "",
                    { formula: `IF(OR(F${rr}="",G${rr}=""),"",G${rr}-F${rr})`, result: dayDiff(pp, ap) },
                    ph || "", ah || "",
                    { formula: `IF(OR(I${rr}="",J${rr}=""),"",J${rr}-I${rr})`, result: dayDiff(ph, ah) },
                    row.remark === "—" ? "" : blank(row.remark)
                ];
            });
            writeTable(vsheet, VH, varHeaders, vRows, {
                align: { 0: "center", 5: "center", 6: "center", 7: "center", 8: "center", 9: "center", 10: "center" },
                numFmt: { 5: DATE, 6: DATE, 7: DELTA, 8: DATE, 9: DATE, 10: DELTA },
                rowHeight: 30
            });
            vRows.forEach((row, i) => {
                const rr = VH + 1 + i;
                const c = vsheet.getCell(rr, 5);
                if (row[4]) { c.fill = solid(C.amberTint); c.font = { bold: true, size: 10, color: { argb: C.amber } }; }
            });
            vsheet.autoFilter = { from: { row: VH, column: 1 }, to: { row: VH + vRows.length, column: varHeaders.length } };
            vsheet.views = [{ state: "frozen", ySplit: VH, showGridLines: false }];
        } else {
            vsheet.mergeCells(5, 1, 5, 8);
            vsheet.getCell(5, 1).value = "No date variances or variance remarks were recorded for this period.";
            vsheet.getCell(5, 1).font = { italic: true, color: { argb: C.muted } };
        }
        rowsFor["Date Variances"] = withVariance.length;

        /* ---------------------------------------------------- GROUPED SHEETS */
        const totalPlanned = intents.reduce((s, row) => s + num(row.plannedVolume), 0);
        const totalActual = intents.reduce((s, row) => s + num(row.actualVolume), 0);

        const aggregate = keyFn => {
            const map = new Map();
            intents.forEach(row => {
                const k = String(keyFn(row) || "Unknown").trim() || "Unknown";
                const item = map.get(k) || { count: 0, planned: 0, actual: 0, farmers: new Set() };
                item.count += 1;
                item.planned += num(row.plannedVolume);
                item.actual += num(row.actualVolume);
                if (row.farmer && row.farmer !== "—") item.farmers.add(row.farmer);
                map.set(k, item);
            });
            return [...map.entries()].sort((a, b) => b[1].planned - a[1].planned || a[0].localeCompare(b[0]));
        };

        const groupSheet = (name, label, entries, tab) => {
            const ws = newSheet(name, tab, `PLANTING INTENTS ${name.toUpperCase()}`, 6, [30, 12, 12, 20, 20, 16], false);
            const rows = entries.map(([k, v]) => [
                k, v.count, v.farmers.size, v.planned, v.actual > 0 ? v.actual : 0, totalPlanned > 0 ? v.planned / totalPlanned : 0
            ]);
            writeTable(ws, 5, [label, "Intents", "Farmers", "Planned Volume (kg)", "Actual Harvest (kg)", "Share of Volume"], rows, {
                align: { 1: "center", 2: "center", 3: "right", 4: "right", 5: "right" },
                numFmt: { 3: VOL, 4: VOL, 5: PCT },
                totals: [1, 3, 4, 5]
            });
            ws.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
            rowsFor[name] = rows.length;
            return ws;
        };

        groupSheet("By Commodity", "Commodity", aggregate(row => row.commodity), C.secondary);
        groupSheet("By Barangay", "Barangay", aggregate(row => row.barangay), C.secondary);

        const statusOrder = ["NOT PLANTED", "PLANTED", "HARVESTED", "MEDIATING"];
        const statusLabel = { "NOT PLANTED": "Not Planted", "PLANTED": "Planted", "HARVESTED": "Harvested", "MEDIATING": "Mediating" };
        const statusMap = new Map(statusOrder.map(k => [k, { count: 0, planned: 0, actual: 0, farmers: new Set() }]));
        intents.forEach(row => {
            const k = String(row.status || "NOT PLANTED").toUpperCase();
            const item = statusMap.get(k) || { count: 0, planned: 0, actual: 0, farmers: new Set() };
            item.count += 1;
            item.planned += num(row.plannedVolume);
            item.actual += num(row.actualVolume);
            if (row.farmer && row.farmer !== "—") item.farmers.add(row.farmer);
            statusMap.set(k, item);
        });
        const statusEntries = [...statusMap.entries()].map(([k, v]) => [statusLabel[k] || k, v]);
        groupSheet("By Status", "Finalized Status", statusEntries, C.secondary);

        /* ---------------------------------------------------- YIELD AND WINDOW */
        const yw = newSheet("Yield and Window", C.secondary, "YIELD PERFORMANCE AND PLANTING WINDOW", 4, [32, 20, 20, 18], false);
        sectionHeading(yw, 5, 4, "YIELD PERFORMANCE");
        const yRows = [
            ["Expected (planned volume, kg)", totalPlanned],
            ["Actual (harvested volume, kg)", totalActual],
            ["Variance vs. plan (negative = shortfall)", ""]
        ];
        const yT = writeTable(yw, 6, ["Measure", "Value"], yRows, { align: { 1: "right" }, numFmt: { 1: VOL } });
        const yVar = yw.getCell(yT.lastRow, 2);
        yVar.value = {
            formula: `IF(B${yT.firstRow}=0,"",(B${yT.firstRow + 1}-B${yT.firstRow})/B${yT.firstRow})`,
            result: totalPlanned > 0 ? (totalActual - totalPlanned) / totalPlanned : ""
        };
        yVar.numFmt = PCT;
        yVar.font = { bold: true, size: 10, color: { argb: totalActual >= totalPlanned ? C.good : C.amber } };

        sectionHeading(yw, yT.lastRow + 2, 4, "PLANTING AND HARVEST WINDOW");
        const range = field => {
            const ds = intents.map(row => toDate(row.raw && row.raw[field])).filter(Boolean).sort((a, b) => a - b);
            return ds.length ? [ds[0], ds[ds.length - 1]] : ["", ""];
        };
        const wH = yT.lastRow + 3;
        const wRows = [["Planting", ...range("planting_date"), ""], ["Harvest", ...range("harvest_date"), ""]];
        const wT = writeTable(yw, wH, ["Milestone", "Earliest", "Latest", "Span (days)"], wRows, {
            align: { 1: "center", 2: "center", 3: "center" }, numFmt: { 1: DATE, 2: DATE, 3: "0" }
        });
        for (let rr = wT.firstRow; rr <= wT.lastRow; rr++) {
            const vals = wRows[rr - wT.firstRow];
            yw.getCell(rr, 4).value = {
                formula: `IF(OR(B${rr}="",C${rr}=""),"",C${rr}-B${rr})`,
                result: vals[1] && vals[2] ? Math.round((vals[2] - vals[1]) / 86400000) : ""
            };
            yw.getCell(rr, 4).numFmt = "0";
        }
        rowsFor["Yield and Window"] = 2;

        /* ---------------------------------------------------- INSIGHTS */
        const ins = newSheet("Insights", C.secondary, "COMMON FINDINGS AND CYCLE INSIGHTS", 3, [40, 40, 16], false);
        const insRows = (model.insightRows || []).slice(1).map(row => [row[0], row[1], row[2]]);
        writeTable(ins, 5, ["Insight", "Finding", "Count / Value"], insRows, { align: { 2: "right" }, rowHeight: 22 });
        rowsFor["Insights"] = insRows.length;

        /* ---------------------------------------------------- CERTIFICATION (two columns + signature lines) */
        const cs = newSheet("Certification", C.gold, "CERTIFICATION", 3, [44, 8, 44], false);
        sectionHeading(cs, 5, 3, "SIGN-OFF");

        const sigBlock = (col, label, name, line1, line2) => {
            const lab = cs.getCell(7, col);
            lab.value = label;
            lab.font = { bold: true, size: 9, color: { argb: C.secondary } };
            lab.alignment = { horizontal: "left", vertical: "middle" };

            const sig = cs.getCell(8, col);
            sig.border = { bottom: { style: "medium", color: { argb: C.primary } } };

            const nm = cs.getCell(9, col);
            nm.value = name || "Signature over printed name";
            nm.font = name ? { bold: true, size: 11, color: { argb: C.primary } } : { italic: true, size: 9, color: { argb: C.muted } };
            nm.alignment = { horizontal: "center", vertical: "middle" };

            const l1 = cs.getCell(10, col);
            l1.value = line1 || "";
            l1.font = { size: 10, color: { argb: C.ink } };
            l1.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

            const l2 = cs.getCell(11, col);
            l2.value = line2 || "";
            l2.font = { size: 9, color: { argb: C.muted } };
            l2.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

            const dl = cs.getCell(13, col);
            dl.value = "Date:";
            dl.font = { size: 9, color: { argb: C.muted } };
            dl.border = { bottom: thin(C.muted) };
            dl.alignment = { horizontal: "left", vertical: "bottom" };
        };

        sigBlock(1, "PREPARED BY", model.preparedBy || "", model.position || "", officeText);
        sigBlock(3, "RECEIVED BY", "", "Provincial Agriculture Office", "Name, position and signature");
        cs.getRow(7).height = 22;
        cs.getRow(8).height = 56;
        cs.getRow(9).height = 22;
        cs.getRow(10).height = 20;
        cs.getRow(11).height = 20;
        cs.getRow(13).height = 26;

        /* ---------------------------------------------------- OVERVIEW: workbook index */
        sectionHeading(ov, indexAnchorRow, 4, "WORKBOOK CONTENTS");
        const tabs = [
            ["Intents", "One row per planting intent with dates, volumes, status and live variance formulas", rowsFor["Intents"]],
            ["Date Variances", "Intents whose actual dates differ from plan, with the recorded remarks", rowsFor["Date Variances"]],
            ["By Commodity", "Intent count, farmers and volume per commodity", rowsFor["By Commodity"]],
            ["By Barangay", "Intent count, farmers and volume per barangay", rowsFor["By Barangay"]],
            ["By Status", "Breakdown by finalized status", rowsFor["By Status"]],
            ["Yield and Window", "Planned versus actual yield and the planting/harvest window", rowsFor["Yield and Window"]],
            ["Insights", "Most common commodity, barangay, status and variance type", rowsFor["Insights"]],
            ["Certification", "Prepared by / Received by sign-off", ""]
        ];
        const ixT = writeTable(ov, indexAnchorRow + 1, ["Tab", "Description", "", "Rows"], tabs.map(t => [t[0], t[1], "", t[2]]), {
            align: { 3: "center" }, rowHeight: 20
        });
        for (let rr = ixT.firstRow; rr <= ixT.lastRow; rr++) {
            const name = tabs[rr - ixT.firstRow][0];
            const c = ov.getCell(rr, 1);
            c.value = { text: name, hyperlink: `#'${name}'!A1` };
            c.font = { size: 10, bold: true, underline: true, color: { argb: C.secondary } };
            ov.mergeCells(rr, 2, rr, 3);
        }
        ov.mergeCells(ixT.headerRow, 2, ixT.headerRow, 3);

        // open on the overview tab
        wb.views = [{ activeTab: 0 }];
        return wb;
    }

    async function exportMunicipalSummaryXlsx(signatureInfo = {}) {
        const source = document.getElementById("municipalSummaryContent");

        if (!source || !source.innerText.trim()) {
            alert("The summary has not loaded yet. Please wait for it to finish loading.");
            return;
        }

        const model = getMunicipalSummaryExportModel(signatureInfo);
        const filename = `municipal_summary_${model.from}_${model.to}.xlsx`;

        let ExcelJS;
        try {
            ExcelJS = await loadExcelJS();
        } catch (error) {
            console.warn("ExcelJS unavailable; using basic workbook fallback.", error);
            await writeStyledWorkbook(
                filename,
                model.title,
                `Department of Agriculture | Office of the Municipal Agriculture — ${model.municipality} | Reporting period: ${model.from} to ${model.to}`,
                model.metadata,
                [{ name: "Full Report", reportSections: model.reportSections }]
            );
            return;
        }

        try {
            const wb = buildMunicipalSummaryWorkbook(ExcelJS, model);
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
        } catch (error) {
            console.error("Summary workbook could not be built", error);
            alert("Could not build the Excel file. Please refresh the dashboard and try again.");
        }
    }

    function ensureMunicipalStatusCards() {
        const header = document.getElementById("reportsMainHeader");
        if (!header || document.getElementById("municipalStatusCards")) return;
        const cards = document.createElement("div");
        cards.id = "municipalStatusCards";
        cards.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin:0 0 20px;";
        const definitions = [
            {key:"pending",label:"Pending Reports",desc:"Awaiting municipal validation",countId:"reportCountPending",color:"#d97706",icon:"◷"},
            {key:"revision",label:"Awaiting Revision",desc:"Returned to AEWs for updates",countId:"reportCountRevision",color:"#b45309",icon:"↻"},
            {key:"provincial",label:"Sent to Provincial",desc:"Forwarded for provincial review",countId:"reportCountProvincial",color:"#2563eb",icon:"↗"},
            {key:"approved",label:"Approved Reports",desc:"Approved by provincial office",countId:"reportCountApproved",color:"#15803d",icon:"✓"}
        ];
        cards.innerHTML = definitions.map(item => `<button type="button" data-report-kpi="${item.key}" aria-pressed="false" style="display:flex;align-items:center;gap:14px;text-align:left;padding:17px 18px;background:#fff;border:1px solid #e1e8e2;border-left:4px solid ${item.color};border-radius:13px;box-shadow:0 4px 14px rgba(18,50,31,.06);cursor:pointer;min-height:94px;transition:transform .15s,box-shadow .15s;">
          <span aria-hidden="true" style="width:42px;height:42px;flex:0 0 42px;display:grid;place-items:center;border-radius:12px;background:${item.color}15;color:${item.color};font-size:24px;font-weight:800;">${item.icon}</span>
          <span style="min-width:0;display:block;"><span style="display:block;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#617067;">${item.label}</span><strong id="${item.countId}" style="display:block;font-size:27px;line-height:1.2;margin:4px 0;color:#172d22;">0</strong><span style="display:block;font-size:11px;color:#77847b;">${item.desc}</span></span>
        </button>`).join("");
        header.insertAdjacentElement("afterend", cards);
        if (typeof updateReportSummaryCards === "function") updateReportSummaryCards();
        const exportCopy = document.querySelector(".aew-summary-export-copy span");
        if (exportCopy) exportCopy.textContent = "Export the complete summary for the selected reporting period. No report selection is required.";
        cards.querySelectorAll("button").forEach(button => {
            button.addEventListener("mouseenter", () => { button.style.transform="translateY(-2px)"; button.style.boxShadow="0 8px 18px rgba(18,50,31,.10)"; });
            button.addEventListener("mouseleave", () => { button.style.transform="none"; button.style.boxShadow="0 4px 14px rgba(18,50,31,.06)"; });
        });
    }

    function initReportAlignment() {
        ensureMunicipalStatusCards();
        const search = document.getElementById("reportSearchInput");
        search?.addEventListener("input", () => {
            searchTerm = search.value.trim().toLowerCase();
            Object.keys(paginationState).forEach(id => paginationState[id] = 1);
            refreshReportTables();
        });
        document.querySelectorAll("[data-report-kpi]").forEach(card => {
            const activate = () => {
                const tab = card.dataset.reportKpi;
                document.querySelectorAll("[data-report-kpi]").forEach(item => item.setAttribute("aria-pressed", String(item === card)));
                const sections = {
                    pending: ["pendingReportsView"],
                    revision: ["awaitingRevisionView"],
                    provincial: ["sentToProvincialView"],
                    approved: ["sentToProvincialView"]
                };
                ["pendingReportsView","awaitingRevisionView","sentToProvincialView"].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = sections[tab].includes(id) ? "block" : "none";
                });
                if (tab === "approved") {
                    currentSentToProvincialFilter = "approved";
                    document.querySelectorAll("#sentToProvincialFilterPills .filter-pill").forEach(pill => pill.classList.toggle("active", pill.dataset.filter === "approved"));
                    renderSentReports();
                } else if (tab === "provincial") {
                    currentSentToProvincialFilter = "all";
                    document.querySelectorAll("#sentToProvincialFilterPills .filter-pill").forEach(pill => pill.classList.toggle("active", pill.dataset.filter === "all"));
                    renderSentReports();
                }
                const searchInput = document.getElementById("reportSearchInput");
                if (searchInput) searchInput.placeholder = `Search ${tab === "revision" ? "revision" : tab === "provincial" ? "provincial" : tab} reports...`;
            };
            card.addEventListener("click", activate);
            card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } });
        });
        document.getElementById("exportSummaryPdfBtn")?.addEventListener("click", () => showSummaryExportConfirmation("pdf"));
        document.getElementById("exportSummaryXlsxBtn")?.addEventListener("click", () => showSummaryExportConfirmation("xlsx"));
        ["exportSelectedPdfBtn", "exportSelectedXlsxBtn"].forEach(id => document.getElementById(id)?.remove());
        const meta = document.getElementById("reportCycleUserMeta");
        if (meta) {
            const info = reportCycleInfo();
            meta.textContent = ` · ${info.name} · ${info.role} · Office: ${info.municipality}`;
        }
        refreshReportTables();
    }

    document.addEventListener("DOMContentLoaded", initReportAlignment);
})();
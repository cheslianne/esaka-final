/* ============================================================
   eSAKA — DA-RFO OFFICER DASHBOARD
   Aligned with Provincial/Municipal logic
   (Pagination: Buyer Registry 7/page, System Alerts 4/page, ETL Logs 7/page)
============================================================ */

const API_BASE_URL = window.API_BASE_URL || "https://esaka-backend-production.up.railway.app";

const PENDING_BUYERS_ENDPOINT      = `${API_BASE_URL}/api/buyer-status/pending`;
const VERIFIED_BUYERS_ENDPOINT     = `${API_BASE_URL}/api/buyer-status/verified`;
const BUYER_STATUS_ENDPOINT        = `${API_BASE_URL}/api/buyer-status`;
const BUYER_ATTACHMENT_ENDPOINT    = `${API_BASE_URL}/api/buyer-registry/buyer-registry`;

const DA_PENDING_ENDPOINT              = `${API_BASE_URL}/api/report-submissions/for-da-rfo-validation`;
const RETURNED_TO_PROVINCIAL_ENDPOINT  = `${API_BASE_URL}/api/report-submissions/returned-to-provincial`;
const APPROVED_BY_REGIONAL_ENDPOINT    = `${API_BASE_URL}/api/report-submissions/approved-by-regional`;
const BULK_APPROVE_ENDPOINT            = `${API_BASE_URL}/api/report-submissions/bulk-approve`;

const REGIONAL_SUMMARY_ENDPOINT        = `${API_BASE_URL}/api/report-submissions/regional-summary`;
const DA_RFO_DASHBOARD_ENDPOINT       = `${API_BASE_URL}/api/da-rfo/dashboard`;


/* ============================================================
   AUTH
============================================================ */

function getAuthToken() {
    return "cookie-session";
}

function getAuthHeaders(includeContentType = true) {
    const token = getAuthToken();
    const headers = {};
    if (includeContentType) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token}`;
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
   GLOBAL VARIABLES
============================================================ */

let mapInstance = null;
let currentSelectedBuyer = null;
let pendingBuyersCache = [];
let verifiedBuyersCache = [];
let currentActiveAlertCard = null;

let MUNICIPALITY_MAP_RAW_DATA = [];
let mapMarkersLayer = null;

let pendingReports = [];
let returnedToProvincialReports = [];
let approvedReports = [];
let selectedReportIds = new Set();
let selectedReport = null;

let currentSummaryPeriod = { start: null, end: null, preset: "this-week" };
let currentSummaryData = null;
let selectedSummaryProvinces = [];
let selectedSummaryMunicipalities = [];
let daDashboardData = null;

/* ---------- PAGINATION STATE (7 items per page) ---------- */
const ITEMS_PER_PAGE = 7;
const ALERTS_PER_PAGE = 4;   // alert cards are taller, so 4 per page
const REPORTS_PAGE_SIZE = 3;
let currentPendingReportsPage = 1;
let currentReturnedReportsPage = 1;
let currentApprovedReportsPage = 1;

let currentPendingPage = 1;
let currentVerifiedPage = 1;

let systemAlertsCache = [];
let alertSearchTerm = "";
let currentAlertsPage = 1;

let etlLogsCache = [];
let etlSearchTerm = "";
let currentEtlPage = 1;

/* ============================================================
   PROFILE & AVATAR PERSISTENCE (DA-RFO Officer)
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

    let currentSelectedSrc = "../images/1.png";
    const userId = localStorage.getItem("user_id");

    openProfileBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!userId) { showCustomAlert("Session expired. Please log in again."); return; }

        try {
            const user = await apiRequest(`${API_BASE_URL}/api/users/${userId}`, { method: "GET" });
            if (profileFirstName) profileFirstName.value = user.first_name || "";
            if (profileLastName) profileLastName.value = user.last_name || "";
            if (profileUsername) profileUsername.value = user.username || "";

            let avatarFile = user.avatar;
            if (!avatarFile) {
                const savedLocal = localStorage.getItem("user_avatar_src");
                if (savedLocal) avatarFile = savedLocal.split("/").pop();
            }
            if (avatarFile) currentSelectedSrc = `../images/${avatarFile}`;
            else currentSelectedSrc = "../images/1.png";

            let matched = false;
            avatarOptions.forEach((opt) => {
                opt.classList.remove("selected");
                if (opt.dataset.avatarImg === currentSelectedSrc) { opt.classList.add("selected"); matched = true; }
            });
            if (!matched && avatarOptions.length > 0) {
                avatarOptions[0].classList.add("selected");
                currentSelectedSrc = avatarOptions[0].dataset.avatarImg;
            }

            profileModal.classList.add("show");
        } catch (error) {
            console.error("Failed to load profile:", error);
            showCustomAlert("Could not load profile data. Please try again.");
        }
    });

    avatarOptions.forEach(opt => {
        opt.addEventListener("click", () => {
            avatarOptions.forEach(el => el.classList.remove("selected"));
            opt.classList.add("selected");
            currentSelectedSrc = opt.dataset.avatarImg;
        });
    });

    closeProfileModalBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        profileModal.classList.remove("show");
    });

    profileModal.addEventListener("click", (e) => {
        if (e.target === profileModal) profileModal.classList.remove("show");
    });

    profileForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fName = profileFirstName.value.trim();
        const lName = profileLastName.value.trim();
        if (!fName || !lName) { showCustomAlert("Pakisagutan ang lahat ng kinakailangang fields."); return; }

        const avatarFilename = currentSelectedSrc.split("/").pop();
        const saveBtn = profileForm.querySelector('button[type="submit"]');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving..."; }

        try {
            const updatedUser = await apiRequest(`${API_BASE_URL}/api/users/${userId}`, {
                method: "PUT",
                body: JSON.stringify({ first_name: fName, last_name: lName, avatar: avatarFilename })
            });

            localStorage.setItem("user_display_name", `${fName} ${lName}`);
            localStorage.setItem("user_avatar_src", currentSelectedSrc);

            const displayNameEl = document.getElementById("userDisplayName");
            if (displayNameEl) displayNameEl.textContent = `${fName} ${lName}`;

            const avatarBox = document.querySelector(".user-info .avatar");
            if (avatarBox) {
                avatarBox.innerHTML = `<img src="${currentSelectedSrc}" alt="Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                avatarBox.style.background = "transparent";
            }

            profileModal.classList.remove("show");
            showCustomAlert("Profile updated and saved successfully!");
        } catch (error) {
            console.error("Update error:", error);
            showCustomAlert(error.message || "Failed to update profile.");
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save Changes"; }
        }
    });
}

/* ============================================================
   PAGE INITIALIZATION
============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
    initSidebar();
    initViewNavigation();
    initDaDashboard();
    initMap();
    initBuyerRegistry();
    initAlertThreshold();
    initAlertsSection();
    initReportsSection();
    initSignout();
    initModalListeners();
    initSummaryPeriodPicker();
    initDaSummaryExports();
    loadUserInformation();
    initProfileModal();
    initMarketUploadSection();

    initializeETLSearch();
    const manualRunBtn = document.getElementById("manualRunBtn");
    if (manualRunBtn) manualRunBtn.addEventListener("click", manualRunETL);
    loadETLRunLogs();

    await loadReports();

    if (document.getElementById("view-dashboard")?.classList.contains("active-view")) {
        loadDaDashboard();
    }
    const summaryView = document.getElementById("view-summary");
    if (summaryView && summaryView.classList.contains("active-view")) {
        loadRegionalSummary();
    }
});

function initDaDashboard() {
    const refreshButton = document.getElementById("refreshDaDashboardBtn");
    refreshButton?.addEventListener("click", loadDaDashboard);
    document.querySelectorAll("[data-view-target]").forEach(button => {
        button.addEventListener("click", () => {
            const target = document.querySelector(`.nav-item[data-view="${button.dataset.viewTarget}"]`);
            target?.click();
        });
    });

    const actionsList = document.getElementById("daActionsList");
    actionsList?.addEventListener("click", (event) => {
        const reviewButton = event.target.closest(".da-priority-action");
        if (!reviewButton) return;
        const targetView = reviewButton.dataset.reviewTarget || "reports";
        const target = document.querySelector(`.nav-item[data-view="${targetView}"]`);
        if (target) target.click();
    });
}

function escapeDaHtml(value) {
    return String(value ?? "—").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
}

function renderDaDashboard(data) {
    const kpis = data.kpis || {};
    const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    const formatValue = (value, suffix = "") => { const number = Number(value ?? 0); return `${number.toLocaleString()}${suffix}`.trim(); };
    const normalizeRefresh = (value) => { if (!value) return "—"; const str = String(value).trim(); if (!str || str === "null" || str === "undefined") return "—"; return str.replace("T", " ").replace("Z", " UTC"); };
    const normalizeDateOnly = (value) => { if (!value) return "—"; const str = String(value).trim(); if (!str || str === "null" || str === "undefined") return "—"; const dateMatch = str.match(/^(\d{4}-\d{2}-\d{2})/); return dateMatch ? dateMatch[1] : str; };
    const titleCase = (value) => { const str = String(value ?? "").replace(/[_-]+/g, " ").trim(); if (!str) return "—"; return str.replace(/\b\w/g, char => char.toUpperCase()); };

    set("daKpiReports", formatValue(kpis.reports_pending));
    set("daKpiAlerts", formatValue(kpis.alerts));
    const supplyRisk = Array.isArray(data.supply_risk) ? data.supply_risk : [];
    const oversupplyCount = supplyRisk.filter(item => String(item.status || "").toUpperCase() === "SURPLUS").length;
    set("daKpiOversupply", formatValue(kpis.oversupply_risks ?? oversupplyCount));
    set("daKpiEtl", formatValue(kpis.etl_failures ?? (data.etl || []).filter(item => String(item.status || "").toLowerCase().includes("fail")).length));

    const lastRefresh = data.last_refresh || data.last_updated || data.data_freshness?.last_refresh || data.freshness?.last_ingestion || data.last_ingestion || "";
    const psaRefresh = data.psa_openstat_date || data.psa_last_ingestion || data.freshness?.psa_openstat || data.freshness?.psa || "";
    set("daLastRefresh", normalizeRefresh(lastRefresh));
    set("daLastPsa", normalizeDateOnly(psaRefresh));

    const riskBody = document.getElementById("daSupplyRiskBody");
    if (riskBody) {
        riskBody.innerHTML = (data.supply_risk || []).length
            ? data.supply_risk.map(item => `<tr><td>${escapeDaHtml(item.municipality)}</td><td>${escapeDaHtml(item.commodity)}</td><td>${Number(item.supply_30d_kg || 0).toLocaleString()}</td><td>${Number(item.demand_30d_kg || 0).toLocaleString()}</td><td><span class="da-status ${escapeDaHtml(item.status || "BALANCED")}">${escapeDaHtml(item.status || "BALANCED")}</span></td></tr>`).join("")
            : `<tr><td colspan="5">No regional supply data available.</td></tr>`;
    }
    const supplyCards = document.getElementById("daSupplyCards");
    if (supplyCards) {
        supplyCards.innerHTML = supplyRisk.length
            ? supplyRisk.slice(0, 5).map(item => {
                const supply = Number(item.supply_30d_kg || 0);
                const demand = Number(item.demand_30d_kg || 0);
                const percentage = demand > 0 ? Math.round((supply / demand) * 100) : 0;
                const status = String(item.status || "BALANCED").toUpperCase();
                const tone = status === "SURPLUS" ? "risk" : status === "DEFICIT" ? "warn" : "";
                return `<div class="da-supply-row ${tone}"><div class="da-supply-row-head"><strong>${escapeDaHtml(item.commodity || "Commodity")}</strong><span>${percentage}% · ${escapeDaHtml(titleCase(status))}</span></div><div class="da-progress"><i style="width:${Math.min(Math.max(percentage, 3), 100)}%"></i></div><small><span>${supply.toLocaleString()} kg projected</span><span>${demand.toLocaleString()} kg target</span></small></div>`;
            }).join("")
            : `<div class="da-supply-row"><div class="da-supply-row-head"><strong>No supply data</strong><span>Awaiting regional inputs</span></div></div>`;
    }

    const priceBody = document.getElementById("daPricesBody");
    if (priceBody) {
        priceBody.innerHTML = (data.prices || []).length
            ? data.prices.map(item => {
                const price = item.wholesale_price_per_kg == null ? "—" : `₱${Number(item.wholesale_price_per_kg).toFixed(2)}`;
                const trend = String(item.trend || "Stable");
                const isOffTarget = /drop|below|low|decrease/i.test(trend);
                const forecastRange = item.forecast_low == null ? "Forecast unavailable" : `Forecast band: ₱${Number(item.forecast_low).toFixed(2)}–₱${Number(item.forecast_high).toFixed(2)}`;
                return `<div class="da-price-card ${isOffTarget ? "off-target" : ""}"><div><span class="commodity">${escapeDaHtml(item.commodity)}</span><span class="range">${escapeDaHtml(forecastRange)}</span></div><div class="da-price-value">${price}<small>${escapeDaHtml(trend)}</small></div></div>`;
            }).join("")
            : `<div class="da-price-card"><span class="commodity">No market price data available.</span></div>`;
    }

    const timeline = document.getElementById("daHarvestTimeline");
    if (timeline) {
        const rows = Array.isArray(data.harvest_timeline) ? data.harvest_timeline : [];
        const colors = { "Red Onion": "#167A58", "White Onion": "#4385B7", Tomato: "#D65B4A", Squash: "#D28A16", Other: "#67756D" };
        const maxVolume = Math.max(...rows.flatMap(row => Object.values(row.commodities || {})).map(Number), 1);
        timeline.innerHTML = rows.length
            ? rows.map(row => {
                const segments = Object.entries(row.commodities || {}).map(([commodity, volume]) => {
                    const width = Math.max(Number(volume) / maxVolume * 100, 2);
                    return `<span class="da-timeline-segment" style="width:${width}%;background:${colors[commodity] || colors.Other}" title="${escapeDaHtml(commodity)}: ${Number(volume).toLocaleString()} kg">${Number(volume).toLocaleString()} kg</span>`;
                }).join("");
                return `<div class="da-timeline-row"><span class="da-timeline-label">${escapeDaHtml(row.week)}</span><div class="da-timeline-track">${segments}</div></div>`;
            }).join("") + `<div class="da-timeline-legend"><span>Red Onion</span><span>White Onion</span><span>Tomato</span><span>Squash</span></div>`
            : `<div class="da-supply-row"><strong>No upcoming harvest data</strong></div>`;
    }

    const municipalityList = document.getElementById("daPlantingIntentList");
    if (municipalityList) {
        const municipalities = Array.isArray(data.planting_intents_by_municipality) ? data.planting_intents_by_municipality : [];
        const maxIntents = Math.max(...municipalities.map(item => Number(item.total || 0)), 1);
        municipalityList.innerHTML = municipalities.length
            ? municipalities.slice(0, 6).map(item => `<div class="da-municipality-row"><span>${escapeDaHtml(item.municipality)}</span><div class="da-municipality-bar"><i style="width:${Math.max(Number(item.total || 0) / maxIntents * 100, 4)}%"></i></div><strong>${Number(item.total || 0)}</strong></div>`).join("")
            : `<div class="da-stat-row"><span>No planting intents</span><strong>0</strong></div>`;
    }

    const actions = Array.isArray(data.actions) ? data.actions : [];
    const actionList = document.getElementById("daActionsList");
    if (actionList) {
        actionList.innerHTML = actions.length
            ? actions.slice(0, 4).map(item => {
                const reviewTarget = item.type === "supply_risk" ? "map" : "reports";
                const description = item.description ? `<p>${escapeDaHtml(item.description)}</p>` : "";
                return `<div class="da-priority-item"><div><span class="da-panel-tag">${escapeDaHtml(item.type || "Action")}</span><strong>${escapeDaHtml(item.label || item.name || "Action")}</strong>${description}</div><footer><span>${escapeDaHtml(item.location || "Regional operations")}</span><button class="da-priority-action" data-review-target="${reviewTarget}" type="button">Review →</button></footer></div>`;
            }).join("")
            : `<div class="da-action-item"><span class="da-action-name">No action items at the moment.</span><span class="da-action-count">0</span></div>`;
    }
    const actionCount = document.getElementById("daActionCount");
    if (actionCount) actionCount.textContent = String(actions.length || 0);

    const etl = document.getElementById("daEtlList");
    if (etl) {
        etl.innerHTML = (data.etl || []).length
            ? data.etl.slice(0, 4).map(item => `<div class="da-stat-row"><span>${escapeDaHtml(item.data_source || "ETL source")}</span><strong>${escapeDaHtml(item.status || "Unknown")}</strong></div>`).join("")
            : `<div class="da-stat-row"><span>No ETL runs recorded</span><strong>—</strong></div>`;
    }
    const etlReliability = document.getElementById("daEtlReliability");
    if (etlReliability) {
        const reliability = data.etl_reliability || {};
        const rate = reliability.success_rate_pct;
        etlReliability.innerHTML = `<div class="da-etl-reliability-head"><span>Success rate · last ${Number(reliability.runs || 0)} runs</span><strong>${rate == null ? "—" : `${rate}%`}</strong></div><div class="da-etl-reliability-track"><i style="width:${Math.min(Math.max(Number(rate || 0), 0), 100)}%"></i></div>`;
    }
}

async function loadDaDashboard() {
    try {
        daDashboardData = await fetchJsonWithTimeout(
            DA_RFO_DASHBOARD_ENDPOINT,
            { method: "GET", headers: getAuthHeaders(false) },
            15000
        );
        renderDaDashboard(daDashboardData);
    } catch (error) {
        console.error("Load DA-RFO dashboard error:", error);
        const body = document.getElementById("daSupplyRiskBody");
        if (body) body.innerHTML = `<tr><td colspan="5">Unable to load regional dashboard.</td></tr>`;
    }
}


/* ============================================================
   LOAD USER INFORMATION
============================================================ */

function loadUserInformation() {
    const userName =
        localStorage.getItem("user_display_name") ||
        localStorage.getItem("username") ||
        localStorage.getItem("name") ||
        localStorage.getItem("full_name");

    const role = localStorage.getItem("role");
    const storedAvatar = localStorage.getItem("user_avatar_src");

    const userDisplayName = document.getElementById("userDisplayName");
    const userDisplayRole = document.getElementById("userDisplayRole");
    const userInitials    = document.getElementById("userDisplayInitials");

    if (userName && userDisplayName) userDisplayName.textContent = userName;

    if (role && userDisplayRole) {
        const roleMap = {
            admin: "System Administrator",
            darfo: "DA-RFO Officer",
            aew: "Agricultural Extension Worker",
            farmer: "Farmer",
            coop: "Cooperative",
            lgu: "LGU"
        };
        userDisplayRole.textContent = roleMap[role] || role;
    }

    if (userInitials) {
        if (storedAvatar) {
            userInitials.innerHTML = `<img src="${storedAvatar}" alt="Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover; display:block;">`;
            userInitials.style.background = "transparent";
        } else {
            userInitials.textContent = getInitials(userName || role || "");
        }
    }
}

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


/* ============================================================
   SIDEBAR
============================================================ */

function initSidebar() {
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const sidebar = document.getElementById("sidebar");
    if (!hamburgerBtn || !sidebar) return;

    let hoverTimer = null;

    hamburgerBtn.addEventListener("mouseenter", function () {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
        setTimeout(function () {
            sidebar.classList.add("open");
            setTimeout(function () { if (mapInstance) mapInstance.invalidateSize(); }, 300);
        }, 100);
    });

    sidebar.addEventListener("mouseleave", function () {
        hoverTimer = setTimeout(function () { sidebar.classList.remove("open"); }, 200);
    });

    sidebar.addEventListener("mouseenter", function () {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    });

    document.addEventListener("click", function (event) {
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnHamburger = hamburgerBtn.contains(event.target);
        if (!isClickInsideSidebar && !isClickOnHamburger) sidebar.classList.remove("open");
    });

    sidebar.querySelectorAll(".nav-item").forEach(function (item) {
        item.addEventListener("click", function () { sidebar.classList.remove("open"); });
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") sidebar.classList.remove("open");
    });
}


/* ============================================================
   VIEW NAVIGATION
============================================================ */

function initViewNavigation() {
    const navButtons = document.querySelectorAll(".nav-item[data-view]");
    const views = document.querySelectorAll(".view");

    navButtons.forEach(button => {
        button.addEventListener("click", () => {
            const targetViewKey = button.dataset.view;

            views.forEach(view => view.classList.remove("active-view"));
            const targetView = document.getElementById("view-" + targetViewKey);
            if (targetView) targetView.classList.add("active-view");

            navButtons.forEach(navButton => {
                navButton.classList.toggle("active", navButton === button);
            });

            if (targetViewKey === "map" && mapInstance) setTimeout(() => mapInstance.invalidateSize(), 100);
            if (targetViewKey === "dashboard") loadDaDashboard();
            if (targetViewKey === "buyer-registry") loadBuyerRegistry();
            if (targetViewKey === "reports") loadReports();
            if (targetViewKey === "summary") loadRegionalSummary();
            if (targetViewKey === "etl") loadETLRunLogs();
        });
    });
}


/* ============================================================
   SIGN OUT
============================================================ */

function initSignout() {
    const signoutBtn = document.getElementById("signoutBtn");
    if (!signoutBtn) return;
    signoutBtn.addEventListener("click", () => {
        localStorage.clear();
        window.location.href = "../index.html";
    });
}


/* ============================================================
   LEAFLET MAP
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

    mapInstance = L.map("map", {
        maxBounds: pampangaBounds,
        maxBoundsViscosity: 1.0,
        minZoom: 10
    }).setView([15.0794, 120.6200], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18
    }).addTo(mapInstance);

    loadMunicipalityMapData();
}

async function loadMunicipalityMapData() {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/planting-intents/municipality-map`,
            { method: "GET", headers: getAuthHeaders(false) }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        console.log("DA-RFO Municipality Map Data:", result);

        if (!result.data || !Array.isArray(result.data)) {
            console.warn("No municipality map data found.");
            return;
        }

        MUNICIPALITY_MAP_RAW_DATA = result.data;
        renderFilteredMapMarkers();

        document.getElementById('filterCommodity')?.addEventListener('change', renderFilteredMapMarkers);
        document.getElementById('filterStatus')?.addEventListener('change', renderFilteredMapMarkers);
    } catch (error) {
        console.error("Failed to load DA-RFO municipality map data:", error);
    }
}

function renderFilteredMapMarkers() {
    if (!mapInstance) return;

    if (mapMarkersLayer) mapInstance.removeLayer(mapMarkersLayer);

    mapMarkersLayer = L.layerGroup().addTo(mapInstance);
    const markerIndex = {};

    const selectedCommodity = document.getElementById('filterCommodity')?.value || 'all';
    const selectedStatus = document.getElementById('filterStatus')?.value || window.mapPanelStatusFilter || 'all';

    MUNICIPALITY_MAP_RAW_DATA.forEach(municipalityData => {
        const municipality = municipalityData.municipality;
        const baseCoordinates = municipalityCoordinates[municipality];
        if (!baseCoordinates || !municipalityData.commodities) return;

        const filteredCommodities = municipalityData.commodities.filter(item => {
            const commodityMatch = selectedCommodity === 'all' || (item.commodity || "").toLowerCase() === selectedCommodity.toLowerCase();
            const statusVal = (item.status || "").toUpperCase();
            let statusMatch = true;
            if (selectedStatus !== 'all') {
                statusMatch = window.mapStatusMatches?.(statusVal, selectedStatus) ?? statusVal.includes(selectedStatus);
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

            let markerColor = "#6c757d";
            if (status.includes("SURPLUS") || status.includes("OVERSUPPLY")) markerColor = "#C0392B";
            else if (status.includes("BALANCE")) markerColor = "#2E7D32";
            else if (status.includes("DEFICIT")) markerColor = "#D97706";

            const customIcon = L.divIcon({
                className: 'custom-map-marker',
                html: `<div style="background-color: ${markerColor}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            const popupContent = `
                <div style="min-width:180px;">
                    <strong>Municipality:</strong> ${escapeHtml(municipality)}<br><br>
                    <strong>Commodity:</strong> ${escapeHtml(commodity)}<br>
                    <strong>Status:</strong> <span style="font-weight:700; color:${markerColor};">${escapeHtml(status || 'NO DATA')}</span>
                </div>
            `;

            const marker = L.marker(markerCoordinates, { icon: customIcon }).addTo(mapMarkersLayer).bindPopup(popupContent);
            if (!markerIndex[municipality]) markerIndex[municipality] = [];
            markerIndex[municipality].push({ marker, item });
        });
    });

    window.renderMunicipalityMapPanel?.({
        data: MUNICIPALITY_MAP_RAW_DATA,
        markers: markerIndex,
        map: mapInstance,
    });
}


/* ============================================================
   BUYER REGISTRY (with pagination — 7 per page)
============================================================ */

function initBuyerRegistry() {
    loadBuyerRegistry();

    document.getElementById("returnBuyerListBtn")?.addEventListener("click", showBuyerList);

    document.getElementById("viewBuyerAttachmentBtn")?.addEventListener("click", async () => {
        if (!currentSelectedBuyer) { showError("No buyer application selected."); return; }
        await viewBuyerAttachment(currentSelectedBuyer);
    });

    document.getElementById("approveBuyerBtn")?.addEventListener("click", () => {
        if (!currentSelectedBuyer) {
            showSuccessModal({ title: "Error", message: "No buyer application selected.", icon: "⚠", iconBg: "#FEE2E2", titleColor: "#C0392B" });
            return;
        }
        document.getElementById("confirmApproveModal")?.classList.add("show");
    });

    document.getElementById("rejectBuyerBtn")?.addEventListener("click", () => {
        if (!currentSelectedBuyer) {
            showSuccessModal({ title: "Error", message: "No buyer application selected.", icon: "⚠", iconBg: "#FEE2E2", titleColor: "#C0392B" });
            return;
        }
        document.getElementById("confirmRejectModal")?.classList.add("show");
    });

    document.getElementById("confirmApproveBtn")?.addEventListener("click", approveSelectedBuyer);
    document.getElementById("confirmRejectBtn")?.addEventListener("click", rejectSelectedBuyer);
}

async function viewBuyerAttachment(buyer) {
    if (!buyer) { showError("No buyer application selected."); return; }
    const buyerRegistryId = buyer.buyer_registry_id || buyer.buyerRegistryId || buyer.id;
    if (!buyerRegistryId) { showError("Buyer registry ID is missing."); return; }

    const button = document.getElementById("viewBuyerAttachmentBtn");

    try {
        if (button) { button.disabled = true; button.dataset.originalText = button.textContent; button.textContent = "Opening..."; }
        const endpoint = `${BUYER_ATTACHMENT_ENDPOINT}/${buyerRegistryId}/attachment`;
        const response = await fetch(endpoint, { method: "GET", headers: getAuthHeaders(false) });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = "Unable to load buyer attachment.";
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.detail || errorData.message || errorMessage;
            } catch { if (errorText) errorMessage = errorText; }
            throw new Error(`Status ${response.status}: ${errorMessage}`);
        }

        const contentType = response.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {
            const blob = await response.blob();
            if (!blob.size) throw new Error("The buyer attachment is empty.");
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, "_blank");
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
            return;
        }

        const data = await response.json();
        const attachmentUrl = data.attachment_url || data.file_url || data.document_url || data.url || data.attachment_path || data.file_path || data.document_path;
        if (!attachmentUrl) throw new Error("No attachment was found for this buyer.");

        let finalUrl = attachmentUrl;
        if (!attachmentUrl.startsWith("http://") && !attachmentUrl.startsWith("https://") && !attachmentUrl.startsWith("blob:") && !attachmentUrl.startsWith("data:")) {
            finalUrl = attachmentUrl.startsWith("/") ? `${API_BASE_URL}${attachmentUrl}` : `${API_BASE_URL}/${attachmentUrl}`;
        }
        window.open(finalUrl, "_blank");
    } catch (error) {
        console.error("VIEW BUYER ATTACHMENT ERROR:", error);
        alert(error.message || "Failed to open buyer attachment.");
    } finally {
        if (button) { button.disabled = false; button.textContent = button.dataset.originalText || "View Attachment"; }
    }
}

async function loadBuyerRegistry() {
    await Promise.all([loadPendingBuyers(), loadVerifiedBuyers()]);
}

async function loadPendingBuyers() {
    const tbody = document.getElementById("pendingBuyersBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="4" class="table-msg">Loading pending buyer applications...</td></tr>`;
    removePaginationControls("pendingBuyersPagination");

    try {
        const response = await fetch(PENDING_BUYERS_ENDPOINT, { method: "GET", headers: getAuthHeaders() });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch pending buyers.\nStatus: ${response.status}\n${errorText}`);
        }
        const data = await response.json();
        pendingBuyersCache = Array.isArray(data) ? data : [];
        renderPendingBuyers(pendingBuyersCache);
        updateBuyerSummaryCards();
    } catch (error) {
        console.error("LOAD PENDING BUYERS ERROR:", error);
        tbody.innerHTML = `<tr><td colspan="4" class="table-msg" style="color:#C0392B;"><strong>Unable to load pending buyers.</strong><br><small>Check if FastAPI is running and the endpoint is available.</small></td></tr>`;
        removePaginationControls("pendingBuyersPagination");
    }
}

function renderPendingBuyers(buyers) {
    const tbody = document.getElementById("pendingBuyersBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const totalPages = Math.ceil(buyers.length / ITEMS_PER_PAGE) || 1;
    if (currentPendingPage > totalPages) currentPendingPage = totalPages;
    if (currentPendingPage < 1) currentPendingPage = 1;
    const startIndex = (currentPendingPage - 1) * ITEMS_PER_PAGE;
    const paginatedBuyers = buyers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    if (!paginatedBuyers.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="table-msg">No pending buyer applications.</td></tr>`;
        removePaginationControls("pendingBuyersPagination");
        return;
    }

    paginatedBuyers.forEach(buyer => {
        const row = document.createElement("tr");
        row.className = "clickable-row";
        row.dataset.buyerStatusId = buyer.buyer_status_id ?? "";
        row.dataset.buyerRegistryId = buyer.buyer_registry_id ?? "";

        row.innerHTML = `
            <td style="font-weight:600;">${escapeHtml(buyer.organization || "N/A")}</td>
            <td>${escapeHtml(buyer.contact_person || "N/A")}</td>
            <td>${escapeHtml(buyer.email_address || "N/A")}</td>
            <td class="center-col"><span class="row-action">Review &rarr;</span></td>
        `;

        row.addEventListener("click", () => openBuyerReview(buyer));
        tbody.appendChild(row);
    });

    renderPaginationUI("pendingBuyersBody", currentPendingPage, totalPages, (newPage) => {
        currentPendingPage = newPage;
        renderPendingBuyers(buyers);
    }, "pendingBuyersPagination", { totalItems: buyers.length, pageSize: ITEMS_PER_PAGE, label: "pending buyers" });
}

async function loadVerifiedBuyers() {
    const tbody = document.getElementById("verifiedBuyersBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="4" class="table-msg">Loading verified buyers...</td></tr>`;
    removePaginationControls("verifiedBuyersPagination");

    try {
        const response = await fetch(VERIFIED_BUYERS_ENDPOINT, { method: "GET", headers: getAuthHeaders() });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch verified buyers.\nStatus: ${response.status}\n${errorText}`);
        }
        const data = await response.json();
        verifiedBuyersCache = Array.isArray(data) ? data : [];
        renderVerifiedBuyers(verifiedBuyersCache);
        updateBuyerSummaryCards();
    } catch (error) {
        console.error("LOAD VERIFIED BUYERS ERROR:", error);
        tbody.innerHTML = `<tr><td colspan="4" class="table-msg" style="color:#C0392B;"><strong>Unable to load verified buyers.</strong><br><small>Check if FastAPI is running and the endpoint is available.</small></td></tr>`;
        removePaginationControls("verifiedBuyersPagination");
    }
}

function renderVerifiedBuyers(buyers) {
    const tbody = document.getElementById("verifiedBuyersBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const totalPages = Math.ceil(buyers.length / ITEMS_PER_PAGE) || 1;
    if (currentVerifiedPage > totalPages) currentVerifiedPage = totalPages;
    if (currentVerifiedPage < 1) currentVerifiedPage = 1;
    const startIndex = (currentVerifiedPage - 1) * ITEMS_PER_PAGE;
    const paginatedBuyers = buyers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    if (!paginatedBuyers.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="table-msg">No verified buyers found.</td></tr>`;
        removePaginationControls("verifiedBuyersPagination");
        return;
    }

    paginatedBuyers.forEach(buyer => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td style="font-weight:600;">${escapeHtml(buyer.organization || "N/A")}</td>
            <td>${escapeHtml(buyer.contact_person || "N/A")}</td>
            <td>${escapeHtml(buyer.email_address || "N/A")}</td>
            <td class="center-col"><span class="status-pill approved">Verified</span></td>
        `;
        tbody.appendChild(row);
    });

    renderPaginationUI("verifiedBuyersBody", currentVerifiedPage, totalPages, (newPage) => {
        currentVerifiedPage = newPage;
        renderVerifiedBuyers(buyers);
    }, "verifiedBuyersPagination", { totalItems: buyers.length, pageSize: ITEMS_PER_PAGE, label: "verified buyers" });
}

function updateBuyerSummaryCards() {
    const setCount = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setCount("buyerCountPending", pendingBuyersCache.length);
    setCount("buyerCountVerified", verifiedBuyersCache.length);
}

function openBuyerReview(buyer) {
    currentSelectedBuyer = buyer;

    const buyerRegistryList = document.getElementById("buyerRegistryList");
    const buyerReviewDetails = document.getElementById("buyerReviewDetails");
    const summaryCards = document.getElementById("buyerSummaryCards");
    if (summaryCards) summaryCards.style.display = "none";

    const reviewOrg = document.getElementById("reviewOrg");
    if (reviewOrg) reviewOrg.textContent = buyer.organization || "N/A";
    const reviewContact = document.getElementById("reviewContact");
    if (reviewContact) reviewContact.textContent = buyer.contact_person || "N/A";
    const reviewEmail = document.getElementById("reviewEmail");
    if (reviewEmail) reviewEmail.textContent = buyer.email_address || "N/A";

    renderReviewCommodities(buyer);
    const messageTextarea = document.querySelector("#buyerReviewDetails textarea");
    if (messageTextarea) messageTextarea.value = getBuyerMessage(buyer);

    buyerRegistryList?.classList.add("hidden-element");
    buyerReviewDetails?.classList.remove("hidden-element");
}

function renderReviewCommodities(buyer) {
    const container = document.getElementById("reviewCommodities");
    if (!container) return;
    container.innerHTML = "";

    const commodities = getCommodityArray(buyer);
    if (!commodities.length) {
        const span = document.createElement("span");
        span.className = "pill";
        span.textContent = "Not specified";
        container.appendChild(span);
        return;
    }

    commodities.forEach(commodity => {
        const span = document.createElement("span");
        span.className = "pill";
        span.textContent = commodity;
        container.appendChild(span);
    });
}

function getCommodityArray(buyer) {
    if (!buyer) return [];
    if (Array.isArray(buyer.commodities)) {
        const commodities = buyer.commodities.map(i => String(i).trim()).filter(Boolean);
        if (commodities.length) return commodities;
    }
    if (typeof buyer.commodities === "string" && buyer.commodities.trim()) {
        return buyer.commodities.split(",").map(i => i.trim()).filter(Boolean);
    }
    if (buyer.commodity) return [String(buyer.commodity).trim()];
    const commodityMatch = typeof buyer.message === "string" ? buyer.message.match(/^Commodities of interest:[ \t]*([^\r\n]*)/im) : null;
    return commodityMatch ? commodityMatch[1].split(",").map(commodity => commodity.trim()).filter(Boolean) : [];
}

function getBuyerMessage(buyer) {
    const message = typeof buyer?.message === "string" ? buyer.message : "";
    const cleanMessage = message.replace(/^Commodities of interest:[^\r\n]*(?:\r?\n(?:[ \t]*\r?\n)?|$)/i, "").trim();
    return cleanMessage || "No message provided.";
}

function showBuyerList() {
    const buyerRegistryList = document.getElementById("buyerRegistryList");
    const buyerReviewDetails = document.getElementById("buyerReviewDetails");
    buyerReviewDetails?.classList.add("hidden-element");
    buyerRegistryList?.classList.remove("hidden-element");
    const summaryCards = document.getElementById("buyerSummaryCards");
    if (summaryCards) summaryCards.style.display = "grid";
    currentSelectedBuyer = null;
}

async function approveSelectedBuyer() {
    if (!currentSelectedBuyer) { showError("No buyer application selected."); return; }
    const buyerStatusId = currentSelectedBuyer.buyer_status_id;
    if (!buyerStatusId) { showError("Buyer status ID is missing."); return; }
    const confirmButton = document.getElementById("confirmApproveBtn");

    try {
        setButtonLoading(confirmButton, "Approving...");
        const response = await fetch(`${BUYER_STATUS_ENDPOINT}/${buyerStatusId}/verify`, { method: "PUT", headers: getAuthHeaders() });
        const data = await parseResponse(response);
        if (!response.ok) throw new Error(data.detail || data.message || "Unable to approve buyer.");

        closeModal("confirmApproveModal");
        showSuccessModal({ title: "Buyer Verified", message: "The buyer has been successfully added to the verified buyers list.", icon: "✓", iconBg: "#D1FAE5", titleColor: "#2E7D32" });

        currentSelectedBuyer = null;
        showBuyerList();
        await loadBuyerRegistry();
    } catch (error) {
        console.error("APPROVE BUYER ERROR:", error);
        alert(error.message || "Failed to approve buyer.");
    } finally {
        resetButton(confirmButton, "Yes, Approve");
    }
}

async function rejectSelectedBuyer() {
    if (!currentSelectedBuyer) { showError("No buyer application selected."); return; }
    const buyerStatusId = currentSelectedBuyer.buyer_status_id;
    if (!buyerStatusId) { showError("Buyer status ID is missing."); return; }
    const confirmButton = document.getElementById("confirmRejectBtn");

    try {
        setButtonLoading(confirmButton, "Rejecting...");
        const response = await fetch(`${BUYER_STATUS_ENDPOINT}/${buyerStatusId}/reject`, { method: "PUT", headers: getAuthHeaders() });
        const data = await parseResponse(response);
        if (!response.ok) throw new Error(data.detail || data.message || "Unable to reject buyer.");

        closeModal("confirmRejectModal");
        showSuccessModal({ title: "Buyer Rejected", message: "The buyer application has been rejected.", icon: "⚠", iconBg: "#FEF3C7", titleColor: "#D97706" });

        currentSelectedBuyer = null;
        showBuyerList();
        await loadBuyerRegistry();
    } catch (error) {
        console.error("REJECT BUYER ERROR:", error);
        alert(error.message || "Failed to reject buyer.");
    } finally {
        resetButton(confirmButton, "Yes, Reject");
    }
}


/* ============================================================
   GENERIC HELPERS
============================================================ */

async function parseResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { detail: text }; }
}

function setButtonLoading(button, text) {
    if (!button) return;
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = text;
}

function resetButton(button, defaultText) {
    if (!button) return;
    button.disabled = false;
    button.textContent = defaultText;
}

function closeModal(modalId) { document.getElementById(modalId)?.classList.remove("show"); }
function showError(message) { console.error(message); alert(message); }

function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatDate(dateString) {
    if (!dateString) return "—";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateLong(dateString) {
    if (!dateString) return "—";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatDateTimeLong(dateString) {
    if (!dateString) return "—";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatKg(value) { return `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} kg`; }
function formatRole(role) { if (!role) return "—"; return String(role).replace(/_/g, " ").toUpperCase(); }

function statusLabelAndClass(status) {
    const s = String(status || "").toUpperCase();
    if (s === "SUBMITTED_REGIONAL_PENDING" || s === "FOR_DA_RFO_VALIDATION") return { text: "Regional Pending", cls: "rfo" };
    if (s === "SUBMITTED_REGIONAL_FLAGGED") return { text: "Regional Flagged", cls: "flagged" };
    if (s === "SUBMITTED_REGIONAL_APPROVED" || s === "FINAL_APPROVED") return { text: "Approved", cls: "approved" };
    if (s === "SUBMITTED_PROVINCIAL_PENDING" || s === "FOR_PROVINCIAL_VALIDATION") return { text: "Provincial Pending", cls: "provincial" };
    if (s === "SUBMITTED_PROVINCIAL_FLAGGED") return { text: "Provincial Flagged", cls: "flagged" };
    if (s === "SUBMITTED_MUNICIPAL_PENDING") return { text: "Municipal Pending", cls: "pending" };
    if (s === "SUBMITTED_MUNICIPAL_FLAGGED" || s === "REVISION_REQUIRED") return { text: "Revision Required", cls: "revision" };
    if (s === "DRAFT") return { text: "Draft", cls: "draft" };
    return { text: s || "—", cls: "pending" };
}

function getActionStyle(action) {
    const a = String(action || "").toUpperCase();
    if (a === "SUBMITTED") return { icon: "📤", label: "Submitted", color: "#2980B9" };
    if (a === "RESUBMITTED") return { icon: "🔄", label: "Resubmitted", color: "#2980B9" };
    if (a === "APPROVED") return { icon: "✓", label: "Approved", color: "#2E7D32" };
    if (a === "REVISION_REQUIRED") return { icon: "⚠", label: "Revision Required", color: "#C0392B" };
    if (a === "PULLED") return { icon: "↩", label: "Pulled to Draft", color: "#D97706" };
    if (a === "STATUS_CHANGED") return { icon: "•", label: "Status Changed", color: "#6c757d" };
    return { icon: "•", label: a || "Action", color: "#6c757d" };
}


/* ============================================================
   ALERT THRESHOLD
============================================================ */

function initAlertThreshold() {
    const thresholdRange = document.getElementById("thresholdRange");
    const thresholdValue = document.getElementById("thresholdValue");
    const chips = document.querySelectorAll(".threshold-chip");
    const saveBtn = document.getElementById("saveConfigBtn");

    function updateThreshold(value) {
        if (thresholdRange) thresholdRange.value = value;
        if (thresholdValue) thresholdValue.textContent = `${value}%`;
        chips.forEach(chip => { chip.classList.toggle("active", chip.dataset.val === String(value)); });
    }

    thresholdRange?.addEventListener("input", e => updateThreshold(e.target.value));
    chips.forEach(chip => chip.addEventListener("click", () => updateThreshold(chip.dataset.val)));

    saveBtn?.addEventListener("click", async () => {
        const commodity = document.getElementById("commoditySelect")?.value;
        const baseDemand = document.getElementById("baseDemandInput")?.value;
        const oversupplyThreshold = thresholdRange?.value;

        if (!commodity) { alert("Please select a commodity."); return; }
        if (!baseDemand || Number(baseDemand) <= 0) { alert("Please enter a valid target demand."); return; }

        const payload = { commodity, base_demand: Number(baseDemand), oversupply_threshold: Number(oversupplyThreshold) };

        try {
            const response = await fetch(`${API_BASE_URL}/api/alert-thresholds`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (!response.ok) { alert(data.detail || "Failed to save threshold configuration."); return; }
            alert("Threshold configuration saved successfully!");
        } catch (error) {
            console.error("Error saving threshold:", error);
            alert("Unable to connect to the server.");
        }
    });
}


/* ============================================================
   ALERTS SECTION (with pagination — 4 per page)
============================================================ */

function initAlertsSection() {
    const searchAlerts = document.getElementById("searchAlerts");
    searchAlerts?.addEventListener("input", () => {
        alertSearchTerm = searchAlerts.value.toLowerCase().trim();
        currentAlertsPage = 1;
        renderSystemAlertLogs();
    });
    loadSystemAlertLogs();
}

async function loadSystemAlertLogs() {
    const alertList = document.getElementById("alertList");
    if (!alertList) return;

    alertList.innerHTML = `<div style="text-align:center; padding:30px;">Loading system alerts...</div>`;
    removePaginationControls("alertListPagination");

    try {
        const response = await fetch(`${API_BASE_URL}/api/planting-intents/municipality-map`, { method: "GET", headers: getAuthHeaders(false) });
        if (!response.ok) throw new Error(`Failed to load municipality map data: ${response.status}`);
        const result = await response.json();

        if (!result.data || !Array.isArray(result.data)) {
            systemAlertsCache = [];
            alertList.innerHTML = `<div style="text-align:center; padding:30px;">No system alerts found.</div>`;
            return;
        }

        systemAlertsCache = result.data.flatMap(municipalityData => {
            const municipality = municipalityData.municipality;
            if (!municipality || !Array.isArray(municipalityData.commodities)) return [];
            return municipalityData.commodities.flatMap(item => {
                const status = String(item.status || "").toUpperCase();
                if (!item.commodity || !["OVERSUPPLY", "SURPLUS", "DEFICIT"].includes(status)) return [];
                const baseDemand = Number(item.base_demand || 0);
                const projectedSupply = Number(item.total_supply || 0);
                return [{
                    commodity: item.commodity,
                    municipality,
                    base_demand: baseDemand,
                    projected_supply: projectedSupply,
                    excess_supply: Math.max(projectedSupply - baseDemand, 0),
                    supply_percentage: baseDemand > 0 ? (projectedSupply / baseDemand) * 100 : 0,
                    status,
                    date: new Date()
                }];
            });
        });
        currentAlertsPage = 1;
        renderSystemAlertLogs();
    } catch (error) {
        console.error("LOAD SYSTEM ALERT LOGS ERROR:", error);
        alertList.innerHTML = `<div style="text-align:center; padding:30px; color:#C0392B;">Unable to load system alerts.</div>`;
        removePaginationControls("alertListPagination");
    }
}

function getAlertSeverity(alertItem) {
    const pct = Number(alertItem.supply_percentage) || 0;
    if (alertItem.status === "DEFICIT") {
        if (pct < 50) return { label: "High", cls: "high" };
        if (pct < 80) return { label: "Medium", cls: "medium" };
        return { label: "Low", cls: "low" };
    }
    if (pct >= 150) return { label: "High", cls: "high" };
    if (pct >= 120) return { label: "Medium", cls: "medium" };
    return { label: "Low", cls: "low" };
}

function renderSystemAlertLogs() {
    const alertList = document.getElementById("alertList");
    if (!alertList) return;
    alertList.innerHTML = "";

    const alerts = systemAlertsCache.filter(a => {
        if (!alertSearchTerm) return true;
        const haystack = `${a.commodity} ${a.municipality} ${a.status}`.toLowerCase();
        return haystack.includes(alertSearchTerm);
    });

    const totalPages = Math.ceil(alerts.length / ALERTS_PER_PAGE) || 1;
    if (currentAlertsPage > totalPages) currentAlertsPage = totalPages;
    if (currentAlertsPage < 1) currentAlertsPage = 1;
    const startIndex = (currentAlertsPage - 1) * ALERTS_PER_PAGE;
    const paginatedAlerts = alerts.slice(startIndex, startIndex + ALERTS_PER_PAGE);

    if (!paginatedAlerts.length) {
        alertList.innerHTML = `<div style="text-align:center; padding:30px;">${alertSearchTerm ? "No alerts match your search." : "No active alerts."}</div>`;
        removePaginationControls("alertListPagination");
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "alert-table-wrap";
    wrapper.innerHTML = `
        <table class="alert-table">
            <thead>
                <tr>
                    <th>Alert Type</th>
                    <th>Commodity</th>
                    <th>Severity Level</th>
                    <th>Region</th>
                    <th>Date Generated</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `;
    const tbody = wrapper.querySelector("tbody");

    paginatedAlerts.forEach(alertItem => {
        const sev = getAlertSeverity(alertItem);
        const row = document.createElement("tr");
        row.className = "clickable-row";
        row.tabIndex = 0;
        row.innerHTML = `
            <td>${escapeHtml(getAlertTypeLabel(alertItem))}</td>
            <td>${escapeHtml(alertItem.commodity)}</td>
            <td><span class="sev-pill ${sev.cls}">${escapeHtml(sev.label)}</span></td>
            <td>${escapeHtml(alertItem.municipality)}</td>
            <td>${escapeHtml(formatDateLong(alertItem.date))}</td>
            <td>Active</td>
        `;
        const open = () => {
            if (currentActiveAlertCard) currentActiveAlertCard.classList.remove("active");
            row.classList.add("active");
            currentActiveAlertCard = row;
            openAlertDetailModal(alertItem);
        };
        row.addEventListener("click", open);
        row.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
        });
        tbody.appendChild(row);
    });

    alertList.appendChild(wrapper);
    renderPaginationUI("alertList", currentAlertsPage, totalPages, (newPage) => {
        currentAlertsPage = newPage;
        renderSystemAlertLogs();
    }, "alertListPagination", { totalItems: alerts.length, pageSize: ALERTS_PER_PAGE, label: "alerts" });
}

function getAlertTypeLabel(alertItem) {
    return alertItem.status === "DEFICIT" ? "Deficit" : alertItem.status === "SURPLUS" ? "Surplus" : "Oversupply";
}

function openAlertDetailModal(alertItem) {
    const isDeficit = alertItem.status === "DEFICIT";
    const sev = getAlertSeverity(alertItem);
    const gap = isDeficit ? Math.max(alertItem.base_demand - alertItem.projected_supply, 0) : Math.abs(alertItem.excess_supply);
    const pct = alertItem.supply_percentage.toFixed(1);

    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

    setText("modalAlertTitle", `${alertItem.commodity} ${getAlertTypeLabel(alertItem)} — ${alertItem.municipality}`);
    setText("modalAlertDesc", isDeficit
        ? `Projected supply of ${alertItem.commodity} in ${alertItem.municipality} is only ${pct}% of the base demand.`
        : `Projected supply of ${alertItem.commodity} in ${alertItem.municipality} is ${pct}% of the base demand.`);

    const modalSeverity = document.getElementById("modalAlertSev");
    if (modalSeverity) { modalSeverity.textContent = sev.label; modalSeverity.className = `sev-pill ${sev.cls}`; }

    setText("modalAlertSupply", formatKg(alertItem.projected_supply));
    setText("modalAlertDemand", formatKg(alertItem.base_demand));

    const thirdStatContainer = document.querySelector("#alertDetailModal .modal-stats-grid div:nth-child(3)");
    if (thirdStatContainer) {
        thirdStatContainer.innerHTML = `${isDeficit ? "Deficit:" : "Surplus:"} <b id="modalAlertSurplus" style="color: var(--ink); display: block; font-size: 14px; margin-top: 2px;"></b>`;
    }
    setText("modalAlertSurplus", formatKg(gap));
    setText("modalAlertDate", formatDateTimeLong(alertItem.date));

    document.getElementById("alertDetailModal")?.classList.add("show");
}


/* ============================================================
   MODAL LISTENERS
============================================================ */

function initModalListeners() {
    document.querySelectorAll(".modal-overlay").forEach(modal => {
        modal.addEventListener("click", event => { if (event.target === modal) modal.classList.remove("show"); });
    });
    document.querySelectorAll(".modal-cancel-btn").forEach(button => {
        button.addEventListener("click", () => { button.closest(".modal-overlay")?.classList.remove("show"); });
    });
    document.getElementById("closeReportSubmittedBtn")?.addEventListener("click", function() {
        this.closest(".modal-overlay")?.classList.remove("show");
    });
}


/* ============================================================
   REPORTS SECTION
============================================================ */

function initReportsSection() {
    initReportSearch();
    initBulkActions();
    initReportDetailButtons();
    initReportSummaryToggle();
}

function initReportSummaryToggle() {
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
}

async function loadReports() {
    await Promise.allSettled([loadPendingReports(), loadReturnedToProvincial(), loadApprovedReports()]);
}

async function loadPendingReports() {
    const tbody = document.getElementById("pendingReportsBody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" style="padding:30px; text-align:center; color:#999;">Loading reports...</td></tr>`;

    try {
        const data = await fetchJsonWithTimeout(DA_PENDING_ENDPOINT, { method: "GET", headers: getAuthHeaders(false) }, 10000);
        pendingReports = Array.isArray(data) ? data : [];
        selectedReportIds = new Set();
        renderPendingReports();
        updateBulkApproveButton();
    } catch (err) {
        console.error("Load pending error:", err);
        tbody.innerHTML = `<tr><td colspan="8" style="padding:30px; text-align:center; color:#C0392B;">Failed to load pending reports.<br><small>${escapeHtml(err.message || "Unable to load reports.")}</small></td></tr>`;
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
        return s === "SUBMITTED_REGIONAL_PENDING" || s === "FOR_DA_RFO_VALIDATION";
    });

    const badge = document.getElementById("pendingCountBadge");
    if (badge) badge.textContent = reports.length;

    tbody.innerHTML = "";

    if (reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding:30px; text-align:center; color:#999;">No reports awaiting DA-RFO validation.</td></tr>`;
        removePaginationControls("pendingReportsPagination");
        return;
    }

    // --- PAGINATION (3 items per page) ---
    const totalPages = Math.ceil(reports.length / REPORTS_PAGE_SIZE) || 1;
    if (currentPendingReportsPage > totalPages) currentPendingReportsPage = totalPages;
    if (currentPendingReportsPage < 1) currentPendingReportsPage = 1;
    const startIndex = (currentPendingReportsPage - 1) * REPORTS_PAGE_SIZE;
    const paginatedReports = reports.slice(startIndex, startIndex + REPORTS_PAGE_SIZE);

    paginatedReports.forEach(report => {
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
            <td class="center-col"><span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span></td>
        `;

        tr.addEventListener("click", (e) => { if (e.target.closest("input[type=checkbox]")) return; openReportDetail(report); });
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".row-check").forEach(cb => {
        cb.addEventListener("change", (e) => {
            const id = Number(e.target.dataset.reportId);
            const row = e.target.closest("tr");
            if (e.target.checked) { selectedReportIds.add(id); if (row) row.classList.add("selected"); }
            else { selectedReportIds.delete(id); if (row) row.classList.remove("selected"); }
            updateSelectAllCheckbox();
            updateBulkApproveButton();
        });
    });

    updateSelectAllCheckbox();

    renderPaginationUI("pendingReportsBody", currentPendingReportsPage, totalPages, (newPage) => {
        currentPendingReportsPage = newPage;
        renderPendingReports();
    }, "pendingReportsPagination", { totalItems: reports.length, pageSize: REPORTS_PAGE_SIZE, label: "pending reports" });
}

async function loadReturnedToProvincial() {
    const tbody = document.getElementById("returnedToProvincialBody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">Loading reports...</td></tr>`;

    try {
        const data = await fetchJsonWithTimeout(RETURNED_TO_PROVINCIAL_ENDPOINT, { method: "GET", headers: getAuthHeaders(false) }, 10000);
        returnedToProvincialReports = Array.isArray(data) ? data : [];
        renderReturnedToProvincial();
    } catch (err) {
        console.error("Load returned error:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#C0392B;">Failed to load reports.</td></tr>`;
        const badge = document.getElementById("returnedToProvincialCountBadge");
        if (badge) badge.textContent = "0";
        returnedToProvincialReports = [];
    }
}

function renderReturnedToProvincial() {
    const tbody = document.getElementById("returnedToProvincialBody");
    if (!tbody) return;

    const badge = document.getElementById("returnedToProvincialCountBadge");
    if (badge) badge.textContent = returnedToProvincialReports.length;
    tbody.innerHTML = "";

    if (returnedToProvincialReports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">No reports returned to Provincial.</td></tr>`;
        removePaginationControls("returnedReportsPagination");
        return;
    }

    // --- PAGINATION (3 items per page) ---
    const totalPages = Math.ceil(returnedToProvincialReports.length / REPORTS_PAGE_SIZE) || 1;
    if (currentReturnedReportsPage > totalPages) currentReturnedReportsPage = totalPages;
    if (currentReturnedReportsPage < 1) currentReturnedReportsPage = 1;
    const startIndex = (currentReturnedReportsPage - 1) * REPORTS_PAGE_SIZE;
    const paginatedReports = returnedToProvincialReports.slice(startIndex, startIndex + REPORTS_PAGE_SIZE);

    paginatedReports.forEach(report => {
        const sl = statusLabelAndClass(report.status);
        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.dataset.reportId = report.report_id;
        tr.innerHTML = `
            <td class="center-col" style="font-weight: 600;">#${escapeHtml(report.report_id)}</td>
            <td>${escapeHtml(report.title || "—")}</td>
            <td>${escapeHtml(report.commodity || "—")}</td>
            <td>${escapeHtml(report.municipality || "—")}</td>
            <td class="center-col">${formatDate(report.flagged_at || report.submitted_at)}</td>
            <td class="center-col"><span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span></td>
        `;
        tr.addEventListener("click", () => openReportDetail(report));
        tbody.appendChild(tr);
    });

    renderPaginationUI("returnedToProvincialBody", currentReturnedReportsPage, totalPages, (newPage) => {
        currentReturnedReportsPage = newPage;
        renderReturnedToProvincial();
    }, "returnedReportsPagination", { totalItems: returnedToProvincialReports.length, pageSize: REPORTS_PAGE_SIZE, label: "returned reports" });
}

async function loadApprovedReports() {
    const tbody = document.getElementById("approvedReportsBody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">Loading reports...</td></tr>`;

    try {
        const data = await fetchJsonWithTimeout(APPROVED_BY_REGIONAL_ENDPOINT, { method: "GET", headers: getAuthHeaders(false) }, 10000);
        approvedReports = Array.isArray(data) ? data : [];
        renderApprovedReports();
    } catch (err) {
        console.error("Load approved error:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#C0392B;">Failed to load reports.</td></tr>`;
        const badge = document.getElementById("approvedCountBadge");
        if (badge) badge.textContent = "0";
        approvedReports = [];
    }
}

function renderApprovedReports() {
    const tbody = document.getElementById("approvedReportsBody");
    if (!tbody) return;
    const badge = document.getElementById("approvedCountBadge");
    if (badge) badge.textContent = approvedReports.length;
    tbody.innerHTML = "";

    if (approvedReports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">No approved reports yet.</td></tr>`;
        removePaginationControls("approvedReportsPagination");
        return;
    }

    // --- PAGINATION (3 items per page) ---
    const totalPages = Math.ceil(approvedReports.length / REPORTS_PAGE_SIZE) || 1;
    if (currentApprovedReportsPage > totalPages) currentApprovedReportsPage = totalPages;
    if (currentApprovedReportsPage < 1) currentApprovedReportsPage = 1;
    const startIndex = (currentApprovedReportsPage - 1) * REPORTS_PAGE_SIZE;
    const paginatedReports = approvedReports.slice(startIndex, startIndex + REPORTS_PAGE_SIZE);

    paginatedReports.forEach(report => {
        const sl = statusLabelAndClass(report.status);
        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.dataset.reportId = report.report_id;
        tr.innerHTML = `
            <td class="center-col" style="font-weight: 600;">#${escapeHtml(report.report_id)}</td>
            <td>${escapeHtml(report.title || "—")}</td>
            <td>${escapeHtml(report.commodity || "—")}</td>
            <td>${escapeHtml(report.municipality || "—")}</td>
            <td class="center-col">${formatDate(report.approved_at || report.submitted_at)}</td>
            <td class="center-col"><span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span></td>
        `;
        tr.addEventListener("click", () => openReportDetail(report));
        tbody.appendChild(tr);
    });

    renderPaginationUI("approvedReportsBody", currentApprovedReportsPage, totalPages, (newPage) => {
        currentApprovedReportsPage = newPage;
        renderApprovedReports();
    }, "approvedReportsPagination", { totalItems: approvedReports.length, pageSize: REPORTS_PAGE_SIZE, label: "approved reports" });
}

function initReportSearch() {
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

function updateSelectAllCheckbox() {
    const cb = document.getElementById("selectAllCheckbox");
    if (!cb) return;
    const visibleCheckboxes = document.querySelectorAll("#pendingReportsBody tr:not([style*='display: none']) .row-check");
    const totalVisible = visibleCheckboxes.length;
    const checkedVisible = Array.from(visibleCheckboxes).filter(c => c.checked).length;
    if (totalVisible === 0 || checkedVisible === 0) { cb.checked = false; cb.indeterminate = false; }
    else if (checkedVisible === totalVisible) { cb.checked = true; cb.indeterminate = false; }
    else { cb.checked = false; cb.indeterminate = true; }
}

function updateBulkApproveButton() {
    const btn = document.getElementById("bulkApproveBtn");
    if (!btn) return;
    if (selectedReportIds.size > 0) { btn.disabled = false; btn.textContent = `Approve ${selectedReportIds.size} & Finalize`; }
    else { btn.disabled = true; btn.textContent = "Approve Selected & Finalize"; }
}

function initBulkActions() {
    const selectAllCb = document.getElementById("selectAllCheckbox");
    const selectAllBtn = document.getElementById("selectAllPendingBtn");
    const bulkBtn = document.getElementById("bulkApproveBtn");

    if (selectAllCb) {
        selectAllCb.addEventListener("change", (e) => {
            const checked = e.target.checked;
            const checkboxes = document.querySelectorAll("#pendingReportsBody tr:not([style*='display: none']) .row-check");
            checkboxes.forEach(cb => {
                if (cb.checked !== checked) { cb.checked = checked; cb.dispatchEvent(new Event("change", { bubbles: true })); }
            });
        });
    }

    if (selectAllBtn) {
        selectAllBtn.addEventListener("click", () => {
            const checkboxes = document.querySelectorAll("#pendingReportsBody tr:not([style*='display: none']) .row-check");
            if (checkboxes.length === 0) return;
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            checkboxes.forEach(cb => { cb.checked = !allChecked; cb.dispatchEvent(new Event("change", { bubbles: true })); });
        });
    }

    if (bulkBtn) bulkBtn.addEventListener("click", () => { if (selectedReportIds.size === 0) return; openBulkApproveModal(); });

    const cancelBtn = document.getElementById("bulkApproveCancelBtn");
    const confirmBtn = document.getElementById("bulkApproveConfirmBtn");
    if (cancelBtn) cancelBtn.addEventListener("click", () => { document.getElementById("bulkApproveModal")?.classList.remove("show"); });
    if (confirmBtn) confirmBtn.addEventListener("click", bulkApproveSelected);
}

function openBulkApproveModal() {
    const modal = document.getElementById("bulkApproveModal");
    const text = document.getElementById("bulkApproveText");
    if (!modal || !text) return;
    const n = selectedReportIds.size;
    text.textContent = `Approve ${n} report${n > 1 ? "s" : ""} and finalize? This action will mark the selected report${n > 1 ? "s" : ""} as APPROVED.`;
    modal.classList.add("show");
}

async function bulkApproveSelected() {
    const confirmBtn = document.getElementById("bulkApproveConfirmBtn");
    const cancelBtn = document.getElementById("bulkApproveCancelBtn");
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "Processing..."; }
    if (cancelBtn) cancelBtn.disabled = true;

    try {
        const response = await fetch(BULK_APPROVE_ENDPOINT, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ report_ids: Array.from(selectedReportIds), validator_role: "darfo" })
        });
        const data = await parseResponse(response);
        if (!response.ok) throw new Error(data.detail || "Bulk approve failed.");

        document.getElementById("bulkApproveModal")?.classList.remove("show");

        showSuccessModal({
            title: "Bulk Approval Complete",
            message: `<strong>${data.approved_count || 0}</strong> report${(data.approved_count || 0) !== 1 ? "s" : ""} approved and finalized.`,
            icon: "✓",
            iconBg: "#D1FAE5",
            titleColor: "#2E7D32",
            onClose: async () => { await Promise.allSettled([loadPendingReports(), loadReturnedToProvincial(), loadApprovedReports()]); },
        });

        selectedReportIds.clear();
    } catch (err) {
        console.error("Bulk approve error:", err);
        document.getElementById("bulkApproveModal")?.classList.remove("show");
        showSuccessModal({ title: "Bulk Approval Failed", message: escapeHtml(err.message || "Please try again."), icon: "⚠", iconBg: "#FEE2E2", titleColor: "#C0392B" });
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

    const mainHeader = document.getElementById("reportsMainHeader");
    if (mainHeader) mainHeader.style.display = "none";

    document.getElementById("pendingReportsView")?.style.setProperty("display", "none");
    document.getElementById("returnedToProvincialView")?.style.setProperty("display", "none");
    document.getElementById("approvedReportsView")?.style.setProperty("display", "none");

    const detailView = document.getElementById("individualDetailView");
    if (detailView) { detailView.classList.remove("hidden-element"); detailView.style.display = "block"; }

    const summaryWrapper = document.getElementById("reportSummaryCardWrapper");
    const summaryBody = document.getElementById("reportSummaryBody");
    const historyContainer = document.getElementById("validationTimelineContainer");

    if (summaryWrapper) summaryWrapper.style.display = "none";
    if (summaryBody) summaryBody.innerHTML = "";
    if (historyContainer) historyContainer.innerHTML = `<div style="color: var(--muted); font-style: italic; font-size: 13px;">Loading history...</div>`;

    const titleEl           = document.getElementById("detailReportTitle");
    const subtitleEl        = document.getElementById("detailReportSubtitle");
    const idEl              = document.getElementById("detailReportId");
    const municipalityEl    = document.getElementById("detailReportMunicipality");
    const statusEl          = document.getElementById("detailReportStatus");
    const dateEl            = document.getElementById("detailReportDate");
    const encodedByEl       = document.getElementById("detailReportEncodedBy");
    const yieldEl           = document.getElementById("detailReportYield");
    const notesEl           = document.getElementById("detailReportNotes");
    const attachmentsEl     = document.getElementById("detailReportAttachments");
    const intentsBody       = document.getElementById("detailReportIntentsBody");
    const remarksEl         = document.getElementById("remarksTextarea");
    const flagBtn           = document.getElementById("flagBtn");
    const approveBtn        = document.getElementById("approveBtn");
    const backBtn           = document.getElementById("backToPendingBtn");

    if (titleEl)        titleEl.textContent = report.title || `Report #${report.report_id}`;
    if (subtitleEl)     subtitleEl.textContent = `Report #${report.report_id} • ${report.municipality || ""}`;
    if (idEl)           idEl.textContent = report.report_id ?? "—";
    if (municipalityEl) municipalityEl.textContent = report.municipality || "—";
    if (dateEl)         dateEl.textContent = formatDate(report.submitted_at);
    if (encodedByEl)    encodedByEl.textContent = report.encoded_by_name || "—";
    if (yieldEl)        yieldEl.textContent = report.estimated_yield ?? "—";
    if (notesEl)        notesEl.textContent = report.notes || report.narrative || "—";

    if (remarksEl) {
        remarksEl.value = "";
        remarksEl.readOnly = false;
        remarksEl.disabled = false;
        remarksEl.style.background = "#FFFFFF";
        remarksEl.style.color = "var(--ink)";
        remarksEl.style.cursor = "text";
        remarksEl.style.borderColor = "var(--border)";
        remarksEl.style.borderWidth = "1.5px";
        remarksEl.placeholder = "Type your comment here...";
    }

    const sl = statusLabelAndClass(report.status);
    if (statusEl) statusEl.innerHTML = `<span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>`;

    const statusUpper = String(report.status || "").toUpperCase();
    const isPending = statusUpper === "SUBMITTED_REGIONAL_PENDING" || statusUpper === "FOR_DA_RFO_VALIDATION";

    if (backBtn) { backBtn.style.display = "inline-flex"; backBtn.textContent = "Return"; }
    const remarksRow = remarksEl ? remarksEl.closest(".notes-row") : null;

    if (isPending) {
        if (flagBtn) { flagBtn.style.display = "inline-flex"; flagBtn.textContent = "Return to Provincial for Revision"; flagBtn.disabled = false; flagBtn.classList.remove("active"); }
        if (approveBtn) { approveBtn.style.display = "inline-flex"; approveBtn.textContent = "Approve Report"; approveBtn.disabled = false; approveBtn.classList.remove("active"); }
        if (remarksRow) remarksRow.style.display = "flex";
    } else {
        if (flagBtn) flagBtn.style.display = "none";
        if (approveBtn) approveBtn.style.display = "none";
        if (remarksRow) remarksRow.style.display = "none";
    }

    try {
        const full = await fetchJsonWithTimeout(`${API_BASE_URL}/api/raw-plant-reports/${report.report_id}`, { method: "GET", headers: getAuthHeaders(false) }, 10000);
        console.log("Full report:", full);

        if (dateEl) dateEl.textContent = formatDate(full.submitted_at || full.created_at) || "—";
        if (notesEl) notesEl.textContent = full.notes || full.narrative || full.remarks || "—";
        if (encodedByEl) encodedByEl.textContent = full.encoded_by_name || report.encoded_by_name || "—";
        if (yieldEl) yieldEl.textContent = full.estimated_yield != null ? full.estimated_yield : "—";
        if (titleEl) titleEl.textContent = full.title || `Report #${full.report_id}`;
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
        if (attachmentsEl) { attachmentsEl.textContent = "Unable to load attachments."; attachmentsEl.style.color = "#C0392B"; }
        if (intentsBody) intentsBody.innerHTML = `<tr><td colspan="9" style="padding:20px; text-align:center; color:#C0392B;">Failed to load intents: ${escapeHtml(err.message)}</td></tr>`;
        if (historyContainer) historyContainer.innerHTML = `<div style="color: #C0392B; font-size: 13px;">Failed to load timeline: ${escapeHtml(err.message)}</div>`;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}


/* ============================================================
   RENDER VALIDATION TIMELINE
============================================================ */

function renderValidationTimeline(history) {
    const container = document.getElementById("validationTimelineContainer");
    if (!container) return;

    if (!Array.isArray(history) || history.length === 0) {
        container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--muted); font-size: 13px; font-style: italic; background: #FAF8F5; border: 1px dashed var(--border-light); border-radius: 8px;">No validation history recorded yet.</div>`;
        return;
    }

    const html = history.map((h, idx) => {
        const style = getActionStyle(h.action);
        const isLast = idx === history.length - 1;
        let cleanRemarks = h.remarks || "";
        cleanRemarks = cleanRemarks.replace(/^\[[^\]]+\]\s*/, "").trim();
        const remarksHtml = cleanRemarks ? `<div class="timeline-remarks">${escapeHtml(cleanRemarks)}</div>` : "";
        const dateHtml = h.created_at ? `<span class="timeline-date">${escapeHtml(formatDateTimeLong(h.created_at))}</span>` : "";
        return `
            <div class="timeline-item">
                <div class="timeline-marker" style="background:${style.color};">${style.icon}</div>
                ${!isLast ? '<div class="timeline-line"></div>' : ''}
                <div class="timeline-content">
                    <div class="timeline-header">
                        <span class="timeline-action" style="color:${style.color};">${escapeHtml(style.label)}</span>
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
   RENDER REPORT SUMMARY CARD (frozen snapshot)
============================================================ */

function renderReportSummaryCard(intents, meta) {
    const wrapper = document.getElementById("reportSummaryCardWrapper");
    const body = document.getElementById("reportSummaryBody");
    const coveragePeriodEl = document.getElementById("summaryCoveragePeriod");
    if (!wrapper || !body) return;

    if (!Array.isArray(intents) || intents.length === 0) { wrapper.style.display = "none"; return; }
    wrapper.style.display = "block";

    const selected = intents;
    const selectedCount = selected.length;
    const totalVolume = selected.reduce((sum, i) => sum + (Number(i.volume) || 0), 0);
    const uniqueFarmers = new Set(selected.map(i => i.farmer_id || i.farmer_name).filter(Boolean));
    const uniqueFarmerCount = uniqueFarmers.size;

    const pendingReportIds = new Set();
    intents.forEach(i => {
        const s = String(i.report_status || i.status || "").toUpperCase();
        if (s === "SUBMITTED_REGIONAL_PENDING" || s === "FOR_DA_RFO_VALIDATION") {
            if (i.report_id != null) pendingReportIds.add(i.report_id);
        }
    });
    const pendingCount = pendingReportIds.size;

    const harvestedIntents = selected.filter(i => (i.finalized_status_at_submission || i.finalized_status || "").toUpperCase() === "HARVESTED");
    const harvestedVolume = harvestedIntents.reduce((sum, i) => {
        const actual = Number(i.actual_harvest_volume);
        const planned = Number(i.volume);
        return sum + (actual > 0 ? actual : (planned || 0));
    }, 0);

    const harvestRate = selectedCount > 0 ? Math.round((harvestedIntents.length / selectedCount) * 100) : 0;
    const totalActualHarvest = selected.reduce((sum, i) => {
        const v = Number(i.actual_harvest_volume);
        return sum + (v > 0 ? v : 0);
    }, 0);

    if (coveragePeriodEl) {
        const submittedAt = meta?.submitted_at || meta?.created_at;
        if (submittedAt) {
            const reportDate = new Date(submittedAt);
            if (!isNaN(reportDate.getTime())) {
                const weekStart = new Date(reportDate);
                weekStart.setDate(reportDate.getDate() - 6);
                const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                coveragePeriodEl.textContent = `Coverage: ${fmt(weekStart)} – ${fmt(reportDate)}`;
            } else coveragePeriodEl.textContent = "Coverage: —";
        } else coveragePeriodEl.textContent = "Coverage: —";
    }

    const byCommodity = {};
    selected.forEach(intent => {
        const c = intent.commodity || "Unknown";
        if (!byCommodity[c]) byCommodity[c] = { count: 0, volume: 0 };
        byCommodity[c].count += 1;
        byCommodity[c].volume += Number(intent.volume) || 0;
    });

    const byBarangay = {};
    selected.forEach(intent => {
        let b = intent.barangay;
        if (!b && intent.location) b = String(intent.location).split(",")[0].trim();
        if (!b) b = intent.municipality || "Unknown";
        if (!byBarangay[b]) byBarangay[b] = { count: 0, volume: 0 };
        byBarangay[b].count += 1;
        byBarangay[b].volume += Number(intent.volume) || 0;
    });

    const byStatus = {
        "NOT PLANTED": { count: 0, volume: 0, label: "Not Planted", color: "#6c757d" },
        "PLANTED":     { count: 0, volume: 0, label: "Planted",     color: "#D97706" },
        "HARVESTED":   { count: 0, volume: 0, label: "Harvested",   color: "#2E7D32" },
        "MEDIATING":   { count: 0, volume: 0, label: "Mediating",   color: "#2980B9" },
    };
    selected.forEach(intent => {
        const s = (intent.finalized_status_at_submission || intent.finalized_status || "NOT PLANTED").toUpperCase();
        if (byStatus[s]) { byStatus[s].count += 1; byStatus[s].volume += Number(intent.volume) || 0; }
    });

    const yieldPlanned = totalVolume;
    const yieldActual = totalActualHarvest;
    const hasActualData = yieldActual > 0;
    const variancePct = hasActualData && yieldPlanned > 0 ? Math.round(((yieldActual - yieldPlanned) / yieldPlanned) * 100) : 0;

    const plantingDates = selected.map(i => i.planting_date).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
    const harvestDates = selected.map(i => i.harvest_date).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));

    let html = "";

    html += `
        <div class="summary-kpi-grid">
            <div class="summary-kpi-card"><div class="summary-kpi-label">✓ Selected Intents</div><div class="summary-kpi-value">${selectedCount}</div><div class="summary-kpi-subtext">Included in this report</div></div>
            <div class="summary-kpi-card"><div class="summary-kpi-label">Total Volume</div><div class="summary-kpi-value">${formatKg(totalVolume)}</div><div class="summary-kpi-subtext">Across ${selectedCount} intent${selectedCount !== 1 ? "s" : ""}</div></div>
            <div class="summary-kpi-card"><div class="summary-kpi-label">Unique Farmers</div><div class="summary-kpi-value">${uniqueFarmerCount}</div><div class="summary-kpi-subtext">Beneficiaries in this report</div></div>
        </div>
    `;

    html += `
        <div class="summary-kpi-grid">
            <div class="summary-kpi-card"><div class="summary-kpi-label">Pending Reports</div><div class="summary-kpi-value" style="color:${pendingCount > 0 ? "#D97706" : "#2E7D32"};">${pendingCount}</div><div class="summary-kpi-subtext">${pendingCount === 1 ? "report awaiting your review" : "reports awaiting your review"}</div></div>
            <div class="summary-kpi-card"><div class="summary-kpi-label">Harvested Volume</div><div class="summary-kpi-value" style="color:#2E7D32;">${formatKg(harvestedVolume)}</div><div class="summary-kpi-subtext">${harvestedIntents.length} of ${selectedCount} harvested</div></div>
            <div class="summary-kpi-card"><div class="summary-kpi-label">Harvest Rate</div><div class="summary-kpi-value" style="color:${harvestRate === 100 ? "#2E7D32" : harvestRate > 0 ? "#D97706" : "#6c757d"};">${harvestRate}%</div><div class="summary-kpi-subtext">Completion ratio</div></div>
        </div>
    `;

    html += `<div class="summary-breakdown-grid">`;
    html += `<div><div class="summary-breakdown-title">By Commodity</div><div class="summary-breakdown-body">`;
    const commodityEntries = Object.entries(byCommodity).sort((a, b) => b[1].volume - a[1].volume);
    if (commodityEntries.length === 0) html += `<span style="color: var(--muted); font-style: italic;">No data.</span>`;
    else commodityEntries.forEach(([name, d]) => {
        html += `<div class="summary-breakdown-row"><span style="font-weight: 600;">${escapeHtml(name)}</span><span style="font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums;">${d.count} · <b style="color:var(--green-dark);">${formatKg(d.volume)}</b></span></div>`;
    });
    html += `</div></div>`;

    html += `<div><div class="summary-breakdown-title">📍 By Barangay</div><div class="summary-breakdown-body">`;
    const barangayEntries = Object.entries(byBarangay).sort((a, b) => b[1].volume - a[1].volume);
    if (barangayEntries.length === 0) html += `<span style="color: var(--muted); font-style: italic;">No data.</span>`;
    else if (barangayEntries.length === 1) html += `<div style="color: var(--muted); font-style: italic; font-size: 12px;">All intents from <b>${escapeHtml(barangayEntries[0][0])}</b></div>`;
    else barangayEntries.forEach(([name, d]) => {
        html += `<div class="summary-breakdown-row"><span style="font-weight: 600;">📍 ${escapeHtml(name)}</span><span style="font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums;">${d.count} · <b style="color:var(--green-dark);">${formatKg(d.volume)}</b></span></div>`;
    });
    html += `</div></div>`;

    html += `<div><div class="summary-breakdown-title">📋 By Finalized Status</div><div class="summary-breakdown-body">`;
    Object.values(byStatus).forEach(d => {
        const isZero = d.count === 0;
        html += `<div class="summary-breakdown-row" style="opacity:${isZero ? 0.45 : 1};"><span style="font-weight: 600; color:${isZero ? 'var(--muted)' : 'var(--ink)'};"><span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${d.color}; margin-right: 8px;"></span>${d.label}</span><span style="font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums;">${d.count} · <b style="color:${isZero ? 'var(--muted)' : d.color};">${formatKg(d.volume)}</b></span></div>`;
    });
    html += `</div></div>`;
    html += `</div>`;

    html += `<div class="summary-insight-grid">`;
    html += `<div class="summary-insight-card green"><div style="font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border-light);">Yield Performance</div>`;
    if (hasActualData) {
        let varianceColor = "#2E7D32"; let varianceIcon = "↑"; let varianceLabel = "surplus";
        if (variancePct < 0) { varianceColor = "#C0392B"; varianceIcon = "↓"; varianceLabel = "shortfall"; }
        else if (variancePct === 0) { varianceColor = "#6c757d"; varianceIcon = "→"; varianceLabel = "on target"; }
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: var(--muted);">Expected (planned):</span><b>${yieldPlanned.toLocaleString("en-US")} kg</b></div>`;
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 10px;"><span style="color: var(--muted);">Actual (harvested):</span><b>${yieldActual.toLocaleString("en-US")} kg</b></div>`;
        html += `<div style="display: inline-block; padding: 4px 12px; background: ${varianceColor}15; border-radius: 6px; font-size: 13px; font-weight: 700; color: ${varianceColor};">${varianceIcon} ${Math.abs(variancePct)}% ${varianceLabel}</div>`;
        html += `<div style="margin-top: 8px; font-size: 11px; color: var(--muted); font-style: italic;">Based on ${harvestedIntents.length} of ${selectedCount} harvested</div>`;
    } else html += `<span style="color: var(--muted); font-style: italic;">No actual harvest volume recorded yet.</span>`;
    html += `</div>`;

    html += `<div class="summary-insight-card orange"><div style="font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border-light);">📅 Planting Window</div>`;
    if (plantingDates.length > 0) {
        const earliest = new Date(Math.min.apply(null, plantingDates));
        const latest = new Date(Math.max.apply(null, plantingDates));
        const spanDays = Math.round((latest - earliest) / (1000 * 60 * 60 * 24));
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: var(--muted);">🌱 Earliest:</span><b>${formatDateLong(earliest)}</b></div>`;
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: var(--muted);">Latest:</span><b>${formatDateLong(latest)}</b></div>`;
        html += `<div style="display: flex; justify-content: space-between;"><span style="color: var(--muted);">Span:</span><b>${spanDays} day${spanDays !== 1 ? "s" : ""}</b></div>`;
        if (harvestDates.length > 0) {
            const earliestH = new Date(Math.min.apply(null, harvestDates));
            const latestH = new Date(Math.max.apply(null, harvestDates));
            const spanH = Math.round((latestH - earliestH) / (1000 * 60 * 60 * 24));
            html += `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border-light);">`;
            html += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: var(--muted);">Harvest earliest:</span><b>${formatDateLong(earliestH)}</b></div>`;
            html += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: var(--muted);">Harvest latest:</span><b>${formatDateLong(latestH)}</b></div>`;
            html += `<div style="display: flex; justify-content: space-between;"><span style="color: var(--muted);">Harvest span:</span><b>${spanH} day${spanH !== 1 ? "s" : ""}</b></div>`;
            html += `</div>`;
        }
    } else html += `<span style="color: var(--muted); font-style: italic;">No planting dates available.</span>`;
    html += `</div></div>`;

    const preparedBy = localStorage.getItem("full_name") || localStorage.getItem("name") || localStorage.getItem("username") || "DA-RFO Officer";
    const generatedAt = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    html += `<div class="summary-footer"><div><b style="color: var(--ink);">Report:</b> #${escapeHtml(String(meta?.report_id || "—"))} — ${escapeHtml(meta?.title || "—")}</div><div><b style="color: var(--ink);">Viewed by:</b> ${escapeHtml(preparedBy)} at ${escapeHtml(generatedAt)}</div></div>`;

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
        const url = storedName && reportId ? `${API_BASE_URL}/api/raw-plant-reports/${reportId}/attachments/${storedName}` : null;
        if (url) {
            return `<div style="margin-bottom: 8px; padding: 12px 16px; background: #FFFFFF; border: 1.5px solid var(--border); border-radius: 8px; display: flex; align-items: center; gap: 10px;"><div style="width: 36px; height: 36px; border-radius: 8px; background: var(--green-light); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 18px;">📎</div><div style="flex: 1; min-width: 0;"><a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="color: var(--green-dark); font-weight: 700; text-decoration: none; font-size: 13.5px;">${escapeHtml(name)}</a><div style="font-size: 11px; color: var(--muted); margin-top: 2px;">Click to view attachment</div></div></div>`;
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
        const actualPlanting = intent.actual_planting_date ? formatDate(intent.actual_planting_date) : null;
        const actualHarvest = intent.actual_harvest_date ? formatDate(intent.actual_harvest_date) : null;

        function renderActualDate(actual, planned) {
            if (!actual) return `<span style="color: #BBB; font-style: italic;">Not yet recorded</span>`;
            let varianceBadge = "";
            if (planned) {
                const plannedDate = new Date(planned);
                const actualDate = new Date(actual);
                const diffDays = Math.round((actualDate - plannedDate) / (1000 * 60 * 60 * 24));
                if (diffDays === 0) varianceBadge = `<span style="font-size: 10px; color: #2E7D32; margin-left: 6px;">(on time)</span>`;
                else if (diffDays > 0) varianceBadge = `<span style="font-size: 10px; color: #D97706; margin-left: 6px;">(+${diffDays}d)</span>`;
                else varianceBadge = `<span style="font-size: 10px; color: #2980B9; margin-left: 6px;">(${diffDays}d)</span>`;
            }
            return `<span style="color: var(--ink); font-weight: 600;">${actual}</span>${varianceBadge}`;
        }

        const statusUpper = (intent.finalized_status_at_submission || intent.finalized_status || "NOT PLANTED").toUpperCase();
        let statusText = "Not Planted"; let bgColor = "#6c757d";
        if (statusUpper === "PLANTED")        { statusText = "Planted";    bgColor = "#D97706"; }
        else if (statusUpper === "HARVESTED") { statusText = "Harvested";  bgColor = "#2E7D32"; }
        else if (statusUpper === "MEDIATING") { statusText = "Mediating";  bgColor = "#2980B9"; }

        return `
            <tr>
                <td class="center-col" style="font-weight: 600;">#${escapeHtml(String(id))}</td>
                <td>${escapeHtml(farmer)}</td>
                <td>${escapeHtml(commodity)}</td>
                <td class="center-col"><div style="font-weight: 600;">${plannedVol.toLocaleString("en-US")} kg</div>${hasActual ? `<div style="font-size: 11px; color: #2E7D32; margin-top: 2px;">✓ ${actualVol.toLocaleString("en-US")} kg actual</div>` : `<div style="font-size: 11px; color: #BBB; margin-top: 2px; font-style: italic;">not harvested</div>`}</td>
                <td class="center-col" style="background: #FAFAFA;">${escapeHtml(plannedPlanting)}</td>
                <td class="center-col" style="background: #FFFBF5;">${renderActualDate(actualPlanting, intent.planting_date)}</td>
                <td class="center-col" style="background: #FAFAFA;">${escapeHtml(plannedHarvest)}</td>
                <td class="center-col" style="background: #FFFBF5;">${renderActualDate(actualHarvest, intent.harvest_date)}</td>
                <td class="center-col"><span class="status-pill" style="display:inline-block; padding:3px 12px; border-radius:999px; font-size:11px; font-weight:700; color:#FFFFFF; background-color:${bgColor};">${escapeHtml(statusText)}</span></td>
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
    if (detailView) { detailView.classList.add("hidden-element"); detailView.style.display = "none"; }
    const listView = document.getElementById("reportsListView");
    if (listView) { listView.classList.remove("hidden-element"); listView.style.display = "block"; }
    const pendingView = document.getElementById("pendingReportsView");
    if (pendingView) pendingView.style.display = "block";
    const returnedView = document.getElementById("returnedToProvincialView");
    if (returnedView) returnedView.style.display = "block";
    const approvedView = document.getElementById("approvedReportsView");
    if (approvedView) approvedView.style.display = "block";
    const mainHeader = document.getElementById("reportsMainHeader");
    if (mainHeader) mainHeader.style.display = "flex";
    window.scrollTo({ top: 0, behavior: "smooth" });
}


/* ============================================================
   REPORT DETAIL BUTTONS
============================================================ */

function initReportDetailButtons() {
    const backBtn = document.getElementById("backToPendingBtn");
    if (backBtn) {
        const newBack = backBtn.cloneNode(true);
        backBtn.parentNode.replaceChild(newBack, backBtn);
        newBack.addEventListener("click", closeReportDetail);
    }
    const flagBtn = document.getElementById("flagBtn");
    if (flagBtn) {
        const newFlag = flagBtn.cloneNode(true);
        flagBtn.parentNode.replaceChild(newFlag, flagBtn);
        newFlag.addEventListener("click", flagReport);
    }
    const approveBtn = document.getElementById("approveBtn");
    if (approveBtn) {
        const newApprove = approveBtn.cloneNode(true);
        approveBtn.parentNode.replaceChild(newApprove, approveBtn);
        newApprove.addEventListener("click", approveReport);
    }
}


/* ============================================================
   FLAG REPORT FOR REVISION
============================================================ */

function flagReport() {
    if (!selectedReport) { showSuccessModal({ title: "Error", message: "No report selected.", icon: "⚠", iconBg: "#FEE2E2", titleColor: "#C0392B" }); return; }

    const validatorId = localStorage.getItem("user_id") || localStorage.getItem("userId") || localStorage.getItem("id");
    const accessToken = getAuthToken();
    const tokenType = localStorage.getItem("token_type") || "bearer";

    if (!validatorId || !accessToken) { showSuccessModal({ title: "Session Expired", message: "Please log in again.", icon: "⚠", iconBg: "#FEE2E2", titleColor: "#C0392B" }); return; }

    const remarksEl = document.getElementById("remarksTextarea");
    const remarksInput = remarksEl?.value?.trim();

    if (!remarksInput) {
        showActionConfirm({
            title: "Remarks Required",
            message: "Please enter your revision remarks in the text area before flagging this report. <br><br>The Provincial Coordinator needs to know <strong>what to fix.</strong>",
            confirmText: "OK, I'll Add Remarks",
            confirmColor: "#D97706",
            cancelText: "Cancel",
            onConfirm: () => { remarksEl?.focus(); remarksEl?.scrollIntoView({ behavior: "smooth", block: "center" }); },
        });
        return;
    }

    const remarks = remarksInput;
    const reportTitle = selectedReport.title || `Report #${selectedReport.report_id}`;
    const municipality = selectedReport.municipality || "—";
    const detailsHtml = `<div style="display:grid; grid-template-columns: auto 1fr; gap: 6px 14px;"><span style="font-weight:700;">Report:</span><span>#${escapeHtml(String(selectedReport.report_id))} — ${escapeHtml(reportTitle)}</span><span style="font-weight:700;">Municipality:</span><span>${escapeHtml(municipality)}</span><span style="font-weight:700;">Your remarks:</span><span style="font-style:italic; color:#C0392B;">"${escapeHtml(remarks)}"</span></div>`;

    showActionConfirm({
        title: "Return to Provincial for Revision?",
        message: "This report will be returned to the Provincial Coordinator for revision. <br><strong>They will need to forward it again after making changes.</strong>",
        details: detailsHtml,
        confirmText: "Return to Provincial for Revision",
        confirmColor: "#C0392B",
        cancelText: "Cancel",
        onConfirm: async () => {
            const flagBtn = document.getElementById("flagBtn");
            const originalText = flagBtn?.textContent;
            if (flagBtn) { flagBtn.disabled = true; flagBtn.textContent = "Processing..."; }

            try {
                const url = `${API_BASE_URL}/api/report-submissions/${selectedReport.report_id}/revision?validator_id=${encodeURIComponent(validatorId)}&validator_role=darfo&remarks=${encodeURIComponent(remarks)}`;
                const res = await fetch(url, { method: "POST", headers: { "Accept": "application/json", "Authorization": `${tokenType} ${accessToken}` } });
                if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.detail || `HTTP ${res.status}`); }
                if (flagBtn) { flagBtn.classList.add("active"); flagBtn.textContent = "Flagged ✓"; }
                showSuccessModal({
                    title: "Flagged for Revision",
                    message: "The report has been returned to the Provincial Coordinator for revision. You'll see it again once they resubmit.",
                    icon: "⚠",
                    iconBg: "#FEF3C7",
                    titleColor: "#D97706",
                    onClose: async () => { closeReportDetail(); await loadReports(); },
                });
            } catch (err) {
                console.error("Flag error:", err);
                showSuccessModal({ title: "Flag Failed", message: escapeHtml(err.message || "Please try again."), icon: "⚠", iconBg: "#FEE2E2", titleColor: "#C0392B" });
                if (flagBtn) { flagBtn.classList.remove("active"); flagBtn.textContent = originalText || "Return to Provincial for Revision"; }
            } finally {
                if (flagBtn) flagBtn.disabled = false;
            }
        },
    });
}


/* ============================================================
   APPROVE REPORT
============================================================ */

function approveReport() {
    if (!selectedReport) { showSuccessModal({ title: "Error", message: "No report selected.", icon: "⚠", iconBg: "#FEE2E2", titleColor: "#C0392B" }); return; }

    const validatorId = localStorage.getItem("user_id") || localStorage.getItem("userId") || localStorage.getItem("id");
    const accessToken = getAuthToken();
    const tokenType = localStorage.getItem("token_type") || "bearer";

    if (!validatorId || !accessToken) { showSuccessModal({ title: "Session Expired", message: "Please log in again.", icon: "⚠", iconBg: "#FEE2E2", titleColor: "#C0392B" }); return; }

    const remarksInput = document.getElementById("remarksTextarea")?.value.trim();
    const remarks = remarksInput || null;
    const reportTitle = selectedReport.title || `Report #${selectedReport.report_id}`;
    const municipality = selectedReport.municipality || "—";
    const commodity = selectedReport.commodity || "—";

    const detailsHtml = `<div style="display:grid; grid-template-columns: auto 1fr; gap: 6px 14px;"><span style="font-weight:700;">Report:</span><span>#${escapeHtml(String(selectedReport.report_id))} — ${escapeHtml(reportTitle)}</span><span style="font-weight:700;">Municipality:</span><span>${escapeHtml(municipality)}</span><span style="font-weight:700;">Commodity:</span><span>${escapeHtml(commodity)}</span>${remarks ? `<span style="font-weight:700;">Your remarks:</span><span style="font-style:italic;">"${escapeHtml(remarks)}"</span>` : ""}</div>`;

    showActionConfirm({
        title: "Approve & Finalize Report?",
        message: "This is the final approval. The report will be marked as <strong>APPROVED</strong>. <br><strong>This action cannot be undone.</strong>",
        details: detailsHtml,
        confirmText: "Approve & Finalize",
        confirmColor: "#2E7D32",
        cancelText: "Cancel",
        onConfirm: async () => {
            const approveBtn = document.getElementById("approveBtn");
            const originalText = approveBtn?.textContent;
            if (approveBtn) { approveBtn.disabled = true; approveBtn.textContent = "Processing..."; }

            try {
                const url = `${API_BASE_URL}/api/report-submissions/${selectedReport.report_id}/approve?validator_id=${encodeURIComponent(validatorId)}&validator_role=darfo${remarks ? `&remarks=${encodeURIComponent(remarks)}` : ""}`;
                const res = await fetch(url, { method: "POST", headers: { "Accept": "application/json", "Authorization": `${tokenType} ${accessToken}` } });
                if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.detail || `HTTP ${res.status}`); }
                if (approveBtn) { approveBtn.classList.add("active"); approveBtn.textContent = "Approved ✓"; }
                showSuccessModal({
                    title: "Report Approved",
                    message: "The report has been marked as <strong>APPROVED</strong> and is now the final version.",
                    icon: "✓",
                    iconBg: "#D1FAE5",
                    titleColor: "#2E7D32",
                    onClose: async () => { closeReportDetail(); await loadReports(); },
                });
            } catch (err) {
                console.error("Approve error:", err);
                showSuccessModal({ title: "Approval Failed", message: escapeHtml(err.message || "Please try again."), icon: "⚠", iconBg: "#FEE2E2", titleColor: "#C0392B" });
                if (approveBtn) { approveBtn.classList.remove("active"); approveBtn.textContent = originalText || "Approve Report"; }
            } finally {
                if (approveBtn) approveBtn.disabled = false;
            }
        },
    });
}


/* ============================================================
   SUMMARY — PERIOD PICKER + LOAD + RENDER
============================================================ */

function getPeriodPreset(preset) {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    startOfWeek.setDate(now.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    switch (preset) {
        case "this-week": return { start: startOfWeek, end: endOfWeek };
        case "last-week": {
            const s = new Date(startOfWeek); s.setDate(s.getDate() - 7);
            const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23, 59, 59, 999);
            return { start: s, end: e };
        }
        case "this-month": {
            const s = new Date(now.getFullYear(), now.getMonth(), 1);
            const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            return { start: s, end: e };
        }
        case "last-30": {
            const e = new Date(now); e.setHours(23, 59, 59, 999);
            const s = new Date(now); s.setDate(s.getDate() - 29); s.setHours(0, 0, 0, 0);
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

function applyPeriodToInputs(period) {
    const startInput = document.getElementById("summaryPeriodStart");
    const endInput = document.getElementById("summaryPeriodEnd");
    if (startInput) startInput.value = period.start ? toDateInputValue(period.start) : "";
    if (endInput) endInput.value = period.end ? toDateInputValue(period.end) : "";
}

function refreshSummaryMultiSelect(kind) {
    const isProvince = kind === "province";
    const select = document.getElementById(isProvince ? "summaryProvinceSelect" : "summaryMunicipalitySelect");
    const optionsBox = document.getElementById(isProvince ? "summaryProvinceOptions" : "summaryMunicipalityOptions");
    const label = document.getElementById(isProvince ? "summaryProvinceLabel" : "summaryMunicipalityLabel");
    if (!select || !optionsBox || !label) return;
    const selected = Array.from(select.selectedOptions).map(o => o.value);
    const all = Array.from(select.options).map(o => o.value);
    optionsBox.innerHTML = Array.from(select.options).map(o => `<label class="multi-menu-option"><input type="checkbox" value="${escapeHtml(o.value)}" ${o.selected ? "checked" : ""}><span>${escapeHtml(o.textContent)}</span></label>`).join("");
    const defaultText = isProvince ? "All provinces" : "All municipalities";
    label.textContent = selected.length === 0 ? defaultText : selected.length === all.length ? `All selected (${selected.length})` : `${selected.length} selected`;
}

function initSummaryMultiSelectMenus() {
    if (window.__summaryMultiSelectInitialized) return;
    window.__summaryMultiSelectInitialized = true;
    const configs = [{ kind: "municipality", trigger: "summaryMunicipalityTrigger", menu: "summaryMunicipalityMenu", select: "summaryMunicipalitySelect" }];
    configs.forEach(cfg => {
        const trigger = document.getElementById(cfg.trigger);
        const menu = document.getElementById(cfg.menu);
        const select = document.getElementById(cfg.select);
        if (!trigger || !menu || !select) return;
        trigger.addEventListener("click", () => {
            const opening = menu.hidden;
            configs.forEach(other => {
                const m = document.getElementById(other.menu), t = document.getElementById(other.trigger);
                if (m) m.hidden = true;
                if (t) t.setAttribute("aria-expanded", "false");
            });
            menu.hidden = !opening;
            trigger.setAttribute("aria-expanded", opening ? "true" : "false");
        });
        menu.addEventListener("change", event => {
            const box = event.target;
            if (!box || box.type !== "checkbox") return;
            const option = Array.from(select.options).find(o => o.value === box.value);
            if (option) option.selected = box.checked;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            refreshSummaryMultiSelect(cfg.kind);
        });
    });
    document.addEventListener("click", event => {
        if (event.target.closest(".custom-multi")) return;
        configs.forEach(cfg => {
            const menu = document.getElementById(cfg.menu), trigger = document.getElementById(cfg.trigger);
            if (menu) menu.hidden = true;
            if (trigger) trigger.setAttribute("aria-expanded", "false");
        });
    });
    document.querySelectorAll("[data-multi-action]").forEach(button => button.addEventListener("click", () => {
        const kind = button.dataset.target;
        const select = document.getElementById(kind === "province" ? "summaryProvinceSelect" : "summaryMunicipalitySelect");
        if (!select) return;
        const selectAll = button.dataset.multiAction === "all";
        Array.from(select.options).forEach(o => o.selected = selectAll);
        select.dispatchEvent(new Event("change", { bubbles: true }));
        refreshSummaryMultiSelect(kind);
    }));
}

function initSummaryPeriodPicker() {
    const pills = document.querySelectorAll(".summary-quick-pills .filter-pill");
    const applyBtn = document.getElementById("applySummaryPeriodBtn");
    const printBtn = document.getElementById("printSummaryBtn");
    const provinceSelect = document.getElementById("summaryProvinceSelect");
    const municipalitySelect = document.getElementById("summaryMunicipalitySelect");

    initSummaryMultiSelectMenus();

    if (provinceSelect) {
        provinceSelect.innerHTML = `<option value="Pampanga" selected>Pampanga</option>`;
        selectedSummaryProvinces = ["Pampanga"];
        const lbl = document.getElementById("summaryProvinceLabel");
        if (lbl) lbl.textContent = "Pampanga";
    }

    if (municipalitySelect) {
        const pampangaMunis = ["Angeles City","Apalit","Arayat","Bacolor","Candaba","Floridablanca","Guagua","Lubao","Mabalacat","Macabebe","Magalang","Masantol","Mexico","Minalin","Porac","San Fernando","San Luis","San Simon","Santa Ana","Santa Rita","Santo Tomas"];
        municipalitySelect.innerHTML = pampangaMunis.map(name => `<option value="${name}">${name}</option>`).join("");
        selectedSummaryMunicipalities = [];
        refreshSummaryMultiSelect("municipality");
        municipalitySelect.addEventListener("change", () => {
            selectedSummaryMunicipalities = Array.from(municipalitySelect.selectedOptions).map(o => o.value).filter(Boolean);
            refreshSummaryMultiSelect("municipality");
            if (currentSummaryData) renderRegionalSummary(currentSummaryData);
        });
    }

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
            if (preset === "all-time") {
                currentSummaryPeriod.start = null;
                currentSummaryPeriod.end = null;
                const sInput = document.getElementById("summaryPeriodStart");
                const eInput = document.getElementById("summaryPeriodEnd");
                if (sInput) sInput.value = "";
                if (eInput) eInput.value = "";
            } else {
                currentSummaryPeriod.start = period.start;
                currentSummaryPeriod.end = period.end;
                applyPeriodToInputs(period);
            }
            currentSummaryPeriod.preset = preset;
            loadRegionalSummary();
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
            loadRegionalSummary();
        });
    }

    if (printBtn) printBtn.addEventListener("click", () => window.print());
}

async function loadRegionalDemandLookup() {
    const lookup = {};
    try {
        const response = await fetch(`${API_BASE_URL}/api/planting-intents/municipality-map`, { method: "GET", headers: getAuthHeaders(false) });
        if (!response.ok) return lookup;
        const result = await response.json();
        (result.data || []).forEach(entry => {
            (entry.commodities || []).forEach(item => {
                const key = `${String(entry.municipality || "").trim().toLowerCase()}|${String(item.commodity || "").trim().toLowerCase()}`;
                lookup[key] = { demand: Number(item.base_demand || 0), status: String(item.status || "").toUpperCase() };
            });
        });
    } catch (error) {
        console.warn("Market demand data unavailable for summary:", error);
    }
    return lookup;
}

function formatSupplyStatus(status) {
    if (status === "OVERSUPPLY") return { text: "Oversupply", color: "#C0392B" };
    if (status === "SURPLUS") return { text: "Surplus", color: "#D97706" };
    if (status === "DEFICIT") return { text: "Deficit", color: "#2980B9" };
    if (!status) return { text: "—", color: "var(--muted)" };
    const label = status.charAt(0) + status.slice(1).toLowerCase();
    return { text: label, color: "#2E7D32" };
}

async function loadRegionalSummary() {
    const loadingCard = document.getElementById("summaryLoadingCard");
    const contentCard = document.getElementById("summaryContentCard");

    if (loadingCard) { loadingCard.style.display = "block"; loadingCard.innerHTML = `<div style="padding: 40px; text-align: center; color: #777; font-size: 15px;">Loading summary...</div>`; }
    if (contentCard) contentCard.style.display = "none";

    try {
        const params = new URLSearchParams();
        if (currentSummaryPeriod.start) params.append("period_start", currentSummaryPeriod.start.toISOString());
        if (currentSummaryPeriod.end) params.append("period_end", currentSummaryPeriod.end.toISOString());
        const url = `${REGIONAL_SUMMARY_ENDPOINT}?${params.toString()}`;
        const data = await fetchJsonWithTimeout(url, { method: "GET", headers: getAuthHeaders(false) }, 15000);
        data.demandLookup = await loadRegionalDemandLookup();
        currentSummaryData = data;

        if (loadingCard) loadingCard.style.display = "none";
        if (contentCard) contentCard.style.display = "block";
        renderRegionalSummary(data);
    } catch (err) {
        console.error("Load regional summary error:", err);
        let errorMessage = "Please check the FastAPI server.";
        if (err?.message) { if (typeof err.message === "string") errorMessage = err.message; else if (typeof err.message === "object") errorMessage = JSON.stringify(err.message); }
        if (loadingCard) {
            loadingCard.style.display = "block";
            loadingCard.innerHTML = `<div style="padding: 40px; text-align: center; color: #C0392B; font-size: 15px;"><div style="font-size: 40px; margin-bottom: 10px;">⚠️</div><strong>Failed to load summary.</strong><br><small style="color: #999;">${escapeHtml(errorMessage)}</small><br><br><button onclick="loadRegionalSummary()" style="padding: 8px 20px; background: #2E7D32; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">🔄 Retry</button></div>`;
        }
        if (contentCard) contentCard.style.display = "none";
    }
}

function renderRegionalSummary(data) {
    const container = document.getElementById("regionalSummaryContent");
    if (!container) return;

    const REGION_MUNICIPALITIES = {
        "Aurora": ["Baler", "Casiguran", "Dilasag", "Dinalungan", "Dingalan", "Dipaculao", "Maria Aurora", "San Luis"],
        "Bataan": ["Abucay", "Bagac", "Balanga", "Dinalupihan", "Hermosa", "Limay", "Mariveles", "Morong", "Orani", "Orion", "Pilar", "Samal"],
        "Bulacan": ["Angat", "Balagtas", "Baliuag", "Bocaue", "Bulakan", "Bustos", "Calumpit", "Doña Remedios Trinidad", "Guiguinto", "Hagonoy", "Malolos", "Marilao", "Meycauayan", "Norzagaray", "Obando", "Pandi", "Paombong", "Plaridel", "Pulilan", "San Ildefonso", "San Jose del Monte", "San Miguel", "San Rafael", "Santa Maria"],
        "Nueva Ecija": ["Aliaga", "Bongabon", "Cabanatuan", "Cabiao", "Carranglan", "Cuyapo", "Gabaldon", "Gapan", "General Mamerto Natividad", "General Tinio", "Guimba", "Jaen", "Laur", "Licab", "Llanera", "Lupao", "Muñoz", "Nampicuan", "Palayan", "Pantabangan", "Peñaranda", "Quezon", "Rizal", "San Antonio", "San Isidro", "San Jose", "San Leonardo", "Santa Rosa", "Santo Domingo", "Talavera", "Talugtug", "Zaragoza"],
        "Pampanga": ["Angeles City", "Apalit", "Arayat", "Bacolor", "Candaba", "Floridablanca", "Guagua", "Lubao", "Mabalacat", "Macabebe", "Magalang", "Masantol", "Mexico", "Minalin", "Porac", "San Fernando", "San Luis", "San Simon", "Santa Ana", "Santa Rita", "Santo Tomas"],
        "Tarlac": ["Anao", "Bamban", "Camiling", "Capas", "Concepcion", "Gerona", "La Paz", "Mayantoc", "Moncada", "Paniqui", "Pura", "Ramos", "San Clemente", "San Jose", "San Manuel", "Santa Ignacia", "Tarlac City", "Victoria"],
        "Zambales": ["Botolan", "Cabangan", "Candelaria", "Castillejos", "Iba", "Masinloc", "Olongapo", "Palauig", "San Antonio", "San Felipe", "San Marcelino", "San Narciso", "Santa Cruz", "Subic"]
    };

    const allIntents = Array.isArray(data.intents) ? data.intents : [];
    const provinceOf = i => String(i.province || i.province_name || i.provinceName || i.province_name_en || i.provincial_name || i.province?.name || i.municipality?.province || i.municipality?.province_name || i.barangay?.municipality?.province || i.report?.province || i.report?.province_name || i.aew?.province || i.farmer?.province || i.location?.province || "").trim();
    const municipalityOf = i => String((typeof i.municipality === "string" ? i.municipality : i.municipality?.name) || i.municipality_name || i.municipalityName || i.city || i.city_name || i.cityName || i.report?.municipality || i.report?.municipality_name || i.location?.municipality || "").trim();

    selectedSummaryProvinces = ["Pampanga"];

    const municipalitySelect = document.getElementById("summaryMunicipalitySelect");
    if (municipalitySelect) {
        const pampangaMunis = REGION_MUNICIPALITIES["Pampanga"];
        const previousSelectedMunis = new Set(selectedSummaryMunicipalities);
        municipalitySelect.innerHTML = pampangaMunis.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
        selectedSummaryMunicipalities = pampangaMunis.filter(name => previousSelectedMunis.has(name));
        Array.from(municipalitySelect.options).forEach(o => o.selected = selectedSummaryMunicipalities.includes(o.value));
        refreshSummaryMultiSelect("municipality");
    }

    let intents = allIntents.filter(i => { const prov = provinceOf(i); return prov === "Pampanga" || prov === ""; });
    if (selectedSummaryMunicipalities.length > 0) {
        intents = intents.filter(i => selectedSummaryMunicipalities.includes(municipalityOf(i)));
    }

    const reportIds = [...new Set(intents.map(i => i.report_id ?? i.reportId ?? i.report?.report_id).filter(v => v !== undefined && v !== null && v !== ""))];
    const isOverall = selectedSummaryProvinces.length === 0 && selectedSummaryMunicipalities.length === 0;
    const reportCount = isOverall ? Number(data.report_count || 0) : (reportIds.length ? reportIds.length : Number(data.report_count || 0));
    const municipalityCount = new Set(intents.map(municipalityOf).filter(Boolean)).size;

    const periodStart = data.period_start ? new Date(data.period_start) : null;
    const periodEnd = data.period_end ? new Date(data.period_end) : null;

    if (intents.length === 0) {
        container.innerHTML = `<div style="padding: 60px 40px; text-align: center; color: var(--muted);"><div style="font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 6px;">No reports found for this period</div><div style="font-size: 13px; line-height: 1.5;">${selectedSummaryMunicipalities.length ? `No submissions for ${escapeHtml(selectedSummaryMunicipalities.join(", "))} between` : selectedSummaryProvinces.length ? `No submissions for ${escapeHtml(selectedSummaryProvinces.join(", "))} between` : "No regional submissions between"} <b>${periodStart ? formatDateLong(periodStart) : "the beginning"}</b> and <b>${periodEnd ? formatDateLong(periodEnd) : "now"}</b>.</div></div>`;
        return;
    }

    const selectedCount = intents.length;
    const totalVolume = intents.reduce((sum, i) => sum + (Number(i.volume) || 0), 0);
    const uniqueFarmers = new Set(intents.map(i => i.farmer_id || i.farmer_name).filter(Boolean));
    const uniqueFarmerCount = uniqueFarmers.size;

    const pendingCount = Number(data.pending_report_count) || 0;
    const harvestedIntents = intents.filter(i => (i.finalized_status || "").toUpperCase() === "HARVESTED");
    const harvestedVolume = harvestedIntents.reduce((sum, i) => { const actual = Number(i.actual_harvest_volume); const planned = Number(i.volume); return sum + (actual > 0 ? actual : (planned || 0)); }, 0);
    const harvestRate = selectedCount > 0 ? Math.round((harvestedIntents.length / selectedCount) * 100) : 0;
    const totalActualHarvest = intents.reduce((sum, i) => { const v = Number(i.actual_harvest_volume); return sum + (v > 0 ? v : 0); }, 0);

    const byCommodity = {};
    intents.forEach(intent => { const c = intent.commodity || "Unknown"; if (!byCommodity[c]) byCommodity[c] = { count: 0, volume: 0 }; byCommodity[c].count += 1; byCommodity[c].volume += Number(intent.volume) || 0; });

    const byMunicipality = {};
    intents.forEach(intent => { const m = intent.municipality || "Unknown"; if (!byMunicipality[m]) byMunicipality[m] = { count: 0, volume: 0 }; byMunicipality[m].count += 1; byMunicipality[m].volume += Number(intent.volume) || 0; });

    const byStatus = { "NOT PLANTED": { count: 0, volume: 0, label: "Not Planted", color: "#6c757d" }, "PLANTED": { count: 0, volume: 0, label: "Planted", color: "#D97706" }, "HARVESTED": { count: 0, volume: 0, label: "Harvested", color: "#2E7D32" }, "MEDIATING": { count: 0, volume: 0, label: "Mediating", color: "#2980B9" } };
    intents.forEach(intent => { const s = (intent.finalized_status || "NOT PLANTED").toUpperCase(); if (byStatus[s]) { byStatus[s].count += 1; byStatus[s].volume += Number(intent.volume) || 0; } });

    const yieldPlanned = totalVolume;
    const yieldActual = totalActualHarvest;
    const hasActualData = yieldActual > 0;
    const variancePct = hasActualData && yieldPlanned > 0 ? Math.round(((yieldActual - yieldPlanned) / yieldPlanned) * 100) : 0;

    const plantingDates = intents.map(i => i.planting_date).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
    const harvestDates = intents.map(i => i.harvest_date).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));

    const periodLabel = periodStart && periodEnd ? `${formatDateLong(periodStart)} – ${formatDateLong(periodEnd)}` : "All time";
    const preparedBy = localStorage.getItem("full_name") || localStorage.getItem("name") || localStorage.getItem("username") || "DA-RFO Officer";
    const generatedAt = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    const generatedDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    let html = "";

    html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1.5px solid var(--border-light); flex-wrap: wrap; gap: 12px;"><div><div style="font-size: 14px; font-weight: 800; color: var(--green-dark); text-transform: uppercase; letter-spacing: 0.06em;">${selectedSummaryMunicipalities.length ? escapeHtml(selectedSummaryMunicipalities.join(", ") + " Summary") : selectedSummaryProvinces.length ? escapeHtml(selectedSummaryProvinces.join(", ") + " Summary") : "Regional Summary"}</div><div style="font-size: 11px; color: var(--muted); margin-top: 3px;">Pampanga • Coverage: ${escapeHtml(periodLabel)}</div></div><div style="font-size: 11px; font-weight: 700; color: var(--green-dark); background: var(--green-light); padding: 5px 12px; border-radius: 999px;">${reportCount} report${reportCount !== 1 ? "s" : ""} • ${municipalityCount} municipalit${municipalityCount !== 1 ? "ies" : "y"}</div></div>`;

    html += `<div class="summary-kpi-grid"><div class="summary-kpi-card"><div class="summary-kpi-label">✓ Total Intents</div><div class="summary-kpi-value">${selectedCount}</div><div class="summary-kpi-subtext">Across ${reportCount} report${reportCount !== 1 ? "s" : ""}</div></div><div class="summary-kpi-card"><div class="summary-kpi-label">Total Volume</div><div class="summary-kpi-value">${formatKg(totalVolume)}</div><div class="summary-kpi-subtext">Planned estimate</div></div><div class="summary-kpi-card"><div class="summary-kpi-label">Unique Farmers</div><div class="summary-kpi-value">${uniqueFarmerCount}</div><div class="summary-kpi-subtext">Beneficiaries in period</div></div></div>`;

    const demandLookup = data.demandLookup || {};
    const groups = {};
    intents.forEach(intent => {
        const region = intent.municipality || "Unknown";
        const commodity = intent.commodity || "Unknown";
        const key = `${region}|${commodity}`;
        if (!groups[key]) groups[key] = { region, commodity, count: 0, volume: 0 };
        groups[key].count += 1;
        groups[key].volume += Number(intent.volume) || 0;
    });
    const summaryRows = Object.values(groups).sort((a, b) => a.region.localeCompare(b.region) || b.volume - a.volume);

    html += `<div class="summary-table-wrap"><table class="summary-table"><thead><tr><th>Region</th><th>Commodity</th><th class="num">Total Planting Intent</th><th class="num">Estimated Production</th><th class="num">Market Demand</th><th>Oversupply Status</th><th>Date Generated</th></tr></thead><tbody>${summaryRows.map(row => {
        const market = demandLookup[`${row.region.trim().toLowerCase()}|${row.commodity.trim().toLowerCase()}`];
        const supply = formatSupplyStatus(market?.status);
        return `<tr><td>${escapeHtml(row.region)}</td><td>${escapeHtml(row.commodity)}</td><td class="num">${row.count}</td><td class="num">${escapeHtml(formatKg(row.volume))}</td><td class="num">${market ? escapeHtml(formatKg(market.demand)) : "—"}</td><td><b style="color:${supply.color};">${escapeHtml(supply.text)}</b></td><td>${escapeHtml(generatedDate)}</td></tr>`;
    }).join("")}</tbody></table></div><details class="summary-details no-print"><summary>Supporting details (drill-down)</summary>`;

    html += `<div class="summary-kpi-grid"><div class="summary-kpi-card"><div class="summary-kpi-label">Pending Reports</div><div class="summary-kpi-value" style="color:${pendingCount > 0 ? "#D97706" : "#2E7D32"};">${pendingCount}</div><div class="summary-kpi-subtext">${pendingCount === 1 ? "report awaiting your review" : "reports awaiting your review"}</div></div><div class="summary-kpi-card"><div class="summary-kpi-label">Harvested Volume</div><div class="summary-kpi-value" style="color:#2E7D32;">${formatKg(harvestedVolume)}</div><div class="summary-kpi-subtext">${harvestedIntents.length} of ${selectedCount} harvested</div></div><div class="summary-kpi-card"><div class="summary-kpi-label">Harvest Rate</div><div class="summary-kpi-value" style="color:${harvestRate === 100 ? "#2E7D32" : harvestRate > 0 ? "#D97706" : "#6c757d"};">${harvestRate}%</div><div class="summary-kpi-subtext">Completion ratio</div></div></div>`;

    html += `<div class="summary-breakdown-grid">`;
    html += `<div><div class="summary-breakdown-title">By Commodity</div><div class="summary-breakdown-body">`;
    Object.entries(byCommodity).sort((a, b) => b[1].volume - a[1].volume).forEach(([name, d]) => { html += `<div class="summary-breakdown-row"><span style="font-weight: 600;">${escapeHtml(name)}</span><span style="font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums;">${d.count} · <b style="color:var(--green-dark);">${formatKg(d.volume)}</b></span></div>`; });
    html += `</div></div>`;

    html += `<div><div class="summary-breakdown-title">🏛️ By Municipality</div><div class="summary-breakdown-body">`;
    Object.entries(byMunicipality).sort((a, b) => b[1].volume - a[1].volume).forEach(([name, d]) => { html += `<div class="summary-breakdown-row"><span style="font-weight: 600;">🏛️ ${escapeHtml(name)}</span><span style="font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums;">${d.count} · <b style="color:var(--green-dark);">${formatKg(d.volume)}</b></span></div>`; });
    html += `</div></div>`;

    html += `<div><div class="summary-breakdown-title">📋 By Finalized Status</div><div class="summary-breakdown-body">`;
    Object.values(byStatus).forEach(d => { const isZero = d.count === 0; html += `<div class="summary-breakdown-row" style="opacity:${isZero ? 0.45 : 1};"><span style="font-weight: 600; color:${isZero ? 'var(--muted)' : 'var(--ink)'};"><span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${d.color}; margin-right: 8px;"></span>${d.label}</span><span style="font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums;">${d.count} · <b style="color:${isZero ? 'var(--muted)' : d.color};">${formatKg(d.volume)}</b></span></div>`; });
    html += `</div></div>`;
    html += `</div>`;

    html += `<div class="summary-insight-grid"><div class="summary-insight-card green"><div style="font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border-light);">Yield Performance</div>`;
    if (hasActualData) {
        let varianceColor = variancePct < 0 ? "#C0392B" : variancePct > 0 ? "#2E7D32" : "#6c757d";
        let varianceIcon = variancePct < 0 ? "↓" : variancePct > 0 ? "↑" : "→";
        let varianceLabel = variancePct < 0 ? "shortfall" : variancePct > 0 ? "surplus" : "on target";
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: var(--muted);">Expected:</span><b>${yieldPlanned.toLocaleString("en-US")} kg</b></div><div style="display: flex; justify-content: space-between; margin-bottom: 10px;"><span style="color: var(--muted);">Actual:</span><b>${yieldActual.toLocaleString("en-US")} kg</b></div><div style="display: inline-block; padding: 4px 12px; background: ${varianceColor}15; border-radius: 6px; font-size: 13px; font-weight: 700; color: ${varianceColor};">${varianceIcon} ${Math.abs(variancePct)}% ${varianceLabel}</div>`;
    } else html += `<span style="color: var(--muted); font-style: italic;">No actual harvest volume recorded yet.</span>`;
    html += `</div>`;

    html += `<div class="summary-insight-card orange"><div style="font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border-light);">📅 Planting Window</div>`;
    if (plantingDates.length > 0) {
        const earliest = new Date(Math.min.apply(null, plantingDates));
        const latest = new Date(Math.max.apply(null, plantingDates));
        const spanDays = Math.round((latest - earliest) / (1000 * 60 * 60 * 24));
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: var(--muted);">🌱 Earliest:</span><b>${formatDateLong(earliest)}</b></div><div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: var(--muted);">Latest:</span><b>${formatDateLong(latest)}</b></div><div style="display: flex; justify-content: space-between;"><span style="color: var(--muted);">Span:</span><b>${spanDays} day${spanDays !== 1 ? "s" : ""}</b></div>`;
    } else html += `<span style="color: var(--muted); font-style: italic;">No planting dates available.</span>`;
    html += `</div></div>`;
    html += `</details>`;

    html += `<div class="summary-footer"><div><b style="color: var(--ink);">Prepared by:</b> ${escapeHtml(preparedBy)}</div><div><b style="color: var(--ink);">Generated:</b> ${escapeHtml(generatedAt)}</div></div>`;

    container.innerHTML = html;
}


/* ============================================================
   ETL RUN LOGS (pagination — 7 per page)
============================================================ */

async function loadETLRunLogs() {
    const etlRows = document.getElementById("etlRows");
    if (!etlRows) return;
    etlRows.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--muted);">Loading ETL logs...</td></tr>`;
    removePaginationControls("etlTablePagination");

    try {
        const response = await fetch(`${API_BASE_URL}/api/etl-run-log/`, { method: "GET", headers: getAuthHeaders() });
        let data = {};
        try { data = await response.json(); } catch { data = {}; }

        if (response.status === 401) { localStorage.clear(); window.location.href = "../index.html"; return; }
        if (response.status === 403) { etlRows.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:24px; color:#C0392B;">You do not have permission to view ETL logs.</td></tr>`; return; }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        let logs = [];
        if (Array.isArray(data)) logs = data;
        else if (Array.isArray(data.logs)) logs = data.logs;
        else if (Array.isArray(data.data)) logs = data.data;
        else throw new Error("Unexpected ETL log response format.");

        etlLogsCache = logs;
        renderETLLogs();
    } catch (error) {
        console.error("Load ETL run logs error:", error);
        etlRows.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:24px; color:#C0392B;">Failed to load ETL logs.<br><br>${escapeHtml(error.message)}</td></tr>`;
        removePaginationControls("etlTablePagination");
    }
}

function renderETLLogs() {
    const etlRows = document.getElementById("etlRows");
    if (!etlRows) return;

    const logs = etlLogsCache.filter(log => {
        if (!etlSearchTerm) return true;
        const haystack = [formatAuditDate(log.run_date_time), log.data_source || "", log.status || "", log.error_message || ""].join(" ").toLowerCase();
        return haystack.includes(etlSearchTerm);
    });

    etlRows.innerHTML = "";

    if (logs.length === 0) {
        etlRows.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--muted);">${etlSearchTerm ? "No ETL logs match your search." : "No ETL logs available."}</td></tr>`;
        removePaginationControls("etlTablePagination");
        return;
    }

    const totalPages = Math.ceil(logs.length / ITEMS_PER_PAGE) || 1;
    if (currentEtlPage > totalPages) currentEtlPage = totalPages;
    if (currentEtlPage < 1) currentEtlPage = 1;
    const startIndex = (currentEtlPage - 1) * ITEMS_PER_PAGE;
    const paginatedLogs = logs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    paginatedLogs.forEach(log => {
        const row = document.createElement("tr");
        const runDateTime = formatAuditDate(log.run_date_time);
        const dataSource = log.data_source || "—";
        const status = log.status || "—";
        const errorMessage = log.error_message || "";
        const statusColor = status.toLowerCase() === "success" ? "#2E7D32" : status.toLowerCase() === "failed" ? "#C0392B" : "#6c757d";
        const failureDetails = status.toLowerCase() === "failed" ? (errorMessage ? `<details><summary>View reason</summary><div>${escapeHtml(errorMessage)}</div></details>` : `<span>No details recorded for this run.</span>`) : "—";
        row.innerHTML = `<td style="text-align:left; padding:13px 14px; border-bottom:1px solid var(--border-light);">${escapeHtml(runDateTime)}</td><td style="text-align:left; padding:13px 14px; border-bottom:1px solid var(--border-light);">${escapeHtml(dataSource)}</td><td style="text-align:left; padding:13px 14px; border-bottom:1px solid var(--border-light);"><span style="display:inline-block; padding:4px 12px; border-radius:999px; font-size:11.5px; font-weight:700; color:#FFFFFF; background-color:${statusColor}; text-transform:uppercase;">${escapeHtml(status)}</span></td><td style="text-align:left; padding:13px 14px; border-bottom:1px solid var(--border-light); max-width:420px; overflow-wrap:anywhere;">${failureDetails}</td>`;
        etlRows.appendChild(row);
    });

    renderPaginationUI("etlRows", currentEtlPage, totalPages, (newPage) => { currentEtlPage = newPage; renderETLLogs(); }, "etlTablePagination", { totalItems: logs.length, pageSize: ITEMS_PER_PAGE, label: "logs" });
}

async function manualRunETL() {
    const manualRunBtn = document.getElementById("manualRunBtn");
    if (!manualRunBtn) return;

    const confirmed = await ESaka.confirm("Are you sure you want to run the ETL pipeline manually?", { title: "Run ETL pipeline?", confirmText: "Run now" });
    if (!confirmed) return;

    manualRunBtn.disabled = true;
    manualRunBtn.textContent = "Running ETL...";

    try {
        const beforeResponse = await fetch(`${API_BASE_URL}/api/etl-run-log/`, { method: "GET", headers: getAuthHeaders() });
        const beforeData = await beforeResponse.json().catch(() => []);
        const beforeLogs = Array.isArray(beforeData) ? beforeData : (beforeData.logs || beforeData.data || []);
        const baselineLogId = beforeLogs.reduce((highest, log) => Math.max(highest, Number(log.etl_log_id ?? log.id ?? 0)), 0);

        const response = await fetch(`${API_BASE_URL}/api/etl-run-log/manual-run`, { method: "POST", headers: getAuthHeaders() });
        let data = {};
        try { data = await response.json(); } catch { data = {}; }

        if (response.status === 401) { localStorage.clear(); window.location.href = "../index.html"; return; }
        if (response.status === 403) throw new Error("You do not have permission to run the ETL pipeline.");
        if (!response.ok) throw new Error(data.detail || "Failed to start ETL pipeline.");

        const result = await waitForETLCompletion(baselineLogId);
        currentEtlPage = 1;
        await loadETLRunLogs();
        await loadDaDashboard();

        if (result.hasFailed) {
            const failureSummary = result.logs.filter(log => String(log.status).toLowerCase() === "failed").map(log => `${log.data_source || "ETL step"}: ${log.error_message || "No failure details were recorded."}`).join("\n");
            alert(`ETL pipeline finished with failed steps.\n\n${failureSummary}`);
        } else alert("ETL Pipeline Completed Successfully!");
    } catch (error) {
        console.error("Manual ETL run error:", error);
        alert("❌ ETL Pipeline Failed.\n\n" + (error.message || "Unable to complete the ETL pipeline."));
    } finally {
        manualRunBtn.disabled = false;
        manualRunBtn.textContent = "Manual Run";
    }
}

async function waitForETLCompletion(baselineLogId = 0) {
    const maxAttempts = 60;
    const interval = 3000;
    const expectedStepCount = 9;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/etl-run-log/`, { method: "GET", headers: getAuthHeaders() });
            if (response.status === 401) { localStorage.clear(); window.location.href = "../index.html"; throw new Error("Session expired."); }
            if (!response.ok) throw new Error("Unable to check ETL run status.");

            const data = await response.json();
            let logs = [];
            if (Array.isArray(data)) logs = data;
            else if (Array.isArray(data.logs)) logs = data.logs;
            else if (Array.isArray(data.data)) logs = data.data;

            const newLogs = logs.filter(log => Number(log.etl_log_id ?? log.id ?? 0) > baselineLogId);
            if (newLogs.length >= expectedStepCount) {
                const latestLogs = newLogs.slice(0, expectedStepCount);
                const allFinished = latestLogs.every(log => log.status && (String(log.status).toLowerCase() === "success" || String(log.status).toLowerCase() === "failed"));
                if (allFinished) {
                    const hasFailed = latestLogs.some(log => log.status && String(log.status).toLowerCase() === "failed");
                    return { hasFailed, logs: latestLogs };
                }
            }
        } catch (error) {
            console.error("ETL status check error:", error);
            throw error;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error("ETL pipeline is taking too long to complete.");
}

function formatAuditDate(dateString) {
    if (!dateString) return "—";
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(dateString);
    const d = new Date(hasTimezone ? dateString : `${dateString}Z`);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

function initializeETLSearch() {
    const searchInput = document.getElementById("searchETL");
    if (!searchInput) return;
    searchInput.addEventListener("input", () => {
        etlSearchTerm = searchInput.value.trim().toLowerCase();
        currentEtlPage = 1;
        renderETLLogs();
    });
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

    if (details && details.trim()) { detailsEl.innerHTML = details; detailsEl.style.display = "block"; }
    else { detailsEl.innerHTML = ""; detailsEl.style.display = "none"; }

    okBtn.textContent = confirmText;
    okBtn.style.background = confirmColor;
    cancelBtn.textContent = cancelText;

    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newOkBtn.addEventListener("click", () => { modal.classList.remove("show"); onConfirm && onConfirm(); });
    newCancelBtn.addEventListener("click", () => { modal.classList.remove("show"); onCancel && onCancel(); });
    modal.onclick = (e) => { if (e.target === modal) { modal.classList.remove("show"); onCancel && onCancel(); } };

    modal.classList.add("show");
}


/* ============================================================
   PAGINATION HELPERS
============================================================ */

function renderPaginationUI(containerId, currentPage, totalPages, onPageChange, paginationWrapperId, meta = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    removePaginationControls(paginationWrapperId);

    const totalItems = Number(meta.totalItems) || 0;
    const pageSize = Number(meta.pageSize) || ITEMS_PER_PAGE;
    const label = meta.label || "items";
    const from = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const to = Math.min(currentPage * pageSize, totalItems);

    const pages = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else {
        pages.push(1);
        if (currentPage > 3) pages.push("...");
        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
        if (currentPage < totalPages - 2) pages.push("...");
        pages.push(totalPages);
    }

    const wrapper = document.createElement("div");
    wrapper.id = paginationWrapperId;
    wrapper.className = "pagination-bar";

    const pageButtons = pages.map(p => p === "..." ? `<span class="pg-ellipsis">…</span>` : `<button type="button" class="pg-btn pg-num ${p === currentPage ? "active" : ""}" data-page="${p}">${p}</button>`).join("");

    wrapper.innerHTML = `<span class="pagination-info">Showing ${from}–${to} of ${totalItems} ${escapeHtml(label)}</span><div class="pagination-controls"><button type="button" class="pg-btn pg-prev" ${currentPage === 1 ? "disabled" : ""}>« Prev</button>${pageButtons}<button type="button" class="pg-btn pg-next" ${currentPage === totalPages ? "disabled" : ""}>Next »</button></div>`;

    wrapper.querySelector(".pg-prev").addEventListener("click", () => { if (currentPage > 1) onPageChange(currentPage - 1); });
    wrapper.querySelector(".pg-next").addEventListener("click", () => { if (currentPage < totalPages) onPageChange(currentPage + 1); });
    wrapper.querySelectorAll(".pg-num").forEach(btn => btn.addEventListener("click", () => { const target = Number(btn.dataset.page); if (target !== currentPage) onPageChange(target); }));

    if (container.tagName === "TBODY") {
        const table = container.closest("table");
        const host = table.parentNode;
        host.parentNode.insertBefore(wrapper, host.nextSibling);
    } else container.appendChild(wrapper);
}

function removePaginationControls(paginationWrapperId) {
    const existing = document.getElementById(paginationWrapperId);
    if (existing) existing.remove();
}

function showSuccessModal({
    title = "Success",
    message = "Operation completed successfully.",
    confirmText = "Done",
    icon = "✓",
    iconBg = "var(--green-light)",
    titleColor = "var(--green-dark)",
    onClose = null,
} = {}) {
    const modal = document.getElementById("reportSubmittedModal");
    const titleEl = document.getElementById("reportSubmittedTitle");
    const messageEl = document.getElementById("reportSubmittedMessage");
    const closeBtn = document.getElementById("closeReportSubmittedBtn");
    const iconEl = document.getElementById("reportSubmittedIcon");

    if (!modal || !titleEl || !messageEl || !closeBtn) { alert(message.replace(/<[^>]*>/g, "")); onClose && onClose(); return; }

    titleEl.textContent = title;
    titleEl.style.color = titleColor;
    messageEl.innerHTML = message;
    closeBtn.textContent = confirmText;

    if (iconEl) { iconEl.textContent = icon; iconEl.style.background = iconBg; }

    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener("click", function () { modal.classList.remove("show"); onClose && onClose(); });
    modal.onclick = function (e) { if (e.target === modal) { modal.classList.remove("show"); onClose && onClose(); } };

    modal.classList.add("show");
}


/* ============================================================
   MARKET DATA UPLOAD — TRIGGERS ETL + FORECAST
============================================================ */

let mpSelectedFile = null;

function initMarketUploadSection() {
    const uploadArea = document.getElementById("mpUploadArea");
    const fileInput = document.getElementById("mpFileInput");
    const uploadBtn = document.getElementById("mpUploadBtn");
    const clearBtn = document.getElementById("mpClearFileBtn");
    if (!uploadArea || !fileInput) return;

    uploadArea.addEventListener("click", () => fileInput.click());
    uploadArea.addEventListener("dragover", (e) => { e.preventDefault(); uploadArea.style.borderColor = "var(--primary)"; uploadArea.style.background = "#F0F5F2"; });
    uploadArea.addEventListener("dragleave", () => { uploadArea.style.borderColor = "var(--border)"; uploadArea.style.background = "#FAFBF9"; });
    uploadArea.addEventListener("drop", (e) => { e.preventDefault(); uploadArea.style.borderColor = "var(--border)"; uploadArea.style.background = "#FAFBF9"; const file = e.dataTransfer.files[0]; if (file) handleMarketFile(file); });
    fileInput.addEventListener("change", (e) => { const file = e.target.files[0]; if (file) handleMarketFile(file); });
    clearBtn?.addEventListener("click", (e) => { e.stopPropagation(); resetMarketUpload(); });
    uploadBtn?.addEventListener("click", uploadMarketFile);
}

function handleMarketFile(file) {
    const validExt = /\.(xlsx|xls)$/i.test(file.name);
    if (!validExt) { showMarketStatus("error", "❌ Only .xlsx or .xls files are allowed."); return; }
    mpSelectedFile = file;
    document.getElementById("mpFileName").textContent = file.name;
    document.getElementById("mpFileSize").textContent = `${(file.size / 1024).toFixed(1)} KB`;
    document.getElementById("mpFilePreview").style.display = "flex";
    document.getElementById("mpUploadBtn").disabled = false;
    clearMarketStatus();
}

function resetMarketUpload() {
    mpSelectedFile = null;
    const fileInput = document.getElementById("mpFileInput");
    if (fileInput) fileInput.value = "";
    document.getElementById("mpFilePreview").style.display = "none";
    document.getElementById("mpUploadBtn").disabled = true;
    clearMarketStatus();
}

function showMarketStatus(type, message) {
    const el = document.getElementById("mpStatus");
    if (!el) return;
    const colors = { info: { bg: "#EFF6FF", color: "#1E40AF", border: "#BFDBFE" }, success: { bg: "#ECFDF5", color: "#065F46", border: "#A7F3D0" }, error: { bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" } };
    const c = colors[type] || colors.info;
    el.style.background = c.bg; el.style.color = c.color; el.style.border = `1px solid ${c.border}`;
    el.innerHTML = message; el.style.display = "block";
}

function clearMarketStatus() {
    const el = document.getElementById("mpStatus");
    if (el) el.style.display = "none";
}

async function uploadMarketFile() {
    if (!mpSelectedFile) return;
    const uploadBtn = document.getElementById("mpUploadBtn");
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading...";
    showMarketStatus("info", "Uploading file... Please wait.");

    try {
        const formData = new FormData();
        formData.append("file", mpSelectedFile);
        const response = await fetch(`${API_BASE_URL}/api/market-prices/upload`, { method: "POST", headers: getAuthHeaders(false), body: formData });
        const data = await parseResponse(response);
        if (!response.ok) throw new Error(data.detail || "Upload failed.");

        showMarketStatus("success", `<strong>File received.</strong><br>ETL pipeline and forecast are running in the background.<br>Refreshing ETL logs in <b>30 seconds...</b>`);
        mpSelectedFile = null;
        document.getElementById("mpFileInput").value = "";
        document.getElementById("mpFilePreview").style.display = "none";

        setTimeout(async () => {
            try {
                if (document.getElementById("etlRows")) { currentEtlPage = 1; await loadETLRunLogs(); }
                showMarketStatus("success", `<strong>File processed.</strong><br>ETL logs refreshed. Check the <strong>Monitor ETL Pipeline</strong> tab for new entries.<br>Forecasts will appear on the AEW dashboard shortly.`);
            } catch (err) { console.error("Post-upload refresh error:", err); }
        }, 30000);
    } catch (error) {
        console.error("Upload error:", error);
        showMarketStatus("error", `❌ ${error.message}`);
        uploadBtn.disabled = false;
    } finally {
        uploadBtn.textContent = "Upload & Trigger Forecast";
        if (mpSelectedFile) uploadBtn.disabled = false;
    }
}


/* ============================================================
   END OF ORIGINAL da.js LOGIC
============================================================ */


/* ============================================================
   DA-RFO SUMMARY EXPORTS — MUNICIPAL-STYLE (PDF + XLSX)
   Ported from municipal.js
============================================================ */
(function () {

    let daPdfPreviewState = { root: null, filename: "regional_report.pdf", title: "Regional Report", signatureInfo: {}, blob: null, objectUrl: null };

    /* ---------- Small helpers ---------- */

    function getJsPDFConstructor() {
        return window.jspdf?.jsPDF || window.jsPDF || null;
    }

    function loadJsPDF() {
        if (getJsPDFConstructor()) return Promise.resolve(getJsPDFConstructor());
        if (window.__daJsPdfPromise) return window.__daJsPdfPromise;
        window.__daJsPdfPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
            script.onload = () => getJsPDFConstructor() ? resolve(getJsPDFConstructor()) : reject(new Error("jsPDF loaded but was not initialized"));
            script.onerror = () => reject(new Error("Could not load jsPDF. Check your internet connection."));
            document.head.appendChild(script);
        });
        return window.__daJsPdfPromise;
    }

    function loadExcelJS() {
        if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
        if (window.__daExcelJsPromise) return window.__daExcelJsPromise;
        window.__daExcelJsPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
            script.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error("ExcelJS did not initialize"));
            script.onerror = () => reject(new Error("Could not load ExcelJS"));
            document.head.appendChild(script);
        });
        return window.__daExcelJsPromise;
    }

    function cleanExportText(value) {
        return String(value ?? "").replace(/[\u{1F300}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "").replace(/\uFE0F/g, "").trim();
    }

    function daReportCycleInfo() {
        const name = localStorage.getItem("da_export_prepared_by") || localStorage.getItem("user_display_name") || localStorage.getItem("full_name") || localStorage.getItem("name") || localStorage.getItem("username") || "";
        const role = localStorage.getItem("da_export_position") || localStorage.getItem("role") || "";
        const region = localStorage.getItem("region") || "Region III (Central Luzon)";
        const province = localStorage.getItem("province") || "Pampanga";
        return { name, role, region, province };
    }

    /* ---------- PDF preview modal (iframe) ---------- */

    function ensureDaPdfPreviewModal() {
        let modal = document.getElementById("daPdfPreviewModal");
        if (modal) return modal;
        modal = document.createElement("div");
        modal.id = "daPdfPreviewModal";
        modal.style.cssText = "display:none;position:fixed;inset:0;z-index:100000;background:rgba(13,25,18,.68);padding:20px;box-sizing:border-box;align-items:center;justify-content:center;";
        modal.innerHTML = `
          <section role="dialog" aria-modal="true" aria-labelledby="daPdfPreviewTitle" style="background:#f7f9f6;color:#202824;width:min(1180px,98vw);max-height:96vh;overflow:auto;border-radius:16px;box-shadow:0 20px 70px rgba(0,0,0,.3);padding:22px;box-sizing:border-box;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;">
              <div><h2 id="daPdfPreviewTitle" style="margin:0;color:#174b36;font-size:22px;">PDF Preview</h2><p style="margin:5px 0 0;color:#64716a;font-size:13px;">Review the actual PDF before downloading.</p></div>
              <button type="button" id="daPdfPreviewClose" aria-label="Close PDF preview" style="border:0;background:transparent;font-size:28px;cursor:pointer;color:#425148;">×</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;background:#fff;border:1px solid #dce5dd;border-radius:12px;padding:14px;margin-bottom:14px;">
              <label style="font-size:13px;font-weight:700;">Prepared by
                <input id="daPdfPreparedBy" type="text" autocomplete="name" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border:1px solid #cbd6ce;border-radius:8px;font:inherit;" />
              </label>
              <label style="font-size:13px;font-weight:700;">Position
                <input id="daPdfPosition" type="text" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border:1px solid #cbd6ce;border-radius:8px;font:inherit;" />
              </label>
              <div style="display:flex;align-items:end;gap:8px;flex-wrap:wrap;">
                <button type="button" id="daPdfGeneratePreview" style="background:#245b43;color:#fff;border:0;border-radius:8px;padding:11px 15px;font-weight:700;cursor:pointer;">Generate Preview</button>
                <button type="button" id="daPdfDownloadFinal" disabled style="background:#c4cec7;color:#fff;border:0;border-radius:8px;padding:11px 15px;font-weight:700;cursor:not-allowed;">Download PDF</button>
              </div>
            </div>
            <p id="daPdfPreviewStatus" role="status" style="font-size:13px;color:#64716a;margin:8px 0 12px;">Enter the preparer details, then generate the preview.</p>
            <div id="daPdfPreviewFrameWrap" style="display:none;background:#5a625d;border-radius:10px;padding:8px;">
              <iframe id="daPdfPreviewFrame" title="Generated PDF preview" style="display:block;width:100%;height:62vh;border:0;border-radius:6px;background:#fff;"></iframe>
            </div>
          </section>`;
        document.body.appendChild(modal);

        const close = () => {
            modal.style.display = "none";
            if (daPdfPreviewState.objectUrl) URL.revokeObjectURL(daPdfPreviewState.objectUrl);
            daPdfPreviewState.objectUrl = null;
            daPdfPreviewState.blob = null;
            const frame = document.getElementById("daPdfPreviewFrame");
            if (frame) frame.removeAttribute("src");
            const wrap = document.getElementById("daPdfPreviewFrameWrap");
            if (wrap) wrap.style.display = "none";
            const download = document.getElementById("daPdfDownloadFinal");
            if (download) { download.disabled = true; download.style.background = "#c4cec7"; download.style.cursor = "not-allowed"; }
        };

        document.getElementById("daPdfPreviewClose").addEventListener("click", close);
        modal.addEventListener("click", event => { if (event.target === modal) close(); });
        document.addEventListener("keydown", event => { if (event.key === "Escape" && modal.style.display === "flex") close(); });

        document.getElementById("daPdfGeneratePreview").addEventListener("click", async () => {
            const status = document.getElementById("daPdfPreviewStatus");
            const preparedBy = document.getElementById("daPdfPreparedBy").value.trim();
            const position = document.getElementById("daPdfPosition").value.trim();
            if (!preparedBy || !position) { status.textContent = "Please fill in both Prepared by and Position before generating the PDF preview."; status.style.color = "#b42318"; return; }
            try { await loadJsPDF(); } catch (loadError) { status.textContent = "Could not load the PDF engine. Check your internet connection, refresh, and try again."; status.style.color = "#b42318"; console.error(loadError); return; }

            const generateBtn = document.getElementById("daPdfGeneratePreview");
            const downloadBtn = document.getElementById("daPdfDownloadFinal");
            generateBtn.disabled = true;
            generateBtn.textContent = "Generating preview…";
            status.style.color = "#64716a";
            status.textContent = "Generating the actual PDF. Please wait…";

            try {
                if (daPdfPreviewState.objectUrl) URL.revokeObjectURL(daPdfPreviewState.objectUrl);
                daPdfPreviewState.objectUrl = null;
                daPdfPreviewState.blob = null;
                daPdfPreviewState.signatureInfo = { ...(daPdfPreviewState.signatureInfo || {}), preparedBy, position };
                localStorage.setItem("da_export_prepared_by", preparedBy);
                localStorage.setItem("da_export_position", position);
                if (daPdfPreviewState.signatureInfo.title) localStorage.setItem("da_export_report_title", daPdfPreviewState.signatureInfo.title);
                if (daPdfPreviewState.signatureInfo.municipality) localStorage.setItem("province", daPdfPreviewState.signatureInfo.municipality);
                daPdfPreviewState.blob = createStructuredPdfBlob(daPdfPreviewState.root, daPdfPreviewState.title, daPdfPreviewState.signatureInfo);
                daPdfPreviewState.objectUrl = URL.createObjectURL(daPdfPreviewState.blob);
                document.getElementById("daPdfPreviewFrame").src = daPdfPreviewState.objectUrl;
                document.getElementById("daPdfPreviewFrameWrap").style.display = "block";
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

        document.getElementById("daPdfDownloadFinal").addEventListener("click", () => {
            if (!daPdfPreviewState.blob) return;
            const url = daPdfPreviewState.objectUrl || URL.createObjectURL(daPdfPreviewState.blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = daPdfPreviewState.filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
        });

        return modal;
    }

    /* ---------- Structured PDF generator ---------- */

    function createStructuredPdfBlob(root, title, signatureInfo = {}) {
        const JsPDF = getJsPDFConstructor();
        if (!JsPDF) throw new Error("jsPDF is unavailable. Please refresh and try again.");

        const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
        const info = daReportCycleInfo();
        const municipality = cleanExportText(signatureInfo.municipality || info.province || "Pampanga");
        const reportTitle = cleanExportText(signatureInfo.title || title || "REGIONAL SUMMARY REPORT");
        const preparedByName = cleanExportText(signatureInfo.preparedBy || info.name || "");
        const positionText = cleanExportText(signatureInfo.position || info.role || "");
        const officeText = `Department of Agriculture - Regional Field Office III${municipality ? ", " + municipality : ""}`;

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        const contentWidth = pageWidth - margin * 2;
        const bottomLimit = pageHeight - 18;

        const navy = [11, 56, 42];
        const green = [20, 83, 45];
        const gold = [234, 179, 8];
        const tint = [227, 238, 231];
        const gray = [243, 247, 244];
        const rule = [207, 222, 213];
        const textColor = [32, 40, 36];
        const muted = [95, 107, 100];

        const reportingPeriod = cleanExportText(signatureInfo.reportingPeriod || "Selected reporting period");
        const generatedAt = new Date().toLocaleString("en-PH", { dateStyle: "short", timeStyle: "short" });

        const clean = root.cloneNode(true);
        clean.querySelectorAll("button, textarea, input, select, .report-detail-export, #validationHistoryWrapper, .export-signatures, .no-print, .report-pagination").forEach(el => el.remove());
        clean.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, div").forEach(el => { if (/appendix|data consistency notes/i.test(el.textContent)) el.remove(); });

        const textOf = el => el ? cleanExportText((el.innerText || el.textContent || "").replace(/\s+/g, " ")) : "";
        const fit = (text, width, size, style = "normal") => { doc.setFont("helvetica", style); doc.setFontSize(size); return doc.splitTextToSize(cleanExportText(text), width)[0] || ""; };

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
                { w: 0.22, label: "PROVINCE / REGION", value: municipality || "-", sub: "Department of Agriculture" },
                { w: 0.27, label: "REPORTING PERIOD", value: reportingPeriod, sub: "" },
                { w: 0.31, label: "PREPARED BY", value: preparedByName || "-", sub: positionText },
                { w: 0.20, label: "GENERATED", value: generatedAt, sub: "eSaka system" }
            ];

            let x = margin + 4;
            cells.forEach((cell, index) => {
                const cw = contentWidth * cell.w;
                const inner = cw - 6;
                doc.setFont("helvetica", "bold"); doc.setFontSize(5.8); doc.setTextColor(...muted); doc.text(cell.label, x, top + 5);
                doc.setFont("helvetica", "bold"); doc.setFontSize(8.2); doc.setTextColor(...navy); doc.text(fit(cell.value, inner, 8.2, "bold"), x, top + 10);
                if (cell.sub) { doc.setFont("helvetica", "normal"); doc.setFontSize(6.4); doc.setTextColor(...muted); doc.text(fit(cell.sub, inner, 6.4), x, top + 14); }
                x += cw;
                if (index < cells.length - 1) { doc.setDrawColor(...rule); doc.setLineWidth(0.2); doc.line(x - 3, top + 3, x - 3, top + height - 3); }
            });

            y = top + height + 6;
        };

        const drawHeader = () => {
            const first = headerCount === 0;
            headerCount += 1;

            if (first) {
                doc.setFillColor(...navy); doc.rect(0, 0, pageWidth, 31, "F");
                doc.setFillColor(...gold); doc.rect(0, 31, pageWidth, 1.6, "F");
                doc.setFillColor(...gold); doc.roundedRect(margin, 7.5, 14, 14, 2.4, 2.4, "F");
                doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...navy); doc.text("eS", margin + 7, 16.4, { align: "center" });
                doc.setFont("helvetica", "bold"); doc.setFontSize(7.4); doc.setTextColor(...gold); doc.text("DEPARTMENT OF AGRICULTURE", margin + 19, 10.6);
                doc.setFont("helvetica", "normal"); doc.setFontSize(7.6); doc.setTextColor(214, 230, 220); doc.text(`Regional Field Office III - ${municipality}`, margin + 19, 14.8);
                doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(255, 255, 255); doc.text(fit(reportTitle.toUpperCase(), contentWidth - 19, 15, "bold"), margin + 19, 24.2);
                y = 39;
                drawInfoStrip();
            } else {
                doc.setFillColor(...navy); doc.rect(0, 0, pageWidth, 11, "F");
                doc.setFillColor(...gold); doc.rect(0, 11, pageWidth, 0.9, "F");
                doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255); doc.text(fit(`eSaka  |  ${reportTitle}`, contentWidth * 0.7, 8, "bold"), margin, 7.1);
                doc.setFont("helvetica", "normal"); doc.setTextColor(214, 230, 220); doc.text(municipality, pageWidth - margin, 7.1, { align: "right" });
                y = 19;
            }
        };

        const drawFooter = (page, total) => {
            doc.setDrawColor(...gold); doc.setLineWidth(0.6); doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
            doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...navy); doc.text("eSaka", margin, pageHeight - 8.4);
            doc.setFont("helvetica", "normal"); doc.setTextColor(...muted); doc.text(fit(`${municipality}  |  ${reportingPeriod}`, contentWidth - 40, 7), margin + 10, pageHeight - 8.4);
            doc.setFontSize(6.4); doc.text(`Generated ${generatedAt}`, margin, pageHeight - 4.6);
            doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...navy); doc.text(`Page ${page} of ${total}`, pageWidth - margin, pageHeight - 8.4, { align: "right" });
        };

        const newPage = () => { doc.addPage(); drawHeader(); };
        const ensureSpace = height => { if (y + height > bottomLimit) newPage(); };

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

        const isNumericCell = value => { const s = String(value ?? "").trim(); return s !== "" && /^[-+]?[\d.,\s]+(%|kg|days?|intents?)?$/i.test(s); };

   const addTableRows = inputRows => {
    const rows = (inputRows || []).filter(row => Array.isArray(row) && row.some(value => String(value ?? "").trim() !== ""));
    if (!rows.length) return;

    const colCount = Math.max(1, ...rows.map(row => row.length));
    const sample = rows.slice(0, Math.min(rows.length, 20));
    
    // Calculate weights for column widths
    const weights = Array.from({ length: colCount }, (_, col) => {
        const maxLen = Math.max(5, ...sample.map(row => {
            const val = String(row[col] ?? "").trim();
            const words = val.split(/\s+/);
            const longestWord = Math.max(...words.map(w => w.length), 0);
            return Math.max(longestWord, Math.min(val.length, 25));
        }));
        return Math.max(0.55, Math.min(2.2, Math.sqrt(maxLen)));
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map(weight => contentWidth * weight / totalWeight);
    
    const numericCols = Array.from({ length: colCount }, (_, col) => {
        const body = rows.slice(1).map(row => row[col]).filter(v => String(v ?? "").trim() !== "");
        return body.length > 0 && body.every(isNumericCell);
    });

    const drawRow = (row, header, rowIndex) => {
        // ✅ MAS MALIIT NA FONT SIZE (4.5pt para sa data, 5pt para sa header)
        const fontSize = header ? 5.0 : 4.5; 
        
        doc.setFont("helvetica", header ? "bold" : "normal");
        doc.setFontSize(fontSize);
        
        // ✅ MAS MALIIT NA PADDING
        const paddingX = 1.0; 
        const paddingY = 1.0;

        const wrapped = Array.from({ length: colCount }, (_, col) => {
            const cellText = cleanExportText(row[col] ?? "");
            return doc.splitTextToSize(cellText, Math.max(4, widths[col] - (paddingX * 2)));
        });
        
        // Dynamic row height base sa haba ng text
        const lineHeight = fontSize * 0.45;
        const rowHeight = Math.max(header ? 6.0 : 5.0, ...wrapped.map(lines => lines.length * lineHeight + (paddingY * 2)));
        
        if (y + rowHeight > bottomLimit) {
            newPage();
            if (!header) drawRow(rows[0], true, 0);
        }
        
        let x = margin;
        for (let col = 0; col < colCount; col++) {
            const width = widths[col];
            
            // Background color
            if (header) doc.setFillColor(...green);
            else if (rowIndex % 2 === 0) doc.setFillColor(...gray);
            else doc.setFillColor(255, 255, 255);
            doc.rect(x, y, width, rowHeight, "F");
            
            // Border
            doc.setDrawColor(...(header ? gold : rule));
            doc.setLineWidth(header ? 0.5 : 0.15);
            doc.line(x, y + rowHeight, x + width, y + rowHeight);
            
            // Text
            doc.setFont("helvetica", header ? "bold" : "normal");
            doc.setFontSize(fontSize);
            doc.setTextColor(...(header ? [255, 255, 255] : textColor));
            
            const textBlockHeight = wrapped[col].length * lineHeight;
            const textStartY = y + (rowHeight - textBlockHeight) / 2 + lineHeight - 1.0; // Center vertically
            
            if (numericCols[col]) {
                doc.text(wrapped[col] || [""], x + width - paddingX, textStartY, { align: "right" });
            } else {
                doc.text(wrapped[col] || [""], x + paddingX, textStartY);
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
                doc.setFillColor(255, 255, 255); doc.setDrawColor(...rule); doc.setLineWidth(0.3);
                doc.roundedRect(x, top, cardWidth, cardHeight, 1.8, 1.8, "FD");
                doc.setFillColor(...green); doc.roundedRect(x, top, 2.2, cardHeight, 1.1, 1.1, "F");
                doc.setFont("helvetica", "bold"); doc.setFontSize(6.2); doc.setTextColor(...muted); doc.text(fit(label.toUpperCase(), cardWidth - 8, 6.2, "bold"), x + 5, top + 5.2);
                doc.setFont("helvetica", "bold"); doc.setFontSize(13.5); doc.setTextColor(...navy); doc.text(fit(value, cardWidth - 8, 13.5, "bold"), x + 5, top + 12.4);
                if (sub) { doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(...muted); doc.text(fit(sub, cardWidth - 8, 6), x + 5, top + 17.6); }
                if (col === cols - 1 || index === cards.length - 1) y += cardHeight + 3.5;
            });
            y += 2;
        };

        const drawCertificationBlock = () => {
            const blockHeight = 52;
            ensureSpace(blockHeight + 4);
            y += 1;
            const top = y;
            const padding = 7;
            const gap = 16;
            const colWidth = (contentWidth - padding * 2 - gap) / 2;

            doc.setFillColor(...gray); doc.setDrawColor(...rule); doc.setLineWidth(0.25);
            doc.roundedRect(margin, top, contentWidth, blockHeight, 2, 2, "FD");
            doc.setFillColor(...gold); doc.rect(margin + 2, top, contentWidth - 4, 0.9, "F");

            const columns = [
                { x: margin + padding, label: "PREPARED BY", name: preparedByName, line1: positionText, line2: officeText },
                { x: margin + padding + colWidth + gap, label: "RECEIVED BY", name: "", line1: "Provincial Agriculture Office", line2: "Name, position and signature" }
            ];

            columns.forEach(col => {
                const center = col.x + colWidth / 2;
                const lineY = top + 29;
                doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...green); doc.text(col.label, col.x, top + 8);
                doc.setDrawColor(...navy); doc.setLineWidth(0.45); doc.line(col.x, lineY, col.x + colWidth, lineY);
                if (col.name) { doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...navy); doc.text(fit(col.name, colWidth, 9.5, "bold"), center, lineY + 5, { align: "center" }); }
                else { doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...muted); doc.text("Signature over printed name", center, lineY + 4.6, { align: "center" }); }
                doc.setFont("helvetica", "normal"); doc.setFontSize(7.6); doc.setTextColor(...textColor); if (col.line1) doc.text(fit(col.line1, colWidth, 7.6), center, lineY + 9.4, { align: "center" });
                doc.setFontSize(6.8); doc.setTextColor(...muted); if (col.line2) doc.text(fit(col.line2, colWidth, 6.8), center, lineY + 13.4, { align: "center" });
                doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...muted); doc.text("Date:", col.x, top + blockHeight - 4.2);
                doc.setDrawColor(...muted); doc.setLineWidth(0.2); doc.line(col.x + 9, top + blockHeight - 4.6, col.x + colWidth * 0.62, top + blockHeight - 4.6);
            });

            y = top + blockHeight + 4;
            certDrawn = true;
        };

        const walk = node => {
            if (!node || node.nodeType !== 1) return;
            if (node.dataset && node.dataset.certification) { drawCertificationBlock(); return; }
            if (node.classList?.contains("summary-kpi-grid") || node.classList?.contains("summary-seven-grid")) { addKpiCards(node); return; }
            if (node.tagName === "TABLE") { const rows = Array.from(node.querySelectorAll("tr")).map(tr => Array.from(tr.querySelectorAll("th,td")).map(textOf)); addTableRows(rows); return; }
            if (/^H[1-6]$/.test(node.tagName)) {
                const heading = textOf(node).replace(/^\d{1,2}\s*\|\s*/, "");
                if (!heading || /appendix|data consistency notes/i.test(heading)) return;
                ensureSpace(17); y += 2;
                doc.setFillColor(...tint); doc.roundedRect(margin, y - 4.5, contentWidth, 7.4, 1, 1, "F");
                doc.setFillColor(...gold); doc.rect(margin, y - 4.5, 1.9, 7.4, "F");
                doc.setFont("helvetica", "bold"); doc.setFontSize(node.tagName === "H1" || node.tagName === "H2" ? 9.6 : 8.6);
                doc.setTextColor(...navy); doc.text(fit(heading, contentWidth - 9, node.tagName === "H1" || node.tagName === "H2" ? 9.6 : 8.6, "bold"), margin + 5, y + 0.4);
                y += 7.4;
                return;
            }
            if (node.tagName === "P" || node.tagName === "LI" || node.tagName === "BLOCKQUOTE") { addText(textOf(node), { indent: node.tagName === "LI" ? 4 : 0, after: 2 }); return; }
            const directText = Array.from(node.childNodes).filter(child => child.nodeType === 3).map(child => child.textContent).join(" ").replace(/\s+/g, " ").trim();
            if (directText && !node.querySelector("table") && !/appendix|data consistency notes/i.test(directText)) addText(directText, { after: 2 });
            Array.from(node.children).forEach(walk);
        };

        drawHeader();
        walk(clean);

        if (!certDrawn) {
            ensureSpace(17);
            y += 4;
            doc.setFillColor(...tint); doc.roundedRect(margin, y - 4.5, contentWidth, 7.4, 1, 1, "F");
            doc.setFillColor(...gold); doc.rect(margin, y - 4.5, 1.9, 7.4, "F");
            doc.setFont("helvetica", "bold"); doc.setFontSize(9.6); doc.setTextColor(...navy); doc.text("CERTIFICATION", margin + 5, y + 0.4);
            y += 9;
            drawCertificationBlock();
        }

        const pageCount = doc.getNumberOfPages();
        for (let page = 1; page <= pageCount; page++) { doc.setPage(page); drawFooter(page, pageCount); }

        return doc.output("blob");
    }

    /* ---------- downloadPdf wrapper ---------- */

    async function downloadPdf(root, filename, title, signatureInfo = {}) {
        if (!root) { alert("There is no report content to export."); return; }
        try {
            await loadJsPDF();
            const info = daReportCycleInfo();
            const exportTitle = cleanExportText(signatureInfo.title || title || "Regional Report");
            const exportInfo = {
                ...signatureInfo,
                title: exportTitle,
                municipality: cleanExportText(signatureInfo.municipality || info.province || localStorage.getItem("province") || ""),
                preparedBy: cleanExportText(signatureInfo.preparedBy || localStorage.getItem("da_export_prepared_by") || info.name || ""),
                position: cleanExportText(signatureInfo.position || localStorage.getItem("da_export_position") || info.role || "")
            };
            const modal = ensureDaPdfPreviewModal();
            if (daPdfPreviewState.objectUrl) URL.revokeObjectURL(daPdfPreviewState.objectUrl);
            daPdfPreviewState = { root, filename: filename || "regional_report.pdf", title: exportTitle, signatureInfo: exportInfo, blob: null, objectUrl: null };
            document.getElementById("daPdfPreparedBy").value = exportInfo.preparedBy;
            document.getElementById("daPdfPosition").value = exportInfo.position;
            document.getElementById("daPdfPreviewTitle").textContent = `${exportTitle} — PDF Preview`;
            document.getElementById("daPdfPreviewStatus").textContent = "Review the report details, then generate the PDF preview before downloading.";
            modal.style.display = "flex";
        } catch (error) {
            console.error("PDF preview could not be opened", error);
            alert("Could not open the PDF preview. Please refresh the dashboard and try again.");
        }
    }

    /* ---------- Confirmation modal ---------- */

    function ensureDaSummaryExportConfirmationModal() {
        let modal = document.getElementById("daSummaryExportConfirmModal");
        if (modal) return modal;
        modal = document.createElement("div");
        modal.id = "daSummaryExportConfirmModal";
        modal.style.cssText = "display:none;position:fixed;inset:0;z-index:100001;background:rgba(13,25,18,.65);padding:20px;box-sizing:border-box;align-items:center;justify-content:center;";
        modal.innerHTML = `
          <section role="dialog" aria-modal="true" aria-labelledby="daSummaryConfirmTitle" style="background:#fff;color:#202824;width:min(560px,96vw);border-radius:16px;padding:24px;box-shadow:0 20px 70px rgba(0,0,0,.3);">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:12px;">
              <div><h2 id="daSummaryConfirmTitle" style="margin:0;color:#174b36;font-size:21px;">Confirm Summary Export</h2><p id="daSummaryConfirmDescription" style="margin:7px 0 18px;color:#64716a;font-size:13px;">Confirm the reporting period and preparer details before exporting.</p></div>
              <button type="button" id="daSummaryConfirmClose" aria-label="Close confirmation" style="border:0;background:transparent;font-size:26px;cursor:pointer;">×</button>
            </div>
            <div style="background:#f3f7f4;border:1px solid #dce5dd;border-radius:10px;padding:12px;margin-bottom:16px;font-size:13px;line-height:1.7;">
              <label style="display:block;font-size:13px;font-weight:700;margin-bottom:8px;">Report Title <span style="color:#b42318">*</span><input id="daSummaryConfirmReportTitle" type="text" value="Regional Summary Report" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #cbd6ce;border-radius:8px;font:inherit;" /></label>
              <label style="display:block;font-size:13px;font-weight:700;margin-bottom:8px;">Region / Province <span style="color:#b42318">*</span><input id="daSummaryConfirmRegion" type="text" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #cbd6ce;border-radius:8px;font:inherit;" /></label>
                           <div><strong>Reporting period:</strong> <span id="daSummaryConfirmPeriod"></span></div>
              <div><strong>Municipalities:</strong> <span id="daSummaryConfirmMunicipalities"></span></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr;gap:12px;">
              <label style="font-size:13px;font-weight:700;">Prepared by <span style="color:#b42318">*</span><input id="daSummaryConfirmPreparedBy" type="text" autocomplete="name" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;border:1px solid #cbd6ce;border-radius:8px;font:inherit;" /></label>
              <label style="font-size:13px;font-weight:700;">Position <span style="color:#b42318">*</span><input id="daSummaryConfirmPosition" type="text" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;border:1px solid #cbd6ce;border-radius:8px;font:inherit;" /></label>
            </div>
            <p id="daSummaryConfirmError" role="status" style="min-height:18px;margin:8px 0;color:#b42318;font-size:12px;"></p>
            <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
              <button type="button" id="daSummaryConfirmCancel" style="background:#fff;color:#33463b;border:1px solid #cbd6ce;border-radius:8px;padding:11px 15px;font-weight:700;cursor:pointer;">Cancel</button>
              <button type="button" id="daSummaryConfirmProceed" style="background:#245b43;color:#fff;border:0;border-radius:8px;padding:11px 16px;font-weight:700;cursor:pointer;">Confirm & Download</button>
            </div>
          </section>`;
        document.body.appendChild(modal);

        const close = () => { modal.style.display = "none"; };
        document.getElementById("daSummaryConfirmClose").addEventListener("click", close);
        document.getElementById("daSummaryConfirmCancel").addEventListener("click", close);
        modal.addEventListener("click", event => { if (event.target === modal) close(); });
        document.addEventListener("keydown", event => { if (event.key === "Escape" && modal.style.display === "flex") close(); });

        document.getElementById("daSummaryConfirmProceed").addEventListener("click", async () => {
            const preparedBy = document.getElementById("daSummaryConfirmPreparedBy").value.trim();
            const position = document.getElementById("daSummaryConfirmPosition").value.trim();
            const title = document.getElementById("daSummaryConfirmReportTitle").value.trim();
            const municipality = document.getElementById("daSummaryConfirmRegion").value.trim();
            const error = document.getElementById("daSummaryConfirmError");
            if (!title || !municipality || !preparedBy || !position) { error.textContent = "Please complete Report Title, Region / Province, Prepared by, and Position."; return; }
            localStorage.setItem("da_export_report_title", title);
            localStorage.setItem("province", municipality);
            localStorage.setItem("da_export_prepared_by", preparedBy);
            localStorage.setItem("da_export_position", position);

            const signatureInfo = { preparedBy, position, title, municipality };
            const type = modal.dataset.exportType;
            close();

            if (type === "pdf") await exportDaSummaryPdf(signatureInfo);
            else await exportDaSummaryXlsx(signatureInfo);
        });

        return modal;
    }

    function showDaSummaryExportConfirmation(type) {
        const source = document.getElementById("regionalSummaryContent");
        if (!source || !source.innerText.trim()) { alert("The summary has not loaded yet. Please wait for it to finish loading."); return; }

        const modal = ensureDaSummaryExportConfirmationModal();
        const info = daReportCycleInfo();
        const from = document.getElementById("summaryPeriodStart")?.value || "All Time";
        const to = document.getElementById("summaryPeriodEnd")?.value || "All Time";
        modal.dataset.exportType = type;
        document.getElementById("daSummaryConfirmTitle").textContent = type === "pdf" ? "Confirm Summary PDF Export" : "Confirm Summary Excel Export";
        document.getElementById("daSummaryConfirmDescription").textContent = type === "pdf" ? "Confirm the report details, then review the generated PDF preview before downloading." : "Check the reporting period and enter the details that should appear in the exported file.";
        document.getElementById("daSummaryConfirmRegion").value = info.province || "";
        document.getElementById("daSummaryConfirmReportTitle").value = localStorage.getItem("da_export_report_title") || "Regional Summary Report";
              document.getElementById("daSummaryConfirmPeriod").textContent = `${from} to ${to}`;
        const municipalityScope = selectedSummaryMunicipalities.length
            ? selectedSummaryMunicipalities.join(", ")
            : "All municipalities (Pampanga)";
        const muniEl = document.getElementById("daSummaryConfirmMunicipalities");
        if (muniEl) muniEl.textContent = municipalityScope;
        document.getElementById("daSummaryConfirmPreparedBy").value = localStorage.getItem("da_export_prepared_by") || info.name || "";
        document.getElementById("daSummaryConfirmPosition").value = localStorage.getItem("da_export_position") || info.role || "";
        document.getElementById("daSummaryConfirmError").textContent = "";
        document.getElementById("daSummaryConfirmProceed").textContent = type === "pdf" ? "Confirm & Preview PDF" : "Confirm & Download Excel";
        modal.style.display = "flex";
    }

    /* ---------- Model builder for export ---------- */

    function getDaSummaryIntentRows() {
    const source = getFilteredSummaryIntents();
        const value = v => (v === null || v === undefined || String(v).trim() === "" ? "—" : String(v).trim());
        const dateValue = v => { if (!v) return "—"; try { return typeof formatDate === "function" ? formatDate(v) : new Date(v).toLocaleDateString("en-PH"); } catch { return value(v); } };
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

    /* ============================================================
   Shared filter — returns the SAME intents the on-screen summary shows.
   Honors the municipality multi-select (Pampanga-only rule).
============================================================ */
function getFilteredSummaryIntents() {
    const all = (currentSummaryData && Array.isArray(currentSummaryData.intents))
        ? currentSummaryData.intents : [];

    const provinceOf = i => String(
        i.province || i.province_name || i.provinceName || i.provincial_name ||
        i.province?.name || i.municipality?.province || i.municipality?.province_name ||
        i.report?.province || i.report?.province_name || ""
    ).trim();

    const municipalityOf = i => String(
        (typeof i.municipality === "string" ? i.municipality : i.municipality?.name) ||
        i.municipality_name || i.municipalityName || i.city || i.city_name ||
        i.report?.municipality || i.report?.municipality_name || ""
    ).trim();

    let filtered = all.filter(i => {
        const prov = provinceOf(i);
        return prov === "Pampanga" || prov === "";
    });

    if (selectedSummaryMunicipalities.length > 0) {
        filtered = filtered.filter(i => selectedSummaryMunicipalities.includes(municipalityOf(i)));
    }
    return filtered;
}

    function getDaSummaryInsights() {
        const rows = getDaSummaryIntentRows();
        const countBy = key => {
            const counts = new Map();
            rows.forEach(r => { const label = String(key(r) || "Unknown").trim() || "Unknown"; counts.set(label, (counts.get(label) || 0) + 1); });
            return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        };
        const totalPlanned = rows.reduce((sum, r) => sum + r.plannedVolume, 0);
        const totalActual = rows.reduce((sum, r) => sum + r.actualVolume, 0);
        const withVariance = rows.filter(r => r.variance !== "None recorded");
        const varianceCounts = new Map();
        rows.forEach(r => r.variance.split(", ").filter(x => x && x !== "None recorded").forEach(x => varianceCounts.set(x, (varianceCounts.get(x) || 0) + 1)));
        const topVariance = [...varianceCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
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

    function getDaSummaryExportModel(signatureInfo = {}) {
        const source = document.getElementById("regionalSummaryContent");
        const info = daReportCycleInfo();
        const from = document.getElementById("summaryPeriodStart")?.value || "All Time";
        const to = document.getElementById("summaryPeriodEnd")?.value || "All Time";
        const intents = getDaSummaryIntentRows();

                const title = signatureInfo.title || localStorage.getItem("da_export_report_title") || "Regional Summary Report";
        const scopeLabel = selectedSummaryMunicipalities.length
            ? selectedSummaryMunicipalities.join(", ")
            : (signatureInfo.municipality || info.province || currentSummaryData?.province || "Pampanga");
        const municipality = signatureInfo.municipality || scopeLabel;
        const preparedBy = signatureInfo.preparedBy || info.name || "";
        const position = signatureInfo.position || info.role || "";
        const generated = new Date().toLocaleString("en-PH");

               // Compute totals FIRST so we can build the metrics array deterministically.
        const totalPlanned = intents.reduce((sum, row) => sum + (Number(row.plannedVolume) || 0), 0);
        const totalActual = intents.reduce((sum, row) => sum + (Number(row.actualVolume) || 0), 0);
        const uniqueFarmers = new Set(intents.map(row => row.farmer).filter(value => value && value !== "—")).size;
        const harvestedCount = intents.filter(row => String(row.status).toLowerCase().includes("harvested")).length;
        const harvestRate = intents.length ? Math.round(harvestedCount / intents.length * 100) : 0;
        const pendingReports = Number(currentSummaryData?.pending_report_count ?? currentSummaryData?.pending_reports ?? 0);
        const reportCount = Number(currentSummaryData?.report_count ?? new Set(intents.map(row => row.reportId).filter(v => v !== "—")).size);

        // Build the 6 KPI rows deterministically. This avoids "KEY METRIC —" placeholders
        // caused by DOM scraping picking up empty wrapper elements.
        const metrics = [
            ["Metric", "Value", "Details"],
            [" Total Intents",    String(intents.length),    `Across ${reportCount} report${reportCount !== 1 ? "s" : ""}`],
            [" Total Volume",     `${totalPlanned} kg`,      "Planned estimate"],
            [" Unique Farmers",   String(uniqueFarmers),     "Beneficiaries in period"],
            [" Pending Reports",  String(pendingReports),    `${pendingReports === 1 ? "report awaiting your review" : "reports awaiting your review"}`],
            [" Harvested Volume", `${totalActual} kg`,       `${harvestedCount} of ${intents.length} harvested`],
            [" Harvest Rate",     `${harvestRate}%`,         "Completion ratio"]
        ];

        const groupBy = keyFn => {
            const map = new Map();
            intents.forEach(row => {
                const key = String(keyFn(row) || "Unknown").trim() || "Unknown";
                const item = map.get(key) || { count: 0, volume: 0 };
                item.count += 1;
                item.volume += Number(row.plannedVolume) || 0;
                map.set(key, item);
            });
            return [...map.entries()].sort((a, b) => b[1].volume - a[1].volume || a[0].localeCompare(b[0]));
        };

        const commodityRows = [["Commodity", "Count", "Planned Volume"]];
        groupBy(row => row.commodity).forEach(([key, value]) => commodityRows.push([key, value.count, `${value.volume} kg`]));

        const municipalityRows = [["Municipality", "Count", "Planned Volume"]];
        groupBy(row => row.raw?.municipality || row.municipality || "Unknown").forEach(([key, value]) => municipalityRows.push([key, value.count, `${value.volume} kg`]));

        const statusOrder = ["NOT PLANTED", "PLANTED", "HARVESTED", "MEDIATING"];
        const statusLabels = { "NOT PLANTED": "Not Planted", "PLANTED": "Planted", "HARVESTED": "Harvested", "MEDIATING": "Mediating" };
        const statusMap = new Map();
        intents.forEach(row => {
            const key = String(row.status || "Not Planted").toUpperCase();
            const item = statusMap.get(key) || { count: 0, volume: 0 };
            item.count += 1;
            item.volume += Number(row.plannedVolume) || 0;
            statusMap.set(key, item);
        });
        const statusRows = [["Finalized Status", "Count", "Planned Volume"]];
        statusOrder.forEach(key => { const value = statusMap.get(key) || { count: 0, volume: 0 }; statusRows.push([statusLabels[key], value.count, `${value.volume} kg`]); });
        [...statusMap.entries()].filter(([key]) => !statusOrder.includes(key)).forEach(([key, value]) => statusRows.push([key, value.count, `${value.volume} kg`]));

        const shortfall = totalPlanned > 0 ? Math.round((totalPlanned - totalActual) / totalPlanned * 100) : 0;
        const yieldRows = [["Measure", "Value"], ["Expected", `${totalPlanned} kg`], ["Actual", `${totalActual} kg`], ["Shortfall", totalPlanned > 0 ? `${shortfall}%` : "Not calculable"]];

        const dateRange = field => {
            const values = intents.map(row => row.raw?.[field]).filter(Boolean).map(raw => new Date(raw)).filter(date => !Number.isNaN(date.getTime())).sort((a, b) => a - b);
            if (!values.length) return ["—", "—", "—"];
            const fmt = date => typeof formatDate === "function" ? formatDate(date) : date.toLocaleDateString("en-PH");
            return [fmt(values[0]), fmt(values[values.length - 1]), `${Math.round((values[values.length - 1] - values[0]) / 86400000)} days`];
        };
        const windowRows = [["Milestone", "Earliest", "Latest", "Span"], ["Planting", ...dateRange("planting_date")], ["Harvest", ...dateRange("harvest_date")]];

        const intentRows = [["Intent ID", "Report ID", "Report Title", "Farmer", "Commodity", "Barangay", "Planned Volume (kg)", "Actual Harvest (kg)", "Planned Planting", "Actual Planting", "Planned Harvest", "Actual Harvest", "Finalized Status", "Report Status", "Variance Type", "Variance Remark"]];
        intents.forEach(row => {
            intentRows.push([row.intentId, row.reportId, row.reportTitle, row.farmer, row.commodity, row.barangay, row.plannedVolume, row.actualVolume, row.plannedPlanting, row.actualPlanting, row.plannedHarvest, row.actualHarvest, row.status, row.reportStatus, row.variance, row.remark === "—" ? "" : row.remark]);
        });

        const varianceRows = [["Intent ID", "Planned Planting", "Actual Planting", "Planned Harvest", "Actual Harvest", "Variance Type", "Remarks"]];
        intents.forEach(row => varianceRows.push([row.intentId, row.plannedPlanting, row.actualPlanting, row.plannedHarvest, row.actualHarvest, row.variance, row.remark === "—" ? "" : row.remark]));

        const insightRows = getDaSummaryInsights();

        const metadata = [
            ["Reporting Period", `${from} to ${to}`],
            ["Coverage", municipality],
            ["Reports Included", currentSummaryData?.report_count ?? new Set(intents.map(row => row.reportId).filter(value => value !== "—")).size],
            ["Generated", generated],
            ["Prepared by", preparedBy],
            ["Position", position]
        ];

        const reportSections = [
            { key: "kpis", title: "02 | KPI DASHBOARD", rows: metrics },
            { key: "metadata", title: "03 | REPORT METADATA", rows: [["Field", "Value"], ...metadata] },
            { key: "commodity", title: "04 | BY COMMODITY", rows: commodityRows },
            { key: "municipality", title: "05 | BY MUNICIPALITY", rows: municipalityRows },
            { key: "status", title: "06 | BY FINALIZED STATUS", rows: statusRows },
            { key: "yield", title: "07 | YIELD PERFORMANCE", rows: yieldRows },
            { key: "window", title: "08 | PLANTING & HARVEST WINDOW", rows: windowRows },
            { key: "insights", title: "09 | COMMON FINDINGS AND CYCLE INSIGHTS", rows: insightRows },
            { key: "intents", title: `10 | INDIVIDUAL INTENT RECORDS (${intents.length})`, rows: intentRows },
            { key: "variance", title: "11 | PLANTING, HARVEST, AND VARIANCE DETAILS", rows: varianceRows },
            { key: "certification", title: "12 | CERTIFICATION BLOCK", rows: [["Field", "Details"], ["Prepared by", preparedBy || ""], ["Received by / Date", "Regional Agriculture Office"]] }
        ];

        return { source, from, to, title, municipality, preparedBy, position, generated, intents, metrics, metadata, commodityRows, municipalityRows, statusRows, yieldRows, windowRows, insightRows, intentRows, varianceRows, reportSections };
    }

    /* ---------- Yield helpers (used by getDaSummaryIntentRows) ---------- */

    function isIntentDateVariance(plan, actual) { if (!plan || !actual) return false; return String(plan).slice(0, 10) !== String(actual).slice(0, 10); }
    function getDayDiff(plannedDate, actualDate) {
        if (!plannedDate || !actualDate) return null;
        const p = new Date(`${String(plannedDate).slice(0, 10)}T00:00:00`);
        const a = new Date(`${String(actualDate).slice(0, 10)}T00:00:00`);
        if (isNaN(p.getTime()) || isNaN(a.getTime())) return null;
        return Math.round((a - p) / 86400000);
    }
    function getVarianceRemark(intent) { return String((intent && (intent.comment_snapshot || intent.comment)) || "").trim(); }
    function getIntentVariances(intent) {
        const out = [];
        if (isIntentDateVariance(intent.planting_date, intent.actual_planting_date)) out.push({ label: "Planting", planned: intent.planting_date, actual: intent.actual_planting_date, diff: getDayDiff(intent.planting_date, intent.actual_planting_date) });
        if (isIntentDateVariance(intent.harvest_date, intent.actual_harvest_date)) out.push({ label: "Harvest", planned: intent.harvest_date, actual: intent.actual_harvest_date, diff: getDayDiff(intent.harvest_date, intent.actual_harvest_date) });
        return out;
    }

    /* ---------- PDF export ---------- */

    async function exportDaSummaryPdf(signatureInfo = {}) {
        const source = document.getElementById("regionalSummaryContent");
        if (!source || !source.innerText.trim()) { alert("The summary has not loaded yet. Please wait for it to finish loading."); return; }

        const from = document.getElementById("summaryPeriodStart")?.value || "All Time";
        const to = document.getElementById("summaryPeriodEnd")?.value || "All Time";
        const model = getDaSummaryExportModel(signatureInfo);

        const root = document.createElement("div");
        root.style.cssText = "width:100%;font-family:Arial,sans-serif;color:#262626;font-size:10px;line-height:1.35;";

        const makeSection = (headingText, rows, isCertification = false) => {
            const section = document.createElement("section");
            section.style.cssText = "margin:8px 0 13px;page-break-inside:avoid;";
            const heading = document.createElement("h3");
            heading.textContent = headingText;
            heading.style.cssText = "font-size:11px;font-weight:700;color:#0B382A;margin:8px 0 5px;padding-bottom:4px;border-bottom:1px solid #EAB308;";
            section.appendChild(heading);
            if (isCertification) {
                const certEl = document.createElement("div");
                certEl.dataset.certification = "1";
                certEl.textContent = "Certification";
                section.appendChild(certEl);
            } else {
                const table = document.createElement("table");
                table.style.cssText = "width:100%;border-collapse:collapse;font-size:8px;margin:5px 0 9px;";
                (rows || []).forEach((row, rowIndex) => {
                    const tr = document.createElement("tr");
                    row.forEach(value => {
                        const cell = document.createElement(rowIndex === 0 ? "th" : "td");
                        cell.textContent = cleanExportText(value);
                        cell.style.cssText = `border:1px solid #BFBFBF;padding:4px;text-align:left;vertical-align:top;` + (rowIndex === 0 ? "background:#0B382A;color:#FFFFFF;font-weight:700;" : rowIndex % 2 === 0 ? "background:#EEF4F0;color:#262626;" : "background:#FFFFFF;color:#262626;");
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
        kpiGrid.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0 12px;";
        model.metrics.slice(1, 7).forEach(row => {
            const card = document.createElement("div");
            card.className = "summary-kpi-card";
            card.style.cssText = "border:1px solid #0B382A;border-left:4px solid #EAB308;padding:7px;background:#FFFFFF;min-height:48px;";
            const label = document.createElement("div");
            label.className = "summary-kpi-label";
            label.textContent = row[0] || "Metric";
            label.style.cssText = "font-size:7px;color:#0B382A;font-weight:700;";
            const value = document.createElement("strong");
            value.className = "summary-kpi-value";
            value.textContent = row[1] || "—";
            value.style.cssText = "display:block;font-size:13px;color:#0B382A;margin:3px 0;";
            const sub = document.createElement("small");
            sub.className = "summary-kpi-subtext";
            sub.textContent = row[2] || "";
            sub.style.cssText = "font-size:6px;color:#595959;";
            card.append(label, value, sub);
            kpiGrid.appendChild(card);
        });

        const kpiHeading = document.createElement("h3");
        kpiHeading.textContent = "KPI Dashboard";
        kpiHeading.style.cssText = "font-size:11px;font-weight:700;color:#0B382A;margin:7px 0 4px;";
        root.append(kpiHeading, kpiGrid);

        model.reportSections.filter(section => section.key !== "kpis").forEach(section => {
            makeSection(section.title, section.rows, section.key === "certification");
        });

             const scopeSlug = selectedSummaryMunicipalities.length
            ? selectedSummaryMunicipalities.map(m => m.replace(/\s+/g, "_")).join("-")
            : "all-municipalities";
        await downloadPdf(root, `da_regional_summary_${scopeSlug}_${from}_${to}.pdf`, model.title, { ...signatureInfo, municipality: model.municipality, reportingPeriod: `${from} to ${to}` });
    }

    /* ---------- Excel export ---------- */

    function buildDaSummaryWorkbook(ExcelJS, model) {
        const C = { primary: "FF0B382A", secondary: "FF14532D", gold: "FFEAB308", tint: "FFE3EEE7", zebra: "FFF3F7F4", line: "FFDCE5DD", ink: "FF202824", muted: "FF5F6B64", white: "FFFFFFFF", amber: "FF9A5A00", amberTint: "FFFEF3C7", good: "FF17603A", blue: "FF1F5F8B" };
        const solid = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
        const thin = argb => ({ style: "thin", color: { argb } });

        const subtitle = `Regional Field Office III - ${model.municipality} | Reporting period: ${model.from} to ${model.to} | Generated: ${model.generated}`;
        const officeText = `Department of Agriculture, Regional Field Office III, ${model.municipality}`;
        const intents = Array.isArray(model.intents) ? model.intents : [];

        const wb = new ExcelJS.Workbook();
        wb.creator = "eSaka Regional Agriculture";
        wb.title = model.title;
        wb.subject = model.title;
        wb.created = new Date();
        wb.modified = new Date();

        const num = v => Number(v) || 0;
        const blank = v => (v === null || v === undefined || v === "—" ? "" : v);
        const toDate = v => { if (!v) return null; const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); const d = new Date(v); return Number.isNaN(d.getTime()) ? null : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };
        const dayDiff = (a, b) => (a && b ? Math.round((b - a) / 86400000) : "");

        const newSheet = (name, tabColor, heading, lastCol, widths, landscape = true) => {
            const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: tabColor } }, views: [{ showGridLines: false }] });
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
            ws.pageSetup = { orientation: landscape ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
            ws.headerFooter = { oddFooter: "&LeSaka | Regional Field Office III&CPrepared by " + (model.preparedBy || "") + "&RPage &P of &N" };
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
                    if (o.statusCols && o.statusCols.includes(ci)) { const f = statusFont(typeof v === "object" && v ? v.result : v); if (f) c.font = f; }
                });
                ws.getRow(r).height = o.rowHeight || 21;
            });
            const lastRow = headerRow + rows.length;
            if (o.totals && rows.length) {
                const tr = lastRow + 1;
                headers.forEach((_, i) => { const c = ws.getCell(tr, i + 1); c.fill = solid(C.tint); c.font = { bold: true, size: 10, color: { argb: C.primary } }; c.alignment = { vertical: "middle", horizontal: align[i] || "left" }; c.border = { top: thin(C.secondary), bottom: { style: "medium", color: { argb: C.gold } } }; });
                ws.getCell(tr, 1).value = "TOTAL";
                o.totals.forEach(ci => { const L = ws.getColumn(ci + 1).letter; const c = ws.getCell(tr, ci + 1); c.value = { formula: `SUM(${L}${headerRow + 1}:${L}${lastRow})`, result: rows.reduce((s, row) => s + num(row[ci]), 0) }; if (o.numFmt && o.numFmt[ci]) c.numFmt = o.numFmt[ci]; });
                ws.getRow(tr).height = 24;
            }
            return { headerRow, firstRow: headerRow + 1, lastRow };
        };

        const VOL = "#,##0.00";
        const DATE = "dd mmm yyyy";
        const DELTA = "+0;-0;0";
        const PCT = "0.0%";
        const rowsFor = {};

        // OVERVIEW
        const ov = newSheet("Overview", C.primary, "SUMMARY OVERVIEW", 4, [32, 34, 48, 14], false);
        let r = 5;
        sectionHeading(ov, r, 4, "KEY METRICS");
        r += 1;
        const metricRows = (model.metrics || []).slice(1).map(m => [m[0], m[1], m[2] || ""]);
        const mt = writeTable(ov, r, ["Metric", "Value", "Details"], metricRows, { align: { 1: "right" }, rowHeight: 22 });
        r = mt.lastRow + 2;

        sectionHeading(ov, r, 4, "REPORT DETAILS");
        r += 1;
        const detailRows = [["Region / Province", model.municipality], ["Office", officeText], ["Reporting period", `${model.from} to ${model.to}`], ["Reports included", (model.metadata.find(m => m[0] === "Reports Included") || [])[1] ?? ""], ["Individual intents", intents.length], ["Prepared by", model.preparedBy || ""], ["Position", model.position || ""], ["Generated", model.generated]];
        const dt = writeTable(ov, r, ["Field", "Value"], detailRows, { rowHeight: 20 });
        r = dt.lastRow + 2;
        const indexAnchorRow = r;

        // INTENTS
        const intentHeaders = ["Intent ID", "Report ID", "Report Title", "Farmer", "Commodity", "Barangay", "Planned Volume (kg)", "Actual Harvest (kg)", "Volume Var. %", "Planned Planting", "Actual Planting", "Planting Diff. (days)", "Planned Harvest", "Actual Harvest", "Harvest Diff. (days)", "Finalized Status", "Report Status", "Variance Type", "Remarks"];
        const it = newSheet("Intents", C.secondary, `INDIVIDUAL INTENT RECORDS (${intents.length})`, intentHeaders.length, [10, 10, 28, 24, 16, 18, 14, 14, 11, 14, 14, 12, 14, 14, 12, 16, 22, 18, 46]);
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
                { formula: `IF(OR(H${rr}="",G${rr}=0),"",(H${rr}-G${rr})/G${rr})`, result: num(row.actualVolume) > 0 && num(row.plannedVolume) > 0 ? (num(row.actualVolume) - num(row.plannedVolume)) / num(row.plannedVolume) : "" },
                pp || "", ap || "", { formula: `IF(OR(J${rr}="",K${rr}=""),"",K${rr}-J${rr})`, result: dayDiff(pp, ap) },
                ph || "", ah || "", { formula: `IF(OR(M${rr}="",N${rr}=""),"",N${rr}-M${rr})`, result: dayDiff(ph, ah) },
                blank(row.status), blank(row.reportStatus),
                row.variance === "None recorded" ? "" : blank(row.variance),
                row.remark === "—" ? "" : blank(row.remark)
            ];
        });
        writeTable(it, IH, intentHeaders, intentRows, { align: { 0: "center", 1: "center", 6: "right", 7: "right", 8: "right", 9: "center", 10: "center", 11: "center", 12: "center", 13: "center", 14: "center" }, numFmt: { 6: VOL, 7: VOL, 8: PCT, 9: DATE, 10: DATE, 11: DELTA, 12: DATE, 13: DATE, 14: DELTA }, statusCols: [15, 16], totals: [6, 7], rowHeight: 22 });
        intentRows.forEach((row, i) => {
            const rr = IH + 1 + i;
            if (row[17]) { const c = it.getCell(rr, 18); c.fill = solid(C.amberTint); c.font = { bold: true, size: 10, color: { argb: C.amber } }; }
            [12, 15].forEach(col => { const res = row[col - 1] && row[col - 1].result; if (res !== "" && res !== undefined && res !== 0) it.getCell(rr, col).font = { bold: true, size: 10, color: { argb: C.amber } }; });
        });
        if (intentRows.length) it.autoFilter = { from: { row: IH, column: 1 }, to: { row: IH + intentRows.length, column: intentHeaders.length } };
        else { it.mergeCells(IH + 1, 1, IH + 1, 8); it.getCell(IH + 1, 1).value = "No intents found for the selected period and filters."; it.getCell(IH + 1, 1).font = { italic: true, color: { argb: C.muted } }; }
        it.views = [{ state: "frozen", xSplit: 1, ySplit: IH, showGridLines: false }];
        rowsFor["Intents"] = intentRows.length;

        // DATE VARIANCES
        const varHeaders = ["Intent ID", "Farmer", "Commodity", "Barangay", "Variance Type", "Planned Planting", "Actual Planting", "Planting Diff. (days)", "Planned Harvest", "Actual Harvest", "Harvest Diff. (days)", "Remarks"];
        const vsheet = newSheet("Date Variances", C.gold, "DATE VARIANCES AND REMARKS", varHeaders.length, [10, 24, 16, 18, 18, 14, 14, 12, 14, 14, 12, 60]);
        const withVariance = intents.filter(row => row.variance !== "None recorded" || (row.remark && row.remark !== "—"));
        if (withVariance.length) {
            const VH = 5;
            const vRows = withVariance.map((row, i) => {
                const rr = VH + 1 + i;
                const raw = row.raw || {};
                const pp = toDate(raw.planting_date), ap = toDate(raw.actual_planting_date);
                const ph = toDate(raw.harvest_date), ah = toDate(raw.actual_harvest_date);
                const idNum = Number(row.intentId);
                return [Number.isFinite(idNum) && String(row.intentId).trim() !== "" ? idNum : blank(row.intentId), blank(row.farmer), blank(row.commodity), blank(row.barangay), row.variance === "None recorded" ? "" : blank(row.variance), pp || "", ap || "", { formula: `IF(OR(F${rr}="",G${rr}=""),"",G${rr}-F${rr})`, result: dayDiff(pp, ap) }, ph || "", ah || "", { formula: `IF(OR(I${rr}="",J${rr}=""),"",J${rr}-I${rr})`, result: dayDiff(ph, ah) }, row.remark === "—" ? "" : blank(row.remark)];
            });
            writeTable(vsheet, VH, varHeaders, vRows, { align: { 0: "center", 5: "center", 6: "center", 7: "center", 8: "center", 9: "center", 10: "center" }, numFmt: { 5: DATE, 6: DATE, 7: DELTA, 8: DATE, 9: DATE, 10: DELTA }, rowHeight: 30 });
            vRows.forEach((row, i) => { const rr = VH + 1 + i; const c = vsheet.getCell(rr, 5); if (row[4]) { c.fill = solid(C.amberTint); c.font = { bold: true, size: 10, color: { argb: C.amber } }; } });
            vsheet.autoFilter = { from: { row: VH, column: 1 }, to: { row: VH + vRows.length, column: varHeaders.length } };
            vsheet.views = [{ state: "frozen", ySplit: VH, showGridLines: false }];
        } else { vsheet.mergeCells(5, 1, 5, 8); vsheet.getCell(5, 1).value = "No date variances or variance remarks were recorded for this period."; vsheet.getCell(5, 1).font = { italic: true, color: { argb: C.muted } }; }
        rowsFor["Date Variances"] = withVariance.length;

        // GROUPED SHEETS
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
            const rows = entries.map(([k, v]) => [k, v.count, v.farmers.size, v.planned, v.actual > 0 ? v.actual : 0, totalPlanned > 0 ? v.planned / totalPlanned : 0]);
            writeTable(ws, 5, [label, "Intents", "Farmers", "Planned Volume (kg)", "Actual Harvest (kg)", "Share of Volume"], rows, { align: { 1: "center", 2: "center", 3: "right", 4: "right", 5: "right" }, numFmt: { 3: VOL, 4: VOL, 5: PCT }, totals: [1, 3, 4, 5] });
            ws.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
            rowsFor[name] = rows.length;
            return ws;
        };
        groupSheet("By Commodity", "Commodity", aggregate(row => row.commodity), C.secondary);
        groupSheet("By Municipality", "Municipality", aggregate(row => row.raw?.municipality || row.municipality || "Unknown"), C.secondary);

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

        // YIELD AND WINDOW
        const yw = newSheet("Yield and Window", C.secondary, "YIELD PERFORMANCE AND PLANTING WINDOW", 4, [32, 20, 20, 18], false);
        sectionHeading(yw, 5, 4, "YIELD PERFORMANCE");
        const yRows = [["Expected (planned volume, kg)", totalPlanned], ["Actual (harvested volume, kg)", totalActual], ["Variance vs. plan (negative = shortfall)", ""]];
        const yT = writeTable(yw, 6, ["Measure", "Value"], yRows, { align: { 1: "right" }, numFmt: { 1: VOL } });
        const yVar = yw.getCell(yT.lastRow, 2);
        yVar.value = { formula: `IF(B${yT.firstRow}=0,"",(B${yT.firstRow + 1}-B${yT.firstRow})/B${yT.firstRow})`, result: totalPlanned > 0 ? (totalActual - totalPlanned) / totalPlanned : "" };
        yVar.numFmt = PCT;
        yVar.font = { bold: true, size: 10, color: { argb: totalActual >= totalPlanned ? C.good : C.amber } };
        sectionHeading(yw, yT.lastRow + 2, 4, "PLANTING AND HARVEST WINDOW");
        const range = field => { const ds = intents.map(row => toDate(row.raw && row.raw[field])).filter(Boolean).sort((a, b) => a - b); return ds.length ? [ds[0], ds[ds.length - 1]] : ["", ""]; };
        const wH = yT.lastRow + 3;
        const wRows = [["Planting", ...range("planting_date"), ""], ["Harvest", ...range("harvest_date"), ""]];
        const wT = writeTable(yw, wH, ["Milestone", "Earliest", "Latest", "Span (days)"], wRows, { align: { 1: "center", 2: "center", 3: "center" }, numFmt: { 1: DATE, 2: DATE, 3: "0" } });
        for (let rr = wT.firstRow; rr <= wT.lastRow; rr++) { const vals = wRows[rr - wT.firstRow]; yw.getCell(rr, 4).value = { formula: `IF(OR(B${rr}="",C${rr}=""),"",C${rr}-B${rr})`, result: vals[1] && vals[2] ? Math.round((vals[2] - vals[1]) / 86400000) : "" }; yw.getCell(rr, 4).numFmt = "0"; }
        rowsFor["Yield and Window"] = 2;

        // INSIGHTS
        const ins = newSheet("Insights", C.secondary, "COMMON FINDINGS AND CYCLE INSIGHTS", 3, [40, 40, 16], false);
        const insRows = (model.insightRows || []).slice(1).map(row => [row[0], row[1], row[2]]);
        writeTable(ins, 5, ["Insight", "Finding", "Count / Value"], insRows, { align: { 2: "right" }, rowHeight: 22 });
        rowsFor["Insights"] = insRows.length;

        // CERTIFICATION
        const cs = newSheet("Certification", C.gold, "CERTIFICATION", 3, [44, 8, 44], false);
        sectionHeading(cs, 5, 3, "SIGN-OFF");
        const sigBlock = (col, label, name, line1, line2) => {
            const lab = cs.getCell(7, col); lab.value = label; lab.font = { bold: true, size: 9, color: { argb: C.secondary } }; lab.alignment = { horizontal: "left", vertical: "middle" };
            const sig = cs.getCell(8, col); sig.border = { bottom: { style: "medium", color: { argb: C.primary } } };
            const nm = cs.getCell(9, col); nm.value = name || "Signature over printed name"; nm.font = name ? { bold: true, size: 11, color: { argb: C.primary } } : { italic: true, size: 9, color: { argb: C.muted } }; nm.alignment = { horizontal: "center", vertical: "middle" };
            const l1 = cs.getCell(10, col); l1.value = line1 || ""; l1.font = { size: 10, color: { argb: C.ink } }; l1.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
            const l2 = cs.getCell(11, col); l2.value = line2 || ""; l2.font = { size: 9, color: { argb: C.muted } }; l2.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
            const dl = cs.getCell(13, col); dl.value = "Date:"; dl.font = { size: 9, color: { argb: C.muted } }; dl.border = { bottom: thin(C.muted) }; dl.alignment = { horizontal: "left", vertical: "bottom" };
        };
        sigBlock(1, "PREPARED BY", model.preparedBy || "", model.position || "", officeText);
        sigBlock(3, "RECEIVED BY", "", "Provincial Agriculture Office", "Name, position and signature");
        cs.getRow(7).height = 22; cs.getRow(8).height = 56; cs.getRow(9).height = 22; cs.getRow(10).height = 20; cs.getRow(11).height = 20; cs.getRow(13).height = 26;

        // OVERVIEW: workbook index
        sectionHeading(ov, indexAnchorRow, 4, "WORKBOOK CONTENTS");
        const tabs = [["Intents", "One row per planting intent with dates, volumes, status and live variance formulas", rowsFor["Intents"]], ["Date Variances", "Intents whose actual dates differ from plan, with the recorded remarks", rowsFor["Date Variances"]], ["By Commodity", "Intent count, farmers and volume per commodity", rowsFor["By Commodity"]], ["By Municipality", "Intent count, farmers and volume per municipality", rowsFor["By Municipality"]], ["By Status", "Breakdown by finalized status", rowsFor["By Status"]], ["Yield and Window", "Planned versus actual yield and the planting/harvest window", rowsFor["Yield and Window"]], ["Insights", "Most common commodity, municipality, status and variance type", rowsFor["Insights"]], ["Certification", "Prepared by / Received by sign-off", ""]];
        const ixT = writeTable(ov, indexAnchorRow + 1, ["Tab", "Description", "", "Rows"], tabs.map(t => [t[0], t[1], "", t[2]]), { align: { 3: "center" }, rowHeight: 20 });
        for (let rr = ixT.firstRow; rr <= ixT.lastRow; rr++) {
            const name = tabs[rr - ixT.firstRow][0];
            const c = ov.getCell(rr, 1);
            c.value = { text: name, hyperlink: `#'${name}'!A1` };
            c.font = { size: 10, bold: true, underline: true, color: { argb: C.secondary } };
            ov.mergeCells(rr, 2, rr, 3);
        }
        ov.mergeCells(ixT.headerRow, 2, ixT.headerRow, 3);

        wb.views = [{ activeTab: 0 }];
        return wb;
    }

    async function exportDaSummaryXlsx(signatureInfo = {}) {
        const source = document.getElementById("regionalSummaryContent");
        if (!source || !source.innerText.trim()) { alert("The summary has not loaded yet. Please wait for it to finish loading."); return; }

               const model = getDaSummaryExportModel(signatureInfo);
        const scopeSlug = selectedSummaryMunicipalities.length
            ? selectedSummaryMunicipalities.map(m => m.replace(/\s+/g, "_")).join("-")
            : "all-municipalities";
        const filename = `da_regional_summary_${scopeSlug}_${model.from}_${model.to}.xlsx`;

        let ExcelJS;
        try { ExcelJS = await loadExcelJS(); }
        catch (error) {
            console.warn("ExcelJS unavailable; using basic workbook fallback.", error);
            alert("Could not load the Excel library. Please check your internet connection and try again.");
            return;
        }

        try {
            const wb = buildDaSummaryWorkbook(ExcelJS, model);
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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

    /* ---------- Expose the new API on window ---------- */

    window.showDaSummaryExportConfirmation = showDaSummaryExportConfirmation;
    window.exportDaSummaryPdf = exportDaSummaryPdf;
    window.exportDaSummaryXlsx = exportDaSummaryXlsx;

})();


/* ============================================================
   DA-RFO SELECTED REPORT EXPORTS (kept from original)
   These are separate from the summary exports and unchanged.
============================================================ */

function daSelectedReportRows() {
    const view = document.getElementById("view-reports");
    if (!view) return [];
    return [...view.querySelectorAll("tbody tr")].filter(tr => {
        const cb = tr.querySelector('input[type="checkbox"]');
        return cb && cb.checked && cb.id !== "selectAllCheckbox";
    });
}

async function exportDaSelectedReports(type) {
    const rows = daSelectedReportRows();
    if (!rows.length) { alert("Select one or more reports in the Reports tab first."); return; }

    const tableHead = rows[0].closest("table")?.querySelector("thead tr");
    const headers = tableHead ? [...tableHead.querySelectorAll("th,td")].map(c => c.innerText.trim()) : [...rows[0].querySelectorAll("th,td")].map(c => c.innerText.trim());

    if (type === "xlsx") {
        try {
            if (typeof XLSX === "undefined") throw new Error("Excel export library is unavailable.");
            const aoa = [headers, ...rows.map(r => [...r.querySelectorAll("th,td")].map(c => c.innerText.trim()))];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Selected Reports");
            XLSX.writeFile(wb, `DA-RFO_Selected_Reports_${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (e) { alert(e.message || "Unable to export selected reports."); }
        return;
    }

    try {
        if (typeof html2pdf === "undefined") throw new Error("PDF export library is unavailable.");
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "padding:24px;font-family:Arial,sans-serif;color:#17251d;background:white";
        wrapper.innerHTML = `<div style="text-align:center;border-bottom:3px solid #0b382a;padding-bottom:12px;margin-bottom:16px"><h2 style="color:#0b382a;margin:0">DA-RFO Selected Reports</h2><p style="font-size:12px">Generated ${new Date().toLocaleString()}</p></div>`;
        const table = document.createElement("table");
        table.style.cssText = "width:100%;border-collapse:collapse;font-size:10px";
        rows.forEach((r, i) => {
            const tr = document.createElement("tr");
            [...r.querySelectorAll("th,td")].forEach(c => {
                const cell = document.createElement(i === 0 ? "th" : "td");
                cell.textContent = c.innerText.trim();
                cell.style.cssText = "border:1px solid #cfd8d3;padding:6px;text-align:left";
                if (i === 0) cell.style.background = "#e3eee7";
                tr.appendChild(cell);
            });
            table.appendChild(tr);
        });
        wrapper.appendChild(table);
        await html2pdf().set({ margin: 8, filename: `DA-RFO_Selected_Reports_${new Date().toISOString().slice(0, 10)}.pdf`, image: { type: "jpeg", quality: 0.98 }, html2canvas: { scale: 2, backgroundColor: "#fff" }, jsPDF: { unit: "mm", format: "a4", orientation: "landscape" } }).from(wrapper).save();
    } catch (e) { alert(e.message || "Unable to export selected reports."); }
}


/* ============================================================
   initDaSummaryExports — wired to the new system
============================================================ */

function initDaSummaryExports() {
    document.getElementById("exportSummaryPdfBtn")?.addEventListener("click", () => {
        window.showDaSummaryExportConfirmation("pdf");
    });
    document.getElementById("exportSummaryXlsxBtn")?.addEventListener("click", () => {
        window.showDaSummaryExportConfirmation("xlsx");
    });
    document.getElementById("exportSelectedPdfBtn")?.addEventListener("click", () => exportDaSelectedReports("pdf"));
    document.getElementById("exportSelectedXlsxBtn")?.addEventListener("click", () => exportDaSelectedReports("xlsx"));
}

/* ============================================================
   END OF da.js
============================================================ */
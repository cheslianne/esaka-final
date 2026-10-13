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
let daDashboardData = null;

/* ---------- PAGINATION STATE (7 items per page) ---------- */
const ITEMS_PER_PAGE = 7;
const ALERTS_PER_PAGE = 4;   // alert cards are taller, so 4 per page

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
            const avatarBox = document.querySelector(".topbar .avatar");
            if (avatarBox) {
                avatarBox.innerHTML = '<img src="' + savedAvatar + '" alt="Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover; display:block;">';
                avatarBox.style.background = "transparent";
            }
        }
    }

    loadSavedProfile();

    // Open profile modal
    openProfileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const currentName = document.getElementById("userDisplayName")?.textContent || "";
        const nameParts = currentName.trim().split(" ").filter(Boolean);

        if (profileFirstName) profileFirstName.value = nameParts[0] || "";
        if (profileLastName) profileLastName.value = nameParts.slice(1).join(" ") || "";

        if (profileUsername) {
            profileUsername.value = localStorage.getItem("username") || localStorage.getItem("user_id") || "darfo_user_01";
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

    // Close modal button
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
    loadUserInformation();
    initProfileModal();
     initMarketUploadSection();

    // ETL Pipeline
    initializeETLSearch();
    const manualRunBtn = document.getElementById("manualRunBtn");
    if (manualRunBtn) {
        manualRunBtn.addEventListener("click", manualRunETL);
    }
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
        if (target) {
            target.click();
        } else {
            console.error(`Unable to open DA review view: ${targetView}`);
        }
    });
}

function escapeDaHtml(value) {
    return String(value ?? "—").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
}

function renderDaDashboard(data) {
    const kpis = data.kpis || {};
    const set = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    const formatValue = (value, suffix = "") => {
        const number = Number(value ?? 0);
        return `${number.toLocaleString()}${suffix}`.trim();
    };

    const normalizeRefresh = (value) => {
        if (!value) return "—";
        const str = String(value).trim();
        if (!str || str === "null" || str === "undefined") return "—";
        return str.replace("T", " ").replace("Z", " UTC");
    };

    const normalizeDateOnly = (value) => {
        if (!value) return "—";
        const str = String(value).trim();
        if (!str || str === "null" || str === "undefined") return "—";
        const dateMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
        return dateMatch ? dateMatch[1] : str;
    };

    const titleCase = (value) => {
        const str = String(value ?? "").replace(/[_-]+/g, " ").trim();
        if (!str) return "—";
        return str.replace(/\b\w/g, char => char.toUpperCase());
    };

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
                const forecastRange = item.forecast_low == null
                    ? "Forecast unavailable"
                    : `Forecast band: ₱${Number(item.forecast_low).toFixed(2)}–₱${Number(item.forecast_high).toFixed(2)}`;
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
        const municipalities = Array.isArray(data.planting_intents_by_municipality)
            ? data.planting_intents_by_municipality : [];
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
                const description = item.description
                    ? `<p>${escapeDaHtml(item.description)}</p>`
                    : "";
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
    // Priority: user_display_name > username > name > full_name
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

    // Show avatar image if saved, otherwise show initials
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
            setTimeout(function () {
                if (mapInstance) mapInstance.invalidateSize();
            }, 300);
        }, 100);
    });

    sidebar.addEventListener("mouseleave", function () {
        hoverTimer = setTimeout(function () {
            sidebar.classList.remove("open");
        }, 200);
    });

    sidebar.addEventListener("mouseenter", function () {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    });

    document.addEventListener("click", function (event) {
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnHamburger = hamburgerBtn.contains(event.target);
        if (!isClickInsideSidebar && !isClickOnHamburger) {
            sidebar.classList.remove("open");
        }
    });

    sidebar.querySelectorAll(".nav-item").forEach(function (item) {
        item.addEventListener("click", function () {
            sidebar.classList.remove("open");
        });
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

            if (targetViewKey === "map" && mapInstance) {
                setTimeout(() => mapInstance.invalidateSize(), 100);
            }

            if (targetViewKey === "dashboard") loadDaDashboard();
            if (targetViewKey === "buyer-registry") loadBuyerRegistry();
            if (targetViewKey === "reports") loadReports();
            if (targetViewKey === "summary") loadRegionalSummary();
            if (targetViewKey === "etl") loadETLRunLogs();
            if (targetViewKey === "market-price");
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

        // Attach filter listeners
        document.getElementById('filterCommodity')?.addEventListener('change', renderFilteredMapMarkers);
        document.getElementById('filterStatus')?.addEventListener('change', renderFilteredMapMarkers);

    } catch (error) {
        console.error("Failed to load DA-RFO municipality map data:", error);
    }
}

function renderFilteredMapMarkers() {
    if (!mapInstance) return;

    if (mapMarkersLayer) {
        mapInstance.removeLayer(mapMarkersLayer);
    }

    mapMarkersLayer = L.layerGroup().addTo(mapInstance);
    const markerIndex = {};

    const selectedCommodity = document.getElementById('filterCommodity')?.value || 'all';
    const selectedStatus = document.getElementById('filterStatus')?.value
        || window.mapPanelStatusFilter
        || 'all';

    MUNICIPALITY_MAP_RAW_DATA.forEach(municipalityData => {
        const municipality = municipalityData.municipality;
        const baseCoordinates = municipalityCoordinates[municipality];

        if (!baseCoordinates || !municipalityData.commodities) return;

        const filteredCommodities = municipalityData.commodities.filter(item => {
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
                    <strong>Municipality:</strong> ${escapeHtml(municipality)}
                    <br><br>
                    <strong>Commodity:</strong> ${escapeHtml(commodity)}
                    <br>
                    <strong>Status:</strong> <span style="font-weight:700; color:${markerColor};">${escapeHtml(status || 'NO DATA')}</span>
                </div>
            `;

            const marker = L.marker(markerCoordinates, { icon: customIcon })
                .addTo(mapMarkersLayer)
                .bindPopup(popupContent);
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
            showSuccessModal({
                title: "Error",
                message: "No buyer application selected.",
                icon: "⚠",
                iconBg: "#FEE2E2",
                titleColor: "#C0392B",
            });
            return;
        }
        document.getElementById("confirmApproveModal")?.classList.add("show");
    });

    document.getElementById("rejectBuyerBtn")?.addEventListener("click", () => {
        if (!currentSelectedBuyer) {
            showSuccessModal({
                title: "Error",
                message: "No buyer application selected.",
                icon: "⚠",
                iconBg: "#FEE2E2",
                titleColor: "#C0392B",
            });
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
        if (button) {
            button.disabled = true;
            button.dataset.originalText = button.textContent;
            button.textContent = "Opening...";
        }

        const endpoint = `${BUYER_ATTACHMENT_ENDPOINT}/${buyerRegistryId}/attachment`;

        const response = await fetch(endpoint, { method: "GET", headers: getAuthHeaders(false) });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = "Unable to load buyer attachment.";
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.detail || errorData.message || errorMessage;
            } catch {
                if (errorText) errorMessage = errorText;
            }
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
        const attachmentUrl =
            data.attachment_url || data.file_url || data.document_url ||
            data.url || data.attachment_path || data.file_path || data.document_path;

        if (!attachmentUrl) throw new Error("No attachment was found for this buyer.");

        let finalUrl = attachmentUrl;
        if (!attachmentUrl.startsWith("http://") &&
            !attachmentUrl.startsWith("https://") &&
            !attachmentUrl.startsWith("blob:") &&
            !attachmentUrl.startsWith("data:")) {
            finalUrl = attachmentUrl.startsWith("/")
                ? `${API_BASE_URL}${attachmentUrl}`
                : `${API_BASE_URL}/${attachmentUrl}`;
        }

        window.open(finalUrl, "_blank");

    } catch (error) {
        console.error("VIEW BUYER ATTACHMENT ERROR:", error);
        alert(error.message || "Failed to open buyer attachment.");
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = button.dataset.originalText || "View Attachment";
        }
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
        tbody.innerHTML = `
            <tr><td colspan="4" class="table-msg" style="color:#C0392B;">
                <strong>Unable to load pending buyers.</strong><br>
                <small>Check if FastAPI is running and the endpoint is available.</small>
            </td></tr>
        `;
        removePaginationControls("pendingBuyersPagination");
    }
}

function renderPendingBuyers(buyers) {
    const tbody = document.getElementById("pendingBuyersBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    // --- PAGINATION LOGIC (7 items per page) ---
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

    // Render pagination buttons
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
        tbody.innerHTML = `
            <tr><td colspan="4" class="table-msg" style="color:#C0392B;">
                <strong>Unable to load verified buyers.</strong><br>
                <small>Check if FastAPI is running and the endpoint is available.</small>
            </td></tr>
        `;
        removePaginationControls("verifiedBuyersPagination");
    }
}

function renderVerifiedBuyers(buyers) {
    const tbody = document.getElementById("verifiedBuyersBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    // --- PAGINATION LOGIC (7 items per page) ---
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

/* ============================================================
   BUYER SUMMARY CARDS
============================================================ */
function updateBuyerSummaryCards() {
    const pendingCount = pendingBuyersCache.length;
    const verifiedCount = verifiedBuyersCache.length;

    const setCount = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setCount("buyerCountPending", pendingCount);
    setCount("buyerCountVerified", verifiedCount);
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

    const commodityMatch = typeof buyer.message === "string"
        ? buyer.message.match(/^Commodities of interest:[ \t]*([^\r\n]*)/im)
        : null;
    return commodityMatch
        ? commodityMatch[1].split(",").map(commodity => commodity.trim()).filter(Boolean)
        : [];
}

function getBuyerMessage(buyer) {
    const message = typeof buyer?.message === "string" ? buyer.message : "";
    const cleanMessage = message.replace(
        /^Commodities of interest:[^\r\n]*(?:\r?\n(?:[ \t]*\r?\n)?|$)/i,
        ""
    ).trim();
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

        const response = await fetch(
            `${BUYER_STATUS_ENDPOINT}/${buyerStatusId}/verify`,
            { method: "PUT", headers: getAuthHeaders() }
        );

        const data = await parseResponse(response);

        if (!response.ok) throw new Error(data.detail || data.message || "Unable to approve buyer.");

        closeModal("confirmApproveModal");

        showSuccessModal({
            title: "Buyer Verified",
            message: "The buyer has been successfully added to the verified buyers list.",
            icon: "✓",
            iconBg: "#D1FAE5",
            titleColor: "#2E7D32",
        });

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

        const response = await fetch(
            `${BUYER_STATUS_ENDPOINT}/${buyerStatusId}/reject`,
            { method: "PUT", headers: getAuthHeaders() }
        );

        const data = await parseResponse(response);

        if (!response.ok) throw new Error(data.detail || data.message || "Unable to reject buyer.");

        closeModal("confirmRejectModal");

        showSuccessModal({
            title: "Buyer Rejected",
            message: "The buyer application has been rejected.",
            icon: "⚠",
            iconBg: "#FEF3C7",
            titleColor: "#D97706",
        });

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

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove("show");
}

function showError(message) {
    console.error(message);
    alert(message);
}

function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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
    return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function formatKg(value) {
    return `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} kg`;
}

function formatRole(role) {
    if (!role) return "—";
    return String(role).replace(/_/g, " ").toUpperCase();
}

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


/* ============================================================
   ALERT THRESHOLD (UNCHANGED)
============================================================ */

function initAlertThreshold() {
    const thresholdRange = document.getElementById("thresholdRange");
    const thresholdValue = document.getElementById("thresholdValue");
    const chips = document.querySelectorAll(".threshold-chip");
    const saveBtn = document.getElementById("saveConfigBtn");

    function updateThreshold(value) {
        if (thresholdRange) thresholdRange.value = value;
        if (thresholdValue) thresholdValue.textContent = `${value}%`;
        chips.forEach(chip => {
            chip.classList.toggle("active", chip.dataset.val === String(value));
        });
    }

    thresholdRange?.addEventListener("input", e => updateThreshold(e.target.value));
    chips.forEach(chip => chip.addEventListener("click", () => updateThreshold(chip.dataset.val)));

    saveBtn?.addEventListener("click", async () => {
        const commodity = document.getElementById("commoditySelect")?.value;
        const baseDemand = document.getElementById("baseDemandInput")?.value;
        const oversupplyThreshold = thresholdRange?.value;

        if (!commodity) { alert("Please select a commodity."); return; }
        if (!baseDemand || Number(baseDemand) <= 0) { alert("Please enter a valid target demand."); return; }

        const payload = {
            commodity: commodity,
            base_demand: Number(baseDemand),
            oversupply_threshold: Number(oversupplyThreshold)
        };

        try {
            const response = await fetch(`${API_BASE_URL}/api/alert-thresholds`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
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
   ALERTS SECTION (with pagination — 7 per page)
============================================================ */

function initAlertsSection() {
    // Search now filters the FULL alert list, then paginates the result
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
        const response = await fetch(
            `${API_BASE_URL}/api/planting-intents/municipality-map`,
            { method: "GET", headers: getAuthHeaders(false) }
        );

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
        // Lower supply vs demand = more severe
        if (pct < 50) return { label: "High", cls: "high" };
        if (pct < 80) return { label: "Medium", cls: "medium" };
        return { label: "Low", cls: "low" };
    }

    // OVERSUPPLY — higher supply vs demand = more severe
    if (pct >= 150) return { label: "High", cls: "high" };
    if (pct >= 120) return { label: "Medium", cls: "medium" };
    return { label: "Low", cls: "low" };
}

function renderSystemAlertLogs() {
    const alertList = document.getElementById("alertList");
    if (!alertList) return;

    alertList.innerHTML = "";

    // Apply search on the full cache
    const alerts = systemAlertsCache.filter(a => {
        if (!alertSearchTerm) return true;
        const haystack = `${a.commodity} ${a.municipality} ${a.status}`.toLowerCase();
        return haystack.includes(alertSearchTerm);
    });

    // --- PAGINATION LOGIC (4 alerts per page) ---
    const totalPages = Math.ceil(alerts.length / ALERTS_PER_PAGE) || 1;
    if (currentAlertsPage > totalPages) currentAlertsPage = totalPages;
    if (currentAlertsPage < 1) currentAlertsPage = 1;
    const startIndex = (currentAlertsPage - 1) * ALERTS_PER_PAGE;
    const paginatedAlerts = alerts.slice(startIndex, startIndex + ALERTS_PER_PAGE);

    if (!paginatedAlerts.length) {
        alertList.innerHTML = `<div style="text-align:center; padding:30px;">${
            alertSearchTerm ? "No alerts match your search." : "No active alerts."
        }</div>`;
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
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open();
            }
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
    return alertItem.status === "DEFICIT"
        ? "Deficit"
        : alertItem.status === "SURPLUS" ? "Surplus" : "Oversupply";
}

function openAlertDetailModal(alertItem) {
    const isDeficit = alertItem.status === "DEFICIT";
    const sev = getAlertSeverity(alertItem);
    const gap = isDeficit
        ? Math.max(alertItem.base_demand - alertItem.projected_supply, 0)
        : Math.abs(alertItem.excess_supply);
    const pct = alertItem.supply_percentage.toFixed(1);

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText("modalAlertTitle", `${alertItem.commodity} ${getAlertTypeLabel(alertItem)} — ${alertItem.municipality}`);
    setText("modalAlertDesc", isDeficit
        ? `Projected supply of ${alertItem.commodity} in ${alertItem.municipality} is only ${pct}% of the base demand.`
        : `Projected supply of ${alertItem.commodity} in ${alertItem.municipality} is ${pct}% of the base demand.`);

    const modalSeverity = document.getElementById("modalAlertSev");
    if (modalSeverity) {
        modalSeverity.textContent = sev.label;
        modalSeverity.className = `sev-pill ${sev.cls}`;
    }

    setText("modalAlertSupply", formatKg(alertItem.projected_supply));
    setText("modalAlertDemand", formatKg(alertItem.base_demand));

    const thirdStatContainer = document.querySelector(
        "#alertDetailModal .modal-stats-grid div:nth-child(3)"
    );
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
        modal.addEventListener("click", event => {
            if (event.target === modal) modal.classList.remove("show");
        });
    });

    document.querySelectorAll(".modal-cancel-btn").forEach(button => {
        button.addEventListener("click", () => {
            button.closest(".modal-overlay")?.classList.remove("show");
        });
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
    await Promise.allSettled([
        loadPendingReports(),
        loadReturnedToProvincial(),
        loadApprovedReports()
    ]);
}

async function loadPendingReports() {
    const tbody = document.getElementById("pendingReportsBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="padding:30px; text-align:center; color:#999;">Loading reports...</td></tr>`;

    try {
        const data = await fetchJsonWithTimeout(
            DA_PENDING_ENDPOINT,
            { method: "GET", headers: getAuthHeaders(false) },
            10000
        );

        pendingReports = Array.isArray(data) ? data : [];
        selectedReportIds = new Set();

        renderPendingReports();
        updateBulkApproveButton();

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
        return s === "SUBMITTED_REGIONAL_PENDING" || s === "FOR_DA_RFO_VALIDATION";
    });

    const badge = document.getElementById("pendingCountBadge");
    if (badge) badge.textContent = reports.length;

    tbody.innerHTML = "";

    if (reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding:30px; text-align:center; color:#999;">No reports awaiting DA-RFO validation.</td></tr>`;
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

async function loadReturnedToProvincial() {
    const tbody = document.getElementById("returnedToProvincialBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">Loading reports...</td></tr>`;

    try {
        const data = await fetchJsonWithTimeout(
            RETURNED_TO_PROVINCIAL_ENDPOINT,
            { method: "GET", headers: getAuthHeaders(false) },
            10000
        );

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
        return;
    }

    returnedToProvincialReports.forEach(report => {
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
            <td class="center-col">
                <span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>
            </td>
        `;

        tr.addEventListener("click", () => openReportDetail(report));
        tbody.appendChild(tr);
    });
}

async function loadApprovedReports() {
    const tbody = document.getElementById("approvedReportsBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">Loading reports...</td></tr>`;

    try {
        const data = await fetchJsonWithTimeout(
            APPROVED_BY_REGIONAL_ENDPOINT,
            { method: "GET", headers: getAuthHeaders(false) },
            10000
        );

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
        return;
    }

    approvedReports.forEach(report => {
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
            <td class="center-col">
                <span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>
            </td>
        `;

        tr.addEventListener("click", () => openReportDetail(report));
        tbody.appendChild(tr);
    });
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

function updateBulkApproveButton() {
    const btn = document.getElementById("bulkApproveBtn");
    if (!btn) return;

    if (selectedReportIds.size > 0) {
        btn.disabled = false;
        btn.textContent = `Approve ${selectedReportIds.size} & Finalize`;
    } else {
        btn.disabled = true;
        btn.textContent = "Approve Selected & Finalize";
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

    if (confirmBtn) confirmBtn.addEventListener("click", bulkApproveSelected);
}

function openBulkApproveModal() {
    const modal = document.getElementById("bulkApproveModal");
    const text = document.getElementById("bulkApproveText");
    if (!modal || !text) return;

    const n = selectedReportIds.size;
    text.textContent =
        `Approve ${n} report${n > 1 ? "s" : ""} and finalize?` +
        ` This action will mark the selected report${n > 1 ? "s" : ""} as APPROVED.`;

    modal.classList.add("show");
}

async function bulkApproveSelected() {
    const confirmBtn = document.getElementById("bulkApproveConfirmBtn");
    const cancelBtn = document.getElementById("bulkApproveCancelBtn");

    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "Processing..."; }
    if (cancelBtn) cancelBtn.disabled = true;

    const count = selectedReportIds.size;

    try {
        const response = await fetch(BULK_APPROVE_ENDPOINT, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
                report_ids: Array.from(selectedReportIds),
                validator_role: "darfo"
            })
        });

        const data = await parseResponse(response);
        if (!response.ok) throw new Error(data.detail || "Bulk approve failed.");

        document.getElementById("bulkApproveModal")?.classList.remove("show");

        // Styled success modal
        showSuccessModal({
            title: "Bulk Approval Complete",
            message: `<strong>${data.approved_count || 0}</strong> report${(data.approved_count || 0) !== 1 ? "s" : ""} approved and finalized.`,
            icon: "✓",
            iconBg: "#D1FAE5",
            titleColor: "#2E7D32",
            onClose: async () => {
                await Promise.allSettled([
                    loadPendingReports(),
                    loadReturnedToProvincial(),
                    loadApprovedReports()
                ]);
            },
        });

        selectedReportIds.clear();

    } catch (err) {
        console.error("Bulk approve error:", err);
        document.getElementById("bulkApproveModal")?.classList.remove("show");

        showSuccessModal({
            title: "Bulk Approval Failed",
            message: escapeHtml(err.message || "Please try again."),
            icon: "⚠",
            iconBg: "#FEE2E2",
            titleColor: "#C0392B",
        });
    } finally {
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = "Confirm"; }
        if (cancelBtn) cancelBtn.disabled = false;
    }
}

/* ============================================================
   OPEN REPORT DETAIL (aligned with provincial)
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
    if (detailView) {
        detailView.classList.remove("hidden-element");
        detailView.style.display = "block";
    }

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
    if (statusEl) {
        statusEl.innerHTML = `<span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>`;
    }

    const statusUpper = String(report.status || "").toUpperCase();
    const isPending =
        statusUpper === "SUBMITTED_REGIONAL_PENDING" ||
        statusUpper === "FOR_DA_RFO_VALIDATION";

    const isReadOnly =
        statusUpper === "SUBMITTED_REGIONAL_APPROVED" ||
        statusUpper === "FINAL_APPROVED";

    if (backBtn) { backBtn.style.display = "inline-flex"; backBtn.textContent = "Return"; }

    const remarksRow = remarksEl ? remarksEl.closest(".notes-row") : null;

    if (isPending) {
        if (flagBtn) {
            flagBtn.style.display = "inline-flex";
            flagBtn.textContent = "Flag for Revision";
            flagBtn.disabled = false;
            flagBtn.classList.remove("active");
        }
        if (approveBtn) {
            approveBtn.style.display = "inline-flex";
            approveBtn.textContent = "Approve Report";
            approveBtn.disabled = false;
            approveBtn.classList.remove("active");
        }
        if (remarksRow) remarksRow.style.display = "flex";
    } else {
        if (flagBtn)    flagBtn.style.display = "none";
        if (approveBtn) approveBtn.style.display = "none";

        if (remarksRow) remarksRow.style.display = "none";
    }


    try {
        const full = await fetchJsonWithTimeout(
            `${API_BASE_URL}/api/raw-plant-reports/${report.report_id}`,
            { method: "GET", headers: getAuthHeaders(false) },
            10000
        );

        console.log("Full report:", full);

        if (dateEl) {
            dateEl.textContent = formatDate(full.submitted_at || full.created_at) || "—";
        }
        if (notesEl) {
            notesEl.textContent = full.notes || full.narrative || full.remarks || "—";
        }
        if (encodedByEl) {
            encodedByEl.textContent = full.encoded_by_name || report.encoded_by_name || "—";
        }
        if (yieldEl) {
            yieldEl.textContent = full.estimated_yield != null ? full.estimated_yield : "—";
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
   RENDER VALIDATION TIMELINE
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
   RENDER REPORT SUMMARY CARD (frozen snapshot)
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

    const totalVolume = selected.reduce((sum, i) => sum + (Number(i.volume) || 0), 0);

    const uniqueFarmers = new Set(
        selected.map(i => i.farmer_id || i.farmer_name).filter(Boolean)
    );
    const uniqueFarmerCount = uniqueFarmers.size;

    const pendingReportIds = new Set();
    intents.forEach(i => {
        const s = String(i.report_status || i.status || "").toUpperCase();
        if (s === "SUBMITTED_REGIONAL_PENDING" || s === "FOR_DA_RFO_VALIDATION") {
            if (i.report_id != null) pendingReportIds.add(i.report_id);
        }
    });
    const pendingCount = pendingReportIds.size;


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
                coveragePeriodEl.textContent = `Coverage: ${fmt(weekStart)} – ${fmt(reportDate)}`;
            } else {
                coveragePeriodEl.textContent = "Coverage: —";
            }
        } else {
            coveragePeriodEl.textContent = "Coverage: —";
        }
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

    let html = "";

    html += `
        <div class="summary-kpi-grid">
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">✓ Selected Intents</div>
                <div class="summary-kpi-value">${selectedCount}</div>
                <div class="summary-kpi-subtext">Included in this report</div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">Total Volume</div>
                <div class="summary-kpi-value">${formatKg(totalVolume)}</div>
                <div class="summary-kpi-subtext">Across ${selectedCount} intent${selectedCount !== 1 ? "s" : ""}</div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">Unique Farmers</div>
                <div class="summary-kpi-value">${uniqueFarmerCount}</div>
                <div class="summary-kpi-subtext">Beneficiaries in this report</div>
            </div>
        </div>
    `;

    html += `
        <div class="summary-kpi-grid">
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">Pending Reports</div>
                <div class="summary-kpi-value" style="color:${pendingCount > 0 ? "#D97706" : "#2E7D32"};">${pendingCount}</div>
                <div class="summary-kpi-subtext">
                    ${pendingCount === 1 ? "report awaiting your review" : "reports awaiting your review"}
                </div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">Harvested Volume</div>
                <div class="summary-kpi-value" style="color:#2E7D32;">${formatKg(harvestedVolume)}</div>
                <div class="summary-kpi-subtext">${harvestedIntents.length} of ${selectedCount} harvested</div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">Harvest Rate</div>
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
            <div class="summary-breakdown-title">By Commodity</div>
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
            font-size: 11px; font-weight: 700; color: var(--muted);
            text-transform: uppercase; letter-spacing: 0.06em;
            margin-bottom: 10px; padding-bottom: 6px;
            border-bottom: 1px solid var(--border-light);
        ">Yield Performance</div>
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
                        <span style="color: var(--muted);">Harvest earliest:</span>
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

    const preparedBy = localStorage.getItem("full_name")
        || localStorage.getItem("name")
        || localStorage.getItem("username")
        || "DA-RFO Officer";
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
   RENDER DETAIL INTENTS (rich — with Planned vs Actual)
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
    if (detailView) {
        detailView.classList.add("hidden-element");
        detailView.style.display = "none";
    }

    const listView = document.getElementById("reportsListView");
    if (listView) {
        listView.classList.remove("hidden-element");
        listView.style.display = "block";
    }

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
   FLAG REPORT FOR REVISION (with confirmation modal)
============================================================ */

function flagReport() {
    if (!selectedReport) {
        showSuccessModal({
            title: "Error",
            message: "No report selected.",
            icon: "⚠",
            iconBg: "#FEE2E2",
            titleColor: "#C0392B",
        });
        return;
    }

    const validatorId = localStorage.getItem("user_id") ||
                        localStorage.getItem("userId") ||
                        localStorage.getItem("id");
    const accessToken = getAuthToken();
    const tokenType = localStorage.getItem("token_type") || "bearer";

    if (!validatorId || !accessToken) {
        showSuccessModal({
            title: "Session Expired",
            message: "Please log in again.",
            icon: "⚠",
            iconBg: "#FEE2E2",
            titleColor: "#C0392B",
        });
        return;
    }

    const remarksEl = document.getElementById("remarksTextarea");
    const remarksInput = remarksEl?.value?.trim();

    // Validation — remarks required
    if (!remarksInput) {
        showActionConfirm({
            title: "Remarks Required",
            message: "Please enter your revision remarks in the text area before flagging this report. <br><br>The Provincial Coordinator needs to know <strong>what to fix.</strong>",
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

    // Build structured details
    const reportTitle = selectedReport.title || `Report #${selectedReport.report_id}`;
    const municipality = selectedReport.municipality || "—";

    const detailsHtml = `
        <div style="display:grid; grid-template-columns: auto 1fr; gap: 6px 14px;">
            <span style="font-weight:700;">Report:</span>
            <span>#${escapeHtml(String(selectedReport.report_id))} — ${escapeHtml(reportTitle)}</span>
            <span style="font-weight:700;">Municipality:</span>
            <span>${escapeHtml(municipality)}</span>
            <span style="font-weight:700;">Your remarks:</span>
            <span style="font-style:italic; color:#C0392B;">"${escapeHtml(remarks)}"</span>
        </div>
    `;

    // Show styled confirmation
    showActionConfirm({
        title: "Flag for Revision?",
        message: "This report will be returned to the Provincial Coordinator for revision. <br><strong>They will need to forward it again after making changes.</strong>",
        details: detailsHtml,
        confirmText: "Flag for Revision",
        confirmColor: "#C0392B",
        cancelText: "Cancel",
        onConfirm: async () => {
            const flagBtn = document.getElementById("flagBtn");
            const originalText = flagBtn?.textContent;

            if (flagBtn) {
                flagBtn.disabled = true;
                flagBtn.textContent = "Processing...";
            }

            try {
                const url =
                    `${API_BASE_URL}/api/report-submissions/${selectedReport.report_id}/revision` +
                    `?validator_id=${encodeURIComponent(validatorId)}` +
                    `&validator_role=darfo` +
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

                if (flagBtn) {
                    flagBtn.classList.add("active");
                    flagBtn.textContent = "Flagged ✓";
                }

                // Styled success modal
                showSuccessModal({
                    title: "Flagged for Revision",
                    message: "The report has been returned to the Provincial Coordinator for revision. You'll see it again once they resubmit.",
                    icon: "⚠",
                    iconBg: "#FEF3C7",
                    titleColor: "#D97706",
                    onClose: async () => {
                        closeReportDetail();
                        await loadReports();
                    },
                });

            } catch (err) {
                console.error("Flag error:", err);
                showSuccessModal({
                    title: "Flag Failed",
                    message: escapeHtml(err.message || "Please try again."),
                    icon: "⚠",
                    iconBg: "#FEE2E2",
                    titleColor: "#C0392B",
                });
                if (flagBtn) {
                    flagBtn.classList.remove("active");
                    flagBtn.textContent = originalText || "Flag for Revision";
                }
            } finally {
                if (flagBtn) flagBtn.disabled = false;
            }
        },
    });
}


/* ============================================================
   APPROVE REPORT (with confirmation modal)
============================================================ */

function approveReport() {
    if (!selectedReport) {
        showSuccessModal({
            title: "Error",
            message: "No report selected.",
            icon: "⚠",
            iconBg: "#FEE2E2",
            titleColor: "#C0392B",
        });
        return;
    }

    const validatorId = localStorage.getItem("user_id") ||
                        localStorage.getItem("userId") ||
                        localStorage.getItem("id");
    const accessToken = getAuthToken();
    const tokenType = localStorage.getItem("token_type") || "bearer";

    if (!validatorId || !accessToken) {
        showSuccessModal({
            title: "Session Expired",
            message: "Please log in again.",
            icon: "⚠",
            iconBg: "#FEE2E2",
            titleColor: "#C0392B",
        });
        return;
    }

    const remarksInput = document.getElementById("remarksTextarea")?.value.trim();
    const remarks = remarksInput || null;

    const reportTitle = selectedReport.title || `Report #${selectedReport.report_id}`;
    const municipality = selectedReport.municipality || "—";
    const commodity = selectedReport.commodity || "—";

    const detailsHtml = `
        <div style="display:grid; grid-template-columns: auto 1fr; gap: 6px 14px;">
            <span style="font-weight:700;">Report:</span>
            <span>#${escapeHtml(String(selectedReport.report_id))} — ${escapeHtml(reportTitle)}</span>
            <span style="font-weight:700;">Municipality:</span>
            <span>${escapeHtml(municipality)}</span>
            <span style="font-weight:700;">Commodity:</span>
            <span>${escapeHtml(commodity)}</span>
            ${remarks ? `
                <span style="font-weight:700;">Your remarks:</span>
                <span style="font-style:italic;">"${escapeHtml(remarks)}"</span>
            ` : ""}
        </div>
    `;

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

            if (approveBtn) {
                approveBtn.disabled = true;
                approveBtn.textContent = "Processing...";
            }

            try {
                const url =
                    `${API_BASE_URL}/api/report-submissions/${selectedReport.report_id}/approve` +
                    `?validator_id=${encodeURIComponent(validatorId)}` +
                    `&validator_role=darfo` +
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

                if (approveBtn) {
                    approveBtn.classList.add("active");
                    approveBtn.textContent = "Approved ✓";
                }

                // Styled success modal
                showSuccessModal({
                    title: "Report Approved",
                    message: "The report has been marked as <strong>APPROVED</strong> and is now the final version.",
                    icon: "✓",
                    iconBg: "#D1FAE5",
                    titleColor: "#2E7D32",
                    onClose: async () => {
                        closeReportDetail();
                        await loadReports();
                    },
                });

            } catch (err) {
                console.error("Approve error:", err);
                showSuccessModal({
                    title: "Approval Failed",
                    message: escapeHtml(err.message || "Please try again."),
                    icon: "⚠",
                    iconBg: "#FEE2E2",
                    titleColor: "#C0392B",
                });
                if (approveBtn) {
                    approveBtn.classList.remove("active");
                    approveBtn.textContent = originalText || "Approve Report";
                }
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

    if (printBtn) {
        printBtn.addEventListener("click", () => window.print());
    }
}

async function loadRegionalDemandLookup() {
    const lookup = {};
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/planting-intents/municipality-map`,
            { method: "GET", headers: getAuthHeaders(false) }
        );
        if (!response.ok) return lookup;
        const result = await response.json();
        (result.data || []).forEach(entry => {
            (entry.commodities || []).forEach(item => {
                const key = `${String(entry.municipality || "").trim().toLowerCase()}|${String(item.commodity || "").trim().toLowerCase()}`;
                lookup[key] = {
                    demand: Number(item.base_demand || 0),
                    status: String(item.status || "").toUpperCase()
                };
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

    if (loadingCard) {
        loadingCard.style.display = "block";
        loadingCard.innerHTML = `<div style="padding: 40px; text-align: center; color: #777; font-size: 15px;">Loading summary...</div>`;
    }
    if (contentCard) contentCard.style.display = "none";

    try {
        const params = new URLSearchParams();
        if (currentSummaryPeriod.start) params.append("period_start", currentSummaryPeriod.start.toISOString());
        if (currentSummaryPeriod.end) params.append("period_end", currentSummaryPeriod.end.toISOString());

        const url = `${REGIONAL_SUMMARY_ENDPOINT}?${params.toString()}`;

        const data = await fetchJsonWithTimeout(
            url,
            { method: "GET", headers: getAuthHeaders(false) },
            15000
        );

        data.demandLookup = await loadRegionalDemandLookup();
        currentSummaryData = data;

        if (loadingCard) loadingCard.style.display = "none";
        if (contentCard) contentCard.style.display = "block";

        renderRegionalSummary(data);

    } catch (err) {
        console.error("Load regional summary error:", err);
        let errorMessage = "Please check the FastAPI server.";
        if (err?.message) {
            if (typeof err.message === "string") errorMessage = err.message;
            else if (typeof err.message === "object") errorMessage = JSON.stringify(err.message);
        }

        if (loadingCard) {
            loadingCard.style.display = "block";
            loadingCard.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #C0392B; font-size: 15px;">
                    <div style="font-size: 40px; margin-bottom: 10px;">⚠️</div>
                    <strong>Failed to load summary.</strong>
                    <br><small style="color: #999;">${escapeHtml(errorMessage)}</small>
                    <br><br>
                    <button onclick="loadRegionalSummary()" style="padding: 8px 20px; background: #2E7D32; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        🔄 Retry
                    </button>
                </div>
            `;
        }
        if (contentCard) contentCard.style.display = "none";
    }
}

function renderRegionalSummary(data) {
    const container = document.getElementById("regionalSummaryContent");
    if (!container) return;

    const intents = Array.isArray(data.intents) ? data.intents : [];
    const reportCount = data.report_count || 0;
    const municipalityCount = data.municipality_count || 0;

    const periodStart = data.period_start ? new Date(data.period_start) : null;
    const periodEnd = data.period_end ? new Date(data.period_end) : null;

    if (intents.length === 0) {
        container.innerHTML = `
            <div style="padding: 60px 40px; text-align: center; color: var(--muted);">
                <div style="font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 6px;">
                    No reports found for this period
                </div>
                <div style="font-size: 13px; line-height: 1.5;">
                    No Pampanga municipality has submissions between
                    <b>${periodStart ? formatDateLong(periodStart) : "the beginning"}</b>
                    and
                    <b>${periodEnd ? formatDateLong(periodEnd) : "now"}</b>.
                </div>
            </div>
        `;
        return;
    }

    const selectedCount = intents.length;
    const totalVolume = intents.reduce((sum, i) => sum + (Number(i.volume) || 0), 0);
    const uniqueFarmers = new Set(intents.map(i => i.farmer_id || i.farmer_name).filter(Boolean));
    const uniqueFarmerCount = uniqueFarmers.size;

    // Use backend-provided pending_report_count (source of truth)
    // Backend counts REPORTS awaiting DA-RFO validation, not intents.
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
        if (!byCommodity[c]) byCommodity[c] = { count: 0, volume: 0 };
        byCommodity[c].count += 1;
        byCommodity[c].volume += Number(intent.volume) || 0;
    });

    const byMunicipality = {};
    intents.forEach(intent => {
        const m = intent.municipality || "Unknown";
        if (!byMunicipality[m]) byMunicipality[m] = { count: 0, volume: 0 };
        byMunicipality[m].count += 1;
        byMunicipality[m].volume += Number(intent.volume) || 0;
    });

    const byStatus = {
        "NOT PLANTED": { count: 0, volume: 0, label: "Not Planted", color: "#6c757d" },
        "PLANTED":     { count: 0, volume: 0, label: "Planted",     color: "#D97706" },
        "HARVESTED":   { count: 0, volume: 0, label: "Harvested",   color: "#2E7D32" },
        "MEDIATING":   { count: 0, volume: 0, label: "Mediating",   color: "#2980B9" },
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
        || "DA-RFO Officer";

    const generatedAt = new Date().toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit"
    });

    const generatedDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    let html = "";

    html += `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1.5px solid var(--border-light); flex-wrap: wrap; gap: 12px;">
            <div>
                <div style="font-size: 14px; font-weight: 800; color: var(--green-dark); text-transform: uppercase; letter-spacing: 0.06em;">Regional Summary</div>
                <div style="font-size: 11px; color: var(--muted); margin-top: 3px;">Pampanga • Coverage: ${escapeHtml(periodLabel)}</div>
            </div>
            <div style="font-size: 11px; font-weight: 700; color: var(--green-dark); background: var(--green-light); padding: 5px 12px; border-radius: 999px;">
                ${reportCount} report${reportCount !== 1 ? "s" : ""} • ${municipalityCount} municipalit${municipalityCount !== 1 ? "ies" : "y"}
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
                <div class="summary-kpi-label">Total Volume</div>
                <div class="summary-kpi-value">${formatKg(totalVolume)}</div>
                <div class="summary-kpi-subtext">Planned estimate</div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">Unique Farmers</div>
                <div class="summary-kpi-value">${uniqueFarmerCount}</div>
                <div class="summary-kpi-subtext">Beneficiaries in period</div>
            </div>
        </div>
    `;

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
    const summaryRows = Object.values(groups).sort((a, b) =>
        a.region.localeCompare(b.region) || b.volume - a.volume);

    html += `
        <div class="summary-table-wrap">
            <table class="summary-table">
                <thead>
                    <tr>
                        <th>Region</th>
                        <th>Commodity</th>
                        <th class="num">Total Planting Intent</th>
                        <th class="num">Estimated Production</th>
                        <th class="num">Market Demand</th>
                        <th>Oversupply Status</th>
                        <th>Date Generated</th>
                    </tr>
                </thead>
                <tbody>
                    ${summaryRows.map(row => {
                        const market = demandLookup[`${row.region.trim().toLowerCase()}|${row.commodity.trim().toLowerCase()}`];
                        const supply = formatSupplyStatus(market?.status);
                        return `<tr>
                            <td>${escapeHtml(row.region)}</td>
                            <td>${escapeHtml(row.commodity)}</td>
                            <td class="num">${row.count}</td>
                            <td class="num">${escapeHtml(formatKg(row.volume))}</td>
                            <td class="num">${market ? escapeHtml(formatKg(market.demand)) : "—"}</td>
                            <td><b style="color:${supply.color};">${escapeHtml(supply.text)}</b></td>
                            <td>${escapeHtml(generatedDate)}</td>
                        </tr>`;
                    }).join("")}
                </tbody>
            </table>
        </div>
        <details class="summary-details no-print">
            <summary>Supporting details (drill-down)</summary>
`;

    html += `
        <div class="summary-kpi-grid">
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">Pending Reports</div>
                <div class="summary-kpi-value" style="color:${pendingCount > 0 ? "#D97706" : "#2E7D32"};">${pendingCount}</div>
                <div class="summary-kpi-subtext">
                    ${pendingCount === 1 ? "report awaiting your review" : "reports awaiting your review"}
                </div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">Harvested Volume</div>
                <div class="summary-kpi-value" style="color:#2E7D32;">${formatKg(harvestedVolume)}</div>
                <div class="summary-kpi-subtext">${harvestedIntents.length} of ${selectedCount} harvested</div>
            </div>
            <div class="summary-kpi-card">
                <div class="summary-kpi-label">Harvest Rate</div>
                <div class="summary-kpi-value" style="color:${harvestRate === 100 ? "#2E7D32" : harvestRate > 0 ? "#D97706" : "#6c757d"};">${harvestRate}%</div>
                <div class="summary-kpi-subtext">Completion ratio</div>
            </div>
        </div>
    `;

    html += `<div class="summary-breakdown-grid">`;

    html += `<div><div class="summary-breakdown-title">By Commodity</div><div class="summary-breakdown-body">`;
    Object.entries(byCommodity).sort((a, b) => b[1].volume - a[1].volume).forEach(([name, d]) => {
        html += `<div class="summary-breakdown-row"><span style="font-weight: 600;">${escapeHtml(name)}</span><span style="font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums;">${d.count} · <b style="color:var(--green-dark);">${formatKg(d.volume)}</b></span></div>`;
    });
    html += `</div></div>`;

    html += `<div><div class="summary-breakdown-title">🏛️ By Municipality</div><div class="summary-breakdown-body">`;
    Object.entries(byMunicipality).sort((a, b) => b[1].volume - a[1].volume).forEach(([name, d]) => {
        html += `<div class="summary-breakdown-row"><span style="font-weight: 600;">🏛️ ${escapeHtml(name)}</span><span style="font-size:12px; color:var(--muted); font-variant-numeric: tabular-nums;">${d.count} · <b style="color:var(--green-dark);">${formatKg(d.volume)}</b></span></div>`;
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

    html += `<div class="summary-insight-card green">
        <div style="font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border-light);">Yield Performance</div>`;
    if (hasActualData) {
        let varianceColor = variancePct < 0 ? "#C0392B" : variancePct > 0 ? "#2E7D32" : "#6c757d";
        let varianceIcon = variancePct < 0 ? "↓" : variancePct > 0 ? "↑" : "→";
        let varianceLabel = variancePct < 0 ? "shortfall" : variancePct > 0 ? "surplus" : "on target";
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: var(--muted);">Expected:</span><b>${yieldPlanned.toLocaleString("en-US")} kg</b></div>`;
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 10px;"><span style="color: var(--muted);">Actual:</span><b>${yieldActual.toLocaleString("en-US")} kg</b></div>`;
        html += `<div style="display: inline-block; padding: 4px 12px; background: ${varianceColor}15; border-radius: 6px; font-size: 13px; font-weight: 700; color: ${varianceColor};">${varianceIcon} ${Math.abs(variancePct)}% ${varianceLabel}</div>`;
    } else {
        html += `<span style="color: var(--muted); font-style: italic;">No actual harvest volume recorded yet.</span>`;
    }
    html += `</div>`;

    html += `<div class="summary-insight-card orange">
        <div style="font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border-light);">📅 Planting Window</div>`;
    if (plantingDates.length > 0) {
        const earliest = new Date(Math.min.apply(null, plantingDates));
        const latest = new Date(Math.max.apply(null, plantingDates));
        const spanDays = Math.round((latest - earliest) / (1000 * 60 * 60 * 24));
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: var(--muted);">🌱 Earliest:</span><b>${formatDateLong(earliest)}</b></div>`;
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span style="color: var(--muted);">Latest:</span><b>${formatDateLong(latest)}</b></div>`;
        html += `<div style="display: flex; justify-content: space-between;"><span style="color: var(--muted);">Span:</span><b>${spanDays} day${spanDays !== 1 ? "s" : ""}</b></div>`;
    } else {
        html += `<span style="color: var(--muted); font-style: italic;">No planting dates available.</span>`;
    }
    html += `</div>`;

    html += `</div>`;

    html += `</details>`;

    html += `
        <div class="summary-footer">
            <div><b style="color: var(--ink);">Prepared by:</b> ${escapeHtml(preparedBy)}</div>
            <div><b style="color: var(--ink);">Generated:</b> ${escapeHtml(generatedAt)}</div>
        </div>
    `;

    container.innerHTML = html;
}


/* ============================================================
   ETL RUN LOGS (with pagination — 7 per page)
   GET /api/etl-run-log/
   Flow: fetch once -> cache in etlLogsCache -> renderETLLogs()
============================================================ */

async function loadETLRunLogs() {
    const etlRows = document.getElementById("etlRows");
    if (!etlRows) {
        console.warn("ETL run log table body #etlRows not found.");
        return;
    }

    etlRows.innerHTML = `
        <tr>
            <td colspan="4" style="text-align:center; padding:24px; color:var(--muted);">
                Loading ETL logs...
            </td>
        </tr>
    `;
    removePaginationControls("etlTablePagination");

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/etl-run-log/`,
            { method: "GET", headers: getAuthHeaders() }
        );

        let data = {};
        try { data = await response.json(); } catch { data = {}; }

        console.log("GET /api/etl-run-log/:", response.status, data);

        if (response.status === 401) {
            localStorage.clear();
            window.location.href = "../index.html";
            return;
        }

        if (response.status === 403) {
            etlRows.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align:center; padding:24px; color:#C0392B;">
                        You do not have permission to view ETL logs.
                    </td>
                </tr>
            `;
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        let logs = [];
        if (Array.isArray(data)) logs = data;
        else if (Array.isArray(data.logs)) logs = data.logs;
        else if (Array.isArray(data.data)) logs = data.data;
        else throw new Error("Unexpected ETL log response format.");

        etlLogsCache = logs;
        renderETLLogs();

    } catch (error) {
        console.error("Load ETL run logs error:", error);
        etlRows.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center; padding:24px; color:#C0392B;">
                    Failed to load ETL logs.<br><br>${escapeHtml(error.message)}
                </td>
            </tr>
        `;
        removePaginationControls("etlTablePagination");
    }
}

function renderETLLogs() {
    const etlRows = document.getElementById("etlRows");
    if (!etlRows) return;

    // Apply search on the full cache
    const logs = etlLogsCache.filter(log => {
        if (!etlSearchTerm) return true;
        const haystack = [
            formatAuditDate(log.run_date_time),
            log.data_source || "",
            log.status || "",
            log.error_message || ""
        ].join(" ").toLowerCase();
        return haystack.includes(etlSearchTerm);
    });

    etlRows.innerHTML = "";

    if (logs.length === 0) {
        etlRows.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center; padding:24px; color:var(--muted);">
                    ${etlSearchTerm ? "No ETL logs match your search." : "No ETL logs available."}
                </td>
            </tr>
        `;
        removePaginationControls("etlTablePagination");
        return;
    }

    // --- PAGINATION LOGIC (7 items per page) ---
    const totalPages = Math.ceil(logs.length / ITEMS_PER_PAGE) || 1;
    if (currentEtlPage > totalPages) currentEtlPage = totalPages;
    if (currentEtlPage < 1) currentEtlPage = 1;
    const startIndex = (currentEtlPage - 1) * ITEMS_PER_PAGE;
    const paginatedLogs = logs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    paginatedLogs.forEach(log => {
        const row = document.createElement("tr");

        const runDateTime = formatAuditDate(log.run_date_time);
        const dataSource  = log.data_source || "—";
        const status      = log.status || "—";
        const errorMessage = log.error_message || "";

        const statusColor =
            status.toLowerCase() === "success" ? "#2E7D32" :
            status.toLowerCase() === "failed"  ? "#C0392B" :
            "#6c757d";
        const failureDetails = status.toLowerCase() === "failed"
            ? (errorMessage
                ? `<details><summary>View reason</summary><div>${escapeHtml(errorMessage)}</div></details>`
                : `<span>No details recorded for this run.</span>`)
            : "—";

        row.innerHTML = `
            <td style="text-align:left; padding:13px 14px; border-bottom:1px solid var(--border-light);">
                ${escapeHtml(runDateTime)}
            </td>
            <td style="text-align:left; padding:13px 14px; border-bottom:1px solid var(--border-light);">
                ${escapeHtml(dataSource)}
            </td>
            <td style="text-align:left; padding:13px 14px; border-bottom:1px solid var(--border-light);">
                <span style="
                    display:inline-block;
                    padding:4px 12px;
                    border-radius:999px;
                    font-size:11.5px;
                    font-weight:700;
                    color:#FFFFFF;
                    background-color:${statusColor};
                    text-transform:uppercase;
                ">${escapeHtml(status)}</span>
            </td>
            <td style="text-align:left; padding:13px 14px; border-bottom:1px solid var(--border-light); max-width:420px; overflow-wrap:anywhere;">
                ${failureDetails}
            </td>
        `;

        etlRows.appendChild(row);
    });

    renderPaginationUI("etlRows", currentEtlPage, totalPages, (newPage) => {
        currentEtlPage = newPage;
        renderETLLogs();
    }, "etlTablePagination", { totalItems: logs.length, pageSize: ITEMS_PER_PAGE, label: "logs" });
}

/* ============================================================
   MANUAL ETL RUN
   POST /api/etl-run-log/manual-run
============================================================ */

async function manualRunETL() {
    const manualRunBtn = document.getElementById("manualRunBtn");
    if (!manualRunBtn) {
        console.warn("Manual ETL button #manualRunBtn not found.");
        return;
    }

    const confirmed = await ESaka.confirm(
        "Are you sure you want to run the ETL pipeline manually?",
        { title: "Run ETL pipeline?", confirmText: "Run now" }
    );
    if (!confirmed) return;

    manualRunBtn.disabled = true;
    manualRunBtn.textContent = "Running ETL...";

    try {
        const beforeResponse = await fetch(
            `${API_BASE_URL}/api/etl-run-log/`,
            { method: "GET", headers: getAuthHeaders() }
        );
        const beforeData = await beforeResponse.json().catch(() => []);
        const beforeLogs = Array.isArray(beforeData)
            ? beforeData
            : (beforeData.logs || beforeData.data || []);
        const baselineLogId = beforeLogs.reduce(
            (highest, log) => Math.max(highest, Number(log.etl_log_id ?? log.id ?? 0)),
            0
        );

        const response = await fetch(
            `${API_BASE_URL}/api/etl-run-log/manual-run`,
            { method: "POST", headers: getAuthHeaders() }
        );

        let data = {};
        try { data = await response.json(); } catch { data = {}; }

        console.log("POST /api/etl-run-log/manual-run:", response.status, data);

        if (response.status === 401) {
            localStorage.clear();
            window.location.href = "../index.html";
            return;
        }

        if (response.status === 403) {
            throw new Error("You do not have permission to run the ETL pipeline.");
        }

        if (!response.ok) {
            throw new Error(data.detail || "Failed to start ETL pipeline.");
        }

        console.log("ETL pipeline started. Waiting for completion...");

        const result = await waitForETLCompletion(baselineLogId);

        // Go back to the first page so the newest logs are visible
        currentEtlPage = 1;
        await loadETLRunLogs();
        await loadDaDashboard();

        if (result.hasFailed) {
            const failureSummary = result.logs
                .filter(log => String(log.status).toLowerCase() === "failed")
                .map(log => `${log.data_source || "ETL step"}: ${log.error_message || "No failure details were recorded."}`)
                .join("\n");
            alert(`ETL pipeline finished with failed steps.\n\n${failureSummary}`);
        } else {
            alert("ETL Pipeline Completed Successfully!");
        }

    } catch (error) {
        console.error("Manual ETL run error:", error);
        alert(
            "❌ ETL Pipeline Failed.\n\n" +
            (error.message || "Unable to complete the ETL pipeline.")
        );
    } finally {
        manualRunBtn.disabled = false;
        manualRunBtn.textContent = "Manual Run";
    }
}

/* ============================================================
   WAIT FOR ETL COMPLETION
============================================================ */

async function waitForETLCompletion(baselineLogId = 0) {
    const maxAttempts = 60;
    const interval = 3000;
    const expectedStepCount = 9;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`Checking ETL status... Attempt ${attempt}/${maxAttempts}`);

        try {
            const response = await fetch(
                `${API_BASE_URL}/api/etl-run-log/`,
                { method: "GET", headers: getAuthHeaders() }
            );

            if (response.status === 401) {
                localStorage.clear();
                window.location.href = "../index.html";
                throw new Error("Session expired.");
            }

            if (!response.ok) {
                throw new Error("Unable to check ETL run status.");
            }

            const data = await response.json();

            let logs = [];
            if (Array.isArray(data)) logs = data;
            else if (Array.isArray(data.logs)) logs = data.logs;
            else if (Array.isArray(data.data)) logs = data.data;

            const newLogs = logs.filter(log =>
                Number(log.etl_log_id ?? log.id ?? 0) > baselineLogId
            );

            if (newLogs.length >= expectedStepCount) {
                const latestLogs = newLogs.slice(0, expectedStepCount);

                const allFinished = latestLogs.every(log =>
                    log.status &&
                    (String(log.status).toLowerCase() === "success" ||
                     String(log.status).toLowerCase() === "failed")
                );

                if (allFinished) {
                    const hasFailed = latestLogs.some(log =>
                        log.status &&
                        String(log.status).toLowerCase() === "failed"
                    );

                    if (hasFailed) {
                        return { hasFailed: true, logs: latestLogs };
                    }

                    console.log(`All ${expectedStepCount} ETL steps completed successfully.`);
                    return { hasFailed: false, logs: latestLogs };
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

/* ============================================================
   FORMAT AUDIT DATE (for ETL logs)
============================================================ */

function formatAuditDate(dateString) {
    if (!dateString) return "—";

    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(dateString);
    const d = new Date(hasTimezone ? dateString : `${dateString}Z`);

    if (isNaN(d.getTime())) {
        return dateString;
    }

    return d.toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });
}

/* ============================================================
   SEARCH ETL RUN LOGS
   Filters the full cache, then re-paginates from page 1
============================================================ */

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
   ACTION CONFIRMATION MODAL (universal)
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

    // Fallback to native confirm if modal markup is missing
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

    // Clean clones to prevent listener stacking
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

    // Click outside to close (treats as cancel)
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove("show");
            onCancel && onCancel();
        }
    };

    modal.classList.add("show");
}


/* ============================================================
   PAGINATION HELPERS (shared)
   - If containerId is a <tbody>, controls are placed right after its <table>
   - Otherwise controls are appended inside the container
============================================================ */

function renderPaginationUI(containerId, currentPage, totalPages, onPageChange, paginationWrapperId, meta = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    removePaginationControls(paginationWrapperId);

    const totalItems = Number(meta.totalItems) || 0;
    const pageSize   = Number(meta.pageSize) || ITEMS_PER_PAGE;
    const label      = meta.label || "items";

    const from = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const to   = Math.min(currentPage * pageSize, totalItems);

    // Build page list with ellipsis: 1 … 4 5 6 … 12
    const pages = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        if (currentPage > 3) pages.push("...");
        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
        if (currentPage < totalPages - 2) pages.push("...");
        pages.push(totalPages);
    }

    const wrapper = document.createElement("div");
    wrapper.id = paginationWrapperId;
    wrapper.className = "pagination-bar";

    const pageButtons = pages.map(p => {
        if (p === "...") return `<span class="pg-ellipsis">…</span>`;
        return `<button type="button" class="pg-btn pg-num ${p === currentPage ? "active" : ""}" data-page="${p}">${p}</button>`;
    }).join("");

    wrapper.innerHTML = `
        <span class="pagination-info">Showing ${from}–${to} of ${totalItems} ${escapeHtml(label)}</span>
        <div class="pagination-controls">
            <button type="button" class="pg-btn pg-prev" ${currentPage === 1 ? "disabled" : ""}>« Prev</button>
            ${pageButtons}
            <button type="button" class="pg-btn pg-next" ${currentPage === totalPages ? "disabled" : ""}>Next »</button>
        </div>
    `;

    wrapper.querySelector(".pg-prev").addEventListener("click", () => {
        if (currentPage > 1) onPageChange(currentPage - 1);
    });
    wrapper.querySelector(".pg-next").addEventListener("click", () => {
        if (currentPage < totalPages) onPageChange(currentPage + 1);
    });
    wrapper.querySelectorAll(".pg-num").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = Number(btn.dataset.page);
            if (target !== currentPage) onPageChange(target);
        });
    });

    if (container.tagName === "TBODY") {
        // Place the bar OUTSIDE the table's scroll wrapper (inside the card)
        const table = container.closest("table");
        const host = table.parentNode;
        host.parentNode.insertBefore(wrapper, host.nextSibling);
    } else {
        container.appendChild(wrapper);
    }
}

function removePaginationControls(paginationWrapperId) {
    const existing = document.getElementById(paginationWrapperId);
    if (existing) existing.remove();
}

/* ============================================================
   SUCCESS / ERROR MODAL
   Replaces native alert() for post-action feedback
============================================================ */

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

    if (!modal || !titleEl || !messageEl || !closeBtn) {
        alert(message.replace(/<[^>]*>/g, ""));
        onClose && onClose();
        return;
    }

    titleEl.textContent = title;
    titleEl.style.color = titleColor;
    messageEl.innerHTML = message;
    closeBtn.textContent = confirmText;

    if (iconEl) {
        iconEl.textContent = icon;
        iconEl.style.background = iconBg;
    }

    // Clean clone to prevent listener stacking
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    newCloseBtn.addEventListener("click", function () {
        modal.classList.remove("show");
        onClose && onClose();
    });

    // Click outside to close
    modal.onclick = function (e) {
        if (e.target === modal) {
            modal.classList.remove("show");
            onClose && onClose();
        }
    };

    modal.classList.add("show");
}
/* ============================================================
   MARKET DATA UPLOAD — TRIGGERS ETL + FORECAST
============================================================ */

let mpSelectedFile = null;

function initMarketUploadSection() {
    const uploadArea = document.getElementById("mpUploadArea");
    const fileInput  = document.getElementById("mpFileInput");
    const uploadBtn  = document.getElementById("mpUploadBtn");
    const clearBtn   = document.getElementById("mpClearFileBtn");

    if (!uploadArea || !fileInput) return;

    // Click to browse
    uploadArea.addEventListener("click", () => fileInput.click());

    // Drag over
    uploadArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = "var(--primary)";
        uploadArea.style.background  = "#F0F5F2";
    });

    uploadArea.addEventListener("dragleave", () => {
        uploadArea.style.borderColor = "var(--border)";
        uploadArea.style.background  = "#FAFBF9";
    });

    // Drop
    uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = "var(--border)";
        uploadArea.style.background  = "#FAFBF9";
        const file = e.dataTransfer.files[0];
        if (file) handleMarketFile(file);
    });

    // File selected
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) handleMarketFile(file);
    });

    // Clear button
    clearBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        resetMarketUpload();
    });

    // Upload button
    uploadBtn?.addEventListener("click", uploadMarketFile);
}

function handleMarketFile(file) {
    const validExt = /\.(xlsx|xls)$/i.test(file.name);
    if (!validExt) {
        showMarketStatus("error", "❌ Only .xlsx or .xls files are allowed.");
        return;
    }

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

    const colors = {
        info:    { bg: "#EFF6FF", color: "#1E40AF", border: "#BFDBFE" },
        success: { bg: "#ECFDF5", color: "#065F46", border: "#A7F3D0" },
        error:   { bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" }
    };
    const c = colors[type] || colors.info;

    el.style.background = c.bg;
    el.style.color = c.color;
    el.style.border = `1px solid ${c.border}`;
    el.innerHTML = message;
    el.style.display = "block";
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

        const response = await fetch(
            `${API_BASE_URL}/api/market-prices/upload`,
            {
                method: "POST",
                headers: getAuthHeaders(false),
                body: formData
            }
        );

        const data = await parseResponse(response);

        if (!response.ok) {
            throw new Error(data.detail || "Upload failed.");
        }

        showMarketStatus(
            "success",
            `<strong>File received.</strong><br>` +
            `ETL pipeline and forecast are running in the background.<br>` +
            `Refreshing ETL logs in <b>30 seconds...</b>`
        );

        // Reset the file selection after successful upload
        mpSelectedFile = null;
        document.getElementById("mpFileInput").value = "";
        document.getElementById("mpFilePreview").style.display = "none";

        // ----------------------------------------------
        // AUTO-REFRESH ETL LOGS AFTER 30 SECONDS
        // ----------------------------------------------
        setTimeout(async () => {
            try {
                // Only refresh if ETL view exists in DOM
                if (document.getElementById("etlRows")) {
                    currentEtlPage = 1; // reset to page 1
                    await loadETLRunLogs();
                }

                showMarketStatus(
                    "success",
                    `<strong>File processed.</strong><br>` +
                    `ETL logs refreshed. Check the <strong>Monitor ETL Pipeline</strong> tab for new entries.<br>` +
                    `Forecasts will appear on the AEW dashboard shortly.`
                );
            } catch (err) {
                console.error("Post-upload refresh error:", err);
            }
        }, 30000); // 30 seconds

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
   END OF da.js
============================================================ */

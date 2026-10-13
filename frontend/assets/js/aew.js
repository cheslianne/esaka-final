/* ============================================================
   E SAKA — AEW DASHBOARD
   Complete Frontend JavaScript (FIXED VERSION)
============================================================ */

/* ============================================================
   API CONFIGURATION
============================================================ */

const API_BASE_URL = window.API_BASE_URL || "https://esaka-backend-production.up.railway.app";

const FARMERS_ENDPOINT = `${API_BASE_URL}/api/farmers/farmers/`;
const PLANTING_INTENTS_ENDPOINT = `${API_BASE_URL}/api/planting-intents/`;
const RAW_PLANT_REPORTS_ENDPOINT = `${API_BASE_URL}/api/raw-plant-reports/from-planting-intent`;
const REPORT_SUBMISSIONS_ENDPOINT = `${API_BASE_URL}/api/report-submissions`;
const AEW_REVISION_ENDPOINT = `${API_BASE_URL}/api/report-submissions/awaiting-aew-revision`;
const OFFTAKE_REQUESTS_ENDPOINT = `${API_BASE_URL}/api/offtake-requests/`;
const FORECASTS_ENDPOINT = `${API_BASE_URL}/api/forecasts/`;

/* ============================================================
   AUTH
============================================================ */

function getAuthToken() {
    return "cookie-session";
}

function getAuthHeaders() {
    const token = getAuthToken();
    const headers = { "Content-Type": "application/json" };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

/* ============================================================
   STATE
============================================================ */

let FARMERS_DATA = [];
let allFarmers = [];
let allBuyers = [];

// Planting Intent
let PLANTING_INTENTS_DATA = [];
let filteredPlantingIntents = null;
let currentFinalizedIntentsFilter = "all";

// Pagination
let currentFarmersPage = 1;
let currentPlantingIntentsPage = 1;
const farmersPerPage = 10;
const plantingIntentsPerPage = 7;
const draftIntentsPerPage = 7;
let currentDraftIntentsPage = 1;
let currentSubmittedIntentsPage = 1;

// Farmer state
let currentActiveFarmer = null;
let isEditMode = false;
let mapInstance = null;

let MUNICIPALITY_MAP_RAW_DATA = [];
let mapMarkersLayer = null;

// Offtake state
let currentOfftakePage = 1;
const offtakePerPage = 7;
let filteredOfftakeRequests = null;
let OFFTAKE_REQUESTS_DATA = [];          // ✅ IDAGDAG
let currentOfftakeRequest = null;  

// Forecasting
let FORECASTS_DATA = [];
let PRICE_DATA = [];
let priceChartInstance = null;
let isForecastLoading = false;
const PRICE_DATA_ENDPOINT = `${API_BASE_URL}/api/price-data/`;

/* ============================================================
   MARKET PRICE DASHBOARD
   DA-AMAD Wholesale + Retail
============================================================ */

let MARKET_PRICES_DATA = [];
let MARKET_PRICE_FORECASTS_DATA = [];
let marketPriceChartInstance = null;
let isMarketPriceLoading = false;
let marketPriceFiltersBound = false;

const MARKET_PRICES_ENDPOINT = `${API_BASE_URL}/api/market-prices/`;
const MARKET_PRICE_FORECASTS_ENDPOINT = `${API_BASE_URL}/api/market-price-forecasts/monthly`;
const AEW_DASHBOARD_ENDPOINT = `${API_BASE_URL}/api/aew/dashboard`;

// Reporting
let allIndividualReports = [];
let individualFilterStatus = 'all';
let INDIVIDUAL_REPORTS_DATA = [];
let SUBMITTED_REPORTS_DATA = [];
let currentIndividualReportsPage = 1;
let currentSubmittedReportsPage = 1;
const reportsPerPage = 10;

/* ============================================================
   PROFILE & AVATAR PERSISTENCE (AEW)
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

    const availableAvatarSources = Array.from(avatarOptions)
        .map((option) => option.dataset.avatarImg)
        .filter(Boolean);
    const savedAvatarSource = localStorage.getItem("user_avatar_src");
    let currentSelectedSrc = availableAvatarSources.includes(savedAvatarSource)
        ? savedAvatarSource
        : "../images/1.png";

    function loadSavedProfile() {
        // Load saved display name
        const savedName = localStorage.getItem("user_display_name");
        if (savedName) {
            const displayNameEl = document.getElementById("userDisplayName");
            if (displayNameEl) displayNameEl.textContent = savedName;
        }

        // Load saved avatar
        const savedAvatar = availableAvatarSources.includes(localStorage.getItem("user_avatar_src"))
            ? localStorage.getItem("user_avatar_src")
            : currentSelectedSrc;
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
        const currentName = document.getElementById("userDisplayName")?.textContent || "";
        const nameParts = currentName.trim().split(" ");

        if (profileFirstName) profileFirstName.value = nameParts[0] || "";
        if (profileLastName) profileLastName.value = nameParts.slice(1).join(" ") || "";

        if (profileUsername) {
            profileUsername.value = localStorage.getItem("username") || localStorage.getItem("user_id") || "aew_user_01";
        }

        avatarOptions.forEach((opt) => {
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
    console.log("eSaka AEW Dashboard loaded.");

    initSidebar();
    initViewNavigation();
    initMap();
    loadMunicipalityMapData();
    initFarmerSubviews();
    initPlantingIntent();
    initOfftakeRequest();
    initFairPrice();
    initFairPriceMonthDropdown();
    initSignout();
    setupUserProfile();
    initProfileModal();
    initForecastResults();
    initReporting();
    initNotificationBell();
    initFinalizedIntentsFilter();

    await fetchFarmers();
    await fetchPlantingIntents();
    await loadReports();
    await fetchOfftakeRequests();

    populateFarmerDropdowns();
    setupFarmerDropdownAutoFill();

    initAddIntentButton();

    initFarmerSearch();
    initializePlantingIntentSearch();
    initMarketPriceDashboard();
    initAewDashboard();
});

function dashboardDate(value) {
    if (!value) return "No data";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "No data" : date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function dashboardNumber(value) {
    return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function dashboardSwitchView(view) {
    const button = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (button) button.click();
}

function initAewDashboard() {
    document.querySelectorAll("[data-dashboard-view]").forEach((button) => {
        button.addEventListener("click", () => dashboardSwitchView(button.dataset.dashboardView));
    });
    document.getElementById("aewDashboardKpis")?.addEventListener("click", (event) => {
        const card = event.target.closest("[data-dashboard-view]");
        if (card) dashboardSwitchView(card.dataset.dashboardView);
    });
    document.getElementById("aewDashboardKpis")?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const card = event.target.closest("[data-dashboard-view]");
        if (!card) return;
        event.preventDefault();
        dashboardSwitchView(card.dataset.dashboardView);
    });
    loadAewDashboard();
}

async function loadAewDashboard() {
    const actionsHost = document.getElementById("aewDashboardActions");
    try {
        const response = await fetch(AEW_DASHBOARD_ENDPOINT, { headers: { "Accept": "application/json" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        renderAewDashboard(await response.json());
    } catch (error) {
        console.error("Failed to load AEW dashboard:", error);
        if (actionsHost) actionsHost.innerHTML = '<div class="aew-empty" role="alert">Dashboard data could not be loaded. Please refresh and try again.</div>';
    }
}

function renderAewDashboard(data) {
    const greeting = document.getElementById("aewDashboardGreeting");
    const location = document.getElementById("aewDashboardLocation");
    const freshness = document.getElementById("aewDashboardFreshness");
    if (greeting) greeting.textContent = `Mabuhay, ${data.aew_name || "AEW"}!`;
    if (location) location.textContent = `${data.municipality || "Municipality not set"} · ${dashboardDate(data.today)}`;
    if (freshness) freshness.innerHTML = [
        ["PSA OpenSTAT", data.freshness?.psa_openstat],
        ["Bantay Presyo", data.freshness?.bantay_presyo],
    ].map(([label, value]) => `<span class="aew-chip">${escapeHtml(label)}: ${escapeHtml(dashboardDate(value))}</span>`).join("");
    const kpis = [
        ["Registered Farmers", data.kpis.registered_farmers],
        ["Active Planting Intents", data.kpis.active_planting_intents],
        ["Expected Harvest · 30 days (kg)", data.kpis.expected_harvest_30d_kg],
        ["Reports Needing Revision", data.kpis.reports_needing_revision],
    ];
    const kpiViews = ["farmers", "planting-intent", "planting-intent", "reports"];
    document.getElementById("aewDashboardKpis").innerHTML = kpis.map(([label, value], index) => `<div class="aew-kpi" role="button" tabindex="0" data-dashboard-view="${kpiViews[index]}" aria-label="Open ${escapeHtml(label)}"><strong>${dashboardNumber(value)}</strong><span>${escapeHtml(label)}</span></div>`).join("");

    const actions = data.action_required || [];
    document.getElementById("aewDashboardActions").innerHTML = actions.length ? actions.slice(0, 8).map((item) => `<div class="aew-action"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div><button type="button" data-dashboard-view="${escapeHtml(item.view)}">${item.type === "revise_report" ? "Fix Report" : item.type === "match_offtake" ? "Match Offtake" : item.type === "confirm_planting" ? "Confirm Planted" : "Resume Form"}</button></div>`).join("") : '<div class="aew-empty">Nothing needs attention right now.</div>';
    document.querySelectorAll("#aewDashboardActions [data-dashboard-view]").forEach((button) => button.addEventListener("click", () => dashboardSwitchView(button.dataset.dashboardView)));

    const statusLabels = [["draft", "Draft"], ["not_planted", "Not Planted"], ["planted", "Planted"], ["harvested", "Harvested"], ["mediating", "Mediating"]];
    document.getElementById("aewDashboardStatuses").innerHTML = statusLabels.map(([key, label]) => `<div class="aew-status-item"><strong>${dashboardNumber(data.intent_breakdown?.[key])}</strong><span>${label}</span></div>`).join("");
    document.getElementById("aewDashboardPipeline").innerHTML = [["draft", "Draft"], ["municipal_pending", "Municipal Pending"], ["provincial", "Provincial"], ["approved", "Approved"]].map(([key, label]) => `<div class="aew-status-item"><strong>${dashboardNumber(data.report_pipeline?.[key])}</strong><span>${label}</span></div>`).join("");

    const supplyRows = data.supply_outlook || [];
    const maxSupply = Math.max(...supplyRows.map((row) => Object.values(row.volumes || {}).reduce((sum, value) => sum + Number(value || 0), 0)), 1);
    const chartColors = {
        "Red Onion": "#167A58",
        "White Onion": "#4385B7",
        Tomato: "#D65B4A",
        Squash: "#D28A16",
        Other: "#67756D",
    };
    document.getElementById("aewDashboardSupply").innerHTML = supplyRows.length
        ? `<div class="aew-chart">${supplyRows.map((row) => {
            const total = Object.values(row.volumes || {}).reduce((sum, value) => sum + Number(value || 0), 0);
            const bars = Object.entries(row.volumes || {}).map(([commodity, volume]) => `<span class="aew-chart-bar" style="height:${Math.max(Number(volume || 0) / maxSupply * 150, Number(volume || 0) ? 4 : 0)}px;background:${chartColors[commodity] || chartColors.Other}" title="${escapeHtml(commodity)}: ${dashboardNumber(volume)} kg"></span>`).join("");
            return `<div class="aew-chart-month"><div class="aew-chart-stack">${bars}</div><strong>${escapeHtml(row.label)}</strong><small>${dashboardNumber(total)} kg</small></div>`;
        }).join("")}</div><div class="aew-chart-legend">${Object.entries(chartColors).filter(([label]) => label !== "Other").map(([label, color]) => `<span><i class="aew-legend-dot" style="background:${color}"></i>${escapeHtml(label)}</span>`).join("")}</div>`
        : '<div class="aew-empty">No supply outlook data.</div>';

    document.getElementById("aewDashboardPrices").innerHTML = (data.fair_prices || []).map((price) => `<div class="aew-price-card"><div><strong>${escapeHtml(price.commodity)}</strong><small>${escapeHtml(price.last_price_label || "Latest monthly average")}: ${price.last_price == null ? "No data" : `₱${Number(price.last_price).toFixed(2)}/kg`} · ${escapeHtml(price.trend)}</small></div><div><strong>${price.forecast_low == null ? "No forecast" : `₱${Number(price.forecast_low).toFixed(2)}–₱${Number(price.forecast_high).toFixed(2)}`}</strong><small>${price.offtake_below_fair ? `<span class="aew-warning">${price.offtake_below_fair} offtake request(s) below fair range</span>` : escapeHtml(price.forecast_label || "Next-month forecast range")}</small></div></div>`).join("") || '<div class="aew-empty">No farmgate price data.</div>';

    document.getElementById("aewDashboardMap").innerHTML = (data.map || []).slice(0, 5).map((entry) => `<div class="aew-action"><div><strong>${escapeHtml(entry.municipality)}</strong><small>${(entry.commodities || []).map((item) => `${escapeHtml(item.commodity)}: ${escapeHtml(item.status)}`).join(" · ") || "No data"}</small></div></div>`).join("") || '<div class="aew-empty">No municipal supply markers available.</div>';
}


/* ============================================================
   USER PROFILE
============================================================ */

function getInitials(name) {
    if (!name) return "--";

    const cleaned = String(name)
        .replace(/^(aew|mcoord|admin|user|municipal|provincial|da)[_\s-]+/i, "")
        .replace(/[_\-.]+/g, " ")
        .trim();

    if (!cleaned) return "--";

    const parts = cleaned.split(/\s+/).filter(Boolean);

    if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
    }

    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatRole(role) {
    if (!role) return "";
    return String(role)
        .replace(/_/g, " ")
        .toUpperCase();
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
    const validAvatar = /^..\/images\/(?:[1-9]|1[0-2])\.png$/.test(storedAvatar || "")
        ? storedAvatar
        : "../images/1.png";

    const nameEl = document.getElementById("userDisplayName");
    const roleEl = document.getElementById("userDisplayRole");
    const initEl = document.getElementById("userDisplayInitials");

    if (nameEl && storedName) nameEl.textContent = storedName;
    if (roleEl && storedRole) roleEl.textContent = formatRole(storedRole);

    // Show avatar image if saved, otherwise show initials
    if (initEl) {
        if (storedAvatar) {
            initEl.innerHTML = `<img src="${validAvatar}" alt="Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            initEl.style.background = "transparent";
        } else {
            initEl.textContent = getInitials(storedName || storedRole);
        }
    }
}


/* ============================================================
   API REQUEST HELPER
============================================================ */

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...getAuthHeaders(),
            ...(options.headers || {})
        }
    });

    let data = null;
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        try { data = await response.json(); } catch { data = null; }
    } else {
        try { data = await response.text(); } catch { data = null; }
    }

    if (!response.ok) {
        let message = `HTTP ${response.status}`;
        if (data && typeof data === "object") {
            if (data.detail) {
                message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
            }
        } else if (typeof data === "string" && data.trim()) {
            message = data;
        }
        const error = new Error(message);
        error.status = response.status;
        error.data = data;
        throw error;
    }

    return data;
}

function handleAuthError(error) {
    if (error && (error.status === 401 || error.status === 403)) {
        console.warn("Authentication/authorization error:", error);
        return true;
    }
    return false;
}

/* ============================================================
   SIDEBAR
============================================================ */

function initSidebar() {
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const sidebar = document.getElementById("sidebar");

    if (!hamburgerBtn || !sidebar) return;

    let hoverTimer = null;

    hamburgerBtn.addEventListener("mouseenter", function() {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
        setTimeout(function() {
            sidebar.classList.add("open");
            setTimeout(function() {
                if (mapInstance) mapInstance.invalidateSize();
            }, 300);
        }, 100);
    });

    sidebar.addEventListener("mouseleave", function() {
        hoverTimer = setTimeout(function() {
            sidebar.classList.remove("open");
        }, 200);
    });

    sidebar.addEventListener("mouseenter", function() {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
    });

    document.addEventListener("click", function(event) {
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnHamburger = hamburgerBtn.contains(event.target);
        if (!isClickInsideSidebar && !isClickOnHamburger) {
            sidebar.classList.remove("open");
        }
    });

    sidebar.querySelectorAll(".nav-item").forEach(function(item) {
        item.addEventListener("click", function() {
            sidebar.classList.remove("open");
        });
    });

    document.addEventListener("keydown", function(event) {
        if (event.key === "Escape") {
            sidebar.classList.remove("open");
        }
    });

    const signoutBtn = sidebar.querySelector(".signout");
    if (signoutBtn) {
        signoutBtn.addEventListener("click", function() {
            sidebar.classList.remove("open");
        });
    }
}

/* ============================================================
   VIEW NAVIGATION
============================================================ */

function initViewNavigation() {
    const navButtons = document.querySelectorAll(".nav-item[data-view]");
    const views = document.querySelectorAll(".view");

    function activateView(targetViewKey) {
        views.forEach(function(view) {
            view.classList.remove("active-view");
        });

        const targetView = document.getElementById("view-" + targetViewKey);
        if (targetView) {
            targetView.classList.add("active-view");
        }

        navButtons.forEach(function(navButton) {
            navButton.classList.toggle("active", navButton.dataset.view === targetViewKey);
        });

        if (targetViewKey === "map" && mapInstance) {
            setTimeout(function() {
                mapInstance.invalidateSize();
            }, 100);
        }
    }

    const initialView = document.querySelector(".nav-item[data-view].active")?.dataset.view;
    if (initialView) {
        window.history.replaceState(
            { ...window.history.state, esakaAewView: initialView },
            "",
            window.location.href
        );
    }

    navButtons.forEach(function(button) {
        button.addEventListener("click", function() {
            const targetViewKey = this.dataset.view;
            if (targetViewKey === document.querySelector(".nav-item[data-view].active")?.dataset.view) return;
            window.history.pushState(
                { ...window.history.state, esakaAewView: targetViewKey },
                "",
                window.location.href
            );
            activateView(targetViewKey);
        });
    });

    window.addEventListener("popstate", function(event) {
        const viewKey = event.state?.esakaAewView;
        if (viewKey && document.getElementById("view-" + viewKey)) {
            activateView(viewKey);
        }
    });
}

/* ============================================================
   SIGN OUT
============================================================ */

function initSignout() {
    const signoutBtn = document.getElementById("signoutBtn");
    if (!signoutBtn) return;

    signoutBtn.addEventListener("click", function() {
        localStorage.removeItem("access_token");
        localStorage.removeItem("token");
        localStorage.removeItem("full_name");
        localStorage.removeItem("name");
        localStorage.removeItem("username");
        localStorage.removeItem("role");
        window.location.href = "../index.html";
    });
}

/* ============================================================
   MAP
============================================================ */

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
}

/* ============================================================
   MUNICIPALITY COORDINATES & MAP DATA
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

/* ============================================================
   FARMER LOCATION DROPDOWNS
   Municipality → Barangay
   COMPLETE DATA — all 20 municipalities + Angeles City + Sasmuan
============================================================ */

const BARANGAYS_BY_MUNICIPALITY = {
    "Angeles City": [
        "Agapito del Rosario", "Amsic", "Anunas", "Balibago", "Capaya",
        "Claro M. Recto", "Cuayan", "Cutcut", "Cutud", "Lourdes North West",
        "Lourdes Sur", "Lourdes Sur East", "Malabanias", "Margot", "Mining",
        "Pampang", "Pandan", "Pulung Maragul", "Pulungbulu", "Pulung Cacutud",
        "Salapungan", "San Jose", "San Nicolas", "Santa Teresita",
        "Santa Trinidad", "Santo Cristo", "Santo Domingo", "Santo Rosario",
        "Sapalibutad", "Sapangbato", "Tabun", "Virgen Delos Remedios"
    ],

    "Apalit": [
        "Balucuc", "Calantipe", "Cansinala", "Capalangan", "Colgante",
        "Paligui", "Sampaloc", "San Juan", "San Vicente", "Sucad",
        "Sulipan", "Tabuyuc"
    ],

    "Arayat": [
        "Arenas", "Baliti", "Batasan", "Buensuceso", "Candating", "Cupang",
        "Gatiawin", "Guemasan", "Kaledian", "La Paz", "Lacmit", "Lacquios",
        "Mangga-Cacutud", "Mapalad", "Matamo", "Panlinlang", "Paralaya",
        "Plazang Luma", "Poblacion", "San Agustin Norte", "San Agustin Sur",
        "San Antonio", "San Jose Mesulo", "San Juan Bano", "San Mateo",
        "San Nicolas", "San Roque Bitas", "Santo Niño Tabuan", "Suclayin",
        "Telapayong"
    ],

    "Bacolor": [
        "Balas", "Cabalantian", "Cabambangan", "Cabetican", "Calibutbut",
        "Concepcion", "Dolores", "Duat", "Macabacle", "Magliman", "Maliwalu",
        "Mesalipit", "Parulog", "Potrero", "San Antonio", "San Isidro",
        "San Vicente", "Santa Barbara", "Santa Ines", "Talba", "Tinajero"
    ],

    "Candaba": [
        "Bahay Pare", "Bambang", "Barangca", "Barit", "Buas", "Cuayang Bugtong",
        "Dalayap", "Dulong Ilog", "Gulap", "Lanang", "Lourdes", "Magumbali",
        "Mandasig", "Mandili", "Mangga", "Mapaniqui", "Paligui", "Pangclara",
        "Pansinao", "Paralaya", "Pasig", "Pescadores", "Pulong Gubat",
        "Pulong Palazan", "Salapungan", "San Agustin", "Santo Rosario",
        "Tagulod", "Talang", "Tenejero", "Vizal San Pablo",
        "Vizal Santo Cristo", "Vizal Santo Niño"
    ],

    "Floridablanca": [
        "Anon", "Apalit", "Basa Air Base", "Benedicto", "Bodega",
        "Cabangcalan", "Calantas", "Carmencita", "Consuelo", "Dampe",
        "Del Carmen", "Fortuna", "Gutad", "Mabical", "Maligaya", "Mawacat",
        "Nabuclod", "Pabanlag", "Paguiruan", "Palmayo", "Pandaguirig",
        "Poblacion", "San Antonio", "San Isidro", "San Jose", "San Nicolas",
        "San Pedro", "San Ramon", "San Roque", "Santa Monica",
        "Santo Rosario", "Solib", "Valdez"
    ],

    "Guagua": [
        "Ascomo", "Bancal", "Jose Abad Santos", "Lambac", "Magsaysay",
        "Maquiapo", "Natividad", "Plaza Burgos", "Pulungmasle", "Rizal",
        "San Agustin", "San Antonio", "San Isidro", "San Jose", "San Juan",
        "San Juan Bautista", "San Juan Nepomuceno", "San Matias",
        "San Miguel", "San Nicolas 1st", "San Nicolas 2nd", "San Pablo",
        "San Pedro", "San Rafael", "San Roque", "San Vicente",
        "Santa Filomena", "Santa Ines", "Santa Ursula", "Santo Cristo",
        "Santo Niño"
    ],

    "Lubao": [
        "Balantacan", "Bancal Pugad", "Bancal Sinubli", "Baruya", "Calangain",
        "Concepcion", "De La Paz", "Del Carmen", "Don Ignacio Dimson",
        "Lourdes", "Prado Siongco", "Remedios", "San Agustin", "San Antonio",
        "San Francisco", "San Isidro", "San Jose Apunan", "San Jose Gumi",
        "San Juan", "San Matias", "San Miguel", "San Nicolas 1st",
        "San Nicolas 2nd", "San Pablo 1st", "San Pablo 2nd",
        "San Pedro Palcarangan", "San Pedro Saug", "San Roque Arbol",
        "San Roque Dau", "San Vicente", "Santa Barbara", "Santa Catalina",
        "Santa Cruz", "Santa Lucia", "Santa Maria", "Santa Monica",
        "Santa Rita", "Santa Teresa 1st", "Santa Teresa 2nd", "Santiago",
        "Santo Cristo", "Santo Domingo", "Santo Niño", "Santo Tomas"
    ],

    "Mabalacat": [
        "Atlu-Bola", "Bical", "Bundagul", "Cacutud", "Calumpang",
        "Camachiles", "Dapdap", "Dau", "Dolores", "Duquit", "Lakandula",
        "Mabiga", "Macapagal Village", "Mamatitang", "Mangalit",
        "Marcos Village", "Mawaque", "Paralayunan", "Poblacion",
        "San Francisco", "San Joaquin", "Santa Ines", "Santa Maria",
        "Santo Rosario", "Sapang Balen", "Sapang Biabas", "Tabun"
    ],

    "Macabebe": [
        "Batasan", "Caduang Tete", "Candelaria", "Castuli", "Consuelo",
        "Dalayap", "Mataguiti", "San Esteban", "San Francisco",
        "San Gabriel", "San Isidro", "San Jose", "San Juan", "San Rafael",
        "San Roque", "San Vicente", "Santa Cruz", "Santa Lutgarda",
        "Santa Maria", "Santa Rita", "Santo Niño", "Santo Rosario",
        "Saplad David", "Tacasan", "Telacsan"
    ],

    "Magalang": [
        "Ayala", "Bucanan", "Camias", "Dolores", "Escaler", "La Paz",
        "Navaling", "San Agustin", "San Antonio", "San Francisco",
        "San Ildefonso", "San Isidro", "San Jose", "San Miguel",
        "San Nicolas 1st", "San Nicolas 2nd", "San Pablo", "San Pedro I",
        "San Pedro II", "San Roque", "San Vicente", "Santa Cruz",
        "Santa Lucia", "Santa Maria", "Santo Niño", "Santo Rosario", "Turu"
    ],

    "Masantol": [
        "Alauli", "Bagang", "Balibago", "Bebe Anac", "Bebe Matua",
        "Bulacus", "Cambasi", "Malauli", "Nigui", "Palimpe", "Puti",
        "Sagrada", "San Agustin", "San Isidro Anac", "San Isidro Matua",
        "San Nicolas", "San Pedro", "Santa Cruz", "Santa Lucia Anac",
        "Santa Lucia Matua", "Santa Lucia Paguiba", "Santa Lucia Wakas",
        "Santa Monica", "Santo Niño", "Sapang Kawayan", "Sua"
    ],

    "Mexico": [
        "Acli", "Anao", "Balas", "Buenavista", "Camuning", "Cawayan",
        "Concepcion", "Culubasa", "Divisoria", "Dolores", "Eden",
        "Gandus", "Lagundi", "Laput", "Laug", "Masamat", "Masangsang",
        "Nueva Victoria", "Pandacaqui", "Pangatlan", "Panipuan", "Parian",
        "Sabanilla", "San Antonio", "San Carlos", "San Jose Malino",
        "San Jose Matulid", "San Juan", "San Lorenzo", "San Miguel",
        "San Nicolas", "San Pablo", "San Patricio", "San Rafael",
        "San Roque", "San Vicente", "Santa Cruz", "Santa Maria",
        "Santo Domingo", "Santo Rosario", "Sapang Maisac", "Suclaban",
        "Tangle"
    ],

    "Minalin": [
        "Bulac", "Dawe", "Lourdes", "Maniango", "San Francisco 1st",
        "San Francisco 2nd", "San Isidro", "San Nicolas", "San Pedro",
        "Santa Catalina", "Santa Maria", "Santa Rita", "Santo Domingo",
        "Santo Rosario", "Saplad"
    ],

    "Porac": [
        "Babo Pangulo", "Babo Sacan", "Balubad", "Calzadang Bayu",
        "Camias", "Cangatba", "Diaz", "Dolores", "Inararo", "Jalung",
        "Mancatian", "Manibaug Libutad", "Manibaug Paralaya",
        "Manibaug Pasig", "Manuali", "Mitla Proper", "Palat", "Pias",
        "Pio", "Planas", "Poblacion", "Pulong Santol", "Salu",
        "San Jose Mitla", "Santa Cruz", "Sapang Uwak", "Sepung Bulaun",
        "Sinura", "Villa Maria"
    ],

    "San Fernando": [
        "Alasas", "Baliti", "Bulaon", "Calulut", "Del Carmen",
        "Del Pilar", "Del Rosario", "Dela Paz Norte", "Dela Paz Sur",
        "Dolores", "Juliana", "Lara", "Lourdes", "Magliman", "Maimpis",
        "Malino", "Malpitic", "Pandaras", "Panipuan", "Pulung Bulu",
        "Quebiauan", "Saguin", "San Agustin", "San Felipe", "San Isidro",
        "San Jose", "San Juan", "San Nicolas", "San Pedro",
        "Santa Lucia", "Santa Teresita", "Santo Niño", "Santo Rosario",
        "Sindalan", "Telabastagan"
    ],

    "San Luis": [
        "San Agustin", "San Carlos", "San Isidro", "San Jose", "San Juan",
        "San Nicolas", "San Roque", "San Sebastian", "Santa Catalina",
        "Santa Cruz Pambilog", "Santa Cruz Poblacion", "Santa Lucia",
        "Santa Monica", "Santa Rita", "Santo Niño", "Santo Rosario",
        "Santo Tomas"
    ],

    "San Simon": [
        "Concepcion", "De La Paz", "San Agustin", "San Isidro", "San Jose",
        "San Juan", "San Miguel", "San Nicolas", "San Pablo Libutad",
        "San Pablo Proper", "San Pedro", "Santa Cruz", "Santa Monica",
        "Santo Niño"
    ],

    "Santa Ana": [
        "San Agustin", "San Bartolome", "San Isidro", "San Joaquin",
        "San Jose", "San Juan", "San Nicolas", "San Pablo", "San Pedro",
        "San Roque", "Santa Lucia", "Santa Maria", "Santiago",
        "Santo Rosario"
    ],

    "Santa Rita": [
        "Becuran", "Dila-dila", "San Agustin", "San Basilio", "San Isidro",
        "San Jose", "San Juan", "San Matias", "San Vicente", "Santa Monica"
    ],

    "Santo Tomas": [
        "Moras de La Paz", "Poblacion", "San Bartolome", "San Matias",
        "San Vicente", "Santo Rosario", "Sapa"
    ],

    "Sasmuan": [
        "Batang 1st", "Batang 2nd", "Mabuanbuan", "Malusac", "Sabitanan",
        "San Antonio", "San Nicolas 1st", "San Nicolas 2nd", "San Pedro",
        "Santa Lucia", "Santa Monica", "Santo Tomas"
    ]
};

function initFarmerLocationDropdowns() {
    const municipalitySelect = document.getElementById("regMunicipality");
    const barangaySelect = document.getElementById("regBarangay");

    if (!municipalitySelect || !barangaySelect) {
        console.warn("Farmer location dropdowns not found.");
        return;
    }

    municipalitySelect.innerHTML = `
        <option value="" disabled selected>Select Municipality</option>
    `;

    Object.keys(BARANGAYS_BY_MUNICIPALITY).forEach(function(municipality) {
        const option = document.createElement("option");
        option.value = municipality;
        option.textContent = municipality;
        municipalitySelect.appendChild(option);
    });

    barangaySelect.innerHTML = `
        <option value="" disabled selected>
            Select Municipality first
        </option>
    `;

    barangaySelect.disabled = true;

    municipalitySelect.addEventListener("change", function() {
        const selectedMunicipality = this.value;
        const barangays = BARANGAYS_BY_MUNICIPALITY[selectedMunicipality] || [];

        barangaySelect.innerHTML = `
            <option value="" disabled selected>
                Select Barangay
            </option>
        `;

        barangays.forEach(function(barangay) {
            const option = document.createElement("option");
            option.value = barangay;
            option.textContent = barangay;
            barangaySelect.appendChild(option);
        });

        barangaySelect.disabled = barangays.length === 0;
    });
}

function resetFarmerLocationDropdowns() {
    const municipalitySelect = document.getElementById("regMunicipality");
    const barangaySelect = document.getElementById("regBarangay");

    if (!municipalitySelect || !barangaySelect) return;

    municipalitySelect.value = "";

    barangaySelect.innerHTML = `
        <option value="" disabled selected>
            Select Municipality first
        </option>
    `;

    barangaySelect.value = "";
    barangaySelect.disabled = true;
}


async function loadMunicipalityMapData() {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/planting-intents/municipality-map`,
            {
                method: "GET",
                headers: { "Accept": "application/json" }
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log("AEW Municipality Map Data:", result);

        if (!result.data || !Array.isArray(result.data)) {
            console.warn("No municipality map data found.");
            return;
        }

        MUNICIPALITY_MAP_RAW_DATA = result.data;
        renderFilteredMapMarkers();

        document.getElementById('filterCommodity')?.addEventListener('change', renderFilteredMapMarkers);
        document.getElementById('filterStatus')?.addEventListener('change', renderFilteredMapMarkers);

    } catch (error) {
        console.error("Failed to load AEW municipality map data:", error);
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
   FARMERS
============================================================ */

function normalizeFarmer(farmer) {
    return {
        farmer_id: farmer.farmer_id ?? null,
        rsbsa_id: farmer.rsbsa_id ?? "",
        first_name: farmer.first_name ?? "",
        middle_name: farmer.middle_name ?? "",
        last_name: farmer.last_name ?? "",
        suffix: farmer.suffix ?? "",
        address: farmer.address ?? "",
        sex: farmer.sex ?? "",
        birthdate: farmer.birthdate ?? "",
        email_address: farmer.email_address ?? "",
        phone_number: farmer.phone_number ?? "",
        region: farmer.region ?? "",
        municipality: farmer.municipality ?? "",
        barangay: farmer.barangay ?? "",
        status: farmer.status ?? "Active"
    };
}

function getFarmerFullName(farmer) {
    return [
        farmer.first_name,
        farmer.middle_name ? farmer.middle_name.charAt(0) + "." : "",
        farmer.last_name,
        farmer.suffix
    ].filter(Boolean).join(" ");
}

async function fetchFarmers() {
    const tbody = document.getElementById("farmersTableBody");
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center;">Loading farmers...</td></tr>`;
    }

    try {
        const data = await apiRequest(FARMERS_ENDPOINT, { method: "GET" });
        const farmers = Array.isArray(data)
            ? data
            : Array.isArray(data?.farmers)
                ? data.farmers
                : Array.isArray(data?.data)
                    ? data.data
                    : null;

        if (!farmers) {
            throw new Error("Invalid farmers response.");
        }

        allFarmers = farmers;
        FARMERS_DATA = farmers.map(normalizeFarmer);
        currentFarmersPage = 1;
        renderFarmersTable();
        populateFarmerDropdowns();
        return FARMERS_DATA;
    } catch (error) {
        console.error("Unable to load farmers:", error);
        FARMERS_DATA = [];
        const sessionExpired = error && (error.status === 401 || error.status === 403);
        if (tbody) {
            tbody.innerHTML = sessionExpired
                ? `<tr><td colspan="6" style="padding:30px; text-align:center; color:#C0392B;">Your session has expired or you are not logged in.<br><a href="../login.html">Log in again</a></td></tr>`
                : `<tr><td colspan="6" style="padding:30px; text-align:center; color:#C0392B;">Failed to load farmers.<br><small>${escapeHtml(error.message || "Please check the FastAPI server.")}</small></td></tr>`;
        }
        updatePagination();
        return [];
    }
}

function renderFarmersTable() {
    const tbody = document.getElementById("farmersTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";
    const start = (currentFarmersPage - 1) * farmersPerPage;
    const end = start + farmersPerPage;
    const paginatedItems = FARMERS_DATA.slice(start, end);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#777;">No farmers found.</td></tr>`;
        updatePagination();
        return;
    }

    paginatedItems.forEach(function(farmer) {
        const tr = createFarmerTableRow(farmer);
        tbody.appendChild(tr);
    });

    updatePagination();
}

function createFarmerTableRow(farmer) {
    const tr = document.createElement("tr");
    tr.className = "clickable-row";

    const fullName = getFarmerFullName(farmer);

    tr.innerHTML = `
        <td><span class="pill">${escapeHtml(fullName)}</span></td>
        <td><span class="pill">${escapeHtml(farmer.rsbsa_id || "-")}</span></td>
        <td><span class="pill">${escapeHtml(farmer.municipality || "-")}</span></td>
        <td><span class="pill">${escapeHtml(farmer.barangay || "-")}</span></td>
        <td style="text-align: center;"><span class="status-pill active">${escapeHtml(farmer.status || "Active")}</span></td>
    `;

    tr.addEventListener("click", function() {
        openManageFarmer(farmer);
    });

    return tr;
}


function updatePagination() {
    const total = FARMERS_DATA.length;
    const totalPages = Math.max(1, Math.ceil(total / farmersPerPage));

    if (currentFarmersPage > totalPages) currentFarmersPage = totalPages;

    const start = total === 0 ? 0 : (currentFarmersPage - 1) * farmersPerPage + 1;
    const end = Math.min(currentFarmersPage * farmersPerPage, total);

    const info = document.getElementById("paginationInfo");
    if (info) info.textContent = `Showing ${start}-${end} of ${total} farmers`;

    const prev = document.getElementById("prevPageBtn");
    if (prev) prev.disabled = currentFarmersPage <= 1;

    const next = document.getElementById("nextPageBtn");
    if (next) next.disabled = currentFarmersPage >= totalPages;

    const btns = document.getElementById("pageNumberBtns");
    if (btns) {
        btns.innerHTML = "";
        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement("button");
            btn.className = `btn-page ${i === currentFarmersPage ? "active" : ""}`;
            btn.textContent = i;
            btn.type = "button";
            btn.addEventListener("click", function() {
                currentFarmersPage = i;
                renderFarmersTable();
            });
            btns.appendChild(btn);
        }
    }
}

function initFarmerSearch() {
    const searchInput = document.getElementById("searchFarmersInput");
    if (!searchInput) return;

    searchInput.addEventListener("input", function() {
        const keyword = this.value.toLowerCase().trim();

        if (!keyword) {
            currentFarmersPage = 1;
            renderFarmersTable();
            return;
        }

        const filtered = FARMERS_DATA.filter(function(farmer) {
            const searchableText = [
                farmer.rsbsa_id,
                farmer.first_name,
                farmer.middle_name,
                farmer.last_name,
                farmer.suffix,
                farmer.address,
                farmer.email_address,
                farmer.phone_number,
                farmer.sex,
                farmer.birthdate,
                farmer.region,
                farmer.municipality,
                farmer.barangay,
                farmer.status
            ].join(" ").toLowerCase();

            return searchableText.includes(keyword);
        });

        currentFarmersPage = 1;
        renderFilteredFarmers(filtered);
    });
}

function renderFilteredFarmers(data) {
    const tbody = document.getElementById("farmersTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#777;">No farmers found.</td></tr>`;
        updateSearchPaginationText(0);
        return;
    }

    data.forEach(function(farmer) {
        const tr = createFarmerTableRow(farmer);
        tbody.appendChild(tr);
    });

    updateSearchPaginationText(data.length);
}

function updateSearchPaginationText(resultCount) {
    const paginationInfo = document.getElementById("paginationInfo");
    if (!paginationInfo) return;

    paginationInfo.textContent = `Showing ${resultCount} of ${FARMERS_DATA.length} farmers`;
}

/* ============================================================
   FARMER SUBVIEWS
============================================================ */

function formatRsbsaId(value) {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    const groups = [
        digits.slice(0, 2),
        digits.slice(2, 5),
        digits.slice(5, 7),
        digits.slice(7, 10),
        digits.slice(10, 16)
    ];

    return groups.filter(Boolean).join("-");
}

function initFarmerSubviews() {
    const listSubview = document.getElementById("farmersListSubview");
    const regSubview = document.getElementById("registerFarmerSubview");
    const manSubview = document.getElementById("manageFarmerSubview");

    initFarmerLocationDropdowns(); 
    const addBtn = document.getElementById("addFarmerBtn");
    const cancelRegBtn = document.getElementById("cancelRegisterFarmerBtn");
    const backManBtn = document.getElementById("backFromManageFarmerBtn");

    if (addBtn) {
        addBtn.addEventListener("click", function() {
            console.log("Add Farmer button clicked");
            const regForm = document.getElementById("registerFarmerForm");
            if (regForm) regForm.reset();
            resetFarmerLocationDropdowns(); 
            setValue("regFarmerId", "");
            if (listSubview) listSubview.classList.add("hidden-element");
            if (regSubview) regSubview.classList.remove("hidden-element");
        });
    }

    if (cancelRegBtn) {
        cancelRegBtn.addEventListener("click", function() {
            console.log("Cancel Register button clicked");
            const regForm = document.getElementById("registerFarmerForm");
            if (regForm) regForm.reset();
            resetFarmerLocationDropdowns(); 
            if (listSubview) listSubview.classList.remove("hidden-element");
            if (regSubview) regSubview.classList.add("hidden-element");
        });
    }

    if (backManBtn) {
        backManBtn.addEventListener("click", function() {
            if (manSubview) manSubview.classList.add("hidden-element");
            if (listSubview) listSubview.classList.remove("hidden-element");
            currentActiveFarmer = null;
            isEditMode = false;
        });
    }

    

    const regForm = document.getElementById("registerFarmerForm");
    if (regForm) {
        console.log("Register Farmer Form found");

        const rsbsaInput = document.getElementById("regFarmerId");

        if (rsbsaInput) {
            rsbsaInput.addEventListener("input", () => {
                const cursor = rsbsaInput.selectionStart ?? rsbsaInput.value.length;
                const digitsBeforeCursor = rsbsaInput.value
                    .slice(0, cursor)
                    .replace(/\D/g, "")
                    .length;
                const digits = rsbsaInput.value.replace(/\D/g, "").slice(0, 16);
                rsbsaInput.value = formatRsbsaId(digits);

                const hyphensBeforeCursor = [2, 5, 7, 10]
                    .filter((position) => position < digitsBeforeCursor)
                    .length;
                const nextCursor = Math.min(
                    digitsBeforeCursor + hyphensBeforeCursor,
                    rsbsaInput.value.length
                );
                rsbsaInput.setSelectionRange(nextCursor, nextCursor);
            });
        }

        regForm.addEventListener("submit", function(event) {
            event.preventDefault();
            event.stopPropagation();
            console.log("Form submitted!");

            const rsbsaId = document.getElementById("regFarmerId")?.value?.trim() || "";
            const municipality = document.getElementById("regMunicipality")?.value?.trim() || "";
            const barangay = document.getElementById("regBarangay")?.value?.trim() || "";
            const firstName = document.getElementById("regFirstName")?.value?.trim() || "";
            const middleName = document.getElementById("regMiddleName")?.value?.trim() || "";
            const lastName = document.getElementById("regLastName")?.value?.trim() || "";
            const suffix = document.getElementById("regSuffix")?.value?.trim() || "";
            const sex = document.getElementById("regSex")?.value || "";
            const birthdate = document.getElementById("regBirthdate")?.value || "";
            const phone = document.getElementById("regPhone")?.value?.trim() || "";
            const email = document.getElementById("regEmail")?.value?.trim() || "";

            if (!rsbsaId || !municipality || !barangay || !firstName || !lastName || !sex || !birthdate || !phone || !email) {
                alert("Please complete all required fields.");
                return;
            }
            if (!/^\d{2}-\d{3}-\d{2}-\d{3}-\d{6}$/.test(rsbsaId)) {
                alert("Farmer ID must follow the 16-digit RSBSA format: 00-000-00-000-000000.");
                return;
            }

            const farmerData = {
                rsbsa_id: rsbsaId,
                first_name: firstName,
                middle_name: middleName,
                last_name: lastName,
                suffix: suffix,
                address: barangay + ", " + municipality,
                barangay: barangay,
                municipality: municipality,
                sex: sex,
                birthdate: birthdate,
                phone_number: phone,
                email_address: email
            };

            console.log("Farmer data:", farmerData);

            window._pendingFarmer = farmerData;

            const confirmText = document.getElementById("confirmFarmerText");
            if (confirmText) {
                confirmText.textContent = "Register " + firstName + " " + lastName + " from " + barangay + ", " + municipality + "?";
            }

            const modal = document.getElementById("confirmFarmerModal");
            if (modal) {
                modal.classList.add("show");
                console.log("Confirmation modal shown.");
            } else {
                console.error("ERROR: confirmFarmerModal was not found.");
                alert("Confirmation window could not be opened.");
            }
        });
        console.log("Submit handler attached to form.");
    } else {
        console.error("ERROR: registerFarmerForm was not found.");
    }


    const confirmSaveBtn = document.getElementById("confirmSaveFarmerBtn");
    if (confirmSaveBtn) {
        confirmSaveBtn.addEventListener("click", async function() {
            const farmerData = window._pendingFarmer;
            if (!farmerData) {
                alert("No farmer data to save.");
                return;
            }
            console.log("Saving farmer:", farmerData);
            this.disabled = true;
            this.textContent = "Saving...";
            try {
                const token = getAuthToken();
                console.log("Authentication token:", token ? "Present" : "Missing");
                const response = await fetch(FARMERS_ENDPOINT, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { "Authorization": `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify(farmerData)
                });
                console.log("POST response status:", response.status);
                if (!response.ok) {
                    let errorData = null;
                    try { errorData = await response.json(); } catch (e) {
                        console.error("Could not read error response.");
                    }
                    let errorMessage = "Failed to add farmer.";
                    if (errorData && errorData.detail) {
                        errorMessage = typeof errorData.detail === "string"
                            ? errorData.detail
                            : JSON.stringify(errorData.detail);
                    }
                    throw new Error(errorMessage);
                }
                const result = await response.json();
                console.log("Farmer created successfully:", result);
                document.getElementById("confirmFarmerModal")?.classList.remove("show");
                await fetchFarmers();

                if (listSubview) listSubview.classList.remove("hidden-element");
                if (regSubview) regSubview.classList.add("hidden-element");

                document.getElementById("farmerAddedModal")?.classList.add("show");
                const form = document.getElementById("registerFarmerForm");
                if (form) form.reset();
                window._pendingFarmer = null;
            } catch (error) {
                console.error("Error adding farmer:", error);
                document.getElementById("confirmFarmerModal")?.classList.remove("show");
                alert("Failed to add farmer.\n\n" + (error.message || "Check FastAPI server."));
            } finally {
                this.disabled = false;
                this.textContent = "Confirm & Save";
            }
        });
    } else {
        console.error("ERROR: confirmSaveFarmerBtn was not found.");
    }

    const closeFarmerAddedBtn = document.getElementById("closeFarmerAddedBtn");
    if (closeFarmerAddedBtn) {
        closeFarmerAddedBtn.addEventListener("click", function() {
            document.getElementById("farmerAddedModal")?.classList.remove("show");
            if (regSubview) regSubview.classList.add("hidden-element");
            if (listSubview) listSubview.classList.remove("hidden-element");
        });
    }

    const reviewFarmerBtn = document.getElementById("reviewFarmerBtn");
    if (reviewFarmerBtn) {
        reviewFarmerBtn.addEventListener("click", function() {
            document.getElementById("confirmFarmerModal")?.classList.remove("show");
        });
    }

    const toggleEditBtn = document.getElementById("toggleEditFarmerBtn");
    if (toggleEditBtn) {
        toggleEditBtn.addEventListener("click", async function() {
            const editableInputs = document.querySelectorAll(".man-editable");

            if (!isEditMode) {
                isEditMode = true;
                editableInputs.forEach(function(input) {
                    input.readOnly = false;
                    input.classList.add("input-editable-active");
                    input.classList.remove("input-readonly");
                });
                this.textContent = "Save Changes";

                let cancelBtn = document.getElementById("cancelEditFarmerBtn");
                if (!cancelBtn) {
                    cancelBtn = document.createElement("button");
                    cancelBtn.id = "cancelEditFarmerBtn";
                    cancelBtn.className = "btn-outline-report";
                    cancelBtn.textContent = "Cancel";
                    cancelBtn.style.marginRight = "8px";
                    this.parentNode.insertBefore(cancelBtn, this);
                    cancelBtn.addEventListener("click", cancelFarmerEdit);
                }
                cancelBtn.style.display = "inline-flex";
                return;
            }

            if (!currentActiveFarmer) {
                alert("No farmer selected.");
                return;
            }

            const confirmSave = await ESaka.confirm("Are you sure you want to save these changes?\n\nFarmer: " + getFarmerFullName(currentActiveFarmer), { title: "Save changes?", confirmText: "Save" });
            if (!confirmSave) return;

            const email = getValue("manEmail");

if (!email) {
    alert("Please enter an email address.");
    return;
}

const gmailPattern = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;

if (!gmailPattern.test(email)) {
    alert("Please enter a valid Gmail address. Example: juan@gmail.com");
    return;
}

            const updateData = {
                address: getValue("manAddress"),
                phone_number: getValue("manPhone"),
                email_address: getValue("manEmail")
            };

            try {
                const farmerId = currentActiveFarmer.farmer_id;

                await apiRequest(FARMERS_ENDPOINT + farmerId, {
                    method: "PUT",
                    body: JSON.stringify(updateData)
                });

                isEditMode = false;
                editableInputs.forEach(function(input) {
                    input.readOnly = true;
                    input.classList.remove("input-editable-active");
                    input.classList.add("input-readonly");
                });

                this.textContent = "Edit Contact Info";

                const cancelBtn = document.getElementById("cancelEditFarmerBtn");
                if (cancelBtn) cancelBtn.style.display = "none";

                await fetchFarmers();
                alert("Farmer updated successfully.");
            } catch (error) {
                console.error("Update farmer error:", error);
                alert("Failed to update farmer.\n\n" + (error.message || "Check FastAPI server."));
            }
        });
    }

    const deleteBtn = document.getElementById("deleteFarmerBtn");
    if (deleteBtn) {
        deleteBtn.addEventListener("click", function() {
            if (!currentActiveFarmer) {
                alert("No farmer selected.");
                return;
            }
            document.getElementById("deleteFarmerModal")?.classList.add("show");
        });
    }

    const confirmDeleteBtn = document.getElementById("confirmDeleteFarmerBtn");
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener("click", async function() {
            if (!currentActiveFarmer) return;

            this.disabled = true;
            this.textContent = "Deleting...";

            try {
                const farmerId = currentActiveFarmer.farmer_id;

                await apiRequest(FARMERS_ENDPOINT + farmerId, {
                    method: "DELETE"
                });

                document.getElementById("deleteFarmerModal")?.classList.remove("show");
                currentActiveFarmer = null;
                await fetchFarmers();

                const manSubview = document.getElementById("manageFarmerSubview");
                const listSubview = document.getElementById("farmersListSubview");
                if (manSubview) manSubview.classList.add("hidden-element");
                if (listSubview) listSubview.classList.remove("hidden-element");

                alert("Farmer deleted successfully.");

            } catch (error) {
                console.error("Delete farmer error:", error);
                document.getElementById("deleteFarmerModal")?.classList.remove("show");
                
                const errorModal = document.getElementById("deleteErrorModal");
                const errorText = errorModal?.querySelector("p");
                if (errorText) {
                    if (error.message && error.message.includes("existing records")) {
                        errorText.textContent = "This farmer has existing planting intents or offtake requests. Please delete those first, then try again.";
                    } else {
                        errorText.textContent = error.message || "The farmer could not be deleted. Please try again.";
                    }
                }
                errorModal?.classList.add("show");
                
            } finally {
                this.disabled = false;
                this.textContent = "Delete";
            }
        });
    }


    document.getElementById("closeDeleteErrorBtn")?.addEventListener("click", function() {
        document.getElementById("deleteErrorModal")?.classList.remove("show");
    });

    document.getElementById("deleteErrorModal")?.addEventListener("click", function(event) {
        if (event.target === this) {
            this.classList.remove("show");
        }
    });

    document.getElementById("cancelDeleteFarmerBtn")?.addEventListener("click", function() {
        document.getElementById("deleteFarmerModal")?.classList.remove("show");
    });

    document.getElementById("deleteFarmerModal")?.addEventListener("click", function(event) {
        if (event.target === this) {
            this.classList.remove("show");
        }
    });

    document.getElementById("prevPageBtn")?.addEventListener("click", function() {
        if (currentFarmersPage > 1) {
            currentFarmersPage--;
            renderFarmersTable();
        }
    });

    document.getElementById("nextPageBtn")?.addEventListener("click", function() {
        const totalPages = Math.max(1, Math.ceil(FARMERS_DATA.length / farmersPerPage));
        if (currentFarmersPage < totalPages) {
            currentFarmersPage++;
            renderFarmersTable();
        }
    });

}

/* ============================================================
   CANCEL FARMER EDIT
============================================================ */

async function cancelFarmerEdit() {
    const farmer = currentActiveFarmer;
    if (!farmer) return;

    if (!(await ESaka.confirm("Are you sure you want to cancel editing?\n\nYour changes will be discarded.", { title: "Cancel editing?", confirmText: "Discard changes", cancelText: "Keep editing" }))) return;

    setValue("manAddress", farmer.address || "");
    setValue("manPhone", farmer.phone_number || "");
    setValue("manEmail", farmer.email_address || "");

    const editableInputs = document.querySelectorAll(".man-editable");
    editableInputs.forEach(function(input) {
        input.readOnly = true;
        input.classList.remove("input-editable-active");
        input.classList.add("input-readonly");
    });

    isEditMode = false;

    const toggleBtn = document.getElementById("toggleEditFarmerBtn");
    if (toggleBtn) toggleBtn.textContent = "Edit Contact Info";

    const backBtn = document.getElementById("backFromManageFarmerBtn");
    if (backBtn) backBtn.style.display = "inline-flex";

    const deleteBtn = document.getElementById("deleteFarmerBtn");
    if (deleteBtn) deleteBtn.style.display = "inline-flex";

    const cancelBtn = document.getElementById("cancelEditFarmerBtn");
    if (cancelBtn) cancelBtn.style.display = "none";

    console.log("Farmer edit cancelled.");
}

/* ============================================================
   OPEN MANAGE FARMER
============================================================ */

function openManageFarmer(farmer) {
    if (!farmer) return;

    currentActiveFarmer = farmer;
    isEditMode = false;

    setValue("manFarmerId", farmer.rsbsa_id || "");
    setValue("manAddress", farmer.address || "");
    setValue("manFirstName", farmer.first_name || "");
    setValue("manMiddleName", farmer.middle_name || "");
    setValue("manLastName", farmer.last_name || "");
    setValue("manSuffix", farmer.suffix || "");
    setValue("manSex", farmer.sex || "");
    setValue("manBirthdate", farmer.birthdate || "");
    setValue("manPhone", farmer.phone_number || "");
    setValue("manEmail", farmer.email_address || "");

    document.querySelectorAll(".man-editable").forEach(function(input) {
        input.readOnly = true;
        input.classList.remove("input-editable-active");
        input.classList.add("input-readonly");
    });

    const editBtn = document.getElementById("toggleEditFarmerBtn");
    if (editBtn) editBtn.textContent = "Edit Contact Info";

    const backBtn = document.getElementById("backFromManageFarmerBtn");
    if (backBtn) backBtn.style.display = "inline-flex";

    const deleteBtn = document.getElementById("deleteFarmerBtn");
    if (deleteBtn) deleteBtn.style.display = "inline-flex";

    const cancelBtn = document.getElementById("cancelEditFarmerBtn");
    if (cancelBtn) cancelBtn.style.display = "none";

    document.getElementById("farmersListSubview")?.classList.add("hidden-element");
    document.getElementById("manageFarmerSubview")?.classList.remove("hidden-element");
}

/* ============================================================
   PLANTING INTENT
============================================================ */

function initFinalizedIntentsFilter() {
    const pills = document.querySelectorAll("#finalizedIntentsFilterPills .filter-pill");
    if (!pills.length) {
        console.warn("Finalized intents filter pills not found in DOM.");
        return;
    }

    pills.forEach(pill => {
        pill.addEventListener("click", () => {
            pills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");

            currentFinalizedIntentsFilter = pill.dataset.filter || "all";
            renderPlantingIntentsTable();
        });
    });
}

function initPlantingSummaryCardFilters() {
    document.querySelectorAll("#plantingSummaryCards [data-intent-filter]").forEach((card) => {
        const applyFilter = () => {
            const filter = card.dataset.intentFilter || "all";
            const tab = document.querySelector(`.sub-tab-btn[data-tab="${filter === "draft" ? "draft" : "submitted"}"]`);
            tab?.click();

            if (filter !== "draft") {
                const pill = document.querySelector(`#finalizedIntentsFilterPills .filter-pill[data-filter="${filter}"]`);
                pill?.click();
            }
        };

        card.addEventListener("click", applyFilter);
        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                applyFilter();
            }
        });
    });
}

/* ============================================================
   INITIALIZE PLANTING INTENT
============================================================ */

function initPlantingIntent() {
    const list = document.getElementById("plantingIntentListSubview");
    const formSubview = document.getElementById("submitPlantIntentSubview");
    const modal = document.getElementById("plantIntentSubmittedModal");

    initPlantingIntentTabs();
    initPlantingSummaryCardFilters();
    initSearchableSelection("piFarmerSearch", "piFarmerName");
    initSearchableSelection("piCommoditySearch", "piCommodity");

    document.getElementById("addPlantIntentBtn")?.addEventListener("click", function() {
        const form = document.getElementById("submitPlantIntentForm");
        if (form) form.reset();
        if (list) list.classList.add("hidden-element");
        if (formSubview) formSubview.classList.remove("hidden-element");
    });

    document.getElementById("cancelPlantIntentBtn")?.addEventListener("click", function() {
        const form = document.getElementById("submitPlantIntentForm");
        if (form) form.reset();
        if (formSubview) formSubview.classList.add("hidden-element");
        if (list) list.classList.remove("hidden-element");
    });

    document.getElementById("backFromPlantingIntentDetailsBtn")?.addEventListener("click", function() {
        window.isEditingPlantingIntent = false;

        const cancelBtn = document.getElementById("cancelEditPlantingIntentBtn");
        if (cancelBtn) cancelBtn.remove();

        const editBtn = document.getElementById("editPlantingIntentBtn");
        if (editBtn) {
            editBtn.textContent = "Edit Details";
            editBtn.style.background = "#D97706";
            editBtn.disabled = false;
        }

        const submitBtn = document.getElementById("submitPlantingIntentBtn");
        if (submitBtn) {
            submitBtn.textContent = "Finalize";
            submitBtn.style.display = "inline-flex";
            submitBtn.style.background = "#2E7D32";
            submitBtn.disabled = false;
        }

        const backBtn = document.getElementById("backFromPlantingIntentDetailsBtn");
        if (backBtn) backBtn.style.display = "inline-flex";

        const details = document.getElementById("plantingIntentDetailsSubview");
        if (details) details.classList.add("hidden-element");
        if (list) list.classList.remove("hidden-element");

        window.currentSelectedPlantingIntent = null;
        fetchPlantingIntents();
    });

    document.getElementById("submitPlantIntentForm")?.addEventListener("submit", async function(event) {
        event.preventDefault();
        await submitPlantingIntent();
    });

    document.getElementById("closePlantIntentSubmittedBtn")?.addEventListener("click", async function() {
        if (modal) modal.classList.remove("show");
        if (formSubview) formSubview.classList.add("hidden-element");
        if (list) list.classList.remove("hidden-element");
        
        const draftTab = document.querySelector('.sub-tab-btn[data-tab="draft"]');
        if (draftTab) {
            draftTab.click();
        }
        
        await fetchPlantingIntents();
    });

}

// ============================================================
// SUBMIT PLANTING INTENT STATUS
// ============================================================

async function submitPlantingIntentStatus(intent) {
    if (!intent) {
        alert("No planting intent selected.");
        return;
    }

    const intentId = intent.planting_intent_id;

    if (!intentId) {
        alert("Planting Intent ID not found.");
        return;
    }

    if (!(await ESaka.confirm("Are you sure you want to submit this planting intent?", { title: "Submit planting intent?", confirmText: "Submit" }))) {
        return;
    }

    const submitBtn = document.getElementById("submitPlantingIntentBtn");

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting...";
        }

        const url = PLANTING_INTENTS_ENDPOINT + intentId + "/submit";

        console.log("Submitting planting intent:", url);

        const result = await apiRequest(url, { method: "POST" });

        console.log("Submit response:", result);

        intent.status = "SUBMITTED";
        intent.updated_at = new Date().toISOString();

        const index = PLANTING_INTENTS_DATA.findIndex(function(item) {
            return String(item.planting_intent_id) === String(intentId);
        });

        if (index !== -1) {
            PLANTING_INTENTS_DATA[index].status = "SUBMITTED";
            PLANTING_INTENTS_DATA[index].updated_at = intent.updated_at;
        }

        filteredPlantingIntents = null;

        renderPlantingIntentsTable();

        window.currentSelectedPlantingIntent = intent;

        openPlantingIntentDetails(intent);

        await loadReports();
        alert("Planting intent has been finalized.");

    } catch (error) {
        console.error("Submit planting intent error:", error);

        alert("Failed to submit planting intent.\n\n" + (error.message || "Please try again."));

    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
        }
    }
}

// ============================================================
// DELETE PLANTING INTENT (DRAFT ONLY)
// ============================================================

async function deletePlantingIntent(intent) {
    if (!intent) {
        alert("No planting intent selected.");
        return;
    }

    const status = (intent.status || "DRAFT").toUpperCase();

    if (status !== "DRAFT") {
        alert("Only Draft planting intents can be deleted.");
        return;
    }

    if (!(await ESaka.confirm(`Are you sure you want to permanently delete this planting intent for "${intent.commodity}"?\n\nThis action cannot be undone.`, { title: "Delete planting intent?", confirmText: "Delete", danger: true }))) {
        return;
    }

    try {
        const url = PLANTING_INTENTS_ENDPOINT + intent.planting_intent_id;

        console.log("Deleting planting intent:", url);

        await apiRequest(url, { method: "DELETE" });

        PLANTING_INTENTS_DATA = PLANTING_INTENTS_DATA.filter(function(item) {
            return String(item.planting_intent_id) !== String(intent.planting_intent_id);
        });

        filteredPlantingIntents = null;

        renderPlantingIntentsTable();

        const list = document.getElementById("plantingIntentListSubview");
        const details = document.getElementById("plantingIntentDetailsSubview");

        if (list) list.classList.remove("hidden-element");
        if (details) details.classList.add("hidden-element");

        window.currentSelectedPlantingIntent = null;

        alert("Planting intent deleted successfully.");

    } catch (error) {
        console.error("Delete planting intent error:", error);

        alert("Failed to delete planting intent.\n\n" + (error.message || "Please try again."));
    }
}

// ============================================================
// PULL PLANTING INTENT BACK TO DRAFT
// ============================================================

async function pullPlantingIntent(intent) {
    if (!intent) {
        alert("No planting intent selected.");
        return;
    }
    
    const finalizedStatus = (intent.finalized_status || "NOT PLANTED").toUpperCase();
    if (finalizedStatus !== "NOT PLANTED") {
        alert(
            `Cannot revert this planting intent to DRAFT.\n\n` +
            `Finalized status: ${finalizedStatus}\n\n` +
            `Once the crop is ${finalizedStatus.toLowerCase()}, the intent is locked. ` +
            `This is to ensure report data integrity — the Municipal Coordinator has already ` +
            `received a report based on this status.`
        );
        return;
    }


    const intentId = intent.planting_intent_id;

    if (!intentId) {
        alert("Planting Intent ID not found.");
        return;
    }

    if (!(await ESaka.confirm("Are you sure you want to revert this planting intent to DRAFT?", { title: "Revert to draft?", confirmText: "Revert" }))) {
        return;
    }

    try {
        const url = PLANTING_INTENTS_ENDPOINT + intentId + "/pull";

        console.log("Reverting planting intent to Draft:", url);

        const result = await apiRequest(url, { method: "POST" });

        console.log("Pull response:", result);

        intent.status = "DRAFT";
        intent.updated_at = new Date().toISOString();

        const index = PLANTING_INTENTS_DATA.findIndex(function(item) {
            return String(item.planting_intent_id) === String(intentId);
        });

        if (index !== -1) {
            PLANTING_INTENTS_DATA[index].status = "DRAFT";
            PLANTING_INTENTS_DATA[index].updated_at = intent.updated_at;
        }

        filteredPlantingIntents = null;

        renderPlantingIntentsTable();

        window.currentSelectedPlantingIntent = intent;

        openPlantingIntentDetails(intent);

        alert("Planting intent reverted to DRAFT successfully.");

    } catch (error) {
        console.error("Pull planting intent error:", error);

        alert("Failed to revert planting intent to DRAFT.\n\n" + (error.message || "Please try again."));
    }
}

/* ============================================================
   INIT PLANTING INTENT SUB-TABS
============================================================ */

function initPlantingIntentTabs() {
    const tabButtons = document.querySelectorAll('.sub-tab-btn');
    const draftContainer = document.getElementById('draftIntentsContainer');
    const submittedContainer = document.getElementById('submittedIntentsContainer');

    if (!tabButtons.length) return;

    if (draftContainer) draftContainer.style.display = 'block';
    if (submittedContainer) submittedContainer.style.display = 'none';

    tabButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            const tab = this.dataset.tab;

            tabButtons.forEach(function(btn) {
                btn.classList.remove('active');
                btn.style.borderBottom = 'none';
                btn.style.color = 'var(--muted)';
            });
            this.classList.add('active');
            this.style.borderBottom = '3px solid var(--green)';
            this.style.color = 'var(--green)';

            if (tab === 'draft') {
                if (draftContainer) draftContainer.style.display = 'block';
                if (submittedContainer) submittedContainer.style.display = 'none';
            } else {
                if (draftContainer) draftContainer.style.display = 'none';
                if (submittedContainer) submittedContainer.style.display = 'block';
            }
        });
    });
}


/* ============================================================
   NORMALIZE PLANTING INTENT
============================================================ */

function normalizePlantingIntent(intent) {
    return {
        planting_intent_id: intent.planting_intent_id || intent.id || null,
        farmer_id: intent.farmer_id || null,
        farmer_name: intent.farmer_name || intent.name || "-",
        commodity: intent.commodity || intent.crop || "-",
        volume: intent.volume || intent.planned_volume || intent.quantity || "",
        location: intent.location || intent.municipality || intent.barangay || "-",
        barangay: intent.barangay || "",            
        municipality: intent.municipality || "",     
        planting_date: intent.planting_date || "",
        harvest_date: intent.harvest_date || intent.expected_harvest_date || "",
        actual_planting_date: intent.actual_planting_date || null,  
        actual_harvest_date: intent.actual_harvest_date || null,   
        actual_harvest_volume: intent.actual_harvest_volume || null,
        remarks: intent.remarks || "",
        status: intent.status || intent.report_status || "Pending",
        finalized_status: intent.finalized_status || "NOT PLANTED",
        is_in_report: intent.is_in_report || false,  
        created_at: intent.created_at || null,
        updated_at: intent.updated_at || null,
        revision_count: intent.revision_count || 0,
        report_id: intent.report_id || null
    };
}


/* ============================================================
   SEARCH PLANTING INTENTS
============================================================ */

function initializePlantingIntentSearch() {
    const searchInput = document.getElementById("searchPlantingIntentsInput");
    if (!searchInput) return;

    function performSearch() {
        const keyword = searchInput.value.toLowerCase().trim();

        if (!keyword) {
            filteredPlantingIntents = null;
            currentDraftIntentsPage = 1;
            currentSubmittedIntentsPage = 1;
            renderPlantingIntentsTable();
            updatePlantingSummaryCards();
            return;
        }

        const searchWords = keyword.split(/\s+/).filter(Boolean);

        filteredPlantingIntents = PLANTING_INTENTS_DATA.filter(function(intent) {
            const searchableText = [
                intent.farmer_name || '',
                intent.commodity || '',
                intent.location || '',
                intent.remarks || '',
                intent.status || '',
                intent.finalized_status || '',
                String(intent.volume || ''),
                intent.planting_date || '',
                intent.harvest_date || ''
            ].join(" ").toLowerCase();

            return searchWords.every(function(word) {
                return searchableText.includes(word);
            });
        });

        currentDraftIntentsPage = 1;
        currentSubmittedIntentsPage = 1;
        renderPlantingIntentsTable();
    }

    searchInput.addEventListener("input", performSearch);
    searchInput.addEventListener("search", performSearch);
}


/* ============================================================
   FETCH PLANTING INTENTS
============================================================ */

async function fetchPlantingIntents() {
    const tbody = document.getElementById('draftIntentsTableBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding:30px; text-align:center;">Loading planting intents...</td></tr>`;
    }

    try {
        console.log("📡 Fetching planting intents from:", PLANTING_INTENTS_ENDPOINT);

        let allItems = [];
        let page = 1;
        let totalPages = 1;

        do {
            const url = `${PLANTING_INTENTS_ENDPOINT}?page=${page}&per_page=100`;
            const data = await apiRequest(url, { method: "GET" });
            console.log(`📡 API Response (page ${page}):`, data);

            if (data && Array.isArray(data.data)) {
                allItems = allItems.concat(data.data);

                if (data.pagination) {
                    totalPages = data.pagination.total_pages || 1;
                } else {
                    totalPages = 1;
                }
            } else if (Array.isArray(data)) {
                allItems = allItems.concat(data);
                totalPages = 1;
            } else {
                console.error("Unexpected response format:", data);
                throw new Error("Invalid planting intents response. Expected an array or paginated object.");
            }

            page++;
        } while (page <= totalPages);

        PLANTING_INTENTS_DATA = allItems.map(normalizePlantingIntent);
        console.log("✅ Loaded " + PLANTING_INTENTS_DATA.length + " planting intents (ALL pages combined)");

        filteredPlantingIntents = null;
        currentDraftIntentsPage = 1;
        currentSubmittedIntentsPage = 1;
        renderPlantingIntentsTable();

        return PLANTING_INTENTS_DATA;
        
    } catch (error) {
        console.error("Unable to load planting intents:", error);
        PLANTING_INTENTS_DATA = [];
        
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="padding:30px; text-align:center; color:#C0392B;">
                        <div style="font-size:24px; margin-bottom:8px;">❌</div>
                        <strong>Failed to load planting intents.</strong>
                        <br>
                        <small>${escapeHtml(error.message || "Please check the FastAPI server.")}</small>
                        <br><br>
                        <button onclick="fetchPlantingIntents()" style="
                            padding: 8px 20px; 
                            background: #2E7D32; 
                            color: #fff; 
                            border: none; 
                            border-radius: 6px; 
                            cursor: pointer; 
                            font-weight: 600;
                        ">
                            🔄 Retry
                        </button>
                    </td>
                </tr>
            `;
        }
        
        handleAuthError(error);
        return [];
    }
}


// ============================================================
// RENDER PLANTING INTENTS TABLE
// ============================================================

function renderPlantingIntentsTable() {
    const draftTbody = document.getElementById('draftIntentsTableBody');
    const submittedTbody = document.getElementById('submittedIntentsTableBody');

    if (!draftTbody || !submittedTbody) {
        console.warn('Planting intent table bodies not found.');
        return;
    }

    draftTbody.innerHTML = '';
    submittedTbody.innerHTML = '';

    const dataSource = (filteredPlantingIntents !== null) 
        ? filteredPlantingIntents 
        : PLANTING_INTENTS_DATA;

    console.log("Rendering with data source:", dataSource.length, "intents");

    const draftIntents = dataSource.filter(function(intent) {
        const status = (intent.status || 'Pending').toLowerCase();
        return status === 'draft' || status === 'pending';
    });

        const submittedIntentsAll = dataSource.filter(function(intent) {
        const status = (intent.status || '').toLowerCase();
        return status === 'submitted' ||
            status.startsWith('submitted_') ||
            status === 'for_municipal_validation' ||
            status === 'for_provincial_validation' ||
            status === 'for_da_rfo_validation' ||
            status === 'revision_required' ||
            status === 'final_approved';
    });

    let submittedIntents = submittedIntentsAll;

    if (currentFinalizedIntentsFilter !== "all") {
        submittedIntents = submittedIntentsAll.filter(function(intent) {
            const hs = (intent.finalized_status || "NOT PLANTED").toUpperCase();
            return hs === currentFinalizedIntentsFilter;
        });
    }

    const draftCount = document.getElementById('draftCount');
    const submittedCount = document.getElementById('submittedCount');
    if (draftCount) draftCount.textContent = draftIntents.length;
    if (submittedCount) submittedCount.textContent = submittedIntentsAll.length; // total, hindi apektado ng filter pill

    if (draftIntents.length === 0) {
        draftTbody.innerHTML = `
            <tr>
                <td colspan="7" style="padding:40px; text-align:center; color:#999;">
                    ${filteredPlantingIntents !== null ? 'No Draft Intents match your search.' : 'No Draft Intents found.'}
                    ${filteredPlantingIntents !== null ? '<br><small>Try adjusting your search terms.</small>' : '<br>Click "Add Plant Intent" to create your first planting plan.'}
                </td>
            </tr>
        `;
    } else {
        const draftStart = (currentDraftIntentsPage - 1) * draftIntentsPerPage;
        const paginatedDraftIntents = draftIntents.slice(draftStart, draftStart + draftIntentsPerPage);

        paginatedDraftIntents.forEach(function(intent) {
            const tr = createPlantingIntentRow(intent, 'draft');
            draftTbody.appendChild(tr);
        });
    }

    if (submittedIntents.length === 0) {
        submittedTbody.innerHTML = `
            <tr>
                <td colspan="11" style="padding:40px; text-align:center; color:#999;">
                    ${filteredPlantingIntents !== null ? 'No Submitted Intents match your search.' : 'No Submitted Intents found.'}
                    ${filteredPlantingIntents !== null ? '<br><small>Try adjusting your search terms.</small>' : '<br>Submit a draft intent to see it here.'}
                </td>
            </tr>
        `;
    } else {
        const submittedStart = (currentSubmittedIntentsPage - 1) * plantingIntentsPerPage;
        const paginatedSubmittedIntents = submittedIntents.slice(submittedStart, submittedStart + plantingIntentsPerPage);

        paginatedSubmittedIntents.forEach(function(intent) {
            const tr = createPlantingIntentRow(intent, 'submitted');
            submittedTbody.appendChild(tr);
        });
    }

    renderPagination(draftIntents.length, "draft");
    renderPagination(submittedIntents.length, "submitted");
    updatePlantingSummaryCards();
}

/* ============================================================
   PLANTING INTENTS SUMMARY CARDS
============================================================ */
function updatePlantingSummaryCards() {
    // Draft intents (not yet submitted)
    const draftCount = PLANTING_INTENTS_DATA.filter(function(intent) {
        const status = String(intent.status || "Pending").toLowerCase();
        return status === "draft" || status === "pending";
    }).length;

    // Finalized intents (submitted to municipal or beyond)
    const submittedIntents = PLANTING_INTENTS_DATA.filter(function(intent) {
        const status = String(intent.status || "").toLowerCase();
        return (
            status === "submitted" ||
            status.startsWith("submitted_") ||
            status === "for_municipal_validation" ||
            status === "for_provincial_validation" ||
            status === "for_da_rfo_validation" ||
            status === "revision_required" ||
            status === "final_approved"
        );
    });

    const finalizedCount = submittedIntents.length;

    // Breakdown ng finalized intents per status
    const statusCounts = {
        "NOT PLANTED": 0,
        "PLANTED": 0,
        "HARVESTED": 0,
        "MEDIATING": 0
    };

    submittedIntents.forEach(function(intent) {
        const hs = String(intent.finalized_status || "NOT PLANTED").toUpperCase();
        if (statusCounts.hasOwnProperty(hs)) {
            statusCounts[hs]++;
        }
    });

    const setCount = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setCount("plantingCountDraft", draftCount);
    setCount("plantingCountFinalized", finalizedCount);
    setCount("plantingCountNotPlanted", statusCounts["NOT PLANTED"]);
    setCount("plantingCountPlanted", statusCounts["PLANTED"]);
    setCount("plantingCountHarvested", statusCounts["HARVESTED"]);
    setCount("plantingCountMediating", statusCounts["MEDIATING"]);
}

// ============================================================
// PAGINATION
// ============================================================

function renderPagination(totalCount, type) {
    const containerId = type === "draft" ? "draftIntentsContainer" : "submittedIntentsContainer";
    const container = document.getElementById(containerId);
    if (!container) return;

    const card = container.querySelector(".card");
    if (!card) return;

    const existing = card.querySelector(".planting-intent-pagination");
    if (existing) existing.remove();

        const perPage = type === "draft" ? draftIntentsPerPage : plantingIntentsPerPage;

    if (totalCount <= perPage) {
        return;
    }

    let currentPage = type === "draft" ? currentDraftIntentsPage : currentSubmittedIntentsPage;
    const totalPages = Math.ceil(totalCount / perPage);
    
    if (currentPage > totalPages) {
        currentPage = totalPages;
        if (type === "draft") {
            currentDraftIntentsPage = currentPage;
        } else {
            currentSubmittedIntentsPage = currentPage;
        }
    }

    const startItem = (currentPage - 1) * perPage + 1;
    const endItem = Math.min(currentPage * perPage, totalCount);

    let html = `
        <div class="pagination-container planting-intent-pagination" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid #DFD8C6;">
            <span class="pagination-info" style="font-size: 12.5px; color: #625E52;">
                Showing ${startItem}-${endItem} of ${totalCount} planting intents
            </span>
            <div class="pagination-controls">
                <button class="btn-page prev-pg-btn" type="button" ${currentPage <= 1 ? 'disabled' : ''}>
                    &laquo; Prev
                </button>
    `;

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    if (startPage > 1) {
        html += `<button class="btn-page pg-btn" data-page="1">1</button>`;
        if (startPage > 2) {
            html += `<span style="padding: 0 4px; color: #777;">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="btn-page pg-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<span style="padding: 0 4px; color: #777;">...</span>`;
        }
        html += `<button class="btn-page pg-btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `
                <button class="btn-page next-pg-btn" type="button" ${currentPage >= totalPages ? 'disabled' : ''}>
                    Next &raquo;
                </button>
            </div>
        </div>
    `;

    card.insertAdjacentHTML('beforeend', html);

    const paginationDiv = card.querySelector(".planting-intent-pagination");
    if (!paginationDiv) return;

    paginationDiv.querySelectorAll(".pg-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            const page = parseInt(this.dataset.page);
            if (type === "draft") {
                currentDraftIntentsPage = page;
            } else {
                currentSubmittedIntentsPage = page;
            }
            renderPlantingIntentsTable();
        });
    });

    const prevBtn = paginationDiv.querySelector(".prev-pg-btn");
    if (prevBtn) {
        prevBtn.addEventListener("click", function() {
            if (type === "draft") {
                if (currentDraftIntentsPage > 1) currentDraftIntentsPage--;
            } else {
                if (currentSubmittedIntentsPage > 1) currentSubmittedIntentsPage--;
            }
            renderPlantingIntentsTable();
        });
    }

    const nextBtn = paginationDiv.querySelector(".next-pg-btn");
    if (nextBtn) {
        nextBtn.addEventListener("click", function() {
            if (type === "draft") {
                if (currentDraftIntentsPage < totalPages) currentDraftIntentsPage++;
            } else {
                if (currentSubmittedIntentsPage < totalPages) currentSubmittedIntentsPage++;
            }
            renderPlantingIntentsTable();
        });
    }
}


/* ============================================================
   STATUS TRANSITION RULES
============================================================ */

function getAllowedStatusTransitions(currentStatus) {
    const current = (currentStatus || "NOT PLANTED").toUpperCase();

    switch (current) {
        case "NOT PLANTED":
            return ["PLANTED", "MEDIATING"];
        case "PLANTED":
            return ["HARVESTED", "MEDIATING"];
        case "HARVESTED":
            return [];
        case "MEDIATING":
            return ["NOT PLANTED", "PLANTED", "HARVESTED"];
        default:
            return ["NOT PLANTED", "PLANTED", "HARVESTED", "MEDIATING"];
    }
}


/* ============================================================
   CREATE PLANTING INTENT ROW
============================================================ */

function createPlantingIntentRow(intent, type) {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';

    const farmerName = intent.farmer_name || '-';
    const commodity = intent.commodity || '-';
    const volume = formatPlantingVolume(intent.volume);
    const location = intent.location || '-';
    const plantingDate = formatPlantingDate(intent.planting_date);
    const harvestDate = formatPlantingDate(intent.harvest_date);
    const status = intent.status || 'Pending';
    const intentId = intent.planting_intent_id || '';

    let statusCell = '';

    if (type === 'draft') {
        statusCell = `<span class="status-pill draft">Draft</span>`;
    } else {
        const harvestStatus = (intent.finalized_status || 'NOT PLANTED').toUpperCase();
        
        let statusText = 'Not Planted';
        let bgColor = '#6c757d';
        
        if (harvestStatus === 'NOT PLANTED') {
            statusText = 'Not Planted';
            bgColor = '#6c757d';
        } else if (harvestStatus === 'PLANTED') {
            statusText = 'Planted';
            bgColor = '#D97706';
        } else if (harvestStatus === 'HARVESTED') {
            statusText = 'Harvested';
            bgColor = '#2E7D32';
        } else if (harvestStatus === 'MEDIATING') {
            statusText = 'Mediating';
            bgColor = '#2980B9';
        }

        const allowedTransitions = getAllowedStatusTransitions(harvestStatus);
        const isOptionAllowed = (status) => allowedTransitions.includes(status);

        statusCell = `
            <div class="status-dropdown-wrapper" data-intent-id="${intentId}" style="position:relative; display:inline-block;">
                <span class="status-pill clickable-pill" 
                    data-current-status="${harvestStatus}"
                    style="cursor:pointer; display:inline-block; padding:4px 16px; border-radius:999px; font-size:11.5px; font-weight:700; color:#FFFFFF; text-shadow:0 1px 1px rgba(0,0,0,0.2); text-align:center; white-space:nowrap; letter-spacing:0.02em; user-select:none; background-color:${bgColor}; transition:all 0.2s ease;">
                    ${escapeHtml(statusText)}
                    <span style="font-size:8px; margin-left:6px;">▼</span>
                </span>
                <div class="status-dropdown-menu" style="display:none; position:absolute; top:100%; left:50%; transform:translateX(-50%); margin-top:4px; background:#FFFFFF; border:1.5px solid #DFD8C6; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); min-width:140px; z-index:1000; overflow:hidden;">
                    <div class="status-option" 
                        data-status="NOT PLANTED" 
                        data-allowed="${isOptionAllowed('NOT PLANTED')}"
                        title="${isOptionAllowed('NOT PLANTED') ? 'Change status to Not Planted' : 'Hindi available — check current status'}"
                        style="padding:8px 16px; font-size:12px; color:${isOptionAllowed('NOT PLANTED') ? '#333' : '#BBB'}; border-bottom:1px solid #f0f0f0; cursor:${isOptionAllowed('NOT PLANTED') ? 'pointer' : 'not-allowed'}; background:${harvestStatus === 'NOT PLANTED' ? '#F0F0F0' : 'transparent'};">
                        Not Planted ${harvestStatus === 'NOT PLANTED' ? '(current)' : ''}
                    </div>
                    <div class="status-option" 
                        data-status="PLANTED" 
                        data-allowed="${isOptionAllowed('PLANTED')}"
                        title="${isOptionAllowed('PLANTED') ? 'Change status to Planted' : 'Hindi available — check current status'}"
                        style="padding:8px 16px; font-size:12px; color:${isOptionAllowed('PLANTED') ? '#333' : '#BBB'}; border-bottom:1px solid #f0f0f0; cursor:${isOptionAllowed('PLANTED') ? 'pointer' : 'not-allowed'}; background:${harvestStatus === 'PLANTED' ? '#F0F0F0' : 'transparent'};">
                        Planted ${harvestStatus === 'PLANTED' ? '(current)' : ''}
                    </div>
                    <div class="status-option" 
                        data-status="HARVESTED" 
                        data-allowed="${isOptionAllowed('HARVESTED')}"
                        title="${isOptionAllowed('HARVESTED') ? 'Change status to Harvested' : 'Hindi available — check current status'}"
                        style="padding:8px 16px; font-size:12px; color:${isOptionAllowed('HARVESTED') ? '#333' : '#BBB'}; border-bottom:1px solid #f0f0f0; cursor:${isOptionAllowed('HARVESTED') ? 'pointer' : 'not-allowed'}; background:${harvestStatus === 'HARVESTED' ? '#F0F0F0' : 'transparent'};">
                        Harvested ${harvestStatus === 'HARVESTED' ? '(current)' : ''}
                    </div>
                    <div class="status-option" 
                        data-status="MEDIATING" 
                        data-allowed="${isOptionAllowed('MEDIATING')}"
                        title="${isOptionAllowed('MEDIATING') ? 'Change status to Mediating' : 'Hindi available — check current status'}"
                        style="padding:8px 16px; font-size:12px; color:${isOptionAllowed('MEDIATING') ? '#333' : '#BBB'}; cursor:${isOptionAllowed('MEDIATING') ? 'pointer' : 'not-allowed'}; background:${harvestStatus === 'MEDIATING' ? '#F0F0F0' : 'transparent'};">
                        Mediating ${harvestStatus === 'MEDIATING' ? '(current)' : ''}
                    </div>
                </div>
            </div>
        `;
    }

    if (type === 'draft') {
        tr.innerHTML = `
            <td>#${escapeHtml(String(intentId))}</td>
            <td>${escapeHtml(farmerName)}</td>
            <td>${escapeHtml(commodity)}</td>
            <td>${escapeHtml(volume)}</td>
            <td>${escapeHtml(location)}</td>
            <td>${escapeHtml(plantingDate)}</td>
            <td>${escapeHtml(harvestDate)}</td>
        `;
    } else {
        const actualHarvestVol = Number(intent.actual_harvest_volume) || 0;
        const actualVolCell = actualHarvestVol > 0
            ? `<span style="color: #2E7D32; font-weight: 700;">${actualHarvestVol.toLocaleString("en-US")} kg</span>`
            : `<span style="color: #BBB; font-style: italic;">—</span>`;

        tr.innerHTML = `
            <td>#${escapeHtml(String(intentId))}</td>
            <td>${escapeHtml(farmerName)}</td>
            <td>${escapeHtml(commodity)}</td>
            <td>${escapeHtml(volume)}</td>
            <td>${escapeHtml(location)}</td>
            <td>${escapeHtml(plantingDate)}</td>
            <td>${escapeHtml(formatPlantingDate(intent.actual_planting_date) || "—")}</td>
            <td>${escapeHtml(harvestDate)}</td>
            <td>${escapeHtml(formatPlantingDate(intent.actual_harvest_date) || "—")}</td>
            <td class="center-col">${actualVolCell}</td>
            <td class="center-col">${statusCell}</td>
        `;
    }

    tr.addEventListener('click', function(e) {
        if (e.target.closest('.status-dropdown-wrapper')) return;
        openPlantingIntentDetails(intent);
    });

    if (type !== 'draft') {
        const pill = tr.querySelector('.clickable-pill');
        const menu = tr.querySelector('.status-dropdown-menu');

        if (pill && menu) {
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();

                document.querySelectorAll('.status-dropdown-menu').forEach((m) => {
                    if (m !== menu) m.style.display = 'none';
                });

                openStatusDropdownMenu(pill, menu);
            });
        }

        tr.querySelectorAll('.status-option').forEach((option) => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const isAllowed = option.dataset.allowed === "true";
                if (!isAllowed) {
                    const newStatus = option.dataset.status;
                    const currentStatus = (pill?.dataset.currentStatus || intent.finalized_status || "NOT PLANTED").toUpperCase();
                    
                    let reason = "";
                    if (currentStatus === "NOT PLANTED" && newStatus === "HARVESTED") {
                        reason = "Hindi pwedeng gawing HARVESTED ang isang intent na hindi pa PLANTED.\n\nMarkahan muna ito bilang PLANTED.";
                    } else if (currentStatus === "HARVESTED") {
                        reason = "Ang HARVESTED status ay FINAL at hindi na mababago.";
                    } else if (currentStatus === "PLANTED" && newStatus === "NOT PLANTED") {
                        reason = "Hindi na pwedeng ibalik sa NOT PLANTED ang isang intent na PLANTED na.\n\nUse MEDIATING kung may problema.";
                    } else {
                        reason = `Hindi pwedeng i-transition mula ${currentStatus} papuntang ${newStatus}.`;
                    }
                    
                    alert("⚠️ Invalid Status Change\n\n" + reason);
                    if (menu) menu.style.display = 'none';
                    return;
                }
                
                const newStatus = option.dataset.status;
                if (menu) menu.style.display = 'none';

                const currentStatus = (pill?.dataset.currentStatus || intent.finalized_status || "NOT PLANTED").toUpperCase();
                handleFinalizedStatusChange(intent, currentStatus, newStatus, pill);
            });
        });
    }

    return tr;
}


/* ============================================================
   OPEN PLANTING INTENT DETAILS
============================================================ */

function openPlantingIntentDetails(intent) {
    console.log("Opening details for:", intent);

    if (!intent) {
        console.warn("openPlantingIntentDetails called with null intent.");
        return;
    }

    const list = document.getElementById("plantingIntentListSubview");
    const details = document.getElementById("plantingIntentDetailsSubview");

    if (!details) {
        console.error("❌ plantingIntentDetailsSubview NOT FOUND in DOM!");
        alert("Details view not found. Please refresh the page.");
        return;
    }

    try {
        if (list) list.classList.add("hidden-element");
        details.classList.remove("hidden-element");

        console.log("✅ View switched. Details hidden?",
                    details.classList.contains("hidden-element"));

        window.currentSelectedPlantingIntent = intent;

        setValue("detailPlantingIntentId", intent.planting_intent_id || "");
        setValue("detailFarmerName", intent.farmer_name || "");
        setValue("detailFarmerId", intent.farmer_id || "");

        const commoditySelect = document.getElementById("detailCommodity");
        if (commoditySelect) {
            commoditySelect.value = intent.commodity || "";
        }

        const volumeInput = document.getElementById("detailVolume");
        if (volumeInput) {
            const numericVolume = Number(
                String(intent.volume || "")
                    .replace(/,/g, "")
                    .replace(/kg/gi, "")
                    .trim()
            );
            volumeInput.value = isNaN(numericVolume) ? "" : numericVolume;
        }

        setValue("detailLocation", intent.location || "");

        const plantingDateInput = document.getElementById("detailPlantingDate");
        if (plantingDateInput) {
            plantingDateInput.value = toDateInputValue(intent.planting_date);
        }

        const harvestDateInput = document.getElementById("detailHarvestDate");
        if (harvestDateInput) {
            harvestDateInput.value = toDateInputValue(intent.harvest_date);
        }

        const actualPlantingInput = document.getElementById("detailActualPlantingDate");
        if (actualPlantingInput) {
            actualPlantingInput.value = toDateInputValue(intent.actual_planting_date);
        }

        const actualHarvestInput = document.getElementById("detailActualHarvestDate");
        if (actualHarvestInput) {
            actualHarvestInput.value = toDateInputValue(intent.actual_harvest_date);
        }

        // ✅ NEW: Populate actual harvest volume
        const actualHarvestVolumeInput = document.getElementById("detailActualHarvestVolume");
        const actualHarvestVolumeHint = document.getElementById("detailActualHarvestVolumeHint");

        if (actualHarvestVolumeInput) {
            const vol = Number(intent.actual_harvest_volume);
            actualHarvestVolumeInput.value = (vol > 0) ? vol : "";

            const plannedVol = Number(intent.volume) || 0;
            if (actualHarvestVolumeHint) {
                if (vol > 0 && plannedVol > 0) {
                    const variancePct = Math.round(((vol - plannedVol) / plannedVol) * 100);
                    if (variancePct === 0) {
                        actualHarvestVolumeHint.textContent = "✓ Same as planned volume";
                        actualHarvestVolumeHint.style.color = "#2E7D32";
                    } else if (variancePct > 0) {
                        actualHarvestVolumeHint.textContent = `↑ ${variancePct}% higher than planned (${plannedVol.toLocaleString()} kg)`;
                        actualHarvestVolumeHint.style.color = "#2E7D32";
                    } else {
                        actualHarvestVolumeHint.textContent = `↓ ${Math.abs(variancePct)}% lower than planned (${plannedVol.toLocaleString()} kg)`;
                        actualHarvestVolumeHint.style.color = "#C0392B";
                    }
                } else if (vol > 0) {
                    actualHarvestVolumeHint.textContent = "";
                } else {
                    actualHarvestVolumeHint.textContent = "Not yet harvested";
                    actualHarvestVolumeHint.style.color = "#BBB";
                    actualHarvestVolumeHint.style.fontStyle = "italic";
                }
            }
        }

        setValue("detailRemarks", intent.remarks || "");

        const revisionInfo = document.getElementById("detailRevisionInfo");
        if (revisionInfo) {
            if (intent.revision_count !== undefined && intent.revision_count > 0) {
                revisionInfo.textContent =
                    "Revision #" + intent.revision_count +
                    " | Last updated: " +
                    formatPlantingDate(intent.updated_at || intent.created_at);
                revisionInfo.style.display = "block";
            } else {
                revisionInfo.style.display = "none";
            }
        }

        // ✅ NEW: Render validation timeline
        const historyWrapper = document.getElementById("validationHistoryWrapper");
        const historyContainer = document.getElementById("validationTimelineContainer");
        if (historyContainer) {
            historyContainer.innerHTML = `
                <div style="color: var(--muted); font-style: italic; font-size: 13px;">
                    Loading history...
                </div>
            `;
        }
        if (historyWrapper) historyWrapper.style.display = "none";

        window.isEditingPlantingIntent = false;
        resetPlantingIntentDetailFields();

        const editBtn = document.getElementById("editPlantingIntentBtn");
        const submitBtn = document.getElementById("submitPlantingIntentBtn");
        const backBtn = document.getElementById("backFromPlantingIntentDetailsBtn");
        const deleteBtn = document.getElementById("deletePlantingIntentBtn");

        if (backBtn) backBtn.style.display = "inline-flex";

        const status = (intent.status || "DRAFT").toUpperCase();
        const isDraft = status === "DRAFT";
        const isSubmitted = status === "SUBMITTED";

        console.log("Status:", status, "| Draft:", isDraft, "| Submitted:", isSubmitted);

        if (isDraft) {
            if (editBtn) {
                editBtn.style.display = "inline-flex";
                editBtn.textContent = "Edit Details";
                editBtn.style.background = "#D97706";
                editBtn.style.cursor = "pointer";
                editBtn.disabled = false;
                editBtn.onclick = function() {
                    togglePlantingIntentEditMode();
                };
            }

            if (deleteBtn) {
                deleteBtn.style.display = "inline-flex";
                deleteBtn.textContent = "Delete";
                deleteBtn.style.background = "#C0392B";
                deleteBtn.style.cursor = "pointer";
                deleteBtn.disabled = false;
                deleteBtn.onclick = function() {
                    deletePlantingIntent(intent);
                };
            }

            if (submitBtn) {
                submitBtn.textContent = "Finalize";
                submitBtn.style.display = "inline-flex";
                submitBtn.style.background = "#2E7D32";
                submitBtn.style.color = "#fff";
                submitBtn.disabled = false;
                submitBtn.onclick = function() {
                    submitPlantingIntentStatus(intent);
                };
            }

        } else if (isSubmitted) {
            if (editBtn) editBtn.style.display = "none";
            if (deleteBtn) deleteBtn.style.display = "none";

            const finalizedStatus = (intent.finalized_status || "NOT PLANTED").toUpperCase();
            const canRevert = finalizedStatus === "NOT PLANTED";

            if (submitBtn) {
                if (canRevert) {
                    submitBtn.textContent = "Return to Draft";
                    submitBtn.disabled = false;
                    submitBtn.style.display = "inline-flex";
                    submitBtn.style.background = "#D97706";
                    submitBtn.onclick = function() {
                        pullPlantingIntent(intent);
                    };
                } else {
                    const statusLabel = finalizedStatus
                        .toLowerCase()
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, function(c) { return c.toUpperCase(); });

                    submitBtn.textContent = "Already " + statusLabel;
                    submitBtn.disabled = true;
                    submitBtn.style.display = "inline-flex";
                    submitBtn.style.background = "#6c757d";
                    submitBtn.title = `Cannot revert to DRAFT — finalized status is "${finalizedStatus}".`;
                    submitBtn.onclick = null;
                }
            }
        }

        const cancelBtn = document.getElementById("cancelEditPlantingIntentBtn");
        if (cancelBtn) cancelBtn.remove();

        console.log("✅ Details view populated successfully.");

        (async () => {
            try {
                // Try to find the report that includes this intent
                let reportId = intent.report_id || intent.reportId || null;

                // If not set, try to look it up (only if intent is in a report)
                if (!reportId && intent.is_in_report) {
                    reportId = await findReportIdForIntent(intent.planting_intent_id);
                }

                // If still no report ID → hide timeline
                if (!reportId) {
                    if (historyWrapper) historyWrapper.style.display = "none";
                    if (historyContainer) historyContainer.innerHTML = "";
                    return;
                }

                const fullReport = await apiRequest(
                    `${API_BASE_URL}/api/raw-plant-reports/${reportId}`,
                    { method: "GET" }
                );

                const history = fullReport.validation_history || [];

                if (history.length === 0) {
                    // No history → hide the whole wrapper
                    if (historyWrapper) historyWrapper.style.display = "none";
                    if (historyContainer) historyContainer.innerHTML = "";
                    return;
                }

                renderValidationTimeline(
                    history,
                    "validationTimelineContainer",
                    "validationHistoryWrapper"
                );

            } catch (historyErr) {
                console.warn("Could not load validation history:", historyErr);
                if (historyWrapper) historyWrapper.style.display = "none";
                if (historyContainer) historyContainer.innerHTML = "";
            }
        })();

    } catch (err) {
        console.error("❌ Error populating details view:", err);
        console.error("Stack:", err.stack);
        alert("Error opening details: " + err.message);
    }
}


/* ============================================================
   🔍 FIND REPORT ID FOR INTENT
   Looks up which report contains this intent
============================================================ */

async function findReportIdForIntent(intentId) {
    if (!intentId) return null;

    try {
        // Query the report submissions endpoint that returns report<intent> mapping
        const reports = await apiRequest(
            `${API_BASE_URL}/api/raw-plant-reports/`,
            { method: "GET" }
        );

        if (!Array.isArray(reports)) return null;

        // Each report has "intent_ids" array
        const match = reports.find(r =>
            Array.isArray(r.intent_ids) &&
            r.intent_ids.some(id => String(id) === String(intentId))
        );

        return match ? match.report_id : null;

    } catch (err) {
        console.warn("findReportIdForIntent failed:", err);
        return null;
    }
}

// ============================================================
// TOGGLE PLANTING INTENT EDIT MODE
// ============================================================

async function togglePlantingIntentEditMode() {
    const intent = window.currentSelectedPlantingIntent;
    if (!intent) {
        alert("No planting intent selected.");
        return;
    }

    const details = document.getElementById("plantingIntentDetailsSubview");
    if (!details) return;

    const editBtn = document.getElementById("editPlantingIntentBtn");
    const submitBtn = document.getElementById("submitPlantingIntentBtn");
    const backBtn = document.getElementById("backFromPlantingIntentDetailsBtn");
    const deleteBtn = document.getElementById("deletePlantingIntentBtn");

    const existingCancel = document.getElementById("cancelEditPlantingIntentBtn");
    if (existingCancel) existingCancel.remove();

    if (!window.isEditingPlantingIntent) {
        window.isEditingPlantingIntent = true;

        details.querySelectorAll("input[type='text'], input[type='number'], textarea").forEach(function(input) {
            const id = input.id;

            if (
                id === "detailPlantingIntentId" ||
                id === "detailFarmerId" ||
                id === "detailFarmerName" ||
                id === "detailLocation" ||
                id === "detailActualHarvestVolume"
            ) {
                return;
            }

            input.readOnly = false;
            input.classList.remove("input-readonly");
            input.classList.add("input-editable-active");
            input.style.border = "1.5px solid #D97706";
            input.style.background = "#FFFDF7";
        });

        const currentStatus = (intent.status || "DRAFT").toUpperCase();
        const isDraft = currentStatus === "DRAFT";

        details.querySelectorAll("input[type='date']").forEach(function(input) {
            if (isDraft && (input.id === "detailActualPlantingDate" || input.id === "detailActualHarvestDate")) {
                input.disabled = true;
                input.classList.add("input-readonly");
                input.classList.remove("input-editable-active");
                input.style.border = "";
                input.style.background = "#ECE6D8";
                input.title = "Actual dates are recorded automatically when status changes to PLANTED or HARVESTED.";
                return;
            }

            input.disabled = false;
            input.classList.remove("input-readonly");
            input.classList.add("input-editable-active");
            input.style.border = "1.5px solid #D97706";
            input.style.background = "#FFFDF7";
        });


        const commoditySelect = document.getElementById("detailCommodity");
        if (commoditySelect) {
            commoditySelect.disabled = false;
            commoditySelect.style.border = "1.5px solid #D97706";
            commoditySelect.style.background = "#FFFDF7";
            commoditySelect.style.color = "var(--ink)";
            commoditySelect.style.cursor = "pointer";
        }

        if (editBtn) {
            editBtn.textContent = "Save Changes";
            editBtn.style.background = "#2E7D32";
            editBtn.style.display = "inline-flex";
        }

        if (submitBtn) submitBtn.style.display = "none";
        if (backBtn) backBtn.style.display = "none";
        if (deleteBtn) deleteBtn.style.display = "none";

        const cancelBtn = document.createElement("button");
        cancelBtn.id = "cancelEditPlantingIntentBtn";
        cancelBtn.className = "btn-outline-report";
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.marginRight = "8px";
        editBtn.parentNode.insertBefore(cancelBtn, editBtn);

        cancelBtn.addEventListener("click", function() {
            cancelPlantingIntentEdit();
        });

        console.log("Entered edit mode.");

    } else {
        const confirmSave = await ESaka.confirm("Are you sure you want to save these changes?", { title: "Save changes?", confirmText: "Save" });
        if (!confirmSave) {
            cancelPlantingIntentEdit();
            return;
        }
        savePlantingIntentChanges();
    }
}


// ============================================================
// CANCEL PLANTING INTENT EDIT
// ============================================================

async function cancelPlantingIntentEdit() {
    const intent = window.currentSelectedPlantingIntent;
    if (!intent) {
        console.warn("No planting intent to cancel edit.");
        return;
    }

    const details = document.getElementById("plantingIntentDetailsSubview");
    if (!details) return;

    if (!(await ESaka.confirm("Are you sure you want to cancel editing?\n\nYour changes will be discarded.", { title: "Cancel editing?", confirmText: "Discard changes", cancelText: "Keep editing" }))) {
        return;
    }

    setValue("detailPlantingIntentId", intent.planting_intent_id || "");
    setValue("detailFarmerName", intent.farmer_name || "");
    setValue("detailFarmerId", intent.farmer_id || "");

    const commoditySelect = document.getElementById("detailCommodity");
    if (commoditySelect) {
        commoditySelect.value = intent.commodity || "";
    }

    const volumeInputCancel = document.getElementById("detailVolume");
    if (volumeInputCancel) {
        const numericVolumeCancel = Number(String(intent.volume || "").replace(/,/g, "").replace(/kg/gi, "").trim());
        volumeInputCancel.value = isNaN(numericVolumeCancel) ? "" : numericVolumeCancel;
    }
    setValue("detailLocation", intent.location || "");

    const plantingDateInput = document.getElementById("detailPlantingDate");
    if (plantingDateInput) {
        plantingDateInput.value = toDateInputValue(intent.planting_date);
    }

    const harvestDateInput = document.getElementById("detailHarvestDate");
    if (harvestDateInput) {
        harvestDateInput.value = toDateInputValue(intent.harvest_date);
    }

    setValue("detailRemarks", intent.remarks || "");

    resetPlantingIntentDetailFields();

    window.isEditingPlantingIntent = false;

    const editBtn = document.getElementById("editPlantingIntentBtn");
    if (editBtn) {
        editBtn.textContent = "Edit Details";
        editBtn.style.background = "#D97706";
        editBtn.style.display = "inline-flex";
    }

    const submitBtn = document.getElementById("submitPlantingIntentBtn");
    if (submitBtn) {
        submitBtn.style.display = "inline-flex";
        const status = (intent.status || "DRAFT").toUpperCase();
        if (status === "SUBMITTED") {
            submitBtn.textContent = "Return to Draft";
            submitBtn.style.background = "#D97706";
        } else {
            submitBtn.textContent = "Finalize";
            submitBtn.style.background = "#2E7D32";
        }
        submitBtn.disabled = false;
    }

    const backBtn = document.getElementById("backFromPlantingIntentDetailsBtn");
    if (backBtn) backBtn.style.display = "inline-flex";

    const deleteBtn = document.getElementById("deletePlantingIntentBtn");
    if (deleteBtn) {
        const status = (intent.status || "DRAFT").toUpperCase();
        if (status === "DRAFT") {
            deleteBtn.style.display = "inline-flex";
        } else {
            deleteBtn.style.display = "none";
        }
    }

    const cancelBtn = document.getElementById("cancelEditPlantingIntentBtn");
    if (cancelBtn) cancelBtn.remove();

    console.log("Planting intent edit cancelled.");
}

// ============================================================
// SAVE PLANTING INTENT CHANGES
// ============================================================

async function savePlantingIntentChanges() {
    const intent = window.currentSelectedPlantingIntent;
    if (!intent) {
        alert("No planting intent selected.");
        return;
    }

    const commoditySelect = document.getElementById("detailCommodity");
    const rawCommodity = commoditySelect ? commoditySelect.value : intent.commodity;

    const rawVolume = document.getElementById("detailVolume")?.value || intent.volume;

    const rawPlantingDate = document.getElementById("detailPlantingDate")?.value || "";
    const rawHarvestDate = document.getElementById("detailHarvestDate")?.value || "";

    const rawRemarks = document.getElementById("detailRemarks")?.value || "";

    if (!rawCommodity || !rawCommodity.trim()) {
        alert("Please select a Commodity.");
        document.getElementById("detailCommodity")?.focus();
        return;
    }

    const volumeValue = String(rawVolume).replace(/,/g, "").replace(/kg/gi, "").trim();
    if (!volumeValue || isNaN(Number(volumeValue)) || Number(volumeValue) <= 0) {
        alert("Please enter a valid volume.");
        document.getElementById("detailVolume")?.focus();
        return;
    }

    if (!rawPlantingDate) {
        alert("Please select a Planting Date.");
        document.getElementById("detailPlantingDate")?.focus();
        return;
    }

    if (!rawHarvestDate) {
        alert("Please select a Harvest Date.");
        document.getElementById("detailHarvestDate")?.focus();
        return;
    }

    const payload = {
        commodity: rawCommodity.trim(),
        volume: Number(volumeValue),
        planting_date: rawPlantingDate,
        harvest_date: rawHarvestDate,
        remarks: rawRemarks || ""
    };

    console.log("Saving changes:", payload);

    try {
        const url = PLANTING_INTENTS_ENDPOINT + intent.planting_intent_id;
        const token = getAuthToken();

        if (!intent.planting_intent_id) {
            alert("Cannot save: Planting Intent ID is missing.");
            return;
        }

        const response = await fetch(url, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { "Authorization": `Bearer ${token}` } : {})
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let errorData = null;
            const text = await response.text();
            try { errorData = JSON.parse(text); } catch (e) {}
            
            let errorMessage = `HTTP ${response.status}`;
            if (errorData && errorData.detail) {
                errorMessage = typeof errorData.detail === "string"
                    ? errorData.detail
                    : JSON.stringify(errorData.detail);
            } else if (text) {
                errorMessage = text.substring(0, 200);
            }
            throw new Error(errorMessage);
        }

        const result = await response.json();
        console.log("Update successful:", result);

        intent.commodity = payload.commodity;
        intent.volume = payload.volume;
        intent.planting_date = payload.planting_date;
        intent.harvest_date = payload.harvest_date;
        intent.remarks = payload.remarks;
        intent.updated_at = new Date().toISOString();

        const index = PLANTING_INTENTS_DATA.findIndex(function(item) {
            return String(item.planting_intent_id) === String(intent.planting_intent_id);
        });
        if (index !== -1) {
            PLANTING_INTENTS_DATA[index] = intent;
        }

        renderPlantingIntentsTable();

        window.isEditingPlantingIntent = false;
        resetPlantingIntentDetailFields();

        const editBtn = document.getElementById("editPlantingIntentBtn");
        if (editBtn) {
            editBtn.textContent = "Edit Details";
            editBtn.style.background = "#D97706";
            editBtn.style.display = "inline-flex";
            editBtn.disabled = false;
        }

        const submitBtn = document.getElementById("submitPlantingIntentBtn");
        if (submitBtn) {
            submitBtn.style.display = "inline-flex";
            const status = (intent.status || "DRAFT").toUpperCase();
            if (status === "SUBMITTED") {
                submitBtn.textContent = "Return to Draft";
                submitBtn.style.background = "#D97706";
            } else {
                submitBtn.textContent = "Finalize";
                submitBtn.style.background = "#2E7D32";
            }
            submitBtn.disabled = false;
        }

        const backBtn = document.getElementById("backFromPlantingIntentDetailsBtn");
        if (backBtn) backBtn.style.display = "inline-flex";

        const deleteBtn = document.getElementById("deletePlantingIntentBtn");
        if (deleteBtn) {
            const status = (intent.status || "DRAFT").toUpperCase();
            deleteBtn.style.display = status === "DRAFT" ? "inline-flex" : "none";
        }

        const cancelBtn = document.getElementById("cancelEditPlantingIntentBtn");
        if (cancelBtn) cancelBtn.remove();

        if (commoditySelect) commoditySelect.value = intent.commodity || "";

        const volumeInputAfterSave = document.getElementById("detailVolume");
        if (volumeInputAfterSave) {
            const numericVolumeAfterSave = Number(
                String(intent.volume || "").replace(/,/g, "").replace(/kg/gi, "").trim()
            );
            volumeInputAfterSave.value = isNaN(numericVolumeAfterSave) ? "" : numericVolumeAfterSave;
        }

        const plantingDateInputAfter = document.getElementById("detailPlantingDate");
        if (plantingDateInputAfter) {
            plantingDateInputAfter.value = toDateInputValue(intent.planting_date);
        }

        const harvestDateInputAfter = document.getElementById("detailHarvestDate");
        if (harvestDateInputAfter) {
            harvestDateInputAfter.value = toDateInputValue(intent.harvest_date);
        }

        setValue("detailRemarks", intent.remarks || "");

        alert("Planting Intent updated successfully!");

        const listView = document.getElementById("plantingIntentListSubview");
        const detailsView = document.getElementById("plantingIntentDetailsSubview");

        if (detailsView) detailsView.classList.add("hidden-element");
        if (listView) listView.classList.remove("hidden-element");

        window.currentSelectedPlantingIntent = null;

        await fetchPlantingIntents();

    } catch (error) {
        console.error("Save error:", error);

        window.isEditingPlantingIntent = false;
        resetPlantingIntentDetailFields();

        const editBtn = document.getElementById("editPlantingIntentBtn");
        if (editBtn) {
            editBtn.textContent = "Edit Details";
            editBtn.style.background = "#D97706";
            editBtn.style.display = "inline-flex";
            editBtn.disabled = false;
        }

        const submitBtn = document.getElementById("submitPlantingIntentBtn");
        if (submitBtn) {
            submitBtn.style.display = "inline-flex";
            const status = (intent.status || "DRAFT").toUpperCase();
            if (status === "SUBMITTED") {
                submitBtn.textContent = "Return to Draft";
                submitBtn.style.background = "#D97706";
            } else {
                submitBtn.textContent = "Finalize";
                submitBtn.style.background = "#2E7D32";
            }
            submitBtn.disabled = false;
        }

        const backBtn = document.getElementById("backFromPlantingIntentDetailsBtn");
        if (backBtn) backBtn.style.display = "inline-flex";

        const deleteBtn = document.getElementById("deletePlantingIntentBtn");
        if (deleteBtn) {
            const status = (intent.status || "DRAFT").toUpperCase();
            deleteBtn.style.display = status === "DRAFT" ? "inline-flex" : "none";
        }

        const cancelBtn = document.getElementById("cancelEditPlantingIntentBtn");
        if (cancelBtn) cancelBtn.remove();

        alert("Failed to update planting intent.\n\n" + 
              (error.message || error.name || "Unknown error. Check the Console for details."));
    }
}



/* ============================================================
   SUBMIT PLANTING INTENT (NEW INTENT)
============================================================ */

async function submitPlantingIntent() {
    const form = document.getElementById("submitPlantIntentForm");
    if (!form) {
        alert("Planting Intent form not found.");
        return;
    }

    const farmerNameSelect = document.getElementById("piFarmerName");
    const farmerName = farmerNameSelect ? farmerNameSelect.options[farmerNameSelect.selectedIndex]?.text || "" : "";
    const farmerId = document.getElementById("piFarmerId")?.value || "";
    const plantingDate = document.getElementById("piPlantDate")?.value || "";
    const harvestDate = document.getElementById("piHarvestDate")?.value || "";
    const commodity = document.getElementById("piCommodity")?.value?.trim() || "";
    const volume = document.getElementById("piVolume")?.value || "";
    const remarks = document.getElementById("piRemarks")?.value || "";

    if (!farmerName || farmerName === "Select Farmer") {
        alert("Please select a Farmer.");
        return;
    }
    if (!farmerId) {
        alert("Farmer ID is required.");
        return;
    }
    if (!plantingDate) {
        alert("Please select Planting Date.");
        return;
    }
    if (!harvestDate) {
        alert("Please select Harvest Date.");
        return;
    }
    if (!commodity) {
        alert("Please enter Commodity.");
        return;
    }
    if (!volume) {
        alert("Please enter Volume.");
        return;
    }

    const parsedFarmerId = Number(farmerId);
    if (!Number.isInteger(parsedFarmerId)) {
        alert("Farmer ID must be a valid number.");
        return;
    }

    const parsedVolume = Number(volume);
    if (isNaN(parsedVolume) || parsedVolume <= 0) {
        alert("Volume must be a valid positive number.");
        return;
    }

    const plantingIntentData = {
        farmer_id: parsedFarmerId,
        commodity: commodity,
        volume: parsedVolume,
        planting_date: plantingDate,
        harvest_date: harvestDate,
        remarks: remarks || undefined
    };

    console.log("Submitting planting intent:", plantingIntentData);

    try {
        const createdIntent = await apiRequest(PLANTING_INTENTS_ENDPOINT, {
            method: "POST",
            body: JSON.stringify(plantingIntentData)
        });

        console.log("Planting intent created:", createdIntent);

        const newIntentId = createdIntent?.planting_intent_id 
            || createdIntent?.data?.planting_intent_id 
            || null;

        await fetchPlantingIntents();
        renderPlantingIntentsTable();

        if (typeof populateReportIntentSelect === "function") {
            populateReportIntentSelect();
        }

        const modal = document.getElementById("plantIntentSubmittedModal");
        if (modal) modal.classList.add("show");

    } catch (error) {
        console.error("Create planting intent error:", error);
        handleAuthError(error);
        alert("Failed to submit planting intent.\n\n" + (error.message || "Please check the FastAPI server."));
    }
}


/* ============================================================
   CONFIRMATION MODAL HELPER
============================================================ */

function showConfirmModal({
    title = "Confirm Action",
    message = "Are you sure?",
    details = null,
    onConfirm,
    onCancel = null,
    confirmText = "Confirm",
    cancelText = "Cancel",
    confirmColor = null,
} = {}) {
    const modal = document.getElementById("confirmReportModal");
    const titleEl = document.getElementById("confirmReportTitle");
    const textEl = document.getElementById("confirmReportText");
    const detailsEl = document.getElementById("confirmReportDetails");
    const cancelBtn = document.getElementById("cancelConfirmReportBtn");
    const proceedBtn = document.getElementById("proceedConfirmReportBtn");

    // Fallback to native confirm if modal markup is missing
    if (!modal || !titleEl || !textEl || !cancelBtn || !proceedBtn) {
        ESaka.confirm(message, { title, confirmText }).then(ok => { if (ok && onConfirm) onConfirm(); });
        return;
    }

    titleEl.textContent = title;
    textEl.innerHTML = message;

    // Structured details block (optional)
    if (details && detailsEl) {
        detailsEl.innerHTML = details;
        detailsEl.style.display = "block";
    } else if (detailsEl) {
        detailsEl.innerHTML = "";
        detailsEl.style.display = "none";
    }

    // Confirm button text + color
    proceedBtn.textContent = confirmText;
    proceedBtn.style.background = confirmColor || "";

    // Cancel button text
    cancelBtn.textContent = cancelText;

    const newProceedBtn = proceedBtn.cloneNode(true);
    proceedBtn.parentNode.replaceChild(newProceedBtn, proceedBtn);

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newProceedBtn.addEventListener("click", function () {
        modal.classList.remove("show");
        onConfirm && onConfirm();
    });

    newCancelBtn.addEventListener("click", function () {
        modal.classList.remove("show");
        onCancel && onCancel();
    });

    // Click outside to close
    modal.onclick = function (e) {
        if (e.target === modal) modal.classList.remove("show");
    };

    modal.classList.add("show");
}


/* ============================================================
   SUCCESS MODAL HELPER
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
    const iconEl = modal?.querySelector("div[style*='border-radius: 50%']");

    // Fallback to native alert if modal markup is missing
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
   NAVIGATION HELPER — force-switch to Reports main view
   Use after actions that should return the user to the list.
============================================================ */

function switchToReportsTab() {
    // 1. Highlight the Reports nav button
    const reportsNavBtn = document.querySelector('.nav-item[data-view="reports"]');
    if (reportsNavBtn) {
        document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
            btn.classList.toggle("active", btn === reportsNavBtn);
        });
    }

    // 2. Show the Reports view, hide others
    document.querySelectorAll(".view").forEach(view => {
        view.classList.remove("active-view");
    });
    const reportsView = document.getElementById("view-reports");
    if (reportsView) reportsView.classList.add("active-view");

    // 3. Within Reports, show only the main list
    const mainView = document.getElementById("reportsMainSubview");
    const detailsView = document.getElementById("reportDetailsSubview");
    const submitView = document.getElementById("submitReportSubview");

    if (detailsView) {
        detailsView.classList.add("hidden-element");
        detailsView.style.display = "";
    }
    if (submitView) {
        submitView.classList.add("hidden-element");
        submitView.style.display = "";
    }
    if (mainView) {
        mainView.classList.remove("hidden-element");
        mainView.style.display = "";
    }
}



/* ============================================================
   INITIALIZE REPORTING
============================================================ */

function initReporting() {
    console.log("Initializing Reporting...");

    const createReportBtn = document.getElementById("createReportBtn");
    const cancelReportBtn = document.getElementById("cancelReportBtn");
    const submitFinalBtn = document.getElementById("submitReportFinalBtn");
    const backDetailsBtn = document.getElementById("backFromReportDetailsBtn");
    const editReportBtn = document.getElementById("editReportBtn");

    const selectFileBtn = document.getElementById("selectReportFileBtn");
    const fileInput = document.getElementById("reportFileInput");
    const fileNameInput = document.getElementById("reportDocFilename");

    const filterSelect = document.getElementById("individualReportFilter");
    if (filterSelect) {
        filterSelect.addEventListener("change", function() {
            individualFilterStatus = this.value;
            console.log("Filter changed to:", individualFilterStatus);
            renderFinalizedIntents(allIndividualReports);
        });
    }

    if (createReportBtn) {
        createReportBtn.addEventListener("click", async function () {
            setReportLoading(true);
            try {
                await fetchPlantingIntents();
                await loadReports();
                await openSubmitReportSubview();
            } finally {
                setReportLoading(false);
            }
        });
    }

    if (cancelReportBtn) {
        cancelReportBtn.addEventListener("click", function () {
            const title = document.getElementById("reportTitleInput")?.value?.trim() || "";
            const notes = document.getElementById("reportNotesInput")?.value?.trim() || "";
            const intents = window.selectedReportIntents || [];

            // Nothing to lose → just close immediately
            if (!title && !notes && intents.length === 0) {
                console.log("Cancelling empty report form...");
                window.currentEditingReportId = null;
                closeSubmitReportSubview();
                return;
            }

            const detailsHtml = `
                <div style="display:grid; grid-template-columns: auto 1fr; gap: 6px 14px;">
                    <span style="font-weight:700;">Title:</span>
                    <span>${escapeHtml(title || "(empty)")}</span>
                    <span style="font-weight:700;">Intents:</span>
                    <span>${intents.length} selected</span>
                    <span style="font-weight:700;">Notes:</span>
                    <span>${notes ? "Yes" : "(empty)"}</span>
                </div>
            `;

            showConfirmModal({
                title: "Discard Changes?",
                message: "All unsaved changes to this report will be lost. <br><strong>This action cannot be undone.</strong>",
                details: detailsHtml,
                confirmText: "Yes, Discard",
                confirmColor: "#C0392B",
                cancelText: "Keep Editing",
                onConfirm: () => {
                    console.log("Cancelling report edit...");
                    window.currentEditingReportId = null;
                    closeSubmitReportSubview();
                },
            });
        });
    }

    /* ============================================================
       SUBMIT REPORT — validate first, then styled confirmation
    ============================================================ */
    if (submitFinalBtn) {
        submitFinalBtn.addEventListener("click", function () {
            const title = document.getElementById("reportTitleInput")?.value?.trim() || "";
            const notes = document.getElementById("reportNotesInput")?.value?.trim() || "";
            const intents = window.selectedReportIntents || [];

            const isResubmit =
                this.dataset.mode === "edit" ||
                this.textContent.toLowerCase().includes("resubmit");

            if (intents.length === 0) {
                alert("Please add at least one planting intent.");
                return;
            }

            if (!title) {
                alert("Please enter a Report Title.");
                document.getElementById("reportTitleInput")?.focus();
                return;
            }

            if (!notes) {
                alert("Please enter notes / remarks.");
                document.getElementById("reportNotesInput")?.focus();
                return;
            }

            const truncatedNotes = notes.length > 80
                ? notes.substring(0, 80) + "..."
                : notes;

            const detailsHtml = `
                <div style="display:grid; grid-template-columns: auto 1fr; gap: 6px 14px;">
                    <span style="font-weight:700;">Title:</span>
                    <span>${escapeHtml(title)}</span>
                    <span style="font-weight:700;">Intents:</span>
                    <span>${intents.length} planting intent${intents.length !== 1 ? "s" : ""}</span>
                    <span style="font-weight:700;">Notes:</span>
                    <span style="font-style:italic;">"${escapeHtml(truncatedNotes)}"</span>
                </div>
            `;

            showConfirmModal({
                title: isResubmit
                    ? "Resubmit Report to Municipal?"
                    : "Submit Report to Municipal?",
                message: isResubmit
                    ? "This revised report will be sent back to your Municipal Coordinator. <br><strong>Make sure you've addressed all the flagged remarks.</strong>"
                    : "This report will be sent to your Municipal Coordinator for validation. <br><strong>You can only edit it again if it gets flagged for revision.</strong>",
                details: detailsHtml,
                confirmText: isResubmit ? "Yes, Resubmit" : "Yes, Submit",
                confirmColor: "#2E7D32",
                cancelText: "Cancel",
                onConfirm: () => {
                    saveReport("SUBMITTED_MUNICIPAL_PENDING");
                },
            });
        });
    }

    if (backDetailsBtn) {
        backDetailsBtn.addEventListener("click", function () {
            closeReportDetailsSubview();
        });
    }

    if (editReportBtn) {
        editReportBtn.addEventListener("click", function () {
            const reportId = this.dataset.reportId;
            if (!reportId) {
                alert("Report ID not found.");
                return;
            }

            const report = window.currentSelectedReport;
            const status = (report?.status || "").toUpperCase();
            const isFlagged = status.includes("FLAGGED");

            if (!isFlagged) {
                alert("Only flagged reports can be edited.");
                return;
            }

            const resubmitBtn = document.getElementById("resubmitReportBtn");
            if (resubmitBtn) {
                resubmitBtn.style.display = "inline-flex";
                resubmitBtn.disabled = false;
                resubmitBtn.dataset.reportId = String(reportId);
            }
            
            this.style.display = "none";

            openSubmitReportSubview(reportId);
        });
    }

    if (selectFileBtn && fileInput) {
        selectFileBtn.addEventListener("click", function () {
            fileInput.click();
        });
    }

    if (fileInput) {
        initReportAttachments();

        document.addEventListener("click", function(e) {
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

    const resubmitBtn = document.getElementById("resubmitReportBtn");
    if (resubmitBtn) {
        resubmitBtn.addEventListener("click", async function () {
            const reportId = this.dataset.reportId;
            if (!reportId) {
                alert("Report ID not found.");
                return;
            }

            // ============================================================
            // ✅ STEP 1: Confirm
            // ============================================================
            const confirmed = await ESaka.confirm(
                "Are you sure you want to resubmit this report to Municipal?\n\n" +
                "It will be sent back for validation and moved to the Pending list.",
                { title: "Resubmit report?", confirmText: "Resubmit" }
            );
            if (!confirmed) return;

            const originalText = this.textContent;
            this.disabled = true;
            this.textContent = "Resubmitting...";

            try {
                // ============================================================
                // ✅ STEP 2: Send PATCH request
                // ============================================================
                await apiRequest(`${API_BASE_URL}/api/raw-plant-reports/${reportId}/status`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        status: "SUBMITTED_MUNICIPAL_PENDING"
                    })
                });

                // ============================================================
                // ✅ STEP 3: Clear selection state BEFORE navigating
                // ============================================================
                window.currentSelectedReport = null;
                window.currentEditingReportId = null;
                window.selectedReportIntents = [];

                // ============================================================
                // ✅ STEP 4: Force-switch to Reports tab
                // ============================================================
                const reportsNavBtn = document.querySelector('.nav-item[data-view="reports"]');
                if (reportsNavBtn) {
                    // Remove active from all nav buttons + views
                    document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
                        btn.classList.toggle("active", btn === reportsNavBtn);
                    });
                    document.querySelectorAll(".view").forEach(view => {
                        view.classList.remove("active-view");
                    });

                    const reportsView = document.getElementById("view-reports");
                    if (reportsView) reportsView.classList.add("active-view");
                }

                // ============================================================
                // ✅ STEP 5: Reset subviews — show main list only
                // ============================================================
                const mainView = document.getElementById("reportsMainSubview");
                const detailsView = document.getElementById("reportDetailsSubview");
                const submitView = document.getElementById("submitReportSubview");

                if (detailsView) {
                    detailsView.classList.add("hidden-element");
                    detailsView.style.display = "";
                }
                if (submitView) {
                    submitView.classList.add("hidden-element");
                    submitView.style.display = "";
                }
                if (mainView) {
                    mainView.classList.remove("hidden-element");
                    mainView.style.display = "";
                }

                // Also reset the submit form fields
                resetReportForm();

                // ============================================================
                // ✅ STEP 6: Refresh data (AWAIT both)
                // ============================================================
                await fetchPlantingIntents();
                await loadReports();

                // ============================================================
                // ✅ STEP 7: Scroll to top
                // ============================================================
                window.scrollTo({ top: 0, behavior: "smooth" });

                // ============================================================
                // ✅ STEP 8: Styled success modal (not alert)
                // ============================================================
                showSuccessModal({
                    title: "Resubmitted to Municipal",
                    message: "Your revised report has been successfully resubmitted. It now appears under <strong>Pending at Municipal</strong>.",
                    confirmText: "View Reports",
                    onClose: () => {
                        // One more refresh just in case, after user closes
                        window.scrollTo({ top: 0, behavior: "smooth" });
                    },
                });

            } catch (error) {
                console.error("Resubmit error:", error);

                showSuccessModal({
                    title: "Resubmit Failed",
                    message: escapeHtml(error.message || "Please try again."),
                    confirmText: "OK",
                });

                // Restore button state on error
                this.disabled = false;
                this.textContent = originalText || "Resubmit";
            }
        });
    }
}


function renderFinalizedIntents(intents) {
    const tbody = document.getElementById('individualReportsTableBody');
    if (!tbody) return;

    let filteredIntents = intents;
    if (individualFilterStatus !== 'all') {
        filteredIntents = intents.filter(function(intent) {
            const status = (intent.finalized_status || 'NOT PLANTED').toUpperCase();
            return status === individualFilterStatus;
        });
    }

    if (!filteredIntents || filteredIntents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding:30px; text-align:center; color:#999;">No finalized planting intents found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredIntents.map(function(intent) {
        const status = intent.finalized_status || "NOT PLANTED";
        const statusUpper = status.toUpperCase();

        let displayText = statusUpper;
        let bgColor = '#6c757d';

        if (statusUpper === 'NOT PLANTED') {
            displayText = 'Not Planted';
            bgColor = '#6c757d';
        } else if (statusUpper === 'PLANTED') {
            displayText = 'Planted';
            bgColor = '#D97706';
        } else if (statusUpper === 'HARVESTED') {
            displayText = 'Harvested';
            bgColor = '#2E7D32';
        } else if (statusUpper === 'MEDIATING') {
            displayText = 'Mediating';
            bgColor = '#2980B9';
        }

        const plantingDate = intent.planting_date ? formatPlantingDate(intent.planting_date) : '-';
        const harvestDate = intent.harvest_date ? formatPlantingDate(intent.harvest_date) : '-';

        let locationStr = "-";
        if (intent.location && intent.location !== "-" && intent.location !== "") {
            locationStr = intent.location;
        } else if (intent.barangay && intent.municipality) {
            locationStr = `${intent.barangay}, ${intent.municipality}`;
        } else if (intent.barangay) {
            locationStr = intent.barangay;
        } else if (intent.municipality) {
            locationStr = intent.municipality;
        }

        const allowedTransitions = getAllowedStatusTransitions(statusUpper);
        const isOptionAllowed = (s) => allowedTransitions.includes(s);

        return `
            <tr class="clickable-row" data-intent-id="${intent.planting_intent_id}">
                <td style="padding:12px 14px; text-align:center; font-weight:600;">#${intent.planting_intent_id}</td>
                <td style="padding:12px 14px; text-align:center;">${escapeHtml(intent.farmer_name)}</td>
                <td style="padding:12px 14px; text-align:center;">${escapeHtml(intent.commodity)}</td>
                <td style="padding:12px 14px; text-align:center;">${escapeHtml(locationStr)}</td>
                <td style="padding:12px 14px; text-align:center;">${formatPlantingVolume(intent.volume)}</td>
                <td style="padding:12px 14px; text-align:center;">${plantingDate}</td>
                <td style="padding:12px 14px; text-align:center;">${harvestDate}</td>
                <td style="padding:12px 14px; text-align:center;">
                    <div class="status-dropdown-wrapper" data-intent-id="${intent.planting_intent_id}" style="position:relative; display:inline-block;">
                        <span class="status-pill clickable-pill" 
                              data-current-status="${statusUpper}"
                              style="cursor:pointer; display:inline-block; padding:4px 16px; border-radius:999px; font-size:11.5px; font-weight:700; color:#FFFFFF; text-shadow:0 1px 1px rgba(0,0,0,0.2); text-align:center; white-space:nowrap; letter-spacing:0.02em; user-select:none; background-color:${bgColor}; transition:all 0.2s ease;">
                            ${escapeHtml(displayText)}
                            <span style="font-size:8px; margin-left:6px;">▼</span>
                        </span>
                        <div class="status-dropdown-menu" style="display:none; position:absolute; top:100%; left:50%; transform:translateX(-50%); margin-top:4px; background:#FFFFFF; border:1.5px solid #DFD8C6; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); min-width:140px; z-index:1000; overflow:hidden;">
                            <div class="status-option" 
                                 data-status="NOT PLANTED"
                                 data-allowed="${isOptionAllowed('NOT PLANTED')}"
                                 title="${isOptionAllowed('NOT PLANTED') ? 'Change status to Not Planted' : 'Hindi available — check current status'}"
                                 style="padding:8px 16px; font-size:12px; color:${isOptionAllowed('NOT PLANTED') ? '#333' : '#BBB'}; border-bottom:1px solid #f0f0f0; cursor:${isOptionAllowed('NOT PLANTED') ? 'pointer' : 'not-allowed'}; background:${statusUpper === 'NOT PLANTED' ? '#F0F0F0' : 'transparent'};">
                                Not Planted ${statusUpper === 'NOT PLANTED' ? '(current)' : ''}
                            </div>
                            <div class="status-option" 
                                 data-status="PLANTED"
                                 data-allowed="${isOptionAllowed('PLANTED')}"
                                 title="${isOptionAllowed('PLANTED') ? 'Change status to Planted' : 'Hindi available — check current status'}"
                                 style="padding:8px 16px; font-size:12px; color:${isOptionAllowed('PLANTED') ? '#333' : '#BBB'}; border-bottom:1px solid #f0f0f0; cursor:${isOptionAllowed('PLANTED') ? 'pointer' : 'not-allowed'}; background:${statusUpper === 'PLANTED' ? '#F0F0F0' : 'transparent'};">
                                Planted ${statusUpper === 'PLANTED' ? '(current)' : ''}
                            </div>
                            <div class="status-option" 
                                 data-status="HARVESTED"
                                 data-allowed="${isOptionAllowed('HARVESTED')}"
                                 title="${isOptionAllowed('HARVESTED') ? 'Change status to Harvested' : 'Hindi available — check current status'}"
                                 style="padding:8px 16px; font-size:12px; color:${isOptionAllowed('HARVESTED') ? '#333' : '#BBB'}; border-bottom:1px solid #f0f0f0; cursor:${isOptionAllowed('HARVESTED') ? 'pointer' : 'not-allowed'}; background:${statusUpper === 'HARVESTED' ? '#F0F0F0' : 'transparent'};">
                                Harvested ${statusUpper === 'HARVESTED' ? '(current)' : ''}
                            </div>
                            <div class="status-option" 
                                 data-status="MEDIATING"
                                 data-allowed="${isOptionAllowed('MEDIATING')}"
                                 title="${isOptionAllowed('MEDIATING') ? 'Change status to Mediating' : 'Hindi available — check current status'}"
                                 style="padding:8px 16px; font-size:12px; color:${isOptionAllowed('MEDIATING') ? '#333' : '#BBB'}; cursor:${isOptionAllowed('MEDIATING') ? 'pointer' : 'not-allowed'}; background:${statusUpper === 'MEDIATING' ? '#F0F0F0' : 'transparent'};">
                                Mediating ${statusUpper === 'MEDIATING' ? '(current)' : ''}
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    const wrappers = tbody.querySelectorAll('.status-dropdown-wrapper');
    
    wrappers.forEach(function(wrapper) {
        const pill = wrapper.querySelector('.clickable-pill');
        const menu = wrapper.querySelector('.status-dropdown-menu');
        
        if (pill) {
            const newPill = pill.cloneNode(true);
            pill.parentNode.replaceChild(newPill, pill);
            
            newPill.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                
                document.querySelectorAll('.status-dropdown-menu').forEach(function(m) {
                    if (m !== menu) m.style.display = 'none';
                });
                
                openStatusDropdownMenu(newPill, menu);
            });
        }
    });
    
    const options = tbody.querySelectorAll('.status-option');
    options.forEach(function(option) {
        option.addEventListener('click', function(e) {
            e.stopPropagation();
            
            const newStatus = this.dataset.status;
            const menu = this.closest('.status-dropdown-menu');
            const wrapper = menu.closest('.status-dropdown-wrapper');
            const intentId = wrapper.dataset.intentId;
            const pill = wrapper.querySelector('.clickable-pill');
            
            const currentStatus = (pill?.dataset.currentStatus || "NOT PLANTED").toUpperCase();
            const allowed = getAllowedStatusTransitions(currentStatus);
            
            if (!allowed.includes(newStatus)) {
                let reason = "";
                if (currentStatus === "NOT PLANTED" && newStatus === "HARVESTED") {
                    reason = "Hindi pwedeng gawing HARVESTED ang isang intent na hindi pa PLANTED.";
                } else if (currentStatus === "HARVESTED") {
                    reason = "Ang HARVESTED status ay FINAL at hindi na mababago.";
                } else {
                    reason = `Hindi pwedeng i-transition mula ${currentStatus} papuntang ${newStatus}.`;
                }
                
                alert("⚠️ Invalid Status Change\n\n" + reason);
                menu.style.display = 'none';
                return;
            }
            
            updateStatusPillVisual(pill, newStatus);
            menu.style.display = 'none';
            updateFinalizedIntentStatus(intentId, newStatus);
        });
    });
    
    tbody.querySelectorAll('.clickable-row').forEach(function(row) {
        row.addEventListener('click', function(e) {
            if (e.target.closest('.status-dropdown-wrapper')) return;
            const intentId = this.dataset.intentId;
            openFinalizedIntentDetails(intentId);
        });
    });
}


function openStatusDropdownMenu(pill, menu) {
    const willOpen = menu.style.display !== 'block';
    if (!willOpen) {
        menu.style.display = 'none';
        return;
    }

    menu.style.display = 'block';
    menu.style.position = 'fixed';
    menu.style.transform = 'none';
    menu.style.margin = '0';

    const pillRect = pill.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const spaceBelow = window.innerHeight - pillRect.bottom;
    const openUp = spaceBelow < menuRect.height + 8 && pillRect.top > menuRect.height + 8;

    const top = openUp ? pillRect.top - menuRect.height - 4 : pillRect.bottom + 4;
    let left = pillRect.left + pillRect.width / 2 - menuRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));

    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
}

function closeStatusDropdownsOnScroll() {
    document.querySelectorAll('.status-dropdown-menu').forEach(function(m) {
        m.style.display = 'none';
    });
}
window.addEventListener('scroll', closeStatusDropdownsOnScroll, true);
window.addEventListener('resize', closeStatusDropdownsOnScroll);

// UPDATE FINALIZED INTENT

async function updateFinalizedIntentStatus(intentId, newStatus, extraPayload = {}) {
    try {
        const url = `${PLANTING_INTENTS_ENDPOINT}${intentId}/finalized-status`;
        const token = getAuthToken();

        const body = {
            finalized_status: newStatus,
            ...extraPayload
        };

        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": token ? `Bearer ${token}` : ""
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData?.detail || `HTTP ${response.status}`);
        }

        const result = await response.json();

        const intent = PLANTING_INTENTS_DATA.find(function (i) {
            return String(i.planting_intent_id) === String(intentId);
        });

        if (intent) {
            intent.finalized_status = newStatus;
            if (extraPayload.actual_planting_date) {
                intent.actual_planting_date = extraPayload.actual_planting_date;
            }
            if (extraPayload.actual_harvest_date) {
                intent.actual_harvest_date = extraPayload.actual_harvest_date;
            }
            if (extraPayload.actual_harvest_volume) {
                intent.actual_harvest_volume = extraPayload.actual_harvest_volume;
            }
            intent.updated_at = new Date().toISOString();
        }

        const reportIntent = allIndividualReports.find(function (r) {
            return String(r.planting_intent_id) === String(intentId);
        });
        if (reportIntent) {
            reportIntent.finalized_status = newStatus;
            if (extraPayload.actual_harvest_volume) {
                reportIntent.actual_harvest_volume = extraPayload.actual_harvest_volume;
            }
        }

        renderPlantingIntentsTable();

    } catch (error) {
        console.error("Failed to update status:", error);
        alert("Failed to update status.\n\n" + error.message);
        renderPlantingIntentsTable();
    }
}


// ============================================================
// CREATE REPORT FROM PLANTING INTENTS
// ============================================================

async function createReportFromIntents(intentIds, notes, attachments) {
    try {
        const reportData = {
            planting_intent_ids: intentIds,
            notes: notes,
            status: "NOT PLANTED"
        };
        
        const response = await apiRequest(`${API_BASE_URL}/api/raw-plant-reports/from-intents`, {
            method: "POST",
            body: JSON.stringify(reportData)
        });
        
        console.log("Report created:", response);
        return response;
    } catch (error) {
        console.error("Failed to create report:", error);
        throw error;
    }
}


// ============================================================
// REPORTS - LOAD REPORTS
// ============================================================

async function loadReports() {
    try {
        console.log("=== LOAD REPORTS DEBUG ===");

        if (!PLANTING_INTENTS_DATA || PLANTING_INTENTS_DATA.length === 0) {
            await fetchPlantingIntents();
        }

        // ✅ Only intents at MUNICIPAL level (pending or flagged)
        //    OR final approved (for reference)
        const finalizedIntents = (PLANTING_INTENTS_DATA || []).filter(function(intent) {
            const status = String(intent.status || '').toUpperCase();
            return (
                status === 'SUBMITTED_MUNICIPAL_PENDING' ||
                status === 'SUBMITTED_MUNICIPAL_FLAGGED' ||
                status === 'SUBMITTED_REGIONAL_APPROVED'
            );
        }).map(function(intent) {
            return {
                report_id: intent.planting_intent_id,
                planting_intent_id: intent.planting_intent_id,
                farmer_id: intent.farmer_id,
                farmer_name: intent.farmer_name || 'Unknown',
                commodity: intent.commodity || '-',
                volume: intent.volume || 0,
                planting_date: intent.planting_date || null,
                harvest_date: intent.harvest_date || null,
                actual_planting_date: intent.actual_planting_date || null,
                actual_harvest_date: intent.actual_harvest_date || null,
                actual_harvest_volume: intent.actual_harvest_volume || null,
                submitted_at: intent.updated_at || intent.created_at,
                finalized_status: intent.finalized_status || 'NOT PLANTED',
                status: intent.status,
                location: intent.location || null,
                barangay: intent.barangay || null,
                municipality: intent.municipality || null,
            };
        });

        console.log("Municipal-level intents found:", finalizedIntents.length);

        let submittedReports = [];
        try {
            const reportsResponse = await apiRequest(
                `${API_BASE_URL}/api/raw-plant-reports/`,
                { method: "GET" }
            );
            let revisionResponse = [];
            try {
                revisionResponse = await apiRequest(AEW_REVISION_ENDPOINT, { method: "GET" });
            } catch (revisionError) {
                console.warn("Could not load dedicated revision reports; using the normal AEW report feed.", revisionError);
            }

            const allReports = Array.isArray(reportsResponse)
                ? reportsResponse
                : (reportsResponse.data || []);
            const revisionReports = Array.isArray(revisionResponse)
                ? revisionResponse
                : (revisionResponse.data || []);

            const reportsById = new Map(allReports.map(report => [String(report.report_id), report]));
            revisionReports.forEach(report => {
                reportsById.set(String(report.report_id), {
                    ...reportsById.get(String(report.report_id)),
                    ...report
                });
            });

            console.log("All reports from API:", reportsById.size);

            // ✅ Only show reports at Municipal level OR final approved
            submittedReports = Array.from(reportsById.values()).filter(function(r) {
                const status = String(r.status || '').toUpperCase().split('.').pop();
                return (
                    status === 'SUBMITTED_MUNICIPAL_PENDING' ||
                    status === 'FOR_MUNICIPAL_VALIDATION' ||
                    status === 'SUBMITTED_MUNICIPAL_FLAGGED' ||
                    status === 'REVISION_REQUIRED' ||
                    status === 'SUBMITTED_REGIONAL_APPROVED'
                );
            }).map(function(r) {
                return {
                    report_id: r.report_id,
                    title: r.title || `${r.commodity} - ${r.farmer_names || 'Unknown'}`,
                    submitted_at: r.created_at || r.submitted_at,
                    approved_at: r.approved_at || r.updated_at,
                    status: r.status,
                    commodity: r.commodity,
                    municipality: r.municipality,
                    intent_count: r.intent_count || 0
                };
            });

            const returnedReports = submittedReports.filter(function(report) {
                const status = String(report.status || '').toUpperCase().split('.').pop();
                return status === 'SUBMITTED_MUNICIPAL_FLAGGED' ||
                       status === 'SUBMITTED_PROVINCIAL_FLAGGED' ||
                       status === 'SUBMITTED_REGIONAL_FLAGGED' ||
                       status === 'REVISION_REQUIRED';
            });
            if (returnedReports.length > 0) {
                showSuccessModal({
                    title: "Report Returned for Revision",
                    message: `${returnedReports.length} report${returnedReports.length === 1 ? " has" : "s have"} been returned by the validator. Please review the remarks and resubmit.`,
                    confirmText: "View Flagged Reports"
                });
            }

            console.log("Municipal-level submitted reports:", submittedReports.length);

        } catch (err) {
            console.warn("Could not fetch reports:", err);
        }

        finalizedIntents.sort(function(a, b) {
            return new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0);
        });

        submittedReports.sort(function(a, b) {
            return new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0);
        });

        allIndividualReports = finalizedIntents;

        renderSubmittedReports(submittedReports);

        console.log("=== LOAD REPORTS COMPLETE ===");

    } catch (error) {
        console.error("Failed to load reports:", error);
    }
}



/* ============================================================
   REPORT DETAILS
============================================================ */

function openReportDetails(report) {
    const mainView = document.getElementById("reportsMainSubview");
    const submitView = document.getElementById("submitReportSubview");
    const detailsView = document.getElementById("reportDetailsSubview");

    if (!detailsView) return;

    if (mainView) mainView.classList.add("hidden-element");
    if (submitView) submitView.classList.add("hidden-element");
    detailsView.classList.remove("hidden-element");

    // Reset timeline
    const historyWrapper = document.getElementById("reportValidationHistoryWrapper");
    const historyContainer = document.getElementById("reportValidationTimelineContainer");
    if (historyWrapper) historyWrapper.style.display = "none";
    if (historyContainer) {
        historyContainer.innerHTML = `
            <div style="color: var(--muted); font-style: italic; font-size: 13px;">
                Loading history...
            </div>
        `;
    }

    window.currentSelectedReport = report;

    const reportId = report.report_id ?? report.id ?? "—";
    const title = report.title || "Report Details";
    const status = (report.status || "DRAFT").toUpperCase();
    const submittedDate = report.submitted_at || report.submission_date || report.created_at;

    const municipalityEl = document.getElementById("detailReportMunicipality");
    if (municipalityEl) {
        municipalityEl.textContent = report.municipality || "—";
    }

    let statusDisplay = status;
    let statusBgColor = "#6c757d";

    if (status.includes("MUNICIPAL_PENDING")) {
        statusDisplay = "Municipal Pending";
        statusBgColor = "#D97706";
    } else if (status.includes("MUNICIPAL_FLAGGED")) {
        statusDisplay = "Municipal Flagged";
        statusBgColor = "#C0392B";
    } else if (status.includes("PROVINCIAL_PENDING")) {
        statusDisplay = "Provincial Pending";
        statusBgColor = "#D97706";
    } else if (status.includes("PROVINCIAL_FLAGGED")) {
        statusDisplay = "Provincial Flagged";
        statusBgColor = "#C0392B";
    } else if (status.includes("REGIONAL_PENDING")) {
        statusDisplay = "Regional Pending";
        statusBgColor = "#D97706";
    } else if (status.includes("REGIONAL_FLAGGED")) {
        statusDisplay = "Regional Flagged";
        statusBgColor = "#C0392B";
    } else if (status.includes("REGIONAL_APPROVED")) {
        statusDisplay = "Regional Approved";
        statusBgColor = "#2E7D32";
    }

    setText("reportDetailsTitle", title);
    setText("detailReportId", reportId);
    setText("detailReportDate", formatReportDate(submittedDate));
    let notesText = report.notes || "";
    notesText = String(notesText).replace(/^[-–—.\s]+/, "").trim();
    setText("detailReportNotes", notesText || "—");

    const subtitleEl = document.getElementById("detailReportTitle");
    if (subtitleEl) {
        const reportIdLabel = report.report_id ?? reportId ?? "—";
        const locationLabel = report.municipality || "—";
        subtitleEl.textContent = `Report #${reportIdLabel} • ${locationLabel}`;
    }

    const statusEl = document.getElementById("detailReportStatus");
    if (statusEl) {
        statusEl.innerHTML = `
            <span class="status-pill" style="
                display:inline-block;
                padding:4px 16px;
                border-radius:999px;
                font-size:11.5px;
                font-weight:700;
                color:#FFFFFF;
                background-color:${statusBgColor};
            ">${escapeHtml(statusDisplay)}</span>
        `;
    }

    (async () => {
        try {
            const fullReport = await apiRequest(
                `${API_BASE_URL}/api/raw-plant-reports/${reportId}`,
                { method: "GET" }
            );
            console.log("Full report:", fullReport);

            setText("detailReportNotes", fullReport.notes || fullReport.remarks || "—");
            renderReportAttachments(fullReport);
            renderIncludedPlantingIntents(fullReport);

            const reportIntents = fullReport.planting_intents
                || fullReport.intents
                || fullReport.included_intents
                || [];

            const municipalSubmitted = (PLANTING_INTENTS_DATA || []).filter(function(i) {
                const st = String(i.status || "").toUpperCase();
                const sameMunicipality = !fullReport.municipality
                    || i.municipality === fullReport.municipality
                    || !i.municipality;
                return (st === "SUBMITTED" || st.startsWith("SUBMITTED_")) && sameMunicipality;
            });

            renderReportSummary(reportIntents, municipalSubmitted, {
                municipality: fullReport.municipality || report.municipality,
                submitted_at: fullReport.created_at || fullReport.submitted_at || report.submitted_at,
                created_at: fullReport.created_at
            });

            // ✅ Render validation timeline
            renderValidationTimeline(
                fullReport.validation_history || [],
                "reportValidationTimelineContainer",
                "reportValidationHistoryWrapper"
            );

        } catch (err) {
            console.error("Failed to load full report:", err);
            // Silent lang — huwag mag-show ng error box
            if (historyWrapper) historyWrapper.style.display = "none";
            if (historyContainer) historyContainer.innerHTML = "";
        }
    })();

    const lockedStatuses = [
        "SUBMITTED_PROVINCIAL_PENDING",
        "SUBMITTED_PROVINCIAL_FLAGGED",
        "SUBMITTED_REGIONAL_PENDING",
        "SUBMITTED_REGIONAL_FLAGGED",
        "SUBMITTED_REGIONAL_APPROVED",
    ];

    const editButton = document.getElementById("editReportBtn");
    const resubmitButton = document.getElementById("resubmitReportBtn");
    const backBtn = document.getElementById("backFromReportDetailsBtn");

    const isDraft = status === "DRAFT";
    const isPending = status === "SUBMITTED_MUNICIPAL_PENDING";
    const isFlagged = status.includes("FLAGGED");
    const isMunicipalFlagged = status === "SUBMITTED_MUNICIPAL_FLAGGED";
    const isHigherFlagged = status === "SUBMITTED_PROVINCIAL_FLAGGED" ||
                            status === "SUBMITTED_REGIONAL_FLAGGED";
    const isLocked = lockedStatuses.includes(status);

    if (editButton) editButton.style.display = "none";
    if (resubmitButton) resubmitButton.style.display = "none";
    if (backBtn) backBtn.style.display = "inline-flex";

    if (isMunicipalFlagged) {
        if (editButton) {
            editButton.style.display = "inline-flex";
            editButton.textContent = "Edit";
            editButton.disabled = false;
            editButton.style.opacity = "1";
            editButton.style.cursor = "pointer";
            editButton.dataset.reportId = String(reportId);
        }
        if (resubmitButton) {
            resubmitButton.style.display = "none";
        }
    }

    if (isHigherFlagged) {
        if (editButton) {
            editButton.style.display = "inline-flex";
            editButton.textContent = "Edit";
            editButton.disabled = false;
            editButton.style.opacity = "1";
            editButton.style.cursor = "pointer";
            editButton.dataset.reportId = String(reportId);
        }
        if (resubmitButton) {
            resubmitButton.style.display = "none";
        }
    }

    if (isLocked) {
        if (editButton) editButton.style.display = "none";
        if (resubmitButton) resubmitButton.style.display = "none";
    }
}


/* ============================================================
   REPORT ATTACHMENTS
============================================================ */

function renderReportAttachments(report) {
    const container = document.getElementById("detailReportAttachments");
    if (!container) return;

    const attachments = report.attachments || report.files || [];

    if (!Array.isArray(attachments) || attachments.length === 0) {
        container.textContent = "No attachments";
        container.style.color = "var(--muted)";
        return;
    }

    container.style.color = "var(--ink)";

    container.innerHTML = attachments.map(function (file) {
        const name = typeof file === "string" 
            ? file 
            : (file.filename || file.file_name || "Attachment");
        
        const storedName = typeof file === "object" 
            ? (file.stored_name || null) 
            : null;
        
        const reportId = report.report_id;

        if (storedName && reportId) {
            const url = `${API_BASE_URL}/api/raw-plant-reports/${reportId}/attachments/${storedName}`;
            
            return `
                <div style="
                    margin-bottom: 8px;
                    padding: 12px 16px;
                    background: #FFFFFF;
                    border: 1.5px solid var(--border);
                    border-radius: 8px;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    max-width: 100%;
                "
                onmouseover="this.style.borderColor='var(--green)'; this.style.background='#F6F3EB'; this.style.boxShadow='0 2px 8px rgba(91, 107, 79, 0.15)'; this.style.transform='translateY(-1px)';"
                onmouseout="this.style.borderColor='var(--border)'; this.style.background='#FFFFFF'; this.style.boxShadow='none'; this.style.transform='translateY(0)';">
                    
                    <div style="
                        width: 36px;
                        height: 36px;
                        border-radius: 8px;
                        background: var(--green-light);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                        font-size: 18px;
                    ">
                        📎
                    </div>
                    
                    <div style="flex: 1; min-width: 0;">
                        <a href="${escapeHtml(url)}" 
                        target="_blank" 
                        rel="noopener"
                        style="
                            color: var(--green-dark);
                            font-weight: 700;
                            text-decoration: none;
                            font-size: 13.5px;
                            display: block;
                            overflow: visible;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                        "
                        title="${escapeHtml(name)}">
                            ${escapeHtml(name)}
                        </a>
                        <div style="
                            font-size: 11px;
                            color: var(--muted);
                            margin-top: 2px;
                        ">
                            Click to view attachment
                        </div>
                    </div>
                    
                    <div style="
                        color: var(--green);
                        font-size: 16px;
                        flex-shrink: 0;
                    ">
                        ↗
                    </div>
                </div>
            `;
        }

        return `
            <div style="
                margin-bottom: 8px;
                padding: 12px 16px;
                background: #F6F3EB;
                border: 1.5px solid var(--border);
                border-radius: 8px;
                display: flex;
                align-items: center;
                gap: 10px;
                color: var(--muted);
            ">
                <div style="
                    width: 36px;
                    height: 36px;
                    border-radius: 8px;
                    background: var(--border-light);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    font-size: 18px;
                ">
                    📎
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHtml(name)}
                    </div>
                    <div style="font-size: 11px; margin-top: 2px;">
                        Not available
                    </div>
                </div>
            </div>
        `;
    }).join("");
}


/* ============================================================
   INCLUDED PLANTING INTENTS
============================================================ */

function renderIncludedPlantingIntents(report) {
    const tbody = document.getElementById("detailReportIntentsBody");
    if (!tbody) return;

    let intents = report.planting_intents || report.intents || report.included_intents || [];

    if (!Array.isArray(intents) || intents.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="padding:20px; text-align:center; color:#999;">
                    No intents included.
                </td>
            </tr>
        `;
        return;
    }

    intents = intents.map(function(intent) {
        const fullIntent = (PLANTING_INTENTS_DATA || []).find(function(i) {
            return String(i.planting_intent_id) === String(intent.planting_intent_id);
        });

        if (fullIntent) {
            return {
                ...intent,
                actual_planting_date: intent.actual_planting_date 
                    || fullIntent.actual_planting_date 
                    || null,
                actual_harvest_date: intent.actual_harvest_date 
                    || fullIntent.actual_harvest_date 
                    || null,
                actual_harvest_volume: intent.actual_harvest_volume 
                    || fullIntent.actual_harvest_volume 
                    || null,
                finalized_status: intent.finalized_status 
                    || fullIntent.finalized_status 
                    || "NOT PLANTED",
                finalized_status_at_submission: intent.finalized_status_at_submission 
                    || fullIntent.finalized_status 
                    || "NOT PLANTED"
            };
        }

        return intent;
    });

    tbody.innerHTML = intents.map(function(intent) {
        const intentId = intent.planting_intent_id || "—";
        const farmer = intent.farmer_name || "N/A";
        const commodity = intent.commodity || "N/A";
        const plannedVol = Number(intent.volume) || 0;
        const actualVol = Number(intent.actual_harvest_volume) || 0;
        const hasActual = actualVol > 0;

        const plannedPlanting = intent.planting_date ? formatPlantingDate(intent.planting_date) : "—";
        const plannedHarvest = intent.harvest_date ? formatPlantingDate(intent.harvest_date) : "—";

        const actualPlanting = intent.actual_planting_date 
            ? formatPlantingDate(intent.actual_planting_date) 
            : null;
        const actualHarvest = intent.actual_harvest_date 
            ? formatPlantingDate(intent.actual_harvest_date) 
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

        const finalizedAtSubmission = intent.finalized_status_at_submission 
            || intent.finalized_status 
            || "NOT PLANTED";

        let finalBgColor = "#6c757d";
        let finalDisplay = "Not Planted";
        if (finalizedAtSubmission === "PLANTED") {
            finalBgColor = "#D97706";
            finalDisplay = "Planted";
        } else if (finalizedAtSubmission === "HARVESTED") {
            finalBgColor = "#2E7D32";
            finalDisplay = "Harvested";
        } else if (finalizedAtSubmission === "MEDIATING") {
            finalBgColor = "#2980B9";
            finalDisplay = "Mediating";
        }

        return `
            <tr>
                <td style="padding:10px 14px; text-align:center; font-weight:600;">#${escapeHtml(String(intentId))}</td>
                <td style="padding:10px 14px;">${escapeHtml(String(farmer))}</td>
                <td style="padding:10px 14px;">${escapeHtml(String(commodity))}</td>
                <td style="padding:10px 14px; text-align:center;">
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
                <td style="padding:10px 14px; text-align:center; background: #FAFAFA;">
                    ${escapeHtml(String(plannedPlanting))}
                </td>
                <td style="padding:10px 14px; text-align:center; background: #FFFBF5;">
                    ${renderActualDate(actualPlanting, intent.planting_date)}
                </td>
                <td style="padding:10px 14px; text-align:center; background: #FAFAFA;">
                    ${escapeHtml(String(plannedHarvest))}
                </td>
                <td style="padding:10px 14px; text-align:center; background: #FFFBF5;">
                    ${renderActualDate(actualHarvest, intent.harvest_date)}
                </td>
                <td style="padding:10px 14px; text-align:center;">
                    <span class="status-pill" style="
                        display:inline-block;
                        padding:3px 12px;
                        border-radius:999px;
                        font-size:11px;
                        font-weight:700;
                        color:#FFFFFF;
                        background-color:${finalBgColor};
                    ">${escapeHtml(finalDisplay)}</span>
                </td>
            </tr>
        `;
    }).join("");
}


// ============================================================
// UPDATE STATUS PILL VISUALLY
// ============================================================

function updateStatusPillVisual(pill, newStatus) {
    if (!pill) return;

    const statusUpper = newStatus.toUpperCase();
    
    let displayText = statusUpper;
    if (statusUpper === 'NOT PLANTED') displayText = 'Not Planted';
    else if (statusUpper === 'PLANTED') displayText = 'Planted';
    else if (statusUpper === 'HARVESTED') displayText = 'Harvested';
    else if (statusUpper === 'MEDIATING') displayText = 'Mediating';
    
    let bgColor = '#6c757d';
    if (statusUpper === 'PLANTED') bgColor = '#D97706';
    else if (statusUpper === 'HARVESTED') bgColor = '#2E7D32';
    else if (statusUpper === 'MEDIATING') bgColor = '#2980B9';
    
    pill.innerHTML = displayText + ' <span style="font-size:8px; margin-left:6px;">▼</span>';
    pill.style.backgroundColor = bgColor;
    pill.dataset.currentStatus = statusUpper;
}


// ============================================================
// CLOSE DROPDOWNS WHEN CLICKING OUTSIDE
// ============================================================

document.addEventListener('click', function(e) {
    if (!e.target.closest('.status-dropdown-wrapper')) {
        document.querySelectorAll('.status-dropdown-menu').forEach(function(m) {
            m.style.display = 'none';
        });
    }
});


// ============================================================
// OPEN SUBMIT REPORT SUBVIEW
// ============================================================

function setReportLoading(isLoading) {
    document.getElementById("reportLoadingOverlay")?.classList.toggle("hidden-element", !isLoading);
}

function formatReportFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

let reportAttachmentFiles = [];
let reportAttachmentUrls = [];
let reportReplaceIndex = -1;

function setReportAttachments(files) {
    reportAttachmentFiles = files;
    const input = document.getElementById("reportFileInput");
    if (input) {
        const transfer = new DataTransfer();
        files.forEach(file => transfer.items.add(file));
        input.files = transfer.files;
    }
    renderReportAttachmentList();
}

function isReportPdf(file) {
    return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function renderReportAttachmentList() {
    const list = document.getElementById("selectedFilesList");
    const nameInput = document.getElementById("reportDocFilename");
    reportAttachmentUrls.forEach(url => URL.revokeObjectURL(url));
    reportAttachmentUrls = [];

    if (nameInput) {
        nameInput.value = reportAttachmentFiles.map(file => file.name).join(", ");
    }
    if (!list) return;
    list.replaceChildren();

    reportAttachmentFiles.forEach((file, index) => {
        const item = document.createElement("div");
        item.className = "report-file-item";

        let thumb;
        if (file.type.startsWith("image/")) {
            const url = URL.createObjectURL(file);
            reportAttachmentUrls.push(url);
            thumb = document.createElement("img");
            thumb.src = url;
            thumb.alt = "";
        } else {
            thumb = document.createElement("div");
            thumb.textContent = isReportPdf(file) ? "PDF" : (file.name.split(".").pop() || "FILE").slice(0, 4).toUpperCase();
        }
        thumb.className = "report-file-thumb";

        const meta = document.createElement("div");
        meta.className = "report-file-meta";
        const name = document.createElement("div");
        name.className = "report-file-name";
        name.textContent = file.name;
        name.title = file.name;
        const size = document.createElement("div");
        size.className = "report-file-size";
        size.textContent = formatReportFileSize(file.size);
        meta.append(name, size);

        const actions = document.createElement("div");
        actions.className = "report-file-actions";
        [["Preview", "preview"], ["Replace", "replace"], ["Remove", "remove danger"]].forEach(([label, action]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn-outline-report " + (action.includes("danger") ? "danger" : "");
            button.dataset.action = action.split(" ")[0];
            button.dataset.index = String(index);
            button.textContent = label;
            actions.appendChild(button);
        });

        item.append(thumb, meta, actions);
        list.appendChild(item);
    });
}

function closeReportFilePreview() {
    const modal = document.getElementById("reportFilePreviewModal");
    const body = document.getElementById("reportFilePreviewBody");
    modal?.classList.add("hidden-element");
    if (body) {
        body.querySelectorAll("[src]").forEach(el => {
            if (el.src.startsWith("blob:")) URL.revokeObjectURL(el.src);
        });
        body.replaceChildren();
    }
}

function previewReportFile(file) {
    const modal = document.getElementById("reportFilePreviewModal");
    const body = document.getElementById("reportFilePreviewBody");
    const title = document.getElementById("reportFilePreviewName");
    if (!modal || !body) return;

    body.replaceChildren();
    title.textContent = `${file.name} (${formatReportFileSize(file.size)})`;

    if (file.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        img.alt = file.name;
        body.appendChild(img);
    } else if (isReportPdf(file)) {
        const frame = document.createElement("iframe");
        frame.src = URL.createObjectURL(file);
        frame.title = file.name;
        body.appendChild(frame);
    } else {
        const note = document.createElement("div");
        note.textContent = "Preview is not available for this file type. Filename: " + file.name;
        body.appendChild(note);
    }
    modal.classList.remove("hidden-element");
}

function initReportAttachments() {
    const input = document.getElementById("reportFileInput");
    const replaceInput = document.getElementById("reportReplaceInput");
    const list = document.getElementById("selectedFilesList");
    if (!input || input.dataset.previewReady === "true") return;
    input.dataset.previewReady = "true";

    input.addEventListener("change", function () {
        const added = Array.from(this.files || []);
        const existing = reportAttachmentFiles.filter(f => !added.includes(f));
        const merged = existing.concat(added.filter(file =>
            !existing.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)));
        setReportAttachments(merged);
    });

    replaceInput?.addEventListener("change", function () {
        const file = this.files?.[0];
        if (file && reportReplaceIndex >= 0 && reportAttachmentFiles[reportReplaceIndex]) {
            const next = reportAttachmentFiles.slice();
            next[reportReplaceIndex] = file;
            setReportAttachments(next);
        }
        reportReplaceIndex = -1;
        this.value = "";
    });

    list?.addEventListener("click", function (event) {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const index = parseInt(button.dataset.index, 10);
        const file = reportAttachmentFiles[index];
        if (!file) return;

        if (button.dataset.action === "preview") {
            previewReportFile(file);
        } else if (button.dataset.action === "replace") {
            reportReplaceIndex = index;
            replaceInput?.click();
        } else if (button.dataset.action === "remove") {
            setReportAttachments(reportAttachmentFiles.filter((_, i) => i !== index));
        }
    });

    document.getElementById("reportFilePreviewClose")?.addEventListener("click", closeReportFilePreview);
    document.getElementById("reportFilePreviewModal")?.addEventListener("click", function (event) {
        if (event.target === this) closeReportFilePreview();
    });
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeReportFilePreview();
    });
}

async function openSubmitReportSubview(reportId = null) {
    console.log("Opening submit report subview...");
    setReportLoading(true);
    try {
        await openSubmitReportSubviewContent(reportId);
    } finally {
        setReportLoading(false);
    }
}

async function openSubmitReportSubviewContent(reportId = null) {
    closeAllModals();
    resetReportForm();
    
    const mainView = document.getElementById("reportsMainSubview");
    const submitView = document.getElementById("submitReportSubview");
    const detailsView = document.getElementById("reportDetailsSubview");

    if (mainView) mainView.classList.add("hidden-element");
    if (detailsView) detailsView.classList.add("hidden-element");
    if (submitView) submitView.classList.remove("hidden-element");

    window.selectedReportIntents = [];
    renderSelectedReportIntents();
    
    if (!PLANTING_INTENTS_DATA || PLANTING_INTENTS_DATA.length === 0) {
        await fetchPlantingIntents();
    }
    
    populateReportIntentSelect();

    if (reportId) {
        window.currentEditingReportId = reportId;
        
        await loadReportForEditing(reportId);
        
        const submitBtn = document.getElementById("submitReportFinalBtn");
        if (submitBtn) {
            submitBtn.textContent = "Resubmit to Municipal";
            submitBtn.dataset.mode = "edit";
        }
        
        const headerTitle = document.querySelector("#submitReportSubview .header-left h1");
        if (headerTitle) headerTitle.textContent = "Edit Report";
        
        const headerDesc = document.querySelector("#submitReportSubview .header-left p");
        if (headerDesc) headerDesc.textContent = "Update the report and resubmit to Municipal.";
        
    } else {
        window.currentEditingReportId = null;
        
        const submitBtn = document.getElementById("submitReportFinalBtn");
        if (submitBtn) {
            submitBtn.textContent = "Submit to Municipal";
            submitBtn.dataset.mode = "create";
        }
        
        const headerTitle = document.querySelector("#submitReportSubview .header-left h1");
        if (headerTitle) headerTitle.textContent = "Create New Report";
        
        const headerDesc = document.querySelector("#submitReportSubview .header-left p");
        if (headerDesc) headerDesc.textContent = "Select planting intents to include in your weekly report.";
    }
}


// ============================================================
// CLOSE ALL MODALS
// ============================================================

async function closeAllModals() {
    const submitView = document.getElementById("submitReportSubview");
    const detailsView = document.getElementById("reportDetailsSubview");
    const mainView = document.getElementById("reportsMainSubview");
    
    if (submitView) submitView.classList.add("hidden-element");
    if (detailsView) detailsView.classList.add("hidden-element");
    if (mainView) mainView.classList.remove("hidden-element");
    
    const confirmFarmer = document.getElementById("confirmFarmerModal");
    const farmerAdded = document.getElementById("farmerAddedModal");
    const deleteFarmer = document.getElementById("deleteFarmerModal");
    const deleteError = document.getElementById("deleteErrorModal");
    
    if (confirmFarmer) confirmFarmer.classList.remove("show");
    if (farmerAdded) farmerAdded.classList.remove("show");
    if (deleteFarmer) deleteFarmer.classList.remove("show");
    if (deleteError) deleteError.classList.remove("show");
    
    const plantIntentSubmitted = document.getElementById("plantIntentSubmittedModal");
    if (plantIntentSubmitted) plantIntentSubmitted.classList.remove("show");
    
    const offtakeSubmitted = document.getElementById("offtakeSubmittedModal");
    if (offtakeSubmitted) offtakeSubmitted.classList.remove("show");
    
    resetReportForm();
    
    window.selectedReportIntents = [];

    await fetchPlantingIntents();
    await loadReports();
    
    console.log("All modals closed");
}

/* ============================================================
   CLOSE SUBMIT REPORT
============================================================ */

function closeSubmitReportSubview(options = {}) {
    const { forceMainView = false } = options;

    const mainView = document.getElementById("reportsMainSubview");
    const submitView = document.getElementById("submitReportSubview");
    const detailsView = document.getElementById("reportDetailsSubview");

    if (submitView) {
        submitView.classList.add("hidden-element");
    }

    const editButton = document.getElementById("editReportBtn");
    if (editButton) {
        editButton.style.display = "";
        editButton.disabled = false;
        editButton.style.opacity = "1";
        editButton.style.cursor = "pointer";
    }

    const resubmitBtn = document.getElementById("resubmitReportBtn");
    if (resubmitBtn) {
        resubmitBtn.style.display = "none";
    }

    // ✅ If forceMainView → always go back to Reports main list
    // Otherwise → return to Details if a report is still selected
    if (forceMainView) {
        if (detailsView) {
            detailsView.classList.add("hidden-element");
            detailsView.style.display = "";
        }
        if (mainView) {
            mainView.classList.remove("hidden-element");
            mainView.style.display = "";
        }
        window.currentSelectedReport = null;
    } else if (window.currentSelectedReport && detailsView) {
        detailsView.classList.remove("hidden-element");
        if (mainView) mainView.classList.add("hidden-element");
    } else {
        if (detailsView) detailsView.classList.add("hidden-element");
        if (mainView) mainView.classList.remove("hidden-element");
    }

    resetReportForm();
}



/* ============================================================
   CLOSE REPORT DETAILS
============================================================ */

function closeReportDetailsSubview() {
    const mainView = document.getElementById("reportsMainSubview");
    const detailsView = document.getElementById("reportDetailsSubview");

    if (detailsView) {
        detailsView.classList.add("hidden-element");
    }

    if (mainView) {
        mainView.classList.remove("hidden-element");
    }

    window.currentSelectedReport = null;
}


// ============================================================
// POPULATE REPORT INTENT SELECT
// ============================================================

function populateReportIntentSelect() {
    const select = document.getElementById("reportIntentSelect");
    if (!select) return;

    const currentValue = select.value;
    setTimeout(function () {
        const search = document.getElementById("reportIntentSearch");
        if (search && document.activeElement !== search) {
            search.value = select.value ? (select.options[select.selectedIndex]?.textContent || "") : "";
        }
    }, 0);
    select.innerHTML = `<option value="">Select Planting Intent</option>`;

    const availableIntents = (PLANTING_INTENTS_DATA || []).filter(function(intent) {
        const status = String(intent.status || "").toUpperCase();
        return status === "SUBMITTED";
    });

    const selectedIds = (window.selectedReportIntents || []).map(function(intent) {
        return String(intent.planting_intent_id);
    });

    const unselectedIntents = availableIntents.filter(function(intent) {
        return !selectedIds.includes(String(intent.planting_intent_id));
    });

    unselectedIntents.sort(function(a, b) {
        const dateA = new Date(a.updated_at || a.created_at || 0);
        const dateB = new Date(b.updated_at || b.created_at || 0);
        return dateB - dateA;
    });

    unselectedIntents.forEach(function(intent) {
        const option = document.createElement("option");
        option.value = intent.planting_intent_id;

        let locationStr = "-";
        if (intent.barangay && intent.municipality) {
            locationStr = `${intent.barangay}, ${intent.municipality}`;
        } else if (intent.location && intent.location !== "-") {
            locationStr = intent.location;
        }

        const intentId = intent.planting_intent_id || "-";
        const farmer = intent.farmer_name || "Unknown Farmer";
        const commodity = intent.commodity || "-";
        const volume = intent.volume ? formatPlantingVolume(intent.volume) : "-";
        const plantingDate = intent.planting_date ? formatPlantingDate(intent.planting_date) : "-";
        const finalizedStatus = intent.finalized_status || "NOT PLANTED";

        option.textContent = `${intentId} - ${locationStr}, ${farmer} (${commodity}, ${volume}, ${plantingDate}) [${finalizedStatus}]`;

        select.appendChild(option);
    });

    if (currentValue && unselectedIntents.some(function(i) {
        return String(i.planting_intent_id) === String(currentValue);
    })) {
        select.value = currentValue;
    }
}

/* ============================================================
   RESET REPORT FORM
============================================================ */

function resetReportForm() {
    const form = document.getElementById("submitReportForm");
    if (form) {
        form.reset();
    }

    const titleInput = document.getElementById("reportTitleInput");
    if (titleInput) {
        titleInput.value = "";
    }

    const selectedBody = document.getElementById("selectedIntentsTableBody");
    if (selectedBody) {
        selectedBody.innerHTML = `
            <tr>
                <td colspan="9" style="padding:20px; text-align:center; color:#999;">
                    No planting intents selected. Click "Add Row" to add.
                </td>
            </tr>
        `;
    }

    setReportAttachments([]);

    window.selectedReportIntents = [];
    
    const select = document.getElementById("reportIntentSelect");
    if (select) {
        select.innerHTML = '<option value="">Select Planting Intent</option>';
    }
    
    populateReportIntentSelect();
}


// ============================================================
// ADD INTENT TO REPORT
// ============================================================

function initAddIntentButton() {
    initSearchableSelection("reportIntentSearch", "reportIntentSelect");
    const btn = document.getElementById("addIntentToReportBtn");
    if (!btn) {
        console.warn("addIntentToReportBtn not found");
        return;
    }
    
    btn.addEventListener("click", function(event) {
        event.preventDefault();
        event.stopPropagation();

        const select = document.getElementById("reportIntentSelect");
        if (!select || !select.value) {
            alert("Please select a planting intent.");
            return;
        }

        const intentId = select.value;
        const intent = (PLANTING_INTENTS_DATA || []).find(function (item) {
            return String(item.planting_intent_id) === String(intentId);
        });

        if (!intent) {
            alert("Planting intent not found.");
            return;
        }

        if (!window.selectedReportIntents) {
            window.selectedReportIntents = [];
        }

        const alreadySelected = window.selectedReportIntents.some(function (item) {
            return String(item.planting_intent_id) === String(intentId);
        });

        if (alreadySelected) {
            alert("This planting intent is already added.");
            return;
        }

        window.selectedReportIntents.push(intent);

        if (!allIndividualReports) {
            allIndividualReports = [];
        }

        const alreadyInTable = allIndividualReports.some(function (r) {
            return String(r.planting_intent_id) === String(intentId);
        });

        if (!alreadyInTable) {
            allIndividualReports.unshift({
                report_id: intent.planting_intent_id,
                planting_intent_id: intent.planting_intent_id,
                farmer_name: intent.farmer_name || 'Unknown',
                commodity: intent.commodity || '-',
                volume: intent.volume || 0,
                planting_date: intent.planting_date || null,
                harvest_date: intent.harvest_date || null,
                submitted_at: new Date().toISOString(),
                finalized_status: intent.finalized_status || 'NOT PLANTED',
                status: intent.status
            });

            if (typeof renderFinalizedIntents === "function") {
                renderFinalizedIntents(allIndividualReports);
            }
        }
        select.value = "";
        select.selectedIndex = 0;

        renderSelectedReportIntents();
        populateReportIntentSelect();

        console.log("✅ Intent added:", intentId);
    });
    
    console.log("✅ Add Intent button listener attached");
}



/* ============================================================
   RENDER SELECTED INTENTS
============================================================ */

function renderSelectedReportIntents() {
    const tbody = document.getElementById("selectedIntentsTableBody");
    if (!tbody) return;

    const intents = window.selectedReportIntents || [];

    if (intents.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="padding:20px; text-align:center; color:#999;">
                    No planting intents selected. Click "Add Row" to add.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = intents.map(function(intent, index) {
        const intentId = intent.planting_intent_id || "-";

        let locationStr = "-";
        if (intent.barangay && intent.municipality) {
            locationStr = `${intent.barangay}, ${intent.municipality}`;
        } else if (intent.location && intent.location !== "-") {
            locationStr = intent.location;
        } else if (intent.barangay) {
            locationStr = intent.barangay;
        } else if (intent.municipality) {
            locationStr = intent.municipality;
        }

        const farmer = intent.farmer_name || "N/A";
        const commodity = intent.commodity || "N/A";
        const volume = intent.volume ? formatPlantingVolume(intent.volume) : "-";
        const plantingDate = intent.planting_date ? formatPlantingDate(intent.planting_date) : "-";
        const harvestDate = intent.harvest_date ? formatPlantingDate(intent.harvest_date) : "-";

        const status = intent.finalized_status || "NOT PLANTED";
        const statusUpper = status.toUpperCase();

        let displayText = statusUpper;
        let bgColor = '#6c757d';

        if (statusUpper === 'NOT PLANTED') {
            displayText = 'Not Planted';
            bgColor = '#6c757d';
        } else if (statusUpper === 'PLANTED') {
            displayText = 'Planted';
            bgColor = '#D97706';
        } else if (statusUpper === 'HARVESTED') {
            displayText = 'Harvested';
            bgColor = '#2E7D32';
        } else if (statusUpper === 'MEDIATING') {
            displayText = 'Mediating';
            bgColor = '#2980B9';
        }

        return `
            <tr>
                <td>#${escapeHtml(String(intentId))}</td>
                <td>${escapeHtml(String(locationStr))}</td>
                <td>${escapeHtml(String(farmer))}</td>
                <td>${escapeHtml(String(commodity))}</td>
                <td>${escapeHtml(String(volume))}</td>
                <td>${escapeHtml(String(plantingDate))}</td>
                <td>${escapeHtml(String(harvestDate))}</td>
                <td style="text-align:center;">
                    <span class="status-pill"
                          style="display:inline-block; padding:4px 14px; border-radius:999px; font-size:11px; font-weight:700; color:#FFFFFF; text-shadow:0 1px 1px rgba(0,0,0,0.2); text-align:center; white-space:nowrap; letter-spacing:0.02em; background-color:${bgColor};">
                        ${escapeHtml(displayText)}
                    </span>
                </td>
                <td class="center-col">
                    <button type="button"
                            class="btn-outline-report remove-intent-btn"
                            data-index="${index}"
                            style="padding:2px 10px; font-size:11px; border-color:#C0392B; color:#C0392B; cursor:pointer;">
                        Remove
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    tbody.querySelectorAll(".remove-intent-btn").forEach(function (btn) {
        btn.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();

            const idx = parseInt(this.dataset.index, 10);
            if (isNaN(idx)) return;

            removeSelectedReportIntent(idx);
        });
    });

    const formSummaryBody = document.getElementById("formSummaryBody");
    if (formSummaryBody) {
        const municipalSubmitted = (PLANTING_INTENTS_DATA || []).filter(function(i) {
            const st = String(i.status || "").toUpperCase();
            return st === "SUBMITTED" || st.startsWith("SUBMITTED_");
        });
    }
}


/* ============================================================
   RENDER SUBMITTED REPORTS — SPLIT INTO BLOCKS
============================================================ */

function renderSubmittedReports(reports) {
    const pending = [];
    const flagged = [];
    const approved = [];

    (reports || []).forEach(r => {
        const s = String(r.status || "").toUpperCase().split(".").pop();

        if (s === "SUBMITTED_MUNICIPAL_PENDING" ||
            s === "FOR_MUNICIPAL_VALIDATION" ||
            s === "SUBMITTED_PROVINCIAL_PENDING" ||
            s === "SUBMITTED_REGIONAL_PENDING") {
            pending.push(r);
        }
        else if (s === "SUBMITTED_MUNICIPAL_FLAGGED" ||
             s === "REVISION_REQUIRED" ||
                 s === "SUBMITTED_PROVINCIAL_FLAGGED" ||
             s === "SUBMITTED_REGIONAL_FLAGGED") {
            flagged.push(r);
        }
        else if (s === "SUBMITTED_REGIONAL_APPROVED" ||
                 s === "FINAL_APPROVED") {
            approved.push(r);
        }
    });

    renderReportBlock("pendingReportsTableBody", "pendingReportsCountBadge", pending, "pending");
    renderReportBlock("flaggedReportsTableBody", "flaggedReportsCountBadge", flagged, "flagged");
    renderReportBlock("submittedReportsTableBody", "submittedReportsCountBadge", approved, "approved");
}


/* ============================================================
   RENDER ONE REPORT BLOCK
============================================================ */

function renderReportBlock(tbodyId, badgeId, reports, blockType) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const badge = document.getElementById(badgeId);
    if (badge) badge.textContent = reports.length;

    tbody.innerHTML = "";

    if (reports.length === 0) {
        const emptyMessages = {
            draft: "No draft reports.",
            pending: "No pending reports.",
            flagged: "No flagged reports.",
            approved: "No approved reports.",
        };
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding:30px; text-align:center; color:#999;">
                    ${emptyMessages[blockType] || "No reports."}
                </td>
            </tr>
        `;
        return;
    }

    reports.forEach(report => {
        const sl = reportStatusLabelAndClass(report.status);

        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.dataset.reportId = report.report_id;

        let dateField = report.submitted_at || report.created_at;
        let dateLabel = "Submitted";

        if (blockType === "flagged") {
            dateLabel = "Flagged At";
            dateField = report.updated_at || report.submitted_at;
        } else if (blockType === "approved") {
            dateLabel = "Approved At";
            dateField = report.approved_at || report.updated_at || report.submitted_at;
        }

        const dateValue = formatReportDate(dateField);

        tr.innerHTML = `
            <td class="center-col" style="font-weight: 600;">
                #${escapeHtml(report.report_id)}
            </td>
            <td>${escapeHtml(report.title || "—")}</td>
            <td>${escapeHtml(report.commodity || "—")}</td>
            <td>${escapeHtml(report.municipality || "—")}</td>
            <td class="center-col">${dateValue}</td>
            <td class="center-col">
                <span class="status-pill ${sl.cls}">
                    ${escapeHtml(sl.text)}
                </span>
            </td>
        `;

        tr.addEventListener("click", () => {
            openReportDetails(report);
        });

        tbody.appendChild(tr);
    });
}


/* ============================================================
   STATUS LABEL FOR AEW REPORTS
============================================================ */

function reportStatusLabelAndClass(status) {
    const s = String(status || "").toUpperCase();

    if (s === "DRAFT") {
        return { text: "Draft", cls: "draft" };
    }

    if (s === "SUBMITTED_MUNICIPAL_PENDING") {
        return { text: "Municipal Pending", cls: "pending" };
    }
    if (s === "SUBMITTED_PROVINCIAL_PENDING") {
        return { text: "Provincial Pending", cls: "pending" };
    }
    if (s === "SUBMITTED_REGIONAL_PENDING") {
        return { text: "Regional Pending", cls: "pending" };
    }

    if (s === "SUBMITTED_MUNICIPAL_FLAGGED") {
        return { text: "Municipal Flagged", cls: "flagged" };
    }
    if (s === "SUBMITTED_PROVINCIAL_FLAGGED") {
        return { text: "Provincial Flagged", cls: "flagged" };
    }
    if (s === "SUBMITTED_REGIONAL_FLAGGED") {
        return { text: "Regional Flagged", cls: "flagged" };
    }
    if (s === "REVISION_REQUIRED") {
        return { text: "Revision Required", cls: "flagged" };
    }

    if (s === "SUBMITTED_REGIONAL_APPROVED" || s === "FINAL_APPROVED") {
        return { text: "Approved", cls: "approved" };
    }

    return { text: s || "—", cls: "pending" };
}


/* ============================================================
   REMOVE SELECTED INTENT
============================================================ */

function removeSelectedReportIntent(index) {
    if (
        !window.selectedReportIntents ||
        !window.selectedReportIntents[index]
    ) {
        return;
    }

    window.selectedReportIntents.splice(index, 1);

    renderSelectedReportIntents();
}


// ============================================================
// SAVE / SUBMIT REPORT (WITH ATTACHMENT UPLOAD)
// ============================================================

async function saveReport(status) {
    const intents = window.selectedReportIntents || [];

    if (intents.length === 0) {
        alert("Please add at least one planting intent.");
        return;
    }

    const title = document.getElementById("reportTitleInput")?.value?.trim() || "";
    if (!title) {
        alert("Please enter a Report Title.");
        return;
    }

    const notes = document.getElementById("reportNotesInput")?.value?.trim() || "";
    if (!notes) {
        alert("Please enter notes / remarks.");
        return;
    }

    // ✅ KUNIN ANG MGA FILES BAGO MAG-SAVE
    const fileInput = document.getElementById("reportFileInput");
    const filesToUpload = fileInput?.files ? Array.from(fileInput.files) : [];

    console.log(`📎 Files to upload: ${filesToUpload.length}`, filesToUpload.map(f => f.name));

    const editingReportId = window.currentEditingReportId;

    if (editingReportId) {
        const originalReport = allIndividualReports.find(function(r) {
            return String(r.report_id) === String(editingReportId);
        });

        const titleChanged = originalReport && originalReport.title !== title;
        const notesChanged = originalReport && (originalReport.notes || "") !== notes;

        const originalIntentIds = (originalReport?.planting_intents || [])
            .map(function(i) { return String(i.planting_intent_id); })
            .sort();
        const currentIntentIds = intents
            .map(function(i) { return String(i.planting_intent_id); })
            .sort();
        const intentsChanged = JSON.stringify(originalIntentIds) !== JSON.stringify(currentIntentIds);

        if (!titleChanged && !notesChanged && !intentsChanged) {
            alert("No changes made. Please modify the report before resubmitting.");
            return;
        }
    }

    let apiStatus = status;
    if (status === "SUBMITTED") {
        apiStatus = "SUBMITTED_MUNICIPAL_PENDING";
    }

    const reportData = {
        title: title,
        status: apiStatus,
        notes: notes,
        planting_intent_ids: intents.map(function(intent) {
            return intent.planting_intent_id;
        }),
    };

    const submitButton = document.getElementById("submitReportFinalBtn");

    try {
        if (submitButton) submitButton.disabled = true;

        let savedReportId = null;

        if (editingReportId) {
            console.log("Updating existing report:", editingReportId);

            await apiRequest(`${API_BASE_URL}/api/raw-plant-reports/${editingReportId}`, {
                method: "PUT",
                body: JSON.stringify({
                    title: title,
                })
            });

            await apiRequest(`${API_BASE_URL}/api/raw-plant-reports/${editingReportId}/status`, {
                method: "PATCH",
                body: JSON.stringify({
                    status: "SUBMITTED_MUNICIPAL_PENDING",
                    resubmit_notes: notes || null
                })
            });

            savedReportId = editingReportId;
            window.currentEditingReportId = null;

        } else {
            console.log("Creating new report");

            const createdReport = await apiRequest(`${API_BASE_URL}/api/raw-plant-reports/from-intents`, {
                method: "POST",
                body: JSON.stringify(reportData)
            });

            savedReportId = createdReport?.report_id 
                || createdReport?.data?.report_id 
                || null;
        }

        // ============================================================
        // ✅ I-UPLOAD ANG MGA ATTACHMENTS PAGKATAPOS MA-SAVE ANG REPORT
        // ============================================================
        if (savedReportId && filesToUpload.length > 0) {
            console.log(`📤 Uploading ${filesToUpload.length} attachment(s) to report #${savedReportId}...`);

            const uploadErrors = [];

            for (const file of filesToUpload) {
                try {
                    const result = await uploadReportAttachment(savedReportId, file);
                    console.log(`✅ Uploaded: ${file.name}`, result);
                } catch (err) {
                    console.error(`❌ Upload failed for ${file.name}:`, err);
                    uploadErrors.push(`${file.name}: ${err.message}`);
                }
            }

            if (uploadErrors.length > 0) {
                console.warn("Some uploads failed:", uploadErrors);
                setTimeout(() => {
                    alert(
                        "Report saved, but some attachments failed to upload:\n\n" +
                        uploadErrors.join("\n")
                    );
                }, 500);
            }
        }

        // ✅ I-CLEAR ANG FILE INPUT PAGKATAPOS I-UPLOAD
        setReportAttachments([]);

        // ============================================================
        // ✅ FORCE RETURN TO REPORTS MAIN LIST
        // ============================================================
        window.currentSelectedReport = null;
        window.currentEditingReportId = null;
        window.selectedReportIntents = [];

        closeSubmitReportSubview({ forceMainView: true });

        // ✅ Refresh data AFTER view is reset
        await fetchPlantingIntents();
        await loadReports();

        // ✅ Scroll to top
        window.scrollTo({ top: 0, behavior: "smooth" });

        // ✅ Styled success modal
        showSuccessModal({
            title: editingReportId
                ? "Resubmitted to Municipal"
                : "Submitted to Municipal",
            message: editingReportId
                ? "Your revised report has been successfully resubmitted. It now appears under <strong>Pending at Municipal</strong>."
                : "Your report has been successfully submitted. It now appears under <strong>Pending at Municipal</strong>.",
            confirmText: "View Reports",
            onClose: () => {
                window.scrollTo({ top: 0, behavior: "smooth" });
            },
        });

    } catch (error) {
        console.error("Failed to save report:", error);

        const modal = document.getElementById("reportSubmittedModal");
        const titleEl = document.getElementById("reportSubmittedTitle");
        const messageEl = document.getElementById("reportSubmittedMessage");
        const iconEl = modal?.querySelector("div[style*='border-radius: 50%']");

        if (modal && titleEl && messageEl) {
            if (iconEl) {
                iconEl.textContent = "⚠";
                iconEl.style.background = "#FEE2E2";
            }
            titleEl.textContent = "Submission Failed";
            titleEl.style.color = "#C0392B";
            messageEl.textContent = error.message || "Please try again.";

            modal.classList.add("show");

            const closeBtn = document.getElementById("closeReportSubmittedBtn");
            if (closeBtn) {
                const newCloseBtn = closeBtn.cloneNode(true);
                closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
                newCloseBtn.addEventListener("click", () => {
                    modal.classList.remove("show");
                    if (iconEl) {
                        iconEl.textContent = "✓";
                        iconEl.style.background = "";
                    }
                    titleEl.style.color = "";
                });
            }
        } else {
            alert("Failed to save report.\n\n" + (error.message || "Please try again."));
        }
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}



/* ============================================================
   UPLOAD REPORT ATTACHMENT
============================================================ */

async function uploadReportAttachment(reportId, file) {
    const formData = new FormData();
    formData.append("file", file);

    const token = getAuthToken();

    const response = await fetch(
        `${API_BASE_URL}/api/raw-plant-reports/${reportId}/attachments`,
        {
            method: "POST",
            headers: {
                "Authorization": token ? `Bearer ${token}` : ""
            },
            body: formData
        }
    );

    let data = null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        try { data = await response.json(); } catch(e) { data = null; }
    } else {
        try { data = await response.text(); } catch(e) { data = null; }
    }

    if (!response.ok) {
        const msg = (data && typeof data === "object" && data.detail)
            ? (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail))
            : (typeof data === "string" && data.trim() ? data : `HTTP ${response.status}`);
        throw new Error(msg);
    }

    console.log("Attachment uploaded:", data);
    return data;
}


//=============================================================
//  OPEN SUBMITTED REPORTS
//=============================================================

async function openSubmittedReportDetails(reportId) {
    console.log("Opening submitted report details:", reportId);
    
    try {
        const report = await apiRequest(
            `${API_BASE_URL}/api/raw-plant-reports/${reportId}`,
            { method: "GET" }
        );
        
        openReportDetails(report);
        
    } catch (error) {
        console.error("Failed to load report details:", error);
        alert("Failed to load report details.\n\n" + error.message);
    }
}


/* ============================================================
   LOAD REPORT FOR EDITING
============================================================ */

async function loadReportForEditing(reportId) {
    console.log("Loading report for editing:", reportId);
    
    try {
        const report = await apiRequest(
            `${API_BASE_URL}/api/raw-plant-reports/${reportId}`,
            { method: "GET" }
        );
        
        populateReportForm(report);
        
    } catch (error) {
        console.error("Failed to load report:", error);
        alert("Unable to load report details.\n\n" + error.message);
    }
}


/* ============================================================
   POPULATE REPORT FORM
============================================================ */

function populateReportForm(report) {
    console.log("Populating report form:", report);
    
    const titleInput = document.getElementById("reportTitleInput");
    if (titleInput) {
        titleInput.value = report.title || "";
    }
    
    const notes = document.getElementById("reportNotesInput");
    if (notes) {
        notes.value = report.notes || report.remarks || "";
    }
    
    const intents = report.planting_intents || report.intents || [];
    
    window.selectedReportIntents = intents.map(function(intent) {
        const fullIntent = (PLANTING_INTENTS_DATA || []).find(function(i) {
            return String(i.planting_intent_id) === String(intent.planting_intent_id);
        });
        
        if (fullIntent) {
            return fullIntent;
        }
        
        return {
            planting_intent_id: intent.planting_intent_id,
            farmer_name: intent.farmer_name,
            commodity: intent.commodity,
            volume: intent.volume,
            planting_date: intent.planting_date,
            harvest_date: intent.harvest_date,
            finalized_status: intent.finalized_status_at_submission || "NOT PLANTED",
            status: intent.plant_status_at_submission || "SUBMITTED",
            is_in_report: true,
        };
    });
    
    renderSelectedReportIntents();
    
    populateReportIntentSelect();
}


/* ============================================================
   REPORT SUMMARY RENDERER
============================================================ */

function renderReportSummary(selectedIntents, allSubmittedIntents, reportMeta) {
    const allSubmitted = Array.isArray(allSubmittedIntents) ? allSubmittedIntents : [];
    const meta = reportMeta || {};
    const selected = (Array.isArray(selectedIntents) ? selectedIntents : []).map(function(intent) {
        const fullIntent = (PLANTING_INTENTS_DATA || []).find(function(i) {
            return String(i.planting_intent_id) === String(intent.planting_intent_id);
        });

        if (fullIntent) {
            return {
                ...intent,
                barangay: intent.barangay || fullIntent.barangay || null,
                municipality: intent.municipality || fullIntent.municipality || null,
                location: intent.location || fullIntent.location || null,
                farmer_id: intent.farmer_id || fullIntent.farmer_id || null,
                finalized_status: fullIntent.finalized_status || intent.finalized_status || "NOT PLANTED",
                actual_planting_date: fullIntent.actual_planting_date || intent.actual_planting_date || null,
                actual_harvest_date: fullIntent.actual_harvest_date || intent.actual_harvest_date || null,
                actual_harvest_volume: fullIntent.actual_harvest_volume || intent.actual_harvest_volume || null,
            };
        }

        return intent;
    });

    const selectedCount = selected.length;

    const totalVolume = selected.reduce(function(sum, i) {
        return sum + (Number(i.volume) || 0);
    }, 0);

    const uniqueFarmers = new Set(
        selected
            .map(function(i) { return i.farmer_id || i.farmer_name; })
            .filter(Boolean)
    );
    const uniqueFarmerCount = uniqueFarmers.size;

    const pendingCount = selected.filter(function(i) {
        return String(i.status || "").toUpperCase() === "SUBMITTED";
    }).length;

    const harvestedIntents = selected.filter(function(i) {
        return (i.finalized_status || "").toUpperCase() === "HARVESTED";
    });
    const harvestedVolume = harvestedIntents.reduce(function(sum, i) {
        const actualVol = Number(i.actual_harvest_volume);
        const plannedVol = Number(i.volume);
        return sum + (actualVol > 0 ? actualVol : (plannedVol || 0));
    }, 0);

    const harvestRate = selectedCount > 0 
        ? Math.round((harvestedIntents.length / selectedCount) * 100) 
        : 0;

    const municipalCount = allSubmitted.length;
    const coverage = municipalCount > 0 
        ? Math.round((selectedCount / municipalCount) * 100) 
        : 0;

    let coveragePeriod = "—";
    if (meta.submitted_at || meta.created_at) {
        const reportDate = new Date(meta.submitted_at || meta.created_at);
        const weekStart = new Date(reportDate);
        weekStart.setDate(reportDate.getDate() - 6);
        
        const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        coveragePeriod = `${fmt(weekStart)} – ${fmt(reportDate)}`;
    }
    setText("summaryCoveragePeriod", "Coverage: " + coveragePeriod);

    setText("summarySelectedCount", selectedCount + " intent" + (selectedCount !== 1 ? "s" : ""));
    setText("summarySelectedSubtext", 
        selectedCount > 0 
            ? "Included in this report" 
            : "No intents selected"
    );

    setText("summaryTotalVolume", 
        totalVolume > 0 
            ? totalVolume.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " kg"
            : "0 kg"
    );
    setText("summaryTotalVolumeSubtext", 
        selectedCount > 0 
            ? "Across " + selectedCount + " intent" + (selectedCount !== 1 ? "s" : "")
            : "—"
    );

    setText("summaryUniqueFarmers", uniqueFarmerCount + " farmer" + (uniqueFarmerCount !== 1 ? "s" : ""));
    setText("summaryUniqueFarmersSubtext", 
        uniqueFarmerCount > 0 
            ? "Beneficiaries in this report"
            : "No farmers"
    );

    setText("summaryPendingCount", pendingCount + " intent" + (pendingCount !== 1 ? "s" : ""));
    setText("summaryPendingSubtext", 
        pendingCount > 0 
            ? "Awaiting status update" 
            : "All intents finalized"
    );

    const pendingEl = document.getElementById("summaryPendingCount");
    if (pendingEl) {
        pendingEl.style.color = pendingCount > 0 ? "#D97706" : "#2E7D32";
    }

    setText("summaryHarvestedVolume", 
        harvestedVolume > 0 
            ? harvestedVolume.toLocaleString("en-US") + " kg" 
            : "0 kg"
    );
    setText("summaryHarvestedVolumeSubtext", 
        harvestedIntents.length + " intent" + (harvestedIntents.length !== 1 ? "s" : "") + " harvested"
    );

    setText("summaryHarvestRate", harvestRate + "%");
    setText("summaryHarvestRateSubtext", 
        harvestedIntents.length + " of " + selectedCount + " harvested"
    );

    const harvestRateEl = document.getElementById("summaryHarvestRate");
    if (harvestRateEl) {
        harvestRateEl.style.color = 
            harvestRate === 100 ? "#2E7D32" 
            : harvestRate > 0 ? "#D97706" 
            : "#6c757d";
    }

    const municipalityName = meta.municipality || "Municipality";
    setText("summaryMunicipalLabel", "🏛️ " + municipalityName + " Total");
    setText("summaryMunicipalTotal", municipalCount + " intent" + (municipalCount !== 1 ? "s" : ""));
    setText("summaryMunicipalSubtext", 
        municipalCount > 0 
            ? "Submitted sa parehong period"
            : "Walang ibang submission"
    );

    setText("summaryCoverage", coverage + "%");
    setText("summaryCoverageSubtext", 
        "of " + municipalityName + " submissions"
    );

    const byCommodity = {};
    selected.forEach(function(intent) {
        const c = intent.commodity || "Unknown";
        if (!byCommodity[c]) {
            byCommodity[c] = { count: 0, volume: 0 };
        }
        byCommodity[c].count += 1;
        byCommodity[c].volume += Number(intent.volume) || 0;
    });

    const commodityEl = document.getElementById("summaryByCommodity");
    if (commodityEl) {
        const entries = Object.entries(byCommodity);
        if (entries.length === 0) {
            commodityEl.innerHTML = '<span style="color: var(--muted); font-style: italic;">No intents selected.</span>';
        } else {
            commodityEl.innerHTML = entries
                .sort(function(a, b) { return b[1].volume - a[1].volume; })
                .map(function([name, data]) {
                    return `
                        <div style="
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 6px 0;
                            border-bottom: 1px dashed var(--border-light);
                        ">
                            <span style="font-weight: 600;">${escapeHtml(name)}</span>
                            <span style="
                                font-size: 12px;
                                color: var(--muted);
                                font-variant-numeric: tabular-nums;
                            ">
                                ${data.count} · 
                                <b style="color: var(--green-dark);">${formatPlantingVolume(data.volume)}</b>
                            </span>
                        </div>
                    `;
                }).join("");
        }
    }

    const byBarangay = {};
    selected.forEach(function(intent) {
        let b = intent.barangay;
        
        if (!b && intent.location) {
            const parts = String(intent.location).split(",");
            b = parts[0].trim();
        }
        
        if (!b) b = intent.municipality || "Unknown";
        
        if (!byBarangay[b]) {
            byBarangay[b] = { count: 0, volume: 0 };
        }
        byBarangay[b].count += 1;
        byBarangay[b].volume += Number(intent.volume) || 0;
    });

    const barangayEl = document.getElementById("summaryByBarangay");
    if (barangayEl) {
        const entries = Object.entries(byBarangay);
        if (entries.length === 0) {
            barangayEl.innerHTML = '<span style="color: var(--muted); font-style: italic;">No barangay data.</span>';
        } else if (entries.length === 1) {
            barangayEl.innerHTML = `
                <div style="color: var(--muted); font-style: italic; font-size: 12px;">
                    All intents from <b>${escapeHtml(entries[0][0])}</b>
                </div>
            `;
        } else {
            barangayEl.innerHTML = entries
                .sort(function(a, b) { return b[1].volume - a[1].volume; })
                .map(function([name, data]) {
                    return `
                        <div style="
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 6px 0;
                            border-bottom: 1px dashed var(--border-light);
                        ">
                            <span style="font-weight: 600;">📍 ${escapeHtml(name)}</span>
                            <span style="
                                font-size: 12px;
                                color: var(--muted);
                                font-variant-numeric: tabular-nums;
                            ">
                                ${data.count} · 
                                <b style="color: var(--green-dark);">${formatPlantingVolume(data.volume)}</b>
                            </span>
                        </div>
                    `;
                }).join("");
        }
    }

    const byStatus = {
        "NOT PLANTED": { count: 0, volume: 0, label: "Not Planted", color: "#6c757d" },
        "PLANTED": { count: 0, volume: 0, label: "Planted", color: "#D97706" },
        "HARVESTED": { count: 0, volume: 0, label: "Harvested", color: "#2E7D32" },
        "MEDIATING": { count: 0, volume: 0, label: "Mediating", color: "#2980B9" }
    };

    selected.forEach(function(intent) {
        const s = (intent.finalized_status || "NOT PLANTED").toUpperCase();
        if (byStatus[s]) {
            byStatus[s].count += 1;
            byStatus[s].volume += Number(intent.volume) || 0;
        }
    });

    const statusEl = document.getElementById("summaryByStatus");
    if (statusEl) {
        statusEl.innerHTML = Object.values(byStatus).map(function(data) {
            const isZero = data.count === 0;
            return `
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6px 0;
                    border-bottom: 1px dashed var(--border-light);
                    opacity: ${isZero ? 0.45 : 1};
                ">
                    <span style="font-weight: 600; color: ${isZero ? 'var(--muted)' : 'var(--ink)'};">
                        <span style="
                            display: inline-block;
                            width: 8px;
                            height: 8px;
                            border-radius: 50%;
                            background: ${data.color};
                            margin-right: 8px;
                        "></span>
                        ${data.label}
                    </span>
                    <span style="
                        font-size: 12px;
                        color: var(--muted);
                        font-variant-numeric: tabular-nums;
                    ">
                        ${data.count} · 
                        <b style="color: ${isZero ? 'var(--muted)' : data.color};">${formatPlantingVolume(data.volume)}</b>
                    </span>
                </div>
            `;
        }).join("");
    }

    // ============================================================
    // 📊 YIELD PERFORMANCE — Expected vs Actual
    // ============================================================
    const yieldEl = document.getElementById("summaryYieldPerformance");
    if (yieldEl) {
        const totalActual = harvestedIntents.reduce(function(sum, i) {
            const v = Number(i.actual_harvest_volume);
            return sum + (v > 0 ? v : 0);
        }, 0);

        const totalPlanned = totalVolume;
        const hasActualData = totalActual > 0;

        if (hasActualData) {
            const variance = totalPlanned > 0 
                ? Math.round(((totalActual - totalPlanned) / totalPlanned) * 100) 
                : 0;
            
            let varianceColor = "#2E7D32";
            let varianceIcon = "↑";
            let varianceLabel = "surplus";
            
            if (variance < 0) {
                varianceColor = "#C0392B";
                varianceIcon = "↓";
                varianceLabel = "shortfall";
            } else if (variance === 0) {
                varianceColor = "#6c757d";
                varianceIcon = "→";
                varianceLabel = "on target";
            }
            
            yieldEl.innerHTML = `
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

                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span style="color: var(--muted);">Expected (planned):</span>
                    <b style="color: var(--ink);">${totalPlanned.toLocaleString("en-US")} kg</b>
                </div>

                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span style="color: var(--muted);">Actual (harvested):</span>
                    <b style="color: var(--ink);">${totalActual.toLocaleString("en-US")} kg</b>
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
                    ${varianceIcon} ${Math.abs(variance)}% ${varianceLabel}
                </div>

                <div style="
                    margin-top: 8px;
                    font-size: 11px;
                    color: var(--muted);
                    font-style: italic;
                ">
                    Based on ${harvestedIntents.length} of ${selectedCount} harvested
                </div>
            `;
        } else {
            yieldEl.innerHTML = `
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
                <span style="color: var(--muted); font-style: italic;">No actual harvest volume recorded yet.</span>
            `;
        }
    }

    // ============================================================
    // 📅 PLANTING WINDOW — Earliest & Latest
    // ============================================================
    const windowEl = document.getElementById("summaryPlantingWindow");
    if (windowEl) {
        const plantingDates = selected
            .map(function(i) { return i.planting_date; })
            .filter(function(d) { return d; })
            .map(function(d) { return new Date(d); })
            .filter(function(d) { return !isNaN(d.getTime()); });

        const harvestDates = selected
            .map(function(i) { return i.harvest_date; })
            .filter(function(d) { return d; })
            .map(function(d) { return new Date(d); })
            .filter(function(d) { return !isNaN(d.getTime()); });

        if (plantingDates.length > 0) {
            const earliest = new Date(Math.min.apply(null, plantingDates));
            const latest = new Date(Math.max.apply(null, plantingDates));
            const spanDays = Math.round((latest - earliest) / (1000 * 60 * 60 * 24));

            const fmt = (d) => d.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
            });

            let harvestInfo = "";
            if (harvestDates.length > 0) {
                const earliestHarvest = new Date(Math.min.apply(null, harvestDates));
                const latestHarvest = new Date(Math.max.apply(null, harvestDates));
                const harvestSpan = Math.round((latestHarvest - earliestHarvest) / (1000 * 60 * 60 * 24));

                harvestInfo = `
                    <div style="
                        margin-top: 10px;
                        padding-top: 10px;
                        border-top: 1px dashed var(--border-light);
                    ">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <span style="color: var(--muted);">🌾 Harvest earliest:</span>
                            <b style="color: var(--ink);">${fmt(earliestHarvest)}</b>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <span style="color: var(--muted);">Harvest latest:</span>
                            <b style="color: var(--ink);">${fmt(latestHarvest)}</b>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--muted);">Harvest span:</span>
                            <b style="color: var(--ink);">${harvestSpan} day${harvestSpan !== 1 ? "s" : ""}</b>
                        </div>
                    </div>
                `;
            }

            windowEl.innerHTML = `
                <div style="
                    font-size: 11px;
                    font-weight: 700;
                    color: var(--muted);
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    margin-bottom: 10px;
                    padding-bottom: 6px;
                    border-bottom: 1px solid var(--border-light);
                "> Planting Window</div>

                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span style="color: var(--muted);">🌱 Earliest:</span>
                    <b style="color: var(--ink);">${fmt(earliest)}</b>
                </div>

                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span style="color: var(--muted);">Latest:</span>
                    <b style="color: var(--ink);">${fmt(latest)}</b>
                </div>

                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--muted);">Span:</span>
                    <b style="color: var(--ink);">${spanDays} day${spanDays !== 1 ? "s" : ""}</b>
                </div>

                ${harvestInfo}
            `;
        } else {
            windowEl.innerHTML = `
                <div style="
                    font-size: 11px;
                    font-weight: 700;
                    color: var(--muted);
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    margin-bottom: 10px;
                    padding-bottom: 6px;
                    border-bottom: 1px solid var(--border-light);
                ">  Planting Window</div>
                <span style="color: var(--muted); font-style: italic;">No planting dates available.</span>
            `;
        }
    }

    // ============================================================
    // FOOTER META
    // ============================================================
    const preparedBy = localStorage.getItem("full_name") 
        || localStorage.getItem("name") 
        || localStorage.getItem("username") 
        || "AEW";
    setText("summaryPreparedBy", preparedBy);

    const now = new Date();
    setText("summaryGeneratedAt", now.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }));
}


/* ============================================================
   ERROR STATES
============================================================ */

function renderIndividualReportsError(error) {
    const tbody = document.getElementById("individualReportsTableBody");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="4" style="padding:30px; text-align:center; color:#C0392B;">
                Failed to load individual reports.
                <br>
                <small>${escapeHtml(error?.message || "Please check the server.")}</small>
            </td>
        </tr>
    `;
}


function renderSubmittedReportsError(error) {
    const tbody = document.getElementById("submittedReportsTableBody");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="4" style="padding:30px; text-align:center; color:#C0392B;">
                Failed to load submitted reports.
                <br>
                <small>${escapeHtml(error?.message || "Please check the server.")}</small>
            </td>
        </tr>
    `;
}


/* ============================================================
   HELPERS
============================================================ */

function formatReportDate(dateValue) {
    if (!dateValue) return "—";

    const date = new Date(dateValue);

    if (isNaN(date.getTime())) {
        return String(dateValue);
    }

    return date.toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric"
    });
}


function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value ?? "—";
    }
}

/* ============================================================
   FORMAT HELPERS
============================================================ */

function formatPlantingDate(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function formatPlantingVolume(volume) {
    if (volume === null || volume === undefined || volume === "") return "-";
    if (typeof volume === "string" && volume.toLowerCase().includes("kg")) return volume;
    const numericVolume = Number(String(volume).replace(/,/g, ""));
    if (!isNaN(numericVolume)) {
        return numericVolume.toLocaleString() + " kg";
    }
    return String(volume);
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

function formatRoleLabel(role) {
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


/* ============================================================
   📜 RENDER VALIDATION TIMELINE (AEW side)
============================================================ */

function renderValidationTimeline(history, containerId = "validationTimelineContainer", wrapperId = "validationHistoryWrapper") {
    const container = document.getElementById(containerId);
    const wrapper = document.getElementById(wrapperId);

    if (!container) return;

    if (!Array.isArray(history) || history.length === 0) {
        if (wrapper) wrapper.style.display = "none";
        return;
    }

    if (wrapper) wrapper.style.display = "block";

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
                        <span class="timeline-role">${escapeHtml(formatRoleLabel(h.role))}</span>
                    </div>
                    ${remarksHtml}
                </div>
            </div>
        `;
    }).join("");

    container.innerHTML = `<div class="validation-timeline">${html}</div>`;
}


/* ============================================================
   DATE HELPER
============================================================ */

function toDateInputValue(value) {
    if (!value) return "";

    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        return value.substring(0, 10);
    }

    if (typeof value === "string" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
        const [a, b, y] = value.split("/");
        const first = parseInt(a, 10);
        const second = parseInt(b, 10);

        let day, month;
        if (first > 12) {
            day = first;
            month = second;
        } else if (second > 12) {
            month = first;
            day = second;
        } else {
            day = first;
            month = second;
        }

        return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    const date = new Date(value);
    if (isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}


/* ============================================================
   HANDLE FINALIZED STATUS CHANGE
============================================================ */

function handleFinalizedStatusChange(intent, currentStatus, newStatus, pillElement) {
    const newStatusUpper = newStatus.toUpperCase();

    if (newStatusUpper === "PLANTED" && currentStatus !== "PLANTED") {
        openActualDateModal({
            title: "Record Actual Planting Date",
            message: `Mark <b>${escapeHtml(intent.commodity || "this intent")}</b> as <b>PLANTED</b>.<br>Please enter the actual planting date.`,
            fieldLabel: "Actual Planting Date",
            fieldId: "modalActualDate",
            intent: intent,
            onConfirm: function (dateValue) {
                if (pillElement) updateStatusPillVisual(pillElement, newStatus);
                updateFinalizedIntentStatus(intent.planting_intent_id, newStatus, {
                    actual_planting_date: dateValue
                });
                intent.finalized_status = newStatus;
                intent.actual_planting_date = dateValue;
            }
        });
        return;
    }

    if (newStatusUpper === "HARVESTED" && currentStatus !== "HARVESTED") {
        openHarvestModal({
            intent: intent,
            onConfirm: function (dateValue, volumeValue) {
                if (pillElement) updateStatusPillVisual(pillElement, newStatus);
                updateFinalizedIntentStatus(intent.planting_intent_id, newStatus, {
                    actual_harvest_date: dateValue,
                    actual_harvest_volume: volumeValue
                });
                intent.finalized_status = newStatus;
                intent.actual_harvest_date = dateValue;
                intent.actual_harvest_volume = volumeValue;
            }
        });
        return;
    }

    if (pillElement) updateStatusPillVisual(pillElement, newStatus);
    updateFinalizedIntentStatus(intent.planting_intent_id, newStatus, {});
    intent.finalized_status = newStatus;
}


/* ============================================================
   HARVEST MODAL
============================================================ */

function openHarvestModal({ intent, onConfirm }) {
    const existing = document.getElementById("harvestModal");
    if (existing) existing.remove();

    const prefillDate = intent.actual_harvest_date 
        ? toDateInputValue(intent.actual_harvest_date) 
        : "";
    const prefillVolume = intent.actual_harvest_volume 
        ? Number(intent.actual_harvest_volume) 
        : "";

    const plannedVolume = Number(intent.volume) || 0;
    const plannedVolumeStr = plannedVolume.toLocaleString("en-US");

    const modalHTML = `
        <div class="modal-overlay show" id="harvestModal" style="
            position: fixed; inset: 0; background: rgba(30,35,28,0.6);
            display: flex; align-items: center; justify-content: center;
            z-index: 5000;">
            <div class="modal-box" style="
                background: var(--cream); border: 1.5px solid var(--border);
                border-radius: 12px; padding: 28px 32px; max-width: 480px;
                width: 90%; box-shadow: 0 14px 35px rgba(0,0,0,0.25);">
                <h2 style="font-size:20px; font-weight:800; color:var(--green); margin-bottom:12px;">
                    🌾 Record Harvest
                </h2>
                <p style="font-size:14px; color:var(--ink); line-height:1.5; margin-bottom:20px;">
                    Mark <b>${escapeHtml(intent.commodity || "this intent")}</b> as <b>HARVESTED</b>.
                    <br>Please provide the actual harvest details.
                </p>

                <div style="
                    background: #F6F3EB;
                    border-left: 3px solid var(--green);
                    padding: 10px 14px;
                    border-radius: 0 6px 6px 0;
                    font-size: 13px;
                    color: var(--muted);
                    margin-bottom: 16px;
                ">
                    <b style="color: var(--ink);">Planned Volume:</b> ${plannedVolumeStr} kg
                </div>

                <div style="margin-bottom:16px; text-align: left;">
                    <label for="harvestActualDate" style="
                        display:block; font-size:12.5px; font-weight:700;
                        color:var(--ink); text-transform:uppercase;
                        letter-spacing:0.02em; margin-bottom:6px;">
                        Actual Harvest Date <span style="color:#C0392B;">*</span>
                    </label>
                    <input type="date" id="harvestActualDate" value="${prefillDate}"
                           style="
                               width:100%; padding:10px 14px;
                               border:1.5px solid var(--border);
                               border-radius:8px; font-size:13.5px;
                               background:#fff; color:var(--ink);
                               outline:none;">
                </div>

                <div style="margin-bottom:20px; text-align: left;">
                    <label for="harvestActualVolume" style="
                        display:block; font-size:12.5px; font-weight:700;
                        color:var(--ink); text-transform:uppercase;
                        letter-spacing:0.02em; margin-bottom:6px;">
                        Actual Harvest Volume (kg) <span style="color:#C0392B;">*</span>
                    </label>
                    <input type="number" id="harvestActualVolume" value="${prefillVolume}"
                           step="0.01" min="0" placeholder="e.g. 4850"
                           style="
                               width:100%; padding:10px 14px;
                               border:1.5px solid var(--border);
                               border-radius:8px; font-size:13.5px;
                               background:#fff; color:var(--ink);
                               outline:none;">
                    <div id="harvestVolumeHint" style="
                        font-size: 11px;
                        color: var(--muted);
                        margin-top: 4px;
                    ">Enter the actual weight harvested (not the planned estimate).</div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" id="harvestModalCancel"
                            class="btn-outline-report" style="
                                padding:9px 20px; border:1.5px solid var(--border);
                                background:#fff; border-radius:8px; font-weight:600;
                                cursor:pointer;">
                        Cancel
                    </button>
                    <button type="button" id="harvestModalConfirm"
                            class="btn-primary" style="
                                padding:9px 20px; background:var(--green);
                                color:#fff; border:none; border-radius:8px;
                                font-weight:700; cursor:pointer;">
                        Confirm Harvest
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);

    const modal = document.getElementById("harvestModal");
    const dateInput = document.getElementById("harvestActualDate");
    const volumeInput = document.getElementById("harvestActualVolume");
    const confirmBtn = document.getElementById("harvestModalConfirm");
    const cancelBtn = document.getElementById("harvestModalCancel");

    setTimeout(() => {
        if (prefillDate && !prefillVolume) {
            volumeInput?.focus();
        } else {
            dateInput?.focus();
        }
    }, 50);

    volumeInput.addEventListener("input", function() {
        const hint = document.getElementById("harvestVolumeHint");
        if (!hint) return;
        const v = Number(this.value);
        if (isNaN(v) || v <= 0 || plannedVolume <= 0) {
            hint.textContent = "Enter the actual weight harvested (not the planned estimate).";
            hint.style.color = "var(--muted)";
            return;
        }
        const variancePct = Math.round(((v - plannedVolume) / plannedVolume) * 100);
        if (variancePct === 0) {
            hint.textContent = "✓ Same as planned volume";
            hint.style.color = "#2E7D32";
        } else if (variancePct > 0) {
            hint.textContent = `↑ ${variancePct}% higher than planned (${plannedVolumeStr} kg)`;
            hint.style.color = "#2E7D32";
        } else {
            hint.textContent = `↓ ${Math.abs(variancePct)}% lower than planned (${plannedVolumeStr} kg)`;
            hint.style.color = "#C0392B";
        }
    });

    cancelBtn.addEventListener("click", () => modal.remove());

    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.remove();
    });

    const escHandler = (e) => {
        if (e.key === "Escape") {
            modal.remove();
            document.removeEventListener("keydown", escHandler);
        }
    };
    document.addEventListener("keydown", escHandler);

    confirmBtn.addEventListener("click", () => {
        const dateValue = dateInput.value;
        const volumeValue = Number(volumeInput.value);

        if (!dateValue) {
            alert("Please select the actual harvest date.");
            dateInput.focus();
            return;
        }
        if (!volumeValue || volumeValue <= 0) {
            alert("Please enter a valid harvest volume (greater than 0).");
            volumeInput.focus();
            return;
        }

        modal.remove();
        document.removeEventListener("keydown", escHandler);
        onConfirm(dateValue, volumeValue);
    });

    volumeInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            confirmBtn.click();
        }
    });
}


/* ============================================================
   ACTUAL DATE MODAL
============================================================ */

function openActualDateModal({ title, message, fieldLabel, fieldId, intent, onConfirm }) {
    const existing = document.getElementById("actualDateModal");
    if (existing) existing.remove();

    const today = new Date().toISOString().split("T")[0];

    let prefill = "";
    if (fieldId === "modalActualDate") {
        if (title.includes("Planting") && intent.actual_planting_date) {
            prefill = toDateInputValue(intent.actual_planting_date);
        } else if (title.includes("Harvest") && intent.actual_harvest_date) {
            prefill = toDateInputValue(intent.actual_harvest_date);
        }
    }

    const modalHTML = `
        <div class="modal-overlay show" id="actualDateModal" style="
            position: fixed; inset: 0; background: rgba(30,35,28,0.6);
            display: flex; align-items: center; justify-content: center;
            z-index: 5000;">
            <div class="modal-box" style="
                background: var(--cream); border: 1.5px solid var(--border);
                border-radius: 12px; padding: 28px 32px; max-width: 440px;
                width: 90%; box-shadow: 0 14px 35px rgba(0,0,0,0.25);">
                <h2 style="font-size:20px; font-weight:800; color:var(--green); margin-bottom:12px;">
                    ${escapeHtml(title)}
                </h2>
                <p style="font-size:14px; color:var(--ink); line-height:1.5; margin-bottom:20px;">
                    ${message}
                </p>
                <div style="margin-bottom:20px;">
                    <label for="modalActualDate" style="
                        display:block; font-size:12.5px; font-weight:700;
                        color:var(--ink); text-transform:uppercase;
                        letter-spacing:0.02em; margin-bottom:6px;">
                        ${escapeHtml(fieldLabel)} <span style="color:#C0392B;">*</span>
                    </label>
                    <input type="date" id="modalActualDate" value="${prefill}"
                           style="
                               width:100%; padding:10px 14px;
                               border:1.5px solid var(--border);
                               border-radius:8px; font-size:13.5px;
                               background:#fff; color:var(--ink);
                               outline:none;">
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" id="modalActualDateCancel"
                            class="btn-outline-report" style="
                                padding:9px 20px; border:1.5px solid var(--border);
                                background:#fff; border-radius:8px; font-weight:600;
                                cursor:pointer;">
                        Cancel
                    </button>
                    <button type="button" id="modalActualDateConfirm"
                            class="btn-primary" style="
                                padding:9px 20px; background:var(--green);
                                color:#fff; border:none; border-radius:8px;
                                font-weight:700; cursor:pointer;">
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);

    const modal = document.getElementById("actualDateModal");
    const input = document.getElementById("modalActualDate");
    const confirmBtn = document.getElementById("modalActualDateConfirm");
    const cancelBtn = document.getElementById("modalActualDateCancel");

    setTimeout(() => input?.focus(), 50);

    cancelBtn.addEventListener("click", () => {
        modal.remove();
    });

    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.remove();
    });

    const escHandler = (e) => {
        if (e.key === "Escape") {
            modal.remove();
            document.removeEventListener("keydown", escHandler);
        }
    };
    document.addEventListener("keydown", escHandler);

    confirmBtn.addEventListener("click", () => {
        const dateValue = input.value;

        if (!dateValue) {
            alert("Please select a date.");
            input.focus();
            return;
        }

        modal.remove();
        document.removeEventListener("keydown", escHandler);
        onConfirm(dateValue);
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            confirmBtn.click();
        }
    });
}


/* ============================================================
   RESET PLANTING INTENT DETAIL FIELDS
============================================================ */

function resetPlantingIntentDetailFields() {
    const details = document.getElementById("plantingIntentDetailsSubview");
    if (!details) return;

    details.querySelectorAll("input[type='text'], input[type='number'], textarea").forEach(function(input) {
        if (input.id === "detailActualHarvestVolume") {
            input.readOnly = true;
            input.disabled = true;
            input.classList.add("input-readonly");
            input.classList.remove("input-editable-active");
            input.style.border = "";
            input.style.background = "";
            return;
        }

        input.readOnly = true;
        input.disabled = false;
        input.classList.add("input-readonly");
        input.classList.remove("input-editable-active");
        input.style.border = "";
        input.style.background = "";
    });

    details.querySelectorAll("input[type='date']").forEach(function(input) {
        input.disabled = true;
        input.classList.add("input-readonly");
        input.classList.remove("input-editable-active");
        input.style.border = "";
        input.style.background = "";
    });

    const commoditySelect = document.getElementById("detailCommodity");
    if (commoditySelect) {
        commoditySelect.disabled = true;
        commoditySelect.style.border = "";
        commoditySelect.style.background = "#ECE6D8";
        commoditySelect.style.color = "var(--muted)";
        commoditySelect.style.cursor = "default";
    }
}


/* ============================================================
   OFFTAKE REQUESTS
============================================================ */

function initOfftakeRequest() {
    const list = document.getElementById("offtakeListSubview");
    const submitSub = document.getElementById("submitOfftakeSubview");
    const confirmSub = document.getElementById("confirmOfftakeSubview");
    const submittedModal = document.getElementById("offtakeSubmittedModal");

    fetchOfftakeRequests();

    document.getElementById("createOfftakeBtn")?.addEventListener("click", function() {
        currentOfftakeRequest = null;
        if (list) list.classList.add("hidden-element");
        if (submitSub) submitSub.classList.remove("hidden-element");
        if (confirmSub) confirmSub.classList.add("hidden-element");
    });

    document.getElementById("returnFromSubmitOfftakeBtn")?.addEventListener("click", function() {
        if (submitSub) submitSub.classList.add("hidden-element");
        if (confirmSub) confirmSub.classList.add("hidden-element");
        if (list) list.classList.remove("hidden-element");
    });

    document.getElementById("proceedOfftakeBtn")?.addEventListener("click", function() {
        const farmerSelect = document.getElementById("offtakeFarmerSelect");
        const farmerId = document.getElementById("offtakeFarmerId");

        if (!farmerSelect || !farmerSelect.value) {
            alert("Please select a farmer.");
            return;
        }
        if (farmerId) farmerId.value = getFarmerRsbsaId(farmerSelect.value);

        const data = collectOfftakeFormData();
        data.farmer_id = Number(farmerSelect.value);
        data.rsbsa_id = getFarmerRsbsaId(farmerSelect.value);
        data.farmer_name = farmerSelect.options[farmerSelect.selectedIndex].text;

        if (!validateOfftakeForm(data)) return;

        currentOfftakeRequest = data;
        populateOfftakeReview(data);

        if (submitSub) submitSub.classList.add("hidden-element");
        if (confirmSub) confirmSub.classList.remove("hidden-element");
    });

    document.getElementById("backToSubmitOfftakeBtn")?.addEventListener("click", function() {
        if (currentOfftakeRequest) populateOfftakeForm(currentOfftakeRequest);
        if (confirmSub) confirmSub.classList.add("hidden-element");
        if (submitSub) submitSub.classList.remove("hidden-element");
    });

    document.getElementById("sendOfftakeBtn")?.addEventListener("click", async function() {
        if (!currentOfftakeRequest) {
            const data = collectOfftakeFormData();
            if (!validateOfftakeForm(data)) return;
            currentOfftakeRequest = data;
        }
        await submitOfftakeRequest();
    });

    document.getElementById("closeOfftakeSuccessBtn")?.addEventListener("click", function() {
        const modal = document.getElementById("offtakeSuccessModal");
        if (modal) modal.classList.remove("show");
        if (submittedModal) submittedModal.classList.remove("show");
        if (confirmSub) confirmSub.classList.add("hidden-element");
        if (submitSub) submitSub.classList.add("hidden-element");
        if (list) list.classList.remove("hidden-element");
        currentOfftakeRequest = null;
        resetOfftakeForm();
    });
        // ============================================================
    // ✅ SEARCH FILTER FOR OFFTAKE REQUESTS
    // ============================================================
        const offtakeSearchInput = document.getElementById("searchOfftakeInput");

    if (offtakeSearchInput) {
        offtakeSearchInput.addEventListener("input", function () {
            const keyword = this.value.toLowerCase().trim();

            if (!keyword) {
                filteredOfftakeRequests = null;
                currentOfftakePage = 1;
                renderOfftakeTable();
                updateOfftakeSummaryCards(OFFTAKE_REQUESTS_DATA);
                return;
            }

            filteredOfftakeRequests = OFFTAKE_REQUESTS_DATA.filter(function (request) {
                const searchableText = [
                    request._farmerName,
                    request.commodity,
                    request.quantity,
                    request.delivery_location,
                    request._farmerLocation,
                    request.harvest_date
                ].join(" ").toLowerCase();
                return searchableText.includes(keyword);
            });

            currentOfftakePage = 1;
            renderOfftakeTable();
        });
    }

    document.getElementById("offtakePrevBtn")?.addEventListener("click", function () {
        if (currentOfftakePage > 1) {
            currentOfftakePage--;
            renderOfftakeTable();
        }
    });

        document.getElementById("offtakeNextBtn")?.addEventListener("click", function () {
        const dataSource = (filteredOfftakeRequests !== null) ? filteredOfftakeRequests : OFFTAKE_REQUESTS_DATA;
        const totalPages = Math.max(1, Math.ceil(dataSource.length / offtakePerPage));
        if (currentOfftakePage < totalPages) {
            currentOfftakePage++;
            renderOfftakeTable();
        }
    });
}

async function fetchOfftakeRequests() {
    const tbody = document.getElementById("offtakeTableBody");
    if (!tbody) {
        console.error("offtakeTableBody not found.");
        return;
    }

    tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center;">Loading offtake requests...</td></tr>`;

    try {
        const requests = await apiRequest(OFFTAKE_REQUESTS_ENDPOINT, { method: "GET" });

        if (!Array.isArray(allFarmers) || allFarmers.length === 0) {
            await fetchFarmers();
        }

        OFFTAKE_REQUESTS_DATA = (requests || []).map(function (request) {
            let farmer = null;
            const requestFarmerId = request.farmer_id;
            if (requestFarmerId) {
                farmer = allFarmers.find(function (f) { return f.farmer_id == requestFarmerId; });
            }

            let farmerName = "Unknown Farmer";
            let farmerLocation = "—";
            if (farmer) {
                farmerName = [farmer.first_name, farmer.middle_name, farmer.last_name, farmer.suffix].filter(Boolean).join(" ");
                farmerLocation = farmer.address || [farmer.barangay, farmer.municipality].filter(Boolean).join(", ") || "—";
            }

            return { ...request, _farmerName: farmerName, _farmerLocation: farmerLocation };
        });

        filteredOfftakeRequests = null;
        currentOfftakePage = 1;
        renderOfftakeTable();
        updateOfftakeSummaryCards(OFFTAKE_REQUESTS_DATA); 

    } catch (error) {
        console.error("Unable to load offtake requests:", error);
        OFFTAKE_REQUESTS_DATA = [];
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#C0392B;">Failed to load offtake requests.<br><small>${escapeHtml(error.message || "Please check the FastAPI server.")}</small></td></tr>`;
        updateOfftakePagination();
        updateOfftakeSummaryCards([]);
     
    }
}

function renderOfftakeTable() {
    const tbody = document.getElementById("offtakeTableBody");
    if (!tbody) return;

    const dataSource = (filteredOfftakeRequests !== null) ? filteredOfftakeRequests : OFFTAKE_REQUESTS_DATA;
    tbody.innerHTML = "";

    if (dataSource.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#777;">No offtake requests found.</td></tr>`;
        updateOfftakePagination();
        return;
    }

    const start = (currentOfftakePage - 1) * offtakePerPage;
    const paginatedItems = dataSource.slice(start, start + offtakePerPage);

    paginatedItems.forEach(function (request) {
        const row = document.createElement("tr");
        row.className = "clickable-row";
        row.innerHTML = `
            <td><span class="pill">${escapeHtml(request._farmerName)}</span></td>
            <td><span class="pill">${escapeHtml(request.commodity || "—")}</span></td>
            <td><span class="pill">${escapeHtml(request.quantity || "—")} kg</span></td>
            <td><span class="pill">${escapeHtml(request.delivery_location || request._farmerLocation)}</span></td>
            <td><span class="pill">${escapeHtml(request.harvest_date || "—")}</span></td>
            <td><span class="status-pill submitted">Submitted</span></td>
        `;
        tbody.appendChild(row);
    });

    updateOfftakePagination();
}

/* ============================================================
   OFFTAKE SUMMARY CARDS
============================================================ */
function updateOfftakeSummaryCards(requests) {
    const total = (requests || []).length;

    // Count per commodity (case-insensitive)
    const commodityCounts = {};
    (requests || []).forEach(req => {
        const commodity = String(req.commodity || "").trim().toLowerCase();
        if (!commodity) return;
        commodityCounts[commodity] = (commodityCounts[commodity] || 0) + 1;
    });

    const setCount = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setCount("offtakeCountTotal", total);
    setCount("offtakeCountTomato",     commodityCounts["tomato"] || 0);
    setCount("offtakeCountRedOnion",   commodityCounts["red onion"] || 0);
    setCount("offtakeCountWhiteOnion", commodityCounts["white onion"] || 0);
    setCount("offtakeCountSquash",     commodityCounts["squash"] || 0);
}

function updateOfftakePagination() {
    const dataSource = (filteredOfftakeRequests !== null) ? filteredOfftakeRequests : OFFTAKE_REQUESTS_DATA;
    const total = dataSource.length;
    const totalPages = Math.max(1, Math.ceil(total / offtakePerPage));

    if (currentOfftakePage > totalPages) currentOfftakePage = totalPages;

    const start = total === 0 ? 0 : (currentOfftakePage - 1) * offtakePerPage + 1;
    const end = Math.min(currentOfftakePage * offtakePerPage, total);

    const info = document.getElementById("offtakePaginationInfo");
    if (info) info.textContent = `Showing ${start}-${end} of ${total} offtake requests`;

    const prev = document.getElementById("offtakePrevBtn");
    if (prev) prev.disabled = currentOfftakePage <= 1;

    const next = document.getElementById("offtakeNextBtn");
    if (next) next.disabled = currentOfftakePage >= totalPages;

    const btns = document.getElementById("offtakePageNumberBtns");
    if (btns) {
        btns.innerHTML = "";
        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement("button");
            btn.className = `btn-page ${i === currentOfftakePage ? "active" : ""}`;
            btn.textContent = i;
            btn.type = "button";
            btn.addEventListener("click", function () {
                currentOfftakePage = i;
                renderOfftakeTable();
                updateOfftakeSummaryCards(OFFTAKE_REQUESTS_DATA);  
            });
            btns.appendChild(btn);
        }
    }
}

function collectOfftakeFormData() {
    const deliveryLocation = [
        ["Region", "offtakeRegion"],
        ["Province", "offtakeProvince"],
        ["Municipality/City", "offtakeMunicipality"],
        ["Barangay", "offtakeBarangay"],
        ["Street/Purok/Sitio", "offtakeStreet"],
        ["Landmark", "offtakeLandmark"]
    ].map(([label, id]) => [label, getOfftakeValue([id])])
        .filter(([, value]) => value)
        .map(([label, value]) => `${label}: ${value}`)
        .join(", ");

    return {
        farmer_name: getOfftakeValue(["offtakeFarmerName", "farmerName", "offtakeFarmer"]),
        farmer_id: getOfftakeValue(["offtakeFarmerId", "farmerId", "offtakeFarmerID"]),
        commodity: getOfftakeValue(["offtakeCommodity", "commodity"]),
        quantity: getOfftakeValue(["offtakeQty", "offtakeQuantity", "quantity"]),
        selling_price: getOfftakeValue(["offtakePrice", "offtakeSellingPrice", "sellingPrice"]),
        harvest_date: getOfftakeValue(["offtakeHarvestDate", "harvestDate"]),
        commodity_photo: getOfftakeValue(["offtakeCommodityPhoto", "commodityPhoto"]),
        buyer: getOfftakeValue(["offtakeBuyer", "buyer"]),
        delivery_location: deliveryLocation
    };
}

function getOfftakeValue(ids) {
    for (var i = 0; i < ids.length; i++) {
        var element = document.getElementById(ids[i]);
        if (element) {
            return (element.value || "").toString().trim();
        }
    }
    return "";
}

function validateOfftakeForm(data) {
    if (!data.farmer_name) { alert("Please enter Farmer Name."); return false; }
    if (!data.farmer_id) { alert("Please enter Farmer ID."); return false; }
    if (!/^\d+$/.test(data.farmer_id)) { alert("Farmer ID must be a valid whole number."); return false; }
    if (!data.commodity) { alert("Please enter Commodity."); return false; }
    if (!data.quantity) { alert("Please enter Quantity."); return false; }
    var quantityValue = data.quantity.replace(/,/g, "").trim();
    if (!/^\d+(\.\d+)?$/.test(quantityValue)) { alert("Quantity must be a valid number."); return false; }
    if (!data.selling_price) { alert("Please enter Selling Price."); return false; }
    var sellingPriceValue = data.selling_price.replace(/,/g, "").replace(/₱/g, "").trim();
    if (!/^\d+(\.\d+)?$/.test(sellingPriceValue)) { alert("Selling Price must be a valid number."); return false; }
    if (!data.harvest_date) { alert("Please select Harvest Date."); return false; }
    for (const [field, label] of [
        ["offtakeRegion", "Region"],
        ["offtakeProvince", "Province"],
        ["offtakeMunicipality", "Municipality/City"],
        ["offtakeBarangay", "Barangay"],
        ["offtakeStreet", "Street/Purok/Sitio"]
    ]) {
        if (!getOfftakeValue([field])) {
            alert(`Please enter ${label} for the delivery location.`);
            document.getElementById(field)?.focus();
            return false;
        }
    }
    return true;
}

function getFarmerRsbsaId(farmerId) {
    var match = (allFarmers || []).find(function(f) { return String(f.farmer_id) === String(farmerId); });
    return match && match.rsbsa_id ? match.rsbsa_id : "";
}

function populateOfftakeReview(data) {
    var values = {
        farmer_name: data.farmer_name,
        farmer_id: data.rsbsa_id || data.farmer_id,
        commodity: data.commodity,
        quantity: data.quantity,
        selling_price: data.selling_price,
        harvest_date: formatPlantingDate(data.harvest_date),
        commodity_photo: data.commodity_photo || "",
        buyer: data.buyer || "",
        delivery_location: data.delivery_location || ""
    };

    setReviewValue(["reviewFarmerName", "confirmFarmerName", "reviewOfftakeFarmerName"], values.farmer_name);
    setReviewValue(["reviewFarmerId", "confirmFarmerId", "reviewOfftakeFarmerId"], values.farmer_id);
    setReviewValue(["reviewCommodity", "confirmCommodity", "reviewOfftakeCommodity"], values.commodity);
    setReviewValue(["reviewQuantity", "confirmQuantity", "reviewOfftakeQuantity"], values.quantity);
    setReviewValue(["reviewSellingPrice", "confirmSellingPrice", "reviewOfftakeSellingPrice"], values.selling_price);
    setReviewValue(["reviewHarvestDate", "confirmHarvestDate", "reviewOfftakeHarvestDate"], values.harvest_date);
    setReviewValue(["reviewCommodityPhoto", "confirmCommodityPhoto", "reviewOfftakeCommodityPhoto"], values.commodity_photo);
    setReviewValue(["reviewBuyer", "confirmBuyer", "reviewOfftakeBuyer"], values.buyer);
    setReviewValue(["reviewDeliveryLocation", "confirmLocation", "confirmDeliveryLocation", "reviewOfftakeDeliveryLocation"], values.delivery_location);
}

function setReviewValue(ids, value) {
    for (var i = 0; i < ids.length; i++) {
        var element = document.getElementById(ids[i]);
        if (element) {
            var safeValue = value || "-";
            element.textContent = safeValue;
            if ("value" in element) {
                element.value = value || "";
            }
            return;
        }
    }
}

function populateOfftakeForm(data) {
    setOfftakeValue(["offtakeFarmerName", "farmerName", "offtakeFarmer"], data.farmer_name);
    setOfftakeValue(["offtakeFarmerId", "farmerId", "offtakeFarmerID"], data.rsbsa_id || data.farmer_id);
    setOfftakeValue(["offtakeCommodity", "commodity"], data.commodity);
    setOfftakeValue(["offtakeQuantity", "quantity"], data.quantity);
    setOfftakeValue(["offtakeSellingPrice", "sellingPrice"], data.selling_price);
    setOfftakeValue(["offtakeHarvestDate", "harvestDate"], data.harvest_date);
    setOfftakeValue(["offtakeCommodityPhoto", "commodityPhoto"], data.commodity_photo);
    setOfftakeValue(["offtakeBuyer", "buyer"], data.buyer);
    const locationParts = Object.fromEntries(
        String(data.delivery_location || "")
            .split(/,\s*(?=[^,]+:\s)/)
            .map(part => {
                const separator = part.indexOf(":");
                return separator === -1
                    ? ["", ""]
                    : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
            })
    );
    [
        ["Region", "offtakeRegion"],
        ["Province", "offtakeProvince"],
        ["Municipality/City", "offtakeMunicipality"],
        ["Barangay", "offtakeBarangay"],
        ["Street/Purok/Sitio", "offtakeStreet"],
        ["Landmark", "offtakeLandmark"]
    ].forEach(([label, id]) => setOfftakeValue([id], locationParts[label]));
}

function setOfftakeValue(ids, value) {
    for (var i = 0; i < ids.length; i++) {
        var element = document.getElementById(ids[i]);
        if (element) {
            element.value = value || "";
            return;
        }
    }
}

async function submitOfftakeRequest() {
    if (!currentOfftakeRequest) {
        alert("No Offtake Request data found.");
        return;
    }

    var sendOfftakeBtn = document.getElementById("sendOfftakeBtn");
    if (sendOfftakeBtn) {
        sendOfftakeBtn.disabled = true;
        sendOfftakeBtn.textContent = "Submitting...";
    }

    try {
        var data = currentOfftakeRequest;
        var farmerId = parseInt(data.farmer_id, 10);
        if (!Number.isInteger(farmerId)) {
            throw new Error("Farmer ID must be a valid whole number.");
        }

        var quantity = String(data.quantity).replace(/,/g, "").trim();
        var sellingPrice = String(data.selling_price).replace(/,/g, "").replace(/₱/g, "").trim();

        if (!/^\d+(\.\d+)?$/.test(quantity)) {
            throw new Error("Quantity must be a valid decimal number.");
        }
        if (!/^\d+(\.\d+)?$/.test(sellingPrice)) {
            throw new Error("Selling Price must be a valid decimal number.");
        }

        var payload = {
            farmer_id: farmerId,
            commodity: data.commodity,
            quantity: quantity,
            selling_price: sellingPrice,
            harvest_date: data.harvest_date,
            delivery_location: data.delivery_location,
            commodity_photo: data.commodity_photo || null
        };

        console.log("Submitting Offtake Request:", payload);

        var response = await apiRequest(OFFTAKE_REQUESTS_ENDPOINT, {
            method: "POST",
            body: JSON.stringify(payload)
        });

        console.log("Offtake Request API response:", response);

        await fetchOfftakeRequests();

        var successModal = document.getElementById("offtakeSuccessModal");
        if (successModal) successModal.classList.add("show");

    } catch (error) {
        console.error("Create Offtake Request error:", error);
        handleAuthError(error);
        alert("Failed to submit Offtake Request.\n\n" + (error.message || "Please check the FastAPI server."));
    } finally {
        if (sendOfftakeBtn) {
            sendOfftakeBtn.disabled = false;
            sendOfftakeBtn.textContent = "Submit Request";
        }
    }
}

function resetOfftakeForm() {
    var possibleFormIds = ["offtakeRequestForm", "submitOfftakeForm", "createOfftakeForm"];
    for (var i = 0; i < possibleFormIds.length; i++) {
        var form = document.getElementById(possibleFormIds[i]);
        if (form) {
            form.reset();
            break;
        }
    }
    currentOfftakeRequest = null;
}

/* ============================================================
   FAIR PRICE
============================================================ */

function initFairPrice() {
    var select = document.getElementById("fairPriceCropSelect");
    var img = document.getElementById("cropImageDisplay");

    if (!select || !img) return;

    select.addEventListener("change", function(event) {
        var crop = event.target.value;
        if (crop === "tomato") {
            img.src = "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&auto=format&fit=crop&q=80";
        } else {
            img.src = "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=600&auto=format&fit=crop&q=80";
        }
    });
}

/* ============================================================
   HELPER FUNCTIONS
============================================================ */

function getValue(id) {
    var element = document.getElementById(id);
    if (!element) return "";
    return (element.value || "").trim();
}

function setValue(id, value) {
    var element = document.getElementById(id);
    if (!element) {
        console.warn("Element with id \"" + id + "\" not found.");
        return;
    }
    var safeValue = value || "";
    if ("value" in element) {
        element.value = safeValue;
        return;
    }
    element.textContent = safeValue;
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* ============================================================
   FARMER DROPDOWN POPULATION
============================================================ */

function populateFarmerDropdowns() {
    var farmers = allFarmers || [];
    var dropdowns = ['piFarmerName', 'offtakeFarmerSelect'];

    dropdowns.forEach(function(dropdownId) {
        var dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            dropdown.innerHTML = '';
            var defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = 'Select Farmer';
            dropdown.appendChild(defaultOpt);

            if (Array.isArray(farmers) && farmers.length > 0) {
                farmers.forEach(function(farmer) {
                    var option = document.createElement('option');
                    option.value = farmer.farmer_id;
                    var fullName = [farmer.first_name, farmer.middle_name, farmer.last_name, farmer.suffix].filter(Boolean).join(" ");
                    option.textContent = fullName || farmer.rsbsa_id || "Farmer " + farmer.farmer_id;
                    option.dataset.farmerId = farmer.farmer_id;
                    dropdown.appendChild(option);
                });
            }
        }
    });
}

function initSearchableSelection(inputId, selectId) {
    const input = document.getElementById(inputId);
    const select = document.getElementById(selectId);
    if (!input || !select || input.dataset.searchableReady === "true") return;

    const container = input.closest(".searchable-select");
    const optionsPanel = container?.querySelector(".searchable-select-options");
    const list = optionsPanel?.querySelector(".searchable-select-list");
    const pagination = optionsPanel?.querySelector(".searchable-select-pagination");
    if (!container || !optionsPanel || !list || !pagination) return;

    const pageSize = 8;
    let currentPage = 1;
    let query = "";

    function selectedLabel() {
        return select.value
            ? select.options[select.selectedIndex]?.textContent || ""
            : "";
    }

    function close() {
        container.classList.remove("open");
        input.setAttribute("aria-expanded", "false");
        input.value = selectedLabel();
    }

    function render() {
        const matchingOptions = Array.from(select.options)
            .filter(option => option.value)
            .filter(option => option.textContent.toLowerCase().includes(query.toLowerCase()));
        const totalPages = Math.max(1, Math.ceil(matchingOptions.length / pageSize));
        currentPage = Math.min(currentPage, totalPages);
        const pageOptions = matchingOptions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

        list.replaceChildren();
        if (pageOptions.length === 0) {
            const empty = document.createElement("div");
            empty.className = "searchable-select-empty";
            empty.textContent = "No matching options.";
            list.appendChild(empty);
        } else {
            pageOptions.forEach(option => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "searchable-select-option";
                button.setAttribute("role", "option");
                button.setAttribute("aria-selected", String(select.value === option.value));
                button.textContent = option.textContent;
                button.addEventListener("click", () => {
                    select.value = option.value;
                    select.dispatchEvent(new Event("change", { bubbles: true }));
                    close();
                });
                list.appendChild(button);
            });
        }

        pagination.replaceChildren();
        const previous = document.createElement("button");
        previous.type = "button";
        previous.textContent = "Previous";
        previous.disabled = currentPage === 1;
        previous.addEventListener("click", () => {
            currentPage--;
            render();
        });

        const status = document.createElement("span");
        status.textContent = `${matchingOptions.length ? (currentPage - 1) * pageSize + 1 : 0}-${Math.min(currentPage * pageSize, matchingOptions.length)} of ${matchingOptions.length}`;

        const next = document.createElement("button");
        next.type = "button";
        next.textContent = "Next";
        next.disabled = currentPage >= totalPages;
        next.addEventListener("click", () => {
            currentPage++;
            render();
        });

        pagination.append(previous, status, next);
    }

    input.addEventListener("focus", () => {
        if (input.value === selectedLabel()) input.value = "";
        query = input.value.trim();
        currentPage = 1;
        container.classList.add("open");
        input.setAttribute("aria-expanded", "true");
        render();
    });

    input.addEventListener("input", () => {
        query = input.value.trim();
        currentPage = 1;
        if (select.value && input.value !== selectedLabel()) {
            select.value = "";
            select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        container.classList.add("open");
        input.setAttribute("aria-expanded", "true");
        render();
    });

    input.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            close();
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            list.querySelector(".searchable-select-option")?.focus();
        }
    });

    select.addEventListener("change", () => {
        if (!container.classList.contains("open")) input.value = selectedLabel();
    });

    document.addEventListener("click", event => {
        if (!container.contains(event.target)) close();
    });

    input.dataset.searchableReady = "true";
    input.value = selectedLabel();
}

function setupFarmerDropdownAutoFill() {
    var piFarmerName = document.getElementById('piFarmerName');
    var piFarmerId = document.getElementById('piFarmerId');
    if (piFarmerName && piFarmerId) {
        initSearchableSelection("piFarmerSearch", "piFarmerName");
        piFarmerName.addEventListener('change', function() {
            var selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.value) {
                piFarmerId.value = selectedOption.value;
            } else {
                piFarmerId.value = '';
            }
        });
    }

    var offtakeFarmerSelect = document.getElementById('offtakeFarmerSelect');
    var offtakeFarmerId = document.getElementById('offtakeFarmerId');
    if (offtakeFarmerSelect && offtakeFarmerId) {
        offtakeFarmerSelect.addEventListener('change', function() {
            var selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.value) {
                offtakeFarmerId.value = getFarmerRsbsaId(selectedOption.value);
            } else {
                offtakeFarmerId.value = '';
            }
        });
    }
}

function refreshFarmerDropdowns() {
    populateFarmerDropdowns();
    setupFarmerDropdownAutoFill();
}


/* ============================================================
   FAIR PRICE MONTH DROPDOWN
============================================================ */

function initFairPriceMonthDropdown() {
    const monthButton = document.getElementById('fairPriceMonthButton');
    const monthDropdown = document.getElementById('customMonthDropdown');
    const monthMenu = document.getElementById('fairPriceMonthMenu');
    const monthText = document.getElementById('fairPriceMonthText');
    const monthSelect = document.getElementById('fairPriceMonthSelect');
    const monthOptions = document.querySelectorAll('.month-option');

    if (!monthButton || !monthDropdown || !monthMenu) {
        console.warn('Month dropdown elements not found.');
        return;
    }

    monthButton.addEventListener('click', function(e) {
        e.stopPropagation();
        const isOpen = monthDropdown.classList.contains('open');
        monthDropdown.classList.toggle('open');
        this.setAttribute('aria-expanded', !isOpen);
    });

    document.addEventListener('click', function(e) {
        if (!monthDropdown.contains(e.target)) {
            monthDropdown.classList.remove('open');
            monthButton.setAttribute('aria-expanded', 'false');
        }
    });

    monthOptions.forEach(function(option) {
        option.addEventListener('click', function(e) {
            e.stopPropagation();
            
            monthOptions.forEach(function(opt) {
                opt.classList.remove('active');
            });
            this.classList.add('active');
            
            const value = this.getAttribute('data-value');
            const text = this.textContent.trim();
            monthText.textContent = text;
            
            monthSelect.value = value;
            
            const changeEvent = new Event('change', { bubbles: true });
            monthSelect.dispatchEvent(changeEvent);
            
            monthDropdown.classList.remove('open');
            monthButton.setAttribute('aria-expanded', 'false');
            
            if (typeof updateFairPriceDisplay === 'function') {
                updateFairPriceDisplay(value);
            }
        });
    });

    monthSelect.addEventListener('change', function() {
        const selectedOption = document.querySelector('.month-option[data-value="' + this.value + '"]');
        if (selectedOption) {
            monthOptions.forEach(function(opt) {
                opt.classList.remove('active');
            });
            selectedOption.classList.add('active');
            monthText.textContent = selectedOption.textContent.trim();
        }
    });
}

function updateFairPriceDisplay(month) {
    console.log('Month selected:', month);
}


/* ============================================================
   FORECAST RESULTS
============================================================ */

function initForecastResults() {
    const forecastView = document.getElementById("view-fair-prices");
    if (!forecastView) return;
    initFairPriceControls();

    const loadWhenVisible = function() {
        if (forecastView.classList.contains("active-view")) loadForecastResults();
    };

    loadWhenVisible();
    const observer = new MutationObserver(loadWhenVisible);
    observer.observe(forecastView, { attributes: true, attributeFilter: ["class"] });

    const forecastNav = document.querySelector('.nav-item[data-view="fair-prices"]');
    forecastNav?.addEventListener("click", function() {
        window.setTimeout(loadWhenVisible, 100);
    });
}


async function loadForecastResults() {
    const container = document.getElementById("forecastResultsContainer");
    if (isForecastLoading) return;
    isForecastLoading = true;

    if (container) {
        container.innerHTML = `
            <div class="fair-price-empty" role="status">Loading forecast data...</div>
        `;
    }

    try {
        const [forecastResult, priceResult, marketForecastResult, marketPriceResult] = await Promise.allSettled([
            apiRequest(FORECASTS_ENDPOINT, { method: "GET" }),
            apiRequest(PRICE_DATA_ENDPOINT, { method: "GET" }),
            apiRequest(MARKET_PRICE_FORECASTS_ENDPOINT, { method: "GET" }),
            apiRequest(MARKET_PRICES_ENDPOINT, { method: "GET" }),
        ]);

        const legacyForecasts = forecastResult.status === "fulfilled" && Array.isArray(forecastResult.value)
            ? forecastResult.value
            : [];
        const legacyPrices = priceResult.status === "fulfilled" && Array.isArray(priceResult.value)
            ? priceResult.value
            : [];
        const marketForecasts = marketForecastResult.status === "fulfilled" && Array.isArray(marketForecastResult.value)
            ? marketForecastResult.value
            : [];
        const marketPrices = marketPriceResult.status === "fulfilled" && Array.isArray(marketPriceResult.value)
            ? marketPriceResult.value
            : [];

        FORECASTS_DATA = legacyForecasts.length
            ? legacyForecasts
            : marketForecasts
                .filter((row) => String(row.price_type).toUpperCase() === "RETAIL")
                .map((row) => ({
                    commodity: row.commodity,
                    forecast_date: `${row.year}-${String(row.month).padStart(2, "0")}-01`,
                    forecast_price_low: row.forecast_price_low,
                    forecast_price_high: row.forecast_price_high,
                }));
        PRICE_DATA = legacyPrices.length
            ? legacyPrices
            : marketPrices.map((row) => ({
                commodity: row.commodity,
                price_per_kg: row.retail_price_per_kg,
                record_date: row.record_date,
            }));

        if (!FORECASTS_DATA.length) throw new Error("No forecast records were returned.");

        const sharedForecastStart = getSharedForecastStartMonth();
        const alignedForecasts = sharedForecastStart
            ? FORECASTS_DATA.filter((row) => monthKey(row.forecast_date) >= sharedForecastStart)
            : FORECASTS_DATA;
        renderForecastResults(alignedForecasts);
        renderFairPriceDashboard();
        if (priceResult.status === "rejected" && marketPriceResult.status === "rejected") {
            console.warn("Historical price series could not be loaded:", priceResult.reason);
        }
    } catch (error) {
        console.error("Failed to load forecast results:", error);
        FORECASTS_DATA = [];
        PRICE_DATA = [];
        if (container) {
            container.innerHTML = `<div class="fair-price-empty" role="alert">Forecast data could not be loaded. <button class="btn-outline-report" type="button" onclick="loadForecastResults()">Retry</button></div>`;
        }
        renderFairPriceDashboard();
    } finally {
        isForecastLoading = false;
    }
}

function updatePriceMetrics(forecasts) {
    renderFairPriceDashboard();
}

function monthKey(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : null;
}

function monthLabel(key) {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("en-PH", {
        month: "short",
        year: "numeric",
    });
}

function displayCommodityName(name) {
    return name === "Squash fruit" ? "Squash" : name;
}

function normalizeFairPriceCommodity(name) {
    return name === "Squash" || name === "Squash fruit" ? "Squash fruit" : name;
}
function getSharedForecastStartMonth() {
    const observedMonths = PRICE_DATA.map((row) => monthKey(row.record_date)).filter(Boolean).sort();
    const nextObservedMonth = observedMonths.length
        ? (() => {
            const [year, month] = observedMonths.at(-1).split("-").map(Number);
            const next = new Date(year, month, 1);
            return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
        })()
        : null;
    const firstForecastByCommodity = new Map();
    FORECASTS_DATA.forEach((row) => {
        const commodity = normalizeFairPriceCommodity(row.commodity);
        const key = monthKey(row.forecast_date);
        if (!commodity || !key) return;
        const existing = firstForecastByCommodity.get(commodity);
        if (!existing || key < existing) firstForecastByCommodity.set(commodity, key);
    });
    const candidates = [...firstForecastByCommodity.values(), nextObservedMonth].filter(Boolean).sort();
    return candidates.at(-1) || null;
}

const FAIR_PRICE_COMMODITIES = [
    { name: "Tomato", category: "Solanaceae", image: "tomato.jpg", className: "tomato", color: "#D65B4A" },
    { name: "Squash fruit", category: "Cucurbits", image: "squash.jpg", className: "squash", color: "#D28A16" },
    { name: "Red Onion", category: "Alliums", image: "onion.jpg", className: "red-onion", color: "#167A58" },
    { name: "White Onion", category: "Alliums", image: "whiteonion.jpg", className: "white-onion", color: "#4385B7" },
];

function renderFairPriceCommodityCards(selectedCommodity, forecastFocus, selectedPeriod, cutoff) {
    const host = document.getElementById("fairPriceKpis");
    if (!host) return;

    const formatPrice = (value) => Number.isFinite(value)
        ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value)
        : "—";
    const inPeriod = (value) => {
        if (selectedPeriod === "all") return true;
        const date = new Date(value);
        return !Number.isNaN(date.getTime()) && date >= cutoff;
    };
    const sharedForecastStart = getSharedForecastStartMonth();

    host.innerHTML = FAIR_PRICE_COMMODITIES.map((crop) => {
        const observed = PRICE_DATA
            .filter((row) => normalizeFairPriceCommodity(row.commodity) === crop.name && inPeriod(row.record_date))
            .sort((left, right) => String(left.record_date).localeCompare(String(right.record_date)));
        const projected = FORECASTS_DATA
            .filter((row) => normalizeFairPriceCommodity(row.commodity) === crop.name && inPeriod(row.forecast_date) && (!sharedForecastStart || monthKey(row.forecast_date) >= sharedForecastStart))
            .sort((left, right) => String(left.forecast_date).localeCompare(String(right.forecast_date)));
        const latestObserved = observed.at(-1);
        const nextForecastDate = monthKey(projected[0]?.forecast_date);
        const nextForecastRows = projected.filter((row) => monthKey(row.forecast_date) === nextForecastDate);
        const nextForecast = nextForecastRows.length ? {
            forecast_price_low: nextForecastRows.reduce((total, row) => total + Number(row.forecast_price_low), 0) / nextForecastRows.length,
            forecast_price_high: nextForecastRows.reduce((total, row) => total + Number(row.forecast_price_high), 0) / nextForecastRows.length,
        } : null;
        const name = displayCommodityName(crop.name);
        return `
            <button class="fair-price-commodity-card ${crop.className}" type="button" data-fair-price-commodity="${escapeHtml(crop.name)}" aria-pressed="${selectedCommodity === crop.name || (selectedCommodity === "all" && forecastFocus === crop.name)}">
                <span class="fair-price-crop-heading">
                    <span class="fair-price-crop-photo"><img src="../images/${crop.image}" alt="" loading="lazy"></span>
                    <span><span class="fair-price-crop-category">${crop.category}</span><span class="fair-price-crop-name">${escapeHtml(name)}</span></span>
                </span>
                <strong class="fair-price-crop-price">${latestObserved ? formatPrice(Number(latestObserved.price_per_kg)) : "—"} <small>/kg</small></strong>
                <span class="fair-price-crop-date">${latestObserved ? `Last observed ${marketRecordDate(latestObserved.record_date, { month: "short", year: "numeric" })}` : "No observation in this period"}</span>
                <span class="fair-price-crop-range"><span>${nextForecastDate ? `Forecast · ${monthLabel(nextForecastDate)}` : "Forecast range"}</span><strong>${nextForecast ? `${formatPrice(Number(nextForecast.forecast_price_low))}–${formatPrice(Number(nextForecast.forecast_price_high))}` : "No forecast"}</strong></span>
            </button>`;
    }).join("");

    if (!host.dataset.bound) {
        host.addEventListener("click", function(event) {
            const card = event.target.closest("[data-fair-price-commodity]");
            if (!card) return;
            const select = document.getElementById("fairPriceCommodity");
            if (!select) return;
            select.value = card.dataset.fairPriceCommodity;
            renderFairPriceDashboard();
        });
        host.dataset.bound = "true";
    }
}

function initFairPriceControls() {
    const commoditySelect = document.getElementById("fairPriceCommodity");
    if (commoditySelect && !commoditySelect.dataset.bound) {
        commoditySelect.addEventListener("change", function() {
            renderFairPriceDashboard();
        });
        commoditySelect.dataset.bound = "true";
    }
}

function renderFairPriceDashboard() {
    const commoditySelect = document.getElementById("fairPriceCommodity");
    if (!commoditySelect) return;

    const previousSelection = normalizeFairPriceCommodity(commoditySelect.value || "all");
    const availableCommodities = [...new Set([
        ...PRICE_DATA.map((row) => row.commodity),
        ...FORECASTS_DATA.map((row) => row.commodity),
    ].filter(Boolean).map(normalizeFairPriceCommodity))].sort((a, b) => displayCommodityName(a).localeCompare(displayCommodityName(b)));

    const optionSignature = availableCommodities.join("|");
    if (commoditySelect.dataset.options !== optionSignature) {
        commoditySelect.replaceChildren(new Option("All commodities", "all"));
        availableCommodities.forEach((commodity) => {
            commoditySelect.add(new Option(displayCommodityName(commodity), commodity));
        });
        commoditySelect.dataset.options = optionSignature;
        commoditySelect.value = availableCommodities.includes(previousSelection) || previousSelection === "all"
            ? previousSelection
            : "all";
    }

    const selectedCommodity = commoditySelect.value || "all";
    const forecastFocus = selectedCommodity;
    const selectedPeriod = "all";
    const cutoff = new Date();
    if (selectedPeriod === "12m") cutoff.setMonth(cutoff.getMonth() - 12);
    if (selectedPeriod === "3y") cutoff.setFullYear(cutoff.getFullYear() - 3);

    const isInPeriod = (value) => {
        if (selectedPeriod === "all") return true;
        const date = new Date(value);
        return !Number.isNaN(date.getTime()) && date >= cutoff;
    };
    const sharedForecastStart = getSharedForecastStartMonth();
    const matchesCommodity = (row) => selectedCommodity === "all" || normalizeFairPriceCommodity(row.commodity) === selectedCommodity;
    const historical = PRICE_DATA.filter((row) => matchesCommodity(row) && isInPeriod(row.record_date));
    const forecasts = FORECASTS_DATA.filter((row) => matchesCommodity(row) && isInPeriod(row.forecast_date) && (!sharedForecastStart || monthKey(row.forecast_date) >= sharedForecastStart));
    const formatPrice = (value) => Number.isFinite(value)
        ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value)
        : "—";
    renderFairPriceCommodityCards(selectedCommodity, forecastFocus, selectedPeriod, cutoff);

    renderFairPriceChart(selectedCommodity, selectedPeriod, forecastFocus);
}

function groupForecastsByYear(forecasts) {
    const grouped = {};

    forecasts.forEach(function(forecast) {
        let dateString = forecast.forecast_date || forecast.date || forecast.created_at;
        if (!dateString) return;

        const date = new Date(dateString);
        if (isNaN(date.getTime())) return;

        const year = date.getFullYear();
        if (!grouped[year]) {
            grouped[year] = [];
        }
        grouped[year].push(forecast);
    });

    return grouped;
}

function groupForecastsByMonth(forecasts) {
    const grouped = {};

    forecasts.forEach(function(forecast) {
        let dateString = forecast.forecast_date || forecast.date || forecast.created_at;
        if (!dateString) return;

        const date = new Date(dateString);
        if (isNaN(date.getTime())) return;

        const month = date.toLocaleString('en-US', { month: 'long' });
        if (!grouped[month]) {
            grouped[month] = [];
        }
        grouped[month].push(forecast);
    });

    return grouped;
}


/* ============================================================
   FORECAST TOGGLE FUNCTIONS
============================================================ */

function toggleForecastYear(headerElement) {
    const content = headerElement.nextElementSibling;
    const arrow = headerElement.querySelector('span:last-child');

    if (!content) return;

    if (content.style.display !== 'none') {
        content.style.display = 'none';
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    } else {
        content.style.display = 'block';
        if (arrow) arrow.style.transform = 'rotate(180deg)';
    }
}

function toggleForecastMonth(headerElement) {
    const content = headerElement.nextElementSibling;
    const arrow = headerElement.querySelector('span:last-child');

    if (!content) return;

    if (content.style.display === 'none' || content.style.display === '') {
        content.style.display = 'block';
        if (arrow) arrow.style.transform = 'rotate(90deg)';
    } else {
        content.style.display = 'none';
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    }

}

window.toggleForecastYear = toggleForecastYear;
window.toggleForecastMonth = toggleForecastMonth;

function bindForecastToggleHandlers(container, yearHandler, monthHandler) {
    container?.querySelectorAll(".forecast-year-header").forEach((header) => {
        header.removeAttribute("onclick");
        header.addEventListener("click", () => yearHandler(header));
    });
    container?.querySelectorAll(".forecast-month-header").forEach((header) => {
        header.removeAttribute("onclick");
        header.addEventListener("click", () => monthHandler(header));
    });
}

const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);


/* ============================================================
   RENDER FORECAST RESULTS
============================================================ */

function renderForecastResults(forecasts) {
    console.log("renderForecastResults called with", forecasts.length, "forecasts");
    
    const container = document.getElementById("forecastResultsContainer");
    if (!container) {
        console.warn("forecastResultsContainer not found.");
        return;
    }

    if (!forecasts || forecasts.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #777; font-size: 15px;">
                <div style="font-size: 40px; margin-bottom: 10px;">📊</div>
                No forecast results available.
                <br><small style="color: #999;">Please check back later.</small>
            </div>
        `;
        return;
    }

    const groupedByYear = groupForecastsByYear(forecasts);

    let html = '';

    const sortedYears = Object.keys(groupedByYear).sort().reverse();

    sortedYears.forEach(function(year) {
        const yearData = groupedByYear[year];
        
        const groupedByMonth = groupForecastsByMonth(yearData);

        html += `
            <div class="forecast-year-group" style="margin-bottom: 16px;">
                <div class="forecast-year-header" style="
                    background: #2E7D32;
                    color: #fff;
                    padding: 12px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-weight: 600;
                    font-size: 16px;
                    transition: background 0.2s;
                " onclick="toggleForecastYear(this)">
                    <span>${year}</span>
                    <span style="font-size: 20px; transition: transform 0.3s;">▼</span>
                </div>
                <div class="forecast-year-content" style="
                    background: #fff;
                    border: 1px solid #E5E5E5;
                    border-top: none;
                    border-radius: 0 0 8px 8px;
                    padding: 8px 12px;
                    margin-top: 0;
                    overflow: visible;
                ">
        `;

        const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const sortedMonths = Object.keys(groupedByMonth).sort(function(a, b) {
            return monthOrder.indexOf(a) - monthOrder.indexOf(b);
        });

        sortedMonths.forEach(function(month, monthIndex) {
            const monthData = groupedByMonth[month];
            
            const sortedCommodities = monthData.sort(function(a, b) {
                const commodityA = a.commodity || '';
                const commodityB = b.commodity || '';
                return commodityA.localeCompare(commodityB);
            });

            const isFirstMonth = monthIndex === 0;
            const displayStyle = isFirstMonth ? 'block' : 'none';
            const arrowRotation = isFirstMonth ? 'rotate(90deg)' : 'rotate(0deg)';

            html += `
                <div class="forecast-month-group" style="margin-bottom: 4px;">
                    <div class="forecast-month-header" style="
                        padding: 10px 12px;
                        cursor: pointer;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        background: #F6F3EB;
                        border-radius: 6px;
                        font-weight: 500;
                        font-size: 14px;
                        transition: background 0.2s;
                    " onclick="toggleForecastMonth(this)">
                        <span>${month} ${year}</span>
                        <span style="font-size: 16px; transition: transform 0.3s; transform: ${arrowRotation};">▶</span>
                    </div>
                    <div class="forecast-month-content" style="
                        padding: 8px 12px;
                        background: #FAF8F5;
                        border-radius: 0 0 6px 6px;
                        display: ${displayStyle};
                    ">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <thead>
                                <tr style="border-bottom: 2px solid #DEDDDC;">
                                    <th style="text-align: left; padding: 8px 6px; font-weight: 600; color: #0F3D2E;">Commodity</th>
                                    <th style="text-align: center; padding: 8px 6px; font-weight: 600; color: #0F3D2E;">Lower Price (₱)</th>
                                    <th style="text-align: center; padding: 8px 6px; font-weight: 600; color: #0F3D2E;">Upper Price (₱)</th>
                                    <th style="text-align: center; padding: 8px 6px; font-weight: 600; color: #0F3D2E;">Range</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            sortedCommodities.forEach(function(forecast, index) {
                const commodity = forecast.commodity || forecast.crop || '—';
                const lowerPrice = Number(forecast.forecast_price_low || 0);
                const upperPrice = Number(forecast.forecast_price_high || 0);
                const lowerPriceStr = lowerPrice.toFixed(2);
                const upperPriceStr = upperPrice.toFixed(2);
                const bgColor = index % 2 === 0 ? 'transparent' : '#F6F3EB';
                
                html += `
                    <tr style="background: ${bgColor}; border-bottom: 1px solid #F0EDE8;">
                        <td style="padding: 8px 6px; font-weight: 500;">${escapeHtml(commodity)}</td>
                                    <td class="forecast-low-price" style="padding: 8px 6px; text-align: center;">₱${lowerPriceStr}</td>
                                    <td class="forecast-high-price" style="padding: 8px 6px; text-align: center;">₱${upperPriceStr}</td>
                        <td style="padding: 8px 6px; text-align: center;">
                                        <span class="forecast-range-badge">₱${lowerPriceStr} – ₱${upperPriceStr}</span>
                        </td>
                    </tr>
                `;
            });

            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    bindForecastToggleHandlers(container, toggleForecastYear, toggleForecastMonth);

    const countDiv = document.createElement('div');
    countDiv.className = "forecast-results-count";
    countDiv.style.cssText = 'margin-top:12px;padding:12px 0;font-size:13px;text-align:right;border-top:1px solid var(--border);';
    countDiv.textContent = `Total: ${forecasts.length} forecast(s) found.`;
    container.appendChild(countDiv);
    
    console.log("Forecast rendering complete!");
}

/* ============================================================
   PRICE TREND CHART
============================================================ */

function initPriceChart() {
    const canvas = document.getElementById('priceTrendChart');
    if (!canvas || typeof Chart === "undefined") return;
    renderFairPriceDashboard();
}

function renderChart(forecasts, commodityFilter) {
    console.log("🔍 renderChart called with filter:", commodityFilter);
    
    const canvas = document.getElementById('priceTrendChart');
    if (!canvas) {
        console.warn('❌ Canvas not found');
        return;
    }
    
    if (priceChartInstance) {
        console.log('🔄 Destroying existing chart...');
        priceChartInstance.destroy();
        priceChartInstance = null;
    }
    
    let filteredData = forecasts;
    if (commodityFilter !== 'all') {
        filteredData = forecasts.filter(function(f) {
            return f.commodity === commodityFilter;
        });
        console.log('📊 Filtered to', filteredData.length, 'records for', commodityFilter);
    }
    
    if (filteredData.length === 0) {
        console.warn('❌ No data for filter:', commodityFilter);
        if (canvas.parentElement) {
            canvas.parentElement.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #777; font-size: 15px;">
                    <div style="font-size: 40px; margin-bottom: 10px;">📊</div>
                    No data available for ${commodityFilter}.
                </div>
            `;
        }
        return;
    }
    
    const commodities = {};
    filteredData.forEach(function(f) {
        const commodity = f.commodity || 'Unknown';
        if (!commodities[commodity]) {
            commodities[commodity] = [];
        }
        commodities[commodity].push(f);
    });
    console.log('📦 Commodities found:', Object.keys(commodities));
    
    Object.keys(commodities).forEach(function(commodity) {
        commodities[commodity].sort(function(a, b) {
            return new Date(a.forecast_date) - new Date(b.forecast_date);
        });
    });
    
    const datasets = [];
    const colorPalette = {
        'Tomato': {
            main: '#E74C3C',
            light: 'rgba(231, 76, 60, 0.15)',
            gradient: ['rgba(231, 76, 60, 0.3)', 'rgba(231, 76, 60, 0.05)']
        },
        'Squash fruit': {
            main: '#F39C12',
            light: 'rgba(243, 156, 18, 0.15)',
            gradient: ['rgba(243, 156, 18, 0.3)', 'rgba(243, 156, 18, 0.05)']
        },
        'Red Onion': {
            main: '#8E44AD',
            light: 'rgba(142, 68, 173, 0.15)',
            gradient: ['rgba(142, 68, 173, 0.3)', 'rgba(142, 68, 173, 0.05)']
        },
        'White Onion': {
            main: '#1ABC9C',
            light: 'rgba(26, 188, 156, 0.15)',
            gradient: ['rgba(26, 188, 156, 0.3)', 'rgba(26, 188, 156, 0.05)']
        },
    };
    
    const defaultColors = ['#E74C3C', '#F39C12', '#2ECC71', '#3498DB', '#9B59B6', '#1ABC9C', '#E67E22', '#2C3E50'];
    let colorIndex = 0;
    
    const allDates = [];
    Object.keys(commodities).forEach(function(commodity) {
        commodities[commodity].forEach(function(f) {
            const date = new Date(f.forecast_date);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            if (!allDates.includes(dateStr)) {
                allDates.push(dateStr);
            }
        });
    });
    allDates.sort(function(a, b) {
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateA - dateB;
    });
    console.log(' Dates:', allDates);
    
    Object.keys(commodities).forEach(function(commodity, idx) {
        const data = commodities[commodity];
        
        let colorObj = colorPalette[commodity];
        if (!colorObj) {
            const mainColor = defaultColors[colorIndex % defaultColors.length];
            colorObj = {
                main: mainColor,
                light: mainColor + '33',
                gradient: [mainColor + '44', mainColor + '11']
            };
            colorIndex++;
        }
        
        const lowerPrices = [];
        const upperPrices = [];
        
        allDates.forEach(function(dateStr) {
            const found = data.find(function(f) {
                const d = new Date(f.forecast_date);
                return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) === dateStr;
            });
            
            if (found) {
                lowerPrices.push(parseFloat(found.forecast_price_low || 0));
                upperPrices.push(parseFloat(found.forecast_price_high || 0));
            } else {
                lowerPrices.push(null);
                upperPrices.push(null);
            }
        });
        
                datasets.push({
            label: commodity + ' (Low)',
            data: lowerPrices,
            borderColor: colorObj.main,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 4,
            pointBackgroundColor: colorObj.main,
            pointBorderColor: '#FFFFFF',
            pointBorderWidth: 2,
            pointHoverRadius: 7,
            tension: 0.4,
            fill: false,
            spanGaps: false
        });

        datasets.push({
            label: commodity + ' (High)',
            data: upperPrices,
            borderColor: colorObj.main,
            backgroundColor: function(context) {
                const chart = context.chart;
                const {ctx, chartArea} = chart;
                if (!chartArea) {
                    return colorObj.light;
                }
                const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, colorObj.gradient[0]);
                gradient.addColorStop(1, colorObj.gradient[1]);
                return gradient;
            },
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: colorObj.main,
            pointBorderColor: '#FFFFFF',
            pointBorderWidth: 2,
            pointHoverRadius: 8,
            tension: 0.4,
            fill: true,
            spanGaps: false
        });
    });
    
    if (datasets.length === 0) {
        console.warn('❌ No datasets created');
        if (canvas.parentElement) {
            canvas.parentElement.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #777; font-size: 15px;">
                    <div style="font-size: 40px; margin-bottom: 10px;">📊</div>
                    No price data available for chart.
                </div>
            `;
        }
        return;
    }
    
    console.log('📊 Creating chart with', datasets.length, 'datasets');
    
    try {
        const ctx = canvas.getContext('2d');
        priceChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: allDates,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                                    plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: {
                                size: 12,
                                weight: '600',
                                family: 'Plus Jakarta Sans'
                            },
                            boxWidth: 32,
                            boxHeight: 0,
                            padding: 16,
                            usePointStyle: false,
                            color: '#2E2A22',
                            generateLabels: function(chart) {
                                return chart.data.datasets.map(function(dataset, i) {
                                    return {
                                        text: dataset.label,
                                        strokeStyle: dataset.borderColor,
                                        fillStyle: dataset.borderColor,
                                        lineWidth: dataset.borderWidth || 2,
                                        lineDash: dataset.borderDash || [],
                                        pointStyle: 'line',
                                        hidden: !chart.isDatasetVisible(i),
                                        datasetIndex: i
                                    };
                                });
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(46, 42, 34, 0.92)',
                        titleFont: {
                            size: 13,
                            weight: '700',
                            family: 'Plus Jakarta Sans'
                        },
                        bodyFont: {
                            size: 12,
                            weight: '500',
                            family: 'Plus Jakarta Sans'
                        },
                        padding: 12,
                        cornerRadius: 8,
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                let value = context.raw;
                                if (value !== null && value !== undefined) {
                                    const formatted = value.toFixed(2);
                                    label += ': ₱' + formatted + '/kg';
                                } else {
                                    label += ': No data';
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false,
                            drawBorder: true,
                            borderColor: 'rgba(0,0,0,0.08)'
                        },
                        ticks: {
                            font: {
                                size: 11,
                                weight: '600',
                                family: 'Plus Jakarta Sans'
                            },
                            color: '#625E52',
                            maxRotation: 45,
                            minRotation: 30
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0,0,0,0.06)',
                            drawBorder: true,
                            borderColor: 'rgba(0,0,0,0.08)'
                        },
                        ticks: {
                            callback: function(value) {
                                return '₱' + value.toFixed(0);
                            },
                            font: {
                                size: 11,
                                weight: '600',
                                family: 'Plus Jakarta Sans'
                            },
                            color: '#625E52',
                            stepSize: 10
                        },
                        title: {
                            display: true,
                            text: 'Price (₱/kg)',
                            font: {
                                size: 12,
                                weight: '700',
                                family: 'Plus Jakarta Sans'
                            },
                            color: '#625E52'
                        }
                    }
                },
                elements: {
                    line: {
                        tension: 0.4
                    },
                    point: {
                        hoverRadius: 8
                    }
                },
                layout: {
                    padding: {
                        top: 10,
                        bottom: 10,
                        left: 10,
                        right: 20
                    }
                }
            }
        });
        console.log('✅ Chart rendered successfully!');
    } catch (error) {
        console.error('❌ Error creating chart:', error);
        if (canvas.parentElement) {
            canvas.parentElement.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #C0392B; font-size: 15px;">
                    <div style="font-size: 40px; margin-bottom: 10px;">⚠️</div>
                    Error creating chart: ${error.message}
                </div>
            `;
        }
    }
}

function renderFairPriceChart(selectedCommodity, selectedPeriod, forecastFocus) {
    const canvas = document.getElementById("priceTrendChart");
    const emptyState = document.getElementById("priceChartEmpty");
    if (!canvas || typeof Chart === "undefined") {
        if (emptyState) {
            emptyState.hidden = false;
            emptyState.textContent = typeof Chart === "undefined"
                ? "The price chart library could not be loaded."
                : "Price chart is unavailable.";
        }
        return;
    }

    const cutoff = new Date();
    if (selectedPeriod === "12m") cutoff.setMonth(cutoff.getMonth() - 12);
    if (selectedPeriod === "3y") cutoff.setFullYear(cutoff.getFullYear() - 3);
    const inPeriod = (value) => {
        if (selectedPeriod === "all") return true;
        const date = new Date(value);
        return !Number.isNaN(date.getTime()) && date >= cutoff;
    };
    const sharedForecastStart = getSharedForecastStartMonth();
    const matchesCommodity = (row) => selectedCommodity === "all" || normalizeFairPriceCommodity(row.commodity) === selectedCommodity;
    const historical = PRICE_DATA.filter((row) => matchesCommodity(row) && inPeriod(row.record_date));
    const forecasts = FORECASTS_DATA.filter((row) =>
        (forecastFocus === "all" || normalizeFairPriceCommodity(row.commodity) === normalizeFairPriceCommodity(forecastFocus))
        && inPeriod(row.forecast_date)
        && (!sharedForecastStart || monthKey(row.forecast_date) >= sharedForecastStart)
    );
    const seriesNames = [...new Set([
        ...historical.map((row) => row.commodity),
        ...forecasts.map((row) => row.commodity),
    ].filter(Boolean).map(normalizeFairPriceCommodity))];
    const colors = {
        Tomato: "#B64A3A",
        "Squash fruit": "#B8790A",
        "Red Onion": "#176B4D",
        "White Onion": "#356F9E",
    };
    const forecastMonths = new Set();
    const monthlyHistorical = new Map();
    const monthlyForecasts = new Map();

    historical.forEach((row) => {
        const key = monthKey(row.record_date);
        const value = Number(row.price_per_kg);
        if (!key || !Number.isFinite(value)) return;
        const seriesKey = `${normalizeFairPriceCommodity(row.commodity)}|${key}`;
        if (!monthlyHistorical.has(seriesKey)) monthlyHistorical.set(seriesKey, []);
        monthlyHistorical.get(seriesKey).push(value);
    });
    forecasts.forEach((row) => {
        const key = monthKey(row.forecast_date);
        const low = Number(row.forecast_price_low);
        const high = Number(row.forecast_price_high);
        if (!key || !Number.isFinite(low) || !Number.isFinite(high)) return;
        forecastMonths.add(key);
        const seriesKey = `${normalizeFairPriceCommodity(row.commodity)}|${key}`;
        if (!monthlyForecasts.has(seriesKey)) monthlyForecasts.set(seriesKey, []);
        monthlyForecasts.get(seriesKey).push({ low, high });
    });

    const sortedMonths = [...forecastMonths].sort();
    const datasets = [];
    seriesNames.forEach((commodity) => {
        const color = colors[commodity] || "#167A58";
        const scaleValue = (value) => {
            if (!Number.isFinite(value)) return null;
            return value;
        };
        const observedValues = sortedMonths.map((key) => {
            const values = monthlyHistorical.get(`${commodity}|${key}`);
            return values?.length
                ? scaleValue(values.reduce((total, value) => total + value, 0) / values.length)
                : null;
        });
        const forecastRows = sortedMonths.map((key) => monthlyForecasts.get(`${commodity}|${key}`) || []);
        const lowValues = forecastRows.map((rows) => rows.length
            ? scaleValue(rows.reduce((total, row) => total + row.low, 0) / rows.length)
            : null);
        const highValues = forecastRows.map((rows) => rows.length
            ? scaleValue(rows.reduce((total, row) => total + row.high, 0) / rows.length)
            : null);
        const lastObservedIndex = observedValues.map((value, valueIndex) => value === null ? -1 : valueIndex)
            .reduce((lastIndex, valueIndex) => valueIndex > lastIndex ? valueIndex : lastIndex, -1);
        const projectedValues = sortedMonths.map((key, valueIndex) => {
            if (lastObservedIndex < 0 || valueIndex < lastObservedIndex) return null;
            if (valueIndex === lastObservedIndex) return observedValues[lastObservedIndex];
            if (lowValues[valueIndex] === null || highValues[valueIndex] === null) return null;
            return (lowValues[valueIndex] + highValues[valueIndex]) / 2;
        });

        datasets.push({
            label: `${displayCommodityName(commodity)} observed`,
            data: observedValues,
            borderColor: color,
            backgroundColor: color,
            borderWidth: 2.5,
            pointRadius: (context) => observedValues[context.dataIndex] === null ? 0 : 2.5,
            pointHoverRadius: 5,
            tension: 0,
            spanGaps: true,
            segment: {
                borderDash: (context) => context.p1DataIndex - context.p0DataIndex > 1 ? [3, 5] : [],
                borderColor: (context) => context.p1DataIndex - context.p0DataIndex > 1 ? "rgba(105,118,111,.45)" : color,
            },
            order: 3,
        });
        if (forecastRows.some((rows) => rows.length > 0)) {
            datasets.push({
            label: `${displayCommodityName(commodity)} range lower`,
            data: lowValues,
            borderColor: color,
            backgroundColor: "transparent",
            borderWidth: 1,
            borderDash: [3, 5],
            pointRadius: 0,
            tension: 0,
            spanGaps: false,
            order: 1,
        });
        datasets.push({
            label: `${displayCommodityName(commodity)} forecast range`,
            data: highValues,
            borderColor: color,
            backgroundColor(context) {
                const chartArea = context.chart.chartArea;
                if (!chartArea) return `${color}26`;
                const gradient = context.chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, `${color}35`);
                gradient.addColorStop(1, `${color}08`);
                return gradient;
            },
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0,
            fill: "-1",
            spanGaps: false,
            order: 2,
        });
        if (selectedCommodity !== "all") {
            datasets.push({
                label: `${displayCommodityName(commodity)} forecast midpoint`,
                data: projectedValues,
                borderColor: color,
                backgroundColor: color,
                borderWidth: 2,
                borderDash: [6, 4],
                pointRadius: 0,
                pointHoverRadius: 5,
                tension: 0,
                spanGaps: true,
                order: 4,
            });
        }
        }
    });

    const hasValues = datasets.some((dataset) => dataset.data.some((value) => value !== null));
    if (emptyState) {
        emptyState.hidden = hasValues;
        emptyState.textContent = hasValues
            ? ""
            : "No observed prices or forecasts are available for this selection.";
    }
    if (priceChartInstance) {
        priceChartInstance.destroy();
        priceChartInstance = null;
    }
    if (!hasValues) return;

    const context = canvas.getContext("2d");
    if (!context) return;
    priceChartInstance = new Chart(context, {
        type: "line",
        data: {
            labels: sortedMonths.map(monthLabel),
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            animation: { duration: 350 },
            layout: { padding: { top: 4, right: 8, bottom: 0, left: 0 } },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    backgroundColor: "rgba(14,27,22,.94)",
                    titleColor: "#DCEBDD",
                    bodyColor: "#F3FAF3",
                    padding: 11,
                    cornerRadius: 8,
                    callbacks: {
                        label: (context) => context.raw == null
                            ? `${context.dataset.label}: no data`
                            : `${context.dataset.label}: ₱${Number(context.raw).toFixed(2)}/kg`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: "#0F3D2E", maxTicksLimit: 8, maxRotation: 0, font: { size: 10, weight: "600" } },
                    border: { display: false },
                },
                y: {
                    beginAtZero: false,
                    suggestedMin: 0,
                    grid: { color: "rgba(14,27,22,.07)" },
                    ticks: {
                        color: "#0F3D2E",
                        callback: (value) => `₱${Number(value).toFixed(0)}`,
                        font: { size: 10, weight: "600" },
                    },
                    title: {
                        display: true,
                        text: "Price (₱/kg)",
                        color: "#0F3D2E",
                        font: { size: 10, weight: "700" },
                    },
                    border: { display: false },
                },
            },
        },
    });
}

function updateChart(commodity) {
    const commoditySelect = document.getElementById("fairPriceCommodity");
    if (!commoditySelect) return;
    commoditySelect.value = commodity;
    renderFairPriceDashboard();
}

console.log("Price Trend Chart functions loaded!");

/* ============================================================
   MARKET PRICE DASHBOARD
   DA-AMAD WHOLESALE + RETAIL
============================================================ */

function initMarketPriceDashboard() {
    const marketView = document.getElementById("view-market-prices");
    if (!marketView) return;

    const loadWhenVisible = function () {
        if (marketView.classList.contains("active-view") || marketView.classList.contains("active")) {
            loadMarketPriceDashboard();
        }
    };
    const observer = new MutationObserver(loadWhenVisible);
    observer.observe(marketView, { attributes: true, attributeFilter: ["class"] });
    document.querySelector('.nav-item[data-view="market-prices"]')?.addEventListener("click", function () {
        window.setTimeout(loadWhenVisible, 100);
    });

    if (!marketPriceFiltersBound) {
        ["marketCommodityFilter", "marketPriceTypeFilter"].forEach(function (id) {
            document.getElementById(id)?.addEventListener("change", renderMarketPriceDashboard);
        });
        marketPriceFiltersBound = true;
    }

    loadWhenVisible();
}

/* ============================================================
   LOAD EVERYTHING
============================================================ */

async function loadMarketPriceDashboard() {
    if (isMarketPriceLoading) return;
    isMarketPriceLoading = true;

    try {
        const forecasts = await apiRequest(MARKET_PRICE_FORECASTS_ENDPOINT, { method: "GET" });

        if (!Array.isArray(forecasts)) {
            throw new Error("Invalid market forecast response.");
        }

        MARKET_PRICES_DATA = [];
        MARKET_PRICE_FORECASTS_DATA = forecasts
            .map((forecast) => {
                // The monthly endpoint returns year/month instead of the
                // weekly forecast_date used by the dashboard filters.
                const year = Number(forecast.year);
                const month = Number(forecast.month);
                const forecastDate = forecast.forecast_date
                    || (Number.isInteger(year) && Number.isInteger(month)
                        && month >= 1 && month <= 12
                        ? `${year}-${String(month).padStart(2, "0")}-01`
                        : null);

                return forecastDate
                    ? { ...forecast, forecast_date: forecastDate }
                    : null;
            })
            .filter(Boolean);

        renderWholesaleForecasts(MARKET_PRICE_FORECASTS_DATA);
        renderRetailForecasts(MARKET_PRICE_FORECASTS_DATA);
        renderMarketPriceDashboard();
    } catch (error) {
        console.error("Failed to load Market Price Dashboard:", error);
        MARKET_PRICES_DATA = [];
        MARKET_PRICE_FORECASTS_DATA = [];

        const containers = [
            "wholesaleForecastResultsContainer",
            "retailForecastResultsContainer",
        ];

        containers.forEach(function (id) {
            const container = document.getElementById(id);

            if (!container) return;

            container.innerHTML = `
                <div class="market-data-error" role="alert">
                    <span class="market-error-mark" aria-hidden="true">!</span>
                    <div class="market-error-copy">
                        <strong>Market data is temporarily unavailable</strong>
                        <p>Check that the eSaka API is running, then retry.</p>
                        <small>${escapeHtml(error.message || "Market data request failed.")}</small>
                    </div>
                    <button class="btn-primary" type="button" onclick="loadMarketPriceDashboard()">Retry</button>
                </div>
            `;
        });
        renderMarketPriceDashboard();
    } finally {
        isMarketPriceLoading = false;
    }
}

/* ============================================================
   GROUP BY YEAR
============================================================ */

function groupMarketForecastsByYear(forecasts) {
    const grouped = {};

    forecasts.forEach(function (forecast) {
        // Ang bagong endpoint ay may "year" at "month" fields
        const year = forecast.year;
        if (!year) return;

        if (!grouped[year]) {
            grouped[year] = [];
        }

        grouped[year].push(forecast);
    });

    return grouped;
}

/* ============================================================
   GROUP BY MONTH
============================================================ */

function groupMarketForecastsByMonth(forecasts) {
    const grouped = {};

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    forecasts.forEach(function (forecast) {
        const monthNum = forecast.month;
        if (!monthNum) return;

        const month = monthNames[monthNum - 1];
        if (!month) return;

        if (!grouped[month]) {
            grouped[month] = [];
        }

        grouped[month].push(forecast);
    });

    return grouped;
}

/* ============================================================
   WHOLESALE FORECAST
============================================================ */

function renderWholesaleForecasts(forecasts) {
    const container = document.getElementById(
        "wholesaleForecastResultsContainer"
    );

    if (!container) return;

    const wholesale = forecasts.filter(function (forecast) {
        return String(forecast.price_type).toUpperCase() === "WHOLESALE";
    });

    renderMarketForecastTable(container, wholesale, "Wholesale");
}

/* ============================================================
   RETAIL FORECAST
============================================================ */

function renderRetailForecasts(forecasts) {
    const container = document.getElementById(
        "retailForecastResultsContainer"
    );

    if (!container) return;

    const retail = forecasts.filter(function (forecast) {
        return String(forecast.price_type).toUpperCase() === "RETAIL";
    });

    renderMarketForecastTable(container, retail, "Retail");
}

/* ============================================================
   FORECAST TABLE
============================================================ */

function renderMarketForecastTable(container, forecasts, priceType) {
    if (!forecasts || forecasts.length === 0) {
        container.innerHTML = `
            <div style="
                padding:40px;
                text-align:center;
                color:#777;
            ">
                <div style="
                    font-size:40px;
                    margin-bottom:10px;
                ">
                    📊
                </div>

                No ${priceType.toLowerCase()}
                forecast results available.
            </div>
        `;

        return;
    }

    const groupedByYear = groupMarketForecastsByYear(forecasts);

    let html = "";

    const sortedYears = Object.keys(groupedByYear).sort().reverse();

    const monthOrder = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];

    sortedYears.forEach(function (year) {
        const yearData = groupedByYear[year];
        const groupedByMonth = groupMarketForecastsByMonth(yearData);

        html += `
            <div
                class="forecast-year-group"
                style="margin-bottom:16px;"
            >

                <div
                    class="forecast-year-header"
                    onclick="toggleMarketForecastYear(this)"
                    style="
                        background:#2E7D32;
                        color:#fff;
                        padding:12px 20px;
                        border-radius:8px;
                        cursor:pointer;
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        font-weight:600;
                        font-size:16px;
                    "
                >

                    <span>
                         ${year} Projections
                    </span>

                    <span
                        style="
                            font-size:20px;
                            transition:transform .3s;
                        "
                    >
                        ▼
                    </span>

                </div>

                <div
                    class="forecast-year-content"
                    style="
                        background:#fff;
                        border:1px solid #E5E5E5;
                        border-top:none;
                        border-radius:0 0 8px 8px;
                        padding:8px 12px;
                        overflow:hidden;
                        transition:max-height .3s ease;
                    "
                >
        `;

        const sortedMonths = Object.keys(groupedByMonth).sort(function (a, b) {
            return monthOrder.indexOf(a) - monthOrder.indexOf(b);
        });

        sortedMonths.forEach(function (month, monthIndex) {
            const monthData = groupedByMonth[month];

            monthData.sort(function (a, b) {
                return String(a.commodity || "").localeCompare(
                    String(b.commodity || "")
                );
            });

            const isFirstMonth = monthIndex === 0;

            html += `
                    <div
                        class="forecast-month-group"
                        style="margin-bottom:4px;"
                    >

                        <div
                            class="forecast-month-header"
                            onclick="toggleMarketForecastMonth(this)"
                            style="
                                padding:10px 12px;
                                cursor:pointer;
                                display:flex;
                                justify-content:space-between;
                                align-items:center;
                                background:#F6F3EB;
                                border-radius:6px;
                                font-weight:500;
                                font-size:14px;
                            "
                        >

                            <span>
                                 ${month} ${year}
                            </span>

                            <span
                                style="
                                    font-size:16px;
                                    transform:
                                        ${isFirstMonth ? "rotate(90deg)" : "rotate(0deg)"};
                                "
                            >
                                ▶
                            </span>

                        </div>

                        <div
                            class="forecast-month-content"
                            style="
                                padding:8px 12px;
                                background:#FAF8F5;
                                border-radius:0 0 6px 6px;
                                display:
                                    ${isFirstMonth ? "block" : "none"};
                            "
                        >

                            <table style="
                                width:100%;
                                border-collapse:collapse;
                                font-size:13px;
                            ">

                                <thead>

                                    <tr style="
                                        border-bottom:
                                            2px solid #DEDDDC;
                                    ">

                                        <th style="
                                            text-align:left;
                                            padding:8px 6px;
                                            font-weight:600;
                                        ">
                                            Commodity
                                        </th>

                                        <th style="
                                            text-align:center;
                                            padding:8px 6px;
                                            font-weight:600;
                                        ">
                                            Lower Price (₱)
                                        </th>

                                        <th style="
                                            text-align:center;
                                            padding:8px 6px;
                                            font-weight:600;
                                        ">
                                            Upper Price (₱)
                                        </th>

                                        <th style="
                                            text-align:center;
                                            padding:8px 6px;
                                            font-weight:600;
                                        ">
                                            Range
                                        </th>

                                    </tr>

                                </thead>

                                <tbody>
            `;

            monthData.forEach(function (forecast, index) {
                const commodity = forecast.commodity || "—";

                const low = Number(forecast.forecast_price_low) || 0;

                const high = Number(forecast.forecast_price_high) || 0;

                const bgColor = index % 2 === 0 ? "transparent" : "#F6F3EB";

                html += `
                            <tr class="market-forecast-row" style="
                                background:${bgColor};
                                border-bottom:
                                    1px solid #F0EDE8;
                            ">

                                <td style="
                                    padding:8px 6px;
                                    font-weight:500;
                                ">
                                    ${escapeHtml(commodity)}
                                </td>

                                <td class="market-forecast-low" style="
                                    padding:8px 6px;
                                    text-align:center;
                                ">
                                    ₱${low.toFixed(2)}
                                </td>

                                <td class="market-forecast-high" style="
                                    padding:8px 6px;
                                    text-align:center;
                                ">
                                    ₱${high.toFixed(2)}
                                </td>

                                <td style="
                                    padding:8px 6px;
                                    text-align:center;
                                ">

                                    <span class="market-forecast-range" style="
                                        padding:2px 12px;
                                        border-radius:12px;
                                        font-size:12px;
                                        font-weight:600;
                                    ">
                                        ₱${low.toFixed(2)}
                                        – ₱${high.toFixed(2)}
                                    </span>

                                </td>

                            </tr>
                        `;
            });

            html += `
                                </tbody>

                            </table>

                        </div>

                    </div>
                `;
        });

        html += `
                </div>

            </div>
        `;
    });

    container.innerHTML = html;
    bindForecastToggleHandlers(container, toggleMarketForecastYear, toggleMarketForecastMonth);

    const firstYear = container.querySelector(".forecast-year-content");

    if (firstYear) {
        firstYear.style.maxHeight = firstYear.scrollHeight + "px";
    }

    const countDiv = document.createElement("div");

    countDiv.style.cssText = `
        margin-top:12px;
        padding:12px 0;
        font-size:13px;
        color:#666;
        text-align:right;
        border-top:1px solid #E5E5E5;
    `;

    countDiv.textContent = `Total: ${forecasts.length} ${priceType.toLowerCase()} forecast(s) found.`;

    container.appendChild(countDiv);
}

/* ============================================================
   TOGGLE YEAR
============================================================ */

function toggleMarketForecastYear(headerElement) {
    const content = headerElement.nextElementSibling;

    const arrow = headerElement.querySelector("span:last-child");

    if (!content) return;

    if (content.style.maxHeight && content.style.maxHeight !== '0px') {
        content.style.maxHeight = '0px';
        content.style.display = 'none';

        if (arrow) {
            arrow.style.transform = "rotate(0deg)";
        }
    } else {
        content.style.display = 'block';
        content.style.maxHeight = content.scrollHeight + "px";

        if (arrow) {
            arrow.style.transform = "rotate(180deg)";
        }
    }

}

window.toggleMarketForecastYear = toggleMarketForecastYear;

/* ============================================================
   TOGGLE MONTH
============================================================ */

function toggleMarketForecastMonth(headerElement) {
    const content = headerElement.nextElementSibling;

    const arrow = headerElement.querySelector("span:last-child");

    if (!content) return;

    if (content.style.display === "none" || content.style.display === "") {
        content.style.display = "block";

        if (arrow) {
            arrow.style.transform = "rotate(90deg)";
        }
    } else {
        content.style.display = "none";

        if (arrow) {
            arrow.style.transform = "rotate(0deg)";
        }
    }

    window.toggleMarketForecastMonth = toggleMarketForecastMonth;
}

/* ============================================================
   HISTORICAL MARKET PRICES
============================================================ */

function renderHistoricalMarketPrices(prices) {
    const container = document.getElementById(
        "marketHistoricalResultsContainer"
    );

    if (!container) return;

    if (!prices || prices.length === 0) {
        container.innerHTML = `
            <div style="
                padding:40px;
                text-align:center;
                color:#777;
            ">
                No historical market price data available.
            </div>
        `;

        return;
    }

    const grouped = {};

    prices.forEach(function (price) {
        const date = new Date(price.record_date);

        if (isNaN(date.getTime())) return;

        const year = date.getFullYear();

        if (!grouped[year]) {
            grouped[year] = [];
        }

        grouped[year].push(price);
    });

    const sortedYears = Object.keys(grouped).sort().reverse();
    const role = localStorage.getItem("role");
    const canRemoveMarketPrices = [
        "System Administrator",
        "System Admin",
        "DA-RFO Officer",
        "DA-RFO",
    ].includes(role);

    let html = "";

    sortedYears.forEach(function (year) {
        const yearData = grouped[year];

        yearData.sort(function (a, b) {
            return new Date(a.record_date) - new Date(b.record_date);
        });

        html += `
            <div
                class="historical-market-year"
                style="margin-bottom:16px;"
            >

                <div style="
                    background:#F6F3EB;
                    padding:10px 14px;
                    border-radius:6px;
                    font-weight:600;
                    font-size:14px;
                    margin-bottom:6px;
                ">
                     ${year}
                </div>

                <div style="
                    overflow-x:auto;
                ">

                    <table style="
                        width:100%;
                        border-collapse:collapse;
                        font-size:13px;
                    ">

                        <thead>

                            <tr style="
                                border-bottom:
                                    2px solid #DEDDDC;
                            ">

                                <th style="
                                    text-align:left;
                                    padding:8px 6px;
                                ">
                                    Month
                                </th>

                                <th style="
                                    text-align:left;
                                    padding:8px 6px;
                                ">
                                    Commodity
                                </th>

                                <th style="
                                    text-align:center;
                                    padding:8px 6px;
                                ">
                                    Wholesale (₱/kg)
                                </th>

                                <th style="
                                    text-align:center;
                                    padding:8px 6px;
                                ">
                                    Retail (₱/kg)
                                </th>

                                <th style="
                                    text-align:center;
                                    padding:8px 6px;
                                ">
                                    Source
                                </th>

                                ${canRemoveMarketPrices ? `<th style="
                                    text-align:center;
                                    padding:8px 6px;
                                ">
                                    Action
                                </th>` : ""}

                            </tr>

                        </thead>

                        <tbody>
        `;

        yearData.forEach(function (price, index) {
            const date = new Date(price.record_date);

            const month = date.toLocaleString("en-US", {
                month: "long",
            });

            const wholesale = Number(price.wholesale_price_per_kg) || 0;

            const retail = Number(price.retail_price_per_kg) || 0;

            const source = price.data_source || "DA-AMAD";

            const bgColor = index % 2 === 0 ? "transparent" : "#F6F3EB";

            html += `
                    <tr style="
                        background:${bgColor};
                        border-bottom:
                            1px solid #F0EDE8;
                    ">

                        <td style="
                            padding:8px 6px;
                        ">
                            ${month}
                        </td>

                        <td style="
                            padding:8px 6px;
                            font-weight:500;
                        ">
                            ${escapeHtml(price.commodity || "—")}
                        </td>

                        <td style="
                            padding:8px 6px;
                            text-align:center;
                        ">
                            ₱${wholesale.toFixed(2)}
                        </td>

                        <td style="
                            padding:8px 6px;
                            text-align:center;
                        ">
                            ₱${retail.toFixed(2)}
                        </td>

                        <td style="
                            padding:8px 6px;
                            text-align:center;
                        ">
                            <span style="
                                background:#E8F5E9;
                                color:#2E7D32;
                                padding:2px 8px;
                                border-radius:10px;
                                font-size:11px;
                                font-weight:600;
                            ">
                                ${escapeHtml(source)}
                            </span>
                        </td>

                        ${canRemoveMarketPrices ? `<td style="
                            padding:8px 6px;
                            text-align:center;
                        ">
                            <button
                                type="button"
                                class="btn-outline-report market-price-delete-btn"
                                data-market-price-id="${price.market_price_id}"
                                data-market-price-label="${escapeHtml(`${price.commodity || "market price"} · ${month} ${year}`)}"
                                style="padding:5px 9px; font-size:11px;"
                            >
                                Remove
                            </button>
                        </td>` : ""}

                    </tr>
                `;
        });

        html += `
                        </tbody>

                    </table>

                </div>

            </div>
        `;
    });

    container.innerHTML = html;

    const countDiv = document.createElement("div");

    countDiv.style.cssText = `
        margin-top:12px;
        padding:12px 0;
        font-size:13px;
        color:#666;
        text-align:right;
        border-top:1px solid #E5E5E5;
    `;

    countDiv.textContent = `Total: ${prices.length} historical market price record(s) found.`;

    container.appendChild(countDiv);

    container.querySelectorAll(".market-price-delete-btn").forEach(function (button) {
        button.addEventListener("click", function () {
            deleteHistoricalMarketPrice(
                button.dataset.marketPriceId,
                button.dataset.marketPriceLabel,
                button
            );
        });
    });
}

async function deleteHistoricalMarketPrice(marketPriceId, label, button) {
    if (!marketPriceId) return;

    const confirmed = await ESaka.confirm(
        `Remove ${label || "this historical market price record"}? This cannot be undone.`,
        { title: "Remove record?", confirmText: "Remove", danger: true }
    );
    if (!confirmed) return;

    if (button) {
        button.disabled = true;
        button.textContent = "Removing...";
    }

    try {
        await apiRequest(`${MARKET_PRICES_ENDPOINT}${encodeURIComponent(marketPriceId)}`, {
            method: "DELETE",
        });
        await loadMarketPriceDashboard();
    } catch (error) {
        console.error("Failed to remove historical market price:", error);
        if (button) {
            button.disabled = false;
            button.textContent = "Remove";
        }
        window.alert(`Could not remove the record: ${error.message}`);
    }
}

function marketPriceValue(record, priceType) {
    return Number(priceType === "RETAIL"
        ? record.retail_price_per_kg
        : record.wholesale_price_per_kg);
}

function formatMarketCurrency(value) {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

function marketRecordDate(value, options = { month: "short", year: "numeric" }) {
    if (!value) return "Date unavailable";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-PH", options);
}

function renderMarketPriceSummary() {
    const host = document.getElementById("marketPriceSummaryCards");
    if (!host) return;

    const priceType = document.getElementById("marketPriceTypeFilter")?.value || "WHOLESALE";
    const commodities = [...new Set(MARKET_PRICES_DATA.map((record) => record.commodity).filter(Boolean))].sort();
    if (!commodities.length) {
        host.innerHTML = `<div class="market-summary-empty">No market-price observations are available.</div>`;
        return;
    }

    const displayNames = { "Squash fruit": "Squash" };
    const categories = { Tomato: "SOLANACEAE", Squash: "CUCURBITS", "Squash fruit": "CUCURBITS", "White Onion": "ALLIUMS", "Red Onion": "ALLIUMS" };
    const photos = { Tomato: "tomato.jpg", Squash: "squash.jpg", "Squash fruit": "squash.jpg", "White Onion": "whiteonion.jpg", "Red Onion": "onion.jpg" };
    const cardClasses = { Tomato: "tomato", Squash: "squash", "Squash fruit": "squash", "White Onion": "white-onion", "Red Onion": "red-onion" };

    host.innerHTML = commodities.map((commodity) => {
        const records = MARKET_PRICES_DATA
            .filter((record) => record.commodity === commodity && Number.isFinite(marketPriceValue(record, priceType)))
            .sort((left, right) => String(left.record_date).localeCompare(String(right.record_date)));
        const latest = records.at(-1);
        const previous = records.at(-2);
        if (!latest) return "";

        const latestValue = marketPriceValue(latest, priceType);
        const previousValue = previous ? marketPriceValue(previous, priceType) : null;
        const percentageChange = previousValue && Number.isFinite(previousValue)
            ? ((latestValue - previousValue) / previousValue) * 100
            : null;
        const direction = percentageChange === null ? "unknown" : percentageChange > 0.05 ? "up" : percentageChange < -0.05 ? "down" : "flat";
        const movement = percentageChange === null
            ? "No prior record"
            : `${percentageChange > 0 ? "+" : ""}${Math.abs(percentageChange).toFixed(1)}% vs prior record`;
        const name = displayNames[commodity] || commodity;

        return `
            <article class="commodity-price-card ${cardClasses[commodity] || ""}">
                <div class="commodity-price-top">
                    <div><span class="commodity-price-category">${escapeHtml(categories[commodity] || "COMMODITY")}</span><h3>${escapeHtml(name)}</h3></div>
                    <span class="commodity-price-icon">${photos[commodity]
                        ? `<img src="../images/${photos[commodity]}" alt="${escapeHtml(name)}" loading="lazy">`
                        : `<span aria-hidden="true">◌</span>`}</span>
                </div>
                <strong class="commodity-price-value">${formatMarketCurrency(latestValue)} <span class="commodity-price-unit">/kg</span></strong>
                <span class="commodity-price-change ${direction}">${direction === "up" ? "↑" : direction === "down" ? "↓" : direction === "flat" ? "→" : "•"} ${movement}</span>
                <div class="commodity-price-footer"><span>Previous</span><strong>${previous ? formatMarketCurrency(previousValue) : "—"}</strong></div>
                <div class="commodity-price-footer"><span>Recorded</span><strong>${marketRecordDate(latest.record_date, { month: "short", day: "numeric", year: "numeric" })}</strong></div>
            </article>`;
    }).join("");

    const updated = document.getElementById("marketSummaryUpdated");
    if (updated) {
        const latestRecord = MARKET_PRICES_DATA.map((record) => record.record_date).filter(Boolean).sort().at(-1);
        updated.textContent = `${priceType === "RETAIL" ? "Retail" : "Wholesale"} · ${MARKET_PRICES_DATA.length} observations · latest ${marketRecordDate(latestRecord)}`;
    }
}

function renderMarketPriceDashboard() {
    const commodity = document.getElementById("marketCommodityFilter")?.value || "all";
    const priceType = document.getElementById("marketPriceTypeFilter")?.value || "WHOLESALE";
    const period = "all";
    const level = priceType === "RETAIL" ? "Retail" : "Wholesale";
    const commodityName = commodity === "all" ? "All commodities" : commodity;
    const title = document.getElementById("marketTrendTitle");
    if (title) title.textContent = `${commodityName} ${level.toLowerCase()} price trend`;

    renderMarketPriceChart(MARKET_PRICE_FORECASTS_DATA, commodity, priceType, period);
}

/* ============================================================
   MARKET PRICE CHART
============================================================ */

function initMarketPriceChart() {
    console.log("Initializing Market Price Chart...");

    const canvas = document.getElementById("marketPriceTrendChart");

    if (!canvas) {
        console.warn("Market price chart canvas not found.");
        return;
    }

    if (typeof Chart === "undefined") {
        console.warn("Chart.js not loaded yet.");

        setTimeout(initMarketPriceChart, 500);

        return;
    }

    if (
        MARKET_PRICES_DATA.length === 0 &&
        MARKET_PRICE_FORECASTS_DATA.length === 0
    ) {
        console.warn("No market price data for chart.");

        return;
    }

    renderMarketPriceDashboard();
}

/* ============================================================
   MARKET PRICE CHART
============================================================ */

function renderMarketPriceChart(forecasts, commodityFilter, priceType, period) {
    const canvas = document.getElementById("marketPriceTrendChart");
    const emptyState = document.getElementById("marketPriceChartEmpty");
    if (!canvas || typeof Chart === "undefined") return;

    const cutoff = new Date();
    if (period === "12m") cutoff.setMonth(cutoff.getMonth() - 12);
    if (period === "3y") cutoff.setFullYear(cutoff.getFullYear() - 3);
    const inPeriod = (value) => {
        if (period === "all") return true;
        const date = new Date(value);
        return !Number.isNaN(date.getTime()) && date >= cutoff;
    };
    const matchesCommodity = (row) => commodityFilter === "all" || row.commodity === commodityFilter;
    const filteredForecasts = forecasts.filter((row) =>
        matchesCommodity(row) && String(row.price_type).toUpperCase() === priceType && inPeriod(row.forecast_date)
    );
    const seriesNames = [...new Set(filteredForecasts.map((row) => row.commodity).filter(Boolean))];
    const colors = {
        Tomato: "#D65B4A",
        Squash: "#D28A16",
        "Squash fruit": "#D28A16",
        "White Onion": "#4385B7",
        "Red Onion": "#167A58",
    };
    const monthKeys = new Set();
    const forecastByMonth = new Map();

    filteredForecasts.forEach((row) => {
        const key = monthKey(row.forecast_date);
        const low = Number(row.forecast_price_low);
        const high = Number(row.forecast_price_high);
        if (!key || !Number.isFinite(low) || !Number.isFinite(high)) return;
        monthKeys.add(key);
        const index = `${row.commodity}|${key}`;
        if (!forecastByMonth.has(index)) forecastByMonth.set(index, []);
        forecastByMonth.get(index).push({ low, high });
    });

    const sortedMonths = [...monthKeys].sort();
    const datasets = [];
    seriesNames.forEach((name, index) => {
        const color = colors[name] || ["#167A58", "#D65B4A", "#D28A16", "#4385B7"][index % 4];
        const bounds = sortedMonths.map((key) => forecastByMonth.get(`${name}|${key}`) || []);
        const lowValues = bounds.map((values) => values.length
            ? values.reduce((sum, value) => sum + value.low, 0) / values.length
            : null);
        const highValues = bounds.map((values) => values.length
            ? values.reduce((sum, value) => sum + value.high, 0) / values.length
            : null);

        datasets.push({
            label: `${name} forecast lower`,
            data: lowValues,
            borderColor: color,
            backgroundColor: "transparent",
            borderWidth: 1,
            borderDash: [4, 4],
            pointRadius: 0,
            tension: 0.25,
            spanGaps: false,
            order: 1,
        });
        datasets.push({
            label: `${name} forecast range`,
            data: highValues,
            borderColor: color,
            backgroundColor: `${color}26`,
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: "-1",
            spanGaps: false,
            order: 2,
        });
    });

    const hasData = datasets.some((dataset) => dataset.data.some((value) => value !== null));
    if (emptyState) {
        emptyState.hidden = hasData;
        emptyState.textContent = "No forecast points match these filters.";
    }
    if (marketPriceChartInstance) {
        marketPriceChartInstance.destroy();
        marketPriceChartInstance = null;
    }
    if (!hasData) return;

    const context = canvas.getContext("2d");
    if (!context) return;
    const commodityNames = { "Squash fruit": "Squash" };
    marketPriceChartInstance = new Chart(context, {
        type: "line",
        data: {
            labels: sortedMonths.map(monthLabel),
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            animation: { duration: 350 },
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        color: "#53615B",
                        usePointStyle: true,
                        pointStyle: "line",
                        boxWidth: 18,
                        padding: 12,
                        font: { family: "Plus Jakarta Sans", size: 10, weight: "600" },
                        filter: (item) => !item.text.includes("forecast lower"),
                        generateLabels(chart) {
                            return chart.data.datasets.map((dataset, datasetIndex) => ({
                                text: dataset.label.replace(" forecast range", " forecast range").replace(" observed", " observed"),
                                strokeStyle: dataset.borderColor,
                                fillStyle: dataset.backgroundColor,
                                lineWidth: dataset.borderWidth || 2,
                                lineDash: dataset.borderDash || [],
                                pointStyle: "line",
                                hidden: !chart.isDatasetVisible(datasetIndex),
                                datasetIndex,
                            })).filter((item) => !item.text.includes("forecast lower"));
                        },
                    },
                },
                tooltip: {
                    backgroundColor: "rgba(14,27,22,.94)",
                    titleColor: "#DCEBDD",
                    bodyColor: "#F3FAF3",
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label(context) {
                            const value = context.raw;
                            if (value == null) return `${context.dataset.label}: no data`;
                            const name = context.dataset.label.replace(" forecast lower", " range lower");
                            return `${name}: ${formatMarketCurrency(Number(value))}/kg`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: "#0F3D2E", maxTicksLimit: 9, maxRotation: 0, font: { size: 10, weight: "600" } },
                    border: { display: false },
                },
                y: {
                    beginAtZero: false,
                    grid: { color: "rgba(14,27,22,.07)" },
                    ticks: { color: "#0F3D2E", callback: (value) => `₱${Number(value).toFixed(0)}`, font: { size: 10, weight: "600" } },
                    title: { display: true, text: `${priceType === "RETAIL" ? "Retail" : "Wholesale"} price (₱/kg)`, color: "#0F3D2E", font: { size: 11, weight: "700" } },
                    border: { display: false },
                },
            },
        },
    });
}

/* ============================================================
   CHART FILTER
============================================================ */

function updateMarketPriceChart(commodity) {
    const select = document.getElementById("marketCommodityFilter");
    if (!select) return;
    select.value = commodity;
    renderMarketPriceDashboard();
}

console.log("Market Price Dashboard functions loaded!");

/* ============================================================
   AEW NOTIFICATION BELL
============================================================ */

async function initNotificationBell() {
    const bell = document.getElementById("notificationBell");
    const dropdown = document.getElementById("notificationDropdown");

    if (!bell || !dropdown) return;

    bell.addEventListener("click", async (event) => {
        event.stopPropagation();
        dropdown.classList.toggle("show");

        if (dropdown.classList.contains("show")) {
            await loadAEWNotifications();
        }
    });

    document.addEventListener("click", (event) => {
        if (!bell.contains(event.target)) {
            dropdown.classList.remove("show");
        }
    });

    await loadAEWNotifications();
    connectAEWNotificationStream();
}


/* ============================================================
   LOAD AEW NOTIFICATIONS
============================================================ */

async function loadAEWNotifications() {
    const notificationList = document.getElementById("notificationList");
    const notificationDot = document.getElementById("notificationDot");

    if (!notificationList) return;

    try {
        notificationList.innerHTML = `
            <div class="notification-empty">
                Loading notifications...
            </div>
        `;

        const mapResponse = await fetch(
            `${API_BASE_URL}/api/planting-intents/municipality-map`,
            {
                method: "GET",
                headers: getAuthHeaders()
            }
        );

        if (!mapResponse.ok) {
            throw new Error(`Map API error: ${mapResponse.status}`);
        }

        updateAEWNotifications(await mapResponse.json());

    } catch (error) {
        console.error("Failed to load AEW notifications:", error);
        notificationList.innerHTML = `
            <div class="notification-empty">
                Unable to load notifications.
            </div>
        `;
        if (notificationDot) {
            notificationDot.style.display = "none";
        }
    }
}

function updateAEWNotifications(mapResult) {
    const notificationDot = document.getElementById("notificationDot");
    if (!Array.isArray(mapResult?.data)) {
        showNoNotifications();
        return;
    }

    const alertKeys = new Set();
    const alerts = [];

    for (const municipalityData of mapResult.data) {
        const municipality = municipalityData.municipality;
        if (!municipality || !Array.isArray(municipalityData.commodities)) continue;

        for (const item of municipalityData.commodities) {
            const status = String(item.status || "").toUpperCase();
            if (!["OVERSUPPLY", "SURPLUS", "DEFICIT"].includes(status)) continue;

            const commodity = String(item.commodity || "").trim();
            if (!commodity) continue;

            const alertType = status === "DEFICIT" ? "DEFICIT" : "OVERSUPPLY";
            const key = `${municipality.toLowerCase()}|${commodity.toLowerCase()}|${alertType}`;
            if (alertKeys.has(key)) continue;

            alertKeys.add(key);
            alerts.push({ municipality, commodity, status: alertType });
        }
    }

    renderAEWNotifications(alerts);
    if (notificationDot) {
        notificationDot.style.display = alerts.length > 0 ? "block" : "none";
    }
}

let aewNotificationSocket = null;
let aewNotificationReconnectTimer = null;

function connectAEWNotificationStream() {
    if (aewNotificationSocket?.readyState === WebSocket.OPEN ||
        aewNotificationSocket?.readyState === WebSocket.CONNECTING) return;

    const socketUrl = new URL("/api/planting-intents/municipality-map/ws", API_BASE_URL);
    socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(socketUrl);
    aewNotificationSocket = socket;

    socket.addEventListener("message", event => {
        try {
            const message = JSON.parse(event.data);
            if (message.type === "municipality-map") {
                updateAEWNotifications(message);
            }
        } catch (error) {
            console.error("Unable to process live AEW notifications:", error);
        }
    });

    socket.addEventListener("error", () => {
        console.warn("Live AEW notifications are unavailable; the notification list will refresh when opened.");
    });

    socket.addEventListener("close", event => {
        if (aewNotificationSocket === socket) aewNotificationSocket = null;
        if (event.code === 1008) return;
        clearTimeout(aewNotificationReconnectTimer);
        aewNotificationReconnectTimer = setTimeout(connectAEWNotificationStream, 5000);
    });
}


/* ============================================================
   RENDER NOTIFICATIONS
============================================================ */

function renderAEWNotifications(alerts) {
    const notificationList = document.getElementById("notificationList");

    if (!notificationList) return;

    if (!alerts.length) {
        showNoNotifications();
        return;
    }

    notificationList.innerHTML = "";

    alerts.forEach(alert => {
        const item = document.createElement("div");
        item.className = "notification-item";
        item.style.padding = "12px 18px";
        item.style.borderBottom = "1px solid var(--border-light)";
        item.style.fontSize = "13px";

        const details = document.createElement("div");
        details.style.display = "grid";
        details.style.gap = "4px";
        [
            ["Municipality", alert.municipality],
            ["Commodity", alert.commodity],
            ["Status", alert.status]
        ].forEach(([label, value]) => {
            const row = document.createElement("div");
            const fieldLabel = document.createElement("strong");
            fieldLabel.textContent = `${label}: `;
            const fieldValue = document.createElement("span");
            fieldValue.textContent = value;
            row.append(fieldLabel, fieldValue);

            if (label === "Status") {
                fieldValue.style.fontWeight = "700";
                fieldValue.style.color = alert.status === "DEFICIT" ? "#D97706" : "#C0392B";
            }

            details.appendChild(row);
        });
        item.appendChild(details);

        notificationList.appendChild(item);
    });
}


/* ============================================================
   NO NOTIFICATIONS
============================================================ */

function showNoNotifications() {
    const notificationList = document.getElementById("notificationList");
    const notificationDot = document.getElementById("notificationDot");

    if (notificationList) {
        notificationList.innerHTML = `
            <div class="notification-empty" style="padding: 20px; text-align: center; color: var(--muted); font-size: 13px;">
                No new notifications.
            </div>
        `;
    }

    if (notificationDot) {
        notificationDot.style.display = "none";
    }
}

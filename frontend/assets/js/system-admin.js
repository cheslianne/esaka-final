const API_BASE_URL = window.API_BASE_URL || "https://esaka-backend-production.up.railway.app";
let currentSessionUser = null;


/* ============================================================
   AUTH
============================================================ */
function getAuthToken() {
    return "cookie-session";
}


function getAuthHeaders() {
    const token = getAuthToken();
    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}


function getErrorMessage(data, fallback = "Something went wrong.") {
    if (!data) return fallback;
    if (Array.isArray(data.detail)) {
        return data.detail.map(error => {
            if (typeof error === "string") return error;
            if (error?.msg) return error.msg;
            return JSON.stringify(error);
        }).join("\n");
    }
    if (typeof data.detail === "string") return data.detail;
    if (typeof data.detail === "object" && data.detail !== null) {
        if (data.detail.message) return data.detail.message;
        if (data.detail.msg) return data.detail.msg;
        try { return JSON.stringify(data.detail); } catch { return fallback; }
    }
    if (typeof data.message === "string") return data.message;
    return fallback;
}


function handleUnauthorized() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("token_type");
    localStorage.removeItem("user_id");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    window.location.href = "../index.html";
}


function initializeLoggedInUser(user) {
    if (!user) return false;
    const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
    const displayName = fullName ||
        localStorage.getItem("user_display_name") ||
        user.username ||
        "Unknown User";
    const role = user.role || "Unknown Role";
    localStorage.setItem("user_id", user.user_id);
    localStorage.setItem("username", user.username);
    localStorage.setItem("role", role);
    if (fullName) localStorage.setItem("user_display_name", fullName);
    localStorage.removeItem("user_birthdate");
    const usernameElement = document.getElementById("loggedInUserName");
    const roleElement = document.getElementById("loggedInUserRole");
    if (usernameElement) usernameElement.textContent = displayName;
    if (roleElement) roleElement.textContent = role;
    return true;
}


function checkAdminRole() {
    const role = localStorage.getItem("role");
    if (role !== "System Administrator") {
        alert("Access denied. System Administrator privileges required.");
        window.location.href = "../index.html";
        return false;
    }
    return true;
}


function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function getRoleStyle(role) {
    const styles = {
        "System Administrator": { cls: "darkred", label: "System Administrator" },
        "DA-RFO Officer": { cls: "blue", label: "DA-RFO Officer" },
        "DA-RFO": { cls: "blue", label: "DA-RFO" },
        "Provincial Coordinator": { cls: "teal", label: "Provincial Coordinator" },
        "Provincial": { cls: "teal", label: "Provincial" },
        "Municipal Coordinator": { cls: "green", label: "Municipal Coordinator" },
        "Municipal": { cls: "green", label: "Municipal" },
        "AEW": { cls: "green", label: "AEW" }
    };
    return styles[role] || { cls: "green", label: role || "Unknown" };
}


/* ============================================================
   PAGINATION STATE
============================================================ */
let currentUserPage = 1;
const usersPerPage = 7;
let cachedUsers = [];
let dashboardUsersError = null;
let dashboardActivityError = null;
let dashboardUsersLoading = true;
let dashboardActivityLoading = true;


let currentAuditPage = 1;
const auditPerPage = 7;
let cachedAuditLogs = [];


let currentArchivedPage = 1;
const archivedPerPage = 7;
let cachedArchivedUsers = [];


function renderPagination(totalItems, itemsPerPage, currentPage, onPageChange) {
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;


    return {
        currentPage,
        totalPages,
        paginatedSlice: (array) => {
            const start = (currentPage - 1) * itemsPerPage;
            return array.slice(start, start + itemsPerPage);
        },
        updateUI: (infoId, prevBtnId, nextBtnId, numbersId) => {
            const infoEl = document.getElementById(infoId);
            const prevBtn = document.getElementById(prevBtnId);
            const nextBtn = document.getElementById(nextBtnId);
            const numbersEl = document.getElementById(numbersId);


            const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
            const endItem = Math.min(currentPage * itemsPerPage, totalItems);


            if (infoEl) infoEl.textContent = `Showing ${startItem}-${endItem} of ${totalItems}`;
            if (prevBtn) prevBtn.disabled = currentPage === 1;
            if (nextBtn) nextBtn.disabled = currentPage === totalPages || totalPages === 0;


            if (numbersEl) {
                numbersEl.innerHTML = "";
                let pages = [];
                if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                    if (currentPage <= 4) {
                        pages = [1, 2, 3, 4, 5, '...', totalPages];
                    } else if (currentPage >= totalPages - 3) {
                        pages = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
                    } else {
                        pages = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
                    }
                }


                pages.forEach(p => {
                    if (p === '...') {
                        const span = document.createElement("span");
                        span.textContent = "...";
                        span.style.padding = "5px 8px";
                        span.style.color = "var(--muted)";
                        numbersEl.appendChild(span);
                    } else {
                        const btn = document.createElement("button");
                        btn.type = "button";
                        btn.className = `btn-page ${p === currentPage ? "active" : ""}`;
                        btn.textContent = p;
                        btn.addEventListener("click", () => onPageChange(p));
                        numbersEl.appendChild(btn);
                    }
                });
            }
        }
    };
}


/* ============================================================
   PSGC API & LOCATION DROPDOWNS
============================================================ */
const PSGC_API = "https://psgc.cloud/api";

function psgcList(payload) {
    if (Array.isArray(payload)) return payload;
    for (const key of ["data", "items", "results"]) {
        if (Array.isArray(payload?.[key])) return payload[key];
    }
    return [];
}

function sameLocationName(left, right) {
    return String(left || "").trim().replace(/\s+/g, " ").toLowerCase() ===
        String(right || "").trim().replace(/\s+/g, " ").toLowerCase();
}


async function fetchRegions() {
    const res = await fetch(`${PSGC_API}/regions`);
    if (!res.ok) throw new Error("Failed to load regions");
    return psgcList(await res.json());
}


async function fetchProvinces(regionCode) {
    const res = await fetch(`${PSGC_API}/regions/${regionCode}/provinces`);
    if (!res.ok) throw new Error("Failed to load provinces");
    return psgcList(await res.json());
}


async function fetchMunicipalities(provinceCode) {
    const res = await fetch(`${PSGC_API}/provinces/${provinceCode}/cities-municipalities`);
    if (!res.ok) throw new Error("Failed to load municipalities");
    return psgcList(await res.json());
}


async function fetchMunicipalitiesFromRegion(regionCode) {
    const res = await fetch(`${PSGC_API}/regions/${regionCode}/cities-municipalities`);
    if (!res.ok) throw new Error("Failed to load municipalities");
    return psgcList(await res.json());
}


async function initializeLocationDropdowns() {
    const regionSelect = document.getElementById("regionSelect");
    const provinceSelect = document.getElementById("provinceSelect");
    const municipalitySelect = document.getElementById("municipalitySelect");


    if (!regionSelect || !provinceSelect || !municipalitySelect) return;


    try {
        const regions = await fetchRegions();
        regionSelect.innerHTML = `<option value="" disabled selected>Select a region</option>`;
        regions.forEach(r => {
            const opt = document.createElement("option");
            opt.value = r.code;
            opt.textContent = r.name;
            regionSelect.appendChild(opt);
        });
    } catch (err) {
        regionSelect.innerHTML = `<option value="" disabled selected>Failed to load regions</option>`;
        return;
    }


    regionSelect.addEventListener("change", async () => {
        const regionCode = regionSelect.value;
        provinceSelect.innerHTML = `<option value="" disabled selected>Loading...</option>`;
        provinceSelect.disabled = true;
        municipalitySelect.innerHTML = `<option value="" disabled selected>Select a municipality</option>`;
        municipalitySelect.disabled = true;


        if (!regionCode) return;


        try {
            const provinces = await fetchProvinces(regionCode);
            if (provinces.length === 0) {
                provinceSelect.innerHTML = `<option value="" disabled selected>N/A (no provinces)</option>`;
                const municipalities = await fetchMunicipalitiesFromRegion(regionCode);
                municipalitySelect.innerHTML = `<option value="" disabled selected>Select a municipality / city</option>`;
                municipalities.forEach(m => {
                    const opt = document.createElement("option");
                    opt.value = m.code;
                    opt.textContent = m.name;
                    municipalitySelect.appendChild(opt);
                });
                municipalitySelect.disabled = false;
                return;
            }


            provinceSelect.innerHTML = `<option value="" disabled selected>Select a province</option>`;
            provinces.forEach(p => {
                const opt = document.createElement("option");
                opt.value = p.code;
                opt.textContent = p.name;
                provinceSelect.appendChild(opt);
            });
            provinceSelect.disabled = false;
        } catch (err) {
            provinceSelect.innerHTML = `<option value="" disabled selected>Failed to load</option>`;
        }
    });


    provinceSelect.addEventListener("change", async () => {
        const provinceCode = provinceSelect.value;
        municipalitySelect.innerHTML = `<option value="" disabled selected>Loading...</option>`;
        municipalitySelect.disabled = true;


        if (!provinceCode) return;


        try {
            const municipalities = await fetchMunicipalities(provinceCode);
            municipalitySelect.innerHTML = `<option value="" disabled selected>Select a municipality / city</option>`;
            municipalities.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m.code;
                opt.textContent = m.name;
                municipalitySelect.appendChild(opt);
            });
            municipalitySelect.disabled = false;
        } catch (err) {
            municipalitySelect.innerHTML = `<option value="" disabled selected>Failed to load</option>`;
        }
    });
}


function resetLocationDropdowns() {
    const regionSelect = document.getElementById("regionSelect");
    const provinceSelect = document.getElementById("provinceSelect");
    const municipalitySelect = document.getElementById("municipalitySelect");


    if (regionSelect) regionSelect.selectedIndex = 0;
    if (provinceSelect) {
        provinceSelect.innerHTML = `<option value="" disabled selected>Select a province</option>`;
        provinceSelect.disabled = true;
    }
    if (municipalitySelect) {
        municipalitySelect.innerHTML = `<option value="" disabled selected>Select a municipality</option>`;
        municipalitySelect.disabled = true;
    }
}


/* ============================================================
   LOAD USERS
============================================================ */
function isUserActive(user) {
    if (typeof user.is_active === "boolean") return user.is_active;
    if (typeof user.status === "string") return user.status.toLowerCase() === "active";
    return true;
}

function renderUsersTable() {
    const userRows = document.getElementById("userRows");
    if (!userRows) return;

    const query = document.getElementById("searchUsers")?.value.trim().toLowerCase() || "";
    const statusFilter = document.getElementById("userStatusFilter")?.value || "";
    const filteredUsers = cachedUsers.filter(user => {
        const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();
        const email = user.email_address || user.email || "";
        const role = user.role || "";
        const status = isUserActive(user) ? "active" : "inactive";
        const matchesQuery = !query || [name, email, role, status].some(value => String(value).toLowerCase().includes(query));
        return matchesQuery && (!statusFilter || status === statusFilter);
    });

    if (filteredUsers.length === 0) {
        const message = cachedUsers.length === 0
            ? "No users found."
            : "No users match your search.";
        userRows.innerHTML = `<tr><td colspan="6" style="text-align:center;">${message}</td></tr>`;
        currentUserPage = 1;
        renderPagination(0, usersPerPage, currentUserPage, () => {}).updateUI("paginationInfo", "prevPageBtn", "nextPageBtn", "pageNumberBtns");
        return;
    }

    const pagination = renderPagination(filteredUsers.length, usersPerPage, currentUserPage, newPage => {
        currentUserPage = newPage;
        renderUsersTable();
    });
    currentUserPage = pagination.currentPage;
    userRows.innerHTML = "";

    pagination.paginatedSlice(filteredUsers).forEach(user => {
        const row = document.createElement("tr");
        const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "—";
        const email = user.email_address || user.email || "—";
        const role = user.role || "—";
        const createdAt = user.created_at ? new Date(user.created_at) : null;
        const createdDate = createdAt && !Number.isNaN(createdAt.getTime())
            ? createdAt.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })
            : "—";
        const isActive = isUserActive(user);
        const roleStyle = getRoleStyle(role);
        const userId = user.user_id ?? user.id ?? "";
        const isCurrentUser = String(userId) === String(localStorage.getItem("user_id"));

        row.innerHTML = `
            <td><span class="name-pill">${escapeHTML(fullName)}</span></td>
            <td>${escapeHTML(email)}</td>
            <td><span class="role ${roleStyle.cls}">${escapeHTML(roleStyle.label)}</span></td>
            <td><span class="status-badge ${isActive ? "active" : "inactive"}">${isActive ? "Active" : "Inactive"}</span></td>
            <td>${escapeHTML(createdDate)}</td>
            <td>
                <button class="${isActive ? "btn-deactivate" : "btn-reactivate"}" type="button" data-user-id="${escapeHTML(userId)}" data-active="${isActive}" ${isCurrentUser && isActive ? 'disabled title="You cannot deactivate your own account."' : ""}>
                    ${isActive ? "Deactivate" : "Reactivate"}
                </button>
                <button class="btn-archive" type="button" data-user-id="${escapeHTML(userId)}" data-user-name="${escapeHTML(fullName)}" ${isCurrentUser ? 'disabled title="You cannot archive your own account."' : ""}>
                    Archive
                </button>
            </td>
        `;
        row.style.cursor = "pointer";
        row.addEventListener("click", event => {
            if (event.target.closest("button")) return;
            openUserDetails(user);
        });
        userRows.appendChild(row);
    });

    pagination.updateUI("paginationInfo", "prevPageBtn", "nextPageBtn", "pageNumberBtns");

    const prevBtn = document.getElementById("prevPageBtn");
    const nextBtn = document.getElementById("nextPageBtn");
    if (prevBtn) {
        const newPrev = prevBtn.cloneNode(true);
        prevBtn.parentNode.replaceChild(newPrev, prevBtn);
        newPrev.addEventListener("click", () => {
            if (currentUserPage > 1) {
                currentUserPage--;
                renderUsersTable();
            }
        });
    }
    if (nextBtn) {
        const newNext = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNext, nextBtn);
        newNext.addEventListener("click", () => {
            if (currentUserPage < pagination.totalPages) {
                currentUserPage++;
                renderUsersTable();
            }
        });
    }

    document.querySelectorAll("#userRows .btn-deactivate, #userRows .btn-reactivate").forEach(button => {
        button.addEventListener("click", () => toggleUserStatus(button));
    });
    document.querySelectorAll("#userRows .btn-archive").forEach(button => {
        button.addEventListener("click", () => archiveUser(button));
    });
}

async function loadUsers() {
    const userRows = document.getElementById("userRows");
    if (!userRows) return;

    userRows.innerHTML = `<tr><td colspan="6" style="text-align:center;">Loading users...</td></tr>`;
    dashboardUsersLoading = true;
    dashboardUsersError = null;
    renderDashboardSummary();

    try {
        const response = await fetch(`${API_BASE_URL}/api/users`, {
            method: "GET",
            headers: getAuthHeaders()
        });
        let data = {};
        try { data = await response.json(); } catch { data = {}; }

        if (response.status === 401) { handleUnauthorized(); return; }
        if (response.status === 403) {
            dashboardUsersError = getErrorMessage(data, "You do not have permission to view users.");
            dashboardUsersLoading = false;
            userRows.innerHTML = `<tr><td colspan="6" class="api-error">${escapeHTML(dashboardUsersError)}</td></tr>`;
            renderDashboardSummary();
            return;
        }
        if (!response.ok) throw new Error(getErrorMessage(data, "Failed to load users."));

        let users = [];
        if (Array.isArray(data)) users = data;
        else if (Array.isArray(data.users)) users = data.users;
        else if (Array.isArray(data.data)) users = data.data;
        else throw new Error("Unexpected response format.");

        cachedUsers = users;
        dashboardUsersLoading = false;
        currentUserPage = 1;
        updateRoleSummaryCards(cachedUsers);
        renderUsersTable();
        renderDashboardSummary();
    } catch (error) {
        dashboardUsersError = error.message || "Failed to load users.";
        dashboardUsersLoading = false;
        userRows.innerHTML = `<tr><td colspan="6" class="api-error">Failed to load users.<br><br>${escapeHTML(dashboardUsersError)}</td></tr>`;
        renderDashboardSummary();
    }
}

/* ============================================================
   VIEW USER DETAILS (Manage Users)
============================================================ */
function openUserDetails(user) {
    window.__currentUserDetail = user;
    const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "—";
    const role = user.role || "—";
    const email = user.email_address || user.email || "—";
    const createdAt = user.created_at ? new Date(user.created_at) : null;
    const createdDate = createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })
        : "—";

    const isActive = isUserActive(user);
    const roleStyle = getRoleStyle(role);

    const content = document.getElementById("modalUserContent");
    if (content) {
        content.innerHTML = `
            <div><b>Name:</b> ${escapeHTML(fullName)}</div>
            <div><b>Email:</b> ${escapeHTML(email)}</div>
            <div><b>Role:</b> <span class="role ${roleStyle.cls}">${escapeHTML(roleStyle.label)}</span></div>
            <div><b>Status:</b> <span class="status-badge ${isActive ? "active" : "inactive"}">${isActive ? "Active" : "Inactive"}</span></div>
            <div><b>Date Created:</b> ${escapeHTML(createdDate)}</div>
        `;
    }

    const titleEl = document.getElementById("modalUserTitle");
    if (titleEl) titleEl.textContent = fullName;

    document.getElementById("userDetailModal")?.classList.add("show");
}

// Close handlers
document.getElementById("closeUserModalBtn")?.addEventListener("click", () => {
    document.getElementById("userDetailModal")?.classList.remove("show");
});
document.getElementById("closeUserModalX")?.addEventListener("click", () => {
    document.getElementById("userDetailModal")?.classList.remove("show");
});
document.getElementById("userDetailModal")?.addEventListener("click", (e) => {
    if (e.target.id === "userDetailModal") {
        e.target.classList.remove("show");
    }
});
/* ============================================================
   ROLE SUMMARY CARDS
============================================================ */
function updateRoleSummaryCards(users) {
    const counts = {
        "AEW": 0,
        "Municipal Coordinator": 0,
        "Provincial Coordinator": 0,
        "DA-RFO": 0
    };

    (users || []).forEach(user => {
        const role = user.role || "";
        // Match exact or alias
        if (role === "AEW" || role === "Agricultural Extension Worker") {
            counts["AEW"]++;
        } else if (role === "Municipal Coordinator" || role === "Municipal") {
            counts["Municipal Coordinator"]++;
        } else if (role === "Provincial Coordinator" || role === "Provincial") {
            counts["Provincial Coordinator"]++;
        } else if (role === "DA-RFO" || role === "DA-RFO Officer") {
            counts["DA-RFO"]++;
        }
    });

    const setCount = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setCount("countAEW", counts["AEW"]);
    setCount("countMunicipal", counts["Municipal Coordinator"]);
    setCount("countProvincial", counts["Provincial Coordinator"]);
    setCount("countDARFO", counts["DA-RFO"]);
}

const dashboardChartInstances = {};

function parseDashboardDate(value) {
    if (!value) return null;
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    const parsed = dateOnly
        ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
        : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function renderDashboardCharts() {
    const charts = [
        ["accountStatusChart", "accountStatusChartMessage"],
        ["accountsCreatedChart", "accountsCreatedChartMessage"]
    ];

    const showChartMessage = message => {
        charts.forEach(([canvasId, messageId]) => {
            const canvas = document.getElementById(canvasId);
            const messageEl = document.getElementById(messageId);
            if (canvas) canvas.hidden = true;
            if (messageEl) {
                messageEl.hidden = false;
                messageEl.textContent = message;
            }
            dashboardChartInstances[canvasId]?.destroy();
            delete dashboardChartInstances[canvasId];
        });
    };

    if (dashboardUsersLoading) {
        showChartMessage("Loading account analytics...");
        return;
    }
    if (dashboardUsersError) {
        showChartMessage("Account analytics are unavailable because account data could not be loaded.");
        return;
    }
    if (typeof Chart === "undefined") {
        showChartMessage("Charts are unavailable because the chart library could not be loaded.");
        return;
    }

    charts.forEach(([canvasId, messageId]) => {
        const canvas = document.getElementById(canvasId);
        const messageEl = document.getElementById(messageId);
        if (canvas) canvas.hidden = false;
        if (messageEl) messageEl.hidden = true;
    });

    const activeCount = cachedUsers.filter(isUserActive).length;
    const inactiveCount = cachedUsers.length - activeCount;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    monthStart.setMonth(monthStart.getMonth() - 11);

    const monthDates = Array.from({ length: 12 }, (_, index) =>
        new Date(monthStart.getFullYear(), monthStart.getMonth() + index, 1)
    );
    const monthKeys = monthDates.map(date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    const createdPerMonth = new Map(monthKeys.map(key => [key, 0]));

    cachedUsers.forEach(user => {
        const createdAt = parseDashboardDate(user.created_at);
        if (!createdAt) return;
        const key = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}`;
        if (createdPerMonth.has(key)) createdPerMonth.set(key, createdPerMonth.get(key) + 1);
    });

    const monthlyCounts = monthKeys.map(key => createdPerMonth.get(key));
    const monthLabels = monthDates.map(date => date.toLocaleDateString("en", { month: "short", year: "numeric" }));

    Object.values(dashboardChartInstances).forEach(chart => chart.destroy());
    Object.keys(dashboardChartInstances).forEach(key => delete dashboardChartInstances[key]);

    const statusCanvas = document.getElementById("accountStatusChart");
    const createdCanvas = document.getElementById("accountsCreatedChart");
    if (!statusCanvas || !createdCanvas) return;

    dashboardChartInstances.accountStatusChart = new Chart(statusCanvas, {
        type: "pie",
        data: {
            labels: ["Active", "Inactive"],
            datasets: [{
                data: [activeCount, inactiveCount],
                backgroundColor: ["#1c7549", "#d99a37"],
                borderColor: "#ffffff",
                borderWidth: 3
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom" } }
        }
    });

    dashboardChartInstances.accountsCreatedChart = new Chart(createdCanvas, {
        type: "bar",
        data: {
            labels: monthLabels,
            datasets: [{
                label: "Accounts created",
                data: monthlyCounts,
                backgroundColor: "#2e7d5b",
                borderRadius: 5
            }]
        },
        options: {
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
            plugins: { legend: { display: false } }
        }
    });
}

function renderDashboardSummary() {
    const setValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    if (dashboardUsersLoading) {
        ["dashboardTotalUsers", "dashboardActiveUsers", "dashboardInactiveUsers"].forEach(id => setValue(id, "—"));
    } else if (dashboardUsersError) {
        ["dashboardTotalUsers", "dashboardActiveUsers", "dashboardInactiveUsers"].forEach(id => setValue(id, "Unavailable"));
        ["countAEW", "countMunicipal", "countProvincial", "countDARFO"].forEach(id => setValue(id, "—"));
    } else {
        const activeCount = cachedUsers.filter(isUserActive).length;
        setValue("dashboardTotalUsers", cachedUsers.length);
        setValue("dashboardActiveUsers", activeCount);
        setValue("dashboardInactiveUsers", cachedUsers.length - activeCount);
    }
    renderDashboardCharts();

    const activityContainer = document.getElementById("dashboardRecentActivity");
    if (dashboardActivityLoading) {
        setValue("dashboardAuditCount", "—");
        if (activityContainer) activityContainer.innerHTML = `<p class="dashboard-empty-state">Loading activity...</p>`;
        return;
    }
    if (dashboardActivityError) {
        setValue("dashboardAuditCount", "Unavailable");
        if (activityContainer) activityContainer.innerHTML = `<p class="dashboard-empty-state">Unable to load recent activity.</p>`;
        return;
    }

    setValue("dashboardAuditCount", cachedAuditLogs.length);
    if (!activityContainer) return;
    const recentLogs = [...cachedAuditLogs]
        .sort((a, b) => parseServerDate(b.created_at ?? b.timestamp ?? 0).getTime() - parseServerDate(a.created_at ?? a.timestamp ?? 0).getTime())
        .slice(0, 5);

    if (recentLogs.length === 0) {
        activityContainer.innerHTML = `<p class="dashboard-empty-state">No recent activity recorded.</p>`;
        return;
    }

    activityContainer.innerHTML = recentLogs.map(log => {
        const userName = log.user_name ||
            (log.user ? `${log.user.first_name || ""} ${log.user.last_name || ""}`.trim() : "") ||
            "Account activity";
        const action = log.action || "System activity";
        const resource = log.resource_type ? `Resource: ${log.resource_type}` : userName;
        return `
            <article class="dashboard-activity-item">
                <div class="dashboard-activity-copy">
                    <strong>${escapeHTML(action)}</strong>
                    <span>${escapeHTML(resource)}</span>
                </div>
                <time>${escapeHTML(formatAuditDate(log.created_at ?? log.timestamp))}</time>
            </article>
        `;
    }).join("");
}

/* ============================================================
   ARCHIVED SUMMARY CARDS
============================================================ */
function updateArchivedSummaryCards(users) {
    const counts = {
        "AEW": 0,
        "Municipal Coordinator": 0,
        "Provincial Coordinator": 0,
        "DA-RFO": 0
    };

    (users || []).forEach(user => {
        const role = user.role || "";
        if (role === "AEW" || role === "Agricultural Extension Worker") {
            counts["AEW"]++;
        } else if (role === "Municipal Coordinator" || role === "Municipal") {
            counts["Municipal Coordinator"]++;
        } else if (role === "Provincial Coordinator" || role === "Provincial") {
            counts["Provincial Coordinator"]++;
        } else if (role === "DA-RFO" || role === "DA-RFO Officer") {
            counts["DA-RFO"]++;
        }
    });

    const setCount = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setCount("archivedCountTotal", (users || []).length);
    setCount("archivedCountAEW", counts["AEW"]);
    setCount("archivedCountMunicipal", counts["Municipal Coordinator"]);
    setCount("archivedCountProvincial", counts["Provincial Coordinator"]);
    setCount("archivedCountDARFO", counts["DA-RFO"]);
}

/* ============================================================
   TOGGLE USER STATUS
============================================================ */
async function toggleUserStatus(button) {
    const userId = button.dataset.userId;
    const currentStatus = button.dataset.active === "true";
    if (!userId) return;
    if (currentStatus && String(userId) === String(localStorage.getItem("user_id"))) {
        alert("You cannot deactivate your own account.");
        return;
    }


    const modal = document.getElementById("confirmStatusModal");
    const titleEl = document.getElementById("statusModalTitle");
    const descEl = document.getElementById("statusModalDesc");
    const finalBtn = document.getElementById("finalStatusBtn");
    const cancelBtn = document.getElementById("cancelStatusBtn");


    if (!modal) return;


    if (titleEl) titleEl.textContent = currentStatus ? "Confirm Deactivation" : "Confirm Reactivation";
    if (descEl) descEl.textContent = currentStatus ? "Are you sure you want to deactivate this user?" : "Are you sure you want to reactivate this user?";


    if (currentStatus) {
        finalBtn.className = "btn-primary btn-danger";
        finalBtn.textContent = "Deactivate";
    } else {
        finalBtn.className = "btn-primary";
        finalBtn.textContent = "Reactivate";
    }


    modal.classList.add("show");


    const newFinalBtn = finalBtn.cloneNode(true);
    finalBtn.parentNode.replaceChild(newFinalBtn, finalBtn);
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);


    document.getElementById("cancelStatusBtn").addEventListener("click", () => modal.classList.remove("show"));
    document.getElementById("finalStatusBtn").addEventListener("click", async () => {
        modal.classList.remove("show");
        button.disabled = true;
        button.textContent = "Updating...";


        try {
            const response = await fetch(`${API_BASE_URL}/api/users/${userId}/status`, {
                method: "PATCH",
                headers: getAuthHeaders(),
                body: JSON.stringify({ is_active: !currentStatus })
            });
            let data = {};
            try { data = await response.json(); } catch { data = {}; }
            if (response.status === 401) { handleUnauthorized(); return; }
            if (!response.ok) throw new Error(getErrorMessage(data, "Failed to update user status."));


            await loadUsers();
            await loadAuditLogs();
        } catch (error) {
            alert(error.message || "Unable to update user status.");
            button.disabled = false;
            button.textContent = currentStatus ? "Deactivate" : "Reactivate";
        }
    });
}


/* ============================================================
   ARCHIVE USER
============================================================ */
async function archiveUser(button) {
    const userId = button.dataset.userId;
    const userName = button.dataset.userName || "this user";
    if (!userId) return;
    if (String(userId) === String(localStorage.getItem("user_id"))) {
        alert("You cannot archive your own account.");
        return;
    }


    const modal = document.getElementById("confirmArchiveModal");
    const descEl = document.getElementById("archiveModalDesc");
    const finalBtn = document.getElementById("finalArchiveBtn");
    const cancelBtn = document.getElementById("cancelArchiveBtn");
    const remarksInput = document.getElementById("archiveRemarks");
    const remarksError = document.getElementById("archiveRemarksError");


    if (!modal) return;
    if (remarksInput) remarksInput.value = "";
    if (remarksError) remarksError.style.display = "none";
    if (descEl) descEl.textContent = `Are you sure you want to archive "${userName}"? They will be moved to the Archived Users list.`;


    modal.classList.add("show");


    const newFinalBtn = finalBtn.cloneNode(true);
    finalBtn.parentNode.replaceChild(newFinalBtn, finalBtn);
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);


    document.getElementById("cancelArchiveBtn").addEventListener("click", () => modal.classList.remove("show"));
    document.getElementById("finalArchiveBtn").addEventListener("click", async () => {
        const remarks = (document.getElementById("archiveRemarks")?.value || "").trim();
        if (!remarks) {
            if (remarksError) remarksError.style.display = "block";
            document.getElementById("archiveRemarks")?.focus();
            return;
        }


        modal.classList.remove("show");
        button.disabled = true;
        button.textContent = "Archiving...";


        try {
            const response = await fetch(`${API_BASE_URL}/api/users/${userId}/archive`, {
                method: "PATCH",
                headers: getAuthHeaders(),
                body: JSON.stringify({ is_archived: true, remarks: remarks })
            });
            let data = {};
            try { data = await response.json(); } catch { data = {}; }
            if (response.status === 401) { handleUnauthorized(); return; }
            if (!response.ok) throw new Error(getErrorMessage(data, "Failed to archive user."));


            const remainingOnPage = document.querySelectorAll("#userRows tr").length - 1;
            if (remainingOnPage <= 0 && currentUserPage > 1) currentUserPage--;


            await loadUsers();
            await loadArchivedUsers();
            await loadAuditLogs();
        } catch (error) {
            alert(error.message || "Unable to archive user.");
            button.disabled = false;
            button.textContent = "Archive";
        }
    });
}


/* ============================================================
   LOAD ARCHIVED USERS
============================================================ */
async function loadArchivedUsers() {
    const archivedRows = document.getElementById("archivedUserRows");
    if (!archivedRows) return;


    archivedRows.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading archived users...</td></tr>`;


    try {
        const response = await fetch(`${API_BASE_URL}/api/users/archived`, {
            method: "GET",
            headers: getAuthHeaders()
        });
        let data = {};
        try { data = await response.json(); } catch { data = {}; }


        if (response.status === 401) { handleUnauthorized(); return; }
        if (!response.ok) throw new Error(getErrorMessage(data, "Failed to load archived users."));


        let users = [];
        if (Array.isArray(data)) users = data;
        else if (Array.isArray(data.users)) users = data.users;
        else if (Array.isArray(data.data)) users = data.data;


        cachedArchivedUsers = users;
        updateArchivedSummaryCards(cachedArchivedUsers);


        if (cachedArchivedUsers.length === 0) {
            archivedRows.innerHTML = `<tr><td colspan="4" style="text-align:center;">No archived users found.</td></tr>`;
            renderPagination(0, archivedPerPage, currentArchivedPage, () => {}).updateUI("archivedPaginationInfo", "archivedPrevPageBtn", "archivedNextPageBtn", "archivedPageNumberBtns");
            return;
        }


        const pagination = renderPagination(cachedArchivedUsers.length, archivedPerPage, currentArchivedPage, (newPage) => {
            currentArchivedPage = newPage;
            loadArchivedUsers();
        });


       archivedRows.innerHTML = "";
pagination.paginatedSlice(cachedArchivedUsers).forEach(user => {
    const row = document.createElement("tr");
    const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "—";
    const role = user.role || "—";
    const archivedAt = formatAuditDate(user.archived_at ?? user.updated_at);
    const roleStyle = getRoleStyle(role);
    const userId = user.user_id ?? user.id ?? "";

    row.innerHTML = `
        <td><span class="name-pill">${escapeHTML(fullName)}</span></td>
        <td><span class="role ${roleStyle.cls}">${escapeHTML(roleStyle.label)}</span></td>
        <td><span class="status-badge inactive">${escapeHTML(archivedAt)}</span></td>
        <td>
            <button class="btn-reactivate" type="button" data-user-id="${escapeHTML(userId)}" data-user-name="${escapeHTML(fullName)}">
                Restore
            </button>
        </td>
    `;

    // ✅ Click listener para sa Archive Details — NASA LOOB ng forEach
    row.style.cursor = "pointer";
    row.addEventListener("click", (event) => {
        if (event.target.closest(".btn-reactivate")) return;
        openArchiveDetails(user);
    });

    archivedRows.appendChild(row);
});

  



        pagination.updateUI("archivedPaginationInfo", "archivedPrevPageBtn", "archivedNextPageBtn", "archivedPageNumberBtns");


        document.querySelectorAll("#archivedUserRows .btn-reactivate").forEach(button => {
            button.addEventListener("click", (e) => {
                e.stopPropagation();
                restoreUser(button);
            });
        });

        
    } catch (error) {
        archivedRows.innerHTML = `<tr><td colspan="4" class="api-error">Failed to load archived users.</td></tr>`;
    }
}


async function restoreUser(button) {
    const userId = button.dataset.userId;
    const userName = button.dataset.userName || "this user";
    if (!userId) return;


    const modal = document.getElementById("confirmRestoreModal");
    const descEl = document.getElementById("restoreModalDesc");
    const finalBtn = document.getElementById("finalRestoreBtn");
    const cancelBtn = document.getElementById("cancelRestoreBtn");


    if (!modal) return;
    if (descEl) descEl.textContent = `Are you sure you want to restore "${userName}" back to the active users list?`;


    modal.classList.add("show");


    const newFinalBtn = finalBtn.cloneNode(true);
    finalBtn.parentNode.replaceChild(newFinalBtn, finalBtn);
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);


    document.getElementById("cancelRestoreBtn").addEventListener("click", () => modal.classList.remove("show"));
    document.getElementById("finalRestoreBtn").addEventListener("click", async () => {
        modal.classList.remove("show");
        button.disabled = true;
        button.textContent = "Restoring...";


        try {
            const response = await fetch(`${API_BASE_URL}/api/users/${userId}/archive`, {
                method: "PATCH",
                headers: getAuthHeaders(),
                body: JSON.stringify({ is_archived: false })
            });
            let data = {};
            try { data = await response.json(); } catch { data = {}; }
            if (response.status === 401) { handleUnauthorized(); return; }
            if (!response.ok) throw new Error(getErrorMessage(data, "Failed to restore user."));


            await loadUsers();
            await loadArchivedUsers();
            await loadAuditLogs();
        } catch (error) {
            alert(error.message || "Unable to restore user.");
            button.disabled = false;
            button.textContent = "Restore";
        }
    });
}

/* ============================================================
   ARCHIVE DETAILS FULL PAGE
============================================================ */

let currentArchiveUser = null;

function openArchiveDetails(user) {

    const view = document.getElementById("view-archive-details");
    if (!view) return;

    const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "—";
    const username = user.username || "—";
    const role = user.role || "—";
    const locationParts = [user.municipality, user.province, user.region].filter(Boolean);
    const locationText = locationParts.length ? locationParts.join(", ") : "—";
    const archivedAt = formatAuditDate(user.archived_at ?? user.updated_at);
    const archivedBy = user.archived_by_name || "—";
    const remarks = user.archive_remarks || user.remarks || "No remarks provided.";

    const initials = (
        (user.first_name?.[0] || "") + (user.last_name?.[0] || "")
    ).toUpperCase() || "?";

    document.getElementById("archiveDetailInitials").textContent = initials;
    document.getElementById("archiveDetailName").textContent = fullName;
    document.getElementById("archiveDetailUsername").textContent = `@${username}`;
    document.getElementById("archiveDetailRole").textContent = role;
    document.getElementById("archiveDetailLocation").textContent = locationText;
    document.getElementById("archiveDetailArchivedAt").textContent = archivedAt;
    document.getElementById("archiveDetailArchivedBy").textContent = archivedBy;
    document.getElementById("archiveDetailRemarks").textContent = remarks;

    currentArchiveUser = user;

    if (window.switchView) window.switchView("archive-details");
    else {
        document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
        view.classList.add("active-view");
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ============================================================
   CREATE ACCOUNT
============================================================ */
const addAccountFieldErrors = {
    first_name: ["firstName", "firstNameError"],
    last_name: ["lastName", "lastNameError"],
    username: ["newUsername", "newUsernameError"],
    email_address: ["newEmail", "newEmailError"],
    password: ["newPassword", "passwordHint"],
    confirm_password: ["confirmPassword", "confirmPasswordHint"],
    phone_number: ["phoneNumber", "phoneNumberError"],
    role: ["roleSelect", "roleSelectError"],
    region: ["regionSelect", "regionSelectError"],
    province: ["provinceSelect", "provinceSelectError"],
    municipality: ["municipalitySelect", "municipalitySelectError"]
};

function setAddAccountFieldError(fieldName, message) {
    const field = addAccountFieldErrors[fieldName];
    if (!field) return false;
    const input = document.getElementById(field[0]);
    const error = document.getElementById(field[1]);
    if (error) {
        error.textContent = message;
        error.hidden = !message;
    }
    if (input) {
        input.setAttribute("aria-invalid", message ? "true" : "false");
    }
    return Boolean(input && error);
}

function clearAddAccountFieldError(fieldName) {
    const field = addAccountFieldErrors[fieldName];
    if (!field) return;
    const input = document.getElementById(field[0]);
    const error = document.getElementById(field[1]);
    if (input) input.removeAttribute("aria-invalid");
    if (error && fieldName !== "password") {
        error.textContent = "";
        error.hidden = true;
    }
}

function clearAddAccountErrors() {
    Object.keys(addAccountFieldErrors).forEach(clearAddAccountFieldError);
    const summary = document.getElementById("addAccountError");
    if (summary) {
        summary.textContent = "";
        summary.hidden = true;
    }
}

function validateAddAccountForm() {
    const form = document.getElementById("addAccountForm");
    if (!form) return false;
    clearAddAccountErrors();

    const firstName = document.getElementById("firstName");
    const lastName = document.getElementById("lastName");
    const username = document.getElementById("newUsername");
    const email = document.getElementById("newEmail");
    const password = document.getElementById("newPassword");
    const confirmPassword = document.getElementById("confirmPassword");
    const phone = document.getElementById("phoneNumber");
    const role = document.getElementById("roleSelect");
    const region = document.getElementById("regionSelect");
    const province = document.getElementById("provinceSelect");
    const municipality = document.getElementById("municipalitySelect");

    const errors = [];
    const addError = (name, message) => {
        setAddAccountFieldError(name, message);
        errors.push(name);
    };

    if (!firstName.value.trim()) addError("first_name", "Please enter a first name.");
    if (!lastName.value.trim()) addError("last_name", "Please enter a last name.");
    if (!username.value.trim()) addError("username", "Please enter a username.");
    if (!email.value.trim()) addError("email_address", "Please enter an email address.");
    else if (!email.checkValidity()) addError("email_address", "Please enter a valid email address.");

    if (getPasswordRequirements(password.value).length) {
        setAddAccountFieldError("password", getPasswordFeedback(password.value));
        errors.push("password");
    }
    if (!confirmPassword.value) addError("confirm_password", "Please confirm the password.");
    else if (password.value !== confirmPassword.value) addError("confirm_password", "Passwords do not match.");
    if (!phone.value.trim()) addError("phone_number", "Please enter a phone number.");
    else if (!/^\d{11}$/.test(phone.value.trim())) addError("phone_number", "Phone number must be exactly 11 digits (numbers only).");
    if (!role.value) addError("role", "Please select a role.");
    if (!region.value) addError("region", "Please select a region.");
    if (!province.disabled && !province.value) addError("province", "Please select a province.");
    if (!municipality.disabled && !municipality.value) addError("municipality", "Please select a municipality or city.");

    if (errors.length) {
        const firstInvalidField = addAccountFieldErrors[errors[0]];
        document.getElementById(firstInvalidField[0])?.focus();
        return false;
    }
    return true;
}

function showAddAccountApiErrors(data, fallback) {
    const summary = document.getElementById("addAccountError");
    const details = Array.isArray(data?.detail) ? data.detail : [data?.detail];
    let hasFieldError = false;
    const unmapped = [];

    details.filter(Boolean).forEach(detail => {
        const message = typeof detail === "string" ? detail : detail.msg || fallback;
        const location = typeof detail === "object" && Array.isArray(detail.loc)
            ? String(detail.loc[detail.loc.length - 1])
            : "";
        let fieldName = Object.keys(addAccountFieldErrors).find(key => key === location);
        const normalizedMessage = message.toLowerCase();
        if (!fieldName && normalizedMessage.includes("username")) fieldName = "username";
        if (!fieldName && normalizedMessage.includes("email")) fieldName = "email_address";
        if (!fieldName && normalizedMessage.includes("password")) fieldName = "password";
        if (!fieldName && normalizedMessage.includes("phone")) fieldName = "phone_number";

        if (fieldName && setAddAccountFieldError(fieldName, message)) {
            hasFieldError = true;
        } else {
            unmapped.push(message);
        }
    });

    if (unmapped.length || !hasFieldError) {
        if (summary) {
            summary.textContent = unmapped.join(" ") || fallback;
            summary.hidden = false;
        }
    }
    const firstInvalid = document.querySelector("#addAccountForm [aria-invalid='true']");
    firstInvalid?.focus();
}

function wireAddAccountInlineValidation() {
    const form = document.getElementById("addAccountForm");
    if (!form) return;

    const updateConfirmPasswordFeedback = () => {
        const password = document.getElementById("newPassword");
        const confirm = document.getElementById("confirmPassword");
        const hint = document.getElementById("confirmPasswordHint");
        if (!password || !confirm || !hint) return;
        const mismatch = Boolean(confirm.value) && confirm.value !== password.value;
        hint.textContent = mismatch ? "Passwords do not match." : "";
        hint.hidden = !mismatch;
        confirm.setAttribute("aria-invalid", mismatch ? "true" : "false");
    };

    Object.entries(addAccountFieldErrors).forEach(([name, [inputId]]) => {
        const input = document.getElementById(inputId);
        if (!input) return;
        const clear = () => {
            clearAddAccountFieldError(name);
            if (name === "password") updatePasswordFeedback();
            if (inputId === "confirmPassword") updateConfirmPasswordFeedback();
            const summary = document.getElementById("addAccountError");
            if (summary) {
                summary.textContent = "";
                summary.hidden = true;
            }
        };
        input.addEventListener("input", clear);
        input.addEventListener("change", clear);
    });

    const password = document.getElementById("newPassword");
    password?.addEventListener("focus", updatePasswordFeedback);
    password?.addEventListener("input", updatePasswordFeedback);
    password?.addEventListener("input", updateConfirmPasswordFeedback);
    document.getElementById("confirmPassword")?.addEventListener("input", updateConfirmPasswordFeedback);
}

async function createAccount(event) {
    event.preventDefault();
    const form = document.getElementById("addAccountForm");
    if (!form) return;
    if (!validateAddAccountForm()) return;


    const firstName = document.getElementById("firstName")?.value.trim();
    const lastName = document.getElementById("lastName")?.value.trim();
    const username = document.getElementById("newUsername")?.value.trim();
    const email = document.getElementById("newEmail")?.value.trim();
    const password = document.getElementById("newPassword")?.value;
    const confirmPassword = document.getElementById("confirmPassword")?.value;
    const phone = document.getElementById("phoneNumber")?.value.trim();
    const role = document.getElementById("roleSelect")?.value;


    const regionSelect = document.getElementById("regionSelect");
    const provinceSelect = document.getElementById("provinceSelect");
    const municipalitySelect = document.getElementById("municipalitySelect");


    const regionCode = regionSelect?.value;
    const municipalityCode = municipalitySelect?.value;
    const regionName = regionSelect?.selectedOptions[0]?.textContent?.trim() || "";
    const provinceName = provinceSelect?.selectedOptions[0]?.textContent?.trim() || "";
    const municipalityName = municipalitySelect?.selectedOptions[0]?.textContent?.trim() || "";


    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Creating...";
    }


    try {
        const response = await fetch(`${API_BASE_URL}/api/users`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
                first_name: firstName,
                last_name: lastName,
                username: username,
                email_address: email,
                phone_number: phone,
                role: role,
                password: password,
                region: regionName,
                province: provinceName,
                municipality: municipalityName
            })
        });


        let data = {};
        try { data = await response.json(); } catch { data = {}; }
        if (response.status === 401) { handleUnauthorized(); return; }
        if (!response.ok) {
            showAddAccountApiErrors(data, getErrorMessage(data, "Failed to create account."));
            return;
        }


        form.reset();
        clearAddAccountErrors();
        updatePasswordFeedback();
        resetLocationDropdowns();


        window.switchView?.("users");


        await loadUsers();
        await loadAuditLogs();
    } catch (error) {
        const summary = document.getElementById("addAccountError");
        if (summary) {
            summary.textContent = error.message || "Unable to create account.";
            summary.hidden = false;
        }
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Create Account";
        }
    }
}


/* ============================================================
   AUDIT LOGS & FILTERING (Date & Action)
============================================================ */
async function loadAuditLogs() {
    const auditLogRows = document.getElementById("auditLogRows");
    if (!auditLogRows) return;


    auditLogRows.innerHTML = `<tr><td colspan="5" style="text-align:center;">Loading audit logs...</td></tr>`;
    dashboardActivityLoading = true;
    dashboardActivityError = null;
    renderDashboardSummary();


    try {
        const response = await fetch(`${API_BASE_URL}/api/audit-logs`, {
            method: "GET",
            headers: getAuthHeaders()
        });
        let data = {};
        try { data = await response.json(); } catch { data = {}; }


        if (response.status === 401) { handleUnauthorized(); return; }
        if (response.status === 403) {
            dashboardActivityError = getErrorMessage(data, "You do not have permission to view audit logs.");
            dashboardActivityLoading = false;
            auditLogRows.innerHTML = `<tr><td colspan="5" class="api-error">${escapeHTML(getErrorMessage(data, "You do not have permission to view audit logs."))}</td></tr>`;
            renderDashboardSummary();
            return;
        }
        if (!response.ok) throw new Error(getErrorMessage(data, "Failed to load audit logs."));


        let logs = [];
        if (Array.isArray(data)) logs = data;
        else if (Array.isArray(data.logs)) logs = data.logs;
        else if (Array.isArray(data.data)) logs = data.data;
        else throw new Error("Unexpected audit log response format.");


        cachedAuditLogs = logs;
        dashboardActivityLoading = false;
        populateAuditActionDropdown(cachedAuditLogs);
        renderFilteredAuditLogs();
        renderDashboardSummary();


    } catch (error) {
        dashboardActivityError = error.message || "Failed to load audit logs.";
        dashboardActivityLoading = false;
        auditLogRows.innerHTML = `<tr><td colspan="5" class="api-error">Failed to load audit logs.<br><br>${escapeHTML(error.message)}</td></tr>`;
        renderDashboardSummary();
    }
}


function populateAuditActionDropdown(logs) {
    const actionSelect = document.getElementById("filterAuditAction");
    if (!actionSelect) return;


    const currentVal = actionSelect.value;
    const actions = [...new Set(logs.map(log => log.action).filter(Boolean))].sort();


    actionSelect.innerHTML = `<option value="">All Actions</option>`;
    actions.forEach(action => {
        const opt = document.createElement("option");
        opt.value = action;
        opt.textContent = action;
        actionSelect.appendChild(opt);
    });
    actionSelect.value = currentVal;
}


function renderFilteredAuditLogs() {
    const auditLogRows = document.getElementById("auditLogRows");
    if (!auditLogRows) return;


    const searchInput = document.getElementById("searchAudit")?.value.trim().toLowerCase() || "";
    const actionFilter = document.getElementById("filterAuditAction")?.value || "";
    const dateFilter = document.getElementById("filterAuditDate")?.value || "";


    const filteredLogs = cachedAuditLogs.filter(log => {
        // Search text check across log details
        const logIdStr = String(log.log_id ?? log.id ?? "").toLowerCase();
        let userName = log.user_name || "";
        if (!userName && log.user) {
            userName = `${log.user.first_name || ""} ${log.user.last_name || ""}`.trim();
        }
        const actionStr = String(log.action ?? "").toLowerCase();
        const createdAtStr = String(log.created_at ?? log.timestamp ?? "");


        const matchesSearch = !searchInput ||
            logIdStr.includes(searchInput) ||
            userName.toLowerCase().includes(searchInput) ||
            actionStr.includes(searchInput) ||
            createdAtStr.toLowerCase().includes(searchInput);


        // Action filter check
        const matchesAction = !actionFilter || log.action === actionFilter;


        // Date filter check (compare YYYY-MM-DD format)
        let matchesDate = true;
        if (dateFilter) {
            const logDateVal = log.created_at ?? log.timestamp;
            if (logDateVal) {
                const logDateOnly = auditDateKey(logDateVal);
                matchesDate = (logDateOnly === dateFilter);
            } else {
                matchesDate = false;
            }
        }


        return matchesSearch && matchesAction && matchesDate;
    });


    if (filteredLogs.length === 0) {
        auditLogRows.innerHTML = `<tr><td colspan="5" style="text-align:center;">No matching audit logs found.</td></tr>`;
        renderPagination(0, auditPerPage, currentAuditPage, () => {}).updateUI("auditPaginationInfo", "auditPrevPageBtn", "auditNextPageBtn", "auditPageNumberBtns");
        return;
    }


    const pagination = renderPagination(filteredLogs.length, auditPerPage, currentAuditPage, (newPage) => {
        currentAuditPage = newPage;
        renderFilteredAuditLogs();
    });


    auditLogRows.innerHTML = "";
    pagination.paginatedSlice(filteredLogs).forEach(log => {
        const row = document.createElement("tr");
        const logId = log.log_id ?? log.id ?? "—";
        let userName = log.user_name;
        if (!userName && log.user) {
            userName = `${log.user.first_name || ""} ${log.user.last_name || ""}`.trim() || null;
        }
        if (!userName) userName = `User #${log.user_id ?? "—"}`;


        const action = log.action ?? "—";
        const createdAt = formatAuditDate(log.created_at ?? log.timestamp);


        row.innerHTML = `
            <td>${escapeHTML(logId)}</td>
            <td>${escapeHTML(userName)}</td>
            <td><span class="role" style="background: var(--green-light); color: var(--green-dark);">${escapeHTML(action)}</span></td>
            <td>${escapeHTML(createdAt)}</td>
            <td>
                <button type="button" class="action-btn audit-view-btn" data-log-id="${escapeHTML(logId)}">
                    View
                </button>
            </td>
        `;
        auditLogRows.appendChild(row);
    });


    pagination.updateUI("auditPaginationInfo", "auditPrevPageBtn", "auditNextPageBtn", "auditPageNumberBtns");
   

// ✅ Re-bind Next/Prev buttons para sa Audit Logs
const auditPrevBtn = document.getElementById("auditPrevPageBtn");
const auditNextBtn = document.getElementById("auditNextPageBtn");

if (auditPrevBtn) {
    const newPrev = auditPrevBtn.cloneNode(true);
    auditPrevBtn.parentNode.replaceChild(newPrev, auditPrevBtn);
    newPrev.addEventListener("click", () => {
        if (currentAuditPage > 1) {
            currentAuditPage--;
            renderFilteredAuditLogs();
        }
    });
}

if (auditNextBtn) {
    const newNext = auditNextBtn.cloneNode(true);
    auditNextBtn.parentNode.replaceChild(newNext, auditNextBtn);
    newNext.addEventListener("click", () => {
        const searchInput = document.getElementById("searchAudit")?.value.trim().toLowerCase() || "";
        const actionFilter = document.getElementById("filterAuditAction")?.value || "";
        const dateFilter = document.getElementById("filterAuditDate")?.value || "";

        const filteredLogs = cachedAuditLogs.filter(log => {
            const logIdStr = String(log.log_id ?? log.id ?? "").toLowerCase();
            let userName = log.user_name || "";
            if (!userName && log.user) {
                userName = `${log.user.first_name || ""} ${log.user.last_name || ""}`.trim();
            }
            const actionStr = String(log.action ?? "").toLowerCase();
            const createdAtStr = String(log.created_at ?? log.timestamp ?? "");

            const matchesSearch = !searchInput ||
                logIdStr.includes(searchInput) ||
                userName.toLowerCase().includes(searchInput) ||
                actionStr.includes(searchInput) ||
                createdAtStr.toLowerCase().includes(searchInput);

            const matchesAction = !actionFilter || log.action === actionFilter;

            let matchesDate = true;
            if (dateFilter) {
                const logDateVal = log.created_at ?? log.timestamp;
                if (logDateVal) {
                    const logDateOnly = auditDateKey(logDateVal);
                    matchesDate = (logDateOnly === dateFilter);
                } else {
                    matchesDate = false;
                }
            }

            return matchesSearch && matchesAction && matchesDate;
        });

        const totalPages = Math.ceil(filteredLogs.length / auditPerPage) || 1;
        if (currentAuditPage < totalPages) {
            currentAuditPage++;
            renderFilteredAuditLogs();
        }
    });
}

    

    document.querySelectorAll("#auditLogRows .audit-view-btn").forEach(button => {
        button.addEventListener("click", () => viewAuditLog(button.dataset.logId));
    });
}


// The API returns UTC timestamps, sometimes without a timezone suffix; treat those as UTC.
function parseServerDate(value) {
    if (value instanceof Date) return value;
    const text = String(value).trim();
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(text);
    const isoLike = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text);
    return new Date(isoLike && !hasZone ? text.replace(" ", "T") + "Z" : text);
}

function auditDateKey(value) {
    const date = parseServerDate(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(date);
}

function formatAuditDate(value) {
    if (!value) return "—";
    const date = parseServerDate(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric", month: "short", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
}

async function viewAuditLog(logId) {
    if (!logId) return;


    try {
        const response = await fetch(`${API_BASE_URL}/api/audit-logs/${logId}`, {
            method: "GET",
            headers: getAuthHeaders()
        });
        let data = {};
        try { data = await response.json(); } catch { data = {}; }


        if (response.status === 401) { handleUnauthorized(); return; }
        if (!response.ok) throw new Error(getErrorMessage(data, "Failed to load audit log."));


        const oldValues = data.old_values ? JSON.stringify(data.old_values, null, 2) : "None";
        const newValues = data.new_values ? JSON.stringify(data.new_values, null, 2) : "None";


        const contentContainer = document.getElementById("modalAuditContent");
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div><b>Log ID:</b> ${escapeHTML(data.log_id ?? "—")}</div>
                <div><b>User ID:</b> ${escapeHTML(data.user_id ?? "—")}</div>
                <div><b>Action:</b> <span class="role" style="background: var(--green-light); color: var(--green-dark);">${escapeHTML(data.action ?? "—")}</span></div>
                <div><b>Resource Type:</b> ${escapeHTML(data.resource_type ?? "—")}</div>
                <div><b>Resource ID:</b> ${escapeHTML(data.resource_id ?? "—")}</div>
                <div><b>Created At:</b> ${escapeHTML(formatAuditDate(data.created_at))}</div>
                <div><b>IP Address:</b> ${escapeHTML(data.ip_address ?? "—")}</div>
                <div><b>User Agent:</b> ${escapeHTML(data.user_agent ?? "—")}</div>
                <div style="margin-top: 4px;"><b>Old Values:</b><pre style="background: #F6F3EB; padding: 8px; border-radius: 6px; font-size: 12px; margin-top: 4px; overflow-x: auto;">${escapeHTML(oldValues)}</pre></div>
                <div style="margin-top: 4px;"><b>New Values:</b><pre style="background: #F6F3EB; padding: 8px; border-radius: 6px; font-size: 12px; margin-top: 4px; overflow-x: auto;">${escapeHTML(newValues)}</pre></div>
            `;
        }


        document.getElementById("auditDetailModal")?.classList.add("show");
    } catch (error) {
        alert(error.message || "Unable to load audit log.");
    }
}


/* ============================================================
   SIDEBAR & SEARCH INITIALIZATION
============================================================ */
function initHoverSidebar() {
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const sidebar = document.getElementById("sidebar");
    if (!hamburgerBtn || !sidebar) return;


    let hoverTimer = null;
    hamburgerBtn.addEventListener("mouseenter", () => {
        if (hoverTimer) clearTimeout(hoverTimer);
        sidebar.classList.add("open");
    });
    sidebar.addEventListener("mouseenter", () => {
        if (hoverTimer) clearTimeout(hoverTimer);
    });
    sidebar.addEventListener("mouseleave", () => {
        hoverTimer = setTimeout(() => sidebar.classList.remove("open"), 200);
    });
    document.addEventListener("click", (event) => {
        if (!sidebar.contains(event.target) && !hamburgerBtn.contains(event.target)) {
            sidebar.classList.remove("open");
        }
    });
}

/* ============================================================
   PASSWORD VALIDATION
============================================================ */
function validatePassword(password) {
    return getPasswordRequirements(password).length ? getPasswordFeedback(password) : null;
}

function getPasswordRequirements(password) {
    const characters = [...password];
    return [
        [characters.length >= 8, "at least 8 characters"],
        [characters.length <= 32, "no more than 32 characters"],
        [/\p{Lu}/u.test(password), "at least one uppercase letter"],
        [/\p{Ll}/u.test(password), "at least one lowercase letter"],
        [/\p{N}/u.test(password), "at least one number"],
        [/[^\p{L}\p{N}]/u.test(password), "at least one special character"]
    ].filter(([met]) => !met).map(([, description]) => description);
}

function getPasswordFeedback(password) {
    const unmet = getPasswordRequirements(password);
    return unmet.length
        ? `Password must contain ${unmet.join(", ")}.`
        : "Password requirements met.";
}

function updatePasswordFeedback() {
    const password = document.getElementById("newPassword");
    const hint = document.getElementById("passwordHint");
    if (!password || !hint) return;
    const unmet = getPasswordRequirements(password.value);
    hint.textContent = getPasswordFeedback(password.value);
    if (document.activeElement === password || password.value) {
        password.setAttribute("aria-invalid", unmet.length ? "true" : "false");
    } else {
        password.removeAttribute("aria-invalid");
    }
}
/* ============================================================
   EDIT USER DETAILS (CRUD - Update)
============================================================ */
let currentEditingUserId = null;

async function openEditUserForm(user) {
    currentEditingUserId = user.user_id ?? user.id ?? null;
    if (!currentEditingUserId) {
        alert("Cannot edit: User ID not found.");
        return;
    }

    // Fill text fields
    document.getElementById("editFirstName").value = user.first_name || "";
    document.getElementById("editLastName").value = user.last_name || "";
    document.getElementById("editUsername").value = user.username || "";
    document.getElementById("editEmail").value = user.email_address || user.email || "";
    document.getElementById("editPhone").value = user.phone_number || user.phone || "";
    document.getElementById("editRole").value = user.role || "";

    // Toggle views
    document.getElementById("modalUserContent").style.display = "none";
    document.getElementById("userModalViewActions").style.display = "none";
    document.getElementById("editUserForm").style.display = "block";

    // ✅ Load location dropdowns and pre-select current values
    await loadEditLocationDropdowns(user);
}

function closeEditUserForm() {
    document.getElementById("editUserForm").style.display = "none";
    document.getElementById("modalUserContent").style.display = "flex";
    document.getElementById("userModalViewActions").style.display = "flex";
    currentEditingUserId = null;

    // ✅ Reset location dropdowns
    const regionSelect = document.getElementById("editRegionSelect");
    const provinceSelect = document.getElementById("editProvinceSelect");
    const municipalitySelect = document.getElementById("editMunicipalitySelect");

    if (regionSelect) regionSelect.selectedIndex = 0;
    if (provinceSelect) {
        provinceSelect.innerHTML = `<option value="" disabled selected>Select a province</option>`;
        provinceSelect.disabled = true;
    }
    if (municipalitySelect) {
        municipalitySelect.innerHTML = `<option value="" disabled selected>Select a municipality</option>`;
        municipalitySelect.disabled = true;
    }
}

async function saveUserEdits(event) {
    event.preventDefault();
    if (!currentEditingUserId) return;

    const firstName = document.getElementById("editFirstName").value.trim();
    const lastName = document.getElementById("editLastName").value.trim();
    const username = document.getElementById("editUsername").value.trim();
    const email = document.getElementById("editEmail").value.trim();
    const phone = document.getElementById("editPhone").value.trim();
    const role = document.getElementById("editRole").value;

    // ✅ Kunin ang NAME (hindi code) mula sa selected option
    const regionSelect = document.getElementById("editRegionSelect");
    const provinceSelect = document.getElementById("editProvinceSelect");
    const municipalitySelect = document.getElementById("editMunicipalitySelect");

    const region = regionSelect?.selectedOptions[0]?.dataset.name || regionSelect?.selectedOptions[0]?.textContent?.trim() || "";
    const province = provinceSelect?.selectedOptions[0]?.dataset.name || provinceSelect?.selectedOptions[0]?.textContent?.trim() || "";
    const municipality = municipalitySelect?.selectedOptions[0]?.dataset.name || municipalitySelect?.selectedOptions[0]?.textContent?.trim() || "";

    // Validation
    if (!firstName || !lastName || !username || !email || !phone || !role) {
        alert("Please fill in all required fields.");
        return;
    }
    if (!region || !municipality) {
        alert("Please select Region and Municipality/City.");
        return;
    }
    if (!/^\d{11}$/.test(phone)) {
        alert("Phone number must be exactly 11 digits (numbers only).");
        return;
    }
    const saveBtn = document.getElementById("saveEditUserBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
        const payload = {
            first_name: firstName,
            last_name: lastName,
            username: username,
            email_address: email,
            phone_number: phone,
            role: role,
            region: region,
            province: province,
            municipality: municipality
        };

        let response = await fetch(`${API_BASE_URL}/api/users/${currentEditingUserId}`, {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        // Fallback to PATCH if PUT is not supported
        if (response.status === 405 || response.status === 404) {
            response = await fetch(`${API_BASE_URL}/api/users/${currentEditingUserId}`, {
                method: "PATCH",
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });
        }

        let data = {};
        try { data = await response.json(); } catch { data = {}; }

        if (response.status === 401) { handleUnauthorized(); return; }
        if (!response.ok) throw new Error(getErrorMessage(data, "Failed to update user."));

        // Update cache
        const idx = cachedUsers.findIndex(u => (u.user_id ?? u.id) == currentEditingUserId);
        if (idx !== -1) {
            cachedUsers[idx] = {
                ...cachedUsers[idx],
                ...data,
                first_name: firstName,
                last_name: lastName,
                username,
                email_address: email,
                phone_number: phone,
                role,
                region,
                province,
                municipality
            };
        }

        await loadUsers();
        await loadAuditLogs();

        closeEditUserForm();
        document.getElementById("userDetailModal")?.classList.remove("show");

        alert("User details updated successfully!");
    } catch (error) {
        alert(error.message || "Unable to update user details.");
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Changes";
    }
}
/* ============================================================
   EDIT USER — Location Dropdowns (Region / Province / Municipality)
============================================================ */
async function loadEditLocationDropdowns(user) {
    const regionSelect = document.getElementById("editRegionSelect");
    const provinceSelect = document.getElementById("editProvinceSelect");
    const municipalitySelect = document.getElementById("editMunicipalitySelect");

    if (!regionSelect || !provinceSelect || !municipalitySelect) return;

    // Reset
    regionSelect.innerHTML = `<option value="" disabled selected>Loading regions...</option>`;
    regionSelect.disabled = true;
    provinceSelect.innerHTML = `<option value="" disabled selected>Select a province</option>`;
    provinceSelect.disabled = true;
    municipalitySelect.innerHTML = `<option value="" disabled selected>Select a municipality</option>`;
    municipalitySelect.disabled = true;

    try {
        // 1️⃣ Load all regions
        const regions = await fetchRegions();
        regionSelect.innerHTML = `<option value="" disabled selected>Select a region</option>`;
        regions.forEach(r => {
            const opt = document.createElement("option");
            opt.value = r.code;
            opt.textContent = r.name;
            opt.dataset.name = r.name; // ✅ store name for later
            regionSelect.appendChild(opt);
        });
        regionSelect.disabled = false;

        // 2️⃣ Pre-select the user's region (match by name)
        const userRegionName = user.region || "";
        const matchedRegion = regions.find(r => sameLocationName(r.name, userRegionName));
        if (matchedRegion) {
            regionSelect.value = matchedRegion.code;

            // 3️⃣ Load provinces of that region
            const provinces = await fetchProvinces(matchedRegion.code);
            provinceSelect.innerHTML = `<option value="" disabled selected>Select a province</option>`;
            provinces.forEach(p => {
                const opt = document.createElement("option");
                opt.value = p.code;
                opt.textContent = p.name;
                opt.dataset.name = p.name;
                provinceSelect.appendChild(opt);
            });
            if (provinces.length === 0) {
                // Region has no provinces (e.g., NCR) — load municipalities directly
                const municipalities = await fetchMunicipalitiesFromRegion(matchedRegion.code);
                municipalitySelect.innerHTML = `<option value="" disabled selected>Select a municipality / city</option>`;
                municipalities.forEach(m => {
                    const opt = document.createElement("option");
                    opt.value = m.code;
                    opt.textContent = m.name;
                    opt.dataset.name = m.name;
                    municipalitySelect.appendChild(opt);
                });
                municipalitySelect.disabled = false;
                municipalitySelect.selectedIndex = 0;
            } else {
                provinceSelect.disabled = false;
                // Province and municipality intentionally remain unselected.
                // The editor must make an explicit location choice.
                provinceSelect.selectedIndex = 0;
                municipalitySelect.innerHTML = `<option value="" disabled selected>Select a province first</option>`;
                municipalitySelect.disabled = true;
            }
        }
    } catch (err) {
        console.error("Failed to load edit location dropdowns:", err);
        regionSelect.innerHTML = `<option value="" selected>Location service unavailable — retry</option>`;
        regionSelect.disabled = false;
        provinceSelect.innerHTML = `<option value="" selected>Choose a region first</option>`;
        provinceSelect.disabled = true;
        municipalitySelect.innerHTML = `<option value="" selected>Choose a province first</option>`;
        municipalitySelect.disabled = true;
    }
}
/* ============================================================
   PROFILE & AVATAR PERSISTENCE (System Admin)
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
        const savedName = localStorage.getItem("user_display_name");
        if (savedName) {
            const displayNameEl = document.getElementById("loggedInUserName");
            if (displayNameEl) displayNameEl.textContent = savedName;
        }

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

        if (profileFirstName) profileFirstName.value = currentSessionUser?.first_name || "";
        if (profileLastName) profileLastName.value = currentSessionUser?.last_name || "";

        if (profileUsername) {
            profileUsername.value = currentSessionUser?.username || localStorage.getItem("username") || "sysadmin";
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
    profileForm?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const fName = profileFirstName.value.trim();
        const lName = profileLastName.value.trim();

        if (!fName || !lName) {
            showCustomAlert("First name and last name are required.");
            return;
        }

        const userId = currentSessionUser?.user_id || localStorage.getItem("user_id");
        if (!userId) {
            showCustomAlert("Unable to identify the signed-in account. Please sign in again.");
            return;
        }

        const saveButton = profileForm.querySelector('button[type="submit"]');
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = "Saving...";
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    first_name: fName,
                    last_name: lName,
                })
            });
            let data = {};
            try { data = await response.json(); } catch { data = {}; }
            if (response.status === 401) { handleUnauthorized(); return; }
            if (!response.ok) throw new Error(getErrorMessage(data, "Failed to save profile."));

            currentSessionUser = { ...currentSessionUser, ...data };
            initializeLoggedInUser(currentSessionUser);
            localStorage.setItem("user_avatar_src", currentSelectedSrc);
            loadSavedProfile();
            profileModal.classList.remove("show");
            showCustomAlert("Profile updated and saved successfully!");
        } catch (error) {
            showCustomAlert(error.message || "Unable to save profile.");
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = "Save Changes";
            }
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    const sessionUser = await window.ESakaAuth?.getSession();
    currentSessionUser = sessionUser;
    if (!initializeLoggedInUser(sessionUser)) return;
    if (!checkAdminRole()) return;
    /* ============================================================
   PASSWORD TOGGLE (Show/Hide)
============================================================ */
document.addEventListener("click", (e) => {
    const btn = e.target.closest(".toggle-password");
    if (!btn) return;

    e.preventDefault();
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;

    const isHidden = input.type === "password";
input.type = isHidden ? "text" : "password";

const eyeOpen = btn.querySelector(".eye-open");
const eyeClosed = btn.querySelector(".eye-closed");
if (eyeOpen) eyeOpen.style.display = isHidden ? "block" : "none";
if (eyeClosed) eyeClosed.style.display = isHidden ? "none" : "block";
});
    /* ============================================================
   EDIT USER — Location Dropdown Change Listeners
============================================================ */
function initEditLocationDropdownListeners() {
    const regionSelect = document.getElementById("editRegionSelect");
    const provinceSelect = document.getElementById("editProvinceSelect");
    const municipalitySelect = document.getElementById("editMunicipalitySelect");

    if (!regionSelect || !provinceSelect || !municipalitySelect) return;

    // Region change → load provinces
    regionSelect.addEventListener("change", async () => {
        const regionCode = regionSelect.value;
        provinceSelect.innerHTML = `<option value="" disabled selected>Loading...</option>`;
        provinceSelect.disabled = true;
        municipalitySelect.innerHTML = `<option value="" disabled selected>Select a municipality</option>`;
        municipalitySelect.disabled = true;

        if (!regionCode) return;

        try {
            const provinces = await fetchProvinces(regionCode);
            if (provinces.length === 0) {
                // No provinces (e.g., NCR) → load municipalities directly
                provinceSelect.innerHTML = `<option value="" disabled selected>N/A (no provinces)</option>`;
                const municipalities = await fetchMunicipalitiesFromRegion(regionCode);
                municipalitySelect.innerHTML = `<option value="" disabled selected>Select a municipality / city</option>`;
                municipalities.forEach(m => {
                    const opt = document.createElement("option");
                    opt.value = m.code;
                    opt.textContent = m.name;
                    opt.dataset.name = m.name;
                    municipalitySelect.appendChild(opt);
                });
                municipalitySelect.disabled = false;
                return;
            }

            provinceSelect.innerHTML = `<option value="" disabled selected>Select a province</option>`;
            provinces.forEach(p => {
                const opt = document.createElement("option");
                opt.value = p.code;
                opt.textContent = p.name;
                opt.dataset.name = p.name;
                provinceSelect.appendChild(opt);
            });
            provinceSelect.disabled = false;
        } catch (err) {
            provinceSelect.innerHTML = `<option value="" disabled selected>Failed to load</option>`;
        }
    });

    // Province change → load municipalities
    provinceSelect.addEventListener("change", async () => {
        const provinceCode = provinceSelect.value;
        municipalitySelect.innerHTML = `<option value="" disabled selected>Loading...</option>`;
        municipalitySelect.disabled = true;

        if (!provinceCode) return;

        try {
            const municipalities = await fetchMunicipalities(provinceCode);
            municipalitySelect.innerHTML = `<option value="" disabled selected>Select a municipality / city</option>`;
            municipalities.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m.code;
                opt.textContent = m.name;
                opt.dataset.name = m.name;
                municipalitySelect.appendChild(opt);
            });
            municipalitySelect.disabled = false;
        } catch (err) {
            municipalitySelect.innerHTML = `<option value="" disabled selected>Failed to load</option>`;
        }
    });
}
/* EDIT USER - Wire up buttons */
document.getElementById("editUserBtn")?.addEventListener("click", () => {
    // Rebuild current user object from the modal's displayed content
    // (openUserDetails already stored it — we need to store the user object)
    if (window.__currentUserDetail) {
        openEditUserForm(window.__currentUserDetail);
    }
});

document.getElementById("cancelEditUserBtn")?.addEventListener("click", closeEditUserForm);

document.getElementById("editUserForm")?.addEventListener("submit", saveUserEdits);


    if (typeof initViewSwitching === "function") initViewSwitching();
    if (typeof initHoverSidebar === "function") initHoverSidebar();


    loadUsers();
    loadAuditLogs();
    loadArchivedUsers();
    initializeLocationDropdowns();
    initEditLocationDropdownListeners();
    initProfileModal(); 
        /* ============================================================
       USER DETAIL MODAL — Close Handlers
    ============================================================ */
    const userDetailModal = document.getElementById("userDetailModal");
    const closeUserModalBtn = document.getElementById("closeUserModalBtn");
    const closeUserModalX = document.getElementById("closeUserModalX");

    closeUserModalBtn?.addEventListener("click", () => {
        userDetailModal?.classList.remove("show");
    });

    closeUserModalX?.addEventListener("click", () => {
        userDetailModal?.classList.remove("show");
    });

    // Close kapag click sa overlay (labas ng modal box)
    userDetailModal?.addEventListener("click", (e) => {
        if (e.target === userDetailModal) {
            userDetailModal.classList.remove("show");
        }
    });

    // Close kapag pinindot ang ESC key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && userDetailModal?.classList.contains("show")) {
            userDetailModal.classList.remove("show");
        }
    });

    /* ARCHIVE DETAILS — Back to Archived Users */
const backBtn2 = document.getElementById("backToArchivedBtn2");

function goBackToArchived() {
    if (window.switchView) {
        window.switchView("archived");
        return;
    }
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
    const archivedView = document.getElementById("view-archived");
    if (archivedView) archivedView.classList.add("active-view");

    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    document.querySelector('.nav-item[data-view="archived"]')?.classList.add("active");
}

if (backBtn2) backBtn2.addEventListener("click", goBackToArchived);

/* ARCHIVE DETAILS — Restore from details page */
const restoreFromDetailsBtn = document.getElementById("restoreFromDetailsBtn");
if (restoreFromDetailsBtn) {
    restoreFromDetailsBtn.addEventListener("click", () => {
        if (!currentArchiveUser) return;

        const fakeBtn = document.createElement("button");
        fakeBtn.dataset.userId = currentArchiveUser.user_id ?? currentArchiveUser.id;
        fakeBtn.dataset.userName =
            `${currentArchiveUser.first_name || ""} ${currentArchiveUser.last_name || ""}`.trim();

        restoreUser(fakeBtn);
    });
}

    // Search and Filter Listeners
    document.getElementById("searchUsers")?.addEventListener("input", () => {
        currentUserPage = 1;
        renderUsersTable();
    });
    document.getElementById("userStatusFilter")?.addEventListener("change", () => {
        currentUserPage = 1;
        renderUsersTable();
    });

    // ✅ IDAGDAG ITO — Archived Users search
document.getElementById("searchArchived")?.addEventListener("input", (e) => {
    const search = e.target.value.trim().toLowerCase();
    let visibleCount = 0;

    document.querySelectorAll("#archivedUserRows tr").forEach(row => {
        // Skip placeholder rows
        if (row.querySelector("td[colspan]")) return;

        const text = row.textContent.toLowerCase();
        const match = !search || text.includes(search);
        row.style.display = match ? "" : "none";
        if (match) visibleCount++;
    });

    // Show/hide "No results" message
    const tbody = document.getElementById("archivedUserRows");
    if (!tbody) return;

    let emptyRow = tbody.querySelector(".archived-empty-row");

    if (visibleCount === 0 && search) {
        if (!emptyRow) {
            emptyRow = document.createElement("tr");
            emptyRow.className = "archived-empty-row";
            emptyRow.innerHTML = `
                <td colspan="4" style="padding:30px; text-align:center; color:#999;">
                    No archived users found matching "<b>${escapeHTML(search)}</b>".
                </td>
            `;
            tbody.appendChild(emptyRow);
        } else {
            emptyRow.querySelector("td").innerHTML = `
                No archived users found matching "<b>${escapeHTML(search)}</b>".
            `;
            emptyRow.style.display = "";
        }
    } else if (emptyRow) {
        emptyRow.style.display = "none";
    }
});

    document.getElementById("searchAudit")?.addEventListener("input", () => {
        currentAuditPage = 1;
        renderFilteredAuditLogs();
    });


    document.getElementById("filterAuditAction")?.addEventListener("change", () => {
        currentAuditPage = 1;
        renderFilteredAuditLogs();
    });


    document.getElementById("filterAuditDate")?.addEventListener("input", () => {
        currentAuditPage = 1;
        renderFilteredAuditLogs();
    });


    document.getElementById("resetAuditFiltersBtn")?.addEventListener("click", () => {
        const searchInput = document.getElementById("searchAudit");
        const actionSelect = document.getElementById("filterAuditAction");
        const dateInput = document.getElementById("filterAuditDate");
        if (searchInput) searchInput.value = "";
        if (actionSelect) actionSelect.value = "";
        if (dateInput) dateInput.value = "";
        currentAuditPage = 1;
        renderFilteredAuditLogs();
    });


    // Modals Close handlers
    const closeAuditBtn = document.getElementById("closeAuditModalBtn");
    const closeAuditX = document.getElementById("closeAuditModalX");
    const auditModal = document.getElementById("auditDetailModal");
    [closeAuditBtn, closeAuditX].forEach(btn => {
        btn?.addEventListener("click", () => auditModal?.classList.remove("show"));
    });


    // Add Account views toggle
    document.querySelectorAll("[data-dashboard-view]").forEach(button => {
        button.addEventListener("click", () => {
            window.switchView?.(button.dataset.dashboardView);
        });
    });

    document.getElementById("addAccountBtn")?.addEventListener("click", () => {
        window.switchView?.("add-account");
    });


    wireAddAccountInlineValidation();
    document.getElementById("cancelAddAccount")?.addEventListener("click", () => {
        document.getElementById("addAccountForm")?.reset();
        clearAddAccountErrors();
        updatePasswordFeedback();
        resetLocationDropdowns();
        window.switchView?.("users");
    });


    document.getElementById("addAccountForm")?.addEventListener("submit", createAccount);


    // Logout
    document.getElementById("signOutButton")?.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("confirmLogoutModal")?.classList.add("show");
    });
    document.getElementById("cancelLogoutBtn")?.addEventListener("click", () => {
        document.getElementById("confirmLogoutModal")?.classList.remove("show");
    });
    document.getElementById("finalLogoutBtn")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.classList.add("is-loading");
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/logout`, { method: "POST" });
            if (!response.ok) throw new Error(`Sign out failed (${response.status}).`);
            ["user_id", "username", "role", "user_display_name"].forEach(key => localStorage.removeItem(key));
            window.location.href = "../index.html";
        } catch (error) {
            console.error("Sign out error:", error);
            alert(error.message || "Unable to sign out. Please try again.");
            button.disabled = false;
            button.classList.remove("is-loading");
        }
    });
});

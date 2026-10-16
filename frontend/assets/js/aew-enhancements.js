(function () {
  const numberFormat = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 });
  const currencyFormat = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  function escape(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function formatDate(value) {
    if (!value) return "Not set";
    const dateValue = String(value);
    const parsed = new Date(dateValue.length === 10 ? `${dateValue}T00:00:00` : dateValue);
    if (Number.isNaN(parsed.getTime())) return "Not set";
    return parsed.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  }

  async function getArray(path) {
    const requestUrl = new URL(`${API_BASE_URL}${path}`);
    const rows = [];

    while (true) {
      const response = await fetch(requestUrl, { headers: getAuthHeaders() });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const payload = await response.json();
      if (Array.isArray(payload)) return payload;
      if (!Array.isArray(payload?.data)) return rows;

      rows.push(...payload.data);
      if (!payload.pagination?.has_next) return rows;
      const currentPage = Number(payload.pagination.page || requestUrl.searchParams.get("page") || 1);
      requestUrl.searchParams.set("page", String(currentPage + 1));
    }
  }

  function getProfileHost() {
    const manageView = document.getElementById("manageFarmerSubview");
    const header = manageView?.querySelector(".main-header");
    if (!manageView || !header) return null;

    let host = document.getElementById("farmerProfilePanel");
    if (!host) {
      host = document.createElement("div");
      host.id = "farmerProfilePanel";
      host.className = "fp-panel";
      header.insertAdjacentElement("afterend", host);
    }
    return host;
  }

  function renderProfile(host, farmer, intents, offtakes) {
    const fullName = [farmer.first_name, farmer.middle_name, farmer.last_name, farmer.suffix]
      .filter(Boolean)
      .join(" ");
    const initials = `${farmer.first_name?.[0] || ""}${farmer.last_name?.[0] || ""}`.toUpperCase() || "F";
    const location = [farmer.barangay, farmer.municipality].filter(Boolean).join(", ");
    const plannedVolume = intents.reduce((total, intent) => total + Number(intent.volume || 0), 0);
    const requestedVolume = offtakes.reduce((total, request) => total + Number(request.quantity || 0), 0);
    const commodities = [...new Set(intents.map((intent) => intent.commodity).filter(Boolean))];
    const birthDate = farmer.birthdate ? formatDate(farmer.birthdate) : "Birthdate not set";
    const intentRows = intents.slice(0, 6).map((intent) => `
      <tr>
        <td><strong>${escape(intent.commodity || "Unknown crop")}</strong></td>
        <td>${numberFormat.format(Number(intent.volume || 0))} kg</td>
        <td>${formatDate(intent.planting_date)}</td>
        <td>${formatDate(intent.harvest_date)}</td>
        <td>${escape((intent.finalized_status || intent.status || "Draft").replaceAll("_", " "))}</td>
      </tr>`).join("");
    const offtakeRows = offtakes.slice(0, 5).map((request) => `
      <div class="fp-contract">
        <div><strong>${escape(request.commodity || "Produce request")}</strong>
          <span>Harvest ${formatDate(request.harvest_date)}</span></div>
        <div class="fp-contract-val">${numberFormat.format(Number(request.quantity || 0))} kg
          <span>${currencyFormat.format(Number(request.selling_price || 0))} / kg</span></div>
      </div>`).join("");

    host.innerHTML = `
      <section class="fp-hero card" aria-label="Farmer profile">
        <div class="fp-avatar" aria-hidden="true">${escape(initials)}</div>
        <div class="fp-id">
          <h2>${escape(fullName || "Farmer profile")}</h2>
          <div class="fp-tags">
            <span class="fp-tag">${escape(farmer.sex || "Farmer")}</span>
            <span class="fp-tag">${escape(birthDate)}</span>
          </div>
          <p>${escape(location || farmer.address || "Location not set")}</p>
          <p class="fp-mono">RSBSA ID: ${escape(farmer.rsbsa_id || "Not set")}</p>
        </div>
      </section>
      <section class="fp-kpis" aria-label="Farmer activity summary">
        <div class="fp-kpi dark"><label>Planting intents</label><b>${intents.length}</b><small>${commodities.length ? escape(commodities.join(", ")) : "No crops recorded"}</small></div>
        <div class="fp-kpi"><label>Planned volume</label><b>${numberFormat.format(plannedVolume)} <em>kg</em></b><small>Across listed intents</small></div>
        <div class="fp-kpi"><label>Offtake requests</label><b>${offtakes.length}</b><small>${numberFormat.format(requestedVolume)} kg requested</small></div>
      </section>
      <section class="fp-grid">
        <div class="card">
          <h3>Planting intents</h3>
          ${intents.length ? `<div class="fp-table-wrap"><table><thead><tr><th>Crop</th><th>Volume</th><th>Planting</th><th>Harvest</th><th>Status</th></tr></thead><tbody>${intentRows}</tbody></table></div>` : `<p class="fp-empty">No planting intents recorded.</p>`}
        </div>
        <div class="card">
          <h3>Offtake requests</h3>
          ${offtakes.length ? offtakeRows : `<p class="fp-empty">No offtake requests recorded.</p>`}
        </div>
      </section>`;
  }

  async function loadFarmerProfile(farmer, requestId) {
    const host = getProfileHost();
    if (!host) return;
    host.innerHTML = `<div class="card fp-empty">Loading farmer activity...</div>`;

    const farmerId = Number(farmer.farmer_id);
    const query = new URLSearchParams({ farmer_id: String(farmerId), per_page: "100" });
    const results = await Promise.allSettled([
      getArray(`/api/planting-intents/?${query}`),
      getArray(`/api/offtake-requests/?farmer_id=${encodeURIComponent(farmerId)}`),
    ]);

    if (requestId !== window.currentFarmerProfileRequest) return;
    if (results.every((result) => result.status === "rejected")) {
      host.innerHTML = `<div class="card fp-empty fp-error">Farmer activity could not be loaded. Try reopening this record.</div>`;
      return;
    }

    const intents = results[0].status === "fulfilled" ? results[0].value : [];
    const offtakes = results[1].status === "fulfilled" ? results[1].value : [];
    renderProfile(host, farmer, intents, offtakes);
  }

  function initFarmerProfile() {
    const originalOpenManageFarmer = window.openManageFarmer;
    if (typeof originalOpenManageFarmer !== "function") return;

    window.currentFarmerProfileRequest = 0;
    window.openManageFarmer = function (farmer) {
      const result = originalOpenManageFarmer(farmer);
      if (farmer?.farmer_id) {
        const requestId = ++window.currentFarmerProfileRequest;
        loadFarmerProfile(farmer, requestId).catch(() => {
          const host = getProfileHost();
          if (host && requestId === window.currentFarmerProfileRequest) {
            host.innerHTML = `<div class="card fp-empty fp-error">Farmer activity could not be loaded. Try reopening this record.</div>`;
          }
        });
      }
      return result;
    };
  }

  function initRegistrationProgress() {
    const form = document.getElementById("registerFarmerForm");
    const card = form?.closest(".card");
    if (!form || !card || document.getElementById("registrationProgress")) return;

    const progress = document.createElement("div");
    progress.id = "registrationProgress";
    progress.className = "rs-progress";
    progress.innerHTML = `
      <b id="registrationProgressLabel">Registration progress</b>
      <div class="rs-bar" id="registrationProgressBar" role="progressbar" aria-label="Required fields completed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="registrationProgressFill"></i></div>
      <b id="registrationProgressValue">0%</b>`;
    card.insertAdjacentElement("beforebegin", progress);

    const update = () => {
      const requiredFields = [...form.querySelectorAll("input, select, textarea")]
        .filter((field) => field.required && !field.disabled);
      if (!requiredFields.length) return;
      const completed = requiredFields.filter((field) => {
        if (field.type === "checkbox" || field.type === "radio") return field.checked;
        return String(field.value || "").trim() !== "";
      }).length;
      const percentage = Math.round((completed / requiredFields.length) * 100);
      document.getElementById("registrationProgressFill").style.width = `${percentage}%`;
      document.getElementById("registrationProgressBar").setAttribute("aria-valuenow", String(percentage));
      document.getElementById("registrationProgressValue").textContent = `${percentage}%`;
      document.getElementById("registrationProgressLabel").textContent = `${completed} of ${requiredFields.length} required fields complete`;
    };

    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("reset", () => window.setTimeout(update));
    update();
  }

  initFarmerProfile();
  document.addEventListener("DOMContentLoaded", initRegistrationProgress);
})();
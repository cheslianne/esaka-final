(() => {
  const apiBase = new URL(window.API_BASE_URL || "https://esaka-backend-production.up.railway.app");
  const nativeFetch = window.fetch.bind(window);
  let pendingApiRequests = 0;
  let activeSubmitter = null;
  let activeSubmitStartedAt = 0;
  let submitReleaseTimer = null;
  let sessionPromise = null;
  let redirecting = false;
  let profilePreviousHash = null;

  function redirectToLogin(message) {
    if (redirecting || !window.location.pathname.includes("/dashboards/")) return;
    redirecting = true;
    sessionStorage.setItem("esaka_login_notice", message);
    window.location.replace("../login.html");
  }

  localStorage.removeItem("access_token");
  localStorage.removeItem("token");
  localStorage.removeItem("token_type");
  localStorage.removeItem("user_birthdate");

  localStorage.removeItem("esaka-theme");
  document.documentElement.dataset.theme = "light";

  function getSession() {
    if (!sessionPromise) {
      sessionPromise = nativeFetch(`${apiBase.origin}/api/auth/me`, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" }
      }).then(async response => {
        if (response.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("token");
          localStorage.removeItem("token_type");
          redirectToLogin("Your session could not be verified. Please log in again.");
          return null;
        }
        if (!response.ok) throw new Error(`Session check failed (${response.status}).`);
        const user = await response.json();
        localStorage.setItem("user_id", user.user_id);
        localStorage.setItem("username", user.username);
        localStorage.setItem("role", user.role);
        return user;
      }).catch(error => {
        console.error("Unable to verify session:", error);
        sessionPromise = null;
        return null;
      });
    }
    return sessionPromise;
  }

  function updateLoadingState() {
    let progress = document.getElementById("apiLoadingProgress");
    if (!progress && document.body) {
      progress = document.createElement("div");
      progress.id = "apiLoadingProgress";
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-label", "Loading data");
      progress.setAttribute("aria-valuetext", "Loading");
      progress.innerHTML = "<span></span>";
      document.body.appendChild(progress);
    }
    progress?.classList.toggle("is-visible", pendingApiRequests > 0);
    if (pendingApiRequests > 0 && activeSubmitter) {
      activeSubmitter.disabled = true;
      activeSubmitter.classList.add("is-loading");
      activeSubmitter.setAttribute("aria-busy", "true");
    }
    if (pendingApiRequests === 0 && activeSubmitter &&
        Date.now() - activeSubmitStartedAt < 250) {
      clearTimeout(submitReleaseTimer);
      submitReleaseTimer = setTimeout(updateLoadingState, 250 - (Date.now() - activeSubmitStartedAt));
    } else if (pendingApiRequests === 0 && activeSubmitter) {
      activeSubmitter.classList.remove("is-loading");
      activeSubmitter.removeAttribute("aria-busy");
      activeSubmitter.disabled = false;
      activeSubmitter = null;
      activeSubmitStartedAt = 0;
    }
  }

  window.fetch = async (input, init = {}) => {
    const requestUrl = new URL(input instanceof Request ? input.url : input, window.location.href);
    const isApiRequest = requestUrl.origin === apiBase.origin;
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    const options = { ...init, headers };

    if (!isApiRequest) return nativeFetch(input, options);

    headers.delete("Authorization");
    options.credentials = "include";
    if (window.location.pathname.includes("/dashboards/") &&
        requestUrl.pathname !== "/api/auth/me" &&
        requestUrl.pathname !== "/api/auth/login" &&
        requestUrl.pathname !== "/api/auth/logout") {
      await getSession();
    }

    pendingApiRequests++;
    updateLoadingState();
    try {
      const response = await nativeFetch(input, options);
      if (response.status === 401 &&
          window.location.pathname.includes("/dashboards/") &&
          !redirecting) {
        redirectToLogin("Your session has expired. Please log in again.");
      }
      return response;
    } finally {
      pendingApiRequests--;
      updateLoadingState();
    }
  };

  document.addEventListener("submit", event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const invalid = [...form.querySelectorAll("input")].find(input => {
      const value = input.value.trim();
      if (!value) return false;
      if (/firstName|lastName/i.test(input.id)) {
        return value.length > 50 ||
          !/^[\p{L}\p{M}]+(?:[ '\u2019.-][\p{L}\p{M}]+)*$/u.test(value);
      }
      if (/newUsername|username/i.test(input.id) && input.type !== "email") {
        return value.length > 50 || !/^[\p{L}\p{N}_.-]+$/u.test(value);
      }
      if (/phoneNumber/i.test(input.id)) return !/^[0-9]{11}$/.test(value);
      return false;
    });
    if (invalid) {
      invalid.setCustomValidity("Use supported letters and punctuation only.");
      event.preventDefault();
      event.stopImmediatePropagation();
      invalid.reportValidity();
      return;
    }
    activeSubmitter = event.submitter ||
      form.querySelector('button[type="submit"], input[type="submit"]');
    if (!activeSubmitter) return;
    activeSubmitStartedAt = Date.now();
    activeSubmitter.disabled = true;
    activeSubmitter.classList.add("is-loading");
    activeSubmitter.setAttribute("aria-busy", "true");
    setTimeout(() => {
      if (pendingApiRequests === 0 && activeSubmitter) updateLoadingState();
    }, 0);
  }, true);

  document.addEventListener("input", event => {
    if (event.target instanceof HTMLInputElement) event.target.setCustomValidity("");
  }, true);

  document.addEventListener("DOMContentLoaded", () => {
    updateLoadingState();

    document.addEventListener("click", event => {
      const close = event.target.closest("#closeProfileModalBtn, #closeProfileBtn");
      const overlay = event.target.id === "profileModal";
      if (document.getElementById("view-users") &&
          event.target.closest("#openProfileBtn") &&
          window.location.hash !== "#/user-profile") {
        profilePreviousHash = window.location.hash || "#/dashboard";
        window.location.hash = "/user-profile";
      }
      if (close || overlay) {
        if (window.location.hash === "#/user-profile") {
          history.replaceState(
            null,
            "",
            `${location.pathname}${location.search}${profilePreviousHash || "#/dashboard"}`
          );
          profilePreviousHash = null;
        }
      }
    }, true);
  });

  window.addEventListener("pageshow", event => {
    if (!event.persisted || !window.location.pathname.includes("/dashboards/")) return;
    sessionPromise = null;
    getSession();
  });

  window.ESakaAuth = { getSession };
})();

/* ============================================================================
   eSaka shared UX module  —  assets/js/esaka-ux.js
   Load on ALL four pages (aew / da / municipal / provincial), right after
   ui-feedback.js and BEFORE the page script:

       <script src="../assets/js/esaka-ux.js"></script>

   Covers:
     #1  Avatar scoping            ESakaUX.avatar.get / set / clearLegacy
     #2  Sign-out (profile menu)   ESakaUX.initProfileMenu / ESakaUX.signOut
     #3  Toast notifications       window.showToast  (+ window.alert shim)
     #4  Tab refresh on click      ESakaUX.configure({ refresh: {...} })
     #5  Unsaved-changes popup     automatic once configured
     #6  Notification click helper ESakaUX.notificationStore
   ========================================================================== */
(function () {
  "use strict";
  if (window.ESakaUX) return;

  /* ------------------------------------------------------------------ *
   * Styles
   * ------------------------------------------------------------------ */
  const STYLE_TEXT = `
  #esakaToastRegion{position:fixed;top:16px;right:16px;z-index:2147483000;display:flex;flex-direction:column;gap:10px;width:min(380px,calc(100vw - 32px));pointer-events:none}
  .esaka-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:10px;background:#173d2d;color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.22);font:600 13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;white-space:pre-line;overflow-wrap:anywhere;opacity:0;transform:translateX(24px);transition:opacity .22s ease,transform .22s ease}
  .esaka-toast.show{opacity:1;transform:translateX(0)}
  .esaka-toast.success{background:#1f6b3a}
  .esaka-toast.error{background:#a63232}
  .esaka-toast.warning{background:#8a5a13}
  .esaka-toast.info{background:#244b73}
  .esaka-toast .esaka-toast-msg{flex:1}
  .esaka-toast button{border:0;background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer;padding:0 2px;opacity:.8}
  .esaka-toast button:hover{opacity:1}

  .esaka-modal-backdrop{position:fixed;inset:0;z-index:2147483100;background:rgba(15,30,22,.45);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .15s ease}
  .esaka-modal-backdrop.show{opacity:1}
  .esaka-modal{width:min(430px,100%);background:#fff;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.28);padding:22px 22px 18px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;transform:translateY(8px);transition:transform .15s ease}
  .esaka-modal-backdrop.show .esaka-modal{transform:none}
  .esaka-modal h3{margin:0 0 8px;font-size:17px;color:#173d2d}
  .esaka-modal p{margin:0 0 18px;font-size:14px;line-height:1.5;color:#44564b;white-space:pre-line}
  .esaka-modal-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
  .esaka-modal-actions button{border-radius:8px;padding:9px 16px;font:700 13px system-ui,sans-serif;cursor:pointer;border:1.5px solid #cfd9d2;background:#fff;color:#24382e}
  .esaka-modal-actions button.primary{background:#2e7d32;border-color:#2e7d32;color:#fff}
  .esaka-modal-actions button.danger{background:#c0392b;border-color:#c0392b;color:#fff}

  .notification-item.esaka-clickable{cursor:pointer;transition:background .15s ease}
  .notification-item.esaka-clickable:hover{background:#f3f8f4}
  .notification-item.is-read{opacity:.62}
  .notification-item .esaka-unread-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#c0392b;margin-right:6px;vertical-align:middle}
  .notification-item.is-read .esaka-unread-dot{display:none}
  `;
  function injectStyles() {
    if (document.getElementById("esaka-ux-styles")) return;
    const s = document.createElement("style");
    s.id = "esaka-ux-styles";
    s.textContent = STYLE_TEXT;
    (document.head || document.documentElement).appendChild(s);
  }
  injectStyles();

  /* ------------------------------------------------------------------ *
   * #3  Toast notifications  (non-blocking, top-right)
   * ------------------------------------------------------------------ */
  function inferType(message) {
    const m = String(message || "").toLowerCase();
    if (/(success|successfully|saved|submitted|approved|created|updated|archived|deleted|removed|sent)\b/.test(m) &&
        !/(fail|unable|error|could not|cannot|can't|invalid)/.test(m)) return "success";
    if (/(fail|unable|error|could not|cannot|can't|invalid|expired|denied|not found|went wrong)/.test(m)) return "error";
    if (/(please|required|must|select|enter|choose|missing)/.test(m)) return "warning";
    return "info";
  }

  let lastToast = { text: "", at: 0 };
  function showToast(message, type, duration) {
    injectStyles();
    const text = String(message == null ? "" : message).trim();
    if (!text) return null;

    // collapse accidental double-fires
    const now = Date.now();
    if (text === lastToast.text && now - lastToast.at < 700) return null;
    lastToast = { text, at: now };

    const kind = ["success", "error", "warning", "info"].includes(type) ? type : inferType(text);
    let region = document.getElementById("esakaToastRegion");
    if (!region) {
      region = document.createElement("div");
      region.id = "esakaToastRegion";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      document.body.appendChild(region);
    }

    const toast = document.createElement("div");
    toast.className = "esaka-toast " + kind;
    const msg = document.createElement("div");
    msg.className = "esaka-toast-msg";
    msg.textContent = text;
    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "\u00d7";
    toast.append(msg, close);
    region.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));

    let timer = null;
    const dismiss = () => {
      clearTimeout(timer);
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 240);
    };
    close.addEventListener("click", dismiss);
    const ms = Number(duration) || (kind === "error" ? 6500 : 4000);
    const arm = () => { timer = setTimeout(dismiss, ms); };
    toast.addEventListener("mouseenter", () => clearTimeout(timer));
    toast.addEventListener("mouseleave", arm);
    arm();
    return toast;
  }
  window.showToast = showToast;

  // Safety net for any script that still calls alert() (e.g. logout.js,
  // app-enhancements.js).  Your own alert() calls should still be replaced
  // with showToast() using the sed command in the patch guide.
  if (!window.__esakaAlertShim) {
    window.__esakaAlertShim = true;
    window.alert = function (message) { showToast(message); };
  }

  /* ------------------------------------------------------------------ *
   * Confirm modal (promise based) — used by sign-out + unsaved changes
   * ------------------------------------------------------------------ */
  function confirmDialog(message, opts) {
    opts = opts || {};
    injectStyles();
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "esaka-modal-backdrop";
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");

      const box = document.createElement("div");
      box.className = "esaka-modal";
      const h = document.createElement("h3");
      h.textContent = opts.title || "Please confirm";
      const p = document.createElement("p");
      p.textContent = message;
      const actions = document.createElement("div");
      actions.className = "esaka-modal-actions";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = opts.cancelText || "Cancel";
      const ok = document.createElement("button");
      ok.type = "button";
      ok.className = opts.danger ? "danger" : "primary";
      ok.textContent = opts.confirmText || "Confirm";
      actions.append(cancel, ok);
      box.append(h, p, actions);
      backdrop.appendChild(box);
      document.body.appendChild(backdrop);
      requestAnimationFrame(() => backdrop.classList.add("show"));

      const finish = (value) => {
        document.removeEventListener("keydown", onKey, true);
        backdrop.classList.remove("show");
        setTimeout(() => backdrop.remove(), 160);
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); finish(false); }
      };
      document.addEventListener("keydown", onKey, true);
      cancel.addEventListener("click", () => finish(false));
      ok.addEventListener("click", () => finish(true));
      backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) finish(false); });
      (opts.danger ? cancel : ok).focus();
    });
  }

  /* ------------------------------------------------------------------ *
   * #1  Avatar scoping — one key per user:  user_avatar_src_${userId}
   * ------------------------------------------------------------------ */
  const AVATAR_RE = /^\.\.\/images\/(?:[1-9]|1[0-2])\.png$/;
  function userId() {
    return localStorage.getItem("user_id") || localStorage.getItem("userId") || localStorage.getItem("id") || "";
  }
  const avatar = {
    key(id) { id = id || userId(); return id ? `user_avatar_src_${id}` : null; },
    get() {
      const k = this.key();
      if (!k) return null;                          // never fall back to a shared key
      const v = localStorage.getItem(k);
      return AVATAR_RE.test(v || "") ? v : null;
    },
    set(src) {
      const k = this.key();
      if (!k || !AVATAR_RE.test(src || "")) return false;
      localStorage.setItem(k, src);
      return true;
    },
    // The old shared key is what leaked avatars between accounts.  It cannot be
    // safely attributed to any user, so it is deleted (the DB value is re-applied
    // on the next profile load).
    clearLegacy() { try { localStorage.removeItem("user_avatar_src"); } catch (_) {} },
    /** Paint #userDisplayInitials from the scoped avatar, or initials. */
    paint(fallbackText, fallbackBg) {
      const el = document.getElementById("userDisplayInitials");
      if (!el) return;
      const src = this.get();
      if (src) {
        el.innerHTML = "";
        const img = document.createElement("img");
        img.src = src; img.alt = "Avatar";
        img.style.cssText = "width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;";
        el.appendChild(img);
        el.style.background = "transparent";
      } else if (fallbackText != null) {
        el.textContent = fallbackText;
        if (fallbackBg) el.style.background = fallbackBg;
      }
    },
    /** Pull the avatar saved on the server and cache it under the scoped key. */
    async hydrate() {
      const id = userId();
      const req = (typeof apiRequest === "function") ? apiRequest : window.apiRequest;
      const base = (typeof API_BASE_URL !== "undefined") ? API_BASE_URL : window.API_BASE_URL;
      if (!id || typeof req !== "function" || !base) return;
      try {
        const user = await req(`${base}/api/users/${id}`, { method: "GET" });
        if (user && user.avatar) {
          this.set(`../images/${user.avatar}`);
          this.paint();
        }
      } catch (e) { console.warn("Avatar hydrate skipped:", e); }
    }
  };
  avatar.clearLegacy();

  /* ------------------------------------------------------------------ *
   * #2  Profile dropdown (User Profile / Sign Out) + sign out
   * ------------------------------------------------------------------ */
  async function signOut() {
    const ok = await confirmDialog("Are you sure you want to sign out of eSaka?", {
      title: "Sign Out", confirmText: "Sign Out", danger: true
    });
    if (!ok) return;
    dirty.clearAll();
    window.__esakaSigningOut = true;
    try { 
      const userId = localStorage.getItem("user_id");
      if (userId) {
        localStorage.removeItem(`user_avatar_src_${userId}`);
      }
      localStorage.clear(); 
      sessionStorage.clear(); 
    } catch (_) {}
    window.location.href = "../index.html";
  }

  /**
   * Wires #openProfileBtn -> #profileDropdown, with:
   *   #menuEditProfile -> opts.onOpenProfile()
   *   #menuSignOut     -> signOut()
   */
  function initProfileMenu(opts) {
    opts = opts || {};
    const trigger = document.getElementById("openProfileBtn");
    const menu = document.getElementById("profileDropdown");
    if (!trigger || !menu || trigger.dataset.esakaMenu) return;
    trigger.dataset.esakaMenu = "1";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");

    const setOpen = (open) => {
      menu.style.display = open ? "block" : "none";
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
    };
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(menu.style.display !== "block");
    });
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && !trigger.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

    document.getElementById("menuEditProfile")?.addEventListener("click", (e) => {
      e.stopPropagation(); setOpen(false);
      if (typeof opts.onOpenProfile === "function") opts.onOpenProfile();
      else trigger.dispatchEvent(new CustomEvent("esaka:open-profile"));
    });
    document.getElementById("menuSignOut")?.addEventListener("click", (e) => {
      e.stopPropagation(); setOpen(false);
      signOut();
    });
  }

  /* ------------------------------------------------------------------ *
   * #5  Unsaved-changes tracking  (+ native prompt on tab close / reload)
   *
   * A field counts as "changed" when its value differs from the value it had
   * the first time the user focused it.  Programmatic resets back to that value
   * (e.g. after a successful save) therefore clear the warning automatically.
   * Opt a field/section out with  data-no-dirty="true".
   * ------------------------------------------------------------------ */
  const originals = new WeakMap();   // field -> original value
  const dirty = {
    isTracked(el) {
      if (!el || !(el instanceof HTMLElement)) return false;
      if (!el.matches("input,select,textarea")) return false;
      if (el.disabled || el.readOnly) return false;
      const t = (el.type || "").toLowerCase();
      if (["button", "submit", "reset", "search", "hidden", "range"].includes(t)) return false;
      if (el.closest("[data-no-dirty='true'],table,.search-box,.filter-bar,.header-actions,.pagination,.multi-select-menu,.custom-multi")) return false;
      if (/search|filter|quick|period|page/i.test(`${el.id} ${el.name} ${el.placeholder || ""}`)) return false;
      return true;
    },
    valueOf(el) {
      return (el.type === "checkbox" || el.type === "radio") ? String(el.checked) : String(el.value ?? "");
    },
    remember(el) { if (!originals.has(el)) originals.set(el, this.valueOf(el)); },
    visible(el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); },
    /** true if any visible tracked field inside `root` differs from its original */
    isDirty(root) {
      root = root || document;
      const fields = root.querySelectorAll("input,select,textarea");
      for (const el of fields) {
        if (!this.isTracked(el) || !this.visible(el) || !originals.has(el)) continue;
        if (this.valueOf(el) !== originals.get(el)) return true;
      }
      return false;
    },
    /** treat current values as the saved state (call after a successful save) */
    markClean(root) {
      (root || document).querySelectorAll("input,select,textarea").forEach((el) => {
        if (this.isTracked(el)) originals.set(el, this.valueOf(el));
      });
    },
    clearAll() { this.markClean(document); }
  };

  document.addEventListener("focusin", (e) => { if (dirty.isTracked(e.target)) dirty.remember(e.target); }, true);
  // pointerdown/keydown fire before the first edit even if focus was scripted
  ["pointerdown", "keydown"].forEach((evt) =>
    document.addEventListener(evt, (e) => { if (dirty.isTracked(e.target)) dirty.remember(e.target); }, true));
  document.addEventListener("submit", (e) => { dirty.markClean(e.target); }, true);

  window.addEventListener("beforeunload", (e) => {
    if (window.__esakaSigningOut) return;
    const view = document.querySelector(".view.active-view") || document;
    if (dirty.isDirty(view)) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ------------------------------------------------------------------ *
   * #4 + #5  Sidebar tab clicks: unsaved guard first, then re-fetch
   * ------------------------------------------------------------------ */
  const config = { refresh: {} };
  let bypassGuard = false;

  function activeViewEl() { return document.querySelector(".view.active-view"); }

  function runRefresh(viewKey) {
    const list = config.refresh[viewKey] || [];
    list.forEach((entry) => {
      const fn = typeof entry === "function" ? entry : window[entry];
      if (typeof fn !== "function") {
        if (typeof entry === "string") console.warn(`[ESakaUX] refresh function "${entry}" not found for tab "${viewKey}"`);
        return;
      }
      try {
        const r = fn();
        if (r && typeof r.catch === "function") r.catch((err) => console.warn(`[ESakaUX] refresh ${viewKey} failed`, err));
      } catch (err) { console.warn(`[ESakaUX] refresh ${viewKey} failed`, err); }
    });
  }

  // Capture phase: runs BEFORE the page's own nav handler so it can block it.
  document.addEventListener("click", async (e) => {
    const nav = e.target.closest && e.target.closest(".nav-item[data-view]");
    if (!nav || bypassGuard) return;
    const current = activeViewEl();
    const targetKey = nav.dataset.view;
    const leaving = current && current.id !== "view-" + targetKey;
    if (!leaving || !dirty.isDirty(current)) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    const leave = await confirmDialog(
      "You have unsaved changes on this page. If you leave now, they will be lost.",
      { title: "Unsaved changes", confirmText: "Discard and leave", cancelText: "Stay on this page", danger: true }
    );
    if (!leave) return;
    dirty.markClean(current);
    bypassGuard = true;
    try { nav.click(); } finally { bypassGuard = false; }
  }, true);

  // Bubble phase: runs AFTER the page switched views (or ignored a same-tab click).
  document.addEventListener("click", (e) => {
    const nav = e.target.closest && e.target.closest(".nav-item[data-view]");
    if (!nav) return;
    const key = nav.dataset.view;
    setTimeout(() => runRefresh(key), 60);
  });

  /* ------------------------------------------------------------------ *
   * #6  Notification read-state store (per user, in localStorage)
   * ------------------------------------------------------------------ */
  const notificationStore = {
    _key() { return `esaka_read_notifications_${userId() || "anonymous"}`; },
    _read() { try { return new Set(JSON.parse(localStorage.getItem(this._key()) || "[]")); } catch (_) { return new Set(); } },
    isRead(id) { return this._read().has(String(id)); },
    markRead(id) {
      const s = this._read(); s.add(String(id));
      // keep the list bounded
      localStorage.setItem(this._key(), JSON.stringify(Array.from(s).slice(-500)));
    }
  };

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */
  window.ESakaUX = {
    toast: showToast,
    confirm: confirmDialog,
    avatar,
    signOut,
    initProfileMenu,
    dirty,
    notificationStore,
    userId,
    configure(opts) {
      if (opts && opts.refresh) Object.assign(config.refresh, opts.refresh);
    },
    goToView(viewKey) {
      const btn = document.querySelector(`.nav-item[data-view="${CSS_escape(viewKey)}"]`);
      if (btn) btn.click();
    }
  };
  function CSS_escape(v) { return (window.CSS && window.CSS.escape) ? window.CSS.escape(v) : String(v).replace(/"/g, '\\"'); }
})();
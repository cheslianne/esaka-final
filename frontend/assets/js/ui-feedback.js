/*
 * eSaka user feedback: toast notifications and modal dialogs that replace
 * the browser-native alert() and confirm() boxes.
 *
 *   ESaka.toast(message, type?, options?)   non-blocking toast
 *   ESaka.dialog(message, options?)         modal with a single "Done" button
 *   ESaka.confirm(message, options?)        modal with Confirm/Cancel -> Promise<boolean>
 *
 * window.alert is routed to the helpers above so existing calls get the new UI.
 */
(() => {
  if (window.ESaka && window.ESaka.confirm) return;

  const PENDING_KEY = "esaka_pending_toasts";
  const ICONS = {
    success: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.5"/></svg>',
    error: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.5h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/></svg>',
  };
  const TITLES = { success: "Success", error: "Something went wrong", warning: "Please check", info: "Notice" };
  const activeToasts = [];

  function injectStyles() {
    if (document.getElementById("esakaFeedbackStyles")) return;
    const style = document.createElement("style");
    style.id = "esakaFeedbackStyles";
    style.textContent = `
      .esaka-toast-region{position:fixed;top:18px;right:18px;z-index:100000;display:flex;flex-direction:column;gap:10px;width:min(380px,calc(100vw - 28px));pointer-events:none}
      .esaka-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:12px;padding:13px 14px;border-radius:12px;background:#fff;color:#1f2937;border:1px solid #e5e7eb;border-left:5px solid var(--esaka-accent);box-shadow:0 10px 28px rgba(15,23,42,.18);font-size:14px;font-weight:500;line-height:1.4;font-family:inherit;animation:esakaToastIn .22s ease-out}
      .esaka-toast.leaving{animation:esakaToastOut .2s ease-in forwards}
      .esaka-toast-icon{color:var(--esaka-accent);flex:none;margin-top:1px}
      .esaka-toast-body{flex:1;min-width:0;white-space:pre-line;overflow-wrap:anywhere}
      .esaka-toast-close{flex:none;border:0;background:transparent;color:inherit;opacity:.55;font-size:20px;line-height:1;cursor:pointer;padding:0 2px}
      .esaka-toast-close:hover{opacity:1}
      .esaka-toast.success{--esaka-accent:#15803d}.esaka-toast.error{--esaka-accent:#dc2626}
      .esaka-toast.warning{--esaka-accent:#d97706}.esaka-toast.info{--esaka-accent:#2563eb}
      .esaka-dialog-backdrop{position:fixed;inset:0;z-index:100001;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:18px;animation:esakaFade .15s ease-out}
      .esaka-dialog{width:min(440px,100%);background:#fff;color:#1f2937;border-radius:18px;padding:26px 26px 22px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.3);font-family:inherit}
      .esaka-dialog-icon{width:46px;height:46px;border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--esaka-accent) 14%,transparent);color:var(--esaka-accent)}
      .esaka-dialog h3{margin:0 0 8px;font-size:20px;font-weight:800;color:#0f4f3c}
      .esaka-dialog p{margin:0 0 20px;font-size:14px;line-height:1.5;color:#374151;white-space:pre-line;overflow-wrap:anywhere}
      .esaka-dialog-actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}
      .esaka-dialog-actions button{border:0;border-radius:10px;padding:10px 24px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;min-width:96px}
      .esaka-btn-primary{background:#0f4f3c;color:#fff}.esaka-btn-primary:hover{background:#0b3d2e}
      .esaka-btn-danger{background:#dc2626;color:#fff}.esaka-btn-danger:hover{background:#b91c1c}
      .esaka-btn-secondary{background:#eef2f0;color:#1f2937}.esaka-btn-secondary:hover{background:#dde5e1}
      .esaka-dialog-actions button:focus-visible{outline:3px solid #86b8a6;outline-offset:2px}
      .esaka-dialog.success{--esaka-accent:#15803d}.esaka-dialog.error{--esaka-accent:#dc2626}
      .esaka-dialog.warning{--esaka-accent:#d97706}.esaka-dialog.info{--esaka-accent:#2563eb}
      html[data-theme="dark"] .esaka-toast{background:#1e293b;color:#e5e7eb;border-color:#334155;border-left-color:var(--esaka-accent)}
      html[data-theme="dark"] .esaka-dialog{background:#1e293b;color:#e5e7eb}
      html[data-theme="dark"] .esaka-dialog h3{color:#d1fae5}
      html[data-theme="dark"] .esaka-dialog p{color:#cbd5e1}
      html[data-theme="dark"] .esaka-btn-secondary{background:#334155;color:#e5e7eb}
      html[data-theme="dark"] .esaka-btn-secondary:hover{background:#475569}
      html[data-theme="dark"] .esaka-btn-primary{background:#10b981;color:#052e22}
      html[data-theme="dark"] .esaka-btn-primary:hover{background:#34d399}
      @keyframes esakaToastIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
      @keyframes esakaToastOut{to{opacity:0;transform:translateX(24px)}}
      @keyframes esakaFade{from{opacity:0}to{opacity:1}}
      @media (prefers-reduced-motion:reduce){.esaka-toast,.esaka-dialog-backdrop{animation:none}}
      @media (max-width:520px){.esaka-toast-region{top:auto;bottom:14px;right:14px;left:14px;width:auto}}
    `;
    document.head.appendChild(style);
  }

  function ensure(fn) {
    if (document.body) return fn();
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  }

  function inferType(message) {
    const text = String(message).toLowerCase();
    if (/\b(fail|failed|error|unable|could not|couldn't|cannot|can't|denied|invalid|not found|went wrong|expired)\b/.test(text)) return "error";
    if (/\b(success|successfully|saved|created|updated|submitted|finalized|finalised|sent|deleted|removed|approved|archived|restored|marked|completed|added|reverted|resubmitted)\b/.test(text)) return "success";
    if (/\b(please|required|must|only|select|enter|choose|no .* selected|missing|at least|already)\b/.test(text)) return "warning";
    return "info";
  }

  function getRegion() {
    let region = document.getElementById("esakaToastRegion");
    if (!region) {
      region = document.createElement("div");
      region.id = "esakaToastRegion";
      region.className = "esaka-toast-region";
      region.setAttribute("role", "region");
      region.setAttribute("aria-label", "Notifications");
      document.body.appendChild(region);
    }
    return region;
  }

  function toast(message, type, options = {}) {
    const text = String(message ?? "").trim();
    if (!text) return;
    const kind = ICONS[type] ? type : inferType(text);
    injectStyles();
    ensure(() => {
      const region = getRegion();
      const el = document.createElement("div");
      el.className = `esaka-toast ${kind}`;
      el.setAttribute("role", kind === "error" || kind === "warning" ? "alert" : "status");
      el.innerHTML = `<span class="esaka-toast-icon">${ICONS[kind]}</span><div class="esaka-toast-body"></div><button type="button" class="esaka-toast-close" aria-label="Dismiss notification">&times;</button>`;
      el.querySelector(".esaka-toast-body").textContent = text;

      const record = { text, kind, at: Date.now() };
      let timer = null;
      const dismiss = () => {
        clearTimeout(timer);
        const index = activeToasts.indexOf(record);
        if (index >= 0) activeToasts.splice(index, 1);
        el.classList.add("leaving");
        setTimeout(() => el.remove(), 200);
      };
      el.querySelector(".esaka-toast-close").addEventListener("click", dismiss);
      const duration = options.duration ?? (kind === "error" || kind === "warning" ? 7000 : 4500);
      const arm = () => { timer = setTimeout(dismiss, duration); };
      el.addEventListener("mouseenter", () => clearTimeout(timer));
      el.addEventListener("mouseleave", arm);
      arm();

      activeToasts.push(record);
      region.appendChild(el);
      while (region.children.length > 4) region.firstElementChild.remove();
    });
  }

  let dialogQueue = Promise.resolve();

  function openDialog({ title, message, type, confirmText, cancelText, danger, showCancel }) {
    injectStyles();
    return new Promise(resolve => {
      ensure(() => {
        const previousFocus = document.activeElement;
        const kind = ICONS[type] ? type : "info";
        const backdrop = document.createElement("div");
        backdrop.className = "esaka-dialog-backdrop";
        const titleId = `esakaDialogTitle${Date.now()}`;
        backdrop.innerHTML = `
          <div class="esaka-dialog ${danger ? "warning" : kind}" role="${showCancel ? "alertdialog" : "dialog"}" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${titleId}Msg">
            <div class="esaka-dialog-icon">${ICONS[danger ? "warning" : kind]}</div>
            <h3 id="${titleId}"></h3>
            <p id="${titleId}Msg"></p>
            <div class="esaka-dialog-actions"></div>
          </div>`;
        backdrop.querySelector("h3").textContent = title;
        backdrop.querySelector("p").textContent = message;
        const actions = backdrop.querySelector(".esaka-dialog-actions");

        const finish = value => {
          document.removeEventListener("keydown", onKey, true);
          backdrop.remove();
          if (previousFocus && previousFocus.focus) previousFocus.focus();
          resolve(value);
        };
        const makeButton = (label, cls, value) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = cls;
          button.textContent = label;
          button.addEventListener("click", () => finish(value));
          actions.appendChild(button);
          return button;
        };
        let cancelButton = null;
        if (showCancel) cancelButton = makeButton(cancelText, "esaka-btn-secondary", false);
        const okButton = makeButton(confirmText, danger ? "esaka-btn-danger" : "esaka-btn-primary", true);

        const onKey = event => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finish(false);
          } else if (event.key === "Tab") {
            const buttons = [...actions.querySelectorAll("button")];
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }
        };
        document.addEventListener("keydown", onKey, true);
        backdrop.addEventListener("mousedown", event => {
          if (event.target === backdrop && showCancel) finish(false);
        });
        document.body.appendChild(backdrop);
        (danger && cancelButton ? cancelButton : okButton).focus();
      });
    });
  }

  function queueDialog(options) {
    const run = () => openDialog(options);
    const result = dialogQueue.then(run, run);
    dialogQueue = result.catch(() => {});
    return result;
  }

  function dialog(message, options = {}) {
    const type = ICONS[options.type] ? options.type : inferType(message);
    return queueDialog({
      title: options.title || TITLES[type],
      message: String(message ?? ""),
      type,
      confirmText: options.confirmText || "Done",
      showCancel: false,
    });
  }

  function confirmDialog(message, options = {}) {
    return queueDialog({
      title: options.title || "Please confirm",
      message: String(message ?? "").replace(/<[^>]*>/g, ""),
      type: "info",
      confirmText: options.confirmText || "Confirm",
      cancelText: options.cancelText || "Cancel",
      danger: Boolean(options.danger),
      showCancel: true,
    });
  }

  // Short messages become toasts; long or multi-line ones get a modal.
  function nativeAlertReplacement(message) {
    const text = String(message ?? "");
    if (text.length > 160 || text.split("\n").filter(Boolean).length > 2) {
      dialog(text);
    } else {
      toast(text);
    }
  }

  // Toasts shown just before a redirect would vanish; replay them on the next page.
  window.addEventListener("pagehide", () => {
    const fresh = activeToasts.filter(item => Date.now() - item.at < 4000);
    if (fresh.length) {
      try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(fresh)); } catch (_) { /* storage unavailable */ }
    }
  });
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "[]");
    sessionStorage.removeItem(PENDING_KEY);
    pending.filter(item => Date.now() - item.at < 10000).forEach(item => toast(item.text, item.kind));
  } catch (_) { /* ignore malformed data */ }

  window.ESaka = Object.assign(window.ESaka || {}, { toast, dialog, confirm: confirmDialog });
  window.alert = nativeAlertReplacement;
})();

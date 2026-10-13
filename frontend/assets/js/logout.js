document.addEventListener("DOMContentLoaded", function () {


  const modalStyle = document.createElement("style");
  modalStyle.innerHTML = `
    .esaka-logout-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(30, 35, 28, 0.65);
      backdrop-filter: blur(2px);
      align-items: center;
      justify-content: center;
      z-index: 99999999 !important;
      font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
    }
    .esaka-logout-overlay.show {
      display: flex !important;
    }
    .esaka-logout-box {
      background: #FFFFFF;
      border: 1.5px solid #D9E4DE;
      border-radius: 16px;
      padding: 34px 44px 30px;
      text-align: center;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
      max-width: 440px;
      width: calc(100% - 40px);
      position: relative;
      z-index: 100000000;
    }
    .esaka-logout-box h2 {
      font-size: 22px;
      font-weight: 800;
      color: #0B382A;
      margin-top: 0;
      margin-bottom: 12px;
    }
    .esaka-logout-box p {
      font-size: 14.5px;
      color: #202824;
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .esaka-logout-actions {
      display: flex;
      justify-content: center;
      gap: 14px;
    }
    .esaka-logout-btn-cancel {
      font-family: inherit;
      font-size: 14px;
      font-weight: 700;
      padding: 10px 24px;
      border-radius: 8px;
      cursor: pointer;
      border: 1.5px solid #D9E4DE;
      background: #FFFFFF;
      color: #202824;
      transition: all 0.2s ease;
    }
    .esaka-logout-btn-cancel:hover {
      background: #E3ECE8;
      border-color: #0B382A;
    }
    .esaka-logout-btn-confirm {
      font-family: inherit;
      font-size: 14px;
      font-weight: 700;
      padding: 10px 24px;
      border-radius: 8px;
      cursor: pointer;
      border: none;
      background: #C0392B;
      color: #FFFFFF;
      transition: all 0.2s ease;
    }
    .esaka-logout-btn-confirm:hover {
      background: #A93226;
      transform: translateY(-1px);
    }
  `;
  document.head.appendChild(modalStyle);




  if (!document.getElementById("globalLogoutModal")) {
    const modalMarkup = document.createElement("div");
    modalMarkup.className = "esaka-logout-overlay";
    modalMarkup.id = "globalLogoutModal";
    modalMarkup.innerHTML = `
      <div class="esaka-logout-box">
        <h2>Confirm Sign Out</h2>
        <p>Are you sure you want to sign out of your account?</p>
        <div class="esaka-logout-actions">
          <button type="button" class="esaka-logout-btn-cancel" id="globalLogoutCancelBtn">Cancel</button>
          <button type="button" class="esaka-logout-btn-confirm" id="globalLogoutConfirmBtn">Sign Out</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalMarkup);
  }




  const logoutModal = document.getElementById("globalLogoutModal");
  const cancelBtn = document.getElementById("globalLogoutCancelBtn");
  const confirmBtn = document.getElementById("globalLogoutConfirmBtn");




  window.openLogoutModal = function () {
    if (logoutModal) logoutModal.classList.add("show");
  };




  if (cancelBtn) {
    cancelBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      logoutModal.classList.remove("show");
    });
  }




  if (confirmBtn) {
    confirmBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      e.stopPropagation();
      confirmBtn.disabled = true;
      try {
        const response = await fetch(`${window.API_BASE_URL}/api/auth/logout`, {
          method: "POST"
        });
        if (!response.ok) throw new Error(`Sign out failed (${response.status}).`);
      } catch (error) {
        console.error("Sign out error:", error);
        alert(error.message || "Unable to sign out. Please try again.");
        confirmBtn.disabled = false;
        return;
      }
      ["user_id", "username", "role", "user_display_name"].forEach(key => localStorage.removeItem(key));
      const isSubfolder = window.location.pathname.includes("/dashboards/") || window.location.pathname.includes("/pages/");
      window.location.href = isSubfolder ? "../index.html" : "index.html";
    });
  }




  if (logoutModal) {
    logoutModal.addEventListener("click", function (e) {
      if (e.target === logoutModal) {
        logoutModal.classList.remove("show");
      }
    });
  }




  document.addEventListener("click", function (e) {


    if (e.target.closest("#globalLogoutModal")) {
        return;
    }


    const target = e.target.closest(
        "#signoutBtn, #signOutButton, #logoutBtn, .signout"
    );


    if (target) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();


        console.log("Sign Out clicked");


        window.openLogoutModal();
    }


},


true);


});

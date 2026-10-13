/* ---------- Sidebar Toggle ---------- */
function initSidebarToggle(){
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  if (hamburgerBtn && sidebar){
    hamburgerBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      setTimeout(() => {
        if (window.leafletMap) window.leafletMap.invalidateSize();
      }, 300);
    });
  }
}

/* ---------- Notification Dropdown ---------- */
function initNotifDropdown(){
  const bellBtn = document.getElementById('bellBtn') || document.querySelector('.bell-wrap');
  const notifDropdown = document.getElementById('notifDropdown');
  if (!bellBtn || !notifDropdown) return;

  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle('show');
  });

  document.addEventListener('click', (e) => {
    if (!notifDropdown.contains(e.target) && e.target !== bellBtn){
      notifDropdown.classList.remove('show');
    }
  });
}

/* ---------- View Switching (Sidebar Navigation) ---------- */
function initViewSwitching(onSwitch){
  const navButtons = document.querySelectorAll('.nav-item[data-view]');
  const views = document.querySelectorAll('.view');
  const isSystemAdmin = Boolean(document.getElementById('view-users'));
  const routeToView = {
    dashboard: 'dashboard',
    'user-management': 'users',
    'add-account': 'add-account',
    'audit-logs': 'audit',
    'archived-accounts': 'archived'
  };
  const viewToRoute = {
    dashboard: 'dashboard',
    users: 'user-management',
    'add-account': 'add-account',
    audit: 'audit-logs',
    archived: 'archived-accounts'
  };

  function renderView(viewKey){
    if (isSystemAdmin && viewKey === 'user-profile') {
      document.getElementById('profileModal')?.classList.add('show');
      return;
    }
    views.forEach(v => v.classList.remove('active-view'));
    const target = document.getElementById('view-' + viewKey);
    if (target) target.classList.add('active-view');
    navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewKey));
    
    if (viewKey === 'map' && window.leafletMap){
      setTimeout(() => window.leafletMap.invalidateSize(), 100);
    }

    if (typeof onSwitch === 'function') onSwitch(viewKey);
  }

  function switchView(viewKey){
    if (isSystemAdmin) {
      const route = viewToRoute[viewKey];
      if (route && window.location.hash !== `#/${route}`) {
        window.location.hash = `/${route}`;
        return;
      }
      if (viewKey === 'user-profile' && window.location.hash !== '#/user-profile') {
        window.location.hash = '/user-profile';
        return;
      }
    }
    renderView(viewKey);
  }

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  if (isSystemAdmin) {
    function renderRoute(){
      const route = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
      if (route !== 'user-profile' && !routeToView[route]) {
        history.replaceState(null, '', `${location.pathname}${location.search}#/dashboard`);
      }
      const viewKey = routeToView[route] || 'dashboard';
      if (!window.location.hash) {
        history.replaceState(null, '', `${location.pathname}${location.search}#/dashboard`);
      }
      document.getElementById('profileModal')?.classList.toggle('show', route === 'user-profile');
      renderView(viewKey);
    }
    window.addEventListener('hashchange', renderRoute);
    renderRoute();
  }

  window.switchView = switchView;
}

/* ---------- Subview Switching (List <-> Detail/Forms) ---------- */
function initSubviewSwitching(subviewClass){
  const subviews = document.querySelectorAll('.' + subviewClass);

  function showSubview(target){
    subviews.forEach(v => v.classList.add('hidden-element'));
    if (target) target.classList.remove('hidden-element');
  }

  return showSubview;
}

/* ---------- Search & Filter Controller ---------- */
function wireSearchFilter({ itemsSelector, searchInputId, filterBtnId, filterDropdownId, filterAttr, noResultsId }){
  const items = document.querySelectorAll(itemsSelector);
  const searchInput = searchInputId ? document.getElementById(searchInputId) : null;
  const noResults = noResultsId ? document.getElementById(noResultsId) : null;
  let currentFilter = 'all';

  function applyFilters(){
    const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
    let visibleCount = 0;
    items.forEach(item => {
      const matchesFilter = currentFilter === 'all' || item.dataset[filterAttr] === currentFilter;
      const matchesSearch = item.textContent.toLowerCase().includes(query);
      const show = matchesFilter && matchesSearch;
      
      item.classList.toggle('hidden-element', !show);
      if (show) visibleCount++;
    });
    if (noResults) noResults.classList.toggle('hidden-element', visibleCount > 0);
  }

  if (searchInput) searchInput.addEventListener('input', applyFilters);

  if (filterBtnId && filterDropdownId){
    const filterBtn = document.getElementById(filterBtnId);
    const filterDropdown = document.getElementById(filterDropdownId);

    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      filterDropdown.classList.toggle('show');
      filterBtn.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!filterDropdown.contains(e.target) && e.target !== filterBtn){
        filterDropdown.classList.remove('show');
        filterBtn.classList.remove('active');
      }
    });

    filterDropdown.querySelectorAll('.filter-option').forEach(opt => {
      opt.addEventListener('click', () => {
        filterDropdown.querySelectorAll('.filter-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        currentFilter = opt.dataset.filter;
        filterDropdown.classList.remove('show');
        filterBtn.classList.remove('active');
        applyFilters();
      });
    });
  }

  return applyFilters;
}

/* ---------- Tab Filter Controller ---------- */
function wireTabFilter({ tabSelector, itemsSelector, filterAttr }){
  const tabs = document.querySelectorAll(tabSelector);
  const items = document.querySelectorAll(itemsSelector);

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const filterVal = tab.dataset.filter;

      items.forEach(item => {
        const show = filterVal === 'all' || item.dataset[filterAttr] === filterVal;
        item.classList.toggle('hidden-element', !show);
      });
    });
  });
}

/* ---------- Pagination Controller ---------- */
function wirePagination({ items, perPage = 3, renderFn, paginationInfoId, pageNumbersId, prevBtnId, nextBtnId }){
  let currentPage = 1;
  const infoEl = document.getElementById(paginationInfoId);
  const pageNumbersEl = document.getElementById(pageNumbersId);
  const prevBtn = document.getElementById(prevBtnId);
  const nextBtn = document.getElementById(nextBtnId);

  function update(){
    const totalPages = Math.ceil(items.length / perPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * perPage;
    const end = start + perPage;
    const paginatedItems = items.slice(start, end);

    if (typeof renderFn === 'function') {
      renderFn(paginatedItems, start, end);
    }

    if (infoEl) {
      infoEl.textContent = `Showing ${items.length ? start + 1 : 0}-${Math.min(end, items.length)} of ${items.length}`;
    }

    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages;

    if (pageNumbersEl) {
      pageNumbersEl.innerHTML = '';
      for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = `btn-page ${i === currentPage ? 'active' : ''}`;
        btn.textContent = i;
        btn.type = 'button';
        btn.addEventListener('click', () => {
          currentPage = i;
          update();
        });
        pageNumbersEl.appendChild(btn);
      }
    }
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        update();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(items.length / perPage);
      if (currentPage < totalPages) {
        currentPage++;
        update();
      }
    });
  }

  update();

  return {
    refresh: update,
    setPage: (p) => { currentPage = p; update(); },
    getCurrentPage: () => currentPage
  };
}

/* ---------- Auto-Generate RSBSA / Entity ID ---------- */
function generateEntityId(prefix = 'ID-III', currentCount = 0){
  const nextNum = currentCount + 1;
  return `${prefix}-${String(nextNum).padStart(2, '0')}`;
}

/* ---------- Field Edit Lock / Unlock Toggle ---------- */
function wireEditableFields({ toggleBtnId, inputSelector, onSave }){
  const btn = document.getElementById(toggleBtnId);
  const inputs = document.querySelectorAll(inputSelector);
  let isEditing = false;
  if (!btn) return;

  btn.addEventListener('click', () => {
    isEditing = !isEditing;
    inputs.forEach(input => {
      input.readOnly = !isEditing;
      input.classList.toggle('input-editable-active', isEditing);
      input.classList.toggle('input-readonly', !isEditing);
    });

    btn.textContent = isEditing ? 'Save Changes' : 'Edit Contact Info';

    if (!isEditing && typeof onSave === 'function') {
      onSave();
    }
  });
}

/* ---------- Threshold Slider & Chips ---------- */
function wireThresholdSlider({ rangeId, valueId, chipClass, unit }){
  const range = document.getElementById(rangeId);
  const valueEl = document.getElementById(valueId);
  const chips = document.querySelectorAll('.' + chipClass);
  if (!range) return;

  function updateDisplay(val){
    if (valueEl) valueEl.textContent = val + (unit || '%');
    chips.forEach(chip => {
      chip.classList.toggle('active', chip.dataset.val === String(val) || chip.dataset.value === String(val));
    });
  }

  range.addEventListener('input', () => updateDisplay(range.value));

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.val || chip.dataset.value;
      range.value = val;
      updateDisplay(val);
    });
  });

  updateDisplay(range.value);
}

/* ---------- Modal Management ---------- */
function openModal(modalId){
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('show');
}

function closeModal(modalId){
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('show');
}

function initModalListeners(){
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('show');
    });
  });

  document.querySelectorAll('.modal-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) modal.classList.remove('show');
    });
  });
}

/* ---------- Global Lifecycle Setup ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initNotifDropdown();
  initModalListeners();
});
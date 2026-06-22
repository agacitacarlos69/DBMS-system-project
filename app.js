/* =====================================================================
   EMS — shared frontend helpers (nav, toast, confirm)
   Included by every page via <script src="app.js"></script>.
   Keeps the responsive sticky navigation, toast notifications and
   edit-confirmation logic in ONE place so all pages stay consistent.
   ===================================================================== */
(function () {
  const NAV_LINKS = [
    ['Dashboard',  'index.html',       'dashboard'],
    ['Employees',  'employees.html',   'employees'],
    ['Management', 'management.html',  'management'],
    ['Team Leads', 'team-leads.html',  'team-leads'],
    ['SMEs',       'smes.html',        'smes'],
    ['Schedules',  'schedules.html',   'schedules'],
    ['Rooms',      'rooms.html',       'rooms'],
    ['Users',      'users.html',       'users'],
    ['Profile',    'profile.html',     'profile'],
  ];

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- Toast notifications ---------- */
  function ensureToastHost() {
    let host = document.getElementById('ems-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ems-toast-host';
      host.className = 'fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-[92vw]';
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(message, type = 'success', timeout = 4000) {
    const host = ensureToastHost();
    const palette = {
      success: 'bg-green-50 text-green-800 ring-green-300',
      error: 'bg-red-50 text-red-800 ring-red-300',
      info: 'bg-blue-50 text-blue-800 ring-blue-300',
    }[type] || 'bg-slate-50 text-slate-800 ring-slate-300';
    const el = document.createElement('div');
    el.className = `pointer-events-auto flex items-start gap-3 rounded-lg px-4 py-3 text-sm shadow-lg ring-1 ring-inset ${palette}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="flex-1 whitespace-pre-line">${esc(message)}</span>
      <button type="button" class="shrink-0 text-lg leading-none opacity-60 hover:opacity-100">&times;</button>`;
    el.querySelector('button').addEventListener('click', () => el.remove());
    host.appendChild(el);
    if (timeout) setTimeout(() => el.remove(), timeout);
    return el;
  }

  /* ---------- Edit confirmation ---------- */
  function confirmEdit(message) {
    return window.confirm(message || 'Are you sure you want to save changes to this record?');
  }

  /* ---------- Responsive sticky navigation ---------- */
  function buildNav(active) {
    const user = JSON.parse(localStorage.getItem('ems_user') || '{}');
    const links = NAV_LINKS.map(([label, href, key]) => {
      const isActive = key === active;
      const cls = isActive
        ? 'rounded px-3 py-1.5 bg-blue-600 text-white'
        : 'rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800';
      return `<a href="${href}" class="${cls}">${label}</a>`;
    }).join('');

    const header = document.createElement('header');
    header.className = 'sticky top-0 z-50 bg-slate-900 text-slate-100 shadow';
    header.innerHTML = `
      <div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div class="flex items-center gap-3">
          <button id="ems-navToggle" type="button" aria-label="Toggle navigation"
            class="rounded-lg p-2 text-slate-200 hover:bg-slate-700 md:hidden">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div class="text-lg font-bold">EMS<span class="text-blue-400">.</span>
            <span class="ml-2 hidden text-sm font-normal text-slate-400 sm:inline">Manager Console</span>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span id="userLabel" class="hidden text-sm text-slate-300 sm:inline">${esc(user.username || 'Manager')}</span>
          <button id="logoutBtn" class="rounded-lg bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600">Logout</button>
        </div>
      </div>
      <nav id="ems-navLinks" class="hidden border-t border-slate-800 md:block">
        <div class="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-2 text-sm sm:px-6 md:flex-row md:flex-wrap">
          ${links}
        </div>
      </nav>`;

    const mount = document.getElementById('ems-nav');
    if (mount) mount.replaceWith(header);
    else document.body.insertBefore(header, document.body.firstChild);

    // Hamburger toggle (mobile): show/hide the link list.
    const toggle = document.getElementById('ems-navToggle');
    const navLinks = document.getElementById('ems-navLinks');
    if (toggle && navLinks) {
      toggle.addEventListener('click', () => navLinks.classList.toggle('hidden'));
    }

    const logout = document.getElementById('logoutBtn');
    if (logout) logout.addEventListener('click', () => { localStorage.clear(); location.href = 'login.html'; });
  }

  window.EMS = { buildNav, toast, confirmEdit, esc };
  // Backwards-compatible alias used by some inline scripts.
  window.emsToast = (msg, type) => toast(msg, type || 'info');
})();

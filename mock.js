// EMS in-browser mock backend.
// Intercepts fetch() calls to http://localhost:3000/api/* and serves them
// from localStorage. Includes referential-integrity cascades (delete +
// auto-link on Employee role) so the demo behaves like the real backend.
//
// To remove the mock: delete this file. Optionally remove the
// <script src="mock.js"></script> tags from each HTML page.

(function () {
  const API_BASE = 'http://localhost:3000';
  const KEY_PREFIX = 'ems_mock_';
  const SEEDED_KEY = 'ems_mock_seeded_v2';

  // ---------- seed data ----------
  const SEED = {
    roles: [
      { role_code: 'RC1', role_type: 'Manager' },
      { role_code: 'RC2', role_type: 'Team Lead' },
      { role_code: 'RC3', role_type: 'Core' },
      { role_code: 'RC4', role_type: 'SME' },
      { role_code: 'RC5', role_type: 'Trainee' },
    ],
    tenurities: [
      { tenurity_code: 'TN1', class: 'New Hire' },
      { tenurity_code: 'TN2', class: 'Repeater' },
      { tenurity_code: 'TN3', class: 'Tenured' },
    ],
    rooms: [
      { room_id: 'RM1', room_name: '7th Floor Higantes' },
      { room_id: 'RM2', room_name: '8th Floor Atlas' },
      { room_id: 'RM3', room_name: '9th Floor Olympus' },
    ],
    trainings: [
      { training_id: 'T001', room_id: 'RM1', training_start: '2026-03-23T21:00:00.000Z', training_end: '2026-03-24T06:00:00.000Z' },
      { training_id: 'T002', room_id: 'RM2', training_start: '2026-04-10T13:00:00.000Z', training_end: '2026-04-10T22:00:00.000Z' },
    ],
    shifts: [
      { shift_id: 'S001', room_id: 'RM1', shift_value: '1', shift_start: '2026-04-09T19:30:00.000Z', shift_end: '2026-04-11T04:30:00.000Z' },
      { shift_id: 'S002', room_id: 'RM2', shift_value: '2', shift_start: '2026-04-09T11:30:00.000Z', shift_end: '2026-04-10T20:30:00.000Z' },
    ],
    'team-leads': [
      { tlead_id: 'TL001', emp_id: '10008502', tlead_name: 'Aldwin Salameda' },
      { tlead_id: 'TL002', emp_id: '10008601', tlead_name: 'Maricar Reyes' },
    ],
    smes: [
      { sme_id: 'SME001', emp_id: '10008651', sme_name: 'Mark Baguiao' },
      { sme_id: 'SME002', emp_id: '10008702', sme_name: 'Liza Cortez' },
    ],
    management: [
      { mgmt_id: 'MG001', training_id: 'T001', shift_id: 'S001', tlead_id: 'TL001', sme_id: 'SME001' },
      { mgmt_id: 'MG002', training_id: 'T002', shift_id: 'S002', tlead_id: 'TL002', sme_id: 'SME002' },
    ],
    employees: [
      { emp_id: '10008502', mgmt_id: 'MG001', full_name: 'Aldwin Salameda', personal_email: 'aldwin@example.com', contact_number: '9170000001', tenurity: 'Tenured',  role: 'Team Lead', status: 'Active' },
      { emp_id: '10008651', mgmt_id: 'MG001', full_name: 'Mark Baguiao',    personal_email: 'mark@example.com',   contact_number: '9170000002', tenurity: 'Tenured',  role: 'SME',       status: 'Active' },
      { emp_id: '10009302', mgmt_id: 'MG001', full_name: 'Jorge Camama',    personal_email: 'jorge@example.com',  contact_number: '9156390467', tenurity: 'Repeater', role: 'Core',      status: 'Active' },
      { emp_id: '10009501', mgmt_id: 'MG002', full_name: 'Anna Lim',        personal_email: 'anna@example.com',   contact_number: '9170000003', tenurity: 'New Hire', role: 'Trainee',   status: 'On Leave' },
      { emp_id: '10008601', mgmt_id: 'MG002', full_name: 'Maricar Reyes',   personal_email: 'maricar@example.com',contact_number: '9170000004', tenurity: 'Tenured',  role: 'Team Lead', status: 'Active' },
      { emp_id: '10008702', mgmt_id: 'MG002', full_name: 'Liza Cortez',     personal_email: 'liza@example.com',   contact_number: '9170000005', tenurity: 'Repeater', role: 'SME',       status: 'Inactive' },
    ],
    users: [
      { user_id: 1, emp_id: '10009302', username: 'jorge',  email: 'jorge@example.com',  password: 'jorge123',  date_time_created: '2026-01-15T02:22:00.000Z' },
      { user_id: 2, emp_id: '10008502', username: 'aldwin', email: 'aldwin@example.com', password: 'aldwin123', date_time_created: '2026-01-16T03:10:00.000Z' },
      { user_id: 3, emp_id: '10008651', username: 'mark',   email: 'mark@example.com',   password: 'mark123',   date_time_created: '2026-01-17T08:45:00.000Z' },
    ],
  };

  const PK = {
    employees: 'emp_id', management: 'mgmt_id', 'team-leads': 'tlead_id',
    smes: 'sme_id', trainings: 'training_id', shifts: 'shift_id',
    rooms: 'room_id', users: 'user_id', roles: 'role_code', tenurities: 'tenurity_code',
  };
  const READONLY = new Set(['roles', 'tenurities']);

  // ---------- storage ----------
  function load(r)        { const raw = localStorage.getItem(KEY_PREFIX + r); return raw ? JSON.parse(raw) : []; }
  function save(r, rows)  { localStorage.setItem(KEY_PREFIX + r, JSON.stringify(rows)); }
  function seedIfNeeded() {
    if (localStorage.getItem(SEEDED_KEY)) return;
    Object.entries(SEED).forEach(([r, rows]) => save(r, rows));
    localStorage.setItem(SEEDED_KEY, '1');
  }
  function resetAll() {
    Object.keys(SEED).forEach((r) => localStorage.removeItem(KEY_PREFIX + r));
    localStorage.removeItem(SEEDED_KEY);
    seedIfNeeded();
  }
  seedIfNeeded();

  function jres(body, status) {
    return new Response(body == null ? null : JSON.stringify(body), {
      status: status || 200,
      headers: body == null ? {} : { 'Content-Type': 'application/json' },
    });
  }
  const err = (s, m) => jres({ message: m }, s);

  // ---------- cascade helpers (mutate stored data) ----------
  // Returns a list of human-readable strings of what changed.
  function cascadeDelete(resource, id) {
    const log = [];
    if (resource === 'employees') {
      // delete tlead row referencing this emp, plus null-out management.tlead_id
      const tls = load('team-leads');
      tls.filter((t) => String(t.emp_id) === String(id)).forEach((t) => {
        log.push(`Deleted team-lead ${t.tlead_id} (${t.tlead_name})`);
        cascadeDelete('team-leads', t.tlead_id).forEach((m) => log.push(m));
      });
      save('team-leads', load('team-leads').filter((t) => String(t.emp_id) !== String(id)));

      const sms = load('smes');
      sms.filter((s) => String(s.emp_id) === String(id)).forEach((s) => {
        log.push(`Deleted SME ${s.sme_id} (${s.sme_name})`);
        cascadeDelete('smes', s.sme_id).forEach((m) => log.push(m));
      });
      save('smes', load('smes').filter((s) => String(s.emp_id) !== String(id)));

      const us = load('users');
      const removedUsers = us.filter((u) => String(u.emp_id) === String(id));
      removedUsers.forEach((u) => log.push(`Deleted user account '${u.username}' (user_id ${u.user_id})`));
      save('users', us.filter((u) => String(u.emp_id) !== String(id)));
    }
    if (resource === 'team-leads') {
      const mg = load('management');
      let touched = 0;
      mg.forEach((m) => { if (String(m.tlead_id) === String(id)) { m.tlead_id = null; touched++; } });
      if (touched) { save('management', mg); log.push(`Unassigned team lead from ${touched} management record(s)`); }
    }
    if (resource === 'smes') {
      const mg = load('management');
      let t = 0;
      mg.forEach((m) => { if (String(m.sme_id) === String(id)) { m.sme_id = null; t++; } });
      if (t) { save('management', mg); log.push(`Unassigned SME from ${t} management record(s)`); }
    }
    if (resource === 'trainings') {
      const mg = load('management');
      let t = 0;
      mg.forEach((m) => { if (String(m.training_id) === String(id)) { m.training_id = null; t++; } });
      if (t) { save('management', mg); log.push(`Cleared training from ${t} management record(s)`); }
    }
    if (resource === 'shifts') {
      const mg = load('management');
      let t = 0;
      mg.forEach((m) => { if (String(m.shift_id) === String(id)) { m.shift_id = null; t++; } });
      if (t) { save('management', mg); log.push(`Cleared shift from ${t} management record(s)`); }
    }
    if (resource === 'rooms') {
      const tr = load('trainings'); let t1 = 0;
      tr.forEach((x) => { if (String(x.room_id) === String(id)) { x.room_id = null; t1++; } });
      if (t1) { save('trainings', tr); log.push(`Cleared room from ${t1} training(s)`); }
      const sh = load('shifts'); let t2 = 0;
      sh.forEach((x) => { if (String(x.room_id) === String(id)) { x.room_id = null; t2++; } });
      if (t2) { save('shifts', sh); log.push(`Cleared room from ${t2} shift(s)`); }
    }
    if (resource === 'management') {
      const emp = load('employees'); let t = 0;
      emp.forEach((e) => { if (String(e.mgmt_id) === String(id)) { e.mgmt_id = null; t++; } });
      if (t) { save('employees', emp); log.push(`Unassigned management from ${t} employee(s)`); }
    }
    return log;
  }

  // What WOULD happen on delete (for /api/_preflight)
  function preflight(resource, id) {
    const warnings = [];
    if (resource === 'employees') {
      load('team-leads').filter((t) => String(t.emp_id) === String(id))
        .forEach((t) => warnings.push(`Will also delete team-lead ${t.tlead_id} (${t.tlead_name})`));
      load('smes').filter((s) => String(s.emp_id) === String(id))
        .forEach((s) => warnings.push(`Will also delete SME ${s.sme_id} (${s.sme_name})`));
      load('users').filter((u) => String(u.emp_id) === String(id))
        .forEach((u) => warnings.push(`Will also delete user account '${u.username}'`));
      const tlIds = load('team-leads').filter((t) => String(t.emp_id) === String(id)).map((t) => t.tlead_id);
      const smeIds = load('smes').filter((s) => String(s.emp_id) === String(id)).map((s) => s.sme_id);
      const mgT = load('management').filter((m) => tlIds.includes(m.tlead_id));
      const mgS = load('management').filter((m) => smeIds.includes(m.sme_id));
      mgT.forEach((m) => warnings.push(`Management ${m.mgmt_id} will be unassigned from team lead`));
      mgS.forEach((m) => warnings.push(`Management ${m.mgmt_id} will be unassigned from SME`));
    } else if (resource === 'team-leads') {
      load('management').filter((m) => String(m.tlead_id) === String(id))
        .forEach((m) => warnings.push(`Management ${m.mgmt_id} will be unassigned from team lead`));
    } else if (resource === 'smes') {
      load('management').filter((m) => String(m.sme_id) === String(id))
        .forEach((m) => warnings.push(`Management ${m.mgmt_id} will be unassigned from SME`));
    } else if (resource === 'trainings') {
      load('management').filter((m) => String(m.training_id) === String(id))
        .forEach((m) => warnings.push(`Management ${m.mgmt_id} will lose its training`));
    } else if (resource === 'shifts') {
      load('management').filter((m) => String(m.shift_id) === String(id))
        .forEach((m) => warnings.push(`Management ${m.mgmt_id} will lose its shift`));
    } else if (resource === 'rooms') {
      load('trainings').filter((t) => String(t.room_id) === String(id))
        .forEach((t) => warnings.push(`Training ${t.training_id} will lose its room`));
      load('shifts').filter((s) => String(s.room_id) === String(id))
        .forEach((s) => warnings.push(`Shift ${s.shift_id} will lose its room`));
    } else if (resource === 'management') {
      load('employees').filter((e) => String(e.mgmt_id) === String(id))
        .forEach((e) => warnings.push(`Employee ${e.emp_id} (${e.full_name}) will be unassigned from management`));
    }
    return warnings;
  }

  // Auto-link on Employee role = Team Lead / SME (insertion anomaly fix)
  function autoLinkEmployee(emp, prevRole) {
    const log = [];
    const tls = load('team-leads');
    const sms = load('smes');

    // Team Lead
    const hasTL = tls.find((t) => String(t.emp_id) === String(emp.emp_id));
    if (emp.role === 'Team Lead' && !hasTL) {
      const tl = { tlead_id: 'TL-' + emp.emp_id, emp_id: emp.emp_id, tlead_name: emp.full_name };
      tls.push(tl); save('team-leads', tls);
      log.push(`Auto-created team-lead record ${tl.tlead_id} for ${emp.full_name}`);
    } else if (hasTL && emp.role === 'Team Lead' && hasTL.tlead_name !== emp.full_name) {
      hasTL.tlead_name = emp.full_name; save('team-leads', tls);
    } else if (hasTL && emp.role !== 'Team Lead' && prevRole === 'Team Lead') {
      const removed = cascadeDelete('team-leads', hasTL.tlead_id);
      save('team-leads', load('team-leads').filter((t) => t.tlead_id !== hasTL.tlead_id));
      log.push(`Removed team-lead ${hasTL.tlead_id} (role changed away from Team Lead)`);
      removed.forEach((m) => log.push(m));
    }

    // SME
    const hasSME = sms.find((s) => String(s.emp_id) === String(emp.emp_id));
    if (emp.role === 'SME' && !hasSME) {
      const s = { sme_id: 'SME-' + emp.emp_id, emp_id: emp.emp_id, sme_name: emp.full_name };
      const cur = load('smes'); cur.push(s); save('smes', cur);
      log.push(`Auto-created SME record ${s.sme_id} for ${emp.full_name}`);
    } else if (hasSME && emp.role === 'SME' && hasSME.sme_name !== emp.full_name) {
      hasSME.sme_name = emp.full_name; save('smes', sms);
    } else if (hasSME && emp.role !== 'SME' && prevRole === 'SME') {
      const removed = cascadeDelete('smes', hasSME.sme_id);
      save('smes', load('smes').filter((x) => x.sme_id !== hasSME.sme_id));
      log.push(`Removed SME ${hasSME.sme_id} (role changed away from SME)`);
      removed.forEach((m) => log.push(m));
    }

    return log;
  }

  // ---------- request handler ----------
  async function handle(method, path, body) {
    if (path === '/api/auth/login' && method === 'POST') {
      const u = (body && body.username || '').trim();
      const p = (body && body.password || '').trim();
      if (!u || !p) return err(400, 'Username and password required');
      return jres({ token: 'mock.' + btoa(u + ':' + Date.now()),
        user: { id: 0, username: u, email: u + '@example.com', role: 'Manager' } });
    }
    if (path === '/api/auth/me' && method === 'GET') {
      return jres({ id: 0, username: 'demo', email: 'demo@example.com', role: 'Manager' });
    }

    // Preflight: GET /api/_preflight/<resource>/<id>
    const pf = path.match(/^\/api\/_preflight\/([a-z-]+)\/(.+)$/);
    if (pf && method === 'GET') {
      const r = pf[1]; const id = decodeURIComponent(pf[2]);
      if (!(r in PK)) return err(404, 'unknown resource');
      return jres({ warnings: preflight(r, id) });
    }

    const m = path.match(/^\/api\/([a-z-]+)(?:\/(.+))?$/);
    if (!m) return err(404, 'Mock: route not found ' + path);
    const resource = m[1];
    const id = m[2] ? decodeURIComponent(m[2]) : null;
    if (!(resource in PK)) return err(404, 'Mock: unknown resource ' + resource);

    const pk = PK[resource];
    const rows = load(resource);

    if (method === 'GET' && id === null) return jres(rows);
    if (method === 'GET') {
      const row = rows.find((r) => String(r[pk]) === String(id));
      return row ? jres(row) : err(404, resource + ' not found');
    }

    if (READONLY.has(resource) && method !== 'GET') return err(405, resource + ' is read-only');

    if (method === 'POST') {
      const next = Object.assign({}, body);
      if (resource === 'users') {
        next.user_id = (rows.reduce((a, r) => Math.max(a, r.user_id || 0), 0)) + 1;
        next.date_time_created = new Date().toISOString();
        if (!next.username || !next.email || !next.password) return err(400, 'username, email, password required');
      } else {
        if (!next[pk]) return err(400, pk + ' required');
        if (rows.some((r) => String(r[pk]) === String(next[pk]))) return err(409, 'Duplicate ' + pk);
      }
      rows.push(next); save(resource, rows);

      let cascadeLog = [];
      if (resource === 'employees') cascadeLog = autoLinkEmployee(next, null);

      return jres(Object.assign({}, next, cascadeLog.length ? { _cascade: cascadeLog } : {}), 201);
    }

    if (method === 'PUT') {
      const i = rows.findIndex((r) => String(r[pk]) === String(id));
      if (i < 0) return err(404, resource + ' not found');
      const prev = rows[i];
      const merged = Object.assign({}, prev, body);
      merged[pk] = prev[pk];
      if (resource === 'users' && (!body || !body.password)) merged.password = prev.password;
      rows[i] = merged; save(resource, rows);

      let cascadeLog = [];
      if (resource === 'employees') cascadeLog = autoLinkEmployee(merged, prev.role);

      return jres(Object.assign({}, merged, cascadeLog.length ? { _cascade: cascadeLog } : {}));
    }

    if (method === 'DELETE') {
      const i = rows.findIndex((r) => String(r[pk]) === String(id));
      if (i < 0) return err(404, resource + ' not found');
      const cascadeLog = cascadeDelete(resource, id);
      const cur = load(resource);
      const j = cur.findIndex((r) => String(r[pk]) === String(id));
      if (j >= 0) { cur.splice(j, 1); save(resource, cur); }
      return jres({ deleted: true, _cascade: cascadeLog }, 200);
    }

    return err(405, 'Method not allowed');
  }

  // ---------- fetch wrapper ----------
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.startsWith(API_BASE)) return realFetch(input, init);
    const path = url.slice(API_BASE.length).split('?')[0];
    const method = ((init && init.method) || 'GET').toUpperCase();
    let body = null;
    if (init && init.body) { try { body = JSON.parse(init.body); } catch { body = null; } }
    await new Promise((r) => setTimeout(r, 60));
    try { return await handle(method, path, body); }
    catch (e) { return err(500, 'Mock error: ' + (e && e.message || e)); }
  };

  // ---------- toast ----------
  window.emsToast = function (msg, kind) {
    let host = document.getElementById('emsToastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'emsToastHost';
      host.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    const color = kind === 'error' ? 'bg-red-600' : (kind === 'warn' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800');
    el.className = `${color} text-white text-sm rounded-lg px-4 py-2 shadow-lg max-w-sm whitespace-pre-line`;
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 350); }, 4500);
  };

  // ---------- shared helper used by every page's delete button ----------
  // Fetches preflight warnings, shows a confirm dialog, then DELETEs.
  // Returns the parsed JSON (with _cascade list) on success, throws on failure or cancel.
  window.emsDeleteWithCascade = async function (resource, id, label) {
    const token = localStorage.getItem('ems_token') || '';
    let warnings = [];
    try {
      const res = await fetch(`${API_BASE}/api/_preflight/${resource}/${encodeURIComponent(id)}`, {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.ok) { const data = await res.json(); warnings = data.warnings || []; }
    } catch {}
    const headline = `Delete ${label || resource + ' ' + id}?`;
    const lines = warnings.length
      ? '\n\nThis will also:\n  • ' + warnings.join('\n  • ')
      : '';
    if (!confirm(headline + lines)) throw new Error('cancelled');
    const res = await fetch(`${API_BASE}/api/${resource}/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + token },
    });
    if (!res.ok) {
      let m = `${res.status} ${res.statusText}`;
      try { const d = await res.json(); if (d && d.message) m = d.message; } catch {}
      throw new Error(m);
    }
    let data = null; try { data = await res.json(); } catch {}
    if (data && data._cascade && data._cascade.length) {
      window.emsToast('Cascade:\n' + data._cascade.map((x) => '• ' + x).join('\n'), 'warn');
    }
    return data;
  };

  // ---------- DEMO MODE banner ----------
  function injectBadge() {
    if (document.getElementById('mockBadge')) return;
    const bar = document.createElement('div');
    bar.id = 'mockBadge';
    bar.className = 'bg-yellow-400 text-slate-900 text-xs';
    bar.innerHTML = `
      <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-1.5">
        <span><strong>DEMO MODE</strong> — using in-browser mock backend with cascade rules. Data saved in your browser only.</span>
        <button id="mockResetBtn" class="rounded bg-slate-900 px-2 py-1 text-white hover:bg-slate-700">Reset demo data</button>
      </div>`;
    const headerEl = document.querySelector('header');
    if (headerEl && headerEl.parentNode) headerEl.parentNode.insertBefore(bar, headerEl);
    else document.body.insertBefore(bar, document.body.firstChild);
    document.getElementById('mockResetBtn').addEventListener('click', () => {
      if (!confirm('Reset all demo data back to the seed?')) return;
      resetAll(); location.reload();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectBadge);
  else injectBadge();

  window.__emsMock = { reset: resetAll, load, save, SEED, preflight };
})();

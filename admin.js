/* ════════════════════════════════════════════════════════════════════
   KHALSA AKHARA WRESTLING COVENTRY — admin.js
   Dashboard logic: login, stats, member/prospect/message management.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var loginView = document.getElementById('loginView');
  var appView   = document.getElementById('appView');
  var loginForm = document.getElementById('loginForm');
  var loginError = document.getElementById('loginError');
  var dashError  = document.getElementById('dashError');

  /* ────────────────────────── helpers ─────────────────────────────── */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ageFromDob(dob) {
    if (!dob) return '—';
    var d = new Date(dob + 'T00:00:00Z');
    if (isNaN(d.getTime())) return '—';
    var now = new Date();
    var age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
    return age;
  }

  function fmtWhen(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtMonth(ym) {
    if (!ym) return null;
    var m = ym.split('-');
    var names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[parseInt(m[1], 10) - 1] + ' ' + m[0];
  }

  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }

  function showLogin() { hide(appView); show(loginView); }
  function showApp()   { hide(loginView); show(appView); }

  async function api(path, opts) {
    var res = await fetch(path, opts);
    if (res.status === 401) { showLogin(); throw new Error('Not logged in.'); }
    var json = await res.json().catch(function () { return {}; });
    if (!res.ok || !json.ok) {
      throw new Error(json.error || 'Request failed.');
    }
    return json;
  }

  /* ────────────────────────── login ───────────────────────────────── */
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    hide(loginError);
    var btn = loginForm.querySelector('button');
    btn.disabled = true;
    try {
      await api('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: document.getElementById('loginPassword').value })
      });
      document.getElementById('loginPassword').value = '';
      await loadDashboard();
      showApp();
    } catch (err) {
      loginError.textContent = err.message === 'Not logged in.' ? 'Incorrect password.' : err.message;
      show(loginError);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async function () {
    try { await api('/api/logout', { method: 'POST' }); } catch (e) { /* fine */ }
    showLogin();
  });

  document.getElementById('refreshBtn').addEventListener('click', function () {
    loadDashboard();
  });

  /* ────────────────────────── rendering ───────────────────────────── */
  function emptyRow(cols, text) {
    return '<tr class="empty-row"><td colspan="' + cols + '">' + esc(text) + '</td></tr>';
  }

  function renderMembers(members, currentMonth) {
    var body = document.getElementById('membersBody');
    document.getElementById('membersCount').textContent = '(' + members.length + ')';
    if (!members.length) {
      body.innerHTML = emptyRow(9, 'No members yet — sign-ups from the website will appear here.');
      return;
    }
    body.innerHTML = members.map(function (m) {
      var age = ageFromDob(m.dob);
      var paidThisMonth = m.paid_month === currentMonth;
      var guardian = m.guardian_name
        ? esc(m.guardian_name) + '<span class="sub">' + esc(m.guardian_phone || '') + '</span>'
        : '<span class="sub">—</span>';
      var contact = (m.email || m.phone)
        ? '<span class="sub">' + esc(m.email || '') + '</span><span class="sub">' + esc(m.phone || '') + '</span>'
        : '<span class="sub">—</span>';
      var statusChip = m.status === 'Active'
        ? '<button class="chip chip--active" data-act="member-status" data-id="' + m.id + '">Active</button>'
        : '<button class="chip chip--pending" data-act="member-status" data-id="' + m.id + '">Pending</button>';
      var paidCell = paidThisMonth
        ? '<span class="chip chip--paid">Paid ✓</span>'
        : '<span class="sub">' + (m.paid_month ? 'Last: ' + esc(fmtMonth(m.paid_month) || m.paid_month) : 'Never') + '</span>' +
          ' <button class="mini-btn mini-btn--solid" data-act="member-pay" data-id="' + m.id + '">Mark Paid</button>';
      return '<tr>' +
        '<td><span class="strong">' + esc(m.wrestler_name) + '</span>' +
          (m.under16 ? ' <span class="chip chip--new">U16</span>' : '') + '</td>' +
        '<td>' + age + '</td>' +
        '<td>' + guardian + '</td>' +
        '<td>' + contact + '</td>' +
        '<td>' + (m.weight_kg ? esc(m.weight_kg) + ' kg' : '<span class="sub">—</span>') + '</td>' +
        '<td class="sub">' + esc(fmtWhen(m.created_at)) + '</td>' +
        '<td>' + statusChip + '</td>' +
        '<td>' + paidCell + '</td>' +
        '<td class="col-actions"><button class="mini-btn mini-btn--danger" data-act="member-del" data-id="' + m.id + '">Delete</button></td>' +
        '</tr>';
    }).join('');
  }

  function renderProspects(prospects) {
    var body = document.getElementById('prospectsBody');
    document.getElementById('prospectsCount').textContent = '(' + prospects.length + ')';
    if (!prospects.length) {
      body.innerHTML = emptyRow(7, 'No prospects yet — info requests from the website will appear here.');
      return;
    }
    body.innerHTML = prospects.map(function (p) {
      var statusChip = p.status === 'Contacted'
        ? '<button class="chip chip--contacted" data-act="prospect-status" data-id="' + p.id + '">Contacted</button>'
        : '<button class="chip chip--new" data-act="prospect-status" data-id="' + p.id + '">New</button>';
      var q = new URLSearchParams({
        name: p.name, email: p.email, wrestler: p.wrestler_name || p.name, age: p.wrestler_age || ''
      }).toString();
      return '<tr>' +
        '<td><span class="strong">' + esc(p.name) + '</span></td>' +
        '<td><span class="sub">' + esc(p.email) + '</span></td>' +
        '<td>' + esc(p.wrestler_name) + '</td>' +
        '<td>' + esc(p.wrestler_age) + '</td>' +
        '<td class="sub">' + esc(fmtWhen(p.created_at)) + '</td>' +
        '<td>' + statusChip + '</td>' +
        '<td class="col-actions">' +
          '<a class="mini-btn mini-btn--solid" href="/join.html?' + q.replace(/\+/g, '%20') + '" target="_blank" rel="noopener">Convert →</a>' +
          '<button class="mini-btn mini-btn--danger" data-act="prospect-del" data-id="' + p.id + '">Delete</button>' +
        '</td></tr>';
    }).join('');
  }

  function renderMessages(messages) {
    var body = document.getElementById('messagesBody');
    document.getElementById('messagesCount').textContent = '(' + messages.length + ')';
    if (!messages.length) {
      body.innerHTML = emptyRow(7, 'No messages yet — contact-form enquiries will appear here.');
      return;
    }
    body.innerHTML = messages.map(function (m) {
      var readBtn = m.read
        ? '<button class="mini-btn mini-btn--ghost" data-act="msg-read" data-id="' + m.id + '">Unread</button>'
        : '<button class="mini-btn mini-btn--solid" data-act="msg-read" data-id="' + m.id + '">Read</button>';
      return '<tr class="' + (m.read ? '' : 'is-unread') + '">' +
        '<td><span class="strong from-name">' + esc(m.name) + '</span></td>' +
        '<td><span class="sub">' + esc(m.email) + '</span></td>' +
        '<td><span class="sub">' + esc(m.phone || '—') + '</span></td>' +
        '<td><span class="sub">' + esc(m.subject || '—') + '</span></td>' +
        '<td class="msg-cell">' + esc(m.body) + '</td>' +
        '<td class="sub">' + esc(fmtWhen(m.created_at)) + '</td>' +
        '<td class="col-actions">' + readBtn +
          '<button class="mini-btn mini-btn--danger" data-act="msg-del" data-id="' + m.id + '">Delete</button></td>' +
        '</tr>';
    }).join('');
  }

  async function loadDashboard() {
    hide(dashError);
    try {
      var d = await api('/api/dashboard');
      document.getElementById('statMembers').textContent = d.members.length;
      document.getElementById('statActive').textContent = d.members.filter(function (m) { return m.status === 'Active'; }).length;
      document.getElementById('statPaid').textContent = d.members.filter(function (m) { return m.paid_month === d.currentMonth; }).length;
      document.getElementById('statProspects').textContent = d.prospects.filter(function (p) { return p.status === 'New'; }).length;
      renderMembers(d.members, d.currentMonth);
      renderProspects(d.prospects);
      renderMessages(d.messages);
    } catch (err) {
      if (err.message !== 'Not logged in.') {
        dashError.textContent = 'Could not load the dashboard: ' + err.message;
        show(dashError);
      }
    }
  }

  /* ────────────────────────── row actions ─────────────────────────── */
  /* Status toggles need the *other* value — read it from the button label. */
  function togglePayload(btn) {
    var label = (btn.textContent || '').trim().toLowerCase();
    if (label === 'active' || label === 'contacted' || label === 'read') return 'off';
    return 'on';
  }

  document.querySelectorAll('tbody').forEach(function (tbody) {
    tbody.addEventListener('click', async function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.dataset.act;
      var id = parseInt(btn.dataset.id, 10);

      if (act.indexOf('-del') > -1) {
        if (!confirm('Delete this record? This cannot be undone.')) return;
      }

      var payload = null;
      if (act === 'member-status')  payload = { status: togglePayload(btn) === 'on' ? 'Active' : 'Pending' };
      if (act === 'prospect-status') payload = { status: togglePayload(btn) === 'on' ? 'Contacted' : 'New' };
      if (act === 'msg-read')       payload = { read: togglePayload(btn) === 'on' ? 1 : 0 };

      var make = act === 'member-status' || act === 'member-pay' || act === 'member-del' ? '/api/members/' + id : null;
      make = make || (act === 'prospect-status' || act === 'prospect-del' ? '/api/prospects/' + id : null);
      make = make || (act === 'msg-read' || act === 'msg-del' ? '/api/messages/' + id : null);

      var url = make;
      if (act === 'member-pay') url += '/pay';

      var opts = {
        method: act === 'member-pay' ? 'POST' : (act.indexOf('-del') > -1 ? 'DELETE' : 'PATCH')
      };
      if (payload) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(payload);
      }

      try {
        await api(url, opts);
        await loadDashboard();
      } catch (err) {
        if (err.message !== 'Not logged in.') {
          dashError.textContent = 'Action failed: ' + err.message;
          show(dashError);
        }
      }
    });
  });

  /* ────────────────────────── boot ────────────────────────────────── */
  (async function boot() {
    try {
      var s = await fetch('/api/session');
      var j = await s.json();
      if (s.ok && j.authed) {
        await loadDashboard();
        showApp();
      } else {
        showLogin();
      }
    } catch (e) {
      loginError.textContent = 'Could not reach the server — is it running? (node server.js)';
      show(loginError);
      showLogin();
    }
  })();
})();

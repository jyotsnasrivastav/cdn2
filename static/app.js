/* ============================================================
   ShortTrack — frontend logic (landing + dashboard)
   ============================================================ */
'use strict';

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch { return ''; } };

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
  return data;
}

async function copyText(txt, btn) {
  try {
    await navigator.clipboard.writeText(txt);
    if (btn) { const old = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => (btn.textContent = old), 1400); }
  } catch {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    if (btn) { const old = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => (btn.textContent = old), 1400); }
  }
}

/* ============================================================
   LANDING (index.html)
   ============================================================ */
function initLanding() {
  const modal = $('authModal');
  if (!modal) return;

  let mode = 'login'; // 'login' | 'signup'
  let signupMode = 'open'; // 'open' | 'invite' | 'closed'
  fetch('/api/config').then((r) => r.json()).then((c) => { signupMode = c.signupMode || 'open'; }).catch(() => {});

  const open = (m) => {
    mode = m;
    $('tabLogin').classList.toggle('active', m === 'login');
    $('tabSignup').classList.toggle('active', m === 'signup');
    $('authErr').textContent = '';
    $('aPass').autocomplete = m === 'login' ? 'current-password' : 'new-password';

    if (m === 'signup' && signupMode === 'closed') {
      $('authTitle').textContent = 'Registration closed';
      $('authSub').textContent = 'This instance is private — ask your admin to create your account';
      $('authForm').style.display = 'none';
      $('inviteField').style.display = 'none';
    } else {
      $('authTitle').textContent = m === 'login' ? 'Welcome back' : 'Create your account';
      $('authSub').textContent = m === 'login' ? 'Sign in to your dashboard' : (signupMode === 'invite' ? 'Requires an invite code' : 'Free forever — takes 10 seconds');
      $('authBtn').textContent = m === 'login' ? 'Sign in' : 'Create account';
      $('authForm').style.display = '';
      $('inviteField').style.display = m === 'signup' && signupMode === 'invite' ? '' : 'none';
    }
    modal.classList.add('open');
    setTimeout(() => $('aUser').focus(), 60);
  };

  $('navLogin').onclick = () => open('login');
  $('navSignup').onclick = () => open('signup');
  $('heroCta').onclick = () => open('signup');
  $('authClose').onclick = () => modal.classList.remove('open');
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
  $('tabLogin').onclick = () => open('login');
  $('tabSignup').onclick = () => open('signup');

  $('authForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('authBtn');
    btn.disabled = true;
    $('authErr').textContent = '';
    try {
      await api('/api/' + (mode === 'login' ? 'login' : 'register'), {
        method: 'POST',
        body: JSON.stringify({
          username: $('aUser').value.trim(),
          password: $('aPass').value,
          invite: $('aInvite') ? $('aInvite').value.trim() : '',
        }),
      });
      location.href = '/dashboard.html';
    } catch (err) {
      $('authErr').textContent = err.message;
      btn.disabled = false;
    }
  };

  if (new URLSearchParams(location.search).get('login') === '1') open('login');
}

/* ============================================================
   DASHBOARD (dashboard.html)
   ============================================================ */
let links = [];
let selectedCode = null;
let charts = {};

function destroyChart(name) { if (charts[name]) { charts[name].destroy(); delete charts[name]; } }

async function initDashboard() {
  if (!document.querySelector('.layout')) return;

  let me;
  try { me = await api('/api/me'); } catch { me = null; }
  if (!me || !me.username) { location.href = '/?login=1'; return; }
  $('userName').textContent = me.username;

  // Admin-only team management (when SIGNUP_MODE is closed/invite)
  if (me.isAdmin) {
    $('teamCard').style.display = '';
    loadTeam();
    $('tmAdd').onclick = async () => {
      $('tmErr').textContent = '';
      try {
        await api('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify({ username: $('tmUser').value.trim(), password: $('tmPass').value }),
        });
        $('tmUser').value = ''; $('tmPass').value = '';
        await loadTeam();
      } catch (err) { $('tmErr').textContent = err.message; }
    };
  }

  // view switching
  const views = ['overview', 'links', 'analytics'];
  const switchView = (v) => {
    views.forEach((x) => {
      $('view-' + x).hidden = x !== v;
      document.querySelector(`.side-nav button[data-view="${x}"]`).classList.toggle('active', x === v);
    });
    $('pageTitle').textContent =
      v === 'overview' ? 'Dashboard' : v === 'links' ? 'My Links' : 'Analytics';
    if (v === 'analytics') openAnalyticsView();
  };
  document.querySelectorAll('.side-nav button').forEach((b) => {
    b.onclick = () => switchView(b.dataset.view);
  });
  $('newLinkBtn').onclick = () => switchView('links');
  $('backBtn').onclick = () => switchView('overview');

  $('logoutBtn').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.href = '/'; };

  // create link
  $('createBtn').onclick = async () => {
    const url = $('cUrl').value.trim();
    const code = $('cCode').value.trim();
    $('createErr').textContent = '';
    try {
      const r = await api('/api/links', {
        method: 'POST',
        body: JSON.stringify({ url, code, useWait: $('cWait').checked, mp4Style: $('cMp4').checked }),
      });
      $('rShort').textContent = r.short;
      $('rMp4').textContent = r.mp4;
      $('resultBox').classList.add('show');
      $('cUrl').value = ''; $('cCode').value = '';
      await refresh();
    } catch (err) { $('createErr').textContent = err.message; }
  };
  document.querySelectorAll('[data-copy]').forEach((b) => {
    b.onclick = () => copyText($(b.dataset.copy).textContent, b);
  });

  await refresh();
}

async function refresh() {
  links = await api('/api/links');
  renderOverview();
  renderLinks();
}

async function loadTeam() {
  try {
    const list = await api('/api/admin/users');
    $('tmList').innerHTML = list
      .map((u) => `<li><span>${esc(u.username)}${u.isAdmin ? ' <span class="tag">admin</span>' : ''}</span><span class="muted">${fmtDate(u.createdAt)}</span></li>`)
      .join('') || '<li class="muted">No members yet</li>';
  } catch { /* non-admin view */ }
}

function renderOverview() {
  const now = Date.now();
  const w7 = 7 * 24 * 3600_000;
  const totalClicks = links.reduce((a, l) => a + (l.clicks || 0), 0);
  const clicks7d = links.reduce((a, l) => a + (l.clicks7d || 0), 0);
  const links7d = links.filter((l) => now - new Date(l.createdAt).getTime() < w7).length;

  $('stTotalLinks').textContent = links.length;
  $('stTotalClicks').textContent = totalClicks;
  $('stClicks7d').textContent = clicks7d;
  $('stLinks7d').textContent = links7d;

  const recent = links.slice(0, 5);
  $('overviewEmpty').style.display = links.length ? 'none' : 'block';
  $('recentBody').innerHTML = recent.map(row).join('');
  attachRowActions();
}

function row(l) {
  const tags = (l.mp4Style ? '<span class="tag mp4">mp4</span> ' : '') + (l.useWait ? '<span class="tag">wait</span>' : '');
  return `<tr data-code="${esc(l.code)}">
    <td><strong>/${esc(l.code)}</strong><br>${tags}</td>
    <td><span class="dest" title="${esc(l.url)}">${esc(l.url)}</span></td>
    <td><strong>${l.clicks || 0}</strong></td>
    <td class="muted">${fmtDate(l.createdAt)}</td>
    <td><div class="cell-actions">
      <button class="btn btn-sm" data-act="copy" data-url="${esc(location.origin + '/' + l.code)}">Copy</button>
      <button class="btn btn-sm" data-act="copy-mp4" data-url="${esc(location.origin + '/' + l.code + '.mp4')}">.mp4</button>
      <button class="btn btn-sm" data-act="stats" data-code="${esc(l.code)}">Stats</button>
      <button class="btn btn-sm btn-danger" data-act="del" data-code="${esc(l.code)}">Delete</button>
    </div></td>
  </tr>`;
}

function renderLinks() {
  $('linksEmpty').style.display = links.length ? 'none' : 'block';
  $('linksBody').innerHTML = links.map(row).join('');
  attachRowActions();
}

function attachRowActions() {
  document.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const act = b.dataset.act;
      const code = b.dataset.code;
      if (act === 'copy' || act === 'copy-mp4') return copyText(b.dataset.url, b);
      if (act === 'stats') return openAnalyticsFor(code);
      if (act === 'del') {
        if (!confirm('Delete link /' + code + '?')) return;
        await api('/api/links/' + code, { method: 'DELETE' });
        await refresh();
      }
    };
  });
}

/* ---------- analytics ---------- */
async function openAnalyticsFor(code) {
  selectedCode = code;
  // switch to analytics view
  document.querySelectorAll('.side-nav button').forEach((x) => {
    x.classList.toggle('active', x.dataset.view === 'analytics');
  });
  ['overview', 'links'].forEach((x) => { $('view-' + x).hidden = true; });
  $('view-analytics').hidden = false;
  $('pageTitle').textContent = 'Analytics';
  await openAnalyticsView();
}

async function openAnalyticsView() {
  if (!selectedCode) {
    // no selection yet: pick first link
    if (!links.length) return;
    selectedCode = links[0].code;
  }
  const link = links.find((l) => l.code === selectedCode);
  if (!link) return;
  const s = await api('/api/links/' + selectedCode + '/stats');

  $('anLinkTitle').textContent = 'Analytics — /' + selectedCode;
  $('anLinkDest').textContent = link.url;
  $('anTotal').textContent = s.total;
  $('an7d').textContent = s.last7;
  $('anTopCountry').textContent = (s.byCountry[0] || ['—', 0])[0];
  $('anTopDevice').textContent = (s.byDevice[0] || ['—', 0])[0];

  // referers
  $('anReferers').innerHTML = s.byReferer.length
    ? s.byReferer.map(([k, v]) => `<li><span>${esc(k)}</span><span>${v}</span></li>`).join('')
    : '<li class="muted">No clicks yet</li>';

  if (typeof Chart === 'undefined') {
    document.querySelectorAll('.chart-box').forEach((c) => (c.innerHTML = '<p class="muted">Chart.js CDN blocked — stats data is still available above.</p>'));
    return;
  }

  const baseOpts = {
    color: '#93a0bd',
    grid: { color: 'rgba(37,49,90,.5)' },
    plugins: { legend: { labels: { color: '#e9edf8' } } },
  };

  destroyChart('line');
  charts.line = new Chart($('chartLine'), {
    type: 'line',
    data: {
      labels: s.byDay.map((d) => d.day.slice(5)),
      datasets: [{ label: 'Clicks', data: s.byDay.map((d) => d.count), borderColor: '#7c5cff', backgroundColor: 'rgba(124,92,255,.25)', fill: true, tension: .35, pointRadius: 2 }],
    },
    options: { ...baseOpts, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#93a0bd', maxTicksLimit: 7 } }, y: { ticks: { color: '#93a0bd', precision: 0 }, beginAtZero: true } } },
  });

  destroyChart('doughnut');
  charts.doughnut = new Chart($('chartDoughnut'), {
    type: 'doughnut',
    data: {
      labels: s.byDevice.map(([k]) => k),
      datasets: [{ data: s.byDevice.map(([, v]) => v), backgroundColor: ['#7c5cff', '#22d3ee', '#ff5c7c', '#34d399', '#fbbf24'] }],
    },
    options: baseOpts,
  });

  destroyChart('bar');
  charts.bar = new Chart($('chartBar'), {
    type: 'bar',
    data: {
      labels: s.byCountry.map(([k]) => k),
      datasets: [{ label: 'Clicks', data: s.byCountry.map(([, v]) => v), backgroundColor: 'rgba(34,211,238,.55)', borderColor: '#22d3ee', borderWidth: 1 }],
    },
    options: { ...baseOpts, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#93a0bd', precision: 0 }, beginAtZero: true } } },
  });
}

/* ---------- boot ---------- */
if (document.getElementById('view-overview')) {
  initDashboard();
} else {
  initLanding();
}

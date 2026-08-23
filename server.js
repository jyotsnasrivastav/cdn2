// ============================================================================
// ShortTrack — full link shortener + click analytics (vidy.my-style, A to Z)
// ============================================================================
// Product: shorten links (incl. vidy.my's ".mp4" cosmetic-suffix trick),
// redirect with 302, track every click (IP, country, device, referer),
// multi-user accounts (team), per-link analytics.
//
// Deploy target: cPanel shared hosting — dependencies are pure JS only
// (express + bcryptjs), no build step, static/ served by Express.
//
// Storage (data/ folder, auto-created):
//   users.json   — { username: { passHash, createdAt } }
//   links.json   — { code: { userId, url, code, useWait, mp4Style, createdAt } }
//   clicks.jsonl — append-only: { t, code, ip, ua, ref, country, device }
// ============================================================================

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
// Bind logic:
//  - cPanel shared hosting: no PORT env injected → loopback only (Apache proxy)
//  - PaaS (Render/Railway): PORT is always set → bind 0.0.0.0 (public)
//  - Manual override via HOST env if needed
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const HOUR = 3600_000;

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LINKS_FILE = path.join(DATA_DIR, 'links.json');
const CLICKS_FILE = path.join(DATA_DIR, 'clicks.jsonl');
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }

let users = loadJSON(USERS_FILE, {});
let links = loadJSON(LINKS_FILE, {});

// Access control:
//   SIGNUP_MODE=open    (default) — anyone can register
//   SIGNUP_MODE=invite  — registration needs the invite code (SIGNUP_CODE env)
//   SIGNUP_MODE=closed  — nobody can register; ONLY the admin creates accounts
// First user to register is automatically the ADMIN.
const SIGNUP_MODE = (process.env.SIGNUP_MODE || 'open').toLowerCase();
const SIGNUP_CODE = process.env.SIGNUP_CODE || '';

// ---------------------------------------------------------------------------
// Sessions (in-memory — single instance; resets on restart)
// ---------------------------------------------------------------------------
const sessions = new Map(); // token -> { user, expires }

function isHttps(req) {
  return req.secure || req.get('x-forwarded-proto') === 'https';
}

function setSession(req, res, username) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { user: username, expires: Date.now() + 30 * 24 * HOUR });
  res.setHeader(
    'Set-Cookie',
    `connect.sid=s%3A${token}; Path=/; HttpOnly; SameSite=Lax${isHttps(req) ? '; Secure' : ''}`
  );
}

// Mirrors the real vidy.my behaviour: the public redirect ALSO sets a
// connect.sid cookie (24h expiry) — observed on cdn2.vidy.my/IuBTOT.mp4.
function setAnonCookie(req, res) {
  const token = crypto.randomBytes(24).toString('hex');
  const exp = new Date(Date.now() + 24 * HOUR).toUTCString();
  res.setHeader(
    'Set-Cookie',
    `connect.sid=s%3A${token}; Path=/; Expires=${exp}; HttpOnly; SameSite=Lax${isHttps(req) ? '; Secure' : ''}`
  );
}

function currentUser(req) {
  const m = /connect\.sid=s%3A([0-9a-f]+)/.exec(req.get('cookie') || '');
  if (!m) return null;
  const s = sessions.get(m[1]);
  if (!s || s.expires < Date.now()) return null;
  return s.user;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'login required' });
  req.user = user;
  next();
}

function isAdmin(username) {
  const u = users[username];
  return !!(u && u.isAdmin);
}

function requireAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user || !isAdmin(user)) return res.status(403).json({ error: 'admin only' });
  req.user = user;
  next();
}

// ---------------------------------------------------------------------------
// Link helpers
// ---------------------------------------------------------------------------

// The vidy.my trick: /IuBTOT and /IuBTOT.mp4 both resolve to code "IuBTOT".
function normalizeCode(raw) {
  let code = String(raw).replace(/^\//, '');
  if (code.toLowerCase().endsWith('.mp4')) code = code.slice(0, -4);
  return code;
}

function newCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let c;
  do { c = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join(''); }
  while (links[c]);
  return c;
}

function baseUrl(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return `${proto}://${req.get('host')}`;
}

// ---------------------------------------------------------------------------
// Click tracking
// ---------------------------------------------------------------------------
function deviceOf(ua) {
  if (!ua) return 'Unknown';
  if (/bot|crawl|spider|slurp|facebookexternalhit|preview|headless/i.test(ua)) return 'Bot';
  if (/ipad|tablet/i.test(ua)) return 'Tablet';
  if (/mobile|android|iphone|phone|blackberry/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function logClick(code, req) {
  const ua = req.get('user-agent') || '';
  const row = {
    t: new Date().toISOString(),
    code,
    ip: req.ip,
    ua,
    ref: req.get('referer') || '',
    country: req.get('cf-ipcountry') || 'unknown', // Cloudflare sets this
    device: deviceOf(ua),
  };
  fs.appendFileSync(CLICKS_FILE, JSON.stringify(row) + '\n');
}

function readClicks() {
  try {
    return fs.readFileSync(CLICKS_FILE, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Rate limit — redirect endpoint only (vidy.my: "Direct Link max 4x per hour")
// ---------------------------------------------------------------------------
const hits = new Map(); // ip -> [timestamps]
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < HOUR);
  if (recent.length >= 4) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'static'))); // MUST be before /:code

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------
app.post('/api/register', (req, res) => {
  const { username, password, invite } = req.body || {};
  if (!username || !/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'username: 3-20 chars (letters, numbers, _)' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 chars' });
  }
  if (users[username]) return res.status(409).json({ error: 'username already taken' });

  const isFirstUser = Object.keys(users).length === 0;
  if (SIGNUP_MODE === 'closed' && !isFirstUser) {
    return res.status(403).json({ error: 'registration closed — ask your admin to create your account' });
  }
  if (SIGNUP_MODE === 'invite' && !isFirstUser && invite !== SIGNUP_CODE) {
    return res.status(403).json({ error: 'invalid invite code' });
  }

  users[username] = {
    passHash: bcrypt.hashSync(password, 10),
    createdAt: new Date().toISOString(),
    isAdmin: isFirstUser, // first registered user = admin
  };
  saveJSON(USERS_FILE, users);
  setSession(req, res, username);
  res.json({ ok: true, username, isAdmin: isFirstUser });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = users[username];
  if (!u || !bcrypt.compareSync(password || '', u.passHash)) {
    return res.status(401).json({ error: 'invalid username or password' });
  }
  setSession(req, res, username);
  res.json({ ok: true, username });
});

app.post('/api/logout', (req, res) => {
  const m = /connect\.sid=s%3A([0-9a-f]+)/.exec(req.get('cookie') || '');
  if (m) sessions.delete(m[1]);
  res.setHeader('Set-Cookie', 'connect.sid=; Path=/; HttpOnly; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const u = currentUser(req);
  res.json(u ? { username: u, isAdmin: isAdmin(u) } : null);
});

// Public config — lets the landing page adapt (e.g. show invite field).
app.get('/api/config', (req, res) => {
  res.json({ signupMode: SIGNUP_MODE });
});

// Admin: manage team members (works even when SIGNUP_MODE=closed).
app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json(
    Object.entries(users).map(([name, u]) => ({
      username: name,
      createdAt: u.createdAt,
      isAdmin: !!u.isAdmin,
    }))
  );
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'username: 3-20 chars (letters, numbers, _)' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 chars' });
  }
  if (users[username]) return res.status(409).json({ error: 'username already taken' });
  users[username] = {
    passHash: bcrypt.hashSync(password, 10),
    createdAt: new Date().toISOString(),
    isAdmin: false,
  };
  saveJSON(USERS_FILE, users);
  res.json({ ok: true, username });
});

// ---------------------------------------------------------------------------
// Links API (auth required)
// ---------------------------------------------------------------------------
app.post('/api/links', requireAuth, (req, res) => {
  const raw = ((req.body && req.body.url) || '').trim();
  // Accept URLs with or without scheme — auto-prepend https:// like browsers do.
  let url = raw;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(url)) {
    return res.status(400).json({ error: 'a valid url is required (e.g. example.com/video.mp4)' });
  }
  const custom = (req.body.code || '').replace(/\.mp4$/i, '');
  const code = custom || newCode();
  if (!/^[A-Za-z0-9]{3,12}$/.test(code)) {
    return res.status(400).json({ error: 'code must be 3-12 alphanumeric chars' });
  }
  if (links[code]) return res.status(409).json({ error: 'code already taken' });

  links[code] = {
    userId: req.user,
    url,
    code,
    useWait: !!(req.body.useWait),
    mp4Style: !!(req.body.mp4Style),
    createdAt: new Date().toISOString(),
  };
  saveJSON(LINKS_FILE, links);

  const base = baseUrl(req);
  res.json({
    code,
    short: `${base}/${code}`,
    mp4: `${base}/${code}.mp4`, // looks like a direct video file
    useWait: links[code].useWait,
    mp4Style: links[code].mp4Style,
  });
});

app.get('/api/links', requireAuth, (req, res) => {
  const clicks = readClicks();
  const weekAgo = Date.now() - 7 * 24 * HOUR;
  const list = Object.values(links)
    .filter((l) => l.userId === req.user)
    .map((l) => {
      const mine = clicks.filter((c) => c.code === l.code);
      return {
        ...l,
        clicks: mine.length,
        clicks7d: mine.filter((c) => weekAgo - new Date(c.t).getTime() < 0).length,
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

app.delete('/api/links/:code', requireAuth, (req, res) => {
  const l = links[req.params.code];
  if (!l || l.userId !== req.user) return res.status(404).json({ error: 'not found' });
  delete links[req.params.code];
  saveJSON(LINKS_FILE, links);
  res.json({ ok: true });
});

app.get('/api/links/:code/stats', requireAuth, (req, res) => {
  const l = links[req.params.code];
  if (!l || l.userId !== req.user) return res.status(404).json({ error: 'not found' });
  const rows = readClicks().filter((c) => c.code === l.code);
  const now = Date.now();
  const total = rows.length;
  const last7 = rows.filter((r) => now - new Date(r.t).getTime() < 7 * 24 * HOUR).length;

  const byDay = [];
  for (let i = 13; i >= 0; i--) {
    const key = new Date(now - i * 24 * HOUR).toISOString().slice(0, 10);
    byDay.push({ day: key, count: rows.filter((r) => (r.t || '').slice(0, 10) === key).length });
  }
  const group = (fn) => {
    const m = {};
    rows.forEach((r) => { const k = fn(r); m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };

  res.json({
    total,
    last7,
    byDay,
    byCountry: group((r) => r.country || 'unknown'),
    byDevice: group((r) => r.device || 'Unknown'),
    byReferer: group((r) => r.ref || '(direct)'),
  });
});

// ---------------------------------------------------------------------------
// Public redirect — the core, works WITHOUT login
// /CODE  and  /CODE.mp4  both work (the .mp4 is stripped)
// ---------------------------------------------------------------------------
app.get('/:code', (req, res) => {
  const code = normalizeCode(req.params.code);
  const link = links[code];
  if (!link) return res.status(404).send('Not found');

  if (rateLimited(req.ip)) {
    return res.status(429).send('Rate limited (max 4x per hour)');
  }
  logClick(code, req);
  setAnonCookie(req, res); // same connect.sid cookie as the real service

  if (link.useWait) return res.send(waitPage(link.url));
  res.redirect(302, link.url);
});

function waitPage(url) {
  const safe = String(url).replace(/"/g, '%22');
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="2;url=${safe}">
<title>Mohon Tunggu</title>
</head>
<body style="font-family:Arial,sans-serif;text-align:center;margin-top:15%">
<h2>Mohon Tunggu</h2>
<p>Anda akan diarahkan dalam 2 detik...</p>
<noscript><a href="${safe}">Lanjutkan</a></noscript>
<script>setTimeout(function(){ window.location.href = ${JSON.stringify(url)}; }, 2000);</script>
</body>
</html>`;
}

app.listen(PORT, HOST, () => console.log(`ShortTrack running on http://${HOST}:${PORT}`));

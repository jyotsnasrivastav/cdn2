# ShortTrack — Link Shortener + Click Analytics

A complete, self-hosted link shortener with full UI, built as the A-to-Z implementation
of the vidy.my link mechanism (`cdn2.vidy.my/IuBTOT.mp4`).

## Features

| Feature | Detail |
|---|---|
| 🔗 Link shortening | Paste any URL → short link. Custom codes supported |
| 🎬 MP4-style links | `/code.mp4` — looks like a direct video file (vidy.my trick) |
| ⏱️ Wait page | Optional 2-second "Mohon Tunggu" interstitial before redirect |
| 📊 Click analytics | Every click: IP, country, device, referer, time |
| 📈 Per-link stats | 14-day trend chart, device doughnut, country bar, referer list |
| 👥 Team accounts | Multi-user: signup/login, every user sees only their own links |
| 🔒 Private mode | `SIGNUP_MODE=closed` (only admin creates accounts) or `invite` (invite code needed). First registered user = admin; admin can add members from the dashboard |
| 🛡️ Redirect protection | Rate limit: max 4 redirects/hour per IP |

## Tech stack

- **Backend:** Node.js + Express (no build step — cPanel friendly)
- **Storage:** JSON files in `data/` (users.json, links.json) + append-only clicks.jsonl
- **Auth:** bcryptjs (pure JS — no native compilation) + `connect.sid` session cookie
- **Frontend:** Vanilla HTML/CSS/JS + Chart.js (CDN), served by Express from `static/`

## Quick start

```bash
npm install
npm start          # http://localhost:3000
```

Open http://localhost:3000 → create account → dashboard:

1. **My Links** → paste a destination URL → optionally custom code, MP4-style toggle, wait-page toggle → **Create link**
2. Copy the short link (or the `.mp4` one) and share it
3. **Analytics** → per-link dashboard with charts

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/register | — | { username, password } |
| POST | /api/login | — | { username, password } |
| POST | /api/logout | — | end session |
| GET | /api/me | ✓ | current user |
| POST | /api/links | ✓ | { url, code?, useWait?, mp4Style? } → { code, short, mp4 } |
| GET | /api/links | ✓ | own links + click counts |
| DELETE | /api/links/:code | ✓ | delete own link |
| GET | /api/links/:code/stats | ✓ | { total, last7, byDay[14], byCountry, byDevice, byReferer } |
| GET | /:code or /:code.mp4 | — | **public** 302 redirect + click logged |

## How the vidy.my mechanism works (what this implements)

```
Browser opens  cdn2.vidy.my/IuBTOT.mp4
   → Cloudflare → Caddy → Node/Express (connect.sid cookie)
   → HTTP 302 Found → destination (Blogger wait page → real video)
```

- The `.mp4` is **cosmetic**: server strips it, `IuBTOT` and `IuBTOT.mp4` are the same link.
- It is a **302 redirect**, never a file.
- Click logging: IP, UA, referer, country (`cf-ipcountry` when behind Cloudflare), device.

## Deploy

- **No Node.js hosting?** → deploy free on **Render**: see [DEPLOY-RENDER.md](DEPLOY-RENDER.md) (works on any shared hosting, incl. Serverbyt)
- **cPanel shared hosting:** see [DEPLOY-CPANEL.md](DEPLOY-CPANEL.md)
- **VPS:** run `npm start` behind Caddy (`reverse_proxy 127.0.0.1:3000`), optional Cloudflare in front for country data.

## Tests

`test-e2e.ps1` — full end-to-end smoke test (register → create → redirect → stats → wait page).

## Notes / limits

- Sessions are in-memory → restart logs everyone out (fine for single-instance hosting).
- Rate-limit counter is in-memory → resets on restart.
- For heavy scale, move storage to MySQL/Redis (left as an exercise — JSON is fine for small teams).
- No cloaking/bot-decoy features — those are the parts that get domains spam-flagged.

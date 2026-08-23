# cPanel Deployment Guide — ShortTrack

Step-by-step guide to run the full ShortTrack link shortener (UI + API) on
**cPanel shared hosting**. Works on Hostinger, Namecheap, A2 Hosting, GoDaddy
(with Node.js app support).

> **Pehle check karo:** aapke cPanel mein **"Setup Node.js App"** (ya "Node.js Selector")
> icon hona chahiye. Agar nahi hai, toh is hosting pe Node.js deploy nahi ho payega —
> phir VPS (ya Render/Railway) lena padega.

---

## Step 1 — Files upload karo

**Option A: File Manager**

1. cPanel → **File Manager** → apne home folder mein jao (e.g. `/home/username/`)
2. Naya folder banao: `shorttrack`
3. Ye sab upload karo (poore project):
   - `server.js`
   - `package.json`
   - `static/` folder (index.html, dashboard.html, style.css, app.js)
   - `README.md` (optional)
4. `node_modules` upload **mat** karna — npm install khud karega
5. `data/` folder upload **mat** karna — server khud bana lega

**Option B: Git (agar host pe Terminal hai)**

```bash
cd ~
git clone <aapka-repo-url> shorttrack
cd shorttrack
```

---

## Step 2 — Node.js App setup (cPanel)

1. cPanel → **Setup Node.js App** (Applications section)
2. **Create Application** dabao
3. Fill karo:

   | Field | Value |
   |---|---|
   | Node.js version | **18 LTS** ya **20 LTS** |
   | Application root | `shorttrack` |
   | Application URL | `https://aapkadomain.com` (ya subdomain, e.g. `https://links.aapkadomain.com`) |
   | Application startup file | `server.js` |
   | Application name | `shorttrack` |
   | Passenger log file | default rahne do |

4. **Create** dabao

> **PORT se mat uljho** — cPanel khud ek internal port allocate karta hai aur
> `process.env.PORT` mein inject karta hai. Code already handle karta hai.
>
> **URL important hai:** Application URL wahi hona chahiye jahan se short links
> open honge (e.g. `https://links.aapkadomain.com/AbCdEf`).

---

## Step 3 — npm install

cPanel Node.js app manager mein **"Run NPM Install"** button dabao
(dependencies: express + bcryptjs — **dono pure JS**, koi native compilation nahi, isliye shared hosting pe safely install hoti hain).

Ya Terminal se:

```bash
cd ~/shorttrack
npm install
```

---

## Step 4 — App start karo

1. **"Start App"** button dabao
2. Status **"Running"** dikhna chahiye
3. Browser mein `https://aapkadomain.com` kholo — landing page dikhna chahiye

---

## Step 5 — Test karo

```bash
# Account banao (browser se bhi kar sakte ho)
curl -X POST https://aapkadomain.com/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"secret123"}'

# Short link banao (cookie ke saath)
curl -b cookies.txt -c cookies.txt -X POST https://aapkadomain.com/api/links \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/real-video.mp4","mp4Style":true}'

# Redirect check (bina login ke kaam karta hai)
curl -i https://aapkadomain.com/AbCdEf.mp4
# -> HTTP/1.1 302 Found, Location: https://example.com/real-video.mp4
```

HTTPS automatic hai (cPanel AutoSSL). **Secure cookie ke liye HTTPS zaroori** —
hamara code HTTPS pe `Secure` flag automatically laga deta hai.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **502/503 error** | App crash. Terminal: `cd ~/shorttrack && node server.js` → error dekho. Phir `npm install` + restart. |
| **"Module not found: express/bcryptjs"** | npm install miss hua — Step 3 dobara karo |
| **404 / landing nahi dikh raha** | Application URL sahi set hai? `static/` folder upload hua? |
| **Login ke baad dashboard 401** | Cookie `Secure` flag — page HTTP pe khol rahe ho? HTTPS use karo |
| **Redirect kaam nahi kar raha** | `data/links.json` check karo — code exists karta hai? |
| **Chart nahi dikh rahe** | Chart.js CDN (jsdelivr) blocked hai — network check karo; data waise bhi chips mein dikhta hai |

---

## Important notes (shared hosting)

1. **Data `data/` folder mein save hota hai** — `users.json`, `links.json`, `clicks.jsonl`.
   Ye files app folder ke andar rehti hain, restart pe safe. **Backup:** kabhi-kabhi
   `data/` folder download karke rakho.
2. **Sessions in-memory hain** — app restart hone pe sab users logout ho jayenge
   (single-instance ke liye acceptable).
3. **Rate limit (4x/hour per IP)** bhi memory mein hai — restart pe reset.
4. **Multi-user / team:** har user ka apna account, apne links — isolation server-side hai.
5. **Domain chahiye:** Node.js app URL ke liye cPanel pe domain/subdomain pointed hona chahiye.

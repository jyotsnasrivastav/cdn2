# Render (Free) Deployment Guide — ShortTrack

Deploy ShortTrack on **Render's free tier** — no credit card, no hosting purchase.
Works when your shared hosting has no Node.js support (like Serverbyt).

> ⏱️ Time: ~10 minutes. Cost: ₹0.

---

## Step 1 — Code ko GitHub par push karo

Render GitHub se deploy karta hai, isliye pehle code GitHub par chahiye.

1. [github.com](https://github.com) par account banao (agar nahi hai) aur login karo
2. **New repository** banao:
   - Name: `shorttrack`
   - Public ya Private — koi farak nahi
   - "Add a README" **mat** tick karo
   - **Create repository** dabao
3. Repo ke andar **"Add file" → "Upload files"** kholo
4. In files ko drag-drop karo (apne `vidy-clone` folder se):
   - `server.js`
   - `package.json`
   - `package-lock.json`
   - `static/` folder ke andar ke 4 files: `index.html`, `dashboard.html`, `style.css`, `app.js`
     > GitHub par folder banane ke liye: files ko ek `static` naam ke folder mein rakh kar poora folder drag karo
5. ❌ `node_modules/` aur `data/` **mat** upload karna
6. **Commit changes** dabao

> 💡 Agar aapke paas Git CLI hai, toh ye bhi kaam karega:
> ```bash
> cd vidy-clone
> git init && git add -A && git commit -m "ShortTrack"
> git branch -M main
> git remote add origin https://github.com/YOURNAME/shorttrack.git
> git push -u origin main
> ```

---

## Step 2 — Render par account + Web Service

1. [render.com](https://render.com) kholo → **Sign up** → **GitHub** se signup karo (sabse easy)
2. Dashboard mein **"New" → "Web Service"** dabao
3. `shorttrack` repo connect karo (Render ko GitHub access dena padega — Authorize dabao)

---

## Step 3 — Settings fill karo

| Field | Value |
|---|---|
| Name | `shorttrack` |
| Region | **Singapore** (India ke sabse paas) |
| Branch | `main` |
| Runtime | **Node** |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Free** |

**Environment variables** (Render → service → **Environment** tab → **Add Environment Variable**):

| Variable | Value | Matlab |
|---|---|---|
| `SIGNUP_MODE` | `closed` | Koi bahar ka signup nahi kar payega — sirf admin (aap) team members bana sakta hai |
| (optional) `SIGNUP_MODE` | `invite` | Signup ke liye invite code chahiye |
| (with invite) `SIGNUP_CODE` | `TEAM123` | Wahi invite code jo team ko batao |

> `SIGNUP_MODE` na do toh `open` hota hai — koi bhi register kar sakta hai.
> **Pehla registered user automatically ADMIN ban jata hai** (isAdmin flag).

Render `PORT` khud set karta hai — code public bind kar leta hai, kuch aur nahi dena.

---

## Step 4 — Deploy

1. **"Create Web Service"** dabao
2. Build ~2-3 minute lagega (log live dikhte rahenge)
3. Done hone par URL milega: `https://shorttrack.onrender.com`

---

## Step 5 — Test

```bash
# Landing page
https://shorttrack.onrender.com

# Account + link banao (ya browser UI se)
curl -X POST https://shorttrack.onrender.com/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"secret123"}'

# Short link kholo
https://shorttrack.onrender.com/AbCdEf.mp4   → 302 redirect ✅
```

---

## ⚠️ Free tier ki limitations (janna zaroori)

1. **Sleep mode:** 15 minute koi request na aaye toh service **so jati hai** —
   agla click 30-60 second late kholta hai (phir instant). Demo ke liye perfect,
   heavy traffic ke liye nahi.
2. **Data reset:** Render ke free tier ka disk **ephemeral** hai — jab bhi redeploy
   hoga, `data/` folder (users, links, clicks) **reset** ho jayega. Demo ke liye
   fine; production ke liye MySQL/PostgreSQL add-on chahiye (paid).
3. **Monthly hours:** Free web services ko 750 hours/month milte hain —
   ye kaafi hai jab tak service so rahi ho (sote hue hours count nahi hote).

---

## Railway alternative (agar Render pasand na aaye)

Railway ka permanent free tier ab nahi hai (naye accounts ko ek baar ka $5 credit
milta hai, phir pay-as-you-go). Steps same hain: GitHub repo → New Project →
Deploy from GitHub → `npm install` / `npm start` automatically detect hota hai.
Pehle Render try karo — free hai.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **Deploy fail: "Module not found"** | Repo mein `package.json` + `package-lock.json` upload hua? `static/` folder sahi structure mein hai? |
| **Service bind error** | Old Render docs ke liye: naya deploy karo — code ab auto-bind karta hai (PORT set = 0.0.0.0) |
| **502 after deploy** | Logs kholo → error dekho. Sabse common: files missing ya npm install fail |
| **Link 404** | `data/links.json` reset hua (redeploy ke baad) — link dobara banao |
| **Slow pehli baar** | Sleep mode — normal hai, 30-60s wait karo |

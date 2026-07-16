# ⚔️ AS Adventurer Creator

**VTuber Creation Pipeline by Angel's Sword Studios**

*Design · Generate · Prepare · Export*

Fork with **Grok Imagine** support via **SuperGrok / X Premium+ OAuth** (sprites + video), in addition to OpenAI and Gemini.

Repo: https://github.com/Manya3084/angelssword-adventurers-creator

---

## What Is This?

AS Adventurer Creator is a local web app that walks you through a 4-step pipeline — from a static sprite to a transparent, looping animated model ready for streaming (OBS, PNGtuber apps, AS Reactive Overlay, etc.).

| Step | Tab | What it does |
|------|-----|--------------|
| ① | **Sprite Prep** | Upload or **AI-generate** a chroma-keyed 1280×720 sprite |
| ② | **Generate Video** | Animate the sprite (AI image-to-video) — *optional* |
| ③ | **Video Prep** | Loop builder, trim, concat, crossfade |
| ④ | **Model Exporter** | Chroma key out → transparent WebM / GIF |

**AI providers (pick per step):**

| Feature | Providers |
|---------|-----------|
| Sprite generation | **OpenAI** (GPT Image) **or** **Grok Imagine** (SuperGrok OAuth) |
| Video generation | **Google Gemini** Omni Flash **or** **Grok Imagine** (SuperGrok OAuth) |
| Video Prep + Export | Fully offline — no API keys |

---

## Install & Run (from source)

### Requirements

- **Node.js** 18+ (includes `npm`) — https://nodejs.org/
- A modern browser (Chrome / Edge / Firefox)
- Internet only for AI steps (or SuperGrok login)

### 1. Clone the fork

```bash
git clone https://github.com/Manya3084/angelssword-adventurers-creator.git
cd angelssword-adventurers-creator
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the local server

```bash
npm start
```

Or:

```bash
node server.js
```

- Server listens on **http://localhost:3001** (or `PORT` if set).
- On many systems the browser opens automatically.
- If not: open http://localhost:3001 manually.

### 4. Stop

Press `Ctrl+C` in the terminal.

### Optional: custom port

```bash
# Windows (cmd)
set PORT=3080 && npm start

# Windows (PowerShell)
$env:PORT=3080; npm start

# macOS / Linux
PORT=3080 npm start
```

---

## Windows quick launch (same machine)

If you already have the packaged build:

1. Double-click **`ASAdventurer.exe`** or **`Start ASAdventurer.bat`**
2. Browser opens to `http://localhost:3001`

To rebuild the exe after code changes (Windows):

```bash
npm install
node build-exe.js
```

(See `build-exe.bat` / `Setup.bat` for convenience wrappers.)

---

## First-time setup (Settings)

Open the **⚙️ Settings** tab.

### OpenAI (optional — sprite AI)

1. Paste your OpenAI API key (`sk-...`)
2. **Save** → **Test**
3. In Sprite Prep → AI Generate → choose **🤖 OpenAI**

### Google Gemini (optional — video AI)

1. Paste your Google AI Studio / Gemini API key (`AIza...`)
2. **Save** → **Test**
3. In Generate Video → choose **🎬 Gemini**

### Grok / SuperGrok OAuth (optional — sprites + video via subscription)

No separate xAI API key. Uses your **SuperGrok** or **X Premium+** account.

1. Click **🔐 Login with SuperGrok**
2. Browser opens the xAI device verification page
3. Approve with the account that has SuperGrok / Premium+
4. When the status shows **SuperGrok session active**, you're done
5. Use **Test Connection** / **Refresh Token** / **Logout** as needed

Then:

- Sprite Prep → AI Generate → **✨ Grok**
- Generate Video → **✨ Grok**

Tokens live only in your browser `localStorage` and are sent only to `auth.x.ai` / `api.x.ai` through the **local** Node proxy. See `GROK_OAUTH.md` for technical details.

> **No AI keys required** if you bring your own sprites and videos. Steps ③–④ work fully offline.

---

## The Pipeline (quick reference)

### ① Sprite Prep 🎨

- **Manual Upload** — PNG on chroma key, offset/zoom, handoff to video
- **AI Generate** — name, description, race mode (Normal / Kanolith / Zoalith), optional refs, key color
- Provider: **OpenAI** or **Grok**

### ② Generate Video 🎬 *(optional)*

- Reference or keyframe mode, motion prompt, duration, batch count
- Provider: **Gemini** or **Grok**
- Or skip and drop your own MP4/WebM into Video Prep

### ③ Video Prep 🔄

- Loop point, onion skin, ping-pong / reverse, concat + crossfade
- Handoff to exporter

### ④ Model Exporter 📦

| Mode | Format | Limits |
|------|--------|--------|
| ⚔️ Adventurer | WebM (VP9 alpha) | Unlimited frames / resolution |
| 🟢 F. Normal | GIF | 120 frames, 1000×1000 |
| 💎 F. Premium | GIF | 600 frames, 4000×4000 |

Chroma key: similarity, smoothness, spill, scale, crop, etc.

---

## Project structure

```
angelssword-adventurers-creator/
├── server.js              # Express static + API proxies (OpenAI, Gemini, xAI)
├── package.json
├── README.md
├── GROK_OAUTH.md          # Grok OAuth + Imagine notes
├── HANDOFF.md             # Original pipeline notes
├── public/
│   ├── index.html
│   ├── style.css
│   ├── app.js             # Tabs, settings, SuperGrok UI
│   ├── xai-oauth.js       # Device-code OAuth client
│   ├── sprite-prep.js     # Sprite + OpenAI/Grok image gen
│   ├── video-gen.js       # Gemini/Grok video gen
│   ├── video-prep.js
│   ├── model-exporter.js
│   └── assets/
├── Setup.bat / Start ASAdventurer.bat / build-exe.*
└── icon.ico / icon.png
```

---

## Tips

- **Magenta** (`#FF00FF`) is often the safest chroma key for character art.
- **Ping-Pong** loops are the easiest seamless idles.
- Grok image gen works best with a strong text prompt (chroma key instructions are already baked into the prompt builder).
- If SuperGrok login fails, try again or **Logout** then re-login; use **Refresh Token** if generations start failing after a long session.
- Port in use → close other instances or set `PORT`.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Browser doesn't open | Open http://localhost:3001 manually |
| Port 3001 in use | Set `PORT` or close other instances |
| `npm start` fails | Run `npm install` again; need Node 18+ |
| OpenAI / Gemini fails | Check key + credits in Settings → Test |
| Grok says not logged in | Settings → Login with SuperGrok |
| Grok token expired | Settings → Refresh Token or re-login |
| Video won't load | Prefer MP4 H.264; some codecs fail in-browser |
| Export fringe | Raise Spill Suppression / tweak Similarity |

---

## Development notes

- All AI calls go through **local proxies** in `server.js` (avoids CORS, keeps tokens off third-party hosts).
- No cloud backend of your own is required — everything runs on your machine.
- Default OAuth client id for SuperGrok device flow is configured in `server.js` (public client used by Grok CLI-style tools).

---

## Credits

**AS Adventurer Creator** by Angel's Sword Studios  
Grok Imagine / SuperGrok OAuth integration on this fork for local SuperGrok use.

Built with ❤️ for the VTuber community.

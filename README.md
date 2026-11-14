# Motion Lab: Dedicated Local Animation Studio

Motion Lab is a local single-user web app (bound strictly to `127.0.0.1`) built for high-throughput YouTube video production for **Staff India** (16:9, 1920x1080, 30fps). It generates animations as deterministic HyperFrames compositions, previews them with frame-accurate scrubbing, enables live tweaking via auto-generated parameter forms or natural-language edits, and renders transparent video overlays directly for CapCut.

---

## 1. Stack & Architecture

- **Runtime**: Node 22+ (`v22.19.0`), TypeScript (strict).
- **Backend**: Fastify on `http://127.0.0.1:3000` (CORS-restricted, localhost only).
- **Frontend**: Vite + React 18 + Tailwind CSS on `http://127.0.0.1:5173`.
- **Database**: SQLite (`better-sqlite3`) in WAL mode (`motion-lab.sqlite`).
- **Validation**: Strict `zod` schemas for all generation outputs, bulk production sheets, and parameters.
- **Render Engine**: `hyperframes` v0.9.29 (seekable GSAP timelines rendered via headless Chrome + FFmpeg).

---

## 2. Requirements & Setup

### A. Node.js & FFmpeg
1. Node 22+ is required (`node -v`).
2. FFmpeg & FFprobe are auto-detected by Motion Lab from:
   - System PATH
   - `C:\Program Files\DownloadHelper CoApp\ffmpeg.exe`
   - `node_modules\ffmpeg-static\ffmpeg.exe`
3. If missing, install via Windows Package Manager:
   ```powershell
   winget install Gyan.FFmpeg
   ```

### B. Environment Configuration (.env)
Copy `.env.example` to `.env`:
```ini
PORT=3000
HOST=127.0.0.1
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_key_here
GEMINI_MODEL=gemini-3.5-flash
LLM_MAX_RPM=15
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-7-sonnet-20250219
AGENT_CLI=antigravity
AGENT_BIN="<path-to-agent-binary>"
AGENT_CMD_TEMPLATE="{bin} chat --mode agent {prompt}"
AGENT_MODEL=inherit
AGENT_TIMEOUT_SEC=180
```

---

## 3. Verified Antigravity Agent Command

Verified against Antigravity IDE (`1.107.0`):
- **Executable**: `<path-to-agent-binary>` (e.g. `antigravity-ide.cmd`)
- **Headless Chat Command**:
  ```powershell
  antigravity-ide chat --mode agent "Read TASK.md, update comp.html and params.json, run hyperframes lint until clean, then stop."
  ```
- **Confinement & Permissions**:
  - Motion Lab executes the agent strictly with `cwd = shots/<video>/<shot>/`.
  - It writes a dedicated `TASK.md` containing shot context, exact on-screen text, brand tokens, and manual code diffs before invocation.
  - File read/write is strictly scoped to the shot directory.

---

## 4. Run Commands

```powershell
# 1. Install dependencies
npm install

# 2. Run unit tests
npm test

# 3. Start development server (Backend + Vite Frontend)
npm run dev

# 4. Or start production server
npm run build
npm start
```
Open **`http://127.0.0.1:3000`** in your browser.

### Verification Scripts
The following verification scripts are available via `npm run`:
- `npm run e2e`: Runs end-to-end integration proof (`scripts/e2e-proof.ts`). Creates test compositions and renders output video.
- `npm run determinism`: Verifies frame-by-frame seeking and rendering determinism (`scripts/determinism-check.ts`).
- `npm run acceptance`: Runs the full acceptance test suite (`scripts/run-acceptance-test.ts`).
- `npm run proof:render`: Renders proof test compositions (`scripts/render-proof.ts`). Note: requires server and FFmpeg.
- `npm run check:render-ui`: Validates UI rendering and scrub controls (`scripts/render-ui-check.ts`). Note: requires both backend server and Vite dev server running, and expects the video created by `npm run e2e`.

---

## 5. Empirical Verification & Evidence

### Transparency & CapCut Ingest (Section 7)
- HyperFrames was empirically benchmarked with `ffprobe` on rendered output:
  - **Format**: Apple ProRes 4444 (`.mov`)
  - **Pixel Format**: `yuva444p12le` (Confirmed 12-bit native Alpha channel)
  - **Dimensions**: `1920x1080 @ 30fps`
- WebM VP9 with alpha is **derived** from that ProRes master with ffmpeg (`yuva420p`, `alpha_mode=1`). The native `--format webm` on this build writes `yuv420p` with no alpha (verified by ffprobe), so the app does not rely on it.
- Chroma MP4 on solid `#00FF00` and opaque MP4 on `#0B0F19` are composited from the same alpha master.

---

## 6. Open Items & TODO Tracker

| Topic | Status | Details |
|---|---|---|
| **Alpha Output** | Verified | HyperFrames outputs Apple ProRes 4444 with `yuva444p12le` alpha stream into MOV, fully compatible with CapCut overlays. |
| **Studio Embedding** | Evaluated | The preview iframe uses sandbox='allow-scripts' (no allow-same-origin), so generated HTML cannot access the parent app's cookies, localStorage or API endpoints. postMessage timeline scrubber (`tl.seek(t)`) is used for all parent↔iframe communication. |
| **Custom Fonts** | In Place | Bundled `Inter`, `Montserrat`, `JetBrains Mono` resolve deterministically; local font cache handled via `@font-face`. |
| **Brand Tokens** | Initialized | Staff India tokens configured in `brand/tokens.json`: Crimson (`#C92A2A`), Blue (`#2563EB`), Emerald Green (`#10B981`), Cyan (`#06B6D4`), and CapCut overlay presets. |


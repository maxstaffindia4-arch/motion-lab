# Official HyperFrames Render & Composition Specification

> Based on the official HeyGen HyperFrames engine craft rules (`skills/hyperframes/SKILL.md` and `references/motion.md`).

## 1. Composition Contract & Engine Rules
1. **Root Composition**:
   - Exactly one root element: `<div id="root" data-composition-id="main" data-start="0" data-duration="{duration}" data-width="1920" data-height="1080">`.
   - The video's duration is the root's `data-duration`.
2. **Deterministic Seekability**:
   - Each composition builds one paused GSAP timeline: `const tl = gsap.timeline({ paused: true });`.
   - Register the timeline globally: `window.__timelines = window.__timelines || {}; window.__timelines["main"] = tl; tl.seek(0);`.
   - **No dynamic time**: Never use `Date.now()`, `performance.now()`, `setTimeout`, `setInterval`, `requestAnimationFrame`, or unseeded `Math.random()`.
   - Everything visible must be a pure, deterministic function of timeline time.
3. **Timed Elements (`.clip`)**:
   - Every timed element must have `class="clip"`, `data-start` (seconds), and `data-duration` (seconds).
   - Elements show over `[start, start + duration)`.
   - **Never tween `display`, `visibility` or `autoAlpha` on a `.clip`**; animate opacity/transform on children.
   - Animate `scale`, `translate (x/y)`, and `opacity` — never layout properties (`top`, `left`, `width`, `height`, `margin`).
4. **Local Assets & No Remote URLs**:
   - **No CDN scripts, remote images, or external fonts**.
   - Use local relative paths (`assets/...`) or inline SVG/CSS.
   - Register fonts using `@font-face` pointing to local files in `assets/`.
5. **Exact Verbatim Preservation**:
   - When text is marked VERBATIM, preserve it character-for-character. Never spell-check, rewrite, or omit words.

---

## 2. Layout Discipline & Title-Safe Rules (Enforced by Layout QA)
- Multi-item layouts **must** use a flex or grid container with an explicit `gap` (minimum 24px).
- Each item must be a normal-flow flex/grid child (`position: relative` or `static`), **never** `position: absolute`.
- **Never place multiple absolute children inside a shared parent** without distinct manual offsets (they will collapse into 100% overlap).
- **Safe Margins**:
  - Keep all critical text inside 80% title-safe area and 90% action-safe area.
  - Body text must never fall below 40px at 1080p (minimum 48px recommended).
- Items measured by layout QA at each beat + 0.3s and mid-hold must have zero overlap.

---

## 3. Motion Craft & Easing Guidelines (from HyperFrames Motion Standards)
- **Ease by Role**:
  - **Arrivals**: Land on long-tailed ease-outs (`power4.out`, `expo.out`).
  - **Exits**: 40–50% shorter than entrances, accelerating out (`power3.in`, `power2.in`).
  - **Pops & Badges**: Overshoot slightly with `back.out(1.7)` or `elastic.out(1, 0.5)`.
  - **Flat `power2.out` on everything looks amateur and AI-generated**: vary eases by role.
- **Overlap & Staggering**:
  - List items: stagger 40ms – 80ms apart.
  - Words in kinetic slams: 60ms – 120ms apart.
  - Fully sequential animations look robotic; all-at-once looks cheap. Start the next element when the prior is 30–50% complete.
- **Still Holds**:
  - A readable headline must hold still for its duration (at least 2.0s). Do not drift or continually pulse hero titles once landed.

---

## 4. Visual & Broadcast Design Standards
- **Center by Default**:
  - Center hero titles both vertically and horizontally (`display: flex; align-items: center; justify-content: center;`).
  - Left-align only for lower-thirds (`align-items: flex-start; justify-content: flex-end; padding-bottom: 160px;`).
- **Typography**:
  - Headline titles: 72px – 110px, font weight 800–900.
  - Subheadings / Badges: 32px – 48px, font weight 600–700.
  - Default font stack: `"Montserrat", "Inter", -apple-system, sans-serif`.
  - Uppercase or Title Case for impact text (never raw lowercase).
- **Text Legibility & Multi-layer Shadows**:
  - Transparent video overlays must remain crisp against any background video.
  - Apply multi-layered drop shadows: `text-shadow: 0 10px 30px rgba(0,0,0,0.85), 0 2px 8px rgba(0,0,0,0.6);`.
  - For glowing themes (celebration, neon, tech): add ambient glow `text-shadow: 0 0 35px var(--accent-color), 0 10px 30px rgba(0,0,0,0.9);`.
- **Thematic Colors**:
  - Celebration / Birthday: Gold (`#F59E0B`) with Festive Purple (`#A855F7`).
  - Tech / SaaS: Electric Blue (`#3B82F6`) with Violet (`#8B5CF6`).
  - Growth / Metrics: Emerald Green (`#10B981`) with Cyan (`#06B6D4`).
  - Warning / Urgency: Bright Red (`#EF4444`) with Orange (`#F97316`).

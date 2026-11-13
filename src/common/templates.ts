import { ParamsSchema, OutputMode } from './types.js';

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  defaultDuration: number;
  paramsSchema: ParamsSchema;
  defaultParams: Record<string, any>;
  renderHtml: (params: Record<string, any>, mode?: OutputMode) => string;
}

// Helper to escape HTML
function esc(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const TEMPLATES: Record<string, TemplateDefinition> = {
  'text-slam': {
    id: 'text-slam',
    name: 'Text Slam (Word-by-Word Shake)',
    description: 'High-impact word-by-word kinetic slam with camera shake, ideal for video hooks',
    defaultDuration: 3,
    paramsSchema: [
      { id: 'text', type: 'text', label: 'On-Screen Text', group: 'Content' },
      { id: 'highlightWords', type: 'text', label: 'Highlight Words (comma-separated)', group: 'Content' },
      { id: 'fontSize', type: 'number', label: 'Font Size (px)', min: 40, max: 120, group: 'Typography' },
      { id: 'fontWeight', type: 'number', label: 'Font Weight', min: 400, max: 900, step: 100, group: 'Typography' },
      { id: 'textColor', type: 'color', label: 'Text Color', group: 'Color' },
      { id: 'highlightColor', type: 'color', label: 'Highlight Color', group: 'Color' },
      { id: 'shakeIntensity', type: 'number', label: 'Camera Shake (px)', min: 0, max: 20, group: 'Motion' },
      { id: 'stepDuration', type: 'number', label: 'Word Interval (s)', min: 0.1, max: 0.6, step: 0.02, group: 'Motion' },
      { id: 'easing', type: 'easing', label: 'Slam Ease', group: 'Motion' }
    ],
    defaultParams: {
      text: 'Running a business is already hard enough.',
      highlightWords: 'hard,enough.',
      fontSize: 78,
      fontWeight: 800,
      textColor: '#FFFFFF',
      highlightColor: '#C92A2A',
      shakeIntensity: 6,
      stepDuration: 0.22,
      easing: 'power4.out'
    },
    renderHtml: (params, mode = 'overlay-alpha') => {
      const p = { ...TEMPLATES['text-slam'].defaultParams, ...params };
      const words = String(p.text || '').trim().split(/\s+/).filter(Boolean);
      const highlights = String(p.highlightWords || '').toLowerCase().split(',').map(s => s.trim().replace(/[.,!?;:]/g, ''));
      const bg = mode === 'chroma' ? '#00FF00' : mode === 'full' ? '#0B0F19' : 'transparent';

      const wordSpans = words.map((w, idx) => {
        const clean = w.toLowerCase().replace(/[.,!?;:]/g, '');
        const isHl = highlights.includes(clean);
        return `<span class="word ${isHl ? 'highlight' : ''}" id="w-${idx}" style="font-size: var(--font-size); font-weight: var(--font-weight); color: ${isHl ? 'var(--highlight-color)' : 'var(--text-color)'};">${esc(w)}</span>`;
      }).join('\n        ');

      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
  <style>
    :root {
      --bg: ${bg};
      --text-color: ${p.textColor};
      --highlight-color: ${p.highlightColor};
      --font-size: ${p.fontSize}px;
      --font-weight: ${p.fontWeight};
      --shake: ${p.shakeIntensity}px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: var(--bg);
      font-family: 'Inter', -apple-system, sans-serif;
    }
    #root {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 5%;
    }
    .slam-container {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 18px 24px;
      max-width: 1540px;
      text-align: center;
    }
    .word {
      display: inline-block;
      text-shadow: 0 12px 36px rgba(0,0,0,0.8);
      letter-spacing: -0.025em;
      opacity: 0;
      transform-origin: center center;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${p.duration || 3}" data-width="1920" data-height="1080">
    <div id="slam-box" class="clip" data-start="0" data-duration="${p.duration || 3}" data-track-index="0">
      <div class="slam-container">
        ${wordSpans}
      </div>
    </div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    const words = document.querySelectorAll('.word');
    const step = ${p.stepDuration};
    const shake = ${p.shakeIntensity};

    words.forEach((w, i) => {
      const t = i * step;
      tl.fromTo(w,
        { opacity: 0, scale: 2.2, y: -40, filter: "blur(12px)" },
        { opacity: 1, scale: 1, y: 0, filter: "blur(0px)", duration: 0.22, ease: "${p.easing}" },
        t
      );
      if (shake > 0) {
        tl.fromTo("#slam-box",
          { y: -shake, x: (i % 2 === 0 ? shake : -shake) },
          { y: 0, x: 0, duration: 0.14, ease: "power2.out" },
          t + 0.05
        );
      }
    });

    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>`;
    }
  },

  'keyword-pop': {
    id: 'keyword-pop',
    name: 'Keyword Pop (Click Marker / Target)',
    description: 'Bouncy keyword pop-in with cursor click ripple and badge highlighter',
    defaultDuration: 3,
    paramsSchema: [
      { id: 'keyword', type: 'text', label: 'Primary Keyword', group: 'Content' },
      { id: 'subtext', type: 'text', label: 'Supporting Subtext', group: 'Content' },
      { id: 'badgeColor', type: 'color', label: 'Badge Background', group: 'Color' },
      { id: 'textColor', type: 'color', label: 'Text Color', group: 'Color' },
      { id: 'accentColor', type: 'color', label: 'Accent Border / Glow', group: 'Color' },
      { id: 'scaleStart', type: 'number', label: 'Starting Scale (%)', min: 50, max: 95, group: 'Motion' },
      { id: 'easing', type: 'easing', label: 'Pop Ease', group: 'Motion' }
    ],
    defaultParams: {
      keyword: 'SCALABLE TEAMS',
      subtext: 'Built for fast-growing modern businesses',
      badgeColor: '#1E293B',
      textColor: '#FFFFFF',
      accentColor: '#C92A2A',
      scaleStart: 75,
      easing: 'back.out(2)'
    },
    renderHtml: (params, mode = 'overlay-alpha') => {
      const p = { ...TEMPLATES['keyword-pop'].defaultParams, ...params };
      const bg = mode === 'chroma' ? '#00FF00' : mode === 'full' ? '#0B0F19' : 'transparent';
      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
  <style>
    :root {
      --bg: ${bg};
      --badge-bg: ${p.badgeColor};
      --text-color: ${p.textColor};
      --accent: ${p.accentColor};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: var(--bg);
      font-family: 'Inter', -apple-system, sans-serif;
    }
    #root {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
    }
    .pop-badge {
      display: inline-flex;
      align-items: center;
      gap: 16px;
      background: var(--badge-bg);
      border: 3px solid var(--accent);
      border-radius: 9999px;
      padding: 24px 56px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(201, 42, 42, 0.3);
      opacity: 0;
    }
    .pop-badge h1 {
      color: var(--text-color);
      font-size: 72px;
      font-weight: 800;
      letter-spacing: -0.01em;
    }
    .subtext {
      color: #94A3B8;
      font-size: 32px;
      font-weight: 500;
      opacity: 0;
    }
    .cursor-marker {
      position: absolute;
      width: 48px;
      height: 48px;
      opacity: 0;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${p.duration || 3}" data-width="1920" data-height="1080">
    <div id="card" class="clip pop-badge" data-start="0" data-duration="${p.duration || 3}" data-track-index="0">
      <h1>${esc(p.keyword)}</h1>
    </div>
    <div id="subtext-el" class="clip subtext" data-start="0.4" data-duration="${(p.duration || 3) - 0.4}" data-track-index="1">
      ${esc(p.subtext)}
    </div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.fromTo("#card",
      { opacity: 0, scale: ${p.scaleStart / 100}, y: 30 },
      { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: "${p.easing}" },
      0.2
    );
    tl.fromTo("#subtext-el",
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
      0.5
    );
    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>`;
    }
  },

  'strike-checklist': {
    id: 'strike-checklist',
    name: 'Strike Checklist (Problem / Pain Points)',
    description: 'Items appear, then sequentially get crossed out with a bold red strike line',
    defaultDuration: 7,
    paramsSchema: [
      { id: 'title', type: 'text', label: 'Header Title', group: 'Content' },
      { id: 'items', type: 'text', label: 'Checklist Items (comma-separated)', group: 'Content' },
      { id: 'headerColor', type: 'color', label: 'Header Color', group: 'Color' },
      { id: 'itemColor', type: 'color', label: 'Item Text Color', group: 'Color' },
      { id: 'strikeColor', type: 'color', label: 'Strike Line Color', group: 'Color' },
      { id: 'cardBg', type: 'color', label: 'Card Background', group: 'Color' }
    ],
    defaultParams: {
      title: 'Traditional Hiring Headaches',
      items: 'Recruitment,Office Space,Equipment,Admin Overhead',
      headerColor: '#F8FAFC',
      itemColor: '#CBD5E1',
      strikeColor: '#C92A2A',
      cardBg: '#1E293B'
    },
    renderHtml: (params, mode = 'overlay-alpha') => {
      const p = { ...TEMPLATES['strike-checklist'].defaultParams, ...params };
      const itemsList = String(p.items || '').split(',').map(s => s.trim()).filter(Boolean);
      const bg = mode === 'chroma' ? '#00FF00' : mode === 'full' ? '#0B0F19' : 'transparent';

      const itemsHtml = itemsList.map((item, i) => `
        <div class="check-row" id="row-${i}">
          <div class="bullet-box">
            <svg class="x-mark" id="x-${i}" viewBox="0 0 24 24" fill="none" stroke="${p.strikeColor}" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </div>
          <div class="text-wrapper">
            <span class="item-text" id="text-${i}">${esc(item)}</span>
            <div class="strike-line" id="line-${i}"></div>
          </div>
        </div>
      `).join('\n        ');

      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
  <style>
    :root {
      --bg: ${bg};
      --card-bg: ${p.cardBg};
      --header-color: ${p.headerColor};
      --item-color: ${p.itemColor};
      --strike-color: ${p.strikeColor};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: var(--bg);
      font-family: 'Inter', -apple-system, sans-serif;
    }
    #root {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .checklist-card {
      background: var(--card-bg);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 28px;
      padding: 60px 80px;
      width: 1100px;
      box-shadow: 0 30px 60px rgba(0, 0, 0, 0.7);
      opacity: 0;
    }
    h2 {
      font-size: 52px;
      color: var(--header-color);
      margin-bottom: 44px;
      font-weight: 800;
      letter-spacing: -0.02em;
      border-bottom: 2px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 24px;
    }
    .check-row {
      display: flex;
      align-items: center;
      gap: 28px;
      margin-bottom: 28px;
      opacity: 0;
    }
    .bullet-box {
      width: 44px;
      height: 44px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .x-mark {
      width: 28px;
      height: 28px;
      opacity: 0;
    }
    .text-wrapper {
      position: relative;
      display: inline-block;
    }
    .item-text {
      font-size: 38px;
      color: var(--item-color);
      font-weight: 600;
    }
    .strike-line {
      position: absolute;
      top: 52%;
      left: 0;
      width: 0%;
      height: 4px;
      background: var(--strike-color);
      border-radius: 2px;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${p.duration || 7}" data-width="1920" data-height="1080">
    <div id="card-wrap" class="clip checklist-card" data-start="0" data-duration="${p.duration || 7}" data-track-index="0">
      <h2>${esc(p.title)}</h2>
      <div class="rows-container">
        ${itemsHtml}
      </div>
    </div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });

    // Card entrance
    tl.fromTo("#card-wrap",
      { opacity: 0, scale: 0.92, y: 30 },
      { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "power3.out" },
      0.1
    );

    const count = ${itemsList.length};
    // Sequential reveal
    for (let i = 0; i < count; i++) {
      const revealTime = 0.5 + (i * 0.35);
      tl.fromTo("#row-" + i,
        { opacity: 0, x: -25 },
        { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" },
        revealTime
      );
    }

    // Sequential strikethrough after short pause
    const strikeStart = 0.6 + (count * 0.35) + 0.5;
    for (let i = 0; i < count; i++) {
      const sTime = strikeStart + (i * 0.7);
      tl.fromTo("#line-" + i,
        { width: "0%" },
        { width: "105%", duration: 0.3, ease: "power3.inOut" },
        sTime
      );
      tl.fromTo("#x-" + i,
        { opacity: 0, scale: 0 },
        { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2)" },
        sTime + 0.1
      );
      tl.fromTo("#text-" + i,
        { color: "${p.itemColor}" },
        { color: "#64748B", duration: 0.3 },
        sTime + 0.1
      );
    }

    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>`;
    }
  },

  'icon-cards': {
    id: 'icon-cards',
    name: 'Icon Cards (Features / Grid)',
    description: 'Grid of 4 feature cards with sequential pop-in, floating idle drift, and icons',
    defaultDuration: 7,
    paramsSchema: [
      { id: 'heading', type: 'text', label: 'Section Title', group: 'Content' },
      { id: 'card1', type: 'text', label: 'Card 1 Title', group: 'Content' },
      { id: 'card2', type: 'text', label: 'Card 2 Title', group: 'Content' },
      { id: 'card3', type: 'text', label: 'Card 3 Title', group: 'Content' },
      { id: 'card4', type: 'text', label: 'Card 4 Title', group: 'Content' },
      { id: 'primaryColor', type: 'color', label: 'Brand Color', group: 'Color' },
      { id: 'cardBg', type: 'color', label: 'Card Background', group: 'Color' }
    ],
    defaultParams: {
      heading: 'Everything You Need in One Place',
      card1: 'Dedicated Employees',
      card2: 'Office Infrastructure',
      card3: 'Recruitment Support',
      card4: 'Flexible Working Hours',
      primaryColor: '#C92A2A',
      cardBg: '#1E293B'
    },
    renderHtml: (params, mode = 'overlay-alpha') => {
      const p = { ...TEMPLATES['icon-cards'].defaultParams, ...params };
      const bg = mode === 'chroma' ? '#00FF00' : mode === 'full' ? '#0B0F19' : 'transparent';
      const cards = [p.card1, p.card2, p.card3, p.card4];

      const icons = [
        `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>`,
        `<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>`,
        `<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line>`,
        `<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>`
      ];

      const cardsHtml = cards.map((c, i) => `
        <div class="grid-card" id="card-${i}">
          <div class="icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="${p.primaryColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              ${icons[i]}
            </svg>
          </div>
          <h3>${esc(c)}</h3>
        </div>
      `).join('\n        ');

      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
  <style>
    :root {
      --bg: ${bg};
      --primary: ${p.primaryColor};
      --card-bg: ${p.cardBg};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: var(--bg);
      font-family: 'Inter', -apple-system, sans-serif;
    }
    #root {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 5%;
    }
    h2 {
      font-size: 54px;
      color: #FFFFFF;
      font-weight: 800;
      margin-bottom: 56px;
      text-shadow: 0 4px 16px rgba(0,0,0,0.5);
      opacity: 0;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 32px;
      width: 1600px;
    }
    .grid-card {
      background: var(--card-bg);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 24px;
      padding: 48px 32px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 28px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      opacity: 0;
      transform-origin: center bottom;
    }
    .icon-wrap {
      width: 88px;
      height: 88px;
      background: rgba(201, 42, 42, 0.12);
      border: 2px solid rgba(201, 42, 42, 0.35);
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon-wrap svg {
      width: 44px;
      height: 44px;
    }
    .grid-card h3 {
      font-size: 28px;
      color: #F8FAFC;
      font-weight: 700;
      line-height: 1.3;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${p.duration || 7}" data-width="1920" data-height="1080">
    <div id="wrapper" class="clip" data-start="0" data-duration="${p.duration || 7}" data-track-index="0">
      <h2 id="heading-el">${esc(p.heading)}</h2>
      <div class="cards-grid">
        ${cardsHtml}
      </div>
    </div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });

    tl.fromTo("#heading-el",
      { opacity: 0, y: -20 },
      { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
      0.1
    );

    for (let i = 0; i < 4; i++) {
      const enterTime = 0.4 + (i * 0.22);
      tl.fromTo("#card-" + i,
        { opacity: 0, scale: 0.75, y: 40 },
        { opacity: 1, scale: 1, y: 0, duration: 0.55, ease: "back.out(1.8)" },
        enterTime
      );
      // Subtle float
      tl.fromTo("#card-" + i,
        { y: 0 },
        { y: -8, duration: 1.8, ease: "power1.inOut", yoyo: true, repeat: 1 },
        enterTime + 0.6
      );
    }

    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>`;
    }
  },

  'lower-third': {
    id: 'lower-third',
    name: 'Lower Third (Speaker & Title)',
    description: 'Broadcast-quality lower third badge with animated accent bar and title',
    defaultDuration: 5,
    paramsSchema: [
      { id: 'name', type: 'text', label: 'Speaker Name', group: 'Content' },
      { id: 'title', type: 'text', label: 'Role / Designation', group: 'Content' },
      { id: 'company', type: 'text', label: 'Company Name', group: 'Content' },
      { id: 'accentColor', type: 'color', label: 'Accent Bar Color', group: 'Color' },
      { id: 'cardBg', type: 'color', label: 'Card Background', group: 'Color' }
    ],
    defaultParams: {
      name: 'Sarah Jenkins',
      title: 'Operations Director',
      company: 'Staff India',
      accentColor: '#C92A2A',
      cardBg: '#1E293B'
    },
    renderHtml: (params, mode = 'overlay-alpha') => {
      const p = { ...TEMPLATES['lower-third'].defaultParams, ...params };
      const bg = mode === 'chroma' ? '#00FF00' : mode === 'full' ? '#0B0F19' : 'transparent';
      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
  <style>
    :root {
      --bg: ${bg};
      --accent: ${p.accentColor};
      --card-bg: ${p.cardBg};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: var(--bg);
      font-family: 'Inter', -apple-system, sans-serif;
    }
    #root {
      width: 100%;
      height: 100%;
      position: relative;
    }
    .lt-wrapper {
      position: absolute;
      bottom: 90px;
      left: 100px;
      display: flex;
      align-items: stretch;
      box-shadow: 0 20px 45px rgba(0,0,0,0.6);
      border-radius: 16px;
      overflow: hidden;
      opacity: 0;
    }
    .accent-bar {
      width: 12px;
      background: var(--accent);
    }
    .content-box {
      background: var(--card-bg);
      padding: 24px 44px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-left: none;
    }
    .name {
      font-size: 38px;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: -0.01em;
      margin-bottom: 4px;
    }
    .subtitle {
      font-size: 22px;
      font-weight: 500;
      color: #94A3B8;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${p.duration || 5}" data-width="1920" data-height="1080">
    <div id="lt-card" class="clip lt-wrapper" data-start="0" data-duration="${p.duration || 5}" data-track-index="0">
      <div class="accent-bar"></div>
      <div class="content-box">
        <div class="name">${esc(p.name)}</div>
        <div class="subtitle">${esc(p.title)} · <span style="color: var(--accent);">${esc(p.company)}</span></div>
      </div>
    </div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.fromTo("#lt-card",
      { opacity: 0, x: -60 },
      { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" },
      0.3
    );
    tl.fromTo("#lt-card",
      { opacity: 1, x: 0 },
      { opacity: 0, x: -40, duration: 0.4, ease: "power2.in" },
      ${(p.duration || 5) - 0.5}
    );
    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>`;
    }
  },

  'step-card': {
    id: 'step-card',
    name: 'Step Card (How It Works)',
    description: 'Process roadmap card with "STEP 01" pill badge, big title, and description',
    defaultDuration: 5,
    paramsSchema: [
      { id: 'stepBadge', type: 'text', label: 'Step Badge', group: 'Content' },
      { id: 'stepTitle', type: 'text', label: 'Step Title', group: 'Content' },
      { id: 'stepDesc', type: 'text', label: 'Step Description', group: 'Content' },
      { id: 'badgeColor', type: 'color', label: 'Badge Color', group: 'Color' }
    ],
    defaultParams: {
      stepBadge: 'STEP 01',
      stepTitle: 'Tell Us What Roles You Need',
      stepDesc: 'We match you with top talent and handle office infrastructure and equipment.',
      badgeColor: '#C92A2A'
    },
    renderHtml: (params, mode = 'overlay-alpha') => {
      const p = { ...TEMPLATES['step-card'].defaultParams, ...params };
      const bg = mode === 'chroma' ? '#00FF00' : mode === 'full' ? '#0B0F19' : 'transparent';
      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
  <style>
    :root {
      --bg: ${bg};
      --badge-color: ${p.badgeColor};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: var(--bg);
      font-family: 'Inter', -apple-system, sans-serif;
    }
    #root {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #1E293B;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 28px;
      padding: 64px 80px;
      max-width: 1100px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.7);
      opacity: 0;
    }
    .step-pill {
      display: inline-block;
      background: var(--badge-color);
      color: #FFFFFF;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.1em;
      padding: 10px 24px;
      border-radius: 9999px;
      margin-bottom: 24px;
      opacity: 0;
    }
    h2 {
      font-size: 52px;
      color: #FFFFFF;
      font-weight: 800;
      margin-bottom: 20px;
      letter-spacing: -0.02em;
      opacity: 0;
    }
    p {
      font-size: 28px;
      color: #94A3B8;
      line-height: 1.5;
      font-weight: 500;
      opacity: 0;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${p.duration || 5}" data-width="1920" data-height="1080">
    <div id="step-box" class="clip card" data-start="0" data-duration="${p.duration || 5}" data-track-index="0">
      <div id="pill" class="step-pill">${esc(p.stepBadge)}</div>
      <h2 id="title">${esc(p.stepTitle)}</h2>
      <p id="desc">${esc(p.stepDesc)}</p>
    </div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.fromTo("#step-box",
      { opacity: 0, scale: 0.9, y: 30 },
      { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "power3.out" },
      0.1
    );
    tl.fromTo("#pill",
      { opacity: 0, scale: 0.8 },
      { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" },
      0.3
    );
    tl.fromTo("#title",
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
      0.45
    );
    tl.fromTo("#desc",
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
      0.6
    );
    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>`;
    }
  },

  'number-counter': {
    id: 'number-counter',
    name: 'Number Counter (Metrics & Stats)',
    description: 'Large animated counter ticking up from 0 to target metric with label',
    defaultDuration: 4,
    paramsSchema: [
      { id: 'targetNumber', type: 'number', label: 'Target Number', min: 1, max: 1000000, group: 'Content' },
      { id: 'prefix', type: 'text', label: 'Prefix (e.g. $ or +)', group: 'Content' },
      { id: 'suffix', type: 'text', label: 'Suffix (e.g. % or k+)', group: 'Content' },
      { id: 'label', type: 'text', label: 'Metric Description', group: 'Content' },
      { id: 'numberColor', type: 'color', label: 'Number Color', group: 'Color' }
    ],
    defaultParams: {
      targetNumber: 70,
      prefix: '',
      suffix: '%',
      label: 'Cost Reduction Compared to Local UK/US Hiring',
      numberColor: '#10B981'
    },
    renderHtml: (params, mode = 'overlay-alpha') => {
      const p = { ...TEMPLATES['number-counter'].defaultParams, ...params };
      const bg = mode === 'chroma' ? '#00FF00' : mode === 'full' ? '#0B0F19' : 'transparent';
      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
  <style>
    :root {
      --bg: ${bg};
      --num-color: ${p.numberColor};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: var(--bg);
      font-family: 'Inter', -apple-system, sans-serif;
    }
    #root {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .stat-container {
      background: #1E293B;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 32px;
      padding: 60px 100px;
      box-shadow: 0 30px 70px rgba(0,0,0,0.65);
      opacity: 0;
    }
    .number-display {
      font-size: 130px;
      font-weight: 900;
      color: var(--num-color);
      letter-spacing: -0.03em;
      line-height: 1;
      margin-bottom: 20px;
    }
    .label-display {
      font-size: 34px;
      color: #F8FAFC;
      font-weight: 600;
      max-width: 800px;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${p.duration || 4}" data-width="1920" data-height="1080">
    <div id="stat-box" class="clip stat-container" data-start="0" data-duration="${p.duration || 4}" data-track-index="0">
      <div class="number-display">
        <span>${esc(p.prefix)}</span><span id="num-val">0</span><span>${esc(p.suffix)}</span>
      </div>
      <div class="label-display">${esc(p.label)}</div>
    </div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    const target = ${Number(p.targetNumber) || 0};
    const counterObj = { val: 0 };
    const numEl = document.getElementById("num-val");

    tl.fromTo("#stat-box",
      { opacity: 0, scale: 0.85, y: 30 },
      { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(1.5)" },
      0.1
    );

    tl.to(counterObj, {
      val: target,
      duration: 1.8,
      ease: "power2.out",
      onUpdate: () => {
        if (numEl) numEl.textContent = Math.round(counterObj.val).toLocaleString();
      }
    }, 0.3);

    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>`;
    }
  },

  'caption-track': {
    id: 'caption-track',
    name: 'Caption Track (Word Highlight Pill)',
    description: 'Clean subtitle pill with active highlighted word for voiceover synchronization',
    defaultDuration: 3,
    paramsSchema: [
      { id: 'captionText', type: 'text', label: 'Caption Words', group: 'Content' },
      { id: 'highlightIndex', type: 'number', label: 'Active Word Index (0-based)', min: 0, max: 20, group: 'Content' },
      { id: 'activeColor', type: 'color', label: 'Active Word Color', group: 'Color' }
    ],
    defaultParams: {
      captionText: 'Hire dedicated remote specialists today',
      highlightIndex: 1,
      activeColor: '#C92A2A'
    },
    renderHtml: (params, mode = 'overlay-alpha') => {
      const p = { ...TEMPLATES['caption-track'].defaultParams, ...params };
      const bg = mode === 'chroma' ? '#00FF00' : mode === 'full' ? '#0B0F19' : 'transparent';
      const words = String(p.captionText || '').split(/\s+/).filter(Boolean);
      const spans = words.map((w, idx) => `
        <span class="cap-word" id="cap-${idx}">${esc(w)}</span>
      `).join(' ');

      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
  <style>
    :root {
      --bg: ${bg};
      --active: ${p.activeColor};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: var(--bg);
      font-family: 'Inter', -apple-system, sans-serif;
    }
    #root {
      width: 100%;
      height: 100%;
      position: relative;
    }
    .caption-pill {
      position: absolute;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 9999px;
      padding: 20px 48px;
      box-shadow: 0 15px 40px rgba(0,0,0,0.6);
      opacity: 0;
    }
    .cap-word {
      font-size: 38px;
      font-weight: 700;
      color: #94A3B8;
      margin: 0 6px;
      display: inline-block;
    }
    .cap-word.active {
      color: var(--active);
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${p.duration || 3}" data-width="1920" data-height="1080">
    <div id="pill-wrap" class="clip caption-pill" data-start="0" data-duration="${p.duration || 3}" data-track-index="0">
      ${spans}
    </div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.fromTo("#pill-wrap",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
      0.1
    );

    const words = document.querySelectorAll(".cap-word");
    const interval = (${p.duration || 3} - 0.4) / Math.max(words.length, 1);
    words.forEach((w, i) => {
      tl.fromTo(w,
        { color: "#94A3B8", scale: 1 },
        { color: "${p.activeColor}", scale: 1.08, duration: 0.15, ease: "power1.out" },
        0.2 + (i * interval)
      );
      if (i < words.length - 1) {
        tl.to(w, { color: "#FFFFFF", scale: 1, duration: 0.15 }, 0.2 + ((i + 1) * interval));
      }
    });

    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>`;
    }
  },

  'end-card': {
    id: 'end-card',
    name: 'End Card (Logo, Website, CTA)',
    description: 'Outro card with official Staff India branding, website, and CTA button',
    defaultDuration: 4,
    paramsSchema: [
      { id: 'brandName', type: 'text', label: 'Brand Name', group: 'Content' },
      { id: 'website', type: 'text', label: 'Website URL', group: 'Content' },
      { id: 'ctaText', type: 'text', label: 'CTA Button Text', group: 'Content' },
      { id: 'primaryColor', type: 'color', label: 'Primary Accent', group: 'Color' }
    ],
    defaultParams: {
      brandName: 'Staff India',
      website: 'Visit Staff-India.com',
      ctaText: 'Speak to an Advisor',
      primaryColor: '#C92A2A'
    },
    renderHtml: (params, mode = 'overlay-alpha') => {
      const p = { ...TEMPLATES['end-card'].defaultParams, ...params };
      const bg = mode === 'chroma' ? '#00FF00' : mode === 'full' ? '#0B0F19' : 'transparent';
      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
  <style>
    :root {
      --bg: ${bg};
      --primary: ${p.primaryColor};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: var(--bg);
      font-family: 'Inter', -apple-system, sans-serif;
    }
    #root {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .end-container {
      background: #1E293B;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 36px;
      padding: 70px 110px;
      box-shadow: 0 35px 80px rgba(0,0,0,0.7);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;
      opacity: 0;
    }
    .logo-badge {
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .logo-badge svg {
      width: 64px;
      height: 64px;
    }
    .brand-title {
      font-size: 58px;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: -0.02em;
    }
    .website-text {
      font-size: 36px;
      color: #94A3B8;
      font-weight: 600;
    }
    .cta-button {
      background: var(--primary);
      color: #FFFFFF;
      font-size: 32px;
      font-weight: 700;
      padding: 22px 56px;
      border-radius: 9999px;
      box-shadow: 0 10px 30px rgba(201, 42, 42, 0.45);
      opacity: 0;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${p.duration || 4}" data-width="1920" data-height="1080">
    <div id="end-box" class="clip end-container" data-start="0" data-duration="${p.duration || 4}" data-track-index="0">
      <div class="logo-badge">
        <svg viewBox="0 0 100 100" fill="none">
          <path d="M50 10C35 10 25 24 25 40C25 60 50 90 50 90C50 90 75 60 75 40C75 24 65 10 50 10Z" fill="${p.primaryColor}"/>
          <circle cx="50" cy="38" r="14" fill="white"/>
          <path d="M44 38L48 42L56 34" stroke="${p.primaryColor}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="brand-title">${esc(p.brandName)}</span>
      </div>
      <div class="website-text">${esc(p.website)}</div>
      <div id="cta-btn" class="cta-button">${esc(p.ctaText)}</div>
    </div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.fromTo("#end-box",
      { opacity: 0, scale: 0.88, y: 35 },
      { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: "power3.out" },
      0.1
    );
    tl.fromTo("#cta-btn",
      { opacity: 0, scale: 0.8 },
      { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2)" },
      0.5
    );
    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>`;
    }
  },

  'whip-transition': {
    id: 'whip-transition',
    name: 'Whip Transition (Speed Blur)',
    description: 'Fast kinetic whip wipe effect with multi-layered speed streaks',
    defaultDuration: 1.5,
    paramsSchema: [
      { id: 'color1', type: 'color', label: 'Leading Streak Color', group: 'Color' },
      { id: 'color2', type: 'color', label: 'Trailing Streak Color', group: 'Color' }
    ],
    defaultParams: {
      color1: '#C92A2A',
      color2: '#2563EB'
    },
    renderHtml: (params, mode = 'overlay-alpha') => {
      const p = { ...TEMPLATES['whip-transition'].defaultParams, ...params };
      const bg = mode === 'chroma' ? '#00FF00' : 'transparent';
      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: ${bg};
    }
    #root {
      width: 100%;
      height: 100%;
      position: relative;
    }
    .whip-bar {
      position: absolute;
      top: 0;
      height: 100%;
      width: 100%;
      transform: skewX(-20deg);
    }
    #bar-1 { background: ${p.color2}; left: -140%; }
    #bar-2 { background: ${p.color1}; left: -140%; }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${p.duration || 1.5}" data-width="1920" data-height="1080">
    <div id="bar-1" class="clip whip-bar" data-start="0" data-duration="${p.duration || 1.5}" data-track-index="0"></div>
    <div id="bar-2" class="clip whip-bar" data-start="0" data-duration="${p.duration || 1.5}" data-track-index="1"></div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.fromTo("#bar-1",
      { x: "-120%" },
      { x: "240%", duration: 0.9, ease: "expo.inOut" },
      0.1
    );
    tl.fromTo("#bar-2",
      { x: "-120%" },
      { x: "240%", duration: 0.9, ease: "expo.inOut" },
      0.18
    );
    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>`;
    }
  },

  'glow-sweep': {
    id: 'glow-sweep',
    name: 'Glow Sweep Reveal',
    description: 'Radiant metallic shimmer sweep wiping across title card',
    defaultDuration: 3,
    paramsSchema: [
      { id: 'headline', type: 'text', label: 'Headline', group: 'Content' },
      { id: 'glowColor', type: 'color', label: 'Glow Color', group: 'Color' }
    ],
    defaultParams: {
      headline: 'RELIABLE OFFSHORE TEAMS',
      glowColor: '#C92A2A'
    },
    renderHtml: (params, mode = 'overlay-alpha') => {
      const p = { ...TEMPLATES['glow-sweep'].defaultParams, ...params };
      const bg = mode === 'chroma' ? '#00FF00' : mode === 'full' ? '#0B0F19' : 'transparent';
      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      background: ${bg};
      font-family: 'Inter', -apple-system, sans-serif;
    }
    #root {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sweep-text {
      font-size: 84px;
      font-weight: 900;
      color: #FFFFFF;
      letter-spacing: 0.02em;
      position: relative;
      overflow: hidden;
      padding: 20px 40px;
    }
    .shimmer {
      position: absolute;
      top: 0;
      left: -100%;
      width: 60%;
      height: 100%;
      background: linear-gradient(90deg, transparent, ${p.glowColor}, #FFFFFF, transparent);
      transform: skewX(-25deg);
      mix-blend-mode: overlay;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${p.duration || 3}" data-width="1920" data-height="1080">
    <div id="text-wrap" class="clip sweep-text" data-start="0" data-duration="${p.duration || 3}" data-track-index="0">
      ${esc(p.headline)}
      <div id="shimmer-el" class="shimmer"></div>
    </div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.fromTo("#text-wrap",
      { opacity: 0, scale: 0.9 },
      { opacity: 1, scale: 1, duration: 0.5, ease: "power2.out" },
      0.1
    );
    tl.fromTo("#shimmer-el",
      { left: "-100%" },
      { left: "200%", duration: 1.2, ease: "power2.inOut" },
      0.6
    );
    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>`;
    }
  }
};


import { Archetype, DIM_OPACITY, STRIKE_DURATION, TemplateParams } from '../../common/archetypes.js';
import { ParamFieldSchema } from '../../common/types.js';

/**
 * Deterministic template renderers.
 *
 * Every renderer uses normal-flow flex/grid siblings with an explicit gap.
 * Items are `position: relative`, never absolute, so multi-item layouts can
 * never collapse onto one another. Strike lines are the only absolute children
 * and they are scoped to their own item.
 */
export function renderTemplate(archetype: Archetype, params: TemplateParams): string {
  const style = baseStyle(archetype, params);
  const items = params.items.map((item, i) => renderItem(archetype, params, item, i)).join('\n      ');
  const timeline = renderTimeline(archetype, params);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
${style}
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${params.duration}" data-width="1920" data-height="1080" class="archetype-${archetype}">
      <div class="list">
      ${items}
      </div>
  </div>
  <script src="assets/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    window.__PARAMS = ${JSON.stringify(params)};
    const tl = gsap.timeline({ paused: true });
${timeline}

    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>`;
}

/** Text archetypes that receive the default readability shadow. */
const SHADOW_ARCHETYPES: Archetype[] = [
  'strike-checklist',
  'text-slam',
  'keyword-pop',
  'lower-third',
  'icon-cards',
  'step-card',
  'end-card'
];

function baseStyle(archetype: Archetype, params: TemplateParams): string {
  const isHorizontal = params.layout === 'horizontal';
  const isLowerThird = archetype === 'lower-third';
  const isCaption = archetype === 'caption-track';

  const rootLayout = isLowerThird
    ? `display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-end; padding-bottom: 160px; padding-left: 100px;`
    : `display: flex; flex-direction: column; align-items: center; justify-content: center;`;

  return `    :root {
      --text-color: ${params.textColor};
      --accent-color: ${params.accentColor};
      --font-size: ${params.fontSize}px;
      --gap: ${params.gap}px;
      --shadow: ${params.readability ? params.shadow : 'none'};
      --strike-thickness: ${params.strikeThickness}px;
      --font-family: "Montserrat", "Inter", -apple-system, sans-serif;
    }
    html, body { margin: 0; padding: 0; width: 1920px; height: 1080px; background: transparent; overflow: hidden; }
    body { font-family: var(--font-family); }
    #root { width: 1920px; height: 1080px; box-sizing: border-box; padding: 5%; ${rootLayout} }
    .list {
      display: flex;
      flex-direction: ${isHorizontal ? 'row' : 'column'};
      align-items: center;
      justify-content: center;
      gap: var(--gap);
      max-width: 100%;
      ${isHorizontal ? 'width: auto;' : ''}
    }
    /* Items are normal-flow flex children: relative, never absolute. */
    .item {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--text-color);
      font-size: var(--font-size);
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -0.01em;
      opacity: 0;
      will-change: transform, opacity;
      white-space: nowrap;
    }
    ${SHADOW_ARCHETYPES.includes(archetype) ? '.item { text-shadow: 0 10px 30px rgba(0,0,0,0.85), 0 2px 8px rgba(0,0,0,0.6); }' : ''}
    .strike {
      position: absolute;
      left: 0;
      top: 50%;
      height: var(--strike-thickness);
      width: 0;
      background: var(--accent-color);
      transform: translateY(-50%);
      border-radius: calc(var(--strike-thickness) / 2);
      pointer-events: none;
    }
    ${archetype === 'keyword-pop' ? '.item { padding: 16px 48px; border-radius: 9999px; background: rgba(30, 41, 59, 0.95); border: 2px solid var(--accent-color); box-shadow: 0 15px 40px rgba(0,0,0,0.6); }' : ''}
    ${archetype === 'lower-third' ? '.item { border-left: 12px solid var(--accent-color); padding: 20px 36px; font-size: 56px; background: rgba(30, 41, 59, 0.95); border-radius: 0 16px 16px 0; }' : ''}
    ${archetype === 'icon-cards' ? '.item { padding: 32px 48px; border-radius: 24px; background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(255,255,255,0.12); font-size: 48px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }' : ''}
    ${archetype === 'step-card' ? '.item { padding: 36px 64px; border-radius: 28px; background: rgba(30, 41, 59, 0.95); border: 1px solid rgba(255,255,255,0.12); font-size: 52px; box-shadow: 0 25px 50px rgba(0,0,0,0.7); }' : ''}
    ${archetype === 'end-card' ? '.list { align-items: center; } .item { font-size: 72px; text-align: center; }' : ''}
    ${isCaption ? '.item { font-size: 52px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255,255,255,0.15); padding: 18px 44px; border-radius: 9999px; box-shadow: 0 15px 40px rgba(0,0,0,0.6); }' : ''}
    ${archetype === 'number-counter' ? '.item { font-size: 130px; font-weight: 900; font-variant-numeric: tabular-nums; color: var(--accent-color); text-shadow: 0 12px 36px rgba(0,0,0,0.8); }' : ''}
    ${archetype === 'glow-sweep' ? '.item { font-size: 96px; font-weight: 900; letter-spacing: 0.02em; text-shadow: 0 0 35px var(--accent-color), 0 0 70px var(--accent-color), 0 10px 30px rgba(0,0,0,0.9); }' : ''}
    ${archetype === 'whip-transition' ? '.item { font-size: 96px; }' : ''}`;
}

function renderItem(
  archetype: Archetype,
  params: TemplateParams,
  item: TemplateParams['items'][number],
  index: number
): string {
  const strike =
    archetype === 'strike-checklist' && params.showStrike
      ? `<span class="strike" id="strike${index + 1}" aria-hidden="true"></span>`
      : '';

  return `<div class="item clip" id="item${index + 1}" data-start="${item.start}" data-duration="${item.duration ?? params.duration - item.start}">${escapeHtml(item.text)}${strike}</div>`;
}

function renderTimeline(archetype: Archetype, params: TemplateParams): string {
  const lines: string[] = [];
  const easing = params.easing;
  // Horizontal rows animate scale only: a y offset makes neighbours briefly
  // overlap while their entrances are staggered.
  const horizontal = params.layout === 'horizontal';

  params.items.forEach((item, i) => {
    const start = item.start;
    const sel = `#item${i + 1}`;
    // Horizontal rows fade only: any scale/translate changes the measured box
    // mid-entrance and can briefly overlap the neighbouring item.
    const from: Record<string, string | number> = horizontal ? { opacity: 0 } : { opacity: 0, y: 60 };
    const to: Record<string, string | number> = horizontal
      ? { opacity: 1, duration: 0.45, ease: easing }
      : { opacity: 1, y: 0, duration: 0.45, ease: easing };

    if (archetype === 'text-slam') {
      // Word rows scale from 1.6 would grow into their neighbours; keep the
      // scale slam only for stacked (non-horizontal) text.
      if (!horizontal) {
        from.scale = 1.6;
        to.scale = 1;
      }
      to.duration = 0.35;
      to.ease = 'power4.out';
      lines.push(`    tl.fromTo("${sel}", ${js(from)}, ${js(to)}, ${start});`);
      lines.push(`    tl.to("${sel}", { x: -8, duration: 0.05 }, ${round2(start + 0.35)}).to("${sel}", { x: 8, duration: 0.05 }).to("${sel}", { x: 0, duration: 0.05 });`);
      return;
    }
    if (archetype === 'whip-transition') {
      from.x = 320;
      to.x = 0;
      to.ease = 'expo.out';
    }
    if (archetype === 'number-counter') {
      from.scale = 0.7;
      to.scale = 1;
      to.ease = 'back.out(1.7)';
    }
    if (archetype === 'glow-sweep') {
      from.x = -40;
      to.x = 0;
    }
    if (archetype === 'keyword-pop') {
      from.scale = 0.8;
      to.scale = 1;
      to.ease = 'back.out(2)';
    }

    lines.push(`    tl.fromTo("${sel}", ${js(from)}, ${js(to)}, ${start});`);

    if (archetype === 'strike-checklist' && params.showStrike && item.strikeStart !== undefined) {
      lines.push(`    tl.to("#strike${i + 1}", { width: "100%", duration: ${STRIKE_DURATION}, ease: "power2.out" }, ${item.strikeStart});`);
      if (params.dimAfterStrike) {
        lines.push(
          `    tl.to("${sel}", { opacity: ${DIM_OPACITY}, duration: 0.2, ease: "power1.out" }, ${round2(item.strikeStart + STRIKE_DURATION)});`
        );
      }
    }
  });

  if (params.fadeOutAt !== undefined) {
    lines.push(`    tl.to("#root", { opacity: 0, duration: 0.3 }, ${params.fadeOutAt});`);
  }

  return lines.join('\n');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function js(obj: Record<string, unknown>): string {
  return JSON.stringify(obj).replace(/"/g, "'").replace(/'([a-zA-Z_$][\w$]*)':/g, '$1:');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Editable params surfaced in the Params tab — no LLM round-trip needed. */
export function templateParamSchema(archetype: Archetype, params: TemplateParams): ParamFieldSchema[] {
  const fields: ParamFieldSchema[] = [
    { id: 'textColor', label: 'Text color', type: 'color', group: 'Style' },
    { id: 'accentColor', label: 'Accent color', type: 'color', group: 'Style' },
    { id: 'fontSize', label: 'Font size (px)', type: 'number', group: 'Style', min: 40, max: 160, step: 2 },
    { id: 'gap', label: 'Item gap (px)', type: 'number', group: 'Layout', min: 24, max: 160, step: 4 },
    { id: 'easing', label: 'Easing', type: 'easing', group: 'Motion' },
    { id: 'layout', label: 'Layout', type: 'text', group: 'Layout', options: ['vertical', 'horizontal'] },
    { id: 'duration', label: 'Duration (s)', type: 'time', group: 'Timing', min: 0.5, max: 30, step: 0.1 }
  ];

  if (archetype === 'strike-checklist') {
    fields.push({ id: 'showStrike', label: 'Show strike lines', type: 'boolean', group: 'Motion' });
    fields.push({ id: 'strikeThickness', label: 'Strike thickness (px)', type: 'number', group: 'Style', min: 2, max: 40, step: 1 });
    fields.push({ id: 'dimAfterStrike', label: 'Dim struck items', type: 'boolean', group: 'Motion' });
  }
  if (SHADOW_ARCHETYPES.includes(archetype)) {
    fields.push({ id: 'readability', label: 'Readability shadow', type: 'boolean', group: 'Style' });
    fields.push({ id: 'shadow', label: 'Shadow CSS', type: 'text', group: 'Style' });
  }
  if (params.fadeOutAt !== undefined) {
    fields.push({ id: 'fadeOutAt', label: 'Fade out at (s)', type: 'time', group: 'Timing', min: 0, max: params.duration, step: 0.1 });
  }

  params.items.forEach((item, i) => {
    fields.push({ id: `items[${i}].start`, label: `Item ${i + 1} start (s)`, type: 'time', group: 'Timing', min: 0, max: params.duration, step: 0.1 });
  });

  return fields;
}

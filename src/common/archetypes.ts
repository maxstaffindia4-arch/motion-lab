import { z } from 'zod';

/**
 * Template-first generation: an archetype is a deterministic layout family.
 * The model (or the rules router) only fills structured params; the template
 * code owns the HTML, so layout QA never depends on free-form model output.
 */
export const ARCHETYPES = [
  'text-slam',
  'keyword-pop',
  'strike-checklist',
  'lower-third',
  'icon-cards',
  'step-card',
  'end-card',
  'caption-track',
  'number-counter',
  'whip-transition',
  'glow-sweep'
] as const;

export type Archetype = (typeof ARCHETYPES)[number];
export type GenerationPath = 'template' | 'custom';

export const TemplateItemSchema = z.object({
  text: z.string().min(1),
  /** Absolute timeline seconds when this item appears. */
  start: z.number().min(0),
  /** How many seconds the item stays on screen after it appears. */
  duration: z.number().min(0.2).optional(),
  /** Absolute timeline seconds when the strike-through line begins (strike-checklist). */
  strikeStart: z.number().min(0).optional(),
  /** Optional per-item accent value. */
  value: z.union([z.string(), z.number()]).optional()
});

export const DEFAULT_SHADOW = '0 4px 14px rgba(0,0,0,.6)';
/** Must match the strike tween duration in templates/render.ts. */
export const STRIKE_DURATION = 0.22;
export const DIM_OPACITY = 0.6;

export const TemplateParamsSchema = z.object({
  text: z.string().optional(),
  items: z.array(TemplateItemSchema).default([]),
  duration: z.number().min(0.5),
  textColor: z.string().default('#FFFFFF'),
  accentColor: z.string().default('#FF0000'),
  fontSize: z.number().min(40).max(160).default(64),
  gap: z.number().min(24).max(160).default(48),
  easing: z.string().default('power3.out'),
  layout: z.enum(['vertical', 'horizontal']).default('vertical'),
  strikeOn: z.boolean().default(true),
  showStrike: z.boolean().default(false),
  /** Drop shadow behind text for legibility over busy footage. */
  readability: z.boolean().default(true),
  shadow: z.string().default(DEFAULT_SHADOW),
  /** Strike-through line thickness in px. */
  strikeThickness: z.number().min(2).max(40).default(10),
  /** Dim a line to 60% once it has been struck through. */
  dimAfterStrike: z.boolean().default(true),
  fadeOutAt: z.number().min(0).optional()
});

export type TemplateParams = z.infer<typeof TemplateParamsSchema>;

export interface TimingIssue {
  message: string;
  lastAnimationEnd: number;
  strikeEnd: number;
  fadeOutAt: number;
  fixedFadeOutAt: number;
  fixedDuration: number;
}

/** Last moment any entrance/strike animation is still running. */
export function lastAnimationEnd(params: TemplateParams): number {
  const strikeEnds = params.items
    .filter((i) => i.strikeStart !== undefined)
    .map((i) => (i.strikeStart as number) + STRIKE_DURATION);
  const entranceEnds = params.items.map((i) => i.start + 0.45);
  return round2(Math.max(0, ...strikeEnds, ...entranceEnds));
}

export function findTimingIssue(params: TemplateParams): TimingIssue | null {
  if (params.fadeOutAt === undefined) return null;
  const strikeEnd = round2(
    Math.max(0, ...params.items.filter((i) => i.strikeStart !== undefined).map((i) => (i.strikeStart as number) + STRIKE_DURATION))
  );
  const lastEnd = lastAnimationEnd(params);
  if (params.fadeOutAt >= lastEnd) return null;
  const fixedFadeOutAt = round2(lastEnd + 0.5);
  return {
    message: `fade-out starts before the last animation finishes (fade at ${params.fadeOutAt}s, last animation ends ${lastEnd}s)`,
    lastAnimationEnd: lastEnd,
    strikeEnd,
    fadeOutAt: params.fadeOutAt,
    fixedFadeOutAt,
    fixedDuration: Math.max(params.duration, round2(fixedFadeOutAt + 0.3))
  };
}

export function applyTimingFix(params: TemplateParams): TemplateParams {
  const issue = findTimingIssue(params);
  if (!issue) return params;
  return {
    ...params,
    fadeOutAt: issue.fixedFadeOutAt,
    duration: issue.fixedDuration,
    items: params.items.map((i) => ({
      ...i,
      duration: round2(Math.max(0.4, issue.fixedFadeOutAt - i.start))
    }))
  };
}

export interface RoutedArchetype {
  archetype: Archetype | 'custom';
  confidence: number;
  reason: string;
}

const RULES: Array<{ archetype: Archetype; pattern: RegExp; reason: string }> = [
  { archetype: 'strike-checklist', pattern: /\bstrike[- ]?through|\bstrike|\bchecklist\b/i, reason: 'prompt mentions strike-through or checklist' },
  { archetype: 'text-slam', pattern: /\bslam|\bsmash|\bimpact\b/i, reason: 'prompt mentions a slam/impact entrance' },
  { archetype: 'keyword-pop', pattern: /\bkeyword|\bpop\b/i, reason: 'prompt mentions keyword pops' },
  { archetype: 'lower-third', pattern: /lower[- ]third|\bname bar\b|\btitle bar\b/i, reason: 'prompt asks for a lower third' },
  { archetype: 'icon-cards', pattern: /\bicon|\bcards?\b/i, reason: 'prompt asks for icon cards' },
  { archetype: 'step-card', pattern: /\bstep\b|\bprocess\b|\bworkflow\b/i, reason: 'prompt describes steps' },
  { archetype: 'end-card', pattern: /\bend card\b|\bcta\b|\bsubscribe\b|\blogo outro\b/i, reason: 'prompt asks for an end card' },
  { archetype: 'caption-track', pattern: /\bcaption|\bsubtitle|\bsub-?title\b/i, reason: 'prompt asks for captions' },
  { archetype: 'number-counter', pattern: /\bcounter|\bcount[- ]?up|\bpercent|\b\d+%\b/i, reason: 'prompt asks for a counter' },
  { archetype: 'whip-transition', pattern: /\bwhip|\bswipe|\btransition\b/i, reason: 'prompt asks for a whip transition' },
  { archetype: 'glow-sweep', pattern: /\bglow|\bsweep|\bshine\b/i, reason: 'prompt asks for a glow sweep' }
];

/** Rules-first classifier — deterministic, no tokens spent. */
export function routeArchetype(prompt: string, itemCount: number): RoutedArchetype {
  for (const rule of RULES) {
    if (rule.pattern.test(prompt)) {
      return { archetype: rule.archetype, confidence: 0.8, reason: rule.reason };
    }
  }
  if (itemCount <= 1) {
    return { archetype: 'text-slam', confidence: 0.6, reason: 'single text item' };
  }
  return { archetype: 'custom', confidence: 0.4, reason: 'no template matched multi-item layout' };
}

/** Split a "TEXT: A / B / C" section into items; fall back to quoted text. */
export function extractTextItems(prompt: string): string[] {
  const textSection = prompt.match(/TEXT:\s*([\s\S]*?)\s*\/\s*(?:STYLE|BEATS|OUTPUT|SHOT)\b/is);
  if (textSection) {
    const parts = textSection[1]
      .split(/\s*\/\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) return parts;
  }
  const quoted = prompt.match(/"([^"]+)"|“([^”]+)”/);
  if (quoted) return [(quoted[1] || quoted[2]).trim()];

  // Free-form: 'overlay text animates in Happy Birthday' → 'Happy Birthday'
  const phrase = prompt.match(
    /(?:overlay\s+text|on-?screen\s+text|text)\s*(?:animates?\s+in|reads?|says?|shows?|:)?\s*([A-Z][\w'’,-]*(?:\s+[A-Z][\w'’,-]*){0,4})/
  );
  if (phrase) return [phrase[1].trim()];
  return [];
}

/**
 * BEATS: "0.8 Recruitment appears; 2.0 Office Space; 5.0-5.8 strike-through lines"
 * → per-item absolute start times, plus strike windows for strike-checklist.
 */
export function parseBeats(prompt: string, items: string[]): { starts: number[]; strikeStarts: number[]; fadeOutAt?: number } {
  const starts: number[] = [];
  const strikeStarts: number[] = [];
  const beatsSection = prompt.match(/BEATS:\s*([\s\S]*)$/i);
  const beats = beatsSection ? beatsSection[1] : prompt;

  const sorted = [...items].sort((a, b) => b.length - a.length);
  const beatsArray: Array<{ text: string; times: number[] }> = [];
  const totalMatch = beats.match(/fade\s*out[^;\d]*(\d+(?:\.\d+)?)/i);
  const fadeOutAt = totalMatch ? Number(totalMatch[1]) : undefined;

  const segments = beats.split(/;|\n/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const times = [...seg.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    if (!times.length) continue;
    const matched = sorted.find((item) => seg.toLowerCase().includes(item.toLowerCase()));
    if (matched) beatsArray.push({ text: matched, times });
  }

  for (const item of items) {
    const beat = beatsArray.find((b) => b.text === item);
    starts.push(beat ? beat.times[0] : 0);
  }

  if (/strike/i.test(beats)) {
    const strikeSegments = beats
      .split(/;|\n/)
      .filter((s) => /strike/i.test(s))
      .flatMap((s) => [...s.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])));
    const numbered = strikeSegments.filter((n) => n >= 4);
    if (numbered.length >= items.length) {
      const step = numbered.length > items.length ? numbered[1] - numbered[0] : 0.2;
      const base = numbered[0];
      for (let i = 0; i < items.length; i++) strikeStarts.push(round2(base + step * i));
    } else {
      for (let i = 0; i < items.length; i++) strikeStarts.push(round2(5.0 + 0.2 * i));
    }
  }

  return { starts, strikeStarts, fadeOutAt };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Turn a prompt into validated template params for the chosen archetype. */
export function buildTemplateParams(args: {
  prompt: string;
  duration: number;
  archetype: Archetype;
  brandColors?: Record<string, string>;
}): TemplateParams {
  const { prompt, duration, archetype, brandColors } = args;
  const items = extractTextItems(prompt);
  const { starts, strikeStarts, fadeOutAt } = parseBeats(prompt, items);

  const isChecklist = archetype === 'strike-checklist';
  const accent = brandColors?.primary || '#FF0000';

  // text-slam animates word by word: split a single item into words.
  let effectiveItems = items;
  let wordSplit = false;
  if (archetype === 'text-slam' && items.length === 1 && items[0].split(/\s+/).length > 1) {
    effectiveItems = items[0].split(/\s+/);
    wordSplit = true;
  }

  const fontSize = effectiveItems.length > 3 ? 64 : 88;
  const fallbackStep =
    archetype === 'text-slam' && effectiveItems.length > 1
      ? 0.28
      : effectiveItems.length > 1
        ? Math.min(1.2, duration / (effectiveItems.length + 1))
        : 0;

  const parsedItems = effectiveItems.map((text, i) => {
    // Word-by-word slam is inherently staggered; stray numbers in free-form text
    // (e.g. "3 seconds") must not be mistaken for beat times.
    const start = wordSplit ? round2(i * 0.28) : round2(starts[i] ?? fallbackStep * i);
    return {
      text,
      start,
      duration: round2(Math.max(0.4, (fadeOutAt ?? duration) - start)),
      strikeStart: strikeStarts[i]
    };
  });

  return TemplateParamsSchema.parse({
    text: items.join(' '),
    items: parsedItems,
    duration,
    textColor: '#FFFFFF',
    accentColor: accent,
    fontSize,
    gap: 48,
    easing: 'power3.out',
    layout:
      archetype === 'icon-cards' || archetype === 'keyword-pop' || (archetype === 'text-slam' && effectiveItems.length > 1)
        ? 'horizontal'
        : 'vertical',
    strikeOn: true,
    showStrike: isChecklist,
    ...(fadeOutAt !== undefined ? { fadeOutAt } : {})
  });
}

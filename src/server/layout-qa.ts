import fs from 'fs';
import path from 'path';
import { LintFinding } from '../common/types.js';

export interface QABox {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  fontSize: number;
}

export interface QASample {
  t: number;
  label: string;
  boxes: QABox[];
  visibleCount: number;
  overlapPairs: Array<{ a: string; b: string; ratio: number }>;
  worstOverlap: number;
}

export interface LayoutQAResult {
  ok: boolean;
  findings: LintFinding[];
  samples: QASample[];
  worstOverlap: number;
  pageErrors: string[];
  screenshots: string[];
}

export interface LayoutQAOptions {
  shotDir: string;
  /** Absolute seconds when content changes; each is sampled at +0.3s. */
  beatTimes: number[];
  expectedTexts: string[];
  /** Optional per-item text + start time; used to pick a mid-hold where all items exist. */
  expectedItems?: Array<{ text: string; start: number }>;
  /** When the composition starts fading out; shapes the mid-hold sample. */
  holdEnd?: number;
  duration: number;
  /** Directory for QA screenshots; skipped when omitted. */
  screenshotDir?: string;
  /** Title-safe fraction (0.8 = 80% of the frame). */
  titleSafe?: number;
}

const MIN_FONT_PX = 40;
const MAX_OVERLAP = 0.1;

/**
 * Headless layout QA. Renders the composition from disk, seeks the GSAP
 * timeline to each beat, and measures real bounding boxes. Catches the
 * "four absolute items stacked at the same position" failure that lint and
 * a successful build cannot see.
 */
export async function runLayoutQA(options: LayoutQAOptions): Promise<LayoutQAResult> {
  const { shotDir, beatTimes, expectedTexts, expectedItems, holdEnd, duration, screenshotDir, titleSafe = 0.8 } = options;
  const findings: LintFinding[] = [];
  const screenshots: string[] = [];
  const samples: QASample[] = [];
  const pageErrors: string[] = [];

  const entry = path.join(shotDir, 'index.html');
  if (!fs.existsSync(entry)) {
    return {
      ok: false,
      findings: [{ rule: 'layout_qa_missing_entry', message: 'No index.html to evaluate', level: 'error' }],
      samples,
      worstOverlap: 0,
      pageErrors,
      screenshots
    };
  }

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
    });

    const target = `file:///${entry.replace(/\\/g, '/')}`;
    await page.goto(target, { waitUntil: 'load' });
    await page.waitForTimeout(150);

    const hasTimeline = await page.evaluate(() => Boolean((window as any).__timelines && (window as any).__timelines.main));
    if (!hasTimeline) {
      findings.push({
        rule: 'layout_qa_no_timeline',
        message: 'window.__timelines["main"] is not registered after load (script error or missing GSAP)',
        level: 'error'
      });
    }

    const unique = [...new Set(beatTimes.filter((t) => Number.isFinite(t) && t >= 0 && t <= duration + 0.5))];
    const sorted = unique.sort((a, b) => a - b);
    // Mid-hold = halfway between the last entrance and the end of the hold, so
    // every item is expected to be on screen when text presence is checked.
    const lastBeat = sorted[sorted.length - 1] ?? 0;
    const midpoint = ((lastBeat + (holdEnd ?? duration)) / 2);
    const midHold = round2(clamp(midpoint, 0, duration));
    const times = [...new Set([...sorted.map((t) => round2(Math.min(t + 0.3, duration))), midHold])].sort((a, b) => a - b);

    for (const t of times) {
      const sample = await page.evaluate(async (time) => {
        const tl = (window as any).__timelines?.main;
        if (tl) {
          tl.pause();
          tl.seek(time);
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r as any)));

        const nodes = Array.from(document.querySelectorAll<HTMLElement>('.clip, [data-qa-text]'));
        const boxes = nodes.map((el, i) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const ownText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => (n.textContent || '').trim())
            .join(' ')
            .trim();
          return {
            id: el.id || `clip-${i}`,
            text: ownText || (el.textContent || '').trim(),
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
            opacity: Number(cs.opacity),
            fontSize: parseFloat(cs.fontSize) || 0
          };
        });
        return boxes;
      }, t);

      const visible = sample.filter((b) => b.opacity > 0.05 && b.w > 0 && b.h > 0);
      const overlapPairs: Array<{ a: string; b: string; ratio: number }> = [];
      let worst = 0;
      for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
          const a = visible[i];
          const b = visible[j];
          const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
          const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
          const ratio = (ox * oy) / Math.min(a.w * a.h, b.w * b.h);
          if (ratio > 0) overlapPairs.push({ a: a.id, b: b.id, ratio: Number(ratio.toFixed(3)) });
          worst = Math.max(worst, ratio);
        }
      }

      samples.push({ t, label: labelFor(t, sorted), boxes: sample, visibleCount: visible.length, overlapPairs, worstOverlap: worst });

      // Overlap gate
      for (const pair of overlapPairs.filter((p) => p.ratio > MAX_OVERLAP)) {
        findings.push({
          rule: 'layout_qa_overlap',
          message: `Text elements overlap ${Math.round(pair.ratio * 100)}% of the smaller box at ${t}s: ${pair.a} / ${pair.b} (limit ${MAX_OVERLAP * 100}%)`,
          level: 'error'
        });
      }

      // Title-safe + font size gates on visible text only
      for (const b of visible) {
        const safeW = 1920 * titleSafe;
        const safeH = 1080 * titleSafe;
        const left = (1920 - safeW) / 2;
        const top = (1080 - safeH) / 2;
        if (b.x < left - 1 || b.y < top - 1 || b.x + b.w > left + safeW + 1 || b.y + b.h > top + safeH + 1) {
          findings.push({
            rule: 'layout_qa_title_safe',
            message: `"${truncate(b.text)}" leaves the ${Math.round(titleSafe * 100)}% title-safe area at ${t}s (box ${b.x},${b.y},${b.w},${b.h})`,
            level: 'error'
          });
        }
        if (b.fontSize > 0 && b.fontSize < MIN_FONT_PX) {
          findings.push({
            rule: 'layout_qa_font_size',
            message: `"${truncate(b.text)}" renders at ${b.fontSize}px (minimum ${MIN_FONT_PX}px at 1080p)`,
            level: 'error'
          });
        }
      }

      // Expected text must be visible at the mid-hold sample (only items due by then)
      if (t === midHold) {
        const visibleText = visible.map((b) => b.text.toLowerCase()).join(' | ');
        const due = expectedItems
          ? expectedItems.filter((i) => i.start <= midHold).map((i) => i.text)
          : expectedTexts;
        for (const expected of due) {
          if (!visibleText.includes(expected.toLowerCase())) {
            findings.push({
              rule: 'layout_qa_missing_text',
              message: `Expected text "${expected}" is not visible at mid-hold (${t}s). Visible: ${visibleText || '(none)'}`,
              level: 'error'
            });
          }
        }
      }

      if (screenshotDir) {
        fs.mkdirSync(screenshotDir, { recursive: true });
        const file = path.join(screenshotDir, `qa-${String(t).replace('.', '_')}.png`);
        await page.screenshot({ path: file });
        screenshots.push(file);
      }
    }

    for (const err of pageErrors) {
      findings.push({ rule: 'layout_qa_page_error', message: `Page error: ${err}`, level: 'error' });
    }
  } finally {
    await browser.close();
  }

  // Collapse duplicate findings (same rule + message)
  const seen = new Set<string>();
  const deduped = findings.filter((f) => {
    const key = `${f.rule}|${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    ok: deduped.length === 0,
    findings: deduped,
    samples,
    worstOverlap: samples.reduce((m, s) => Math.max(m, s.worstOverlap), 0),
    pageErrors,
    screenshots
  };
}

function labelFor(t: number, beats: number[]): string {
  const idx = beats.findIndex((b) => round2(b + 0.3) === t);
  return idx >= 0 ? `beat-${idx + 1}+0.3s` : 'mid-hold';
}

function truncate(s: string, n = 24): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function launchBrowser() {
  const { chromium, webkit } = await import('playwright');
  try {
    return await chromium.launch({ headless: true });
  } catch (_) {}
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch (_) {}
  try {
    return await chromium.launch({ channel: 'msedge', headless: true });
  } catch (_) {}
  return await webkit.launch({ headless: true });
}

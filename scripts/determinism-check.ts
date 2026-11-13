/**
 * Isolates preview determinism: same version, repeated seeks and one remount.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const UI = 'http://127.0.0.1:5173';
const FFMPEG = process.env.FFMPEG_PATH || 'C:\\Program Files\\DownloadHelper CoApp\\ffmpeg.exe';
const OUT = path.resolve('proof-screenshots');

function raw(file: string) {
  return execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 900 * 1024 * 1024 });
}
function cmp(a: string, b: string) {
  const A = raw(a), B = raw(b);
  const n = Math.min(A.length, B.length);
  let sum = 0, changed = 0;
  for (let i = 0; i < n; i += 3) {
    const d = (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])) / 3;
    sum += d;
    if (d > 8) changed++;
  }
  return { meanAbs: Number((sum / (n / 3)).toFixed(4)), changed, changedRatio: Number((changed / (n / 3)).toFixed(6)) };
}

async function seek(page: any, t: number) {
  await page.evaluate((time: number) => {
    const ifr = document.querySelector('iframe') as HTMLIFrameElement | null;
    ifr?.contentWindow?.postMessage({ type: 'SEEK', time }, '*');
  }, t);
  await page.waitForTimeout(500);
}
async function waitTimeline(page: any) {
  await page.waitForFunction(() => {
    const ifr = document.querySelector('iframe') as HTMLIFrameElement | null;
    const w = ifr?.contentWindow as any;
    return Boolean(w && w.__timelines && w.__timelines['main']);
  }, null, { timeout: 20000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  await page.goto(UI, { waitUntil: 'networkidle' });
  const sel = page.locator('aside').first().locator('select');
  await sel.waitFor({ state: 'visible' });
  const labels = await sel.locator('option').evaluateAll((o) => o.map((x: any) => x.label));
  const target = [...labels].reverse().find((l: string) => l.startsWith('E2E Proof'));
  console.log('videos:', labels.length, 'target:', target);
  await sel.selectOption({ label: target });
  await page.waitForTimeout(1500);
  await waitTimeline(page);

  await seek(page, 2.0);
  const a = path.join(OUT, 'det-a.png');
  await page.locator('iframe').first().screenshot({ path: a });
  await page.waitForTimeout(1500);
  await seek(page, 2.0);
  const b = path.join(OUT, 'det-b.png');
  await page.locator('iframe').first().screenshot({ path: b });
  console.log('same version, two seeks:', JSON.stringify(cmp(a, b)));

  // Force iframe remount via bg toggle (Dark -> Checker)
  await page.getByTitle('Dark Background').click();
  await page.waitForTimeout(600);
  await page.getByTitle('Checkerboard (Transparent Alpha)').click();
  await page.waitForTimeout(1500);
  await waitTimeline(page);
  await seek(page, 2.0);
  const c = path.join(OUT, 'det-c.png');
  await page.locator('iframe').first().screenshot({ path: c });
  console.log('same version, after remount:', JSON.stringify(cmp(a, c)));

  const shotId = await page.evaluate(() => {
    const src = (document.querySelector('iframe') as HTMLIFrameElement)?.getAttribute('src') || '';
    return src.split('/preview-frame/')[1]?.split('?')[0];
  });
  const versions = await page.evaluate(async (id) => {
    const r = await fetch(`/api/shots/${id}/versions`);
    return r.json();
  }, shotId);
  console.log('versions:', versions.map((v: any) => `v${v.versionNumber}:${v.source}:${v.compHtml.length}b`).join(', '));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Hardened E2E proof for Motion Lab.
 * Every assertion prints the raw value it checked. Any mismatch throws.
 *
 * Run: npx tsx scripts/e2e-proof.ts
 */
import { chromium, Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const UI = process.env.MOTION_UI || 'http://127.0.0.1:5173';
const API = process.env.MOTION_API || 'http://127.0.0.1:3000';
const FFMPEG = process.env.FFMPEG_PATH || 'C:\\Program Files\\DownloadHelper CoApp\\ffmpeg.exe';
const PROOF = path.resolve('proof-screenshots');
fs.mkdirSync(PROOF, { recursive: true });

const results: Array<{ check: string; ok: boolean; detail: string }> = [];
function check(name: string, condition: boolean, detail: string) {
  results.push({ check: name, ok: condition, detail });
  console.log(`\n[${condition ? 'PASS' : 'FAIL'}] ${name}`);
  console.log(`       ${detail}`);
  if (!condition) throw new Error(`Assertion failed: ${name} (${detail})`);
}
function section(t: string) {
  console.log(`\n================ ${t} ================`);
}
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

async function api(pathname: string, init?: RequestInit) {
  const res = await fetch(`${API}${pathname}`, init);
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

function rawRGB(file: string): Buffer {
  return execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
    maxBuffer: 600 * 1024 * 1024
  });
}

function pixelDiff(a: string, b: string) {
  const A = rawRGB(a);
  const B = rawRGB(b);
  const n = Math.min(A.length, B.length);
  let sumAbs = 0;
  let changed = 0;
  for (let i = 0; i < n; i += 3) {
    const d = (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])) / 3;
    sumAbs += d;
    if (d > 8) changed++;
  }
  const pixels = Math.floor(n / 3);
  return {
    pixels,
    meanAbsDiff: Number((sumAbs / pixels).toFixed(4)),
    changedPixels: changed,
    changedRatio: Number((changed / pixels).toFixed(6))
  };
}

async function waitForTimeline(page: Page) {
  await page.waitForFunction(() => {
    const ifr = document.querySelector('iframe') as HTMLIFrameElement | null;
    const w = ifr?.contentWindow as any;
    return Boolean(w && w.__timelines && w.__timelines['main']);
  }, null, { timeout: 20000 });
}

async function seek(page: Page, t: number) {
  await page.evaluate((time) => {
    const ifr = document.querySelector('iframe') as HTMLIFrameElement | null;
    ifr?.contentWindow?.postMessage({ type: 'SEEK', time }, '*');
  }, t);
  await page.waitForTimeout(400);
}

async function waitForFreshIframe(page: Page, previousSrc: string | null) {
  await page.waitForFunction((old) => {
    const ifr = document.querySelector('iframe') as HTMLIFrameElement | null;
    return Boolean(ifr && ifr.getAttribute('src') && ifr.getAttribute('src') !== old);
  }, previousSrc, { timeout: 20000 });
  await waitForTimeline(page);
  // PreviewCanvas auto-seeks to its preview time 250ms after a remount.
  await page.waitForTimeout(1200);
  await waitForTimeline(page);
}

async function settleSeek(page: Page, t: number) {
  await seek(page, t);
  await page.waitForTimeout(250);
  await seek(page, t);
}

async function frameShot(page: Page, file: string) {
  const iframe = page.locator('iframe').first();
  await iframe.waitFor({ state: 'visible', timeout: 20000 });
  await iframe.screenshot({ path: file });
}

async function run() {
  const stamp = Date.now();
  const videoId = `e2e-${stamp}`;
  const videoTitle = `E2E Proof ${stamp}`;

  section('SETUP: create a deterministic video + shot via API');
  // The UI loads projects[0] (newest created_at). Seed into that same project so
  // the video appears in the workspace the browser actually shows.
  const projects = await api('/api/projects');
  const activeProjectId = projects.body?.[0]?.id;
  console.log(`  active project: ${activeProjectId} (${projects.body?.[0]?.name})`);
  check('active project found', Boolean(activeProjectId), `projectId=${activeProjectId}`);
  const v = await api('/api/videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: videoId, projectId: activeProjectId, title: videoTitle, contextNotes: 'E2E', orderIndex: 0 })
  });
  check('create video', v.status === 200, `HTTP ${v.status} id=${videoId}`);

  const prompt = 'SHOT 1.1 | 4s | OUTPUT: overlay / TEXT: Overwhelmed by Admin / High Overhead / Slow Growth / STYLE: strike-checklist pain points sequential strikethrough';
  const s = await api('/api/shots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId, shotNumber: '1.1', duration: 4, animationPrompt: prompt })
  });
  check('create shot', s.status === 200, `HTTP ${s.status} shot=${s.body?.id} text="${s.body?.onScreenText}"`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

  await page.goto(UI, { waitUntil: 'networkidle' });
  await page.locator('aside').first().locator('select').waitFor({ state: 'visible' });
  await page.locator('aside').first().locator('select').selectOption({ label: videoTitle });
  await page.waitForTimeout(800);

  const textarea = page.locator('textarea').first();
  await textarea.waitFor({ state: 'visible' });

  section('1a: PARSER LABELS AT 3s / 6s / 9s / OMITTED');
  const cases = [
    { header: '3s', prompt: 'SHOT 1.1 | 3s | OUTPUT: overlay / TEXT: Hello three', expect: '3s (from prompt)' },
    { header: '6s', prompt: 'SHOT 1.1 | 6s | OUTPUT: overlay / TEXT: Hello six', expect: '6s (from prompt)' },
    { header: '9s', prompt: 'SHOT 1.1 | 9s | OUTPUT: overlay / TEXT: Hello nine', expect: '9s (from prompt)' },
    { header: 'omitted', prompt: 'SHOT 1.1 | OUTPUT: overlay / TEXT: no duration here', expect: '4s (default)' }
  ];
  for (const c of cases) {
    await textarea.fill(c.prompt);
    await page.waitForTimeout(200);
    const label = norm(await page.locator('[data-testid="parsed-duration"]').innerText());
    console.log(`  header=${c.header} -> exact label: "${label}"`);
    check(`parser label ${c.header}`, label === c.expect, `expected "${c.expect}", got "${label}"`);
  }

  section('1b: BUILD + IFRAME DOM TEXT AT 2.0s');
  await textarea.fill(prompt);
  await page.waitForTimeout(200);

  const buildBtn = page.getByRole('button', { name: /Build Shot/i });
  const srcBeforeBuild = await page.locator('iframe').first().getAttribute('src');
  const [buildResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/generate') && r.request().method() === 'POST', { timeout: 240000 }),
    buildBtn.click()
  ]);
  const buildBody = await buildResp.json().catch(() => ({}));
  const buildStatus = buildResp.status();
  console.log(`  POST /generate -> HTTP ${buildStatus}`);
  if (buildStatus !== 200) console.log(`  raw error: ${JSON.stringify(buildBody)}`);
  check('build succeeds with Lock Text ON', buildStatus === 200, `HTTP ${buildStatus}${buildBody?.error ? ' error=' + buildBody.error : ''}`);

  await waitForFreshIframe(page, srcBeforeBuild);
  await settleSeek(page, 2.0);
  const domTextRaw = await page.frameLocator('iframe').locator('body').innerText();
  const domText = norm(domTextRaw);
  console.log(`  extracted iframe body text @2.0s:\n"""${domText}"""`);
  for (const phrase of ['Overwhelmed by Admin', 'High Overhead', 'Slow Growth']) {
    check(`iframe text contains "${phrase}"`, domText.includes(phrase), `phrase ${domText.includes(phrase) ? 'FOUND' : 'MISSING'} in ${domText.length} chars`);
  }

  section('1c: NL EDIT (PARAM DIFF + PIXEL DIFF + UNDO IDENTICAL)');
  const beforeFile = path.join(PROOF, 'e2e-1c-before-2.0s.png');
  await frameShot(page, beforeFile);
  console.log(`  pre-edit frame: ${beforeFile}`);

  const editInput = page.locator('input[placeholder*="make the text bigger"]');
  const srcBeforeEdit = await page.locator('iframe').first().getAttribute('src');
  await editInput.fill('Set the fontSizeItem parameter to 70 and the primaryRed parameter to #FF7A00. Keep every on-screen word identical.');
  const [editResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/edit') && r.request().method() === 'POST', { timeout: 240000 }),
    editInput.locator('xpath=following-sibling::button[1]').click()
  ]);
  const editStatus = editResp.status();
  const editBody = await editResp.json().catch(() => ({}));
  console.log(`  POST /edit -> HTTP ${editStatus}`);
  if (editStatus !== 200) console.log(`  raw error: ${JSON.stringify(editBody)}`);
  check('edit succeeds', editStatus === 200, `HTTP ${editStatus}${editBody?.error ? ' error=' + editBody.error : ''}`);

  const changed = editBody.changedParams || {};
  const changedKeys = Object.keys(changed);
  console.log(`  hasChanges=${editBody.hasChanges} changedParams=${changedKeys.length}`);
  for (const k of changedKeys) {
    console.log(`  ${k}: ${JSON.stringify(changed[k].before)} -> ${JSON.stringify(changed[k].after)}`);
  }
  check('model changed at least one param', changedKeys.length > 0, `keys=[${changedKeys.join(', ')}]`);

  await waitForFreshIframe(page, srcBeforeEdit);
  const uiDiffs = await page.locator('[data-testid="param-diff"]').allInnerTexts();
  console.log(`  UI diff view rows: ${JSON.stringify(uiDiffs.map(norm))}`);
  check('UI diff view shows key: old -> new', uiDiffs.some((t) => /\w+:.*->/.test(norm(t))), `rows=${uiDiffs.length}`);

  await settleSeek(page, 2.0);
  const afterFile = path.join(PROOF, 'e2e-1c-after-edit-2.0s.png');
  await frameShot(page, afterFile);
  const d1 = pixelDiff(beforeFile, afterFile);
  console.log(`  pixel diff before->after: meanAbsDiff=${d1.meanAbsDiff}, changedRatio=${d1.changedRatio}, pixels=${d1.pixels}`);
  check('edit visibly changes the 2.0s frame', d1.meanAbsDiff > 0.5 && d1.changedRatio > 0.002, `meanAbsDiff=${d1.meanAbsDiff}, changedRatio=${d1.changedRatio}`);

  const undoBtn = page.getByRole('button', { name: /Undo Edit/i });
  await undoBtn.waitFor({ state: 'visible', timeout: 15000 });
  const srcBeforeUndo = await page.locator('iframe').first().getAttribute('src');
  const [undoResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/restore-version') && r.request().method() === 'POST', { timeout: 30000 }),
    undoBtn.click()
  ]);
  console.log(`  POST /restore-version -> HTTP ${undoResp.status()}`);
  await waitForFreshIframe(page, srcBeforeUndo);
  await settleSeek(page, 2.0);
  const undoFile = path.join(PROOF, 'e2e-1c-after-undo-2.0s.png');
  await frameShot(page, undoFile);
  const d2 = pixelDiff(beforeFile, undoFile);
  console.log(`  pixel diff before->undo: meanAbsDiff=${d2.meanAbsDiff}, changedPixels=${d2.changedPixels}, changedRatio=${d2.changedRatio}`);
  check('undo restores a pixel-identical 2.0s frame', d2.meanAbsDiff === 0 && d2.changedPixels === 0, `meanAbsDiff=${d2.meanAbsDiff}, changedPixels=${d2.changedPixels}`);

  section('1d: LOCK TEXT REJECTION (server + visible UI message)');
  const goodHtml = '<div><span>Overwhelmed by</span><span>Admin</span></div>';
  const badHtml = '<div><span>Overwhelmed by Bosses</span></div>';
  const good = await api('/api/system/validate-lock-text', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ compHtml: goodHtml, text: 'Overwhelmed by Admin' })
  });
  const bad = await api('/api/system/validate-lock-text', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ compHtml: badHtml, text: 'Overwhelmed by Admin' })
  });
  console.log(`  verbatim HTML -> HTTP ${good.status} ${JSON.stringify(good.body)}`);
  console.log(`  tampered HTML -> HTTP ${bad.status} ${JSON.stringify(bad.body)}`);
  check('server accepts verbatim text', good.status === 200, `HTTP ${good.status}`);
  check('server rejects tampered text', bad.status === 422, `HTTP ${bad.status} ${bad.body?.error}`);

  // UI display of the rejection message
  await page.route('**/api/shots/*/generate', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Lock Text rejected: generated composition does not contain the locked on-screen text verbatim: "Overwhelmed by Admin"', rejected: true })
    });
  });
  await buildBtn.click();
  const toast = page.locator('text=Lock Text rejected').first();
  await toast.waitFor({ state: 'visible', timeout: 15000 });
  const toastText = norm(await toast.innerText());
  console.log(`  visible UI message: "${toastText}"`);
  check('UI shows the Lock Text rejection message', toastText.includes('Lock Text rejected'), toastText);
  await page.unroute('**/api/shots/*/generate');

  section('1c-UI: NO-CHANGE MESSAGE');
  await page.route('**/api/shots/*/edit', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: { versionNumber: 999 }, shot: { id: 'stub' }, prevVersionId: undefined, changedParams: {}, hasChanges: false })
    });
  });
  await editInput.fill('do absolutely nothing');
  await editInput.locator('xpath=following-sibling::button[1]').click();
  const noChange = page.locator('[data-testid="edit-no-changes"]');
  await noChange.waitFor({ state: 'visible', timeout: 15000 });
  const noChangeText = norm(await noChange.innerText());
  console.log(`  visible no-change message: "${noChangeText}"`);
  check('UI says "No changes made"', noChangeText === 'No changes made', noChangeText);
  await page.unroute('**/api/shots/*/edit');
  await page.waitForTimeout(1500);

  section('3a: BULK IMPORT THROUGH THE UI + CONTEXT TAB');
  const sampleRaw = fs.readFileSync(path.resolve('samples', 'bulk-import-sample.json'), 'utf8');
  const sample = JSON.parse(sampleRaw);
  const bulkId = `bulk-e2e-${stamp}`;
  const bulkTitle = `Bulk E2E ${stamp}`;
  sample.video.id = bulkId;
  sample.video.title = bulkTitle;

  await page.getByRole('button', { name: /Import Sheet/i }).click();
  const modal = page.locator('div.fixed.inset-0').filter({ hasText: 'Bulk Import Production Sheet' }).first();
  await modal.locator('textarea').waitFor({ state: 'visible' });
  await modal.locator('textarea').fill(JSON.stringify(sample, null, 2));
  await modal.getByRole('button', { name: 'Validate JSON' }).click();
  await modal.getByText(/Valid Production Sheet/).waitFor({ state: 'visible', timeout: 10000 });
  const rows = modal.locator('tbody tr');
  const rowCount = await rows.count();
  const rowTexts: string[] = [];
  for (let i = 0; i < rowCount; i++) rowTexts.push(norm(await rows.nth(i).innerText()));
  console.log(`  preview table rows (${rowCount}):`);
  rowTexts.forEach((r) => console.log(`    ${r}`));
  check('preview table shows 3 shots', rowCount === 3, `rows=${rowCount}`);
  check('preview table includes the pain-points role', rowTexts.some((r) => r.includes('Pain points')), JSON.stringify(rowTexts));

  await modal.getByRole('button', { name: /Confirm & Import Video/i }).click();
  await modal.waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForTimeout(1200);

  await page.locator('aside').first().locator('select').selectOption({ label: bulkTitle });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /^Context$/ }).click();
  const vo = norm(await page.locator('[data-testid="context-voiceover"]').innerText());
  const role = norm(await page.locator('[data-testid="context-role"]').innerText());
  console.log(`  Context tab voiceover: "${vo}"`);
  console.log(`  Context tab role: "${role}"`);
  check('Context tab shows imported voiceover', vo.includes('Running a business is already hard enough.'), vo);
  check('Context tab shows imported context/role', role.includes('Hook'), role);

  section('3b: EXPORT RENDER PACK (TIMELINE JSON)');
  const timeline = await page.evaluate(async (vid) => {
    const r = await fetch(`/api/videos/${vid}/export/timeline`);
    return { status: r.status, body: await r.json() };
  }, bulkId);
  console.log(`  GET timeline -> HTTP ${timeline.status}`);
  for (const sh of timeline.body?.shots || []) {
    console.log(`    id=${sh.id} start=${sh.start} end=${sh.end} file=${sh.file}`);
  }
  check('timeline has 3 shots with id/start/end/file', (timeline.body?.shots || []).length === 3 && timeline.body.shots.every((x: any) => x.id && Number.isFinite(x.start) && Number.isFinite(x.end) && x.file), JSON.stringify(timeline.body?.shots?.map((x: any) => ({ id: x.id, start: x.start, end: x.end, file: x.file }))));

  section('4a: MODEL DROPDOWN FROM LISTMODELS + PER-MODEL TEST');
  const modelSelect = page.locator('[data-testid="model-select"]');
  await modelSelect.waitFor({ state: 'visible' });
  const modelValue = await modelSelect.inputValue();
  const optionValues = await modelSelect.locator('option').evaluateAll((opts) => opts.map((o: any) => o.value));
  console.log(`  active model: ${modelValue}; option count: ${optionValues.length}`);
  console.log(`  options: ${optionValues.slice(0, 12).join(', ')}${optionValues.length > 12 ? ', …' : ''}`);
  check('model dropdown is populated from ListModels', optionValues.length >= 5, `count=${optionValues.length}`);
  check('dropdown includes the active model', optionValues.includes(modelValue), modelValue);

  await page.locator('[data-testid="model-test"]').click();
  const modelToast = page.locator('text=/OK \\(\\d+ms\\)/').first();
  await modelToast.waitFor({ state: 'visible', timeout: 60000 });
  const modelToastText = norm(await modelToast.innerText());
  console.log(`  per-model Test result: "${modelToastText}"`);
  check('per-model Test returns a live PONG', /PONG/.test(modelToastText), modelToastText);

  section('4b: SIMULATED 429 + BACKOFF MESSAGE IN UI');
  await page.locator('[data-testid="simulate-429"]').click();
  const backoff = page.locator('text=/backing off/i').first();
  await backoff.waitFor({ state: 'visible', timeout: 30000 });
  const backoffText = norm(await backoff.innerText());
  console.log(`  visible backoff message: "${backoffText}"`);
  check('UI shows the 429 backoff message', /429/.test(backoffText) && /backing off/i.test(backoffText), backoffText);

  section('SUMMARY');
  const failed = results.filter((r) => !r.ok);
  console.log(`  ${results.length - failed.length}/${results.length} checks passed`);
  fs.writeFileSync(path.resolve('.cache', 'e2e-results.json'), JSON.stringify({ ui: UI, videoId, bulkId, results }, null, 2));
  console.log(`  results written to .cache/e2e-results.json`);

  await browser.close();
  if (failed.length) process.exit(1);
}

run().catch(async (err) => {
  console.error('\n[E2E FAILED]', err?.stack || err);
  process.exit(1);
});

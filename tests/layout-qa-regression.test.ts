import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { buildTemplateParams, routeArchetype } from '../src/common/archetypes.js';
import { renderTemplate } from '../src/server/templates/render.js';
import { absoluteLayoutFindings } from '../src/server/llm/generation-service.js';
import { runLayoutQA } from '../src/server/layout-qa.js';

const TEST_PROMPT =
  'SHOT 1.1 | 6s | OUTPUT: overlay / TEXT: Recruitment / Office Space / Equipment / Admin / STYLE: vertical checklist, bold white text, large red strike-through lines / BEATS: 0.8 Recruitment appears; 2.0 Office Space; 3.2 Equipment; 4.4 Admin; 5.0-5.8 strike-through lines draw across each item in order; fade out at 5.7';

/** The composition that produced the empty/overlapping canvas. */
const BAD_HTML = `<!DOCTYPE html>
<html><head><style>
  html, body { margin:0; padding:0; width:1920px; height:1080px; background:transparent; }
  #root { width:1920px; height:1080px; position:relative; display:flex; flex-direction:column; justify-content:center; padding-left:200px; box-sizing:border-box; }
  .clip { position:absolute; color:#FFFFFF; font-weight:800; font-size:64px; opacity:0; }
</style></head><body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="6" data-width="1920" data-height="1080">
    <div id="item1" class="clip" data-start="0.8" data-duration="5.2">Recruitment</div>
    <div id="item2" class="clip" data-start="2.0" data-duration="4.0">Office Space</div>
    <div id="item3" class="clip" data-start="3.2" data-duration="2.8">Equipment</div>
    <div id="item4" class="clip" data-start="4.4" data-duration="1.6">Admin</div>
  </div>
  <script src="assets/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.fromTo("#item1", {y:100,opacity:0}, {y:0,opacity:1,duration:0.3}, 0.8);
    tl.fromTo("#item2", {y:100,opacity:0}, {y:0,opacity:1,duration:0.3}, 2.0);
    tl.fromTo("#item3", {y:100,opacity:0}, {y:0,opacity:1,duration:0.3}, 3.2);
    tl.fromTo("#item4", {y:100,opacity:0}, {y:0,opacity:1,duration:0.3}, 4.4);
    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body></html>`;

function makeDir(name: string, html: string): string {
  const dir = path.resolve(process.cwd(), '.cache', name);
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  const gsapSrc = path.resolve(process.cwd(), 'node_modules', 'gsap', 'dist', 'gsap.min.js');
  fs.copyFileSync(gsapSrc, path.join(dir, 'assets', 'gsap.min.js'));
  return dir;
}

test('router: strike-through checklist prompt selects strike-checklist and parses beats', () => {
  const items = ['Recruitment', 'Office Space', 'Equipment', 'Admin'];
  const route = routeArchetype(TEST_PROMPT, items.length);
  assert.strictEqual(route.archetype, 'strike-checklist');

  const params = buildTemplateParams({ prompt: TEST_PROMPT, duration: 6, archetype: 'strike-checklist' });
  assert.deepStrictEqual(params.items.map((i) => i.start), [0.8, 2.0, 3.2, 4.4]);
  assert.deepStrictEqual(params.items.map((i) => i.strikeStart), [5.0, 5.2, 5.4, 5.6]);
  assert.strictEqual(params.fadeOutAt, 5.7);
  assert.strictEqual(params.fontSize >= 40, true);
});

test('static lint flags absolute items without offsets in the failing composition', () => {
  const findings = absoluteLayoutFindings(BAD_HTML);
  const hit = findings.find((f) => f.rule === 'absolute_without_offsets');
  assert.ok(hit, 'expected absolute_without_offsets finding');
  assert.match(hit!.message, /4 elements/);

  const params = buildTemplateParams({ prompt: TEST_PROMPT, duration: 6, archetype: 'strike-checklist' });
  const goodHtml = renderTemplate('strike-checklist', params);
  assert.deepStrictEqual(absoluteLayoutFindings(goodHtml), []);
});

test('layout QA FAILS the failing composition (100% overlap)', async () => {
  const dir = makeDir('qa-bad', BAD_HTML);
  const result = await runLayoutQA({
    shotDir: dir,
    beatTimes: [0.8, 2.0, 3.2, 4.4],
    expectedTexts: ['Recruitment', 'Office Space', 'Equipment', 'Admin'],
    expectedItems: [
      { text: 'Recruitment', start: 0.8 },
      { text: 'Office Space', start: 2.0 },
      { text: 'Equipment', start: 3.2 },
      { text: 'Admin', start: 4.4 }
    ],
    duration: 6
  });

  assert.strictEqual(result.ok, false, 'QA must fail the overlapping composition');
  assert.ok(
    result.findings.some((f) => f.rule === 'layout_qa_overlap'),
    `expected overlap finding, got ${JSON.stringify(result.findings)}`
  );
  assert.ok(result.worstOverlap > 0.9, `worst overlap should be ~100%, got ${result.worstOverlap}`);

  const t38 = result.samples.find((s) => s.t >= 3.5);
  assert.ok(t38, 'expected a sampled time after 3.2s');
  const ys = t38!.boxes.filter((b) => b.opacity > 0.05).map((b) => b.y);
  assert.ok(new Set(ys).size <= 1, `stacked items should share a y, got ${ys.join(',')}`);
});

test('layout QA PASSES the deterministic template with four distinct y positions', async () => {
  const params = buildTemplateParams({ prompt: TEST_PROMPT, duration: 6, archetype: 'strike-checklist' });
  const html = renderTemplate('strike-checklist', params);
  const dir = makeDir('qa-good', html);

  const result = await runLayoutQA({
    shotDir: dir,
    beatTimes: params.items.map((i) => i.start),
    expectedTexts: params.items.map((i) => i.text),
    expectedItems: params.items.map((i) => ({ text: i.text, start: i.start })),
    holdEnd: params.fadeOutAt,
    duration: 6
  });

  assert.strictEqual(result.ok, true, `QA should pass, findings: ${JSON.stringify(result.findings)}`);
  assert.strictEqual(result.worstOverlap, 0);

  const last = result.samples[result.samples.length - 1];
  const visible = last.boxes.filter((b) => b.opacity > 0.05);
  assert.strictEqual(visible.length, 4, `expected 4 visible items, got ${visible.length}`);
  const ys = visible.map((b) => b.y);
  assert.strictEqual(new Set(ys).size, 4, `expected four distinct y positions, got ${ys.join(',')}`);
});

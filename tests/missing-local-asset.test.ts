import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { missingLocalAssetFindings } from '../src/server/llm/generation-service.js';

function makeShotDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motionlab-asset-'));
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  return dir;
}

test('missing local asset is reported as an error', () => {
  const shotDir = makeShotDir();
  const html = '<script src="assets/gsap.min.js"></script>';
  const findings = missingLocalAssetFindings(html, shotDir);

  assert.strictEqual(findings.length, 1, 'expected exactly one finding');
  assert.strictEqual(findings[0].rule, 'missing_local_asset');
  assert.strictEqual(findings[0].level, 'error');
  assert.match(findings[0].message, /assets\/gsap\.min\.js/);
  fs.rmSync(shotDir, { recursive: true, force: true });
});

test('existing non-empty local asset passes', () => {
  const shotDir = makeShotDir();
  fs.writeFileSync(path.join(shotDir, 'assets', 'gsap.min.js'), '/*gsap*/', 'utf8');
  const html = '<script src="assets/gsap.min.js"></script>';

  assert.deepStrictEqual(missingLocalAssetFindings(html, shotDir), []);
  fs.rmSync(shotDir, { recursive: true, force: true });
});

test('empty local asset is reported as missing', () => {
  const shotDir = makeShotDir();
  fs.writeFileSync(path.join(shotDir, 'assets', 'empty.css'), '', 'utf8');
  const html = '<link rel="stylesheet" href="assets/empty.css">';

  const findings = missingLocalAssetFindings(html, shotDir);
  assert.strictEqual(findings.length, 1);
  assert.match(findings[0].message, /empty\.css/);
  fs.rmSync(shotDir, { recursive: true, force: true });
});

test('CSS url() references are checked, including fonts', () => {
  const shotDir = makeShotDir();
  const html = '<style>@font-face{src:url("assets/font.woff2")}</style>';

  const findings = missingLocalAssetFindings(html, shotDir);
  assert.strictEqual(findings.length, 1);
  assert.match(findings[0].message, /font\.woff2/);
  fs.rmSync(shotDir, { recursive: true, force: true });
});

test('remote, data, fragment and server-absolute URLs are not local-asset errors', () => {
  const shotDir = makeShotDir();
  const html = [
    '<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>',
    '<img src="data:image/png;base64,AAA">',
    '<a href="#section">jump</a>',
    '<script src="/out/main.js"></script>'
  ].join('\n');

  assert.deepStrictEqual(missingLocalAssetFindings(html, shotDir), []);
  fs.rmSync(shotDir, { recursive: true, force: true });
});

test('query strings and fragments do not defeat the existence check', () => {
  const shotDir = makeShotDir();
  fs.writeFileSync(path.join(shotDir, 'assets', 'gsap.min.js'), '/*gsap*/', 'utf8');
  const html = '<script src="assets/gsap.min.js?v=3"></script>';

  assert.deepStrictEqual(missingLocalAssetFindings(html, shotDir), []);
  fs.rmSync(shotDir, { recursive: true, force: true });
});

test('path traversal outside the shot dir resolves and reports a missing file', () => {
  const shotDir = makeShotDir();
  const html = '<script src="../secret.js"></script>';

  const findings = missingLocalAssetFindings(html, shotDir);
  assert.strictEqual(findings.length, 1);
  fs.rmSync(shotDir, { recursive: true, force: true });
});

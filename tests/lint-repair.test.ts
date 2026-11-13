import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { hyperFramesService } from '../src/server/hyperframes.js';
import { TEMPLATES } from '../src/common/templates.js';

test('hyperframes lint - validates compliant starter templates with zero errors', async () => {
  const tmpDir = path.resolve(process.cwd(), '.cache', 'lint-test-clean');
  fs.mkdirSync(tmpDir, { recursive: true });

  const html = TEMPLATES['text-slam'].renderHtml({
    text: 'Running a business is already hard enough.',
    duration: 3
  }, 'overlay-alpha');

  fs.writeFileSync(path.join(tmpDir, 'index.html'), html, 'utf8');

  const lintRes = await hyperFramesService.lintComposition(tmpDir);
  assert.strictEqual(lintRes.ok, true, 'Clean template must pass hyperframes lint');
  assert.strictEqual(lintRes.errorCount, 0, 'Must have 0 errors');
});

test('hyperframes lint - detects missing clip / timeline violation and flags it', async () => {
  const tmpDir = path.resolve(process.cwd(), '.cache', 'lint-test-invalid');
  fs.mkdirSync(tmpDir, { recursive: true });

  // Invalid composition: missing class="clip" on timed elements and missing timeline registration
  const badHtml = `<!doctype html>
  <html>
    <body>
      <div id="root" data-composition-id="main" data-start="0" data-duration="5" data-width="1920" data-height="1080">
        <video src="assets/test.mp4"></video>
      </div>
    </body>
  </html>`;

  fs.writeFileSync(path.join(tmpDir, 'index.html'), badHtml, 'utf8');

  const lintRes = await hyperFramesService.lintComposition(tmpDir);
  // Missing muted or timed clip triggers errors
  assert.strictEqual(lintRes.ok, false, 'Invalid video composition should fail lint');
  assert.ok(lintRes.errorCount > 0, 'Should report lint errors');
});


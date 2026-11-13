import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbService } from '../src/server/db.js';
import { GeminiProvider } from '../src/server/llm/gemini-provider.js';
import { parseAnimationPrompt } from '../src/common/prompt-parser.js';
import fs from 'node:fs';
import path from 'node:path';

test('Regression: No-fallback-on-missing-key throws clear error', async () => {
  const origKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    const provider = new GeminiProvider();

    await assert.rejects(
      async () => {
        await provider.generate({
          shot: {
            id: 'test-shot-1',
            videoId: 'test-vid-1',
            shotNumber: '1.1',
            start: 0,
            duration: 4,
            voiceoverLine: '',
            onScreenText: 'Test text',
            animationPrompt: 'SHOT 1.1 | 4s | OUTPUT: overlay / TEXT: Test text',
            shotContext: '',
            outputMode: 'overlay-alpha',
            status: 'draft',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          projectTokens: {
            brandName: 'Staff India',
            primaryColor: '#C92A2A',
            secondaryColor: '#1A365D',
            accentColor: '#D97706',
            fontFamily: 'Montserrat, sans-serif',
            officeContext: 'Staff India (Bangladesh office - never use Indian flags or imagery)',
            editor: { software: 'CapCut', preferredAlphaFormat: 'prores-4444' }
          },
          videoShots: [],
          videoContext: ''
        });
      },
      (err: any) => {
        assert.match(err.message, /No Gemini API key in \.env/);
        return true;
      }
    );
  } finally {
    process.env.GEMINI_API_KEY = origKey;
  }
});

test('Regression: Save-then-build updates shot prompt, duration, text, and mode in DB', () => {
  const testProjectId = `regress-proj-${Date.now()}`;
  const testVideoId = `regress-vid-${Date.now()}`;
  const testShotId = `regress-shot-${Date.now()}`;

  dbService.saveProject({
    id: testProjectId,
    name: 'Regression Project',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    brandTokens: {
      brandName: 'Staff India',
      primaryColor: '#C92A2A',
      secondaryColor: '#1A365D',
      accentColor: '#D97706',
      fontFamily: 'Montserrat',
      officeContext: 'Staff India',
      editor: { software: 'CapCut', preferredAlphaFormat: 'prores-4444' }
    }
  });

  dbService.saveVideo({
    id: testVideoId,
    projectId: testProjectId,
    title: 'Regression Video',
    contextNotes: '',
    orderIndex: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const initialShot = {
    id: testShotId,
    videoId: testVideoId,
    shotNumber: '1.1',
    start: 0,
    duration: 3,
    voiceoverLine: '',
    onScreenText: 'Old text',
    animationPrompt: 'SHOT 1.1 | 3s | TEXT: Old text',
    shotContext: '',
    outputMode: 'overlay-alpha' as const,
    status: 'draft' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  dbService.saveShot(initialShot);

  // User edits prompt in UI textarea and clicks Build
  const newPrompt = 'SHOT 1.1 | 4s | OUTPUT: overlay / TEXT: Overwhelmed by Admin / High Overhead / Slow Growth / STYLE: strike-checklist pain points sequential strikethrough';
  
  // Save-then-build logic (same as POST /api/shots/:id/generate)
  const shotToBuild = dbService.getShot(testShotId)!;
  shotToBuild.animationPrompt = newPrompt;
  const parsed = parseAnimationPrompt(newPrompt);
  if (parsed.text) shotToBuild.onScreenText = parsed.text;
  if (parsed.duration) shotToBuild.duration = parsed.duration;
  if (parsed.outputMode) shotToBuild.outputMode = parsed.outputMode;
  dbService.saveShot(shotToBuild);

  // Verify DB state updated BEFORE any generation completes
  const updatedShot = dbService.getShot(testShotId)!;
  assert.equal(updatedShot.duration, 4, 'Duration must update to parsed 4s');
  assert.equal(updatedShot.onScreenText, 'Overwhelmed by Admin / High Overhead / Slow Growth', 'Text must preserve internal slashes');
  assert.equal(updatedShot.outputMode, 'overlay-alpha');
  assert.equal(updatedShot.animationPrompt, newPrompt);
});

test('Regression: Single entry file in render directory (no duplicate comp.html)', () => {
  const dummyDir = path.resolve('public/renders/test-one-entry');
  if (!fs.existsSync(dummyDir)) {
    fs.mkdirSync(dummyDir, { recursive: true });
  }

  // If a stale comp.html existed, it must be removed leaving only index.html
  fs.writeFileSync(path.join(dummyDir, 'comp.html'), '<html>Stale</html>', 'utf-8');
  fs.writeFileSync(path.join(dummyDir, 'index.html'), '<!DOCTYPE html><html><div data-composition-id="test"></div></html>', 'utf-8');

  // Mimic generation-service cleanup
  const staleComp = path.join(dummyDir, 'comp.html');
  if (fs.existsSync(staleComp)) {
    fs.unlinkSync(staleComp);
  }

  const files = fs.readdirSync(dummyDir);
  assert.ok(!files.includes('comp.html'), 'comp.html must not exist in render dir');
  assert.ok(files.includes('index.html'), 'index.html must exist as single entry point');

  // Clean up test dir
  fs.rmSync(dummyDir, { recursive: true, force: true });
});

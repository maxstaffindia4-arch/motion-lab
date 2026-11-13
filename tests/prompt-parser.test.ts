import test from 'node:test';
import assert from 'node:assert';
import { parseAnimationPrompt } from '../src/common/prompt-parser.js';

test('parseAnimationPrompt - standard multi-line format', () => {
  const input = `SHOT 1.1 | 3.5s | 1920x1080 | 30fps | OUTPUT: overlay
TEXT: Running a business is already hard enough.
STYLE: word-by-word kinetic text slam with shake
BEATS: 0.00 text slams in word by word, 0.15s each; 1.20 hold; 2.60 fade out
SFX CUE: 0.00 slam hit, 2.60 whoosh
NOTES: Bangladesh office context`;

  const parsed = parseAnimationPrompt(input);
  assert.strictEqual(parsed.shotId, '1.1');
  assert.strictEqual(parsed.duration, 3.5);
  assert.strictEqual(parsed.durationSource, 'from prompt');
  assert.strictEqual(parsed.outputMode, 'overlay-alpha');
  assert.strictEqual(parsed.outputModeSource, 'from prompt');
  assert.strictEqual(parsed.width, 1920);
  assert.strictEqual(parsed.height, 1080);
  assert.strictEqual(parsed.fps, 30);
  assert.strictEqual(parsed.text, 'Running a business is already hard enough.');
  assert.strictEqual(parsed.textSource, 'from prompt');
  assert.strictEqual(parsed.style, 'word-by-word kinetic text slam with shake');
  assert.ok(parsed.beats?.includes('0.00 text slams'));
  assert.ok(parsed.sfxCue?.includes('slam hit'));
  assert.strictEqual(parsed.notes, 'Bangladesh office context');
  assert.strictEqual(parsed.isFreeForm, false);
});

test('parseAnimationPrompt - single-line slash format with internal slashes in TEXT (failing screenshot example)', () => {
  const input = 'SHOT 1.1 | 4s | OUTPUT: overlay / TEXT: Overwhelmed by Admin / High Overhead / Slow Growth / STYLE: strike-checklist pain points sequential strikethrough';

  const parsed = parseAnimationPrompt(input);
  assert.strictEqual(parsed.shotId, '1.1');
  assert.strictEqual(parsed.duration, 4);
  assert.strictEqual(parsed.durationSource, 'from prompt');
  assert.strictEqual(parsed.outputMode, 'overlay-alpha');
  assert.strictEqual(parsed.outputModeSource, 'from prompt');
  // Slashes inside TEXT must NOT be cut off!
  assert.strictEqual(parsed.text, 'Overwhelmed by Admin / High Overhead / Slow Growth');
  assert.strictEqual(parsed.textSource, 'from prompt');
  assert.strictEqual(parsed.style, 'strike-checklist pain points sequential strikethrough');
  assert.strictEqual(parsed.isFreeForm, false);
});

test('parseAnimationPrompt - headers with 3s, 6s, 9s and default when omitted', () => {
  const p3 = parseAnimationPrompt('SHOT 1.1 | 3s | OUTPUT: overlay / TEXT: Hello');
  assert.strictEqual(p3.duration, 3);
  assert.strictEqual(p3.durationSource, 'from prompt');

  const p6 = parseAnimationPrompt('SHOT 1.2 | 6s | OUTPUT: overlay / TEXT: Hello 6s');
  assert.strictEqual(p6.duration, 6);
  assert.strictEqual(p6.durationSource, 'from prompt');

  const p9 = parseAnimationPrompt('SHOT 1.3 | 9s | OUTPUT: overlay / TEXT: Hello 9s');
  assert.strictEqual(p9.duration, 9);
  assert.strictEqual(p9.durationSource, 'from prompt');

  const pNone = parseAnimationPrompt('SHOT 1.4 | OUTPUT: overlay / TEXT: No duration in header');
  assert.strictEqual(pNone.duration, 4);
  assert.strictEqual(pNone.durationSource, 'default');
});

test('parseAnimationPrompt - free-form natural language with quoted text', () => {
  const input = 'Show a strike-through checklist of 3 admin pain points with title "Overwhelmed by Tasks", 5 seconds, chroma background';
  const parsed = parseAnimationPrompt(input);
  assert.strictEqual(parsed.isFreeForm, true);
  assert.strictEqual(parsed.duration, 5);
  assert.strictEqual(parsed.durationSource, 'from prompt');
  assert.strictEqual(parsed.outputMode, 'chroma');
  assert.strictEqual(parsed.outputModeSource, 'from prompt');
  assert.strictEqual(parsed.text, 'Overwhelmed by Tasks');
  assert.strictEqual(parsed.textSource, 'from prompt');
});

test('parseAnimationPrompt - free-form natural language without quotes (drafted by LLM)', () => {
  const input = 'Animate the four benefits of hiring through Staff India with subtle floating motion, 6s, overlay';
  const parsed = parseAnimationPrompt(input);
  assert.strictEqual(parsed.isFreeForm, true);
  assert.strictEqual(parsed.duration, 6);
  assert.strictEqual(parsed.durationSource, 'from prompt');
  assert.strictEqual(parsed.outputMode, 'overlay-alpha');
  assert.strictEqual(parsed.text, undefined);
  assert.strictEqual(parsed.textSource, 'drafted by LLM');
});

test('parseAnimationPrompt - free-form defaults when no duration specified', () => {
  const input = 'Floating kinetic cards with icons for dedicated staff and support';
  const parsed = parseAnimationPrompt(input);
  assert.strictEqual(parsed.isFreeForm, true);
  assert.strictEqual(parsed.duration, 4);
  assert.strictEqual(parsed.durationSource, 'default');
  assert.strictEqual(parsed.outputMode, 'overlay-alpha');
  assert.strictEqual(parsed.outputModeSource, 'default');
});

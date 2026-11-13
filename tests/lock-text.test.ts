import test from 'node:test';
import assert from 'node:assert';
import { validateLockedText } from '../src/common/lock-text.js';

test('Lock Text: accepts verbatim text split across elements', () => {
  const html = '<div><span>Overwhelmed by</span> <span>Admin</span><span>High Overhead</span></div>';
  const res = validateLockedText(html, 'Overwhelmed by Admin');
  assert.strictEqual(res.ok, true, res.message);
});

test('Lock Text: accepts slashes used as visual separators', () => {
  const html = '<div><div>Recruitment</div><div>Office Space</div><div>Equipment</div></div>';
  const res = validateLockedText(html, 'Recruitment / Office Space / Equipment');
  assert.strictEqual(res.ok, true, res.message);
});

test('Lock Text: rejects tampered text and reports a visible message', () => {
  const html = '<div>Overwhelmed by Bosses</div>';
  const res = validateLockedText(html, 'Overwhelmed by Admin');
  assert.strictEqual(res.ok, false);
  assert.match(res.message, /^Lock Text rejected:/);
  assert.ok(res.message.includes('Overwhelmed by Admin'));
});

test('Lock Text: matching stays case-sensitive (verbatim)', () => {
  const res = validateLockedText('<div>overwhelmed by admin</div>', 'Overwhelmed by Admin');
  assert.strictEqual(res.ok, false);
});

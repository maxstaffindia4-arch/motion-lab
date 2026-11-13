import test from 'node:test';
import assert from 'node:assert';
import { BulkImportSchema } from '../src/common/types.js';

test('BulkImportSchema - validates valid production sheet', () => {
  const sample = {
    video: {
      id: 'vid-101',
      title: 'Staff India Value Proposition'
    },
    shots: [
      {
        id: '1.1',
        time: 0,
        duration: 3,
        role: 'Hook',
        voiceover: 'Running a business is already hard enough.',
        onScreenText: 'Running a business is already hard enough.',
        animationPrompt: 'text slam with camera shake'
      },
      {
        id: '1.2',
        time: 3,
        duration: 7,
        role: 'Pain points',
        onScreenText: 'Recruitment / Office Space / Equipment / Admin',
        outputMode: 'overlay-alpha'
      }
    ]
  };

  const parsed = BulkImportSchema.parse(sample);
  assert.strictEqual(parsed.video.id, 'vid-101');
  assert.strictEqual(parsed.shots.length, 2);
  assert.strictEqual(parsed.shots[0].id, '1.1');
  assert.strictEqual(parsed.shots[1].duration, 7);
});

test('BulkImportSchema - rejects invalid structure', () => {
  const invalid = {
    video: { id: 'only-id' }, // missing title
    shots: 'not-an-array'
  };

  assert.throws(() => {
    BulkImportSchema.parse(invalid);
  });
});


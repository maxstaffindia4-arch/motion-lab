import test from 'node:test';
import assert from 'node:assert';
import { TEMPLATES } from '../src/common/templates.js';

test('TEMPLATES - renders valid parameterized HTML for all 11 archetypes', () => {
  const keys = Object.keys(TEMPLATES);
  assert.strictEqual(keys.length, 11, 'Must have 11 starter templates');

  for (const key of keys) {
    const tpl = TEMPLATES[key];
    assert.ok(tpl.id, `${key} must have id`);
    assert.ok(tpl.name, `${key} must have name`);
    assert.ok(tpl.defaultParams, `${key} must have defaultParams`);
    assert.ok(tpl.paramsSchema.length > 0, `${key} must have paramsSchema`);

    const html = tpl.renderHtml(tpl.defaultParams, 'overlay-alpha');
    assert.ok(html.includes('data-composition-id="main"'), `${key} must declare main composition id`);
    assert.ok(html.includes('window.__timelines["main"] = tl;'), `${key} must register paused GSAP timeline`);
    assert.ok(/class="[^"]*\bclip\b[^"]*"/.test(html), `${key} must have at least one .clip element`);
    assert.ok(html.includes('data-start='), `${key} must have data-start`);
    assert.ok(html.includes('data-duration='), `${key} must have data-duration`);
  }
});

test('TEMPLATES - text-slam preserves exact onScreenText in HTML', () => {
  const customText = 'Staff India offshore experts save 70% cost';
  const html = TEMPLATES['text-slam'].renderHtml({ text: customText }, 'overlay-alpha');
  assert.ok(html.includes('Staff'), 'Contains exact word Staff');
  assert.ok(html.includes('offshore'), 'Contains exact word offshore');
  assert.ok(html.includes('70%'), 'Contains exact word 70%');
});

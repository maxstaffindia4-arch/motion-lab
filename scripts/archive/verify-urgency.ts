import fs from 'fs';

const base = 'http://127.0.0.1:3000';

async function api(path: string, init?: { method?: string; body?: any }) {
  const res = await fetch(base + path, {
    method: init?.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function count(haystack: string, needle: string): number {
  return (haystack.match(new RegExp(needle, 'gi')) || []).length;
}

(async () => {
  const projects = await api('/api/projects');
  const staff = projects.find((p: any) => p.id === 'staff-india') || projects[0];

  // ---------- Verification 1: stale stored text is replaced by the prompt ----------
  const stamp = Date.now();
  const video = await api('/api/videos', {
    method: 'POST',
    body: { id: `verify-video-${stamp}`, projectId: staff.id, title: 'Context verification', contextNotes: '', orderIndex: 99 }
  });
  const shot = await api('/api/shots', {
    method: 'POST',
    body: {
      videoId: video.id,
      shotNumber: '9.9',
      animationPrompt: 'SHOT 9.9 | 5s | OUTPUT: overlay\nTEXT: Overwhelmed by Admin / High Overhead / Slow Growth\nSTYLE: old stored text',
      onScreenText: 'Overwhelmed by Admin / High Overhead / Slow Growth'
    }
  });

  console.log('V1 BEFORE stored shot:', JSON.stringify({ onScreenText: shot.onScreenText, textSource: shot.textSource, animationPrompt: shot.animationPrompt }));

  const generated = await api(`/api/shots/${shot.id}/generate`, {
    method: 'POST',
    body: { prompt: 'overlay text animates in Happy Birthday. use good effects', lockText: true }
  });
  const builtText = textOf(generated.version.compHtml);
  console.log('V1 BUILT text:', builtText.slice(0, 220));
  console.log('V1 contains "Happy Birthday":', /happy birthday/i.test(builtText));
  console.log('V1 contains "Overwhelmed":', /overwhelmed/i.test(builtText));
  const rows = await api(`/api/videos/${video.id}/shots`);
  const storedRow = rows.find((s: any) => s.id === shot.id);
  console.log('V1 AFTER stored shot:', JSON.stringify({ onScreenText: storedRow.onScreenText, textSource: storedRow.textSource, duration: storedRow.duration, outputMode: storedRow.outputMode }));
  const fp1 = await api(`/api/shots/${shot.id}/final-prompt`, { method: 'POST', body: { options: {} } });
  console.log('V1 Context stale flags:', JSON.stringify(fp1.stale));

  // ---------- Verification 2: brand-new project, empty kit, zero brand strings ----------
  const testProject = await api('/api/projects', { method: 'POST', body: { name: 'Test Brand', brandTokens: {} } });
  console.log('V2 new project kit:', JSON.stringify(testProject.brandTokens));
  const testVideo = await api('/api/videos', {
    method: 'POST',
    body: { id: `test-brand-video-${stamp}`, projectId: testProject.id, title: 'Test Brand Video', contextNotes: '', orderIndex: 0 }
  });
  const testShot = await api('/api/shots', {
    method: 'POST',
    body: { videoId: testVideo.id, shotNumber: '1.1', animationPrompt: 'overlay title animates in Hello', onScreenText: '' }
  });
  const fp2 = await api(`/api/shots/${testShot.id}/final-prompt`, { method: 'POST', body: { options: {} } });
  const all2 = fp2.systemPrompt + '\n' + fp2.userPrompt;
  console.log('V2 final prompt counts: Staff India=' + count(all2, 'staff india') + ', Bangladesh=' + count(all2, 'bangladesh') + ', Indian=' + count(all2, 'indian'));
  console.log('V2 kitApplied:', fp2.kitApplied);

  // ---------- Verification 3: Staff India kit applied vs not applied ----------
  const tokens = JSON.parse(fs.readFileSync('brand/tokens.json', 'utf8'));
  const hexes: string[] = Object.values(tokens.colors || {}).filter((v: any) => typeof v === 'string').map((v: any) => v.toLowerCase());
  const fonts = [tokens.typography?.displayFont, tokens.typography?.bodyFont, tokens.typography?.monoFont].filter(Boolean);

  const fpOn = await api(`/api/shots/${shot.id}/final-prompt`, { method: 'POST', body: { options: { applyKit: true } } });
  const onText = fpOn.systemPrompt + '\n' + fpOn.userPrompt;
  const fpOff = await api(`/api/shots/${shot.id}/final-prompt`, { method: 'POST', body: { options: { applyKit: false } } });
  const offText = fpOff.systemPrompt + '\n' + fpOff.userPrompt;

  const kitLines = (text: string) => text.split('\n').filter((l) => l.startsWith('- Colors:') || l.startsWith('- Fonts:') || l.startsWith('- Tone:') || l.startsWith('- Do:') || l.startsWith("- Don't:"));
  console.log('V3 kitApplied ON=' + fpOn.kitApplied + ', OFF=' + fpOff.kitApplied);
  console.log('V3 ON kit lines:\n' + kitLines(onText).join('\n'));
  console.log('V3 OFF kit lines:\n' + (kitLines(offText).join('\n') || '(none)'));
  console.log('V3 ON hex counts:', JSON.stringify(Object.fromEntries(hexes.map((h) => [h, count(onText, h)]))));
  console.log('V3 OFF hex counts:', JSON.stringify(Object.fromEntries(hexes.map((h) => [h, count(offText, h)]))));
  console.log('V3 ON font counts:', JSON.stringify(Object.fromEntries(fonts.map((f: string) => [f, count(onText, f)]))));
  console.log('V3 OFF font counts:', JSON.stringify(Object.fromEntries(fonts.map((f: string) => [f, count(offText, f)]))));
})().catch((err) => {
  console.error('VERIFY_FAILED:', err.message);
  process.exit(1);
});

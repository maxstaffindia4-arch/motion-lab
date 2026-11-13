const API = 'http://127.0.0.1:3000';
const videoId = process.argv[2] || 'e2e-1794393799723';

const compHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1920px; height: 1080px; overflow: hidden; background: transparent; font-family: Inter, sans-serif; }
  #root { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  #t { font-size: 96px; font-weight: 800; color: #FFFFFF; opacity: 0; }
</style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="4" data-width="1920" data-height="1080">
    <div class="clip" data-start="0" data-duration="4" data-track-index="0"><div id="t">CANCEL TEST</div></div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const el = document.getElementById('t');
    const tl = {
      _time: 0,
      pause() {},
      play() {},
      seek(t) { this._time = t; el.style.opacity = t > 0.5 ? '1' : '0'; return this; }
    };
    window.__timelines['main'] = tl;
    tl.seek(0);
  </script>
</body>
</html>`;

async function jsonFetch(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

const shot = await jsonFetch('/api/shots', {
  videoId,
  shotNumber: '9.9',
  duration: 4,
  animationPrompt: 'SHOT 9.9 | 4s | OUTPUT: overlay / TEXT: Cancel Test / STYLE: simple fade'
});
console.log(`shot ${shot.id} created (${shot.shotNumber})`);

const version = await jsonFetch(`/api/shots/${shot.id}/manual-code`, { compHtml });
console.log(`version ${version.versionNumber} created; lintOk=${version.lintResult.ok} errors=${version.lintResult.errorCount}`);

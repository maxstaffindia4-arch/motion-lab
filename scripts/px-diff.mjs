import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const FF = process.env.FFMPEG_PATH || 'C:\\Program Files\\DownloadHelper CoApp\\ffmpeg.exe';
const FFPROBE = process.env.FFPROBE_PATH || 'C:\\Program Files\\DownloadHelper CoApp\\ffprobe.exe';

function probe(file) {
  const out = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file]);
  const s = JSON.parse(out.toString()).streams[0];
  return { w: s.width, h: s.height };
}
function raw(file) {
  return execFileSync(FF, ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 900 * 1024 * 1024 });
}
function compare(a, b, label, w) {
  const A = raw(a), B = raw(b);
  const n = Math.min(A.length, B.length);
  let sum = 0, changed = 0;
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
  for (let i = 0; i < n; i += 3) {
    const d = (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])) / 3;
    sum += d;
    if (d > 8) {
      changed++;
      const p = i / 3, px = p % w, py = Math.floor(p / w);
      if (px < minx) minx = px; if (px > maxx) maxx = px;
      if (py < miny) miny = py; if (py > maxy) maxy = py;
    }
  }
  const pixels = Math.floor(n / 3);
  return {
    label,
    meanAbs: Number((sum / pixels).toFixed(4)),
    changed,
    changedRatio: Number((changed / pixels).toFixed(6)),
    bbox: maxx >= 0 ? [minx, miny, maxx, maxy] : null,
    size: [w, Math.floor(n / 3 / w)]
  };
}

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error('usage: node scripts/px-diff.mjs a.png b.png [c.png]');
  process.exit(1);
}
const { w } = probe(files[0]);
console.log(`image size: ${w}x${probe(files[0]).h}`);
const pairs = [];
for (let i = 0; i < files.length; i++) {
  for (let j = i + 1; j < files.length; j++) {
    pairs.push(compare(files[i], files[j], `${files[i]}  vs  ${files[j]}`, w));
  }
}
for (const p of pairs) console.log(JSON.stringify(p));

// Composition animation inventory
if (fs.existsSync('.cache/versions.json')) {
  const v = JSON.parse(fs.readFileSync('.cache/versions.json', 'utf8'))[0];
  const html = v.compHtml || '';
  console.log('\nanimation inventory in built composition:');
  const keys = ['@keyframes', 'animation:', 'animation-name', 'requestAnimationFrame', 'Date.now', 'Math.random', 'setInterval', 'gsap.ticker', 'yoyo: true', 'repeat: -1'];
  for (const k of keys) {
    const count = html.split(k).length - 1;
    console.log(`  ${k} = ${count}`);
  }
  console.log('  css lines:');
  html.split(/\r?\n/).filter((l) => /animation|@keyframes/.test(l)).slice(0, 12).forEach((l) => console.log('    ' + l.trim()));
}

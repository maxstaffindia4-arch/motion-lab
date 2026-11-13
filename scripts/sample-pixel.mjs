import { execFileSync } from 'node:child_process';

const FF = process.env.FFMPEG_PATH || 'C:\\Program Files\\DownloadHelper CoApp\\ffmpeg.exe';
const FFPROBE = process.env.FFPROBE_PATH || 'C:\\Program Files\\DownloadHelper CoApp\\ffprobe.exe';

function probe(file) {
  const out = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt', '-of', 'json', file]);
  const s = JSON.parse(out.toString()).streams[0];
  return { w: s.width, h: s.height, pix: s.pix_fmt };
}
function raw(file) {
  return execFileSync(FF, ['-v', 'error', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 900 * 1024 * 1024 });
}
function px(img, x, y) {
  const i = (y * img.w + x) * 3;
  return [img.buf[i], img.buf[i + 1], img.buf[i + 2]];
}
for (const file of process.argv.slice(2)) {
  const meta = probe(file);
  const buf = raw(file);
  let best = { x: 0, y: 0, rgb: [0, 0, 0], score: -1 };
  for (let y = Math.floor(meta.h * 0.1); y < Math.floor(meta.h * 0.9); y += 2) {
    for (let x = Math.floor(meta.w * 0.1); x < Math.floor(meta.w * 0.9); x += 2) {
      const i = (y * meta.w + x) * 3;
      const s = buf[i] + buf[i + 1] + buf[i + 2];
      if (s > best.score) best = { x, y, rgb: [buf[i], buf[i + 1], buf[i + 2]], score: s };
    }
  }
  console.log(JSON.stringify({
    file,
    size: [meta.w, meta.h],
    pix_fmt: meta.pix,
    corner: px({ buf, w: meta.w }, 0, 0),
    cornerInset: px({ buf, w: meta.w }, 5, 5),
    brightest: { x: best.x, y: best.y, rgb: best.rgb }
  }));
}

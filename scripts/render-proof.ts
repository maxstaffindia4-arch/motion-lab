/**
 * Render proof for Shot 1.1.
 * Renders the requested formats, runs ffprobe, proves alpha over red, and
 * samples real pixels. Prints raw numbers only.
 *
 * Run: npx tsx scripts/render-proof.ts mov,webm,mp4-chroma,mp4-full
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.MOTION_API || 'http://127.0.0.1:3000';
function resolveBin(envVar: string | undefined, defaultCandidate: string, fallback: string): string {
  const env = envVar?.replace(/^"|"$/g, '');
  if (env && fs.existsSync(env)) return env;
  if (fs.existsSync(defaultCandidate)) return defaultCandidate;
  return fallback;
}
const FFMPEG = resolveBin(process.env.FFMPEG_PATH, 'C:\\Program Files\\DownloadHelper CoApp\\ffmpeg.exe', 'ffmpeg');
const FFPROBE = resolveBin(process.env.FFPROBE_PATH, 'C:\\Program Files\\DownloadHelper CoApp\\ffprobe.exe', 'ffprobe');
const PROOF = path.resolve('proof-screenshots');
fs.mkdirSync(PROOF, { recursive: true });

const formats = (process.argv[2] || 'mov,webm,mp4-chroma,mp4-full').split(',').map((s) => s.trim()).filter(Boolean) as Array<'mov' | 'webm' | 'mp4-chroma' | 'mp4-full'>;
const resultsPath = path.resolve('.cache', 'render-proof-results.json');
let results: any[] = [];
if (fs.existsSync(resultsPath)) {
  try { results = JSON.parse(fs.readFileSync(resultsPath, 'utf8')); } catch (_) { results = []; }
}

async function getJson(p: string) {
  const r = await fetch(`${API}${p}`);
  return r.json();
}

async function waitForRender(renderId: string, deadlineMs = 480000) {
  const started = Date.now();
  const res = await fetch(`${API}/api/renders/${renderId}/events`);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let lastPct = -1;
  while (true) {
    if (Date.now() - started > deadlineMs) throw new Error(`Render ${renderId} exceeded ${deadlineMs}ms`);
    const { done, value } = await reader.read();
    if (done) throw new Error(`SSE closed before completion for ${renderId}`);
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = JSON.parse(line.slice(5).trim());
        if (payload.type === 'progress') {
          const p = payload.progress;
          if (p.pct !== undefined && p.pct !== lastPct) {
            lastPct = p.pct;
            console.log(`    [progress] ${p.pct}% ${p.code || ''}${p.done ? ` (${p.done}/${p.total})` : ''}`);
          }
        } else if (payload.type === 'log') {
          const line = String(payload.line).trim();
          if (line) console.log(`    [log] ${line.slice(0, 200)}`);
        } else if (payload.type === 'complete') {
          console.log(`    [complete] ${payload.outputFile}`);
          return payload.outputFile as string;
        } else if (payload.type === 'error') {
          throw new Error(`Render error: ${payload.error}`);
        } else if (payload.type === 'status') {
          console.log(`    [status] ${payload.status}`);
        }
      }
    }
  }
}

function probe(file: string) {
  const out = execFileSync(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'stream=index,codec_type,codec_name,profile,pix_fmt,width,height,r_frame_rate,avg_frame_rate,nb_frames,duration:stream_tags=alpha_mode:format=format_name,size,duration,bit_rate',
    '-of', 'json', file
  ], { maxBuffer: 40 * 1024 * 1024 });
  return JSON.parse(out.toString());
}

function frameToRawRGB(file: string): { buf: Buffer; w: number; h: number } {
  const meta = probe(file);
  const v = meta.streams.find((s: any) => s.codec_type === 'video');
  const w = v.width;
  const h = v.height;
  const buf = execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
    maxBuffer: 600 * 1024 * 1024
  });
  return { buf, w, h };
}

function rgbAt(img: { buf: Buffer; w: number }, x: number, y: number) {
  const i = (y * img.w + x) * 3;
  return [img.buf[i], img.buf[i + 1], img.buf[i + 2]];
}

function findNearWhite(img: { buf: Buffer; w: number; h: number }) {
  // scan the central 80% for the brightest pixel; require near-white
  let best = { x: 0, y: 0, rgb: [0, 0, 0] as number[], score: -1 };
  const x0 = Math.floor(img.w * 0.1), x1 = Math.floor(img.w * 0.9);
  const y0 = Math.floor(img.h * 0.1), y1 = Math.floor(img.h * 0.9);
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * img.w + x) * 3;
      const r = img.buf[i], g = img.buf[i + 1], b = img.buf[i + 2];
      const score = r + g + b;
      if (score > best.score) best = { x, y, rgb: [r, g, b], score };
    }
  }
  return best;
}

async function main() {
  console.log('=== TARGET ===');
  const projects = await getJson('/api/projects');
  const videos = await getJson(`/api/projects/${projects[0].id}/videos`);
  const ordered = [...videos].sort((a: any, b: any) => {
    const ae = String(a.title).startsWith('E2E Proof') ? 1 : 0;
    const be = String(b.title).startsWith('E2E Proof') ? 1 : 0;
    return be - ae || String(b.id).localeCompare(String(a.id));
  });
  let target: any = null;
  for (const v of ordered) {
    const shots = await getJson(`/api/videos/${v.id}/shots`);
    const shot = shots.find((s: any) => s.currentVersionId);
    if (shot) {
      target = { video: v, shot };
      break;
    }
  }
  if (!target) throw new Error('No shot with a built version. Run scripts/e2e-proof.ts first.');
  console.log(`video=${target.video.id} "${target.video.title}" shot=${target.shot.shotNumber} duration=${target.shot.duration}s id=${target.shot.id}`);

  for (const fmt of formats) {
    console.log(`\n================ RENDER ${fmt} ================`);
    const cleanProj = String(target.video.projectId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanVid = String(target.video.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanShot = String(target.shot.shotNumber).replace(/[^a-zA-Z0-9_.-]/g, '_');
    const suffix = fmt === 'mp4-chroma' ? '-chroma' : fmt === 'mp4-full' ? '-full' : '';
    const ext = fmt === 'mov' ? 'mov' : fmt === 'webm' ? 'webm' : 'mp4';
    const expectedFile = path.resolve(process.cwd(), 'out', cleanProj, cleanVid, `${cleanShot}${suffix}.${ext}`);
    const reuse = process.env.REUSE_RENDERS === '1' && fs.existsSync(expectedFile);

    let file: string;
    let elapsedMs: number | null;
    if (reuse) {
      file = expectedFile;
      elapsedMs = null;
      console.log(`  reusing existing render (no new render started): ${file}`);
    } else {
      const t0 = Date.now();
      const res = await fetch(`${API}/api/shots/${target.shot.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renderFormat: fmt })
      });
      const start = await res.json();
      if (!res.ok) throw new Error(`Render start failed (${res.status}): ${JSON.stringify(start)}`);
      console.log(`  renderId=${start.renderId} outputUrl=${start.outputFile}`);
      const outputUrl: string = await waitForRender(start.renderId);
      elapsedMs = Date.now() - t0;
      file = path.resolve(process.cwd(), outputUrl.replace(/^\/+/, ''));
    }
    if (!fs.existsSync(file)) throw new Error(`Expected output missing: ${file}`);
    const stat = fs.statSync(file);
    const meta = probe(file);
    const videoStream = meta.streams.find((s: any) => s.codec_type === 'video');
    const audioStream = meta.streams.find((s: any) => s.codec_type === 'audio');

    console.log(`  file: ${file}`);
    console.log(`  sizeBytes: ${stat.size} (${(stat.size / 1024 / 1024).toFixed(2)} MiB)`);
    console.log(`  renderMs: ${elapsedMs === null ? 'not captured (produced during a timed-out foreground run)' : elapsedMs}`);
    console.log(`  ffprobe video: codec=${videoStream.codec_name} profile=${videoStream.profile} pix_fmt=${videoStream.pix_fmt} ${videoStream.width}x${videoStream.height} fps=${videoStream.r_frame_rate} frames=${videoStream.nb_frames} duration=${videoStream.duration}`);
    console.log(`  ffprobe format: ${meta.format.format_name} duration=${meta.format.duration} bitrate=${meta.format.bit_rate}`);
    if (audioStream) console.log(`  audio stream present: ${audioStream.codec_name}`);
    else console.log('  audio stream: none');
    const alphaTag = videoStream.tags?.alpha_mode;
    if (alphaTag) console.log(`  stream tag alpha_mode=${alphaTag}`);

    const record: any = {
      format: fmt,
      file,
      sizeBytes: stat.size,
      renderMs: elapsedMs,
      codec: videoStream.codec_name,
      profile: videoStream.profile,
      pixFmt: videoStream.pix_fmt,
      width: videoStream.width,
      height: videoStream.height,
      fps: videoStream.r_frame_rate,
      frames: videoStream.nb_frames,
      duration: meta.format.duration,
      alphaModeTag: alphaTag || null
    };

    // Composite alpha over solid RED and sample real pixels at 2.0s
    if (fmt === 'mov' || fmt === 'webm') {
      const composite = path.join(PROOF, `alpha-red-composite-2.0s-${fmt}.png`);
      execFileSync(FFMPEG, [
        '-y', '-v', 'error',
        '-f', 'lavfi', '-i', 'color=c=red:s=1920x1080:r=30:d=6',
        // FFmpeg's native VP9 decoder ignores WebM alpha; libvpx-vp9 applies it.
        ...(fmt === 'webm' ? ['-c:v', 'libvpx-vp9'] : []),
        '-i', file,
        '-filter_complex', '[1:v]setpts=PTS-STARTPTS[fg];[0:v][fg]overlay=shortest=1:format=auto',
        '-ss', '2.0', '-frames:v', '1', composite
      ], { maxBuffer: 200 * 1024 * 1024 });
      const img = frameToRawRGB(composite);
      const corner = rgbAt(img, 0, 0);
      const white = findNearWhite(img);
      console.log(`  composite saved: ${composite} (${img.w}x${img.h})`);
      console.log(`  corner pixel (0,0) over red: rgb(${corner.join(',')})`);
      console.log(`  brightest text-region pixel at (${white.x},${white.y}): rgb(${white.rgb.join(',')})`);
      record.composite = composite;
      record.cornerRGB = corner;
      record.textPixel = { x: white.x, y: white.y, rgb: white.rgb };
      if (!(corner[0] >= 240 && corner[1] <= 10 && corner[2] <= 10)) {
        throw new Error(`${fmt}: corner pixel is not red: rgb(${corner.join(',')})`);
      }
      if (!(white.rgb[0] > 200 && white.rgb[1] > 200 && white.rgb[2] > 200)) {
        throw new Error(`${fmt}: no near-white text pixel found; brightest rgb(${white.rgb.join(',')})`);
      }
    }

    if (fmt === 'mp4-chroma') {
      const frame = path.join(PROOF, 'chroma-frame-2.0s.png');
      execFileSync(FFMPEG, ['-y', '-v', 'error', '-ss', '2.0', '-i', file, '-frames:v', '1', frame]);
      const img = frameToRawRGB(frame);
      const corner = rgbAt(img, 0, 0);
      console.log(`  corner pixel (0,0): rgb(${corner.join(',')})`);
      record.cornerRGB = corner;
      if (!(corner[0] <= 10 && corner[1] >= 240 && corner[2] <= 10)) {
        throw new Error(`mp4-chroma: corner is not #00FF00: rgb(${corner.join(',')})`);
      }
    }

    if (fmt === 'mp4-full') {
      const frame = path.join(PROOF, 'full-frame-2.0s.png');
      execFileSync(FFMPEG, ['-y', '-v', 'error', '-ss', '2.0', '-i', file, '-frames:v', '1', frame]);
      const img = frameToRawRGB(frame);
      const corner = rgbAt(img, 0, 0);
      console.log(`  corner pixel (0,0): rgb(${corner.join(',')})`);
      record.cornerRGB = corner;
      if (corner[0] + corner[1] + corner[2] > 120) {
        throw new Error(`mp4-full: corner is not a dark opaque background: rgb(${corner.join(',')})`);
      }
    }

    // Expected timing: 4s at 30fps
    const fpsNum = videoStream.r_frame_rate;
    const duration = Number(meta.format.duration);
    console.log(`  timing check: duration=${duration}s fps=${fpsNum} frames=${videoStream.nb_frames}`);
    if (Math.abs(duration - 4) > 0.15) throw new Error(`${fmt}: expected ~4s, got ${duration}s`);
    if (fpsNum !== '30/1') throw new Error(`${fmt}: expected 30/1 fps, got ${fpsNum}`);
    record.timingOk = true;

    results = results.filter((r) => r.format !== fmt);
    results.push(record);
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  }

  console.log('\n================ RENDER RESULT TABLE ================');
  for (const r of results) {
    console.log(`${r.format}: ${(r.sizeBytes / 1024 / 1024).toFixed(2)} MiB, ${r.renderMs}ms, codec=${r.codec}, pix_fmt=${r.pixFmt}, fps=${r.fps}, frames=${r.frames}, duration=${r.duration}s, corner=${r.cornerRGB ? 'rgb(' + r.cornerRGB.join(',') + ')' : 'n/a'}`);
  }
  console.log('results written to .cache/render-proof-results.json');
}

main().catch((err) => {
  console.error('\n[RENDER PROOF FAILED]', err?.stack || err);
  process.exit(1);
});

import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { LintResult, OutputMode } from '../common/types.js';

const execAsync = promisify(exec);

// Auto-configure PATH with known FFmpeg locations
const KNOWN_FFMPEG_PATHS = [
  'C:\\Program Files\\DownloadHelper CoApp',
  path.resolve(process.cwd(), 'node_modules', 'ffmpeg-static')
];

for (const p of KNOWN_FFMPEG_PATHS) {
  if (fs.existsSync(p) && !process.env.PATH?.includes(p)) {
    process.env.PATH = `${p};${process.env.PATH}`;
  }
}

export type RenderFormat = 'mov' | 'webm' | 'mp4-chroma' | 'mp4-full';

type ProgressFn = (progress: { code: string; pct: number; done?: number; total?: number; message?: string }) => void;

export class HyperFramesService {
  /**
   * Lint a composition directory using `npx hyperframes lint <dir> --json`
   */
  async lintComposition(compositionDir: string): Promise<LintResult> {
    try {
      const { stdout } = await execAsync(`npx hyperframes lint "${compositionDir}" --json`, {
        cwd: compositionDir,
        env: process.env,
        timeout: 25000
      });

      const parsed = JSON.parse(stdout);
      return {
        ok: Boolean(parsed.ok),
        errorCount: parsed.errorCount ?? 0,
        warningCount: parsed.warningCount ?? 0,
        infoCount: parsed.infoCount ?? 0,
        findings: (parsed.findings || []).map((f: any) => ({
          rule: f.rule || 'unknown_rule',
          message: f.message || '',
          level: f.level || (f.rule?.includes('error') ? 'error' : 'warning'),
          file: f.file,
          line: f.line,
          fix: f.fix
        }))
      };
    } catch (err: any) {
      // In case of lint errors, hyperframes may exit with non-zero code while printing valid JSON
      if (err.stdout) {
        try {
          const parsed = JSON.parse(err.stdout);
          return {
            ok: Boolean(parsed.ok),
            errorCount: parsed.errorCount ?? (parsed.findings?.length || 1),
            warningCount: parsed.warningCount ?? 0,
            infoCount: parsed.infoCount ?? 0,
            findings: (parsed.findings || []).map((f: any) => ({
              rule: f.rule || 'lint_error',
              message: f.message || err.message,
              level: 'error',
              file: f.file,
              line: f.line,
              fix: f.fix
            }))
          };
        } catch (_) {}
      }

      return {
        ok: false,
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
        findings: [{
          rule: 'hyperframes_lint_failure',
          message: err.message || 'Failed to run hyperframes lint',
          level: 'error'
        }]
      };
    }
  }

  private ffmpegBin(): string {
    const fromEnv = process.env.FFMPEG_PATH?.replace(/^"|"$/g, '');
    if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
    for (const dir of KNOWN_FFMPEG_PATHS) {
      const candidate = path.join(dir, 'ffmpeg.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
    return 'ffmpeg';
  }

  /**
   * Render the composition with HyperFrames.
   * Only MOV (ProRes 4444) is captured natively: `--format webm` on this build
   * writes yuv420p with no alpha (verified with ffprobe), so WebM/chroma/full
   * are derived from the ProRes 4444 alpha master with ffmpeg.
   */
  renderComposition(options: {
    shotDir: string;
    outputFile: string;
    mode: OutputMode;
    renderFormat?: RenderFormat;
    fps?: number;
    onProgress?: ProgressFn;
    onLog?: (line: string) => void;
  }): { promise: Promise<{ outputFile: string }>; cancel: () => void } {
    const { shotDir, outputFile, mode, renderFormat, fps = 30, onProgress, onLog } = options;

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });

    const effective: RenderFormat =
      renderFormat || (mode === 'overlay-alpha' ? 'mov' : mode === 'chroma' ? 'mp4-chroma' : 'mp4-full');

    if (effective === 'mov') {
      return this.renderNative({ shotDir, outputFile, fps, onProgress, onLog });
    }
    return this.deriveAlphaOutput({ shotDir, outputFile, format: effective, fps, onProgress, onLog });
  }

  /** Spawn the HyperFrames CLI with Node directly (no shell: paths contain spaces). */
  private renderNative(opts: {
    shotDir: string;
    outputFile: string;
    fps: number;
    onProgress?: ProgressFn;
    onLog?: (line: string) => void;
  }): { promise: Promise<{ outputFile: string }>; cancel: () => void } {
    const { shotDir, outputFile, fps, onProgress, onLog } = opts;

    const cliPath = path.resolve(process.cwd(), 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');
    const cliArgs = [
      cliPath,
      'render',
      shotDir,
      '-o',
      outputFile,
      '--format',
      'mov',
      '--fps',
      String(fps)
    ];

    let child: any = null;
    let killed = false;

    const promise = new Promise<{ outputFile: string }>((resolve, reject) => {
      onLog?.(`[Render] Spawning: ${process.execPath} ${cliArgs.join(' ')}`);

      child = spawn(process.execPath, cliArgs, {
        cwd: shotDir,
        env: process.env,
        windowsHide: true
      });

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        onLog?.(text);

        const lines = text.split('\n');
        for (const line of lines) {
          const match = line.match(/@hf-progress\s+({.*})/);
          if (match) {
            try {
              const p = JSON.parse(match[1]);
              onProgress?.(p);
              continue;
            } catch (_) {}
          }
          const frame = line.match(/(?:frame|rendering frame)\s+(\d+)\s*\/\s*(\d+)/i);
          if (frame) {
            const done = parseInt(frame[1], 10);
            const total = parseInt(frame[2], 10);
            if (total > 0) {
              onProgress?.({ code: 'capture', pct: Math.min(99, Math.round((done / total) * 100)), done, total });
            }
            continue;
          }
          const pct = line.match(/(\d{1,3})\s*%/);
          if (pct && /render|capture|encod|frame/i.test(line)) {
            onProgress?.({ code: 'render', pct: Math.min(99, parseInt(pct[1], 10)), message: line.trim() });
          }
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        onLog?.(`[stderr] ${data.toString()}`);
      });

      child.on('close', (code: number) => {
        if (killed) return reject(new Error('Render cancelled by user'));
        if (code === 0) {
          onProgress?.({ code: 'complete', pct: 100, message: 'Render complete' });
          resolve({ outputFile });
        } else {
          reject(new Error(`hyperframes render failed with exit code ${code}`));
        }
      });

      child.on('error', (err: Error) => reject(err));
    });

    return {
      promise,
      cancel: () => {
        killed = true;
        if (child) {
          try { exec(`taskkill /pid ${child.pid} /T /F`); } catch (_) {}
        }
      }
    };
  }

  private runFfmpeg(
    args: string[],
    onLog?: (line: string) => void
  ): { promise: Promise<void>; cancel: () => void } {
    let child: any = null;
    let killed = false;
    const promise = new Promise<void>((resolve, reject) => {
      onLog?.(`[ffmpeg] ${args.join(' ')}`);
      child = spawn(this.ffmpegBin(), args, { windowsHide: true });
      child.stdout.on('data', (d: Buffer) => onLog?.(d.toString()));
      child.stderr.on('data', (d: Buffer) => onLog?.(`[ffmpeg] ${d.toString()}`));
      child.on('close', (code: number) => {
        if (killed) return reject(new Error('Render cancelled by user'));
        if (code === 0) return resolve();
        reject(new Error(`ffmpeg failed with exit code ${code}`));
      });
      child.on('error', (err: Error) => reject(err));
    });
    return {
      promise,
      cancel: () => {
        killed = true;
        if (child) {
          try { exec(`taskkill /pid ${child.pid} /T /F`); } catch (_) {}
        }
      }
    };
  }

  private deriveAlphaOutput(opts: {
    shotDir: string;
    outputFile: string;
    format: 'webm' | 'mp4-chroma' | 'mp4-full';
    fps: number;
    onProgress?: ProgressFn;
    onLog?: (line: string) => void;
  }): { promise: Promise<{ outputFile: string }>; cancel: () => void } {
    const { shotDir, outputFile, format, fps, onProgress, onLog } = opts;

    // Master keeps the same base name as the deliverable: 1.1.mov / 1.1.webm / 1.1-chroma.mp4
    const base = outputFile.replace(/-chroma\.mp4$|-full\.mp4$|\.webm$|\.mp4$/i, '');
    const master = `${base}.mov`;
    const indexHtml = path.join(shotDir, 'index.html');
    const fresh =
      fs.existsSync(master) &&
      fs.existsSync(indexHtml) &&
      fs.statSync(master).mtimeMs >= fs.statSync(indexHtml).mtimeMs;

    let innerCancel: () => void = () => {};
    let ffCancel: () => void = () => {};

    const promise = (async () => {
      if (!fresh) {
        onLog?.(`[Render] No fresh alpha master at ${master} — rendering ProRes 4444 first.`);
        const inner = this.renderNative({
          shotDir,
          outputFile: master,
          fps,
          onLog,
          onProgress: (p) => onProgress?.({ ...p, pct: Math.min(88, Math.round((p.pct || 0) * 0.88)) })
        });
        innerCancel = inner.cancel;
        await inner.promise;
      } else {
        onLog?.(`[Render] Using fresh ProRes 4444 alpha master: ${master}`);
        onProgress?.({ code: 'derived', pct: 30, message: 'Alpha master ready' });
      }

      onProgress?.({ code: 'encode', pct: 92, message: format === 'webm' ? 'Encoding VP9 alpha WebM' : 'Compositing opaque MP4' });

      const args: string[] = format === 'webm'
        ? [
            '-y',
            '-i', master,
            '-c:v', 'libvpx-vp9',
            '-pix_fmt', 'yuva420p',
            '-crf', '24',
            '-b:v', '0',
            '-auto-alt-ref', '0',
            '-row-mt', '1',
            '-an',
            outputFile
          ]
        : [
            '-y',
            '-f', 'lavfi',
            '-i', `color=c=${format === 'mp4-chroma' ? '0x00FF00' : '0x0B0F19'}:s=1920x1080:r=${fps}`,
            '-i', master,
            '-filter_complex', '[0:v][1:v]overlay=shortest=1,format=yuv420p',
            '-c:v', 'libx264',
            '-crf', '18',
            '-preset', 'medium',
            '-pix_fmt', 'yuv420p',
            '-an',
            outputFile
          ];

      const ff = this.runFfmpeg(args, onLog);
      ffCancel = ff.cancel;
      await ff.promise;

      onProgress?.({ code: 'complete', pct: 100, message: 'Render complete' });
      return { outputFile };
    })();

    return {
      promise,
      cancel: () => {
        innerCancel();
        ffCancel();
      }
    };
  }
}

export const hyperFramesService = new HyperFramesService();

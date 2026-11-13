import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { GenerationContext, LLMResponse } from './provider-interface.js';

export class AgentBridgeService {
  private currentProcess: any = null;
  private isRunning = false;

  private resolveAgentBin(): string {
    const fromEnv = process.env.AGENT_BIN?.replace(/^"|"$/g, '');
    if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const candidate = path.join(localAppData, 'Programs', 'Antigravity IDE', 'bin', 'antigravity-ide.cmd');
      if (fs.existsSync(candidate)) return candidate;
    }
    return process.platform === 'win32' ? 'antigravity-ide.cmd' : 'antigravity-ide';
  }

  async runAgentJob(
    shotDir: string,
    context: GenerationContext,
    onLog?: (line: string) => void
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    this.isRunning = true;

    // 1. Write TASK.md into shotDir
    const taskMdPath = path.join(shotDir, 'TASK.md');
    const taskContent = `# Motion Lab Task - Shot ${context.shotNumber || '1.1'}

## Requirements
- Duration: ${context.duration || 3} seconds
- On-Screen Text: "${context.onScreenText || ''}"
- Animation Prompt:
${context.animationPrompt || ''}

${context.editInstruction ? `## Edit Instruction\n${context.editInstruction}\n` : ''}

## Brand Tokens
\`\`\`json
${JSON.stringify(context.brandKit || {}, null, 2)}
\`\`\`

## Instructions
1. Inspect the requirements and existing files.
2. Produce or update \`index.html\` (with GSAP timeline and \`data-composition-id="main"\`) and \`params.json\`.
3. Ensure no remote external assets (use relative local assets or SVG).
4. Run \`npx hyperframes lint .\` until there are no errors, then finish.
`;
    fs.writeFileSync(taskMdPath, taskContent, 'utf8');
    onLog?.(`[Agent] Wrote TASK.md to ${shotDir}`);

    // 2. Prepare command and bin
    const bin = this.resolveAgentBin();
    const prompt = 'Read TASK.md, update index.html and params.json, run hyperframes lint until clean, then stop.';
    const timeoutSec = parseInt(process.env.AGENT_TIMEOUT_SEC || '180', 10);

    onLog?.(`[Agent] Spawning agent CLI: ${bin}`);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(bin, ['chat', '--mode', 'agent', prompt], {
        cwd: shotDir,
        shell: true,
        env: { ...process.env, CI: 'true' }
      });
      this.currentProcess = proc;

      const timer = setTimeout(() => {
        if (this.isRunning) {
          try { proc.kill(); } catch (_) {}
          reject(new Error(`Agent job timed out after ${timeoutSec} seconds`));
        }
      }, timeoutSec * 1000);

      proc.stdout.on('data', (d: Buffer) => {
        const text = d.toString();
        onLog?.(`[Agent] ${text.trim()}`);
      });

      proc.stderr.on('data', (d: Buffer) => {
        const text = d.toString();
        onLog?.(`[Agent stderr] ${text.trim()}`);
      });

      proc.on('close', (code: number) => {
        clearTimeout(timer);
        this.isRunning = false;
        this.currentProcess = null;
        if (code === 0) {
          resolve();
        } else {
          // If files were generated even with non-zero exit, accept if index.html exists
          const indexExists = fs.existsSync(path.join(shotDir, 'index.html')) || fs.existsSync(path.join(shotDir, 'comp.html'));
          if (indexExists) {
            resolve();
          } else {
            reject(new Error(`Agent exited with code ${code}`));
          }
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        this.isRunning = false;
        this.currentProcess = null;
        reject(err);
      });
    });

    // 3. Read generated files
    const indexPath = path.join(shotDir, 'index.html');
    const compPath = path.join(shotDir, 'comp.html');
    let compHtml = '';
    if (fs.existsSync(indexPath)) {
      compHtml = fs.readFileSync(indexPath, 'utf8');
    } else if (fs.existsSync(compPath)) {
      compHtml = fs.readFileSync(compPath, 'utf8');
    } else {
      throw new Error('Agent completed but did not produce index.html or comp.html');
    }

    const paramsPath = path.join(shotDir, 'params.json');
    let params: Record<string, any> = {};
    if (fs.existsSync(paramsPath)) {
      try {
        params = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));
      } catch (_) {}
    }

    const latency = Date.now() - startTime;
    return {
      output: {
        compHtml,
        params,
        paramsSchema: [],
        notes: 'Synthesized by Antigravity Agent'
      },
      provider: 'agent',
      model: process.env.AGENT_MODEL || 'antigravity-ide',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      latencyMs: latency
    };
  }

  cancelJob() {
    this.isRunning = false;
    if (this.currentProcess) {
      try { this.currentProcess.kill(); } catch (_) {}
    }
  }
}

export const agentBridgeService = new AgentBridgeService();

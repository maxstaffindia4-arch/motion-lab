import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { dbService } from '../db.js';
import { hyperFramesService } from '../hyperframes.js';
import { GeminiProvider, setGenerateLog as setProviderLog } from './gemini-provider.js';
import { ClaudeProvider } from './claude-provider.js';
import { agentBridgeService } from './agent-provider.js';
import { GenerationContext, LLMResponse, ILLMProvider } from './provider-interface.js';
import { ShotVersion, VersionSource, LintResult, LintFinding } from '../../common/types.js';
import { computeUnifiedDiff } from '../../common/diff-utils.js';
import { parseAnimationPrompt } from '../../common/prompt-parser.js';
import { resolveContext, BuildOptions, ResolvedContext } from '../../common/context.js';
import { validateLockedText, LockTextError } from '../../common/lock-text.js';
import { prepareForShot, PreparedDocuments } from '../documents.js';
import {
  Archetype,
  GenerationPath,
  TemplateParams,
  buildTemplateParams,
  extractTextItems,
  findTimingIssue,
  parseBeats,
  routeArchetype
} from '../../common/archetypes.js';
import { renderTemplate, templateParamSchema } from '../templates/render.js';
import { LayoutQAResult, runLayoutQA } from '../layout-qa.js';
import { TEMPLATES } from '../../common/templates.js';

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stored as "drafted" when the prompt supplied no verbatim text. */
export function extractDraftedText(html: string): string {
  const text = visibleText(html);
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

function remoteUrlFindings(html: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const re = /(?:src|href)\s*=\s*["']\s*https?:\/\/|url\(\s*["']?\s*https?:\/\//gi;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((match = re.exec(html))) {
    const start = Math.max(0, match.index);
    const snippet = html.slice(start, start + 120).split(/["')]/)[0];
    if (snippet.includes('www.w3.org')) continue;
    if (seen.has(snippet)) continue;
    seen.add(snippet);
    findings.push({ rule: 'remote_asset_url', message: `Remote URL is not allowed: ${snippet}`, level: 'error' });
  }
  return findings;
}

/**
 * Relative references (e.g. "assets/gsap.min.js") are resolved by the renderer
 * from the shot directory, so the file must exist on disk next to index.html.
 * Lint alone only checks structure, which let a comp referencing a missing
 * asset pass as "built" while the preview stayed empty.
 */
export function missingLocalAssetFindings(html: string, shotDir: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const refs = new Set<string>();

  const attrRe = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(html))) refs.add(m[1]);

  const urlRe = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((m = urlRe.exec(html))) refs.add(m[1].trim());

  const isExternalOrInline = (ref: string) =>
    ref === '' ||
    ref.startsWith('#') ||
    ref.startsWith('//') ||
    ref.startsWith('/') ||
    /^(https?:|data:|blob:|mailto:|javascript:)/i.test(ref);

  const seen = new Set<string>();
  for (const raw of refs) {
    const ref = raw.split(/[?#]/)[0].trim();
    if (isExternalOrInline(ref)) continue;

    let decoded = ref;
    try {
      decoded = decodeURIComponent(ref);
    } catch (_) {}

    const resolved = path.resolve(shotDir, decoded);
    if (seen.has(resolved)) continue;
    seen.add(resolved);

    let ok = false;
    try {
      ok = fs.existsSync(resolved) && fs.statSync(resolved).isFile() && fs.statSync(resolved).size > 0;
    } catch (_) {
      ok = false;
    }
    if (!ok) {
      findings.push({
        rule: 'missing_local_asset',
        message: `Local asset not found: ${ref} (expected at ${path.relative(shotDir, resolved)})`,
        level: 'error'
      });
    }
  }

  return findings;
}

/**
 * Static layout rule: multi-item compositions must not stack absolutely
 * positioned elements without distinct offsets. This is the exact pattern that
 * produced four overlapping checklist lines.
 */
export function absoluteLayoutFindings(html: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const ruleRe = /([^{}@]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;

  while ((m = ruleRe.exec(html))) {
    const selector = m[1].trim();
    const body = m[2];
    if (!/position\s*:\s*absolute/i.test(body)) continue;
    if (!/\.clip\b|#item|\.item\b/.test(selector)) continue;

    const hasOffsets = /\b(top|left|right|bottom)\s*:/i.test(body) || /\btransform\s*:/i.test(body);
    if (hasOffsets) continue;

    // How many elements does this selector actually hit?
    const classMatch = selector.match(/\.([a-zA-Z0-9_-]+)/);
    const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
    let hits = 0;
    if (classMatch) {
      const cls = classMatch[1];
      const elRe = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`, 'g');
      hits = (html.match(elRe) || []).length;
    } else if (idMatch) {
      const elRe = new RegExp(`id="${idMatch[1]}"`, 'g');
      hits = (html.match(elRe) || []).length;
    }

    if (hits >= 2) {
      findings.push({
        rule: 'absolute_without_offsets',
        message: `${hits} elements share \`${selector}\` with position:absolute but no distinct top/left/right/bottom or transform offsets — they stack at the same position`,
        level: 'error'
      });
    }
  }

  return findings;
}

export function auditLint(html: string, lint: LintResult, shotDir?: string): LintResult {
  const findings = [
    ...remoteUrlFindings(html),
    ...absoluteLayoutFindings(html),
    ...(shotDir ? missingLocalAssetFindings(html, shotDir) : [])
  ];
  if (!findings.length) return lint;
  return {
    ...lint,
    ok: false,
    errorCount: lint.errorCount + findings.length,
    findings: [...lint.findings, ...findings]
  };
}

function localizeHtml(html: string, shotDir: string, fontFaces: string[]): string {
  let out = html.replace(/https?:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[0-9.]+\/dist\/gsap\.min\.js/g, 'assets/gsap.min.js');
  out = out.replace(/<script[^>]+src=["']https?:\/\/[^"']*gsap[^"']*["'][^>]*><\/script>/gi, '<script src="assets/gsap.min.js"></script>');

  if (out.includes('assets/gsap.min.js')) {
    const assetsDir = path.join(shotDir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    const source = path.resolve(process.cwd(), 'node_modules', 'gsap', 'dist', 'gsap.min.js');
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(assetsDir, 'gsap.min.js'));
    }
  }

  if (fontFaces.length) {
    const style = `<style id="motionlab-asset-fonts">${fontFaces.join('')}</style>`;
    out = out.includes('</head>') ? out.replace('</head>', `${style}</head>`) : style + out;
  }
  return out;
}

export interface TemplatePlan {
  archetype: Archetype;
  params: TemplateParams;
  reason: string;
}

/** Template-first routing: only fresh builds may take the deterministic path. */
export function planTemplate(args: {
  prompt: string;
  duration: number;
  source: VersionSource;
  editInstruction?: string;
  brandColors?: Record<string, string>;
}): TemplatePlan | null {
  if (args.source !== 'generate' || args.editInstruction) return null;
  const items = extractTextItems(args.prompt);
  const route = routeArchetype(args.prompt, items.length);
  if (route.archetype === 'custom') return null;
  const params = buildTemplateParams({
    prompt: args.prompt,
    duration: args.duration,
    archetype: route.archetype,
    brandColors: args.brandColors
  });
  if (!params.items.length) return null;
  return { archetype: route.archetype, params, reason: route.reason };
}

/** Four hand-picked golden compositions used as structure reference for CUSTOM builds. */
export function goldenExamples(sampleText: string): string[] {
  const picks = ['text-slam', 'strike-checklist', 'lower-third', 'number-counter'];
  const examples: string[] = [];
  for (const id of picks) {
    const tpl = TEMPLATES[id];
    if (!tpl) continue;
    try {
      const html = tpl.renderHtml({ text: sampleText || 'Example Text', duration: 3 }, 'overlay-alpha');
      examples.push(`<!-- ${id} -->\n${html.slice(0, 900)}`);
    } catch (_) {}
  }
  return examples;
}

function mergeQAFindings(lint: LintResult, qa: LayoutQAResult): LintResult {
  if (qa.ok) return lint;
  return {
    ...lint,
    ok: false,
    errorCount: lint.errorCount + qa.findings.length,
    findings: [...lint.findings, ...qa.findings]
  };
}

function qaSummary(qa: LayoutQAResult): Record<string, any> {
  return {
    ok: qa.ok,
    worstOverlap: Number(qa.worstOverlap.toFixed(3)),
    samples: qa.samples.map((s) => ({
      t: s.t,
      worstOverlap: Number(s.worstOverlap.toFixed(3)),
      visible: s.visibleCount,
      boxes: s.boxes.map((b) => ({ id: b.id, text: b.text.slice(0, 40), x: b.x, y: b.y, w: b.w, h: b.h, opacity: Number(b.opacity.toFixed(2)) }))
    }))
  };
}

export interface PreparedGeneration {
  shot: any;
  video: any;
  project: any;
  resolved: ResolvedContext;
  context: GenerationContext;
  shotDir: string;
  prepared: PreparedDocuments;
}

export function buildShotContext(args: {
  shotId: string;
  promptOverride?: string;
  options?: BuildOptions;
  documentIds?: string[];
  documentModes?: Record<string, 'Full' | 'Summary' | 'Off'>;
}): PreparedGeneration {
  const shot = dbService.getShot(args.shotId);
  if (!shot) throw new Error(`Shot not found: ${args.shotId}`);
  const video = dbService.getVideo(shot.videoId);
  if (!video) throw new Error(`Video not found: ${shot.videoId}`);
  const project = dbService.getProject(video.projectId);
  if (!project) throw new Error(`Project not found: ${video.projectId}`);

  const prompt = args.promptOverride !== undefined ? args.promptOverride : shot.animationPrompt || '';
  const parsed = parseAnimationPrompt(prompt);
  const resolved = resolveContext({ prompt, parsed, shot, video, project, options: args.options });

  const cleanVid = video.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanShot = shot.shotNumber.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const shotDir = path.resolve(process.cwd(), 'shots', cleanVid, cleanShot);
  fs.mkdirSync(shotDir, { recursive: true });

  const prepared = prepareForShot({
    shotDir,
    projectId: project.id,
    videoId: video.id,
    shotId: shot.id,
    documentIds: args.documentIds,
    modes: args.documentModes
  });

  const context: GenerationContext = {
    projectTokens: project.brandTokens,
    brandKit: resolved.brandKit,
    projectNotes: resolved.projectNotes || '',
    videoTitle: video.title,
    videoNotes: resolved.videoNotes || '',
    shotNumber: parsed.shotId || shot.shotNumber,
    duration: resolved.duration,
    // A drafted text belongs to its current prompt; keep it only for edits of the same shot.
    onScreenText: resolved.promptText || (shot.textSource === 'drafted' ? shot.onScreenText : ''),
    textSource: resolved.textSource,
    style: resolved.style,
    voiceoverLine: resolved.voiceover,
    animationPrompt: prompt,
    shotContext: resolved.shotContext,
    outputMode: resolved.outputMode,
    documents: prepared.documents,
    assets: prepared.assets,
    attachments: prepared.attachments
  };

  return { shot, video, project, resolved, context, shotDir, prepared };
}

export class GenerationService {
  private gemini = new GeminiProvider();
  private claude = new ClaudeProvider();

  getProvider(providerName?: string): ILLMProvider {
    const selected = providerName || process.env.LLM_PROVIDER || 'gemini';
    if (selected === 'anthropic' || selected === 'claude') return this.claude;
    return this.gemini;
  }

  setLogFn(fn: ((msg: string) => void) | undefined) {
    setProviderLog(fn);
  }

  async generateShot(options: {
    shotId: string;
    source: VersionSource;
    producingPrompt: string;
    editInstruction?: string;
    manualDiff?: string;
    overrideProvider?: string;
    activeModel?: string;
    lockText?: boolean;
    resolved?: ResolvedContext;
    documentIds?: string[];
    documentModes?: Record<string, 'Full' | 'Summary' | 'Off'>;
    buildOptions?: BuildOptions;
    onLog?: (msg: string) => void;
  }): Promise<ShotVersion> {
    const { shotId, source, producingPrompt, editInstruction, manualDiff, overrideProvider, activeModel, lockText, onLog } = options;
    // Route provider-level logging (model name, request, result, quota errors) to this build's log.
    if (onLog) {
      setProviderLog(onLog);
    }

    const shot = dbService.getShot(shotId);
    if (!shot) throw new Error(`Shot not found: ${shotId}`);
    const video = dbService.getVideo(shot.videoId);
    if (!video) throw new Error(`Video not found: ${shot.videoId}`);
    const project = dbService.getProject(video.projectId);
    if (!project) throw new Error(`Project not found: ${video.projectId}`);

    const preparedGen = buildShotContext({
      shotId,
      promptOverride: shot.animationPrompt || producingPrompt,
      options: options.buildOptions,
      documentIds: options.documentIds,
      documentModes: options.documentModes
    });
    const { resolved, shotDir, prepared } = preparedGen;
    const context = preparedGen.context;
    if (options.resolved) {
      Object.assign(context, {
        brandKit: options.resolved.brandKit,
        duration: options.resolved.duration,
        outputMode: options.resolved.outputMode,
        onScreenText: options.resolved.promptText || context.onScreenText,
        textSource: options.resolved.textSource,
        style: options.resolved.style
      });
    }

    const parentVersion = shot.currentVersionId ? dbService.getVersion(shot.currentVersionId) : null;
    let computedManualDiff = manualDiff || '';
    if (!computedManualDiff && parentVersion && parentVersion.source === 'manual-code') {
      const allVersions = dbService.getVersions(shotId);
      const lastGenerated = allVersions.find((v) => v.source === 'generate' || v.source === 'agent' || v.source === 'edit-prompt');
      if (lastGenerated && lastGenerated.compHtml !== parentVersion.compHtml) {
        computedManualDiff = computeUnifiedDiff('comp.html', lastGenerated.compHtml, parentVersion.compHtml);
        onLog?.(`[Diff] Preserving manual edits from v${parentVersion.versionNumber}.`);
      }
    }

    context.previousHtml = parentVersion?.compHtml;
    context.previousParams = parentVersion?.params;
    context.editInstruction = editInstruction;
    context.manualDiff = computedManualDiff;
    context.shotNumber = context.shotNumber || shot.shotNumber;

    onLog?.(`[Gen] ${source} for Shot ${shot.shotNumber} (${resolved.duration}s, ${resolved.outputMode}, text=${resolved.textSource}).`);

    const providerKey = overrideProvider || process.env.LLM_PROVIDER || 'gemini';

    // ---------- Template-first routing ----------
    const templatePlan = planTemplate({
      prompt: context.animationPrompt,
      duration: resolved.duration,
      source,
      editInstruction,
      brandColors: (context.brandKit as any)?.colors
    });

    let generationPath: GenerationPath = 'custom';
    let archetype: Archetype | 'custom' = 'custom';
    let response: LLMResponse;

    if (templatePlan) {
      generationPath = 'template';
      archetype = templatePlan.archetype;
      const html = localizeHtml(renderTemplate(templatePlan.archetype, templatePlan.params), shotDir, prepared.fontFaces);
      response = {
        output: {
          compHtml: html,
          params: templatePlan.params as unknown as Record<string, any>,
          paramsSchema: templateParamSchema(templatePlan.archetype, templatePlan.params)
        } as any,
        provider: 'template',
        model: `template:${templatePlan.archetype}`,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: 0
      };
      onLog?.(`[Route] TEMPLATE: ${templatePlan.archetype} (${templatePlan.reason}). No LLM call.`);
    } else if (providerKey === 'agent' || source === 'agent') {
      onLog?.('[Route] CUSTOM: agent build.');
      response = await agentBridgeService.runAgentJob(shotDir, context, onLog);
    } else {
      onLog?.(`[Route] CUSTOM: free-form code generation (${activeModel || 'default model'}).`);
      context.goldenExamples = goldenExamples(resolved.promptText || context.onScreenText || 'Example Text');
      context.referenceTemplate = renderTemplate('text-slam', buildTemplateParams({
        prompt: 'TEXT: Example Text',
        duration: Math.max(1, resolved.duration),
        archetype: 'text-slam'
      }));
      response = await this.getProvider(providerKey).generate(context, activeModel);
    }
    response.output.compHtml = localizeHtml(response.output.compHtml, shotDir, prepared.fontFaces);

    const indexPath = path.join(shotDir, 'index.html');
    const paramsPath = path.join(shotDir, 'params.json');
    const compHtmlStale = path.join(shotDir, 'comp.html');
    if (fs.existsSync(compHtmlStale)) {
      try { fs.unlinkSync(compHtmlStale); } catch (_) {}
    }
    fs.writeFileSync(indexPath, response.output.compHtml, 'utf8');
    fs.writeFileSync(paramsPath, JSON.stringify(response.output.params, null, 2), 'utf8');

    let lintResult = auditLint(response.output.compHtml, await hyperFramesService.lintComposition(shotDir), shotDir);
    onLog?.(`[Lint] Initial: ok=${lintResult.ok}, errors=${lintResult.errorCount}`);

    // ---------- Automatic layout QA (headless, real bounding boxes) ----------
    const qaEnabled = process.env.MOTIONLAB_QA !== '0';
    const expectedTexts = templatePlan
      ? templatePlan.params.items.map((i) => i.text)
      : extractTextItems(context.animationPrompt);
    const beatTimes = templatePlan
      ? templatePlan.params.items.map((i) => i.start)
      : parseBeats(context.animationPrompt, expectedTexts).starts;

    let qaResult: LayoutQAResult | null = null;
    if (qaEnabled) {
      try {
        qaResult = await runLayoutQA({
          shotDir,
          beatTimes,
          expectedTexts,
          expectedItems: templatePlan
            ? templatePlan.params.items.map((i) => ({ text: i.text, start: i.start }))
            : expectedTexts.map((text, i) => ({ text, start: beatTimes[i] ?? 0 })),
          holdEnd: templatePlan?.params.fadeOutAt,
          duration: resolved.duration
        });
        lintResult = mergeQAFindings(lintResult, qaResult);
        onLog?.(
          `[LayoutQA] ok=${qaResult.ok}, worstOverlap=${(qaResult.worstOverlap * 100).toFixed(1)}%` +
            (qaResult.ok ? '' : `, findings=${qaResult.findings.length}`)
        );
        for (const f of qaResult.findings.slice(0, 6)) onLog?.(`[LayoutQA] ${f.message}`);
      } catch (err: any) {
        onLog?.(`[LayoutQA] skipped: ${err.message}`);
      }
    }

    let repairAttempts = 0;
    // Free API keys get at most 2 repair attempts; quota/network failures are never repaired.
    // Template builds never spend a model call: a failing template is reported for review.
    const maxRepairs = 2;
    while (
      !lintResult.ok &&
      repairAttempts < maxRepairs &&
      providerKey !== 'agent' &&
      generationPath === 'custom'
    ) {
      repairAttempts++;
      onLog?.(`[Repair] ${lintResult.errorCount} error(s). Attempt ${repairAttempts}/${maxRepairs}...`);
      context.lintErrors = lintResult;
      context.previousHtml = response.output.compHtml;
      response = await this.getProvider(providerKey).generate(context);
      response.output.compHtml = localizeHtml(response.output.compHtml, shotDir, prepared.fontFaces);
      fs.writeFileSync(indexPath, response.output.compHtml, 'utf8');
      fs.writeFileSync(paramsPath, JSON.stringify(response.output.params, null, 2), 'utf8');
      lintResult = auditLint(response.output.compHtml, await hyperFramesService.lintComposition(shotDir), shotDir);
      if (qaEnabled) {
        try {
          qaResult = await runLayoutQA({
            shotDir,
            beatTimes,
            expectedTexts,
            expectedItems: templatePlan
              ? templatePlan.params.items.map((i) => ({ text: i.text, start: i.start }))
              : expectedTexts.map((text, i) => ({ text, start: beatTimes[i] ?? 0 })),
            holdEnd: templatePlan?.params.fadeOutAt,
            duration: resolved.duration
          });
          lintResult = mergeQAFindings(lintResult, qaResult);
        } catch (_) {}
      }
      onLog?.(`[Repair ${repairAttempts}] ok=${lintResult.ok}, errors=${lintResult.errorCount}`);
    }

    if (!lintResult.ok && generationPath === 'template') {
      onLog?.('[Route] Template build failed QA; not repaired by a model. Marking needs-review.');
    }

    if (lockText && resolved.promptText) {
      const check = validateLockedText(response.output.compHtml, resolved.promptText);
      if (!check.ok) {
        if (parentVersion) fs.writeFileSync(indexPath, parentVersion.compHtml, 'utf8');
        onLog?.(`[Lock Text] ${check.message}`);
        throw new LockTextError(check.message);
      }
      onLog?.('[Lock Text] Verbatim prompt text verified.');
    }

    const versions = dbService.getVersions(shotId);
    const versionNumber = (versions[0]?.versionNumber || 0) + 1;
    const versionId = crypto.randomUUID();

    const newVersion: ShotVersion = {
      id: versionId,
      shotId: shot.id,
      versionNumber,
      parentVersionId: parentVersion?.id,
      source,
      producingPrompt: editInstruction || producingPrompt,
      compHtml: response.output.compHtml,
      params: {
        ...response.output.params,
        __meta: {
          path: generationPath,
          archetype,
          qa: qaResult ? qaSummary(qaResult) : null,
          timing: templatePlan ? findTimingIssue(templatePlan.params) : null
        }
      },
      paramsSchema: response.output.paramsSchema,
      lintResult,
      provider: response.provider,
      model: response.model,
      tokenUsage: {
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
        estimatedCostUsd: response.estimatedCostUsd
      },
      createdAt: new Date().toISOString()
    };

    dbService.createVersion(newVersion);
    dbService.logLlmCall({
      id: crypto.randomUUID(),
      provider: response.provider,
      model: response.model,
      promptHash: crypto.createHash('sha256').update(context.animationPrompt).digest('hex').substring(0, 10),
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      totalTokens: response.totalTokens,
      latencyMs: response.latencyMs,
      estimatedCostUsd: response.estimatedCostUsd
    });

    onLog?.(`[Gen] Version ${versionNumber} created.`);
    return newVersion;
  }
}

export const generationService = new GenerationService();

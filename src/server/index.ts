import 'dotenv/config';
// Ensure the project .env wins even when GEMINI_MODEL is already set in the parent environment.
{
  const { config } = await import('dotenv');
  config({ override: true, path: '.env' });
}
import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { exec } from 'child_process';
import archiver from 'archiver';
import { LockTextError } from '../common/lock-text.js';
import { dbService } from './db.js';
import { generationService } from './llm/generation-service.js';
import { hyperFramesService } from './hyperframes.js';
import { parseAnimationPrompt } from '../common/prompt-parser.js';
import { BulkImportSchema, OutputMode, ShotVersion, DocumentRecord } from '../common/types.js';
import { TEMPLATES } from '../common/templates.js';
import { globalRateLimiter } from './llm/rate-limiter.js';
import { resolveContext, kitIsEmpty } from '../common/context.js';
import { activeModel, normalizeModelFqdn } from './llm/model-resolver.js';
import { buildShotContext, extractDraftedText, auditLint } from './llm/generation-service.js';
import { renderTemplate } from './templates/render.js';
import { runLayoutQA } from './layout-qa.js';
import { TemplateParamsSchema, applyTimingFix, findTimingIssue } from '../common/archetypes.js';
import { buildSystemPrompt, buildUserPrompt } from './llm/prompt-builder.js';
import { saveUpload, summarizeDocument, prepareForShot } from './documents.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';

// Seed default "Staff India" project and brand tokens if DB is empty
function ensureDefaultProject() {
  const projects = dbService.getProjects();
  if (projects.length === 0) {
    const tokensPath = path.resolve(process.cwd(), 'brand', 'tokens.json');
    let tokens = {};
    if (fs.existsSync(tokensPath)) {
      tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
    }

    const defaultProj = {
      id: 'staff-india',
      name: 'Staff India',
      brandTokens: tokens as any,
      globalNotes: '10 YouTube explainer videos for Staff India channel. Professional, modern, clean SaaS tone.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    dbService.saveProject(defaultProj);
  }
}

async function startServer() {
  ensureDefaultProject();

  const server = fastify({
    logger: {
      level: 'warn'
    },
    bodyLimit: 32 * 1024 * 1024
  });

  await server.register(cors, {
    origin: ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://localhost:3000'],
    credentials: true
  });

  // Serve static rendered outputs
  const outDir = path.resolve(process.cwd(), 'out');
  fs.mkdirSync(outDir, { recursive: true });
  await server.register(fastifyStatic, {
    root: outDir,
    prefix: '/out/'
  });

  // Serve compiled client UI if built
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    await server.register(fastifyStatic, {
      root: distDir,
      prefix: '/',
      decorateReply: false
    });
    server.setNotFoundHandler(async (req, reply) => {
      if (req.raw.url && req.raw.url.startsWith('/api')) {
        return reply.status(404).send({ error: 'Endpoint not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  // Track active renders for progress streaming
  const activeRenders = new Map<string, {
    cancel: () => void;
    listeners: Set<(data: any) => void>;
    lastProgress?: any;
    logs: string[];
    status: 'rendering' | 'completed' | 'cancelled' | 'error';
    outputFile?: string;
    error?: string;
  }>();

  // ---------------- API ROUTES ----------------

  // Session Stats
  server.get('/api/session/stats', async () => {
    return dbService.getSessionStats();
  });

  // Projects
  server.get('/api/projects', async () => {
    return dbService.getProjects();
  });

  server.get('/api/projects/:id', async (req: any, reply) => {
    const p = dbService.getProject(req.params.id);
    if (!p) return reply.status(404).send({ error: 'Project not found' });
    return p;
  });

  server.post('/api/projects', async (req: any) => {
    const proj = {
      id: req.body.id || crypto.randomUUID(),
      name: req.body.name || 'Untitled Project',
      brandTokens: req.body.brandTokens || {},
      globalNotes: req.body.globalNotes || '',
      createdAt: req.body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    dbService.saveProject(proj);
    return proj;
  });

  server.put('/api/projects/:id', async (req: any, reply) => {
    const existing = dbService.getProject(req.params.id);
    if (!existing) return reply.status(404).send({ error: 'Project not found' });
    const updated = { ...existing, ...req.body, id: existing.id, updatedAt: new Date().toISOString() };
    if (updated.brandTokens === null) updated.brandTokens = {};
    dbService.saveProject(updated);
    return updated;
  });

  // Duplicate a project (kit + videos + shots + document metadata/files)
  server.post('/api/projects/:id/duplicate', async (req: any, reply) => {
    const source = dbService.getProject(req.params.id);
    if (!source) return reply.status(404).send({ error: 'Project not found' });
    const newId = crypto.randomUUID();
    const copy = {
      id: newId,
      name: `${source.name} (copy)`,
      brandTokens: JSON.parse(JSON.stringify(source.brandTokens || {})),
      globalNotes: source.globalNotes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    dbService.saveProject(copy);

    for (const video of dbService.getVideos(source.id)) {
      const newVideoId = crypto.randomUUID();
      dbService.saveVideo({ ...video, id: newVideoId, projectId: newId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      for (const shot of dbService.getShots(video.id)) {
        dbService.saveShot({ ...shot, id: crypto.randomUUID(), videoId: newVideoId, currentVersionId: undefined, status: 'draft' as any, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
    }

    for (const doc of dbService.getDocuments({ projectId: source.id })) {
      const newDoc: DocumentRecord = { ...doc, id: crypto.randomUUID(), projectId: newId, createdAt: new Date().toISOString() };
      const dir = path.resolve(process.cwd(), 'projects', newId, 'documents');
      fs.mkdirSync(dir, { recursive: true });
      newDoc.storedPath = path.join(dir, `${newDoc.id}-${path.basename(doc.storedPath)}`);
      try { fs.copyFileSync(doc.storedPath, newDoc.storedPath); } catch (_) { continue; }
      dbService.saveDocument(newDoc);
    }

    return copy;
  });

  // Global settings (not project-scoped)
  server.get('/api/settings', async () => {
    return {
      editingSoftware: dbService.getSetting('editingSoftware') || 'CapCut',
      outputFormat: dbService.getSetting('outputFormat') || 'ProRes 4444 MOV / WebM VP9'
    };
  });

  server.put('/api/settings', async (req: any) => {
    const { editingSoftware, outputFormat } = req.body || {};
    if (editingSoftware !== undefined) dbService.setSetting('editingSoftware', String(editingSoftware));
    if (outputFormat !== undefined) dbService.setSetting('outputFormat', String(outputFormat));
    return {
      editingSoftware: dbService.getSetting('editingSoftware') || 'CapCut',
      outputFormat: dbService.getSetting('outputFormat') || 'ProRes 4444 MOV / WebM VP9'
    };
  });

  // Context documents
  server.get('/api/documents', async (req: any) => {
    return dbService.getDocuments({
      projectId: req.query?.projectId,
      videoId: req.query?.videoId,
      shotId: req.query?.shotId
    });
  });

  server.post('/api/documents', async (req: any, reply) => {
    try {
      const doc = await saveUpload(req.body);
      return doc;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  server.patch('/api/documents/:id', async (req: any, reply) => {
    const doc = dbService.getDocuments({}).find((d) => d.id === req.params.id);
    if (!doc) return reply.status(404).send({ error: 'Document not found' });
    dbService.updateDocument(doc.id, { role: req.body.role, mode: req.body.mode });
    let updated = dbService.getDocuments({}).find((d) => d.id === doc.id)!;
    if (updated.mode === 'Summary' && !updated.summary) {
      await summarizeDocument(updated);
      updated = dbService.getDocuments({}).find((d) => d.id === doc.id)!;
    }
    return updated;
  });

  server.post('/api/documents/:id/summarize', async (req: any, reply) => {
    const doc = dbService.getDocuments({}).find((d) => d.id === req.params.id);
    if (!doc) return reply.status(404).send({ error: 'Document not found' });
    const summary = await summarizeDocument(doc);
    return { ...doc, summary };
  });

  server.delete('/api/documents/:id', async (req: any, reply) => {
    const doc = dbService.deleteDocument(req.params.id);
    if (!doc) return reply.status(404).send({ error: 'Document not found' });
    try { fs.unlinkSync(doc.storedPath); } catch (_) {}
    return { ok: true };
  });

  // Videos
  server.get('/api/projects/:id/videos', async (req: any) => {
    return dbService.getVideos(req.params.id);
  });

  server.post('/api/videos', async (req: any) => {
    const video = req.body;
    dbService.saveVideo(video);
    return video;
  });

  // Shots
  server.get('/api/videos/:id/shots', async (req: any) => {
    return dbService.getShots(req.params.id);
  });

  server.post('/api/shots', async (req: any) => {
    const body = req.body;
    let onScreenText = body.onScreenText || '';
    let duration = body.duration ?? 3;
    let outputMode = body.outputMode || 'overlay-alpha';
    let shotNumber = body.shotNumber || '1.1';

    if (body.animationPrompt) {
      const parsed = parseAnimationPrompt(body.animationPrompt);
      if (parsed.text && (!onScreenText || onScreenText === 'Running a business is already hard enough.')) {
        onScreenText = parsed.text;
      }
      if (parsed.duration) duration = parsed.duration;
      if (parsed.outputMode) outputMode = parsed.outputMode;
      if (parsed.shotId) shotNumber = parsed.shotId;
    }

    const shot = {
      id: body.id || crypto.randomUUID(),
      videoId: body.videoId,
      shotNumber,
      start: body.start ?? 0,
      duration,
      voiceoverLine: body.voiceoverLine || '',
      onScreenText,
      animationPrompt: body.animationPrompt || '',
      shotContext: body.shotContext || '',
      outputMode,
      status: 'draft' as any,
      textSource: (onScreenText ? 'prompt' : '') as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    dbService.saveShot(shot);
    return shot;
  });

  server.put('/api/shots/:id', async (req: any, reply) => {
    const existing = dbService.getShot(req.params.id);
    if (!existing) return reply.status(404).send({ error: 'Shot not found' });
    const updated = { ...existing, ...req.body, updatedAt: new Date().toISOString() };
    dbService.saveShot(updated);
    return updated;
  });

  // Parse prompt endpoint
  server.post('/api/prompt/parse', async (req: any) => {
    const { prompt } = req.body;
    return parseAnimationPrompt(prompt || '');
  });

  // Bulk Import
  server.post('/api/import/bulk', async (req: any, reply) => {
    try {
      const data = BulkImportSchema.parse(req.body);
      const projectId = req.body.projectId || 'staff-india';

      // Save video
      const video = {
        id: data.video.id,
        projectId,
        title: data.video.title,
        contextNotes: 'Bulk imported production sheet',
        orderIndex: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      dbService.saveVideo(video);

      // Save shots
      const createdShots = [];
      let runningTime = 0;
      for (const s of data.shots) {
        const dur = Number(s.duration) || 3;
        const shot = {
          id: crypto.randomUUID(),
          videoId: video.id,
          shotNumber: s.id,
          start: typeof s.time === 'number' ? s.time : runningTime,
          duration: dur,
          voiceoverLine: s.voiceover || '',
          onScreenText: s.onScreenText || '',
          animationPrompt: s.animationPrompt || s.effectNotes || '',
          shotContext: s.role || '',
          outputMode: (s.outputMode || 'overlay-alpha') as OutputMode,
          status: 'draft' as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        dbService.saveShot(shot);
        createdShots.push(shot);
        runningTime += dur;
      }

      return { video, shots: createdShots };
    } catch (err: any) {
      return reply.status(400).send({ error: 'Invalid production-sheet schema', details: err.errors || err.message });
    }
  });

  // Load Demo Shots (Opt-in 4 acceptance test shots)
  server.post('/api/projects/:id/load-demo-shots', async (req: any, reply) => {
    const project = dbService.getProject(req.params.id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    // Create a demo video if none exists
    let videos = dbService.getVideos(project.id);
    let video = videos[0];
    if (!video) {
      video = {
        id: `video-${Date.now()}`,
        projectId: project.id,
        title: 'Staff India - Explainer Video',
        contextNotes: 'Introduction video for Staff India offshore specialists',
        orderIndex: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      dbService.saveVideo(video);
    }

    const demoShots = [
      {
        id: crypto.randomUUID(),
        videoId: video.id,
        shotNumber: '1.1',
        start: 0,
        duration: 3,
        voiceoverLine: '',
        onScreenText: 'Running a business is already hard enough.',
        animationPrompt: 'SHOT 1.1 | 3s | OUTPUT: overlay\nTEXT: Running a business is already hard enough.\nSTYLE: word-by-word kinetic text slam with shake',
        shotContext: 'Hook / Opening statement',
        outputMode: 'overlay-alpha' as OutputMode,
        status: 'draft' as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        videoId: video.id,
        shotNumber: '1.2',
        start: 3,
        duration: 7,
        voiceoverLine: '',
        onScreenText: 'Recruitment / Office Space / Equipment / Admin',
        animationPrompt: 'SHOT 1.2 | 7s | OUTPUT: overlay\nTEXT: Recruitment / Office Space / Equipment / Admin\nSTYLE: strike-checklist pain points sequential strikethrough',
        shotContext: 'Pain points list',
        outputMode: 'overlay-alpha' as OutputMode,
        status: 'draft' as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        videoId: video.id,
        shotNumber: '1.3',
        start: 10,
        duration: 7,
        voiceoverLine: '',
        onScreenText: 'Dedicated Employees / Office Infrastructure / Recruitment Support / Flexible Working Hours',
        animationPrompt: 'SHOT 1.3 | 7s | OUTPUT: overlay\nTEXT: Dedicated Employees / Office Infrastructure / Recruitment Support / Flexible Working Hours\nSTYLE: four icon cards sequential pop-in with floating idle',
        shotContext: 'Solution features',
        outputMode: 'overlay-alpha' as OutputMode,
        status: 'draft' as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        videoId: video.id,
        shotNumber: '1.4',
        start: 17,
        duration: 4,
        voiceoverLine: '',
        onScreenText: 'Visit Staff-India.com | Speak to an Advisor',
        animationPrompt: 'SHOT 1.4 | 4s | 1920x1080 | 30fps | OUTPUT: overlay\nTEXT: Visit Staff-India.com | Speak to an Advisor\nSTYLE: end card logo with CTA button',
        shotContext: 'Outro and Call to Action',
        outputMode: 'overlay-alpha' as OutputMode,
        status: 'draft' as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    for (const s of demoShots) {
      dbService.saveShot(s);
    }

    return { video, shots: demoShots };
  });

  // Test LLM Connection endpoint
  server.get('/api/system/test-llm', async (req: any, reply) => {
    const key = process.env.GEMINI_API_KEY?.trim();
    const activeModelName = activeModel();
    const model = (req.query?.model as string) || activeModelName;
    if (!key) {
      return reply.status(400).send({ ok: false, error: 'GEMINI_API_KEY is missing or empty in .env.' });
    }

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(key);
      const m = genAI.getGenerativeModel({ model });
      const t0 = Date.now();
      const res = await m.generateContent('Respond with only the word: PONG');
      const latency = Date.now() - t0;
      const text = res.response.text().trim();
      const usage = res.response.usageMetadata;

      return {
        ok: true,
        model,
        latency,
        text,
        usage: {
          promptTokens: usage?.promptTokenCount || 0,
          completionTokens: usage?.candidatesTokenCount || 0,
          totalTokens: usage?.totalTokenCount || 0
        }
      };
    } catch (err: any) {
      return reply.status(500).send({ ok: false, error: err.message });
    }
  });

  // List Gemini models from API
  server.get('/api/system/list-models', async (req: any, reply) => {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) {
      return reply.status(400).send({ ok: false, error: 'GEMINI_API_KEY is missing or empty in .env.' });
    }

    try {
      // Use Google REST API to list models
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=50`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        return reply.status(500).send({ ok: false, error: `ListModels API error ${res.status}: ${text}` });
      }
      const json: any = await res.json();
      const models = (json.models || [])
        .filter((m: any) => m.name?.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => ({
          id: m.name.replace('models/', ''),
          displayName: m.displayName || m.name.replace('models/', ''),
          description: m.description || '',
          inputTokenLimit: m.inputTokenLimit,
          outputTokenLimit: m.outputTokenLimit
        }));
      const currentEnvModel = process.env.GEMINI_MODEL || '(none-in-env)';
      return { ok: true, models, current: currentEnvModel, activeModel: activeModel() };
    } catch (err: any) {
      return reply.status(500).send({ ok: false, error: err.message });
    }
  });

  server.get('/api/system/diagnostics', async () => {
    return {
      envModel: process.env.GEMINI_MODEL || '(none-in-env)',
      dbActive: dbService.getSetting('active_model') || null,
      dbNormalized: dbService.getSetting('active_model_normalized') || null,
      fileLimit: parseInt(process.env.FILE_SIZE_LIMIT || '20', 10),
      dotenvOverrideUsed: true,
      activeModel: activeModel()
    };
  });

  // Single source of truth for the active model, resolved as DB setting > .env > default.
  server.get('/api/system/active-model', async () => {
    return { activeModel: activeModel() };
  });

  // Simulate TWO kinds of 429: a rate-limited 429 (short backoff, retried) and a
  // daily-quota 429 (long retryDelay + quotaId containing "PerDay", never retried).
  server.post('/api/system/simulate-429', async (req: any) => {
    const mode = req.body?.mode || 'rate-limit';
    const messages: string[] = [];
    const previous = globalRateLimiter.onStatus;
    globalRateLimiter.onStatus = (msg) => messages.push(msg);
    let calls = 0;
    const started = Date.now();
    let failure: any = null;
    try {
      await globalRateLimiter.execute(async () => {
        calls++;
        if (calls === 1) {
          if (mode === 'quota') {
            const e: any = new Error('429 Quota Exceeded: model quota used up for 1 day (quotaId=gemini-model-max-per-day).');
            e.status = 429;
            e.retryDelay = 86400;
            e.code = 'SERVER_1016';
            e.quotaId = 'gemini-model-max-per-day';
            throw e;
          }
          const e: any = new Error('429 Too Many Requests (simulated)');
          e.status = 429;
          e.retryDelay = 4;
          e.code = 'rate_limit_exceeded';
          throw e;
        }
        return 'ok';
      });
    } catch (err: any) {
      failure = err;
    } finally {
      globalRateLimiter.onStatus = previous;
    }
    if (failure) {
      return {
        ok: true,
        calls,
        elapsedMs: Date.now() - started,
        messages,
        mode,
        error: String(failure.message || failure),
        code: failure.code || null,
        model: activeModel(),
        retried: calls > 1
      };
    }
    return { ok: true, calls, elapsedMs: Date.now() - started, messages, mode, retried: calls > 1 };
  });

  // Set active model (single source of truth: DB setting > env > default).
  server.post('/api/system/set-model', async (req: any, reply) => {
    const { model } = req.body;
    if (!model) return reply.status(400).send({ error: 'model field required' });
    const normalized = normalizeModelFqdn(model);
    process.env.GEMINI_MODEL = normalized;
    dbService.setSetting('active_model', normalized);
    dbService.setSetting('active_model_normalized', model);
    process.env.LLM_ACTIVE_SHORT_MODEL = model;
    return {
      ok: true,
      model: normalized,
      normalized,
      activeModel: activeModel(),
      note: 'Active model persisted to DB. Set GEMINI_MODEL in .env to keep it after a DB reset.'
    };
  });

  // Validate the Lock Text rule against arbitrary composition HTML (preflight)
  server.post('/api/system/validate-lock-text', async (req: any, reply) => {
    const { compHtml, text } = req.body || {};
    if (typeof compHtml !== 'string' || typeof text !== 'string') {
      return reply.status(400).send({ error: 'compHtml and text are required strings' });
    }
    const { validateLockedText } = await import('../common/lock-text.js');
    const result = validateLockedText(compHtml, text);
    if (!result.ok) {
      return reply.status(422).send({ ok: false, error: result.message, message: result.message });
    }
    return { ok: true };
  });

  // Reveal a rendered file in the OS file manager (local-only tool)
  server.post('/api/system/open-folder', async (req: any, reply) => {
    const raw = String(req.body?.path || '');
    if (!raw) return reply.status(400).send({ error: 'path required' });
    const outRoot = path.resolve(process.cwd(), 'out');
    const abs = path.resolve(process.cwd(), raw.replace(/^\/+/, ''));
    if (!abs.startsWith(outRoot)) {
      return reply.status(400).send({ error: 'Refusing to open a path outside the out/ directory' });
    }
    if (!fs.existsSync(abs)) {
      return reply.status(404).send({ error: `File not found: ${abs}` });
    }
    exec(`explorer.exe /select,"${abs}"`);
    return { ok: true, opened: abs };
  });

  // Generation
  server.post('/api/shots/:id/generate', async (req: any, reply) => {
    const shot = dbService.getShot(req.params.id);
    if (!shot) return reply.status(404).send({ error: 'Shot not found' });

    const { prompt, overrideProvider, lockText, promptOnly, includeShot, includeVideo, includeBrandKit, applyKit, documentIds, documentModes } = req.body;
    const video = dbService.getVideo(shot.videoId);
    const project = video ? dbService.getProject(video.projectId) : null;
    if (!video || !project) return reply.status(400).send({ error: 'Shot is missing its video/project' });

    if (prompt !== undefined) shot.animationPrompt = prompt;
    const parsed = parseAnimationPrompt(shot.animationPrompt || '');
    const resolved = resolveContext({
      prompt: shot.animationPrompt || '',
      parsed,
      shot,
      video,
      project,
      options: { promptOnly, includeShot, includeVideo, includeBrandKit, applyKit }
    });

    // Prompt-derived fields are re-derived on every build; stale stored text is cleared.
    shot.onScreenText = resolved.promptText || '';
    shot.textSource = resolved.promptText ? 'prompt' : '';
    shot.duration = resolved.duration;
    shot.outputMode = resolved.outputMode;
    if (applyKit !== undefined) shot.applyKit = Boolean(applyKit);
    if (parsed.shotId) shot.shotNumber = parsed.shotId;
    dbService.saveShot(shot);

    // Per-shot model wins over the global default; template builds never call a model.
    const activeModelName = shot.buildModel || activeModel();
    const logs: string[] = [];
    try {
      globalRateLimiter.onStatus = (msg) => logs.push(msg);
      const version = await generationService.generateShot({
        shotId: shot.id,
        source: 'generate',
        producingPrompt: shot.animationPrompt || '',
        overrideProvider,
        activeModel: activeModelName,
        lockText: Boolean(lockText && resolved.promptText),
        resolved,
        documentIds,
        documentModes,
        buildOptions: { promptOnly, includeShot, includeVideo, includeBrandKit, applyKit },
        onLog: (msg) => logs.push(msg)
      });
      globalRateLimiter.onStatus = undefined;

      const fresh = dbService.getShot(shot.id)!;
      fresh.currentVersionId = version.id;
      fresh.status = version.lintResult.ok ? 'built' : 'needs-review';
      if (!resolved.promptText) {
        fresh.onScreenText = extractDraftedText(version.compHtml);
        fresh.textSource = 'drafted';
      }
      dbService.saveShot(fresh);

      return { version, shot: fresh, resolved, logs };
    } catch (err: any) {
      globalRateLimiter.onStatus = undefined;
      if (err instanceof LockTextError) {
        return reply.status(422).send({ error: err.message, code: err.code, rejected: true });
      }
      if (err?.status === 429 && err?.code === 'SERVER_1016') {
        const text = String(err.message).replace(/.*\(quotaId=[^)]+\)/, '').trim();
        logs.push(`[Quota] Daily free quota used up for ${activeModelName}. ${text}`);
        console.log(`[Quota] (gemini: ${activeModelName}) daily free quota used up. ${text}`);
        return reply.status(429).send({ error: text, code: 'SERVER_1016', quotaUsed: true, model: activeModelName });
      }
      return reply.status(500).send({ error: err.message });
    }
  });

  // Final LLM prompt preview (no API keys)
  server.post('/api/shots/:id/final-prompt', async (req: any, reply) => {
    try {
      const prepared = buildShotContext({
        shotId: req.params.id,
        promptOverride: req.body?.prompt,
        options: req.body?.options,
        documentIds: req.body?.documentIds,
        documentModes: req.body?.documentModes
      });
      const activeModelName = activeModel();
      return {
        systemPrompt: buildSystemPrompt(prepared.resolved.brandKit),
        userPrompt: buildUserPrompt(prepared.context),
        kitApplied: prepared.resolved.kitApplied,
        textSource: prepared.resolved.textSource,
        stale: prepared.resolved.stale,
        documents: prepared.prepared.documents.map((d) => ({ name: d.name, mode: d.mode, scope: d.scope })),
        attachments: prepared.prepared.attachments.map((a) => a.name),
        totalTokens: prepared.prepared.totalTokens,
        activeModel: activeModelName
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Edit Prompt
  server.post('/api/shots/:id/edit', async (req: any, reply) => {
    const shot = dbService.getShot(req.params.id);
    if (!shot) return reply.status(404).send({ error: 'Shot not found' });

    const { editInstruction, manualDiff, overrideProvider, promptOnly, includeShot, includeVideo, includeBrandKit, applyKit, documentIds, documentModes } = req.body;
    if (!editInstruction) return reply.status(400).send({ error: 'Missing editInstruction' });

    const activeModelName = activeModel();
    const prevVersion = shot.currentVersionId ? dbService.getVersion(shot.currentVersionId) : null;

    try {
      const logs: string[] = [];
      const version = await generationService.generateShot({
        shotId: shot.id,
        source: 'edit-prompt',
        producingPrompt: shot.animationPrompt,
        editInstruction,
        manualDiff,
        overrideProvider,
        activeModel: activeModelName,
        documentIds,
        documentModes,
        buildOptions: { promptOnly, includeShot, includeVideo, includeBrandKit, applyKit },
        onLog: (msg) => logs.push(msg)
      });

      shot.currentVersionId = version.id;
      shot.status = version.lintResult.ok ? 'built' : 'needs-review';
      dbService.saveShot(shot);

      const changedParams: Record<string, { before: any; after: any }> = {};
      if (prevVersion) {
        for (const [k, v] of Object.entries(version.params)) {
          if (JSON.stringify(v) !== JSON.stringify(prevVersion.params?.[k])) {
            changedParams[k] = { before: prevVersion.params?.[k], after: v };
          }
        }
      }

      const hasChanges = Object.keys(changedParams).length > 0 || (prevVersion ? prevVersion.compHtml !== version.compHtml : true);

      return { version, shot, prevVersionId: prevVersion?.id, changedParams, hasChanges, logs };
    } catch (err: any) {
      if (err?.status === 429 && err?.code === 'SERVER_1016') {
        const text = String(err.message).replace(/.*\(quotaId=[^)]+\)/, '').trim();
        return reply.status(429).send({ error: text, code: 'SERVER_1016', quotaUsed: true, model: activeModelName });
      }
      return reply.status(500).send({ error: err.message });
    }
  });

  // Repair with AI (Feed lint errors back to provider)
  server.post('/api/shots/:id/repair', async (req: any, reply) => {
    const shot = dbService.getShot(req.params.id);
    if (!shot) return reply.status(404).send({ error: 'Shot not found' });
    if (!shot.currentVersionId) return reply.status(400).send({ error: 'No version to repair' });

    const activeModelName = activeModel();
    const currentVersion = dbService.getVersion(shot.currentVersionId);
    if (!currentVersion) return reply.status(404).send({ error: 'Version not found' });

    try {
      const logs: string[] = [];
      const version = await generationService.generateShot({
        shotId: shot.id,
        source: 'repair',
        producingPrompt: shot.animationPrompt,
        activeModel: activeModelName,
        onLog: (msg) => logs.push(msg)
      });

      shot.currentVersionId = version.id;
      shot.status = version.lintResult.ok ? 'built' : 'needs-review';
      dbService.saveShot(shot);

      return { version, shot, logs };
    } catch (err: any) {
      if (err?.status === 429 && err?.code === 'SERVER_1016') {
        const text = String(err.message).replace(/.*\(quotaId=[^)]+\)/, '').trim();
        return reply.status(429).send({ error: text, code: 'SERVER_1016', quotaUsed: true, model: activeModelName });
      }
      return reply.status(500).send({ error: err.message });
    }
  });

  // Manual Params Update (Zero LLM calls)
  server.post('/api/shots/:id/manual-params', async (req: any, reply) => {
    const shot = dbService.getShot(req.params.id);
    if (!shot) return reply.status(404).send({ error: 'Shot not found' });
    if (!shot.currentVersionId) return reply.status(400).send({ error: 'No active version to update' });

    const currentVersion = dbService.getVersion(shot.currentVersionId);
    if (!currentVersion) return reply.status(404).send({ error: 'Version not found' });

    const newParams = { ...currentVersion.params, ...req.body.params };

    // Update CSS variables or injected params in compHtml
    let updatedHtml = currentVersion.compHtml;

    // Update CSS variables if present
    for (const [key, val] of Object.entries(newParams)) {
      // replace :root { ... --key: old; ... } or --key: old;
      const cssVarRegex = new RegExp(`(--${key}\\s*:\\s*)([^;]+)(;)`, 'g');
      if (cssVarRegex.test(updatedHtml)) {
        updatedHtml = updatedHtml.replace(cssVarRegex, `$1${val}$3`);
      }
    }

    const versions = dbService.getVersions(shot.id);
    const nextVerNum = (versions[0]?.versionNumber || 0) + 1;
    const newVersion: ShotVersion = {
      id: crypto.randomUUID(),
      shotId: shot.id,
      versionNumber: nextVerNum,
      parentVersionId: currentVersion.id,
      source: 'manual-params',
      producingPrompt: 'Manual parameter adjustment',
      compHtml: updatedHtml,
      params: newParams,
      paramsSchema: currentVersion.paramsSchema,
      lintResult: currentVersion.lintResult,
      provider: 'manual',
      model: 'none',
      createdAt: new Date().toISOString()
    };

    dbService.createVersion(newVersion);
    return newVersion;
  });

  // Manual Code Update
  server.post('/api/shots/:id/manual-code', async (req: any, reply) => {
    const shot = dbService.getShot(req.params.id);
    if (!shot) return reply.status(404).send({ error: 'Shot not found' });
    const { compHtml } = req.body;
    if (!compHtml) return reply.status(400).send({ error: 'Missing compHtml' });

    const currentVersion = shot.currentVersionId ? dbService.getVersion(shot.currentVersionId) : null;

    // Write to shotDir and lint
    const video = dbService.getVideo(shot.videoId);
    const cleanVid = video ? video.id.replace(/[^a-zA-Z0-9_-]/g, '_') : 'default';
    const cleanShot = shot.shotNumber.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const shotDir = path.resolve(process.cwd(), 'shots', cleanVid, cleanShot);
    fs.mkdirSync(shotDir, { recursive: true });
    fs.writeFileSync(path.join(shotDir, 'index.html'), compHtml, 'utf8');

    const lintResult = auditLint(compHtml, await hyperFramesService.lintComposition(shotDir), shotDir);

    const versions = dbService.getVersions(shot.id);
    const nextVerNum = (versions[0]?.versionNumber || 0) + 1;
    const newVersion: ShotVersion = {
      id: crypto.randomUUID(),
      shotId: shot.id,
      versionNumber: nextVerNum,
      parentVersionId: currentVersion?.id,
      source: 'manual-code',
      producingPrompt: 'Manual Monaco code edit',
      compHtml,
      params: currentVersion?.params || {},
      paramsSchema: currentVersion?.paramsSchema || [],
      lintResult,
      provider: 'manual',
      model: 'none',
      createdAt: new Date().toISOString()
    };

    dbService.createVersion(newVersion);
    return newVersion;
  });

  // Versions history & restore
  server.get('/api/shots/:id/versions', async (req: any) => {
    return dbService.getVersions(req.params.id);
  });

  server.post('/api/shots/:id/restore-version', async (req: any, reply) => {
    const shot = dbService.getShot(req.params.id);
    if (!shot) return reply.status(404).send({ error: 'Shot not found' });
    const { versionId } = req.body;
    const target = dbService.getVersion(versionId);
    if (!target) return reply.status(404).send({ error: 'Version not found' });

    shot.currentVersionId = target.id;
    shot.status = target.lintResult.ok ? 'built' : 'needs-review';
    dbService.saveShot(shot);

    return { restored: target };
  });

  // One-click timing fix for template builds: pushes fade-out past the last animation.
  server.post('/api/shots/:id/fix-timing', async (req: any, reply) => {
    const shot = dbService.getShot(req.params.id);
    if (!shot || !shot.currentVersionId) return reply.status(404).send({ error: 'Shot not built yet' });
    const version = dbService.getVersion(shot.currentVersionId);
    if (!version) return reply.status(404).send({ error: 'Version not found' });

    const meta = (version.params as any)?.__meta;
    if (!meta || meta.path !== 'template' || meta.archetype === 'custom') {
      return reply.status(400).send({ error: 'Timing fix only applies to template builds' });
    }

    const parsed = TemplateParamsSchema.safeParse(version.params);
    if (!parsed.success) return reply.status(400).send({ error: 'Stored params are not template params' });
    const issue = findTimingIssue(parsed.data);
    if (!issue) return { changed: false, params: parsed.data, message: 'Timing already valid' };

    const fixed = applyTimingFix(parsed.data);
    const html = renderTemplate(meta.archetype, fixed);

    const video = dbService.getVideo(shot.videoId);
    const cleanVid = (video?.id || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanShot = shot.shotNumber.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const shotDir = path.resolve(process.cwd(), 'shots', cleanVid, cleanShot);
    fs.mkdirSync(path.join(shotDir, 'assets'), { recursive: true });
    const gsapSrc = path.resolve(process.cwd(), 'node_modules', 'gsap', 'dist', 'gsap.min.js');
    const gsapDest = path.join(shotDir, 'assets', 'gsap.min.js');
    if (fs.existsSync(gsapSrc) && !fs.existsSync(gsapDest)) fs.copyFileSync(gsapSrc, gsapDest);

    fs.writeFileSync(path.join(shotDir, 'index.html'), html, 'utf8');
    fs.writeFileSync(path.join(shotDir, 'params.json'), JSON.stringify(fixed, null, 2), 'utf8');

    let lintResult = auditLint(html, await hyperFramesService.lintComposition(shotDir), shotDir);
    try {
      const qa = await runLayoutQA({
        shotDir,
        beatTimes: fixed.items.map((i) => i.start),
        expectedTexts: fixed.items.map((i) => i.text),
        expectedItems: fixed.items.map((i) => ({ text: i.text, start: i.start })),
        holdEnd: fixed.fadeOutAt,
        duration: fixed.duration
      });
      if (!qa.ok) {
        lintResult = {
          ...lintResult,
          ok: false,
          errorCount: lintResult.errorCount + qa.findings.length,
          findings: [...lintResult.findings, ...qa.findings]
        };
      }
    } catch (_) {}

    const versions = dbService.getVersions(shot.id);
    const newVersion: ShotVersion = {
      id: crypto.randomUUID(),
      shotId: shot.id,
      versionNumber: (versions[0]?.versionNumber || 0) + 1,
      parentVersionId: version.id,
      source: 'manual-params',
      producingPrompt: 'Fix timing (template params)',
      compHtml: html,
      params: { ...fixed, __meta: { ...meta, path: 'template', timing: findTimingIssue(fixed) } },
      paramsSchema: version.paramsSchema,
      lintResult,
      provider: 'template',
      model: `template:${meta.archetype}`,
      createdAt: new Date().toISOString()
    };
    dbService.createVersion(newVersion);

    const fresh = dbService.getShot(shot.id)!;
    fresh.currentVersionId = newVersion.id;
    fresh.duration = fixed.duration;
    fresh.status = lintResult.ok ? 'built' : 'needs-review';
    dbService.saveShot(fresh);

    return { changed: true, message: issue.message, params: fixed, version: newVersion, shot: fresh };
  });

  // Per-shot build model (global default applies when unset).
  server.put('/api/shots/:id/build-model', async (req: any, reply) => {
    const shot = dbService.getShot(req.params.id);
    if (!shot) return reply.status(404).send({ error: 'Shot not found' });
    const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
    shot.buildModel = model || undefined;
    dbService.saveShot(shot);
    return { shot };
  });

  // Preview endpoint serving sandboxed frame with no-network CSP
  server.get('/preview-frame/:shotId', async (req: any, reply) => {
    const shot = dbService.getShot(req.params.shotId);
    if (!shot || !shot.currentVersionId) {
      return reply.type('text/html').send(`<html><body style="background:#0B0F19;color:#64748B;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;"><h3>No version generated yet</h3></body></html>`);
    }

    const version = dbService.getVersion(shot.currentVersionId);
    if (!version) {
      return reply.type('text/html').send(`<html><body style="background:#0B0F19;color:#EF4444;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;"><h3>Version missing</h3></body></html>`);
    }

    // Embed scrubber bridge script for parent window control
    const bridgeScript = `
      <script>
        window.addEventListener('message', (event) => {
          if (!event.data) return;
          const { type, time } = event.data;
          const tl = window.__timelines ? window.__timelines["main"] : null;
          if (type === 'SEEK' && typeof time === 'number') {
            if (tl) {
              tl.pause();
              tl.seek(time);
            }
          } else if (type === 'PLAY') {
            if (tl) tl.play();
          } else if (type === 'PAUSE') {
            if (tl) tl.pause();
          }
        });
      </script>
    `;

    let html = version.compHtml;

    // Relative asset URLs (e.g. "assets/gsap.min.js") in the composition must
    // resolve against the shot's asset route, not against /preview-frame/<shotId>.
    const baseTag = `<base href="/preview-frame/${shot.id}/">`;
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>\n    ${baseTag}`);
    } else {
      html = baseTag + html;
    }

    // Inject preview canvas background (checkerboard, dark, light, green)
    const bgMode = (req.query as any)?.bg || 'checker';
    let bgStyle = '';
    if (bgMode === 'checker') {
      bgStyle = `
        <style id="preview-bg-style">
          html, body {
            background-color: #0B0F19 !important;
            background-image: 
              linear-gradient(45deg, #161F30 25%, transparent 25%),
              linear-gradient(-45deg, #161F30 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #161F30 75%),
              linear-gradient(-45deg, transparent 75%, #161F30 75%) !important;
            background-size: 32px 32px !important;
            background-position: 0 0, 0 16px, 16px -16px, -16px 0px !important;
          }
        </style>
      `;
    } else if (bgMode === 'dark') {
      bgStyle = `<style id="preview-bg-style">html, body { background-color: #070A11 !important; }</style>`;
    } else if (bgMode === 'light') {
      bgStyle = `<style id="preview-bg-style">html, body { background-color: #F8FAFC !important; color: #0F172A; }</style>`;
    } else if (bgMode === 'green') {
      bgStyle = `<style id="preview-bg-style">html, body { background-color: #00FF00 !important; }</style>`;
    }

    if (html.includes('</head>')) {
      html = html.replace('</head>', `${bgStyle}</head>`);
    } else {
      html = bgStyle + html;
    }

    if (html.includes('</body>')) {
      html = html.replace('</body>', `${bridgeScript}</body>`);
    } else {
      html += bridgeScript;
    }

    // Set CSP blocking all network fetches except inline scripts and fonts
    reply.header('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https://cdn.jsdelivr.net;");
    reply.type('text/html');
    return html;
  });

  // Serve a shot's local assets to the preview iframe (GSAP, fonts, images).
  // Compositions store relative paths so the HyperFrames CLI can render from the
  // shot directory; the preview needs an HTTP route for those same paths.
  server.get('/preview-frame/:shotId/assets/*', async (req: any, reply) => {
    const shot = dbService.getShot(req.params.shotId);
    if (!shot) return reply.status(404).send({ error: 'Shot not found' });
    const video = dbService.getVideo(shot.videoId);
    if (!video) return reply.status(404).send({ error: 'Video not found' });

    const cleanVid = video.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanShot = shot.shotNumber.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const assetsDir = path.resolve(process.cwd(), 'shots', cleanVid, cleanShot, 'assets');

    const rel = String(req.params['*'] || '');
    const filePath = path.resolve(assetsDir, rel);
    const withinAssets = filePath === assetsDir || filePath.startsWith(assetsDir + path.sep);
    if (!withinAssets || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return reply.status(404).send({ error: 'Asset not found' });
    }

    const types: Record<string, string> = {
      '.js': 'application/javascript; charset=utf-8',
      '.mjs': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.otf': 'font/otf',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm'
    };
    reply.type(types[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    return reply.send(fs.createReadStream(filePath));
  });

  // Render Shot
  server.post('/api/shots/:id/render', async (req: any, reply) => {
    const shot = dbService.getShot(req.params.id);
    if (!shot) return reply.status(404).send({ error: 'Shot not found' });
    if (!shot.currentVersionId) return reply.status(400).send({ error: 'Shot must be built before rendering' });

    const version = dbService.getVersion(shot.currentVersionId);
    if (!version) return reply.status(400).send({ error: 'Shot version not found' });

    // One render at a time: renders starve each other on a local machine.
    const inFlight = [...activeRenders.values()].find((r) => r.status === 'rendering');
    if (inFlight) {
      return reply.status(409).send({ error: 'Another render is already in progress. Wait for it to finish or cancel it first.' });
    }

    const video = dbService.getVideo(shot.videoId);
    const proj = video ? dbService.getProject(video.projectId) : null;

    // renderFormat: 'mov' | 'webm' | 'mp4-chroma' | 'mp4-full' (optional, defaults by outputMode)
    const renderFormat: 'mov' | 'webm' | 'mp4-chroma' | 'mp4-full' | undefined = req.body?.renderFormat;

    const cleanProj = (proj?.id || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanVid = (video?.id || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanShot = shot.shotNumber.replace(/[^a-zA-Z0-9_.-]/g, '_');

    // Determine file extension from requested format
    let ext = 'mp4';
    if (renderFormat === 'mov' || (!renderFormat && shot.outputMode === 'overlay-alpha')) ext = 'mov';
    else if (renderFormat === 'webm') ext = 'webm';
    // mp4-chroma and mp4-full → mp4; add suffix to distinguish
    const suffix = renderFormat === 'mp4-chroma' ? '-chroma' : renderFormat === 'mp4-full' ? '-full' : '';

    const shotDir = path.resolve(process.cwd(), 'shots', cleanVid, cleanShot);
    fs.mkdirSync(shotDir, { recursive: true });
    // Only rewrite when the content actually changed. Rewriting on every render
    // would make the cached ProRes alpha master look stale.
    const indexPath = path.join(shotDir, 'index.html');
    if (!fs.existsSync(indexPath) || fs.readFileSync(indexPath, 'utf8') !== version.compHtml) {
      fs.writeFileSync(indexPath, version.compHtml, 'utf8');
    }
    const paramsPath = path.join(shotDir, 'params.json');
    const paramsJson = JSON.stringify(version.params, null, 2);
    if (!fs.existsSync(paramsPath) || fs.readFileSync(paramsPath, 'utf8') !== paramsJson) {
      fs.writeFileSync(paramsPath, paramsJson, 'utf8');
    }

    const outputFile = path.resolve(process.cwd(), 'out', cleanProj, cleanVid, `${cleanShot}${suffix}.${ext}`);

    const renderId = crypto.randomUUID();
    const logs: string[] = [];
    const listeners = new Set<(data: any) => void>();

    const broadcast = (data: any) => {
      for (const listener of listeners) {
        try { listener(data); } catch (_) {}
      }
    };

    const renderJob = hyperFramesService.renderComposition({
      shotDir,
      outputFile,
      mode: shot.outputMode,
      renderFormat,
      fps: 30,
      onProgress: (p) => {
        const renderData = activeRenders.get(renderId);
        if (renderData) renderData.lastProgress = p;
        broadcast({ type: 'progress', progress: p });
      },
      onLog: (line) => {
        logs.push(line);
        broadcast({ type: 'log', line });
      }
    });

    activeRenders.set(renderId, {
      cancel: renderJob.cancel,
      listeners,
      logs,
      status: 'rendering',
      outputFile
    });

    // Run in background and update DB when done
    renderJob.promise.then(() => {
      const r = activeRenders.get(renderId);
      if (r) r.status = 'completed';
      shot.status = 'rendered';
      dbService.saveShot(shot);
      broadcast({ type: 'complete', outputFile: `/out/${cleanProj}/${cleanVid}/${cleanShot}${suffix}.${ext}` });
    }).catch((err) => {
      const r = activeRenders.get(renderId);
      if (r) {
        r.status = 'error';
        r.error = err.message;
      }
      broadcast({ type: 'error', error: err.message });
    });

    return { renderId, outputFile: `/out/${cleanProj}/${cleanVid}/${cleanShot}${suffix}.${ext}` };
  });

  // SSE progress endpoint
  server.get('/api/renders/:id/events', async (req: any, reply) => {
    const render = activeRenders.get(req.params.id);
    if (!render) return reply.status(404).send({ error: 'Render job not found' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const sendEvent = (data: any) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send initial status
    sendEvent({ type: 'status', status: render.status, lastProgress: render.lastProgress });

    render.listeners.add(sendEvent);

    req.raw.on('close', () => {
      render.listeners.delete(sendEvent);
    });
  });

  // Cancel render
  server.post('/api/renders/:id/cancel', async (req: any, reply) => {
    const render = activeRenders.get(req.params.id);
    if (!render) return reply.status(404).send({ error: 'Render job not found' });
    render.cancel();
    render.status = 'cancelled';
    return { success: true };
  });

  // Export video timeline JSON
  server.get('/api/videos/:id/export/timeline', async (req: any, reply) => {
    const video = dbService.getVideo(req.params.id);
    if (!video) return reply.status(404).send({ error: 'Video not found' });
    const shots = dbService.getShots(video.id);
    const proj = dbService.getProject(video.projectId);

    const timelineData = {
      project: proj?.name || 'Staff India',
      video: video.title,
      totalDuration: shots.reduce((acc, s) => acc + s.duration, 0),
      shots: shots.map(s => ({
        id: s.id,
        shotNumber: s.shotNumber,
        start: s.start,
        end: s.start + s.duration,
        duration: s.duration,
        onScreenText: s.onScreenText,
        voiceoverLine: s.voiceoverLine,
        status: s.status,
        outputMode: s.outputMode,
        file: `/out/${proj?.id || 'default'}/${video.id}/${s.shotNumber}.${s.outputMode === 'overlay-alpha' ? 'mov' : 'mp4'}`
      }))
    };

    return timelineData;
  });

  // Export video renders ZIP
  server.get('/api/videos/:id/export/zip', async (req: any, reply) => {
    const video = dbService.getVideo(req.params.id);
    if (!video) return reply.status(404).send({ error: 'Video not found' });
    const proj = dbService.getProject(video.projectId);
    const cleanProj = (proj?.id || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanVid = video.id.replace(/[^a-zA-Z0-9_-]/g, '_');

    const videoOutDir = path.resolve(process.cwd(), 'out', cleanProj, cleanVid);
    if (!fs.existsSync(videoOutDir)) {
      return reply.status(400).send({ error: 'No renders found for this video' });
    }

    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${cleanVid}_renders.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(reply.raw);
    archive.directory(videoOutDir, false);
    await archive.finalize();
  });

  // Templates list
  server.get('/api/templates', async () => {
    return Object.values(TEMPLATES).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      defaultDuration: t.defaultDuration,
      paramsSchema: t.paramsSchema,
      defaultParams: t.defaultParams
    }));
  });

  // Listen strictly on 127.0.0.1
  await server.listen({ port: PORT, host: HOST });
  console.log(`[Motion Lab] Backend running strictly on http://${HOST}:${PORT} (pid ${process.pid})`);
  console.log(`[Motion Lab] Active model: ${activeModel()} (env GEMINI_MODEL=${process.env.GEMINI_MODEL || '(unset)'}, db=${dbService.getSetting('active_model') || '(unset)'})`);
}

startServer().catch(err => {
  console.error('[Motion Lab Server Error]', err);
  process.exit(1);
});

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Project, Video, Shot, ShotVersion, ProjectBrandTokens, DocumentRecord } from '../common/types.js';

const DB_PATH = path.resolve(process.cwd(), 'motion-lab.sqlite');

export class DatabaseService {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.initTables();
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        brand_tokens TEXT NOT NULL,
        global_notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        context_notes TEXT NOT NULL DEFAULT '',
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS shots (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        shot_number TEXT NOT NULL,
        start REAL NOT NULL DEFAULT 0,
        duration REAL NOT NULL DEFAULT 3,
        voiceover_line TEXT NOT NULL DEFAULT '',
        on_screen_text TEXT NOT NULL DEFAULT '',
        animation_prompt TEXT NOT NULL DEFAULT '',
        shot_context TEXT NOT NULL DEFAULT '',
        output_mode TEXT NOT NULL DEFAULT 'overlay-alpha',
        status TEXT NOT NULL DEFAULT 'draft',
        current_version_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY,
        shot_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        parent_version_id TEXT,
        source TEXT NOT NULL,
        producing_prompt TEXT NOT NULL DEFAULT '',
        comp_html TEXT NOT NULL,
        params TEXT NOT NULL DEFAULT '{}',
        params_schema TEXT NOT NULL DEFAULT '[]',
        lint_result TEXT NOT NULL DEFAULT '{"ok":true,"errorCount":0,"warningCount":0,"infoCount":0,"findings":[]}',
        provider TEXT NOT NULL DEFAULT 'manual',
        model TEXT NOT NULL DEFAULT 'none',
        token_usage TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (shot_id) REFERENCES shots(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        video_id TEXT,
        shot_id TEXT,
        name TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'PROJECT',
        type TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL DEFAULT 'REFERENCE',
        mode TEXT NOT NULL DEFAULT 'Summary',
        summary TEXT,
        token_estimate INTEGER NOT NULL DEFAULT 0,
        stored_path TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS llm_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_hash TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        latency_ms INTEGER NOT NULL DEFAULT 0,
        estimated_cost_usd REAL NOT NULL DEFAULT 0
      );
    `);

    // Forward-compatible column additions for existing databases.
    for (const [table, column, ddl] of [
      ['shots', 'text_source', "TEXT NOT NULL DEFAULT ''"],
      ['shots', 'apply_kit', 'INTEGER'],
      ['shots', 'build_model', 'TEXT']
    ] as const) {
      const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as any[];
      if (!cols.some((c) => c.name === column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
      }
    }
  }

  // Projects
  getProjects(): Project[] {
    const rows = this.db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      brandTokens: JSON.parse(r.brand_tokens),
      globalNotes: r.global_notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  getProject(id: string): Project | null {
    const r = this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      brandTokens: JSON.parse(r.brand_tokens),
      globalNotes: r.global_notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  saveProject(project: Project): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO projects (id, name, brand_tokens, global_notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        brand_tokens = excluded.brand_tokens,
        global_notes = excluded.global_notes,
        updated_at = excluded.updated_at
    `).run(
      project.id,
      project.name,
      JSON.stringify(project.brandTokens),
      project.globalNotes || '',
      project.createdAt || now,
      now
    );
  }

  // Videos
  getVideos(projectId: string): Video[] {
    const rows = this.db.prepare(`SELECT * FROM videos WHERE project_id = ? ORDER BY order_index ASC, created_at ASC`).all(projectId) as any[];
    return rows.map(r => ({
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      contextNotes: r.context_notes,
      orderIndex: r.order_index,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  getVideo(id: string): Video | null {
    const r = this.db.prepare(`SELECT * FROM videos WHERE id = ?`).get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      contextNotes: r.context_notes,
      orderIndex: r.order_index,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  saveVideo(video: Video): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO videos (id, project_id, title, context_notes, order_index, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        context_notes = excluded.context_notes,
        order_index = excluded.order_index,
        updated_at = excluded.updated_at
    `).run(
      video.id,
      video.projectId,
      video.title,
      video.contextNotes || '',
      video.orderIndex ?? 0,
      video.createdAt || now,
      now
    );
  }

  // Shots
  getShots(videoId: string): Shot[] {
    const rows = this.db.prepare(`SELECT * FROM shots WHERE video_id = ? ORDER BY start ASC, shot_number ASC`).all(videoId) as any[];
    return rows.map(r => ({
      id: r.id,
      videoId: r.video_id,
      shotNumber: r.shot_number,
      start: r.start,
      duration: r.duration,
      voiceoverLine: r.voiceover_line,
      onScreenText: r.on_screen_text,
      animationPrompt: r.animation_prompt,
      shotContext: r.shot_context,
      outputMode: r.output_mode,
      status: r.status,
      textSource: r.text_source || '',
      applyKit: r.apply_kit === null || r.apply_kit === undefined ? undefined : Boolean(r.apply_kit),
      buildModel: r.build_model || undefined,
      currentVersionId: r.current_version_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  getShot(id: string): Shot | null {
    const r = this.db.prepare(`SELECT * FROM shots WHERE id = ?`).get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      videoId: r.video_id,
      shotNumber: r.shot_number,
      start: r.start,
      duration: r.duration,
      voiceoverLine: r.voiceover_line,
      onScreenText: r.on_screen_text,
      animationPrompt: r.animation_prompt,
      shotContext: r.shot_context,
      outputMode: r.output_mode,
      status: r.status,
      textSource: r.text_source || '',
      applyKit: r.apply_kit === null || r.apply_kit === undefined ? undefined : Boolean(r.apply_kit),
      buildModel: r.build_model || undefined,
      currentVersionId: r.current_version_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  saveShot(shot: Shot): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO shots (id, video_id, shot_number, start, duration, voiceover_line, on_screen_text, animation_prompt, shot_context, output_mode, status, text_source, apply_kit, build_model, current_version_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        shot_number = excluded.shot_number,
        start = excluded.start,
        duration = excluded.duration,
        voiceover_line = excluded.voiceover_line,
        on_screen_text = excluded.on_screen_text,
        animation_prompt = excluded.animation_prompt,
        shot_context = excluded.shot_context,
        output_mode = excluded.output_mode,
        status = excluded.status,
        text_source = excluded.text_source,
        apply_kit = excluded.apply_kit,
        build_model = excluded.build_model,
        current_version_id = excluded.current_version_id,
        updated_at = excluded.updated_at
    `).run(
      shot.id,
      shot.videoId,
      shot.shotNumber,
      shot.start,
      shot.duration,
      shot.voiceoverLine || '',
      shot.onScreenText || '',
      shot.animationPrompt || '',
      shot.shotContext || '',
      shot.outputMode || 'overlay-alpha',
      shot.status || 'draft',
      shot.textSource || '',
      shot.applyKit === undefined ? null : shot.applyKit ? 1 : 0,
      shot.buildModel || null,
      shot.currentVersionId || null,
      shot.createdAt || now,
      now
    );
  }

  // Versions
  getVersions(shotId: string): ShotVersion[] {
    const rows = this.db.prepare(`SELECT * FROM versions WHERE shot_id = ? ORDER BY version_number DESC`).all(shotId) as any[];
    return rows.map(r => ({
      id: r.id,
      shotId: r.shot_id,
      versionNumber: r.version_number,
      parentVersionId: r.parent_version_id,
      source: r.source,
      producingPrompt: r.producing_prompt,
      compHtml: r.comp_html,
      params: JSON.parse(r.params || '{}'),
      paramsSchema: JSON.parse(r.params_schema || '[]'),
      lintResult: JSON.parse(r.lint_result || '{"ok":true,"errorCount":0,"warningCount":0,"infoCount":0,"findings":[]}'),
      provider: r.provider,
      model: r.model,
      tokenUsage: r.token_usage ? JSON.parse(r.token_usage) : undefined,
      createdAt: r.created_at
    }));
  }

  getVersion(id: string): ShotVersion | null {
    const r = this.db.prepare(`SELECT * FROM versions WHERE id = ?`).get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      shotId: r.shot_id,
      versionNumber: r.version_number,
      parentVersionId: r.parent_version_id,
      source: r.source,
      producingPrompt: r.producing_prompt,
      compHtml: r.comp_html,
      params: JSON.parse(r.params || '{}'),
      paramsSchema: JSON.parse(r.params_schema || '[]'),
      lintResult: JSON.parse(r.lint_result || '{"ok":true,"errorCount":0,"warningCount":0,"infoCount":0,"findings":[]}'),
      provider: r.provider,
      model: r.model,
      tokenUsage: r.token_usage ? JSON.parse(r.token_usage) : undefined,
      createdAt: r.created_at
    };
  }

  createVersion(version: ShotVersion): void {
    this.db.prepare(`
      INSERT INTO versions (id, shot_id, version_number, parent_version_id, source, producing_prompt, comp_html, params, params_schema, lint_result, provider, model, token_usage, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      version.id,
      version.shotId,
      version.versionNumber,
      version.parentVersionId || null,
      version.source,
      version.producingPrompt || '',
      version.compHtml,
      JSON.stringify(version.params || {}),
      JSON.stringify(version.paramsSchema || []),
      JSON.stringify(version.lintResult || { ok: true, errorCount: 0, warningCount: 0, infoCount: 0, findings: [] }),
      version.provider,
      version.model,
      version.tokenUsage ? JSON.stringify(version.tokenUsage) : null,
      version.createdAt || new Date().toISOString()
    );

    // Update shot current_version_id and status
    this.db.prepare(`
      UPDATE shots SET current_version_id = ?, status = ?, updated_at = ? WHERE id = ?
    `).run(
      version.id,
      version.lintResult.ok ? 'built' : 'needs-review',
      new Date().toISOString(),
      version.shotId
    );
  }

  // LLM Logs & Counters
  logLlmCall(data: {
    id: string;
    provider: string;
    model: string;
    promptHash: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    estimatedCostUsd: number;
  }) {
    this.db.prepare(`
      INSERT INTO llm_logs (id, timestamp, provider, model, prompt_hash, prompt_tokens, completion_tokens, total_tokens, latency_ms, estimated_cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      new Date().toISOString(),
      data.provider,
      data.model,
      data.promptHash,
      data.promptTokens,
      data.completionTokens,
      data.totalTokens,
      data.latencyMs,
      data.estimatedCostUsd
    );
  }

  clearLlmLogs() {
    this.db.prepare('DELETE FROM llm_logs').run();
  }

  // Documents & settings
  getDocuments(filter: { projectId?: string; videoId?: string; shotId?: string }): DocumentRecord[] {
    const clauses: string[] = [];
    const params: any[] = [];
    if (filter.projectId) { clauses.push('project_id = ?'); params.push(filter.projectId); }
    if (filter.videoId) { clauses.push('video_id = ?'); params.push(filter.videoId); }
    if (filter.shotId) { clauses.push('shot_id = ?'); params.push(filter.shotId); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM documents ${where} ORDER BY created_at ASC`).all(...params) as any[];
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      videoId: r.video_id,
      shotId: r.shot_id,
      name: r.name,
      scope: r.scope,
      type: r.type,
      size: r.size,
      role: r.role,
      mode: r.mode,
      summary: r.summary,
      tokenEstimate: r.token_estimate,
      storedPath: r.stored_path,
      createdAt: r.created_at
    }));
  }

  saveDocument(doc: DocumentRecord): void {
    this.db.prepare(`
      INSERT INTO documents (id, project_id, video_id, shot_id, name, scope, type, size, role, mode, summary, token_estimate, stored_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, scope = excluded.scope, type = excluded.type, size = excluded.size,
        role = excluded.role, mode = excluded.mode, summary = excluded.summary,
        token_estimate = excluded.token_estimate, stored_path = excluded.stored_path
    `).run(
      doc.id, doc.projectId, doc.videoId, doc.shotId, doc.name, doc.scope, doc.type, doc.size,
      doc.role, doc.mode, doc.summary, doc.tokenEstimate, doc.storedPath, doc.createdAt
    );
  }

  updateDocument(id: string, patch: { role?: string; mode?: string; summary?: string | null; tokenEstimate?: number }): void {
    const current = this.getDocuments({}).find((d) => d.id === id);
    if (!current) return;
    this.db.prepare(`UPDATE documents SET role = ?, mode = ?, summary = ?, token_estimate = ? WHERE id = ?`).run(
      patch.role ?? current.role,
      patch.mode ?? current.mode,
      patch.summary === undefined ? current.summary : patch.summary,
      patch.tokenEstimate === undefined ? current.tokenEstimate : patch.tokenEstimate,
      id
    );
  }

  deleteDocument(id: string): DocumentRecord | null {
    const doc = this.getDocuments({}).find((d) => d.id === id) || null;
    if (doc) this.db.prepare('DELETE FROM documents WHERE id = ?').run(id);
    return doc;
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
    return row ? row.value : null;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
  }

  getSessionStats() {
    const r = this.db.prepare(`
      SELECT 
        COUNT(*) as totalCalls,
        COALESCE(SUM(total_tokens), 0) as totalTokens,
        COALESCE(SUM(estimated_cost_usd), 0) as totalCostUsd
      FROM llm_logs
    `).get() as any;
    return {
      totalCalls: r.totalCalls || 0,
      totalTokens: r.totalTokens || 0,
      totalCostUsd: Number((r.totalCostUsd || 0).toFixed(4))
    };
  }
}

export const dbService = new DatabaseService();


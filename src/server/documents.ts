import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import AdmZip from 'adm-zip';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { dbService } from './db.js';
import { activeModel } from './llm/model-resolver.js';
import { DocumentRecord, DocumentRole, DocumentScope } from '../common/types.js';

const ACCEPTED_EXT = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf', 'docx', 'txt', 'md', 'csv', 'json', 'woff', 'woff2', 'ttf', 'otf'
]);

const TEXT_EXT = new Set(['txt', 'md', 'csv', 'json', 'svg']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'svg']);
const FONT_EXT = new Set(['woff', 'woff2', 'ttf', 'otf']);
const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml',
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf'
};

const FFPROBE = process.env.FFPROBE_PATH?.replace(/^"|"$/g, '') || 'C:\\Program Files\\DownloadHelper CoApp\\ffprobe.exe';

export function extOf(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}
export function mimeOf(name: string): string {
  return MIME[extOf(name)] || 'application/octet-stream';
}
export function isAccepted(name: string): boolean {
  return ACCEPTED_EXT.has(extOf(name));
}
export function isTextLike(name: string): boolean {
  return TEXT_EXT.has(extOf(name));
}
export function isImage(name: string): boolean {
  return IMAGE_EXT.has(extOf(name));
}
export function isFont(name: string): boolean {
  return FONT_EXT.has(extOf(name));
}

function safeName(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function stripXml(xml: string): string {
  return xml
    .replace(/<w:p[ >]/g, '\n<w:p ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

export function extractText(record: DocumentRecord): string | null {
  const ext = extOf(record.name);
  try {
    if (TEXT_EXT.has(ext)) {
      return fs.readFileSync(record.storedPath, 'utf8');
    }
    if (ext === 'docx') {
      const zip = new AdmZip(record.storedPath);
      const entry = zip.getEntry('word/document.xml');
      if (!entry) return null;
      return stripXml(entry.getData().toString('utf8'));
    }
  } catch (_) {
    return null;
  }
  return null;
}

export function estimateTokens(text: string | null, ext: string): number {
  if (text) return Math.max(1, Math.ceil(text.length / 4));
  if (IMAGE_EXT.has(ext)) return 258;
  if (ext === 'pdf') return 1000;
  return 64;
}

function summarizeOnce(name: string, text: string): string {
  return text.length <= 1200 ? text : `${text.slice(0, 1200)}…`;
}

async function llmSummary(name: string, text: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return summarizeOnce(name, text);
  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: activeModel() });
    const res = await model.generateContent(
      `Summarize the following reference document for an animation brief in at most 120 words. Preserve exact hex colours, fonts, names and literal on-screen phrases. Reply with the summary only.\n\nDOCUMENT (${name}):\n${text.slice(0, 12000)}`
    );
    const out = res.response.text().trim();
    return out || summarizeOnce(name, text);
  } catch (_) {
    return summarizeOnce(name, text);
  }
}

export async function saveUpload(input: {
  projectId: string;
  videoId?: string | null;
  shotId?: string | null;
  name: string;
  scope: DocumentScope;
  role: DocumentRole;
  mode: 'Full' | 'Summary' | 'Off';
  dataBase64: string;
}): Promise<DocumentRecord> {
  if (!isAccepted(input.name)) throw new Error(`Unsupported file type: ${extOf(input.name)}`);
  const buffer = Buffer.from(input.dataBase64, 'base64');
  if (!buffer.length) throw new Error('Empty file');
  const id = crypto.randomUUID();
  const dir = path.resolve(process.cwd(), 'projects', input.projectId.replace(/[^a-zA-Z0-9_-]/g, '_'), 'documents');
  fs.mkdirSync(dir, { recursive: true });
  const storedPath = path.join(dir, `${id}-${safeName(input.name)}`);
  fs.writeFileSync(storedPath, buffer);

  const record: DocumentRecord = {
    id,
    projectId: input.projectId,
    videoId: input.videoId || null,
    shotId: input.shotId || null,
    name: input.name,
    scope: input.scope,
    type: mimeOf(input.name),
    size: buffer.length,
    role: input.role,
    mode: input.mode,
    summary: null,
    tokenEstimate: 0,
    storedPath,
    createdAt: new Date().toISOString()
  };

  const text = extractText(record);
  record.tokenEstimate = estimateTokens(text, extOf(record.name));
  if (input.mode === 'Summary') {
    record.summary = text ? await llmSummary(input.name, text) : `Reference ${extOf(input.name).toUpperCase()} file: ${input.name}`;
  }
  dbService.saveDocument(record);
  return record;
}

export async function summarizeDocument(record: DocumentRecord): Promise<string> {
  const text = extractText(record);
  const summary = text ? await llmSummary(record.name, text) : `Reference ${extOf(record.name).toUpperCase()} file: ${record.name}`;
  dbService.updateDocument(record.id, { summary });
  return summary;
}

function imageSize(file: string): { width: number; height: number } | null {
  try {
    const out = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], { maxBuffer: 1024 * 1024 });
    const s = JSON.parse(out.toString()).streams[0];
    if (s?.width && s?.height) return { width: s.width, height: s.height };
  } catch (_) {}
  return null;
}

export interface PreparedDocuments {
  documents: { name: string; scope: string; mode: string; text: string }[];
  attachments: { name: string; mimeType: string; data: string }[];
  assets: { name: string; relative: string; kind: string; width?: number; height?: number }[];
  fontFaces: string[];
  totalTokens: number;
}

/**
 * Resolves the documents for one build and copies ASSET files into the shot dir.
 * Inline attachments are capped at 15 MiB each (Gemini inline request cap is 20 MB total).
 */
export function prepareForShot(args: {
  shotDir: string;
  projectId: string;
  videoId: string;
  shotId: string;
  documentIds?: string[];
  modes?: Record<string, 'Full' | 'Summary' | 'Off'>;
}): PreparedDocuments {
  const all = dbService.getDocuments({ projectId: args.projectId }).filter((d) => {
    if (d.scope === 'PROJECT') return true;
    if (d.scope === 'VIDEO') return d.videoId === args.videoId;
    return d.shotId === args.shotId;
  });
  const selected = args.documentIds && args.documentIds.length
    ? all.filter((d) => args.documentIds!.includes(d.id))
    : all;

  const assetsDir = path.join(args.shotDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const prepared: PreparedDocuments = { documents: [], attachments: [], assets: [], fontFaces: [], totalTokens: 0 };

  for (const doc of selected) {
    const mode = args.modes?.[doc.id] || doc.mode;
    if (mode === 'Off') continue;
    const ext = extOf(doc.name);

    if (doc.role === 'ASSET') {
      const dest = path.join(assetsDir, safeName(doc.name));
      try { fs.copyFileSync(doc.storedPath, dest); } catch (_) { continue; }
      const dims = isImage(doc.name) && ext !== 'svg' ? imageSize(dest) || undefined : undefined;
      prepared.assets.push({ name: doc.name, relative: `assets/${safeName(doc.name)}`, kind: ext, width: dims?.width, height: dims?.height });
      if (isFont(doc.name)) {
        const family = `AssetFont-${safeName(path.basename(doc.name, path.extname(doc.name)))}`;
        const fmt = ext === 'woff2' ? 'woff2' : ext === 'woff' ? 'woff' : ext === 'ttf' ? 'truetype' : 'opentype';
        prepared.fontFaces.push(`@font-face{font-family:'${family}';src:url('assets/${safeName(doc.name)}') format('${fmt}');font-display:block;}`);
        prepared.assets[prepared.assets.length - 1].kind = `font:${family}`;
      }
      prepared.totalTokens += 0;
      continue;
    }

    const text = extractText(doc);
    if (mode === 'Summary') {
      prepared.documents.push({ name: doc.name, scope: doc.scope, mode, text: doc.summary || (text ? text.slice(0, 1200) : `Reference ${ext.toUpperCase()} file: ${doc.name}`) });
      prepared.totalTokens += Math.ceil((doc.summary || '').length / 4) || 64;
      continue;
    }

    // Full mode
    if ((ext === 'pdf' || IMAGE_EXT.has(ext)) && ext !== 'svg') {
      if (doc.size <= 15 * 1024 * 1024) {
        prepared.attachments.push({ name: doc.name, mimeType: mimeOf(doc.name), data: fs.readFileSync(doc.storedPath).toString('base64') });
        prepared.documents.push({ name: doc.name, scope: doc.scope, mode: 'Full', text: `[Attached natively as ${doc.type}]` });
        prepared.totalTokens += estimateTokens(null, ext);
      } else {
        prepared.documents.push({ name: doc.name, scope: doc.scope, mode: 'Full', text: `[File too large for inline upload: ${doc.name}]` });
      }
      continue;
    }

    if (text) {
      prepared.documents.push({ name: doc.name, scope: doc.scope, mode, text });
      prepared.totalTokens += estimateTokens(text, ext);
    }
  }

  return prepared;
}

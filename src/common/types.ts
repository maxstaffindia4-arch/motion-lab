import { z } from 'zod';

export type OutputMode = 'overlay-alpha' | 'chroma' | 'full';
export type ShotStatus = 'draft' | 'built' | 'needs-review' | 'rendered';
export type VersionSource = 'generate' | 'edit-prompt' | 'manual-params' | 'manual-code' | 'agent' | 'repair';

export interface ParamFieldSchema {
  id: string;
  type: 'text' | 'color' | 'number' | 'easing' | 'time' | 'boolean';
  label: string;
  group?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  description?: string;
}

export type ParamsSchema = ParamFieldSchema[];

export interface ProjectBrandTokens {
  brandName: string;
  officeContext: string;
  canvas: {
    width: number;
    height: number;
    fps: number;
    aspectRatio: string;
    safeMarginPercent: number;
    actionSafePercent: number;
    titleSafePercent: number;
  };
  editor: {
    software: string;
    transparencyMode: OutputMode;
    preferredFormat: string;
    fallbackFormat: string;
    chromaKeyColor: string;
  };
  colors: Record<string, string>;
  typography: {
    displayFont: string;
    bodyFont: string;
    monoFont: string;
    scale: Record<string, string>;
    weights: Record<string, number>;
  };
  radii: Record<string, string>;
  shadows: Record<string, string>;
  easings: Record<string, string>;
  logo: {
    type: string;
    symbol: string;
    svgSnippet: string;
  };
  tone?: string;
  doList?: string[];
  dontList?: string[];
}

export type DocumentScope = 'PROJECT' | 'VIDEO' | 'SHOT';
export type DocumentRole = 'REFERENCE' | 'ASSET';
export type DocumentMode = 'Full' | 'Summary' | 'Off';

export interface DocumentRecord {
  id: string;
  projectId: string;
  videoId: string | null;
  shotId: string | null;
  name: string;
  scope: DocumentScope;
  type: string;
  size: number;
  role: DocumentRole;
  mode: DocumentMode;
  summary: string | null;
  tokenEstimate: number;
  storedPath: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  brandTokens: ProjectBrandTokens;
  globalNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Video {
  id: string;
  projectId: string;
  title: string;
  contextNotes: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface Shot {
  id: string;
  videoId: string;
  shotNumber: string; // e.g. "1.1"
  start: number;
  duration: number;
  voiceoverLine: string;
  onScreenText: string;
  animationPrompt: string;
  shotContext: string;
  outputMode: OutputMode;
  status: ShotStatus;
  textSource?: 'prompt' | 'drafted' | '';
  applyKit?: boolean;
  /** Per-shot build model override; falls back to the global default. */
  buildModel?: string;
  currentVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LintFinding {
  rule: string;
  message: string;
  level: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
  fix?: string;
}

export interface LintResult {
  ok: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  findings: LintFinding[];
}

export interface ShotVersion {
  id: string;
  shotId: string;
  versionNumber: number;
  parentVersionId?: string;
  source: VersionSource;
  producingPrompt: string;
  compHtml: string;
  params: Record<string, any>;
  paramsSchema: ParamsSchema;
  lintResult: LintResult;
  provider: string;
  model: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  createdAt: string;
}

export interface ParsedPrompt {
  videoId?: string;
  shotId?: string;
  duration?: number;
  durationSource?: 'from prompt' | 'default';
  width?: number;
  height?: number;
  fps?: number;
  outputMode?: OutputMode;
  outputModeSource?: 'from prompt' | 'default';
  text?: string;
  textSource?: 'from prompt' | 'drafted by LLM' | 'default';
  style?: string;
  beats?: string;
  sfxCue?: string;
  notes?: string;
  raw: string;
  isFreeForm?: boolean;
}

export const BulkImportShotSchema = z.object({
  id: z.string(),
  time: z.number().or(z.string()).optional(),
  duration: z.number().optional(),
  role: z.string().optional(),
  voiceover: z.string().optional(),
  onScreenText: z.string().optional(),
  stockQueries: z.array(z.string()).optional(),
  effectNotes: z.string().optional(),
  animationPrompt: z.string().optional(),
  outputMode: z.enum(['overlay-alpha', 'chroma', 'full']).optional()
});

export const BulkImportSchema = z.object({
  video: z.object({
    id: z.string(),
    title: z.string()
  }),
  shots: z.array(BulkImportShotSchema)
});

export type BulkImportData = z.infer<typeof BulkImportSchema>;

export const LLMGenerationOutputSchema = z.object({
  compHtml: z.string(),
  params: z.record(z.any()),
  paramsSchema: z.array(z.object({
    id: z.string(),
    type: z.enum(['text', 'color', 'number', 'easing', 'time', 'boolean']),
    label: z.string(),
    group: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    options: z.array(z.string()).optional(),
    description: z.string().optional()
  })),
  notes: z.string().optional()
});

export type LLMGenerationOutput = z.infer<typeof LLMGenerationOutputSchema>;


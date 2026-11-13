import { ProjectBrandTokens, LLMGenerationOutput, LintResult } from '../../common/types.js';

export interface ContextDocument {
  name: string;
  scope: string;
  mode: string;
  text: string;
}

export interface ContextAsset {
  name: string;
  relative: string;
  kind: string;
  width?: number;
  height?: number;
}

export interface InlineAttachment {
  name: string;
  mimeType: string;
  data: string; // base64
}

export interface GenerationContext {
  projectTokens?: ProjectBrandTokens;
  brandKit?: any;
  projectNotes: string;
  videoTitle: string;
  videoNotes: string;
  shotNumber: string;
  duration: number;
  onScreenText: string;
  textSource?: string;
  style?: string;
  voiceoverLine?: string;
  animationPrompt: string;
  shotContext?: string;
  outputMode: 'overlay-alpha' | 'chroma' | 'full';
  previousHtml?: string;
  previousParams?: Record<string, any>;
  editInstruction?: string;
  manualDiff?: string;
  lintErrors?: LintResult;
  /** Structure reference for CUSTOM builds (closest deterministic template). */
  referenceTemplate?: string;
  /** Hand-verified golden compositions used as few-shot structure examples. */
  goldenExamples?: string[];
  documents?: ContextDocument[];
  assets?: ContextAsset[];
  attachments?: InlineAttachment[];
}

export interface LLMResponse {
  output: LLMGenerationOutput;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

export interface ILLMProvider {
  name: string;
  generate(context: GenerationContext, activeModel?: string): Promise<LLMResponse>;
  edit(context: GenerationContext): Promise<LLMResponse>;
}

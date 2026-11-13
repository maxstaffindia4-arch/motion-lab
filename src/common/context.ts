import { ParsedPrompt, Project, Shot, Video, OutputMode } from './types.js';

export type ContextSource = 'PROMPT' | 'SHOT' | 'VIDEO' | 'BRAND KIT' | 'DRAFTED' | 'DOCUMENT';

export interface BuildOptions {
  promptOnly?: boolean;
  includeShot?: boolean;
  includeVideo?: boolean;
  includeBrandKit?: boolean;
  applyKit?: boolean;
}

export interface ResolvedContext {
  promptText?: string;
  textSource: 'PROMPT' | 'DRAFTED';
  duration: number;
  durationSource: 'PROMPT' | 'DEFAULT';
  outputMode: OutputMode;
  outputModeSource: 'PROMPT' | 'DEFAULT';
  style?: string;
  voiceover?: string;
  shotContext?: string;
  videoNotes?: string;
  projectNotes?: string;
  brandKit?: any;
  kitApplied: boolean;
  stale: { text: boolean; duration: boolean; outputMode: boolean };
}

export function kitIsEmpty(kit: any): boolean {
  if (!kit || typeof kit !== 'object') return true;
  return Object.keys(kit).filter((k) => {
    const v = (kit as any)[k];
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  }).length === 0;
}

/**
 * Single source of truth for Build, Edit and the Context tab.
 * Prompt-derived fields are re-derived every time and never inherited from
 * stored shot values. Stored context is only used when not "Prompt only".
 */
export function resolveContext(args: {
  prompt: string;
  parsed: ParsedPrompt;
  shot?: Shot | null;
  video?: Video | null;
  project?: Project | null;
  options?: BuildOptions;
}): ResolvedContext {
  const { parsed, shot, video, project } = args;
  const options = args.options || {};
  const promptOnly = Boolean(options.promptOnly);

  const promptText = parsed.text && parsed.text.trim() ? parsed.text : undefined;
  const duration = parsed.durationSource === 'from prompt' && parsed.duration ? parsed.duration : 4;
  const outputMode: OutputMode =
    parsed.outputModeSource === 'from prompt' && parsed.outputMode ? parsed.outputMode : 'overlay-alpha';

  const includeShot = !promptOnly && options.includeShot !== false;
  const includeVideo = !promptOnly && options.includeVideo !== false;
  const includeBrandKit = !promptOnly && options.includeBrandKit !== false;

  const kit = project?.brandTokens;
  const kitApplied = includeBrandKit && options.applyKit !== false && !kitIsEmpty(kit);

  return {
    promptText,
    textSource: promptText ? 'PROMPT' : 'DRAFTED',
    duration,
    durationSource: parsed.durationSource === 'from prompt' ? 'PROMPT' : 'DEFAULT',
    outputMode,
    outputModeSource: parsed.outputModeSource === 'from prompt' ? 'PROMPT' : 'DEFAULT',
    style: parsed.isFreeForm ? undefined : parsed.style,
    voiceover: includeShot ? shot?.voiceoverLine || undefined : undefined,
    shotContext: includeShot ? shot?.shotContext || undefined : undefined,
    videoNotes: includeVideo ? video?.contextNotes || undefined : undefined,
    projectNotes: !promptOnly ? project?.globalNotes || undefined : undefined,
    brandKit: kitApplied ? kit : undefined,
    kitApplied,
    stale: {
      text:
        Boolean(shot?.onScreenText) &&
        shot?.textSource !== 'drafted' &&
        (!promptText || shot?.onScreenText !== promptText),
      duration: Boolean(shot) && Math.abs((shot?.duration ?? duration) - duration) > 1e-6,
      outputMode: Boolean(shot) && shot?.outputMode !== outputMode
    }
  };
}

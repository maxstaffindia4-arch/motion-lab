import { ParsedPrompt, OutputMode } from './types.js';

const KNOWN_KEYS = ['TEXT', 'STYLE', 'BEATS', 'SFX CUE', 'SFX', 'NOTES', 'OUTPUT'];

export function parseAnimationPrompt(input: string): ParsedPrompt {
  const raw = input.trim();
  const result: ParsedPrompt = {
    raw,
    duration: 4,
    durationSource: 'default',
    outputMode: 'overlay-alpha',
    outputModeSource: 'default',
    width: 1920,
    height: 1080,
    fps: 30
  };

  if (!raw) return result;

  // Header line: SHOT <shot-id> | <duration>s | ...
  // Capture everything on the FIRST line after SHOT <id> (stops at first newline).
  // For single-line format the whole string is one "line" so we also stop before
  // " / TEXT:" / " / STYLE:" etc.
  const firstLine = raw.split(/\r?\n/)[0];
  // Strip trailing " / <KNOWN_KEY>:" suffixes so they're picked up by section extraction
  const firstLineHeader = firstLine.replace(/\s+\/\s+(?:TEXT|STYLE|BEATS|SFX CUE|SFX|NOTES|OUTPUT):.*/i, '');
  const headerMatch = firstLineHeader.match(/^SHOT\s+([A-Za-z0-9_.-]+)(?:\s*\|\s*(.+))?$/i);
  const hasStructuredKey = /(?:^|[\n\r]|\s+\/\s+)(?:TEXT|STYLE|BEATS|SFX CUE|SFX|NOTES|OUTPUT):/i.test(raw);

  if (headerMatch || hasStructuredKey) {
    result.isFreeForm = false;

    if (headerMatch) {
      const fullId = headerMatch[1].trim();
      result.shotId = fullId;
      if (fullId.includes('-')) {
        const parts = fullId.split('-');
        result.videoId = parts[0];
      }

      const pipeParts = headerMatch[2] ? headerMatch[2].split('|').map((p) => p.trim()) : [];
      for (const part of pipeParts) {
        // Duration: e.g. "3s", "6s", "9s", "4.5s"
        const dur = part.match(/^([0-9.]+)\s*s(?:ec(?:onds)?)?$/i);
        if (dur) {
          result.duration = parseFloat(dur[1]);
          result.durationSource = 'from prompt';
          continue;
        }

        // Resolution: e.g. "1920x1080"
        const res = part.match(/^(\d+)x(\d+)$/i);
        if (res) {
          result.width = parseInt(res[1], 10);
          result.height = parseInt(res[2], 10);
          continue;
        }

        // FPS: e.g. "30fps"
        const fpsMatch = part.match(/^(\d+)\s*fps$/i);
        if (fpsMatch) {
          result.fps = parseInt(fpsMatch[1], 10);
          continue;
        }

        // Output mode: e.g. "OUTPUT: overlay"
        const outMatch = part.match(/^OUTPUT:\s*(overlay(?:-alpha)?|chroma|full)$/i);
        if (outMatch) {
          const mode = outMatch[1].toLowerCase();
          result.outputMode = (mode.startsWith('overlay') ? 'overlay-alpha' : mode as OutputMode);
          result.outputModeSource = 'from prompt';
          continue;
        }
      }
    }

    // Secondary scan for OUTPUT if in section format
    if (result.outputModeSource === 'default') {
      const outputMatch = raw.match(/(?:^|[\n\r]|\s+\/\s+)OUTPUT:\s*(overlay(?:-alpha)?|chroma|full)/i);
      if (outputMatch) {
        const mode = outputMatch[1].toLowerCase();
        result.outputMode = (mode.startsWith('overlay') ? 'overlay-alpha' : mode as OutputMode);
        result.outputModeSource = 'from prompt';
      }
    }

    // Extract labeled section: separator is (newline OR " / ") immediately followed by a known key and colon
    const extractSection = (prefix: string): string | undefined => {
      const keysExceptCurrent = KNOWN_KEYS.join('|');
      const regex = new RegExp(`(?:^|[\\n\\r]|\\s+\\/\\s+)${prefix}:\\s*([\\s\\S]*?)(?=(?:(?:[\\n\\r]|\\s+\\/\\s+)(?:${keysExceptCurrent}):)|$)`, 'i');
      const m = raw.match(regex);
      if (m && m[1]) {
        return m[1].trim().replace(/\\n/g, '\n');
      }
      return undefined;
    };

    result.text = extractSection('TEXT');
    if (result.text) {
      result.textSource = 'from prompt';
    }
    result.style = extractSection('STYLE');
    result.beats = extractSection('BEATS');
    result.sfxCue = extractSection('SFX CUE') || extractSection('SFX');
    result.notes = extractSection('NOTES');

    return result;
  }

  // --- FREE-FORM NATURAL-LANGUAGE PROMPT (Requirement I) ---
  result.isFreeForm = true;
  result.style = raw; // treat the whole text as the description

  // Check for duration e.g. "5 seconds" or "5s"
  const durationMatch = raw.match(/(?:duration:\s*|in\s*|for\s*)?(\d+(?:\.\d+)?)\s*s(?:ec(?:onds)?)?\b/i);
  if (durationMatch) {
    result.duration = parseFloat(durationMatch[1]);
    result.durationSource = 'from prompt';
  } else {
    result.duration = 4;
    result.durationSource = 'default';
  }

  // Check for output mode e.g. "chroma", "full", "overlay"
  const modeMatch = raw.match(/\b(chroma|full|overlay(?:-alpha)?)\b/i);
  if (modeMatch) {
    const m = modeMatch[1].toLowerCase();
    result.outputMode = m.startsWith('overlay') ? 'overlay-alpha' : (m as OutputMode);
    result.outputModeSource = 'from prompt';
  } else {
    result.outputMode = 'overlay-alpha';
    result.outputModeSource = 'default';
  }

  // Check for quoted verbatim text: "..." or '...' or “...”
  const quoteMatch = raw.match(/["“']([^"”']+)["”']/);
  if (quoteMatch && quoteMatch[1].trim()) {
    result.text = quoteMatch[1].trim();
    result.textSource = 'from prompt';
  } else {
    result.text = undefined;
    result.textSource = 'drafted by LLM';
  }

  return result;
}

import { parseAnimationPrompt } from '../src/common/prompt-parser.js';

const input = `SHOT 1.1 | 3.5s | 1920x1080 | 30fps | OUTPUT: overlay
TEXT: Running a business is already hard enough.
STYLE: word-by-word kinetic text slam with shake
BEATS: 0.00 text slams in word by word, 0.15s each; 1.20 hold; 2.60 fade out
SFX CUE: 0.00 slam hit, 2.60 whoosh
NOTES: Bangladesh office context`;

const parsed = parseAnimationPrompt(input);
console.log(JSON.stringify(parsed, null, 2));

// Test the header regex directly
const raw = input.trim();
const headerMatch = raw.match(/^SHOT\s+([A-Za-z0-9_.-]+)(?:\s*\|\s*([^\n\r/]+(?:(?!\s*\/\s*(?:TEXT|STYLE|BEATS|SFX|NOTES|OUTPUT):)[\s\S])*))?/i);
console.log('\nheaderMatch[0]:', JSON.stringify(headerMatch?.[0]));
console.log('headerMatch[1]:', JSON.stringify(headerMatch?.[1]));
console.log('headerMatch[2]:', JSON.stringify(headerMatch?.[2]));
if (headerMatch?.[2]) {
  const pipeParts = headerMatch[2].split('|').map((p) => p.trim());
  console.log('\npipeParts:', pipeParts);
  for (const part of pipeParts) {
    const dur = part.match(/^([0-9.]+)\s*s(?:ec(?:onds)?)?$/i);
    console.log('part:', JSON.stringify(part), '-> dur:', dur?.[1]);
  }
}


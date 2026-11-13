import { parseAnimationPrompt } from '../src/common/prompt-parser.js';

const r = parseAnimationPrompt(`SHOT 1.1 | 3.5s | 1920x1080 | 30fps | OUTPUT: overlay
TEXT: Running a business.
STYLE: kinetic`);
console.log(JSON.stringify(r, null, 2));


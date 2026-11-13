const { parseAnimationPrompt } = await import('./src/common/prompt-parser.js');
const input = 'SHOT 1.1 | 3.5s | 1920x1080 | 30fps | OUTPUT: overlay\nTEXT: Running a business is already hard enough.\nSTYLE: word-by-word kinetic text slam with shake\nBEATS: 0.00 text slams in word by word, 0.15s each; 1.20 hold; 2.60 fade out\nSFX CUE: 0.00 slam hit, 2.60 whoosh\nNOTES: Bangladesh office context';
console.log(JSON.stringify(parseAnimationPrompt(input), null, 2));

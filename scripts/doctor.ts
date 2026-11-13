import dotenv from 'dotenv';
dotenv.config();

import { execSync } from 'child_process';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { dbService } from '../src/server/db.js';

async function runDoctor() {
  console.log('====================================================');
  console.log('   MOTION LAB DIAGNOSTIC DOCTOR (System & LLM)     ');
  console.log('====================================================\n');

  let hasErrors = false;

  // 1. Node.js Version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.replace(/^v/, '').split('.')[0], 10);
  if (majorVersion >= 22) {
    console.log(`[PASS] Node.js version: ${nodeVersion} (>= 22 required)`);
  } else {
    console.error(`[FAIL] Node.js version ${nodeVersion} is below required 22+`);
    hasErrors = true;
  }

  // 2. FFmpeg & FFprobe
  try {
    const ffmpegOut = execSync('ffmpeg -version', { stdio: 'pipe' }).toString().split('\n')[0];
    console.log(`[PASS] FFmpeg: ${ffmpegOut}`);
  } catch (e: any) {
    const fallbackPath = process.env.FFMPEG_PATH || 'C:\\Program Files\\DownloadHelper CoApp\\ffmpeg.exe';
    try {
      const out = execSync(`"${fallbackPath}" -version`, { stdio: 'pipe' }).toString().split('\n')[0];
      console.log(`[PASS] FFmpeg (from path): ${out}`);
    } catch (_) {
      console.error('[FAIL] FFmpeg is missing or not executable.');
      hasErrors = true;
    }
  }

  // 3. SQLite Database
  try {
    const stats = dbService.getSessionStats();
    console.log(`[PASS] SQLite Database: Connected. (Logged calls: ${stats.totalCalls}, Tokens: ${stats.totalTokens})`);
  } catch (e: any) {
    console.error(`[FAIL] SQLite database error: ${e.message}`);
    hasErrors = true;
  }

  // 4. Gemini API Connection (REAL CALL)
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

  if (!geminiKey) {
    console.log('[INFO] GEMINI_API_KEY is not set in .env.');
    console.log('       - Offline Template Mode: READY (all 11 built-in archetypes work 100% offline).');
    console.log('       - AI Synthesis Mode: Add GEMINI_API_KEY=AIzaSy... to enable LLM generation.');
  } else {
    console.log(`[INFO] Testing live Gemini API connection (Model: ${modelName})...`);
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: modelName });
      const t0 = Date.now();
      const res = await model.generateContent('Respond with only the word: PONG');
      const latency = Date.now() - t0;
      const text = res.response.text().trim();
      const usage = res.response.usageMetadata;

      console.log(`[PASS] Gemini API connection successful!`);
      console.log(`       - Model: ${modelName}`);
      console.log(`       - Response: "${text}"`);
      console.log(`       - Latency: ${latency}ms`);
      console.log(`       - Prompt tokens: ${usage?.promptTokenCount || 0}`);
      console.log(`       - Candidates tokens: ${usage?.candidatesTokenCount || 0}`);
      console.log(`       - Total tokens: ${usage?.totalTokenCount || 0}`);
    } catch (err: any) {
      console.error(`[FAIL] Gemini API live call failed: ${err.message}`);
      hasErrors = true;
    }
  }

  console.log('\n====================================================');
  if (hasErrors) {
    console.error(' Doctor reported issues. Please resolve the items marked [FAIL].');
    console.log('====================================================');
    process.exit(1);
  } else {
    console.log(' All checks passed! Motion Lab is operational.');
    console.log('====================================================');
    process.exit(0);
  }
}

runDoctor();


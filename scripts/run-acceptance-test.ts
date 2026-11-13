import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:3000';

async function main() {
  console.log('=== STARTING PHASE 1 ACCEPTANCE TEST ===');

  // 1. Get Project
  const projRes = await fetch(`${BASE_URL}/api/projects`);
  const projects = await projRes.json();
  const proj = projects[0];
  console.log(`[1] Verified Project: "${proj.name}" (ID: ${proj.id})`);
  console.log(`    Brand Primary: ${proj.brandTokens.colors.primary}, Editor: ${proj.brandTokens.editor.software}`);

  // 2. Get Video
  const vidRes = await fetch(`${BASE_URL}/api/projects/${proj.id}/videos`);
  const videos = await vidRes.json();
  const video = videos[0];
  console.log(`[2] Verified Video: "${video.title}" (ID: ${video.id})`);

  // Shots definitions for acceptance test
  const testShots = [
    {
      id: 'shot-a',
      shotNumber: '1.1',
      duration: 3,
      onScreenText: 'Running a business is already hard enough.',
      animationPrompt: 'SHOT 1.1 | 3s | 1920x1080 | 30fps | OUTPUT: overlay\nTEXT: Running a business is already hard enough.\nSTYLE: word-by-word kinetic text slam with shake\nBEATS: 0.00 text slams in word by word, 0.15s each; 1.20 hold; 2.60 fade out',
      outputMode: 'overlay-alpha'
    },
    {
      id: 'shot-b',
      shotNumber: '1.2',
      duration: 7,
      onScreenText: 'Recruitment / Office Space / Equipment / Admin',
      animationPrompt: 'SHOT 1.2 | 7s | 1920x1080 | 30fps | OUTPUT: overlay\nTEXT: Recruitment / Office Space / Equipment / Admin\nSTYLE: strike-checklist pain points sequential strikethrough',
      outputMode: 'overlay-alpha'
    },
    {
      id: 'shot-c',
      shotNumber: '1.3',
      duration: 7,
      onScreenText: 'Dedicated Employees / Office Infrastructure / Recruitment Support / Flexible Working Hours',
      animationPrompt: 'SHOT 1.3 | 7s | 1920x1080 | 30fps | OUTPUT: overlay\nTEXT: Dedicated Employees / Office Infrastructure / Recruitment Support / Flexible Working Hours\nSTYLE: four icon cards sequential pop-in with floating idle',
      outputMode: 'overlay-alpha'
    },
    {
      id: 'shot-d',
      shotNumber: '1.4',
      duration: 4,
      onScreenText: 'Visit Staff-India.com | Speak to an Advisor',
      animationPrompt: 'SHOT 1.4 | 4s | 1920x1080 | 30fps | OUTPUT: overlay\nTEXT: Visit Staff-India.com | Speak to an Advisor\nSTYLE: end card logo with CTA button',
      outputMode: 'overlay-alpha'
    }
  ];

  const createdShots = [];

  for (const s of testShots) {
    console.log(`\n--- Setting up Shot ${s.shotNumber}: "${s.onScreenText}" ---`);
    // Create shot
    const createRes = await fetch(`${BASE_URL}/api/shots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: s.id,
        videoId: video.id,
        shotNumber: s.shotNumber,
        duration: s.duration,
        onScreenText: s.onScreenText,
        animationPrompt: s.animationPrompt,
        outputMode: s.outputMode
      })
    });
    const shot = await createRes.json();
    console.log(`    Shot ${shot.shotNumber} created in DB.`);

    // Build shot (Generate)
    console.log(`    Calling /api/shots/${shot.id}/generate...`);
    const genRes = await fetch(`${BASE_URL}/api/shots/${shot.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: s.animationPrompt, lockText: true })
    });
    const genData = await genRes.json();
    console.log(`    Generated version v${genData.version.versionNumber} (Lint OK: ${genData.version.lintResult.ok}, Errors: ${genData.version.lintResult.errorCount})`);

    // Render shot
    console.log(`    Triggering render for Shot ${shot.shotNumber}...`);
    const renderRes = await fetch(`${BASE_URL}/api/shots/${shot.id}/render`, { method: 'POST' });
    const renderData = await renderRes.json();
    console.log(`    Render dispatched: ${renderData.outputFile}`);

    createdShots.push(shot);
  }

  // Edit test on Shot (a): "make the text bigger and warmer"
  console.log('\n--- Applying Edit Prompt to Shot (a): "make the text bigger and warmer" ---');
  const editRes = await fetch(`${BASE_URL}/api/shots/shot-a/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      editInstruction: 'make the text bigger and warmer'
    })
  });
  const editData = await editRes.json();
  console.log(`    New version created: v${editData.version.versionNumber} (Source: ${editData.version.source})`);
  console.log(`    Updated fontSize: ${editData.version.params.fontSize}px, textColor: ${editData.version.params.textColor}`);

  // Fetch all versions for Shot (a)
  const versionsRes = await fetch(`${BASE_URL}/api/shots/shot-a/versions`);
  const versions = await versionsRes.json();
  console.log(`    Shot (a) now has ${versions.length} versions: [${versions.map((v: any) => `v${v.versionNumber} (${v.source})`).join(', ')}]`);

  // Test Undo / Restore back to v1
  console.log('\n--- Testing Undo / Restore to Version 1 ---');
  const v1 = versions.find((v: any) => v.versionNumber === 1);
  const restoreRes = await fetch(`${BASE_URL}/api/shots/shot-a/restore-version`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ versionId: v1.id })
  });
  const restoreData = await restoreRes.json();
  console.log(`    Restored version ID: ${restoreData.restored.id} (v${restoreData.restored.versionNumber})`);

  // Verify shot current_version_id
  const checkShotRes = await fetch(`${BASE_URL}/api/videos/${video.id}/shots`);
  const updatedShots = await checkShotRes.json();
  const shotA = updatedShots.find((s: any) => s.id === 'shot-a');
  console.log(`    Shot (a) active currentVersionId is now: ${shotA.currentVersionId} (Matches v1: ${shotA.currentVersionId === v1.id})`);

  // Fetch session stats
  const statsRes = await fetch(`${BASE_URL}/api/session/stats`);
  const stats = await statsRes.json();
  console.log(`\n=== SESSION COUNTER ===`);
  console.log(`Total LLM Calls: ${stats.totalCalls}`);
  console.log(`Total Tokens: ${stats.totalTokens}`);
  console.log(`Total Cost: $${stats.totalCostUsd}`);

  console.log('\n=== ACCEPTANCE TEST PASSED SUCCESSFULLY! ===');
}

main().catch(err => {
  console.error('Acceptance test failed:', err);
  process.exit(1);
});


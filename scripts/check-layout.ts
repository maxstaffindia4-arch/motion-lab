// Expects dev servers to be running: npm run dev (Vite :5173 + Fastify :3001)
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const UI = 'http://127.0.0.1:5173';

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
];

const SCREENSHOT_DIR = path.resolve('proof-screenshots');

interface OffendingElement {
  tag: string;
  text: string;
  testId: string;
  x: number;
  right: number;
  viewportWidth: number;
}

async function main() {
  // Ensure screenshot directory exists
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  let globalFail = false;

  for (const viewport of VIEWPORTS) {
    console.log(`\n=== Viewport ${viewport.width}×${viewport.height} ===`);
    const page = await browser.newPage({ viewport });

    await page.goto(UI, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    let viewportFail = false;

    // Check horizontal scroll
    const scrollWidth: number = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    if (scrollWidth > viewport.width) {
      console.error(
        `  ❌ Horizontal overflow: scrollWidth=${scrollWidth} > viewportWidth=${viewport.width}`
      );
      viewportFail = true;
    }

    // Check interactive elements for out-of-bounds bounding boxes
    const selector = 'button, select, [role="tab"], [data-testid]';
    const offenders: OffendingElement[] = await page.evaluate(
      ({ sel, vw }) => {
        const results: Array<{
          tag: string;
          text: string;
          testId: string;
          x: number;
          right: number;
          viewportWidth: number;
        }> = [];
        const elements = document.querySelectorAll<HTMLElement>(sel);
        for (const el of elements) {
          // Only visible elements
          if (el.offsetParent === null && el.tagName.toLowerCase() !== 'body') continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          const x = rect.left;
          const right = rect.left + rect.width;
          if (x < 0 || right > vw) {
            const rawText = (el.innerText || el.textContent || '').trim();
            results.push({
              tag: el.tagName.toLowerCase(),
              text: rawText.length > 60 ? rawText.slice(0, 57) + '…' : rawText,
              testId: el.getAttribute('data-testid') || '',
              x,
              right,
              viewportWidth: vw,
            });
          }
        }
        return results;
      },
      { sel: selector, vw: viewport.width }
    );

    if (offenders.length > 0) {
      viewportFail = true;
      console.error(`  ❌ ${offenders.length} element(s) overflow the viewport:`);
      for (const o of offenders) {
        const testIdStr = o.testId ? ` [data-testid="${o.testId}"]` : '';
        console.error(
          `     <${o.tag}>${testIdStr} text="${o.text}" x=${o.x.toFixed(1)} right=${o.right.toFixed(1)} (viewport=${o.viewportWidth})`
        );
      }
    }

    // Save screenshot
    const screenshotPath = path.join(SCREENSHOT_DIR, `layout-${viewport.width}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  📸 Screenshot saved: ${screenshotPath}`);

    if (viewportFail) {
      console.error(`  ✖ ${viewport.width}×${viewport.height}: FAIL`);
      globalFail = true;
    } else {
      console.log(`  ✔ ${viewport.width}×${viewport.height}: PASS`);
    }

    await page.close();
  }

  await browser.close();

  console.log('\n=== Layout Check Summary ===');
  if (globalFail) {
    console.error('RESULT: FAIL — one or more viewports have layout issues.');
    process.exit(1);
  } else {
    console.log('RESULT: PASS — all viewports within bounds.');
  }
}

main().catch((e) => {
  console.error('check-layout FAILED unexpectedly:', e?.message || e);
  process.exit(1);
});

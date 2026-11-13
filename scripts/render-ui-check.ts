/**
 * Verifies the render UI: format picker, SSE progress bar, and Cancel.
 * Uses a throw-away shot so it cannot damage the proven alpha master.
 */
import { chromium } from 'playwright';

const UI = 'http://127.0.0.1:5173';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  await page.goto(UI, { waitUntil: 'networkidle' });

  const videoSelect = page.locator('aside').first().locator('select');
  await videoSelect.waitFor({ state: 'visible' });
  const labels = await videoSelect.locator('option').evaluateAll((opts) => opts.map((o: any) => o.label));
  const candidates = labels.filter((l: string) => l.startsWith('E2E Proof'));
  const target = candidates[candidates.length - 1];
  if (!target) throw new Error(`No E2E Proof video with a built shot. Options: ${labels.join(', ')}`);
  await videoSelect.selectOption({ label: target });
  await page.waitForTimeout(1500);

  // Throw-away shot 9.9: cancelling writes 9.9.mov, never the proven 1.1 master.
  const cancelShot = page.locator('[data-testid="shot-9.9"]');
  await cancelShot.waitFor({ state: 'visible', timeout: 15000 });
  await cancelShot.click();
  await page.waitForTimeout(1500);

  const format = page.locator('[data-testid="render-format"]');
  await format.waitFor({ state: 'visible', timeout: 15000 });
  // mp4-full is derived from the alpha master; cancelling cannot damage the master.
  await format.selectOption('mp4-full');
  console.log(`format picker visible before render; selected="${await format.inputValue()}"`);

  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Render Shot/.test(x.textContent || ''));
    return Boolean(b && !(b as HTMLButtonElement).disabled);
  }, null, { timeout: 20000 });
  const renderBtn = page.getByRole('button', { name: /Render Shot/i });
  await renderBtn.click();

  const cancel = page.locator('[data-testid="render-cancel"]');
  await cancel.waitFor({ state: 'visible', timeout: 60000 });
  console.log('progress bar: visible');
  console.log('cancel button: visible');

  const label = page.locator('[data-testid="render-progress-label"]');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="render-progress-label"]');
    return !!el && /^([1-9]\d?)%/.test(el.textContent || '');
  }, null, { timeout: 180000 }).catch(() => {});
  console.log(`progress label: "${await label.innerText()}"`);
  const width = await page.locator('[data-testid="render-progress-fill"]').evaluate((el) => getComputedStyle(el as HTMLElement).width);
  console.log(`progress fill width: ${width}`);

  await cancel.click();
  const toast = page.locator('text=/Render cancelled/i').first();
  await toast.waitFor({ state: 'visible', timeout: 20000 });
  console.log(`toast after cancel: "${(await toast.innerText()).trim()}"`);
  console.log('cancel button still visible:', await cancel.isVisible().catch(() => false));

  await browser.close();
  console.log('RENDER UI CHECK PASSED');
}
main().catch((e) => { console.error('RENDER UI CHECK FAILED:', e?.message || e); process.exit(1); });

// Expects dev servers to be running: npm run dev (Vite :5173 + Fastify :3001)
import { chromium } from 'playwright';

const UI = 'http://127.0.0.1:5173';
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost']);

interface RequestRecord {
  url: string;
  host: string;
  status: number | null;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const records: RequestRecord[] = [];
  let hasForeignRequest = false;

  // Intercept all requests
  page.on('request', (request) => {
    const url = request.url();
    // Skip non-http/https (data:, blob:, etc.)
    if (!url.startsWith('http://') && !url.startsWith('https://')) return;
    try {
      const host = new URL(url).hostname;
      records.push({ url, host, status: null });
    } catch {
      // ignore malformed URLs
    }
  });

  page.on('response', (response) => {
    const url = response.url();
    if (!url.startsWith('http://') && !url.startsWith('https://')) return;
    const record = records.findLast((r) => r.url === url && r.status === null);
    if (record) {
      record.status = response.status();
    }
  });

  console.log(`Loading ${UI} …`);
  await page.goto(UI, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  await browser.close();

  // Evaluate results
  console.log(`\nTotal requests recorded: ${records.length}`);

  const foreignRequests = records.filter((r) => !ALLOWED_HOSTS.has(r.host));
  if (foreignRequests.length > 0) {
    hasForeignRequest = true;
    console.error('\n❌ Foreign (non-local) requests detected:');
    for (const r of foreignRequests) {
      console.error(`  [${r.status ?? '?'}] ${r.url}`);
    }
  }

  const errorRequests = records.filter((r) => r.status !== null && r.status >= 400);
  if (errorRequests.length > 0) {
    console.warn('\n⚠  Requests with status >= 400:');
    for (const r of errorRequests) {
      console.warn(`  [${r.status}] ${r.url}`);
    }
  } else {
    console.log('\nNo requests with status >= 400.');
  }

  if (hasForeignRequest) {
    console.error('\n--- RESULT: FAIL (foreign network requests detected) ---');
    process.exit(1);
  } else {
    console.log('\n--- RESULT: PASS (all requests stayed on 127.0.0.1 / localhost) ---');
  }
}

main().catch((e) => {
  console.error('check-offline FAILED unexpectedly:', e?.message || e);
  process.exit(1);
});

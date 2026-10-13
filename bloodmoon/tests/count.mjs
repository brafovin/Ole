import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:5199/tests/count.html');
await p.waitForFunction(() => window.__done, null, { timeout: 30000 });
console.log('[meshes before, after]', await p.title());
await b.close();

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileStore, PgStore } from './store.js';
import { createApp } from './app.js';
const root = fileURLToPath(new URL('..', import.meta.url));
const demo = process.argv.includes('--demo');
const port = Number(process.env.PORT || 8012);
if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('PORT must be 1–65535.'); process.exit(1); }
if (!demo && !process.env.DATABASE_URL) { console.error('DATABASE_URL is required for PostgreSQL mode. See .env.example. For the explicit local file demo, run npm run demo.'); process.exit(1); }
let store;
try {
  store = demo ? new FileStore(process.env.DEMO_DATA_FILE || path.join(root, 'data', 'spendscope-demo.json')) : new PgStore(process.env.DATABASE_URL);
  await store.init();
  if (demo || process.env.SEED_DEMO === '1') {
    const result = await store.ingest(await fs.readFile(path.join(root, 'data', 'demo.csv'), 'utf8'), 'Synthetic demo · Jan–Jun 2026', 'demo', '00000000-0000-4000-8000-000000000001');
    console.log(`Synthetic demo: ${result.imported} rows added; already loaded: ${result.already_loaded}.`);
  }
  const host = process.env.HOST || '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('HOST must be 127.0.0.1 or 0.0.0.0.');
  const server = createApp(store).listen(port, host, () => console.log(`SpendScope ready: http://localhost:${port} · storage: ${store.mode}`));
  server.on('error', async error => { console.error(`Cannot start on port ${port}: ${error.message}`); await store.close(); process.exit(1); });
  let stopping = false;
  async function stop() { if (stopping) return; stopping = true; server.close(async () => { await store.close(); process.exit(0); }); }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
} catch (error) { console.error(`SpendScope could not start: ${error.message}`); if (store) await store.close(); process.exit(1); }

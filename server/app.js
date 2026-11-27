import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ValidationError, validateFilters, exportCsv } from './domain.js';
import { createExplainer, AIError } from './ai.js';
const root = fileURLToPath(new URL('..', import.meta.url));
export function createApp(store, { explainer = createExplainer(), internalHealthHosts = process.env.INTERNAL_HEALTH_HOSTS || '' } = {}) {
  const healthHosts = new Set(internalHealthHosts.split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
  for (const hostname of healthHosts) {
    if (hostname.length > 253 || !hostname.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new Error('INTERNAL_HEALTH_HOSTS must contain explicit DNS hostnames separated by commas.');
  }
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    const hostname = req.hostname;
    const host = /^([^:]+)(?::\d+)?$/.exec(req.get('host') || '')?.[1].toLowerCase();
    const internalHealth = ['GET', 'HEAD'].includes(req.method) && req.path === '/api/health' && healthHosts.has(host);
    if (!['localhost', '127.0.0.1'].includes(hostname) && !internalHealth) return res.status(403).json({ error: 'Use the localhost address for this app.' });
    const configuredDevOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(process.env.DEV_ORIGIN || '') ? process.env.DEV_ORIGIN : null;
    if (req.headers.origin && req.headers.origin !== configuredDevOrigin && !['http://localhost', 'http://127.0.0.1'].some(prefix => req.headers.origin === `${prefix}:${req.socket.localPort}`)) return res.status(403).json({ error: 'Cross-origin requests are disabled.' });
    next();
  });
  app.use(express.json({ limit: '6mb' }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'SpendScope', version: '1.0.0', mode: store.mode, ai_configured: explainer.configured }));
  app.get('/api/dashboard', async (req, res) => res.json(await store.dashboard(validateFilters(req.query))));
  app.get('/api/transactions', async (req, res) => {
    const rows = await store.rows(validateFilters(req.query));
    const page = Number(req.query.page || 1), limit = Number(req.query.limit || 20), sort = req.query.sort || 'date_desc';
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ error: 'Page must be positive; limit must be 1–100.' });
    if (sort === 'date_asc') rows.reverse();
    else if (sort === 'amount_desc') rows.sort((a, b) => b.amount_cents - a.amount_cents || a.id.localeCompare(b.id));
    else if (sort === 'amount_asc') rows.sort((a, b) => a.amount_cents - b.amount_cents || a.id.localeCompare(b.id));
    else if (sort !== 'date_desc') return res.status(400).json({ error: 'Unsupported sort order.' });
    res.json({ transactions: rows.slice((page - 1) * limit, page * limit), count: rows.length, page, limit });
  });
  app.post('/api/import', async (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'Upload requires JSON containing CSV text.' });
    if (!req.body || typeof req.body.csv !== 'string' || (req.body.filename !== undefined && typeof req.body.filename !== 'string')) return res.status(400).json({ error: 'Provide csv text and a filename string.' });
    res.status(201).json(await store.ingest(req.body.csv, req.body.filename));
  });
  app.get('/api/export', async (req, res) => res.type('text/csv').attachment('spendscope-export.csv').send(exportCsv(await store.rows(validateFilters(req.query)))));
  app.post('/api/explain', async (req, res) => { const filters = validateFilters(req.body); res.json(await explainer.explain(await store.dashboard(filters))); });
  app.get('/sample.csv', (req, res) => res.download(path.join(root, 'data', 'sample.csv'), 'spendscope-sample.csv'));
  app.use(express.static(path.join(root, 'dist')));
  app.use((req, res) => res.status(404).json({ error: 'Page not found. Run npm run build before starting the app.' }));
  app.use((error, req, res, next) => {
    if (error instanceof AIError) return res.status(error.status).json({ error: error.message });
    if (error instanceof ValidationError) return res.status(422).json({ error: error.message, errors: error.errors });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request exceeds the upload limit.' });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON request.' });
    if (/Month must|too long|Source must|Demo storage/.test(error.message)) return res.status(400).json({ error: error.message });
    console.error('Request failed:', error.message);
    res.status(500).json({ error: 'The local database could not complete this request. No partial import was saved.' });
  });
  return app;
}

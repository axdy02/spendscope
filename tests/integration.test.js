import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { request } from 'node:http';
import { FileStore, PgStore } from '../server/store.js';
import { createApp } from '../server/app.js';
const csv = 'date,description,amount,category\n2026-06-01,First,0.10,Food\n2026-06-02,Second,0.20,Food\n';
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'spendscope-test-'));
  const store = await new FileStore(path.join(directory, 'data.json')).init();
  const server = createApp(store, { internalHealthHosts: '', ...options }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await store.close(); await fs.rm(directory, { recursive: true, force: true }); });
  return { store, directory, url: `http://127.0.0.1:${server.address().port}` };
}
function withHost(url, route, host, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url + route, { method, headers: { Host: host, 'Content-Type': 'application/json', ...headers } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject); req.end(method === 'POST' ? '{}' : undefined);
  });
}
test('configured Docker hostnames permit only health probes and preserve local origin protections', async t => {
  const local = await fixture(t);
  assert.equal((await withHost(local.url, '/api/health', 'spendscope:8012')).status, 403);
  const { url, store } = await fixture(t, { internalHealthHosts: 'spendscope, app' });
  const health = await withHost(url, '/api/health', 'spendscope:8012');
  assert.equal(health.status, 200); assert.equal(JSON.parse(health.text).app, 'SpendScope');
  const head = await withHost(url, '/api/health', 'APP:8012', 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.text, '');
  for (const host of ['other-service:8012', 'spendscope.attacker.example:8012', 'spendscope:invalid']) assert.equal((await withHost(url, '/api/health', host)).status, 403);
  assert.equal((await withHost(url, '/api/dashboard', 'spendscope:8012')).status, 403);
  assert.equal((await withHost(url, '/api/import', 'spendscope:8012', 'POST')).status, 403);
  assert.equal((await withHost(url, '/api/health', 'spendscope:8012', 'POST')).status, 403);
  assert.equal((await withHost(url, '/api/health', 'outside.example', 'GET', { 'X-Forwarded-Host': 'spendscope' })).status, 403);
  assert.equal((await withHost(url, '/api/health', 'spendscope:8012', 'GET', { Origin: 'https://outside.example' })).status, 403);
  assert.equal((await fetch(url + '/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://spendscope:8012' }, body: JSON.stringify({ csv }) })).status, 403);
  assert.equal((await fetch(url + '/api/health')).status, 200); assert.equal((await store.rows()).length, 0);
  assert.throws(() => createApp(store, { internalHealthHosts: '*.example' }), /explicit DNS hostnames/);
});
test('HTTP upload persists exactly, bad batches are atomic, filtered export and sorting work', async t => {
  const { store, directory, url } = await fixture(t);
  const result = await fetch(url + '/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv, filename: 'expenses.csv' }) });
  assert.equal(result.status, 201); assert.equal((await result.json()).imported, 2);
  const invalid = await fetch(url + '/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: csv + '2026-02-30,Invalid,1.001,Food\n' }) });
  assert.equal(invalid.status, 422); assert.equal((await invalid.json()).errors[0].line, 4);
  assert.equal((await store.rows()).length, 2);
  const restored = await new FileStore(path.join(directory, 'data.json')).init();
  assert.equal((await restored.dashboard()).total_cents, 30);
  const summary = await (await fetch(url + '/api/dashboard?search=First')).json(); assert.equal(summary.total_cents, 10);
  const ledger = await (await fetch(url + '/api/transactions?sort=amount_desc&limit=1')).json(); assert.equal(ledger.transactions[0].amount_cents, 20); assert.equal(ledger.count, 2);
  const exported = await fetch(url + '/api/export?search=First'); assert.match(exported.headers.get('content-disposition'), /spendscope-export/); assert.match(await exported.text(), /0\.10/);
  assert.equal((await fetch(url + '/api/dashboard?month=2026-99')).status, 400);
  const health = await (await fetch(url + '/api/health')).json(); assert.equal(health.mode, 'file-demo');
});
test('demo import is idempotent and concurrent imports do not lose rows', async t => {
  const { store } = await fixture(t);
  await store.ingest(csv, 'demo.csv', 'demo', 'demo-key');
  assert.equal((await store.ingest(csv, 'demo.csv', 'demo', 'demo-key')).already_loaded, true);
  await Promise.all([store.ingest(csv, 'one.csv'), store.ingest(csv, 'two.csv')]);
  assert.equal((await store.rows()).length, 6);
  assert.equal((await store.dashboard()).source_counts.import, 4);
});
test('API blocks foreign origins/hosts, rejects malformed content, and AI stays disabled without key', async t => {
  const { url } = await fixture(t);
  assert.equal((await fetch(url + '/api/import', { method: 'POST', headers: { Origin: 'https://outside.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => { const req = request(url + '/api/health', { headers: { Host: 'outside.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await fetch(url + '/api/import', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: csv })).status, 415);
  assert.equal((await fetch(url + '/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  const ai = await fetch(url + '/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) { assert.equal(ai.status, 503); assert.match((await ai.json()).error, /disabled/); }
});
test('PostgreSQL adapter migrations, import rollback, persistence and idempotent seed', { skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run live PostgreSQL integration.' }, async t => {
  const schema = `spendscope_test_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  let store = await new PgStore(process.env.TEST_DATABASE_URL, schema).init();
  t.after(async () => { await store.pool.query(`DROP SCHEMA ${schema} CASCADE`); await store.close(); });
  await store.ingest(csv, 'demo.csv', 'demo', '00000000-0000-4000-8000-000000000001');
  assert.equal((await store.ingest(csv, 'demo.csv', 'demo', '00000000-0000-4000-8000-000000000001')).already_loaded, true);
  await assert.rejects(store.ingest(csv + '2026-02-30,Invalid,1,Food', 'invalid.csv'));
  assert.equal((await store.rows()).length, 2);
  assert.equal((await store.dashboard()).total_cents, 30);
  await store.close();
  store = await new PgStore(process.env.TEST_DATABASE_URL, schema).init();
  assert.equal((await store.rows({ search: 'First' })).length, 1);
  if (process.env.PGLITE_TEST === '1') t.diagnostic('Native constraint/trigger failure rollback proof is skipped for the single-session PGlite wire adapter. CI runs it against native PostgreSQL.');
  else {
    await assert.rejects(store.ingest(csv, 'bad-kind.csv', 'invalid'));
    await store.pool.query("CREATE FUNCTION reject_second_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.description = 'Second' THEN RAISE EXCEPTION 'injected test failure'; END IF; RETURN NEW; END $$");
    await store.pool.query('CREATE TRIGGER reject_second BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION reject_second_row()');
    await assert.rejects(store.ingest(csv, 'partial-failure.csv'), /injected test failure/);
    assert.equal((await store.rows()).length, 2, 'the first inserted row must roll back when the second insert fails');
    await store.pool.query('DROP TRIGGER reject_second ON transactions');
  }
  const batches = await store.pool.query('SELECT count(*)::int AS count FROM imports'); assert.equal(batches.rows[0].count, 1);
});

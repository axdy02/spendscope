import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { parseCsv, filterRows, analyze } from './domain.js';

export class FileStore {
  mode = 'file-demo';
  constructor(filename) { this.filename = filename; this.queue = Promise.resolve(); }
  async init() { await fs.mkdir(path.dirname(this.filename), { recursive: true }); try { this.data = JSON.parse(await fs.readFile(this.filename, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; this.data = { version: 1, imports: [], rows: [] }; await this.save(this.data); } return this; }
  async save(data) { const temporary = `${this.filename}.${randomUUID()}.tmp`; await fs.writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 }); await fs.rename(temporary, this.filename); }
  async ingest(text, filename = 'transactions.csv', kind = 'import', identifier = randomUUID()) {
    const parsed = parseCsv(text);
    const operation = this.queue.then(async () => {
      if (this.data.imports.some(item => item.id === identifier)) return { imported: 0, already_loaded: true };
      if (this.data.rows.length + parsed.length > 100_000) throw new Error('Demo storage supports up to 100,000 rows. Start with PostgreSQL for larger data.');
      const rows = parsed.map(row => ({ ...row, id: randomUUID(), source: kind, import_id: identifier }));
      const next = { ...this.data, imports: [...this.data.imports, { id: identifier, filename: path.basename(filename).slice(0, 100), kind }], rows: [...this.data.rows, ...rows] };
      await this.save(next); this.data = next;
      return { imported: rows.length, already_loaded: false, import_id: identifier };
    });
    this.queue = operation.catch(() => {}); return operation;
  }
  async rows(filters = {}) { return filterRows(this.data.rows, filters); }
  async dashboard(filters = {}) { return analyze(await this.rows(filters), this.data.rows); }
  async close() { await this.queue; }
}

export class PgStore {
  mode = 'postgresql';
  constructor(connectionString, schema = 'public') {
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Invalid PostgreSQL schema.');
    this.schema = schema;
    this.pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
  }
  async init() {
    if (this.schema !== 'public') await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
    await this.pool.query(await fs.readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8'));
    return this;
  }
  async ingest(text, filename = 'transactions.csv', kind = 'import', identifier = randomUUID()) {
    const rows = parseCsv(text), client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query('INSERT INTO imports(id,filename,kind) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING RETURNING id', [identifier, path.basename(filename).slice(0, 100), kind]);
      if (!inserted.rowCount) { await client.query('COMMIT'); return { imported: 0, already_loaded: true }; }
      for (const row of rows) await client.query('INSERT INTO transactions(id,date,description,amount_cents,category,import_id) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), row.date, row.description, row.amount_cents, row.category, identifier]);
      await client.query('COMMIT');
      return { imported: rows.length, already_loaded: false, import_id: identifier };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async rows(filters = {}) {
    const conditions = [], values = [];
    const add = (sql, value) => { values.push(value); conditions.push(sql.replace('?', `$${values.length}`)); };
    if (filters.month) add("to_char(t.date,'YYYY-MM')=?", filters.month);
    if (filters.category) add('t.category=?', filters.category);
    if (filters.source) add('i.kind=?', filters.source);
    if (filters.search) add("strpos(lower(t.description || ' ' || t.category),lower(?))>0", filters.search);
    const result = await this.pool.query("SELECT t.id,t.date::text,t.description,t.amount_cents,t.category,t.import_id,i.kind AS source FROM transactions t JOIN imports i ON t.import_id=i.id" + (conditions.length ? ' WHERE ' + conditions.join(' AND ') : '') + ' ORDER BY t.date DESC,t.id DESC', values);
    return result.rows;
  }
  async dashboard(filters = {}) { const allRows = await this.rows(); return analyze(filterRows(allRows, filters), allRows); }
  async close() { await this.pool.end(); }
}

import { parse } from 'csv-parse/sync';

export const MAX_CSV_BYTES = 1_048_576;
export const MAX_ROWS = 5000;
export const FIELDS = ['date', 'description', 'amount', 'category'];
export class ValidationError extends Error {
  constructor(errors) { super('No transactions imported. Fix the CSV and try again.'); this.errors = errors; }
}
export function parseCsv(text) {
  if (typeof text !== 'string') throw new ValidationError([{ line: 1, message: 'CSV must be text.' }]);
  if (Buffer.byteLength(text, 'utf8') > MAX_CSV_BYTES) throw new ValidationError([{ line: 1, message: 'CSV exceeds the 1 MiB limit.' }]);
  let records;
  try { records = parse(text, { bom: true, info: true, skip_empty_lines: true, relax_column_count: true, max_record_size: 100_000 }); }
  catch (error) { throw new ValidationError([{ line: error.lines || 1, message: `Malformed CSV: ${error.message}` }]); }
  if (!records.length) throw new ValidationError([{ line: 1, message: 'CSV is empty. Add a header and at least one transaction.' }]);
  const header = records.shift().record.map(name => name.trim().toLowerCase());
  if (header.length !== 4 || new Set(header).size !== 4 || !FIELDS.every(name => header.includes(name))) {
    throw new ValidationError([{ line: 1, message: 'Header must contain date, description, amount, category exactly once.' }]);
  }
  const populated = records.filter(({ record }) => record.some(value => value.trim()));
  if (!populated.length) throw new ValidationError([{ line: 2, message: 'Add at least one transaction below the header.' }]);
  if (populated.length > MAX_ROWS) throw new ValidationError([{ line: populated[MAX_ROWS].info.lines, message: 'CSV has more than 5,000 transactions. Split the file.' }]);
  const errors = [], rows = [];
  for (const { record, info } of populated) {
    const line = info.lines;
    if (record.length !== 4) { errors.push({ line, message: 'Expected four columns. Quote descriptions that contain commas.' }); continue; }
    const row = Object.fromEntries(header.map((name, index) => [name, record[index].trim()]));
    const before = errors.length;
    const parsedDate = new Date(`${row.date}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== row.date || row.date.startsWith('0000')) {
      errors.push({ line, field: 'date', message: 'Date must be a real calendar date in YYYY-MM-DD format.' });
    }
    for (const [field, maximum] of [['description', 200], ['category', 60]]) {
      if (!row[field] || row[field].length > maximum || /[\x00-\x1f\x7f]/.test(row[field])) errors.push({ line, field, message: `${field} must be 1–${maximum} characters without control characters.` });
    }
    const amountValid = /^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(row.amount);
    const [whole, fraction = ''] = row.amount.split('.');
    const cents = amountValid ? Number(whole) * 100 + Number(fraction.padEnd(2, '0')) : NaN;
    if (!amountValid || cents > 100_000_000) errors.push({ line, field: 'amount', message: 'Use a nonnegative expense up to 1000000.00 with at most two decimals. No currency symbols or separators.' });
    if (errors.length === before) rows.push({ date: row.date, description: row.description, amount_cents: cents, category: row.category });
    if (errors.length >= 50) break;
  }
  if (errors.length) throw new ValidationError(errors.slice(0, 50));
  return rows;
}
export function validateFilters(input = {}) {
  const result = Object.fromEntries(['month', 'category', 'search', 'source'].map(key => [key, typeof input[key] === 'string' ? input[key].trim() : '']));
  if (result.month && !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(result.month)) throw new Error('Month must use YYYY-MM format.');
  if (result.category.length > 60 || result.search.length > 200) throw new Error('Category or search is too long.');
  if (result.source && !['demo', 'import'].includes(result.source)) throw new Error('Source must be demo or import.');
  return result;
}
export function filterRows(rows, filters) {
  return rows.filter(row => (!filters.month || row.date.startsWith(filters.month)) && (!filters.category || row.category === filters.category) && (!filters.source || row.source === filters.source) && (!filters.search || `${row.description} ${row.category}`.toLowerCase().includes(filters.search.toLowerCase()))).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
export const dollars = cents => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
const median = values => { const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
export function analyze(rows, allRows) {
  const categories = new Map(), months = new Map(), merchants = new Map(), byCategory = new Map();
  for (const row of rows) {
    categories.set(row.category, (categories.get(row.category) || 0) + row.amount_cents);
    months.set(row.date.slice(0, 7), (months.get(row.date.slice(0, 7)) || 0) + row.amount_cents);
    const key = row.description.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!merchants.has(key)) merchants.set(key, []);
    merchants.get(key).push(row);
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category).push(row);
  }
  const total = rows.reduce((sum, row) => sum + row.amount_cents, 0);
  const recurring = [...merchants.values()].filter(entries => entries.length >= 3 && new Set(entries.map(row => row.date.slice(0, 7))).size >= 2).map(entries => ({ merchant: entries[0].description, count: entries.length, months: new Set(entries.map(row => row.date.slice(0, 7))).size, total_cents: entries.reduce((sum, row) => sum + row.amount_cents, 0) })).sort((a, b) => b.total_cents - a.total_cents);
  const anomalies = [];
  for (const [category, entries] of byCategory) {
    if (entries.length < 5) continue;
    const typical = median(entries.map(row => row.amount_cents));
    for (const row of entries) if (row.amount_cents > 3 * typical && row.amount_cents - typical >= 2500) anomalies.push({ ...row, category, median_cents: typical });
  }
  anomalies.sort((a, b) => b.amount_cents - a.amount_cents);
  return { count: rows.length, total_cents: total, total: dollars(total), average_cents: rows.length ? Math.round(total / rows.length) : 0,
    category_totals: [...categories].map(([category, amount_cents]) => ({ category, amount_cents })).sort((a, b) => b.amount_cents - a.amount_cents),
    monthly_trend: [...months].map(([month, amount_cents]) => ({ month, amount_cents })).sort((a, b) => a.month.localeCompare(b.month)),
    recurring: recurring.slice(0, 12), anomalies: anomalies.slice(0, 12), recurring_count: recurring.length, anomaly_count: anomalies.length,
    dimensions: { categories: [...new Set(allRows.map(row => row.category))].sort(), months: [...new Set(allRows.map(row => row.date.slice(0, 7)))].sort().reverse() },
    source_counts: { demo: allRows.filter(row => row.source === 'demo').length, import: allRows.filter(row => row.source === 'import').length },
    rules: { recurring: 'Same description after lowercasing and replacing punctuation with spaces; at least 3 transactions across at least 2 calendar months within the current filters. Repeated merchants are not proof of subscriptions.', anomalies: 'For categories with at least 5 filtered transactions: amount exceeds 3× the category median and is at least $25 above it. This rule can flag legitimate purchases. This app offers data analytics, not financial advice.' } };
}
function csvCell(value) {
  let text = String(value);
  if (text.trimStart().startsWith('=') || /^[+\-@]/.test(text.trimStart())) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function exportCsv(rows) { return '\ufeff' + [FIELDS.join(','), ...rows.map(row => [row.date, row.description, dollars(row.amount_cents), row.category].map(csvCell).join(','))].join('\r\n') + '\r\n'; }

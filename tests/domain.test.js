import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, exportCsv, filterRows, parseCsv, validateFilters, ValidationError } from '../server/domain.js';
const header = 'date,description,amount,category\n';
test('CSV accepts BOM, reordered columns, quoted commas and exact cents', () => {
  const rows = parseCsv('\ufeffcategory,amount,date,description\nFood,0.10,2026-06-01,"Market, West"\nFood,0.20,2026-06-02,Coffee\n');
  assert.equal(rows[0].description, 'Market, West');
  assert.equal(rows.reduce((sum, row) => sum + row.amount_cents, 0), 30);
});
test('CSV reports physical line, field and calendar errors without partial acceptance', () => {
  assert.throws(() => parseCsv(header + '2026-06-01,Coffee,4.75,Food\n2026-02-30,Coffee,1.234,Food'), error => error instanceof ValidationError && error.errors.some(item => item.line === 3 && item.field === 'date') && error.errors.some(item => item.field === 'amount'));
});
test('date validation handles leap years and strict ISO format', () => {
  assert.equal(parseCsv(header + '2024-02-29,Coffee,1,Food')[0].date, '2024-02-29');
  for (const date of ['2025-02-29', '2026-6-01', '0000-01-01', '2026-13-01']) assert.throws(() => parseCsv(header + `${date},Coffee,1,Food`), ValidationError);
});
test('money rejects negative, exponent, currency symbols, excessive decimals and oversized values', () => {
  for (const amount of ['-1', '1e2', '$12', '0.001', '1000000.01', 'NaN', '01.20']) assert.throws(() => parseCsv(header + `2026-06-01,Coffee,${amount},Food`), ValidationError);
  assert.equal(parseCsv(header + '2026-06-01,Coffee,1000000.00,Food')[0].amount_cents, 100000000);
  assert.equal(parseCsv(header + '2026-06-01,Coffee,4.5,Food')[0].amount_cents, 450);
});
test('CSV rejects duplicate headers, empty rows, malformed quoting and upload caps', () => {
  for (const csv of ['', header, 'date,date,amount,category\n2026-06-01,x,1,Food', header + '2026-06-01,"unclosed,1,Food']) assert.throws(() => parseCsv(csv), ValidationError);
  assert.throws(() => parseCsv('x'.repeat(1048577)), ValidationError);
  assert.throws(() => parseCsv(header + '2026-06-01,Coffee,1,Food\n'.repeat(5001)), ValidationError);
});
test('analytics calculates category/month totals, recurrence and transparent outlier rule', () => {
  const rows = [1000, 1100, 1200, 1000, 900, 20000].map((amount_cents, index) => ({ id: String(index), date: `2026-0${index % 3 + 1}-01`, description: index < 5 ? 'Same Merchant' : 'Large purchase', category: 'Shopping', amount_cents, source: 'demo' }));
  const summary = analyze(rows, rows);
  assert.equal(summary.total_cents, 25200);
  assert.equal(summary.category_totals[0].amount_cents, 25200);
  assert.equal(summary.monthly_trend.length, 3);
  assert.equal(summary.recurring[0].count, 5);
  assert.equal(summary.anomalies[0].amount_cents, 20000);
  assert.equal(summary.anomalies[0].median_cents, 1050);
  assert.equal(analyze(rows.slice(0, 4), rows).anomalies.length, 0);
});
test('filters are literal and dimension options remain global', () => {
  const rows = [{ id: 'a', date: '2026-06-01', description: '100% Coffee', category: 'Food', amount_cents: 100, source: 'import' }, { id: 'b', date: '2026-05-01', description: 'Bus', category: 'Transport', amount_cents: 100, source: 'demo' }];
  const filtered = filterRows(rows, validateFilters({ search: '%', source: 'import', month: '2026-06' }));
  assert.equal(filtered.length, 1);
  assert.equal(analyze(filtered, rows).dimensions.categories.length, 2);
  assert.throws(() => validateFilters({ month: '2026-99' }));
});
test('CSV export uses precise amounts, escaped quotes and spreadsheet formula protection', () => {
  const output = exportCsv([{ date: '2026-06-01', description: '=SUM(1,2)', amount_cents: 10, category: 'Food' }, { date: '2026-06-02', description: '"Quoted", coffee', amount_cents: 20, category: '+Formula' }]);
  assert.match(output, /0\.10/); assert.match(output, /'\=SUM/); assert.match(output, /""Quoted""/); assert.match(output, /'\+Formula/);
});

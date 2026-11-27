import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateContext, createExplainer, GEMINI_MODEL, validateOutput } from '../server/ai.js';
const summary = { count: 6, total_cents: 30000, average_cents: 5000, category_totals: [{ category: 'Sensitive private label', amount_cents: 25000 }, { category: 'Other', amount_cents: 5000 }], monthly_trend: [{ month: '2026-05', amount_cents: 10000 }, { month: '2026-06', amount_cents: 20000 }], recurring: [{ merchant: 'Private merchant' }], anomalies: [] };
const available = async () => ({ ok: true, json: async () => ({ supportedGenerationMethods: ['generateContent'] }) });
test('AI rejects absent key and model outside allowlist without calling provider', async () => {
  let called = false;
  await assert.rejects(createExplainer({ apiKey: '', fetchImpl: async () => { called = true; } }).explain(summary), /disabled/);
  await assert.rejects(createExplainer({ apiKey: 'test', model: 'unapproved', fetchImpl: async () => { called = true; } }).explain(summary), /allowlisted/);
  assert.equal(called, false);
});
test('LangGraph workflow sends only aggregates, accepts allowed topics and caches results', async () => {
  let calls = 0;
  const service = createExplainer({ apiKey: 'test', fetchImpl: available, generate: async prompt => { calls++; assert.doesNotMatch(prompt, /Private merchant|Sensitive private label/); return '{"observations":["sample_scope","category_concentration"]}'; } });
  const result = await service.explain(summary);
  assert.equal(result.model, GEMINI_MODEL); assert.match(result.explanation, /\$300\.00/); assert.match(result.explanation, /83\.3%/);
  assert.equal((await service.explain(summary)).cached, true); assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(aggregateContext(summary)), /merchant|Sensitive private/);
});
test('model unavailable or unsupported generation does not call generation', async () => {
  let called = false;
  const generate = async () => { called = true; };
  await assert.rejects(createExplainer({ apiKey: 'test', fetchImpl: async () => ({ ok: false }), generate }).explain(summary), /unavailable/);
  await assert.rejects(createExplainer({ apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => ({ supportedGenerationMethods: [] }) }), generate }).explain(summary), /does not support/);
  assert.equal(called, false);
});
test('malformed, invented and ineligible AI output is rejected', async () => {
  for (const raw of ['not json', '{"observations":["buy_stocks"]}', '{"observations":["outlier_review"]}', '{"observations":["sample_scope"],"made_up_total":999}', '{"observations":[]}']) assert.throws(() => validateOutput(raw, aggregateContext(summary)));
  await assert.rejects(createExplainer({ apiKey: 'test', fetchImpl: available, generate: async () => 'malformed' }).explain(summary), /malformed/);
});

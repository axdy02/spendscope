import { createHash } from 'node:crypto';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
export class AIError extends Error { constructor(message, status = 503) { super(message); this.status = status; } }
export function aggregateContext(summary) {
  const top = summary.category_totals[0]?.amount_cents || 0;
  return { count: summary.count, total_cents: summary.total_cents, average_cents: summary.average_cents,
    category_count: summary.category_totals.length, top_category_share: summary.total_cents ? top / summary.total_cents : 0,
    monthly_totals: summary.monthly_trend.map(row => ({ month: row.month, amount_cents: row.amount_cents })),
    recurring_groups: summary.recurring_count ?? summary.recurring.length, flagged_transactions: summary.anomaly_count ?? summary.anomalies.length };
}
export function eligibleTopics(context) {
  const topics = ['sample_scope'];
  if (context.category_count > 1) topics.push(context.top_category_share >= .4 ? 'category_concentration' : 'category_distribution');
  if (context.monthly_totals.length >= 2) topics.push('monthly_comparison');
  if (context.recurring_groups) topics.push('repeated_merchants');
  if (context.flagged_transactions) topics.push('outlier_review');
  return topics;
}
export function validateOutput(raw, context) {
  let payload;
  try { payload = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { throw new AIError('Gemini returned malformed output. No explanation was accepted.', 502); }
  const allowed = eligibleTopics(context);
  if (!payload || Object.keys(payload).some(key => key !== 'observations') || !Array.isArray(payload.observations) || !payload.observations.length || payload.observations.length > 4 || new Set(payload.observations).size !== payload.observations.length || payload.observations.some(value => typeof value !== 'string' || !allowed.includes(value))) throw new AIError('Gemini returned an unsupported observation. No explanation was accepted.', 502);
  return payload.observations;
}
export function renderExplanation(topics, context) {
  const dollars = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  const sentences = {
    sample_scope: `This filtered view contains ${context.count} transactions totaling ${dollars(context.total_cents)}. Its average transaction is ${dollars(context.average_cents)}.`,
    category_concentration: `The largest category accounts for ${(context.top_category_share * 100).toFixed(1)}% of spending in this view, so the category breakdown is a useful place to explore its composition.`,
    category_distribution: `Spending is spread across ${context.category_count} categories, with no single category reaching 40% of the total in this view.`,
    monthly_comparison: `The chart compares ${context.monthly_totals.length} observed calendar months. Missing months and incomplete imports can affect comparisons.`,
    repeated_merchants: `${context.recurring_groups} merchant groups meet the repetition rule in this view. Repetition alone does not establish a subscription.`,
    outlier_review: `${context.flagged_transactions} transactions meet the outlier rule in this view. These rule-based flags may reflect legitimate purchases and do not establish fraud.`,
  };
  return topics.map(topic => sentences[topic]).join(' ');
}
export function createExplainer({ apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || GEMINI_MODEL, fetchImpl = fetch, generate, now = Date.now } = {}) {
  const cache = new Map(); let active = false; let recent = [];
  return {
    configured: Boolean(apiKey),
    async explain(summary) {
      if (!apiKey) throw new AIError('AI explanation is disabled. Add a server-side GOOGLE_API_KEY or GEMINI_API_KEY to enable Gemini. Charts and analytics work without AI.');
      if (model !== GEMINI_MODEL) throw new AIError(`Only the configured allowlisted model ${GEMINI_MODEL} is supported. No fallback model is used.`);
      if (!summary.count) throw new AIError('Import or select transactions before requesting an explanation.', 400);
      const context = aggregateContext(summary), key = createHash('sha256').update(JSON.stringify(context)).digest('hex');
      const cached = cache.get(key);
      if (cached && now() - cached.at < 3_600_000) return { ...cached.value, cached: true };
      recent = recent.filter(time => now() - time < 86_400_000);
      if (active || recent.filter(time => now() - time < 3_600_000).length >= 6 || recent.length >= 20) throw new AIError('AI request limit reached. Retry later; analytics remain available.', 429);
      active = true; recent.push(now());
      try {
        const State = Annotation.Root({ input: Annotation(), context: Annotation(), raw: Annotation(), observations: Annotation(), explanation: Annotation() });
        const graph = new StateGraph(State)
          .addNode('prepare_aggregates', state => ({ context: state.input }))
          .addNode('generate_topics', async state => {
            let response;
            try { response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}`, { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(6000) }); } catch { throw new AIError('Gemini availability could not be verified. No generation was attempted.'); }
            if (!response.ok) throw new AIError('The selected Gemini model is unavailable for this key. No fallback model was called.');
            const metadata = await response.json();
            if (!metadata.supportedGenerationMethods?.includes('generateContent')) throw new AIError('The selected Gemini model does not support content generation.');
            const allowed = eligibleTopics(state.context);
            const prompt = `You select factual data-analytics observation topics. Return only JSON {"observations":["topic"]}, selecting 1 to 4 unique topics from this exact allowed set: ${JSON.stringify(allowed)}. Do not generate figures, advice, extra keys, or narrative text. Aggregated context: ${JSON.stringify(state.context)}`;
            if (generate) return { raw: await generate(prompt, { context: state.context, model }) };
            const llm = new ChatGoogleGenerativeAI({ apiKey, model, temperature: 0, maxOutputTokens: 1024, maxRetries: 0 });
            let message;
            try { message = await llm.invoke(prompt, { signal: AbortSignal.timeout(20_000) }); } catch { throw new AIError('Gemini generation failed or timed out. No explanation was accepted.'); }
            const raw = typeof message.content === 'string' ? message.content : message.content.filter(part => part.type === 'text').map(part => part.text).join('');
            return { raw };
          })
          .addNode('validate_and_render', state => { const observations = validateOutput(state.raw, state.context); return { observations, explanation: renderExplanation(observations, state.context) }; })
          .addEdge(START, 'prepare_aggregates').addEdge('prepare_aggregates', 'generate_topics').addEdge('generate_topics', 'validate_and_render').addEdge('validate_and_render', END).compile();
        const output = await graph.invoke({ input: context });
        const value = { explanation: output.explanation, observations: output.observations, model, cached: false, context_policy: 'aggregate-only; no raw merchants or individual transactions' };
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(key, { at: now(), value }); return value;
      } finally { active = false; }
    },
  };
}

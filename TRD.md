# SpendScope technical requirements

## Actual stack and modules

Node.js 22+ hosts Express 5. React 19 is built by Vite; Motion handles selected transitions. `pg` implements PostgreSQL access. `csv-parse` parses UTF-8 CSV into arrays with physical line metadata. LangGraph and LangChain's Google integration implement the optional Gemini path.

| Module | Responsibility |
| --- | --- |
| `src/main.jsx` | Controlled filters, fetch cancellation, upload, charts, ledger, pagination, patterns, AI state |
| `src/components/*` | Shared decorative icons and accessible animated financial values |
| `src/features/analytics/Trend.jsx` | SVG monthly trend plus exact-value HTML table and reduced-motion behavior |
| `src/lib/*` | Shared HTTP errors and locale-aware dollar/calendar formatting |
| `src/styles.css` | Paper/teal tokens, editorial layout, responsive ledger, focus and reduced-motion rules |
| `server/index.js` | Environment validation, explicit storage selection, startup/seed/shutdown |
| `server/app.js` | Express security middleware, HTTP contracts, static built frontend, error mapping |
| `server/domain.js` | Complete CSV validation, cents, filters, analytics and safe CSV export |
| `server/store.js` | FileStore serialization/atomic writes and PgStore transactions/queries |
| `server/ai.js` | Aggregate sanitization, Gemini preflight, LangGraph, strict topics, limits/cache |
| `migrations/001_initial.sql` | PostgreSQL tables, constraints and indexes |
| `tests/*.test.js` | Domain, API/storage and mocked AI tests; optional live PG test |

## HTTP contracts

All API responses are JSON except CSV export. No authentication tokens are implemented. Errors return `{error:string}`; CSV validation also returns `errors:[{line,field?,message}]`.

| Method / path | Input | Response / errors |
| --- | --- | --- |
| GET `/api/health` | None | `status,app,version,mode,ai_configured`; configured is not proof of live model availability |
| GET `/api/dashboard` | Optional `search,category,month,source` query | `count,total_cents,total,average_cents,category_totals,monthly_trend,recurring,anomalies,recurring_count,anomaly_count,dimensions,source_counts,rules` |
| GET `/api/transactions` | Same filters; `page` default 1; `limit` default 20, maximum 100; `sort` | Matching `transactions,count,page,limit`; 400 for invalid pagination/sort |
| POST `/api/import` | JSON `{csv:string,filename?:string}` | 201 `{imported,already_loaded,import_id}`; 415 wrong type; 422 CSV errors; 413 body limit; 500 save failure |
| GET `/api/export` | Same filters | BOM-prefixed UTF-8 CSV, attachment filename `spendscope-export.csv` |
| POST `/api/explain` | JSON filter object | `explanation,observations,model,cached,context_policy`; 503 unconfigured/unavailable, 502 invalid output, 429 attempt limit, 400 no data |
| GET `/sample.csv` | None | Downloadable three-row CSV example |

Filter validation: month is `YYYY-MM` with 01–12; category maximum 60 chars; search maximum 200 chars; source is demo/import or empty. Normal unknown query keys are ignored. Sort values are `date_desc,date_asc,amount_desc,amount_asc`.

## Ingestion and numerical invariants

CSV parser accepts optional BOM, empty physical lines, standard quotes, and exactly four distinct required headers. It first parses the whole file, validates every nonempty record, and returns no rows on error. Limits are 1,048,576 UTF-8 bytes, 5,000 rows and 100,000 characters per CSV record. Express additionally caps the JSON envelope at 6 MB. Up to 50 field errors are collected.

Money is validated as a plain decimal string before conversion: integer part × 100 plus a zero-padded one/two-digit fraction. No binary floating-point parsing is used for imported money. Integer cents are persisted; totals are integer addition. Per-row limit is 100,000,000 cents. Average uses `Math.round(total/count)`; even-count medians can retain a half cent for rule comparison. The file adapter is capped at 100,000 total rows; PostgreSQL currently targets modest datasets and has no artificial overall row cap.

Dates must match four-digit ISO and round-trip through a UTC calendar parse; year 0000 is rejected. User text is trimmed, length bounded and free of ASCII control characters. React escapes rendering. Export quotes standard CSV special characters and prefixes `=,+,-,@` with an apostrophe to reduce spreadsheet formula execution.

Every normal upload gets a random UUID import ID and transaction IDs. The fixed UUID synthetic import makes seeding idempotent through unique keys. Content itself is not deduplicated; repeated uploads append deliberately. Synthetic and normal imports use the same transaction schema with source derived from import kind.

## Storage and transaction boundaries

PostgreSQL schema is documented in [docs/schema.md](docs/schema.md). `PgStore.ingest` validates first, obtains a pool connection, begins a transaction, inserts the import with conflict handling, inserts every transaction with parameterized SQL, then commits. Any SQL error rolls back. A repeated seed ID is a no-op. Startup executes the idempotent initial migration; migration history/versioning is a future requirement.

FileStore validates first, serializes mutations through one promise queue, writes the entire next state to a unique temporary file, atomically renames it, and only then updates memory. This avoids lost concurrent imports within one process. It is not safe for multiple processes sharing one file and has no external lock or journal.

PostgreSQL row filters are parameterized and use literal `strpos` search instead of wildcard LIKE semantics. Dashboard analytics currently materialize all rows to compute global dimensions and filtered analytics together. Pagination is implemented in Node after reading filtered rows. SQL aggregation and database pagination are required before claiming large-dataset performance.

## Analytics specification

- Category totals: sum amount cents grouped by exact category text.
- Monthly totals: sum by first seven ISO date characters, sorted chronologically; absent months stay absent.
- Recurrence key: lowercase description, replace every non-Unicode-letter/non-number run with a space, trim. Require three occurrences and two observed months. Sort by total cents, return at most 12 plus full group count.
- Outliers: group filtered rows by category; require five rows; compute median; flag `amount > 3*median && amount-median >= 2500`. Return 12 highest amounts plus full flag count.
- Global dimensions are calculated from the entire dataset, while all analytics use the active filter set.

Rule output is an exploration aid. It does not establish subscriptions, fraud, causality, forecasting or advice. Changing filters changes sample size and median.

## Optional AI graph and trust boundaries

`createExplainer` allows only `gemini-3.5-flash-lite`, with a key from GOOGLE_API_KEY/GEMINI_API_KEY. The graph has three sequential nodes: prepare aggregate context, preflight/generate allowed topic selection, validate and render. No retries, tool calls, external search, checkpoint persistence or autonomous background generation occur.

Allowed context contains transaction count, total/average cents, category count, top-category share, monthly aggregate totals, repeated-group count and outlier count. Category labels, merchants, dates of individual rows and raw records are removed **before graph invocation**. Gemini receives eligible code names and aggregates. Output must contain only an `observations` array of 1–4 unique eligible codes. Server templates derive all displayed figures from the context, preventing generated numerical claims from entering the UI.

Preflight: Google Models REST metadata with key in `x-goog-api-key`; require HTTP success and `generateContent` in supported methods. Generation: LangChain ChatGoogleGenerativeAI with temperature 0, maxOutputTokens 1024, maxRetries 0 and AbortSignal timeout. Preflight timeout is six seconds; generation timeout is twenty. The one-hour cache uses SHA-256 of aggregate context, keeps up to 100 entries, and never includes raw transaction text.

One generation can be active; attempts are limited to six per rolling hour and twenty per rolling day in memory. Failed attempts count. Restart clears limits/cache. This is insufficient for enforcing paid account-level budgets. Missing credentials and live failures are explicit API errors; no deterministic content is passed off as a fake AI response.

## Security and operations

Default listener is 127.0.0.1. Docker uses 0.0.0.0 internally with loopback-only host publication. Middleware rejects non-local Host and cross-origin browser requests. An explicit local DEV_ORIGIN enables Vite development. Production CSP permits own scripts/resources and inline styles required by React/Motion; no third-party script or font fetch is needed. HTML uses React escaping, SQL uses parameters, request size is bounded, and unknown static paths are not arbitrary filesystem reads.

The optional comma-separated `INTERNAL_HEALTH_HOSTS` DNS allowlist, empty by default, permits configured container names with optional request ports only for exact `GET`/`HEAD /api/health`. Existing Origin checks still run. Initialization rejects wildcard, URL, and configured-port entries. Standalone Compose sets `app`; portfolio Compose sets `spendscope`. Business reads, imports, and explanation writes retain localhost Host enforcement, and forwarded Host headers are not trusted.

This is a single-user local app, without authentication, authorization, TLS termination, tenant isolation, audit logs, database backup scheduling, durable AI quotas or session management. Do not expose it publicly without those requirements. Secrets stay server-side and `.env` is ignored.

## Verification and delivery limits

node:test covers domain constraints, atomic bad uploads, persistence/reconnect, demo write serialization, origin/host checks, filtered export, and strict/mock AI behavior. PG tests create a disposable namespace and delete only that namespace. Local native PostgreSQL18.4 verification passed migration/idempotency/query/reconnect checks, CHECK rejection, and an injected second-row trigger failure proving that the first row and batch metadata roll back. Native CI is configured with PostgreSQL17. An additional PGlite wire check verifies migrations/querying/seeding/reconnect; its deliberate database-error rollback proofs are explicitly omitted only under PGLITE_TEST because that optional endpoint misframes failed-transaction messages.

Vite production build and 16 core tests have passed; the PostgreSQL adapter test passed separately against native PostgreSQL. The latest core run includes configured GET/HEAD container-health access, default/unknown/forwarded-host denial, blocked business routes and writes, and unchanged origin enforcement. Docker assets and CI are supplied but were not locally executed. Live Gemini generation, model availability for a real account, numerical-topic selection quality and billing are unverified without a real key. No load benchmark or multi-user claim is made.

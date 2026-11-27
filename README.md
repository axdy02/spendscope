# SpendScope

A spending CSV explorer built with **React, Express, PostgreSQL, Motion, and an optional LangGraph + Gemini workflow**. An editorial paper-and-teal interface turns expense rows into searchable transactions, monthly trends, category totals, repeated-merchant patterns, and transparent outlier flags.

This is a single-user data analytics application. It makes no financial recommendations and connects to no bank.

## Run the local demo

Requires Node.js 22 or newer; developed and tested on Node.js 24.

```sh
npm ci
npm run build
npm run demo
```

Open **http://localhost:8012**. The demo stores data in `data/spendscope-demo.json`. It is an explicitly labeled **file-backed demo**, not a PostgreSQL simulation. Starting it again adds no duplicate synthetic seed and preserves your imports. The 55 synthetic transactions cover January–June 2026. Use **Source → Your imports** to exclude them.

`npm run demo` serves the already built frontend. Rebuild after editing frontend files. `PORT=8013` changes the API port; on PowerShell use `$env:PORT='8013'` before the command. Stop with Ctrl+C.

## Run with PostgreSQL

```sh
docker compose up --build
```

The included Compose file builds the app and starts PostgreSQL 17 with a named volume, database readiness check, a non-root app container, and loopback-only published ports. It seeds synthetic data once. Remove `SEED_DEMO` from Compose to start an empty database.

`INTERNAL_HEALTH_HOSTS` is an optional comma-separated list of explicit DNS names for container probes. It permits only `GET`/`HEAD /api/health`, retaining existing origin checks; transaction, dashboard, export, and write routes remain localhost-only. Standalone Compose sets `app`; portfolio Compose sets `spendscope`. The default list is empty; wildcard/URL/port entries fail startup validation.

For an existing PostgreSQL server, create a database and configure `DATABASE_URL` from `.env.example`:

```sh
node --env-file=.env server/index.js
```

`npm start` reads environment variables from the process; it does not automatically read `.env`. It **fails clearly without DATABASE_URL**. Migrations run at startup. There is no silent fallback from PostgreSQL to a JSON file. `/api/health` reports the actual storage mode.

For frontend development, set `DEV_ORIGIN=http://localhost:5173`, start the backend, then run `npm run dev`. The Vite dev server proxies `/api` and `/sample.csv` to port 8012. Use the built frontend for the simplest setup.

## CSV contract

```csv
date,description,amount,category
2026-06-01,Corner Coffee,4.75,Dining
2026-06-02,City Transit,18.50,Transport
2026-06-03,"Market, West Branch",62.35,Groceries
```

- UTF-8, optional BOM, up to 1 MiB and 5,000 nonempty rows per upload.
- Exactly these four headers, case-insensitive and in any order; no duplicate headers.
- A real `YYYY-MM-DD` date; expense amounts from `0` to `1000000.00`, with at most two decimals.
- No negative refunds, currency symbols, thousands separators, or exponential notation.
- Description: 1–200 characters. Category: 1–60 characters. Control characters are rejected.
- The dataset is one currency: USD. Do not mix currencies without conversion outside this app.
- Any invalid row rejects the entire import with up to 50 line-level errors.
- Normal uploads append a new batch, even if the same file was uploaded before. Importing a file twice duplicates its transactions. Only the synthetic seed is idempotent.

The UI provides a sample download, search and filters, sorting, pagination, and export of the current filtered view. Export prefixes spreadsheet formulas with an apostrophe; a round trip intentionally preserves that safe text rather than removing the prefix.

## Optional Gemini explanation

Add `GOOGLE_API_KEY` or `GEMINI_API_KEY` on the server. The only allowed model is `gemini-3.5-flash-lite`; the browser never receives the key. Missing keys produce an explicit disabled message, while all analytics remain available.

On an explicit click, LangGraph runs `prepare_aggregates → generate_topics → validate_and_render`. Only counts, aggregate cents, category concentration, and monthly totals enter the graph. Neither merchant names, user category labels, nor individual transactions are sent. Gemini chooses from eligible observation topics; the server renders all numerical facts from calculated data. Unknown topics and malformed output fail closed.

Every uncached call preflights the model metadata and `generateContent` support. The integration has a 1,024 output-token cap, 6-second preflight and 20-second generation timeouts, zero model retries, no provider or model fallback, a one-hour cache, one active generation, and in-memory limits of 6 attempts per hour / 20 per day. Limits reset when the server restarts; these are local demo controls, not a billing guarantee.

Google pricing checked for the selected model during project creation was $0.30 input / $2.50 output per million tokens; verify the [current pricing](https://ai.google.dev/gemini-api/docs/pricing) before enabling paid calls. See [model documentation](https://ai.google.dev/gemini-api/docs/models) and [deprecations](https://ai.google.dev/gemini-api/docs/deprecations). No real key was provided, so **live Gemini availability, response quality, and billing remain unverified**. The optional graph was tested with mocked provider responses.

## Verification

```sh
npm test
npm run build
```

The automated suite covers precise cents, CSV/date validation and upload caps, atomic ingestion, persistence, concurrency in the demo adapter, HTTP APIs, filtering/export, analytics, and mocked AI rejection/cache/privacy behavior. The PostgreSQL suite skips explicitly without `TEST_DATABASE_URL` and owns a disposable schema when enabled:

```sh
# Set TEST_DATABASE_URL in your shell first.
npm run test:postgres
```

Local verification: **16 core tests passed with 1 explicit PostgreSQL skip** in the latest `npm test` run, including real Host-header health probes and preserved origin/business-route defenses. The PostgreSQL adapter test separately passed against native PostgreSQL 18.4. The database proof covered SQL migrations, idempotent insertion, reads, reconnect persistence, CHECK rejection, and an injected failure on the second transaction insert that rolled back the first row and its batch metadata. An additional PGlite wire check also passed; its constraint/trigger failure proofs are explicitly skipped only under `PGLITE_TEST=1` because that optional test endpoint misframes failed-transaction messages. The supplied CI uses native PostgreSQL 17. CI and Docker execution are not claimed as completed locally.

## Architecture and project documents

- [Product requirements](PRD.md): feature scope, workflows, acceptance criteria, error states.
- [Technical requirements](TRD.md): API contracts, validation, analytics, storage, AI controls, tradeoffs.
- [Personalized design](Design.md): tokens, feature-specific states, motion, accessibility and inspiration.
- [Architecture](docs/architecture.md): module boundaries, data flows and deployment.
- [Database schema](docs/schema.md): actual fields, relationships, indexes and transaction boundaries.

There are no authentication, authorization, tenancy, bank sync, transaction editing/deletion, mixed-currency conversion, forecasting, or financial-advice features. Analytics currently load filtered rows into application memory; they target modest datasets. The file demo has a 100,000-row cap and supports one Node process. PostgreSQL provides transaction durability but multi-user access still requires authentication and authorization work.

## Honest resume bullets

- Built a React and Express expense explorer with PostgreSQL persistence, exact integer-cent calculations, atomic CSV imports, filtering, accessible charts, and filtered CSV export.
- Implemented transparent repeated-merchant and category-median outlier analysis, with clearly labeled synthetic data and documented limitations.
- Added a bounded LangGraph workflow that uses Gemini to select validated analytics observations while excluding raw transaction text and rendering numerical facts from calculated values.
- Added node:test coverage for API behavior, persistence, validation, analytics and AI failure handling, plus a Docker deployment and PostgreSQL CI configuration.

Do not claim production scale, actual users, live model evaluation, or measured business impact unless you independently measure them.

## Roadmap

1. Add import review, duplicate-content warnings, undo import, and deterministic merchant aliases.
2. Move analytics and pagination to SQL aggregation for larger datasets; add native PostgreSQL concurrency tests.
3. Add currency metadata and explicit refund semantics before supporting mixed account exports.
4. Add authenticated accounts, tenant-scoped tables, backup/restore and secret management for deployment beyond one user.
5. Evaluate AI topic selection on labeled aggregate fixtures and add a durable quota ledger before paid multi-user usage.

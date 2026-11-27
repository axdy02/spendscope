# SpendScope product requirements

## Product intent and audience

SpendScope helps a person examine an expense spreadsheet without connecting a bank account. It also demonstrates full-stack engineering through a real import pipeline, persistent storage, interactive analytics, transparent rules, and an optional bounded AI workflow. The user owns the underlying files and runs the app locally or in the supplied single-user container stack.

Success for this version is functional and observable: a valid CSV becomes persisted rows; invalid CSV never leaves a partial batch; filters produce matching totals and export; charts have readable alternatives; AI failure never blocks analytics. No adoption, revenue, savings, or production performance metric is asserted.

## Supported modes

**Local demo:** the React frontend and Express API run on port 8012 with an explicit JSON storage adapter. Fifty-five clearly labeled synthetic rows load once. Existing user imports survive restarts. Source filters prevent synthetic rows from being mistaken for user data.

**PostgreSQL:** the same API uses PostgreSQL tables and database transactions. The required DATABASE_URL has no fallback. Compose supplies a PostgreSQL service and optional synthetic seed. The interface identifies its actual mode.

## Feature requirements and acceptance

### 1. CSV import

Workflow: download the example if needed → choose a file in Import data → submit → client checks file size → server validates the whole file → commit one complete batch → show the imported row count and refresh overview.

Acceptance:

- Native labeled file input works with a keyboard and accepts CSV files; the server validates the content independently of file extension.
- Header accepts the four required names in any order and optional BOM. Quoted commas are valid.
- Date, amount, description, category, row-count and byte-count rules match the documented contract.
- Up to 50 errors include physical CSV line numbers and fields where applicable.
- Error summary receives focus and retains the selected file for correction/retry. Upload is disabled during work.
- Any validation or database error leaves no partial transaction batch. Successful import resets selection and filters.
- A normal upload appends all rows. Reuploading identical content deliberately creates another batch; only the synthetic seed is deduplicated by fixed import ID.

States: no file selected, oversized file, malformed CSV, invalid rows, saving, success, database failure. Description text is rendered safely as text. File data remains in the chosen app storage.

### 2. Overview and filters

Workflow: inspect total / count / average → search descriptions or categories → select category, calendar month, and source → review all matching analytics → reset filters.

Acceptance:

- Overview statistics, monthly trend, category totals, ledger, recurrence and outliers use the same active filters.
- Search is literal, case-insensitive substring matching, debounced by 250 ms in the UI.
- Category and month options remain derived from the full dataset so a selected filter cannot eliminate all navigation choices.
- Source distinguishes synthetic seed and user imports. Zero matching rows show useful guidance and a clear-filter control.
- Failed requests show Retry loading and do not present stale ledger rows as current results.
- The average is the arithmetic mean of exact expense cents rounded to one cent.

### 3. Monthly trend and category breakdown

Workflow: inspect the line chart → open View monthly data for exact values → click a category label to focus that category → reset or choose another category.

Acceptance:

- Calendar-month totals use ISO transaction dates, with observed months displayed chronologically.
- Missing months are not filled or predicted; comparisons can be affected by incomplete imports.
- Category bars represent the share of the current filtered total and have adjacent labels and dollar values.
- The chart describes its units and exposes an HTML table alternative. Color alone never communicates a category value.
- Empty and loading states have text instead of a broken chart frame.

### 4. Transaction ledger and export

Workflow: navigate to Transactions → sort by date or amount → page through 20 results → export all matching rows as CSV.

Acceptance:

- Date and amount sort orders each support ascending/descending. Pagination applies after sorting and filtering.
- Every row shows description, category, ISO-derived readable date, exact USD amount and source label.
- Export respects filters but is not limited to the current page; it contains the documented four-column schema.
- Quotes/commas are escaped, and leading spreadsheet formula operators receive an apostrophe.
- A zero-row export contains its header; no fabricated results are created.
- Desktop uses a readable table; mobile presents each transaction as a compact structured row card without page overflow.

### 5. Repeated merchants

Workflow: inspect Familiar faces → compare count, observed month count and sum → open How we find patterns.

Acceptance:

- Normalize descriptions by lowercasing and replacing non-letter/non-number sequences with spaces.
- Include a group only if it contains at least three matching transactions in at least two calendar months under current filters.
- Do not call the result a confirmed subscription. Date cadence, cancellations and merchant aliases are not inferred.
- The API exposes up to 12 sorted groups; the compact UI presents the first four.
- Sparse filters show the minimum-data requirement.

### 6. Transparent outlier flags

Workflow: inspect Standing out → compare a flagged amount to its category median → read the rule.

Acceptance:

- Only categories with at least five filtered rows are evaluated.
- Flag when amount is strictly greater than three times its category median AND at least $25 above that median.
- Median supports even sample counts without rounding away half cents.
- API returns up to 12 flagged rows, sorted by amount; UI presents the first three.
- Explain that legitimate purchases may be flagged; no fraud conclusion or financial advice is presented.

### 7. Optional Gemini explanation

Workflow: user explicitly clicks Explain this view → server verifies configured key/model and limits → sends aggregate-only context → Gemini selects allowed observation topics → server validates and renders factual sentences.

Acceptance:

- No key means a visible disabled explanation, not fake generated output. Analytics always remain usable.
- Only allowlisted `gemini-3.5-flash-lite` is used; metadata preflight must establish content-generation support. There is no fallback provider/model.
- No individual transactions, merchant descriptions, or user category labels enter the prompt or graph state.
- Gemini output contains eligible observation codes only. Unsupported topics, fabricated extra fields and malformed JSON are rejected.
- Dollar figures in the displayed explanation are calculated by server code, not copied from generated prose.
- Calls obey cache, concurrency, timeout, token and in-memory attempt limits. UI labels accepted content AI generated and asks the reader to verify it against charts.

States: unconfigured, no matching data, generating, accepted, cached, unavailable model, malformed output, timeout, quota reached. Real-key quality testing remains future work.

## Accessibility and delivery requirements

- Visible form labels, native select/file controls, focus rings, a skip link, semantic headings, region and table labels, and import error focus.
- Responsive layouts at 375, 768, 1024 and wide desktop widths. Controls remain reachable without hover.
- Motion is limited to data transitions, line reveal and list opacity. Reduced-motion preferences are honored.
- No authentication or multiple tenants in this release. Bind localhost by default; container publication remains loopback-only.
- Repository includes PRD, TRD, personalized Design.md, architecture/schema references, documented quickstarts, synthetic/sample CSV, tests, Docker and CI.

## Deferred requirements

Import undo/edit/delete, duplicate-file warnings, account integrations, refunds, currency conversion, budgeting, forecasting, notifications, multi-user sharing, persistent AI quotas and hosted deployment are roadmap items. The current app does not silently imply these capabilities.

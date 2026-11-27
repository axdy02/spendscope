# SpendScope personalized design specification

## Design intent

SpendScope treats a spreadsheet as a readable personal data edition: light paper, rich teal ink, a measured coral accent, serif editorial headings, and compact financial tables. The visual hierarchy begins with a clear overview, then guides the reader from monthly trend to categories, transactions, patterns, and importing their own data. It avoids presenting a speculative score or financial judgment as the primary result.

The UI/UX Pro Max skill supplied a verified flat-design/fintech recommendation and form/accessibility guidance. Its generic bill-splitting recommendation is adapted through `design-system/spendscope/pages/dashboard.md` to this implemented CSV explorer. Runtime tokens below are the source of truth for this personalized screen; no expense-splitting feature is implied.

## Tokens and typography

| Role | Value | Implemented use |
| --- | --- | --- |
| Paper | `#f7f4ed` | App canvas, warmth and low visual noise |
| White paper | `#fffdf8` | Analytics panels, form and ledger |
| Primary ink | `#253b36` | Headings, values, ledger description |
| Secondary ink | `#5b6963` | Help, chart labels, status |
| Teal | `#174e48` | Main total panel, brand, trend, primary actions |
| Coral | `#b84e37` | Intro eyebrow, brand period, focus ring and outlier accent |
| Rule | `#deded3` | Panel separators and low-emphasis outlines |
| Error surface/text | `#fae4de` / `#8a3328` | Import and API errors |
| Pattern surface | `#eee1d6` | Outlier panel |
| Import surface | `#e8ebdf` | Bring-your-own-data section |

Primary body stack is `DM Sans, Arial, sans-serif`; title stack is `DM Serif Display, Georgia, serif`. Font family names are preferred fallbacks, **not bundled external fonts**: runtime works offline with Arial/Georgia and makes no font network request. Currency uses tabular numerals. A future typography release can bundle licensed local WOFF2 assets.

Sizes: h1 approximately 47–67px desktop/mobile; h2 24px; import title 31–37px; main amount 39px; standard interface 12–16px; small editorial metadata 9–11px. Small metadata never serves as the only instruction for a task. Body explanatory text uses generous 1.5–1.75 line height. Monetary values align on the right in the ledger.

Radii: 5–8px for panels and controls, 10px for the brand tile, 4px for source/category chips. Spacing follows a 4/8-derived rhythm with 18px mobile gutters, 28/56px larger gutters, 20–28px panel padding and 24px major grid gaps. Restrained borders replace deep shadows and glossy gradients. SVG line icons share 1.7px strokes and are decorative beside visible labels.

## Layout and breakpoints

- Wide desktop: max-width 1440px; logo, anchor navigation, and mode status share a header. Intro splits large serif type and a small folded-paper import note. Summary uses three horizontal sections. Analytics/ledger use a roughly 1.5:1 grid with insights to the right.
- Below 1100px: gutters and padding contract; nonessential legends/status density decrease.
- At 800px: chart and ledger grids become one column; category totals may form two columns; pattern panels can sit side by side; filters reflow.
- At 560px and below: header wraps navigation, intro note is hidden, main total spans both columns, controls use two columns, categories return to a single list, ledger rows become structured cards, insights and import become stacked.
- At 375px: no page-level horizontal overflow is intended; long descriptions/categories wrap, amounts remain intact, native controls and buttons remain reachable. The heading and metric sizes are reduced without removing important controls.

Anchors Overview, Transactions, and Import data navigate real sections. There are no decorative tabs that imply missing pages. The import entry action appears in the hero note on desktop and in the main navigation everywhere.

## Feature-specific component and state design

### Overview and metrics

The primary total uses a teal field and cream text; count and average use quiet paper backgrounds. The three figures are deliberately different in emphasis. Source badges beside the workspace status make synthetic and imported rows visible before a viewer reads any chart. Labels say “in this view” and “selected filters” so filtered totals cannot be mistaken for account balances.

Loading lowers visual emphasis and announces busy state; failed loading displays a retry banner and suppresses current ledger results. Empty results remain zero-value summaries with useful chart/ledger guidance. AnimatedNumber transitions only calculated values and exposes the exact final value to assistive technology separately.

### Filters and search

Visible labels precede a literal description/category search, category select, month select, and source select. Search is debounced, filter state is controlled by React, and changing filters returns pagination to page one. Reset is disabled when there is nothing to reset. Global option lists remain available even after narrowing the view.

Focus rings use the coral token and never depend on hover. Forms use native controls rather than a custom menu with incomplete keyboard behavior. Input limits match server constraints. Failed fetches use the common error banner, retaining filter choices for retry.

### Monthly trend

The teal line sits above understated dashed gridlines with explicit USD labels. A subtle area tint helps the shape without inventing additional series. Calendar-month labels are reduced when many points would crowd the chart. Points have exact SVG title values, while View monthly data exposes a keyboard-accessible HTML table; the table is the reliable alternative to hover-only tooltips.

Data arrives before the line reveal starts. Reduced motion removes the line-drawing entrance. Empty state explains that importing a CSV starts the monthly picture; loading replaces the chart with textual progress; error directs the user to Retry loading.

### Category totals

Each exact category label is a real button that filters that category. Colored dots and bars are reinforced by category text and numeric dollars. Bar scale is a proportion of the filtered total; there is no false absolute scale. The footnote explains click-to-filter behavior. Categories use distinct dark teal/coral/blue/ochre tones and are never identified only by color.

Motion animates the horizontal transform from a stable origin, preserving panel bounds. No layout-affecting width animation is used. Mobile buttons receive larger targets. Sparse/empty views provide a plain-language suggestion to reset or import.

### Ledger and CSV export

Desktop transactions form a semantic table with descriptions emphasized, category chips, quiet dates and aligned amounts. Sort uses a labeled select; column headers expose active `aria-sort`. Pagination has accessible Previous/Next names and disabled boundary controls. Rows fade briefly when a new matching result set arrives; the list does not auto-scroll or auto-rotate.

Source labels distinguish Synthetic demo and Your import under each description. Mobile cards preserve this distinction and give the amount an explicit USD label. Long text wraps. Export remains the current-view action in the panel heading and exports all matching rows, including off-page rows.

### Familiar faces and Standing out

Recurring merchants use numbered list rows, count/month evidence and total. “How we find patterns” is a native disclosure, not a hidden hover tooltip. A missing pattern explains its sample requirement. The warmer outlier card provides a calm second-look treatment: description, amount/category, median and a readable disclosure. It uses no alarm icon, danger score or fraud claim.

The UI intentionally shows a compact top four recurring merchants and top three flagged transactions. The API provides up to twelve and full counts for programmatic inspection. A future view-all feature belongs in the roadmap rather than a nonfunctional link.

### Import workflow

The section visually separates the editorial explanation from the white upload form. It offers the real sample CSV download, labeled native file picker, size/schema help and the primary Import transactions button. The selected filename stays visible. Upload progress disables submit. Success uses an inline status message; failure uses a focused, scrollable error summary with exact lines/fields, retaining the input so the user can correct/retry.

The form explains atomic ingestion in product terms: checked in full before saving. Detailed persistence mechanics are in technical documents, not pushed into the upload action. Input and error controls fit the narrow-screen layout; primary submit becomes full width.

### Optional AI explanation

The AI section sits after useful deterministic features. It explains aggregate-only disclosure before the user initiates a call and clearly labels accepted output. Explain this view is disabled while data is loading, while generation is active, or if there are no matching rows. Missing configuration, model rejection, quota or malformed output produce a visible inline error; no fake success is displayed.

The reader can always compare the explanation with preceding chart figures. Validated topic selection is intentionally restrained and factual. There is no chatbot textbox, recommendation carousel, model picker or simulated chat history.

## Motion and accessibility

Actual Motion imports come from `motion/react` and are wrapped in `MotionConfig reducedMotion="user"`. Number transitions use approximately 480ms; chart line reveal 650ms; bar transforms 450ms; row opacity 200ms; hero entrance 400ms. Number and line components also inspect `useReducedMotion`. CSS disables smooth scrolling and animation/transition duration when reduced motion is requested.

Skip-to-content, semantic landmarks, sequential headings, native form labels, visible 3px focus rings, table captions, source text, error-focus management and live success/status messages are implemented. Charts include text/data alternatives. User-supplied text is rendered as React text, not HTML. Touch controls target 44px on narrow screens; mobile form font sizes avoid native zoom surprises. Hover supplies additional emphasis but never the only action.

## Sources and feature prompts

The design uses ideas, not copied component source or branding, from:

- [React Bits Count Up](https://reactbits.dev/text-animations/count-up): numerical continuity when filtered totals change. Implemented independently with Motion and final-value accessibility.
- [React Bits Animated List](https://reactbits.dev/components/animated-list): a restrained result-set transition. Implemented as opacity on semantic ledger rows, without replacing the table with a decorative animation.
- [Motion reduced-motion guidance](https://motion.dev/docs/react-accessibility): preserve user preferences and purposeful transitions.
- [React controlled inputs](https://react.dev/reference/react-dom/components/input): predictable filters and form behavior.

Reusable design prompts grounded in these features:

1. “Design an editorial spending explorer on warm paper with deep teal ink and coral accents; prioritize exact totals, source disclosure, and a clear path from trends to raw transactions.”
2. “Animate updated expense totals like a count-up component, but expose final values to screen readers and respect reduced motion; do not invent progress or move surrounding layout.”
3. “Use an animated-list idea for a semantic transaction table: brief row opacity on new data, stable sorting, keyboard pagination, and mobile structured cards.”
4. “Design a CSV import form that retains the selected file after validation failure, focuses line-level errors, and promises whole-batch validation in plain language.”
5. “Present repeated-merchant and outlier rules as transparent statistical exploration with sample requirements and median evidence, without financial judgments.”

## Validation status and future design work

Production build is verified. Automated tests validate the data/API states behind these controls. Root portfolio browser checks provide desktop/mobile rendering evidence; do not infer a completed external accessibility audit from these checks. Future design work includes local font assets, a view-all pattern screen, import history/undo, schema mapping for bank exports, and assistive-technology testing with real users.

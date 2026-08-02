# Data Grid: Build Brief

## 0. How to read this

This brief states intent, constraints, hard seams, budgets, and acceptance.
It deliberately does not dictate class structure, file layout, or internal design.
Where a decision is genuinely yours, it is marked as an open question.

When making technical decisions, do not give much weight to development cost.
Prefer quality, simplicity, robustness, scalability, and long-term maintainability.
We would rather you tear down and rebuild a seam than layer a workaround on a weak one.

Everything you need is in this brief and the attached prototype.
The prototype is a single self-contained HTML file. It is a sample of the kind of thing we might build on top of this grid, included to give you a feel for the product and the interactions we care about.
It is not a target to reproduce, and it is not an architectural reference. How it is wired internally should be ignored.

## 1. What we are building

A neutral data grid that stays butter smooth at 60fps and just as interactive across two extremes:

- Light tables (a few thousand rows, fully in memory).
- Heavy tables (over 2 million rows, worker-backed).

The same product grid code must drive both, unchanged, by swapping only the data source behind it.

## 2. Why the API is neutral (the core strategic bet)

The neutral API exists for insurance and longevity: the render engine must be swappable.
We want to be able to replace the engine underneath without touching product code that consumes the grid.

Two engines must run behind the same API from day one:

- **TanStack (Table + Virtual), DOM-rendered.** Primary engine.
- **Glide Data Grid (canvas-rendered), selectable behind the same API.** Fallback, and our heavy-row performance comparison baseline. https://github.com/glideapps/glide-data-grid

This dual-engine requirement is the single most important design constraint in the whole project.
DOM lets a cell hold arbitrary React; canvas makes you draw it.
A neutral API that drives both therefore cannot have a JSX-first cell contract.
The cell model must be data-first: a column describes a value, an edit intent, and optional draw/overlay hooks, not "render this React node."
Rich custom cells are the hard case and must be designed for on day one.
"Runs on Glide" is a day-one acceptance test, not a later port.

Visual style must not be baked into the engine.
Theming, density, and chrome live in the presentation layer, injected in.

## 3. Architecture

```
┌──────────────────────────────────────────────┐
│  React chrome (app UI, toolbars, drawers)      │
├──────────────────────────────────────────────┤
│  ►► Neutral DataGrid API  ◄◄                    │
│     render engine behind it (TanStack | Glide) │
├──────────────────────────────────────────────┤
│  Command / model layer  (single source of truth)│
├──────────────────────────────────────────────┤
│  Compute: DuckDB-WASM in a Web Worker          │
│  (sort / filter / group / aggregate off-thread)│
├──────────────────────────────────────────────┤
│  Data transport: cursor pagination (Go/Connect)│
│  Calc/validation: Go→WASM (shared client/server)│
│  Collaboration: server-authoritative (Go) + Yjs │
└──────────────────────────────────────────────┘
```

Dependencies point downward only.
The render engine knows nothing about the product.
Product code knows nothing about the render engine.

## 4. The hard seams (get these right and the rest follows)

These are the places where an under-specified decision quietly costs a subsystem.
Treat each as a design constraint.

### 4.1 The cell contract is data-first

Because the API drives both DOM and canvas, a cell is described by data and intent, not by markup.
Custom rich cells are expressed through engine-neutral hooks so each engine renders them its own way.
If you find yourself passing a React node into the neutral API, stop; that is the leak.

### 4.2 Transport is Arrow end to end

Go emits Apache Arrow record batches over Connect.
The worker feeds Arrow into DuckDB-WASM near-zero-copy.
JSON serialization would consume the heavy-table latency budget before any real work happens.
The Arrow decision ties the Go cursor stream and the DuckDB worker into one path.

### 4.3 Compute owns order; the grid requests windows

Sort, filter, group, and aggregate run in the worker (DuckDB-WASM), off the main thread.
The grid never holds the full dataset for a heavy table.
The grid asks the DataSource for a window: "rows [n, n+k) under the current sort and filter."
The compute layer answers from DuckDB.

### 4.4 Presentation order is decoupled from committed data

A row can change state without moving (deferred re-sort).
The grid pins the current window's row-id order until an explicit commit.
Editing a cell does not make its row jump under the user's hands; re-sort happens on commit or on an explicit, debounced trigger.
This is a first-class contract, not a UI hack.

### 4.5 Every mutation flows through the command layer

The command / model layer is the single source of truth.
No component mutates data directly.
Optimistic application, validation, and reconciliation with the authoritative server all live here.

### 4.6 AI is not a special path

AI field suggestions are proposed commands.
AI prompts over the table are command and query producers.
Both emit the same commands and queries the UI emits, through the same command layer and DataSource.
There is one canonical mutation path and one canonical query path; AI just produces inputs to them.

### 4.7 Collaboration: split ephemeral from authoritative

This is a bookkeeping product, so an auto-merged number can be wrong.
Do not let a CRDT auto-merge decide the value of ledger data.

- **Ephemeral collaboration via Yjs:** presence, cursors, selection, comments, transient annotations.
- **Authoritative data mutations via the command log:** server-authoritative (Go), validated (Go→WASM shared rules), reconciled.

Yjs converges presence; the server decides truth for data.

### 4.8 Shared calc and validation

Business calc and validation compile to WASM from Go and run on both client and server, so the rules have one source.
Heavy WASM (DuckDB-WASM, Go→WASM, Arrow) is loaded lazily and worker-side, so a light in-memory table never pays for it.
The DataSource choice, not the grid, controls whether the heavy stack loads at all.

## 5. Layer responsibilities

Described as responsibilities and contracts, not implementations.

### 5.1 Neutral DataGrid API

- Expresses everything the product needs from a grid without leaking engine specifics. The full required capability set is the feature catalog in section 12; that catalog, not this sentence, is the scope.
- Leaks no engine specifics.
- Accepts a render engine (TanStack or Glide) and a DataSource.
- Accepts theming and chrome from outside; owns no visual style.

### 5.2 DataSource abstraction

- One interface, two behaviors: in-memory for light tables, worker-backed for heavy tables.
- The same grid code drives a 5k in-memory table and a 1M worker-backed table with only the DataSource swapped.
- Window-oriented: the grid requests ranges under a query (sort + filter + group); the source returns rows plus counts and, where relevant, faceted values.
- Cursor pagination underneath for the server-backed path.

### 5.3 Command / model layer

- Single source of truth for data and edits.
- All mutations are commands: optimistic apply, validate, reconcile with server truth, roll back on rejection.
- The seam where UI, AI, and collaboration all meet, through one command vocabulary.

### 5.4 Compute (DuckDB-WASM in a Web Worker)

- Sort, filter, group, aggregate off the main thread.
- Answers windowed queries from the grid.
- Fed by Arrow from the transport layer.

### 5.5 Transport, calc, collaboration (Go)

- Cursor pagination over Connect, emitting Arrow.
- Go→WASM calc and validation shared with the client.
- Server-authoritative collaboration; Yjs for ephemeral state.

## 6. Presentations over one model

Build separate presentations over the same underlying data and model layer.

- **Desktop reference examples with polished UI.**
- **Mobile-first responsive web UI.** Reuses the web engines (TanStack, Glide) under a responsive presentation, with touch interaction parity.

We do not want a native mobile app at this stage; responsive web covers mobile for now.
The point of the neutral API and shared model is that these presentations differ only at the top; data, commands, and compute are shared, so a native presentation could be added later without disturbing them.

## 7. Performance: measure it, budget it, track it

Performance is a first-class deliverable, not a finishing pass.
Build the harness early and let it gate the work.

### 7.1 Budgets

We set two hard budgets. You propose the rest, justify each against the harness, and we agree them together.

Set by us:

- **Scroll under a hard fling: sustained 60fps.** No frame budget overrun (16.7ms) in a cluster, on both light and 1M-row tables.
- **Sort and filter on 1M rows: under 100ms perceived** to return the next window. Aim well under.

For you to propose, against the harness:

- Grouping and aggregation latency on 1M rows, by cardinality class.
- Main-thread bundle size, with the heavy WASM stack (DuckDB-WASM, Go→WASM, Arrow) measured separately and kept lazy and worker-side so light tables never pay for it.
- Cold start and time-to-interactive for the heavy path, separate from steady-state latency.
- Memory ceiling for a loaded heavy table.

Every budget, ours or yours, is explicit and written down.

### 7.2 Harness and continuous tracking

- Automated measurement against the budgets above.
- Wired into CI or an equivalent so regressions are visible, not discovered by hand.
- Includes the head-to-head: TanStack versus Glide on the same heavy table, so we can compare heavy-row performance directly.

### 7.3 Engine comparison report

Deliver a written report comparing TanStack and Glide behind the same API, on the same heavy table, under the same budgets.
Include the measured numbers, the trade-offs you hit (interaction fidelity, custom-cell cost, bundle, memory, developer ergonomics), and a clear recommendation on which we should use for our use case, and why.
Because both run behind the neutral API, this is a swap-and-measure exercise, not two separate builds.

## 8. Deliverables

- Neutral DataGrid API.
- Desktop reference examples with polished UI.
- Mobile-first responsive web UI, as a separate presentation over the same data and model layer.
- Performance harness and continuous tracking against explicit budgets, wired so regressions are visible.
- A written engine comparison report (TanStack versus Glide) with a recommendation for our use case.
- Acceptance demos.
- Examples that show all our features in a heavy table, with performance tracked.

## 9. Suggested sequencing (de-risk the frontier first)

You own the plan; this is how we would de-risk it.
Even without weighting development cost, sequencing is how the risk comes out early.

1. **Prove the riskiest seam first:** the neutral API driving both TanStack and Glide, over a real 1M-row table, with Arrow transport and DuckDB-WASM windowing, measured by the harness. If this frontier holds, the architecture holds.
2. **Command layer and deferred re-sort** on top of that spine, with the light and heavy DataSources behind one interface.
3. **Presentations:** desktop polish, then responsive web.
4. **Leaves once the spine is proven:** AI suggestions and prompts (as command and query producers), and collaboration (ephemeral Yjs plus authoritative commits).

Prove the frontier, then decorate it.

## 10. Ways of working

- Quality, simplicity, robustness, scalability, and maintainability over development cost.
- Contract-first: define the API, the DataSource interface, and the command vocabulary as the spec before building behind them.
- One canonical path per responsibility: one mutation path, one query path, one order authority. No parallel implementations left standing.
- Reproduce and measure before you optimize: the heavy-table scenario in the harness is the acceptance gate, not a sample you eyeball.
- Build the reusable core to open-source quality. We may open-source the generic grid core later, and we want that to be straightforward when the time comes.
- Take it seriously; we trust your judgment on how.

On open-source quality, concretely: the neutral API, the render-engine adapters, the DataSource abstraction, the command layer, the compute worker, and the performance harness should be clean, documented, and tested, and should carry none of our business logic, domain model, secrets, or product specifics.
Keep that reusable core in its own package, separated by a hard boundary from anything product-specific, so it could be lifted out with minimal effort.
Prefer permissive, compatible dependency licenses and keep a record of them from the start.
This is a quality bar and a boundary discipline, not a license to generalize for hypothetical external users.
The feature catalog in section 12 is still the guide, and we do not want abstraction beyond what our product needs.

## 11. Open questions for you to decide

- Exact shape of the DataSource window and query contract (range, cursor, faceting, grouping).
- How the cell contract expresses rich custom cells across DOM and canvas without leaking either engine.
- Where optimistic command state reconciles against server truth, and how rejects surface in the UI.
- The precise boundary between Yjs ephemeral state and authoritative committed data.
- Whether Go→WASM is warranted on the light path, or whether light-path validation stays plain and Go→WASM is heavy-path only.
- Exact per-operation performance budgets, refined with us against the harness.

## 12. Feature catalog — what the neutral API must express

Every item below is a product requirement the API must express engine-neutrally, on both the light and heavy data tiers unless noted.
"Later" means it can follow the proven spine, not that it is optional forever.
This catalog is the required floor, not a ceiling.
You are free to add features you judge valuable, as long as they respect the seams in section 4 and the budgets in section 7.

### Columns

- Typed columns with a data-first cell contract (value, edit intent, and optional draw and overlay hooks) that renders on both DOM and canvas.
- Column visibility toggle.
- Column pinning, left and right.
- Column resizing, with sizes persisted per user and table.
- Column reordering, with a drag affordance.
- Per-column alignment, width, min and max, and formatting expressed as data, not markup.
- Header with sort affordance and sort-direction indicator.

### Rows and data

- Stable row identity keyed on a data field, surviving refetch, re-sort, and reorder.
- Windowed access to arbitrary ranges of a large dataset, with no full-dataset load on the heavy tier.
- Cursor pagination on the server-backed source.
- Infinite scroll and progressive fetch as the user scrolls.
- Nested rows and tree expansion, with per-row expand capability.
- Empty, loading (skeleton), and error states as first-class row-model states.

### Selection and editing

- Row selection: single, multi, select-all-in-view, and predicate-based enable so some rows are not selectable.
- Inline cell editing with validation, using the shared Go→WASM rules.
- Bulk actions over the current selection, surfaced in an action bar.
- Deferred re-sort: an edited row changes state without jumping position until commit.

### Query (runs in the compute layer on the heavy tier)

- Sorting, single and multi-column.
- Column filtering across variants: text, number with unit, numeric range, date and date-range, single-select, and multi-select or faceted.
- Global and multi-column search.
- Faceted values and counts feeding the filter UI.
- Grouping and aggregation: sum, count, average, and product-specific aggregates.
- Advanced operator filters (contains, is, is between, is empty, and or-joins) as an opt-in tier. Later, using the same filter schema the server consumes.
- One filter schema shared by the UI, the compute layer, and the server.

### Interaction and navigation

- Keyboard navigation with an active-row highlight and scroll-into-view under a sticky header.
- Row activation behaviors: open a viewer, navigate, or run a custom handler.
- A row viewer surface (drawer, sheet, or dialog) for row detail.
- Touch interaction parity for mobile web.

### Chrome and presentation (injected, never baked into the engine)

- Configurable toolbar with slots: search, filters, reset, view options, and custom items.
- Pagination controls and row counts where paginated.
- Theming and density supplied from outside the engine.
- ARIA grid semantics and screen-reader support.

### Intelligence (AI)

- Certain fields accept AI suggestions, surfaced inline with accept and reject, expressed as proposed commands.
- Interact with table data via AI prompts (filter, sort, group, edit, summarize), expressed as the same commands and queries the UI emits.
- No separate AI mutation or query path.

### Collaboration

- Ephemeral shared state via Yjs: presence, cursors, selection, comments.
- Authoritative, validated data mutations via the command log (server-authoritative, Go).
- Conflict handling that never silently auto-merges a data value.

### Data lifecycle

- Controlled and uncontrolled operation for any state the host wants to own.
- Export to CSV and spreadsheet of the current view, the selection, or the full dataset, honoring current sort and column order.
- Optimistic apply with reconciliation against server truth, all through the command layer.

If any capability here is in genuine tension with a heavy-tier performance budget, raise it early.
We would rather decide together to defer or reshape a capability than discover a missed budget late.

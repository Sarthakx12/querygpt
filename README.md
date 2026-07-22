# Airgap

Drop a CSV or Parquet file. Ask questions in plain English — ya Hinglish. The
data never leaves your browser tab.

Airgap runs an entire SQL database (DuckDB, compiled to WebAssembly) inside a
Web Worker in the client. Your file is loaded and queried locally — nothing
is ever uploaded. When you ask a question in plain English, only the
**question and your column names and types** are sent to an LLM to generate
SQL; the SQL is shown to you, then executed locally against your own data.
Your rows are never sent anywhere and never come back from anywhere.

## How it works

```
┌──────────────────────────── Browser tab ─────────────────────────────┐
│                                                                        │
│  File drop → DuckDB-WASM (Web Worker)                                 │
│       │                                                                │
│       ├─ schema extraction (DESCRIBE data)                            │
│       │        │                                                      │
│       │        ▼                                                      │
│       │   question + schema ──────►  /api/query  (schema-only proxy)  │
│       │        │                          │                           │
│       │        │                     LLM generates SQL                │
│       │        │                          │                           │
│       │        ◄────────── generated SQL ─┘                           │
│       │        │                                                      │
│       ▼        ▼                                                      │
│  run SQL locally in DuckDB-WASM                                       │
│       │                                                                │
│       ▼                                                                │
│  results → virtualized grid / chart / stat card                       │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

Only "question + schema" ever crosses the top of that box. Rows never do —
you can verify this yourself in your browser's Network tab.

## Two ways to query

- **ASK** — plain English (or Hinglish). Sent to `/api/query`, which returns
  SQL text only; the SQL runs locally and the answer is shown with the
  generated query always visible.
- **SQL** — write it yourself. Runs entirely locally, no network call at
  all — works with no API key and no internet connection.

## Getting started

```bash
npm install
cp .env.example .env.local   # add your DEEPSEEK_API_KEY for ASK mode
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). SQL mode works
immediately with no setup; ASK mode needs `DEEPSEEK_API_KEY` set.

## Stack

- Next.js (App Router) + TypeScript + Tailwind v4
- [`@duckdb/duckdb-wasm`](https://github.com/duckdb/duckdb-wasm) — the actual
  database, running in a Web Worker
- [`@tanstack/react-virtual`](https://tanstack.com/virtual) — virtualized
  results grid (handles 100k+ rows without mounting 100k DOM nodes)
- LLM: DeepSeek (`deepseek-v4-flash`) via the OpenAI-compatible SDK, used
  only to translate a question + schema into SQL text — never sees data

## API contract

`/api/query` is a **schema-only** proxy — this is the entire privacy
guarantee, enforced structurally (a request carrying any field other than
`question`/`schema`/`history` is rejected outright):

```
POST /api/query
body      { question: string, schema: { name, type }[], history: ChatMessage[] }
response  SqlPlan  (sql | clarify | blocked | error)
```

The client executes the returned SQL locally and builds the results itself —
row data never passes through this endpoint in either direction. See
`app/api/query/route.ts` and `lib/safety.ts` (keyword blocklist checked both
server- and client-side before any SQL runs).

## Structure

- `app/page.tsx` — UI + data flow: file loading, SQL/ASK modes, the `ask()`
  NL→SQL loop, mobile-responsive console frame
- `lib/duckdb.ts` — the DuckDB-WASM worker interface: `loadFile()`,
  `runSQL()`
- `lib/safety.ts` — read-only SQL validation (keyword blocklist)
- `lib/types.ts` — the `/api/query` contract (`QueryRequest`, `SqlPlan`,
  `ApiResponse`) and local table/schema types
- `components/FileDropzone.tsx` — drag-drop + click-to-browse file input
- `components/SchemaSidebar.tsx` — real DuckDB-inferred schema display
- `components/DataGrid.tsx` — virtualized results table, per-column widths
- `components/ResponseCard.tsx` — all response states: stat card, table,
  bar/line chart, clarify, blocked, error
- `components/LoadingPipeline.tsx` — animated pipeline loading state
- `components/TopoBackground.tsx` — WebGL topographic hero background
- `app/globals.css` — design tokens, grid background, keyframes

## Not yet built (by design, not forgotten)

OPFS persistence across tab closes, multi-file joins, an auto-EDA report,
remote Parquet-over-HTTP, and SQL editor autocomplete are cut on purpose for
now — the core loop (local database, schema-only NL→SQL, nothing uploaded)
is the whole point and had to ship first.

# NF QueryGPT

An AI data analyst for NikahForever. Non-technical staff ask questions in
English or Hinglish; the system converts them to safe, read-only SQL and
answers with numbers, tables, or charts — always showing the generated SQL.

Built for the NikahForever Buildathon.

## Stack

- Next.js (App Router) + TypeScript + Tailwind v4
- Zero runtime dependencies beyond React/Next — no chart, icon, or animation libraries
- Dark theme only; fonts: Geist, Geist Mono, Instrument Serif via `next/font`

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Backend

`app/api/query/route.ts` is currently a **demo stub** that pattern-matches a
few questions so every UI state (stat, table, bar chart, clarify, blocked,
error) can be exercised. Replace its handler with the real NL→SQL backend —
the contract is defined in `lib/types.ts` and must not change:

```
POST /api/query
body     { question: string, history: { role, content }[] }
response ApiResponse  (result | clarify | blocked | error)
```

## Structure

- `app/page.tsx` — UI + data flow (`ask()`, optimistic exchanges, rolling 6-message history)
- `components/ResponseCard.tsx` — all response states incl. SQL block, bars, tables
- `components/LoadingPipeline.tsx` — animated pipeline loading state
- `components/TopoBackground.tsx` — topographic contour hero background (inline SVG)
- `app/globals.css` — design tokens, grid background, keyframes

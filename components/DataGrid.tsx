"use client";

import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { CellValue } from "@/lib/types";

const nf = new Intl.NumberFormat("en-IN");

function formatCell(v: CellValue): string {
  if (v === null) return "—";
  if (typeof v === "number") return nf.format(v);
  return v;
}

const ROW_HEIGHT = 33;
const SAMPLE_SIZE = 50;
const MIN_COL_WIDTH = 90;
const MAX_COL_WIDTH = 320;
// Rough px-per-character for the grid's 13px mono-ish body text, plus cell
// padding (px-3 = 12px each side). Not font-metric-exact — just enough to
// stop uniform 160px columns from truncating a 24-char ISO timestamp while
// a 2-char "id" column wastes the same space.
const CHAR_WIDTH = 7.5;
const CELL_PADDING = 32;

/**
 * A virtualized results table. Only the rows scrolled into view (+overscan)
 * are ever mounted as DOM nodes — the previous DataTable in ResponseCard.tsx
 * mapped every row into the DOM directly, which is fine at 100 rows and
 * falls over at 100k. Verify with:
 *   document.querySelectorAll('[data-row]').length
 * which should stay roughly constant regardless of rows.length.
 *
 * Built with divs + CSS Grid rather than a real <table>: position:absolute
 * on a <tr> (needed to place virtualized rows) computes display
 * inconsistently across browsers because it fights table layout. Fixed
 * per-column pixel widths (computed per column, not uniform — see
 * `colWidths` below) keep the header and body grids pixel-identical without
 * depending on ambiguous shrink-to-fit sizing under abspos.
 */
export default function DataGrid({
  columns,
  rows,
}: {
  columns: string[];
  rows: CellValue[][];
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Sampling instead of scanning every row: rows.every(...)/reduce(...) over
  // 100k rows on each render is the kind of cost virtualization is supposed
  // to avoid.
  const sample = useMemo(() => rows.slice(0, SAMPLE_SIZE), [rows]);

  const numeric = useMemo(
    () =>
      columns.map((_, c) => sample.every((r) => typeof r[c] === "number" || r[c] === null)),
    [columns, sample]
  );

  // Per-column width from header + sampled cell lengths, clamped — a date or
  // full name shouldn't share a box with a 2-digit id column.
  const colWidths = useMemo(
    () =>
      columns.map((col, c) => {
        let maxLen = col.length;
        for (const r of sample) {
          const len = formatCell(r[c]).length;
          if (len > maxLen) maxLen = len;
        }
        const px = maxLen * CHAR_WIDTH + CELL_PADDING;
        return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, px));
      }),
    [columns, sample]
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const items = virtualizer.getVirtualItems();
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const gridTemplateColumns = colWidths.map((w) => `${w}px`).join(" ");

  return (
    <div
      ref={parentRef}
      className="table-fade max-h-80 overflow-auto"
      role="table"
      aria-rowcount={rows.length}
    >
      <div
        role="row"
        className="sticky top-0 z-10 grid border-b border-[var(--border-strong)] bg-[var(--surface)]"
        style={{ gridTemplateColumns, width: totalWidth }}
      >
        {columns.map((col, c) => (
          <div
            key={col}
            role="columnheader"
            className={`px-3 py-2 font-mono text-[11px] font-normal uppercase tracking-[0.18em] text-[var(--text-3)] ${
              numeric[c] ? "text-right" : "text-left"
            }`}
          >
            {col.replace(/_/g, " ")}
          </div>
        ))}
      </div>

      <div
        role="rowgroup"
        style={{ position: "relative", height: virtualizer.getTotalSize(), width: totalWidth }}
      >
        {items.map((item) => {
          const row = rows[item.index];
          return (
            <div
              key={item.key}
              data-row
              role="row"
              aria-rowindex={item.index + 1}
              className="absolute left-0 top-0 grid w-full border-b border-[var(--border)] transition-colors hover:bg-white/[0.03]"
              style={{
                gridTemplateColumns,
                width: totalWidth,
                height: item.size,
                transform: `translateY(${item.start}px)`,
              }}
            >
              {row.map((cell, c) => (
                <div
                  key={c}
                  role="cell"
                  className={`flex items-center px-3 py-2 text-[13px] ${
                    numeric[c]
                      ? "tnum justify-end text-right text-[var(--text-1)]"
                      : "justify-start text-left text-[var(--text-2)]"
                  }`}
                >
                  <span className="truncate">{formatCell(cell)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

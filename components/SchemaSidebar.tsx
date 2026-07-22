"use client";

import type { TableInfo } from "@/lib/types";

const nf = new Intl.NumberFormat("en-IN");

/**
 * Shows the real, DuckDB-inferred schema of the currently loaded table —
 * whatever DESCRIBE actually returned in lib/duckdb.ts, not a fixed list.
 * Column types (BIGINT, VARCHAR, DATE, …) come straight from that query.
 */
export default function SchemaSidebar({
  table,
  loading,
  error,
}: {
  table: TableInfo | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <p className="label-mono">Loading file…</p>
        <p className="text-[12px] italic text-[var(--text-3)]">
          Parsing in the worker, this tab stays responsive.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="label-mono" style={{ color: "rgba(248,113,113,0.9)" }}>
          Load failed
        </p>
        <p className="text-[12px] leading-relaxed text-[var(--text-3)]">
          {error}
        </p>
      </div>
    );
  }

  if (!table) {
    return (
      <p className="text-[12px] italic text-[var(--text-3)]">
        No file loaded yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <span
          className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-[var(--text-3)]"
          aria-hidden="true"
        >
          database
        </span>
        <div className="min-w-0">
          <p className="line-clamp-1 text-[12px] font-medium text-[var(--text-1)]">
            {table.fileName}
          </p>
          <p className="tnum text-[11px] text-[var(--text-3)]">
            {nf.format(table.rowCount)} rows · {table.columns.length} cols ·{" "}
            {table.loadMs}ms
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto pr-1">
        {table.columns.map((col) => (
          <div
            key={col.name}
            className="flex items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-[var(--border)] hover:bg-white/[0.03]"
          >
            <span className="truncate text-[12px] text-[var(--text-2)]">
              {col.name}
            </span>
            <span className="tnum shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
              {col.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

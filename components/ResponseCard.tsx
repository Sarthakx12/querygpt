"use client";

import { useEffect, useState } from "react";
import type { ApiResponse, CellValue } from "@/lib/types";
import LoadingPipeline from "./LoadingPipeline";
import DataGrid from "./DataGrid";

const nf = new Intl.NumberFormat("en-IN");

function formatCell(v: CellValue): string {
  if (v === null) return "—";
  if (typeof v === "number") return nf.format(v);
  return v;
}

/* ------------------------------------------------------------------ */
/* Badges                                                               */
/* ------------------------------------------------------------------ */

function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" | null }) {
  // null means "no LLM was involved" (e.g. hand-typed SQL) — showing a
  // "Medium confidence" badge in that case would claim a judgment nothing
  // made. Render nothing instead of silently defaulting to medium.
  if (level === null) return null;

  const map = {
    high: { bg: "#E1F5EE", fg: "#0F6E56", text: "High confidence", icon: "🟢" },
    medium: { bg: "#FAEEDA", fg: "#854F0B", text: "Medium confidence", icon: "🟡" },
    low: { bg: "#FAECE7", fg: "#993C1D", text: "Low confidence", icon: "🟠" },
  };
  const s = map[level];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      <span>{s.icon}</span>
      {s.text}
    </span>
  );
}

function TablesBadge({ tables }: { tables: string[] }) {
  if (!tables || !tables.length) return null;
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#E6F1FB] text-[#0C447C]"
    >
      Tables: {tables.join(", ")}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Generated SQL block                                                  */
/* ------------------------------------------------------------------ */

const SQL_KEYWORDS =
  /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|JOIN|LEFT|ON|AS|LIMIT|COUNT|SUM|AVG|MIN|MAX|AND|OR|WITH|DESC|ASC|DATE|STRFTIME)\b/gi;

function highlightSql(sql: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(SQL_KEYWORDS.source, "gi");
  while ((m = re.exec(sql)) !== null) {
    if (m.index > last) out.push(sql.slice(last, m.index));
    out.push(
      <span key={m.index} className="text-[var(--text-1)]">
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < sql.length) out.push(sql.slice(last));
  return out;
}

function SqlBlock({
  sql,
  rowCount,
  ms,
  retried,
}: {
  sql: string;
  rowCount: number;
  ms: number;
  retried: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <details className="sql-details mt-3 rounded-md border border-[var(--border)] bg-[#0A0A0B]">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)] select-none">
        <span className="chevron">▸</span>
        <span className="tnum">
          GENERATED SQL · {rowCount} ROWS · {ms}MS
          {retried ? " · SELF-CORRECTED ✓" : ""}
        </span>
      </summary>
      <div className="relative border-t border-[var(--border)]">
        <button
          type="button"
          onClick={copy}
          className="absolute top-3 right-3 rounded-full border border-[var(--border)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-3)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-1)]"
        >
          {copied ? "COPIED ✓" : "COPY"}
        </button>
        <pre className="overflow-x-auto p-4 pr-24 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-[var(--text-2)]">
          {highlightSql(sql)}
        </pre>
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Result renderers                                                    */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  answer,
  ms,
}: {
  label: string;
  value: CellValue;
  answer: string;
  ms: number;
}) {
  return (
    <div className="relative rounded-lg border border-[var(--border)] bg-[var(--surface)] p-7">
      <span className="tnum absolute top-4 right-5 font-mono text-[11px] text-[var(--text-3)]">
        {ms}MS
      </span>
      <p className="label-mono">{label.replace(/_/g, " ")}</p>
      <p
        className="tnum mt-3 text-[56px] leading-none font-medium text-white md:text-[64px]"
        style={{ textShadow: "0 0 24px rgba(255,255,255,0.18)" }}
      >
        {formatCell(value)}
      </p>
      {answer && (
        <p className="mt-4 text-sm leading-relaxed text-[var(--text-2)]">
          {answer}
        </p>
      )}
    </div>
  );
}

function DataTable({
  columns,
  rows,
  answer,
}: {
  columns: string[];
  rows: CellValue[][];
  answer: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      {answer && (
        <p className="mb-4 text-sm leading-relaxed text-[var(--text-2)]">
          {answer}
        </p>
      )}
      <DataGrid columns={columns} rows={rows} />
    </div>
  );
}

function BarChart({
  columns,
  rows,
  answer,
  metadata,
}: {
  columns: string[];
  rows: CellValue[][];
  answer: string;
  metadata?: Extract<ApiResponse, { kind: "result" }>["chart_metadata"];
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const xIdx = metadata?.x_column ? columns.indexOf(metadata.x_column) : 0;
  const yIdx = metadata?.y_column ? columns.indexOf(metadata.y_column) : 1;

  const values = rows.map((r) => (typeof r[yIdx] === "number" ? (r[yIdx] as number) : 0));
  const max = Math.max(...values, 1);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      {answer && (
        <p className="mb-4 text-sm leading-relaxed text-[var(--text-2)]">
          {answer}
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-36 truncate text-[13px] text-[var(--text-2)]">
              {formatCell(row[xIdx === -1 ? 0 : xIdx])}
            </span>
            <span className="h-7 flex-1 rounded-[3px] bg-white/[0.04]">
              <span
                className="bar-fill block h-full rounded-[3px]"
                style={{
                  width: mounted ? `${(values[i] / max) * 100}%` : "0%",
                  transitionDelay: `${i * 40}ms`,
                }}
              />
            </span>
            <span className="tnum w-20 text-right text-xs text-[var(--text-1)]">
              {formatCell(row[yIdx === -1 ? 1 : yIdx])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({
  columns,
  rows,
  answer,
  metadata,
}: {
  columns: string[];
  rows: CellValue[][];
  answer: string;
  metadata?: Extract<ApiResponse, { kind: "result" }>["chart_metadata"];
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const xIdx = metadata?.x_column ? columns.indexOf(metadata.x_column) : 0;
  const yIdx = metadata?.y_column ? columns.indexOf(metadata.y_column) : 1;

  const values = rows.map((r) => (typeof r[yIdx] === "number" ? (r[yIdx] as number) : 0));
  const max = Math.max(...values, 1);
  const padding = 40;
  const width = 600;
  const height = 200;

  const points = values.length > 1 
    ? values
        .map((v, i) => {
          const x = (i / (values.length - 1)) * (width - padding * 2) + padding;
          const y = height - (v / max) * (height - padding * 2) - padding;
          return `${x},${y}`;
        })
        .join(" ")
    : `${padding},${height - (values[0] / max) * (height - padding * 2) - padding}`;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      {answer && (
        <p className="mb-4 text-sm leading-relaxed text-[var(--text-2)]">
          {answer}
        </p>
      )}
      <div className="relative h-[200px] w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full"
          preserveAspectRatio="none"
        >
          <polyline
            fill="none"
            stroke="var(--text-1)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
            style={{
              strokeDasharray: 1000,
              strokeDashoffset: mounted ? 0 : 1000,
              transition: "stroke-dashoffset 1.5s ease-in-out",
            }}
          />
          {values.map((v, i) => {
            const x = (i / (values.length - 1)) * (width - padding * 2) + padding;
            const y = height - (v / max) * (height - padding * 2) - padding;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="3"
                fill="var(--surface)"
                stroke="var(--text-1)"
                strokeWidth="2"
                style={{
                  opacity: mounted ? 1 : 0,
                  transition: `opacity 0.3s ease-in-out ${i * 50}ms`,
                }}
              />
            );
          })}
        </svg>
        <div className="mt-2 flex justify-between px-[padding]">
          {rows.map((row, i) => (
            <span key={i} className="text-[10px] text-[var(--text-3)] uppercase font-mono">
              {formatCell(row[xIdx === -1 ? 0 : xIdx])}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Special states                                                      */
/* ------------------------------------------------------------------ */

function ClarifyCard({ question }: { question: string }) {
  return (
    <div
      className="rounded-lg border border-[var(--border)] border-l-2 border-l-[rgba(251,191,36,0.7)] bg-[var(--surface)] p-5 shadow-[0_0_20px_rgba(251,191,36,0.07)]"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1.5 size-1.5 shrink-0 rounded-full"
          style={{ background: "var(--amber)" }}
        />
        <p className="text-sm leading-relaxed text-[var(--text-1)]">
          {question}
        </p>
      </div>
      <p className="label-mono mt-3 pl-[18px]">REPLY BELOW TO CONTINUE</p>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="rgba(248,113,113,0.9)"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function BlockedCard({ message, sql }: { message: string, sql?: string }) {
  return (
    <div
      className="rounded-lg border bg-[var(--surface)] p-5 border-[rgba(248,113,113,0.35)] shadow-[0_0_24px_rgba(248,113,113,0.10)]"
    >
      <div className="flex items-center gap-2.5">
        <LockIcon />
        <span
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-[rgba(248,113,113,0.9)]"
        >
          BLOCKED BY SAFETY LAYER
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-2)]">
        {message}
      </p>
      {sql && (
        <pre className="mt-4 p-3 bg-red-500/5 rounded border border-red-500/20 font-mono text-[11px] text-red-400/80 overflow-x-auto">
          {sql}
        </pre>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {["PROMPT ✓", "VALIDATOR ✓", "READ-ONLY DB ✓"].map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-[var(--border)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-3)]"
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}

function ErrorCard({ message, sql }: { message: string, sql?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="label-mono">QUERY FAILED</p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-3)]">
        {message}
      </p>
      {sql && (
        <pre className="mt-4 p-3 bg-white/5 rounded border border-white/10 font-mono text-[11px] text-[var(--text-3)] overflow-x-auto">
          {sql}
        </pre>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ResponseCard                                                        */
/* ------------------------------------------------------------------ */

export default function ResponseCard({
  response,
}: {
  response: ApiResponse | null;
}) {
  if (response === null) return <LoadingPipeline />;

  switch (response.kind) {
    case "clarify":
      return <ClarifyCard question={response.question} />;
    case "blocked":
      return <BlockedCard message={response.message} sql={(response as any).sql} />;
    case "error":
      return <ErrorCard message={response.message} sql={(response as any).sql} />;
    case "result": {
      const { 
        answer, sql, columns, rows, rowCount, ms, retried, 
        result_type, chart_metadata, confidence, tables_used 
      } = response;

      const renderContent = () => {
        if (result_type === "metric") {
          return (
            <StatCard
              label={columns[0]}
              value={rows[0]?.[0] ?? null}
              answer={answer}
              ms={ms}
            />
          );
        }

        if (result_type === "chart" && chart_metadata) {
          if (chart_metadata.type === "bar") {
            return <BarChart columns={columns} rows={rows} answer={answer} metadata={chart_metadata} />;
          }
          if (chart_metadata.type === "line") {
            return <LineChart columns={columns} rows={rows} answer={answer} metadata={chart_metadata} />;
          }
        }

        // Default to Table for "table" or chart failures
        return <DataTable columns={columns} rows={rows} answer={answer} />;
      };

      return (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <ConfidenceBadge level={confidence} />
            <TablesBadge tables={tables_used} />
          </div>
          {renderContent()}
          <SqlBlock sql={sql} rowCount={rowCount} ms={ms} retried={retried} />
        </div>
      );
    }
  }
}

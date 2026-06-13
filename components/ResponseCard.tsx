"use client";

import { useEffect, useState } from "react";
import type { ApiResponse, CellValue } from "@/lib/types";
import LoadingPipeline from "./LoadingPipeline";

const nf = new Intl.NumberFormat("en-IN");

function formatCell(v: CellValue): string {
  if (v === null) return "—";
  if (typeof v === "number") return nf.format(v);
  return v;
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
  const numeric = columns.map((_, c) =>
    rows.every((r) => typeof r[c] === "number" || r[c] === null)
  );
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      {answer && (
        <p className="mb-4 text-sm leading-relaxed text-[var(--text-2)]">
          {answer}
        </p>
      )}
      <div className="table-fade max-h-80 overflow-auto">
        <table className="w-full min-w-max border-collapse text-left">
          <thead>
            <tr>
              {columns.map((col, c) => (
                <th
                  key={col}
                  className={`sticky top-0 border-b border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 font-mono text-[11px] font-normal uppercase tracking-[0.18em] text-[var(--text-3)] ${
                    numeric[c] ? "text-right" : "text-left"
                  }`}
                >
                  {col.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr
                key={r}
                className="border-b border-[var(--border)] transition-colors hover:bg-white/[0.03]"
              >
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`px-3 py-2 text-[13px] ${
                      numeric[c]
                        ? "tnum text-right text-[var(--text-1)]"
                        : "text-left text-[var(--text-2)]"
                    }`}
                  >
                    {formatCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BarChart({
  columns,
  rows,
  answer,
}: {
  columns: string[];
  rows: CellValue[][];
  answer: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const values = rows.map((r) => (typeof r[1] === "number" ? r[1] : 0));
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
              {formatCell(row[0])}
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
              {formatCell(row[1])}
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
}: {
  columns: string[];
  rows: CellValue[][];
  answer: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const values = rows.map((r) => (typeof r[1] === "number" ? r[1] : 0));
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
              {formatCell(row[0])}
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
      className="rounded-lg border border-[var(--border)] border-l-2 border-l-[rgba(251,191,36,0.7)] bg-[var(--surface)] p-5"
      style={{ boxShadow: "0 0 20px rgba(251,191,36,0.07)" }}
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

function BlockedCard({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg border bg-[var(--surface)] p-5"
      style={{
        borderColor: "rgba(248,113,113,0.35)",
        boxShadow: "0 0 24px rgba(248,113,113,0.10)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <LockIcon />
        <span
          className="font-mono text-[11px] uppercase tracking-[0.18em]"
          style={{ color: "rgba(248,113,113,0.9)" }}
        >
          BLOCKED BY SAFETY LAYER
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-2)]">
        {message}
      </p>
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

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="label-mono">QUERY FAILED</p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-3)]">
        {message}
      </p>
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
      return <BlockedCard message={response.message} />;
    case "error":
      return <ErrorCard message={response.message} />;
    case "result": {
      const { answer, sql, columns, rows, rowCount, ms, retried, chart } =
        response;

      const isStat = rowCount === 1 && columns.length === 1;
      const isBar =
        chart === "bar" &&
        columns.length === 2 &&
        rowCount <= 15 &&
        rows.every((r) => typeof r[1] === "number");
      const isLine =
        chart === "line" &&
        columns.length === 2 &&
        rowCount >= 2 &&
        rows.every((r) => typeof r[1] === "number");

      return (
        <div>
          {isStat ? (
            <StatCard
              label={columns[0]}
              value={rows[0]?.[0] ?? null}
              answer={answer}
              ms={ms}
            />
          ) : isBar ? (
            <BarChart columns={columns} rows={rows} answer={answer} />
          ) : isLine ? (
            <LineChart columns={columns} rows={rows} answer={answer} />
          ) : (
            <DataTable columns={columns} rows={rows} answer={answer} />
          )}
          <SqlBlock sql={sql} rowCount={rowCount} ms={ms} retried={retried} />
        </div>
      );
    }
  }
}

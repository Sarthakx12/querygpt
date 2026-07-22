"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ApiResponse, ChatMessage, Exchange, SqlPlan, TableInfo } from "@/lib/types";
import TopoBackground from "@/components/TopoBackground";
import ResponseCard from "@/components/ResponseCard";
import FileDropzone from "@/components/FileDropzone";
import SchemaSidebar from "@/components/SchemaSidebar";
import { loadFile, runSQL } from "@/lib/duckdb";
import { validateSql } from "@/lib/safety";

/* ------------------------------------------------------------------ */
/* Suggestion chips — generated from the loaded table's real schema,   */
/* not hardcoded against any fixed demo shape.                         */
/* ------------------------------------------------------------------ */

function buildChips(table: TableInfo | null, mode: "sql" | "ask"): string[] {
  if (!table) return [];

  if (mode === "sql") {
    const chips = [
      `SELECT * FROM ${table.tableName} LIMIT 100`,
      `SELECT COUNT(*) FROM ${table.tableName}`,
    ];
    const textCol = table.columns.find((c) => /VARCHAR|TEXT|STRING/i.test(c.type));
    if (textCol) {
      chips.push(
        `SELECT ${textCol.name}, COUNT(*) AS n FROM ${table.tableName} GROUP BY ${textCol.name} ORDER BY n DESC LIMIT 10`
      );
    }
    return chips;
  }

  const chips = ["How many rows are there?", "Show me the first 20 rows"];

  const textCols = table.columns.filter((c) => /VARCHAR|TEXT|STRING/i.test(c.type));
  // Prefer a column that looks categorical. Grouping by the first text column
  // is usually wrong — it tends to be a name/email/id with one distinct value
  // per row, which makes a useless chart.
  const CATEGORICAL = /city|state|country|region|status|type|category|gender|plan|tier|level|group|dept|department|role|source|channel|segment/i;
  const groupCol = textCols.find((c) => CATEGORICAL.test(c.name)) ?? textCols[0];
  if (groupCol) chips.push(`Break down the data by ${groupCol.name}`);

  // Likewise skip obvious identifier columns when suggesting an average.
  const numCols = table.columns.filter((c) => /INT|DOUBLE|DECIMAL|FLOAT|BIGINT/i.test(c.type));
  const avgCol = numCols.find((c) => !/(^|_)id$|^id$/i.test(c.name)) ?? numCols[0];
  if (avgCol) chips.push(`What's the average ${avgCol.name}?`);

  return chips;
}

/* ------------------------------------------------------------------ */
/* Inline icons                                                        */
/* ------------------------------------------------------------------ */

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="#000"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Chat row label (role + icon)                                       */
/* ------------------------------------------------------------------ */

function RoleLabel({
  icon,
  label,
  align,
}: {
  icon: string;
  label: string;
  align: "left" | "right";
}) {
  return (
    <div
      className={`mb-1.5 flex items-center gap-2 ${
        align === "right" ? "justify-end" : ""
      }`}
    >
      {align === "left" && (
        <Icon name={icon} className="text-[16px] text-[var(--text-3)]" />
      )}
      <span className="label-mono">{label}</span>
      {align === "right" && (
        <Icon name={icon} className="text-[16px] text-[var(--text-2)]" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [mode, setMode] = useState<"sql" | "ask">("ask");
  // Collapsible panel (dropzone + schema + recent queries) below the `md`
  // breakpoint — open by default so the dropzone is reachable on first visit,
  // since the desktop sidebar it mirrors is hidden on mobile.
  const [mobilePanelOpen, setMobilePanelOpen] = useState(true);

  // Local DuckDB table state, populated by FileDropzone -> loadFile().
  // Never touches the network — see lib/duckdb.ts.
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  /** Rolling window of the last 6 messages, sent for follow-up context. */
  const historyRef = useRef<ChatMessage[]>([]);
  const idRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const chips = useMemo(() => buildChips(tableInfo, mode), [tableInfo, mode]);

  // Load history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("airgap_history");
    if (saved) {
      try {
        setQueryHistory(JSON.parse(saved));
      } catch (e) {
        /* ignore malformed history */
      }
    }
  }, []);

  // Auto-scroll the thread to the newest entry.
  useEffect(() => {
    if (exchanges.length === 0) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    threadEndRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "end",
    });
  }, [exchanges]);

  function saveToHistory(question: string) {
    const q = question.trim();
    if (!q) return;
    setQueryHistory((prev) => {
      const filtered = prev.filter((item) => item !== q);
      const next = [q, ...filtered].slice(0, 5);
      localStorage.setItem("airgap_history", JSON.stringify(next));
      return next;
    });
  }

  async function handleFileLoad(file: File) {
    setSchemaLoading(true);
    setSchemaError(null);
    try {
      const info = await loadFile(file);
      setTableInfo(info);
      setMobilePanelOpen(false);
    } catch (err) {
      setSchemaError(err instanceof Error ? err.message : "Failed to load file.");
      setTableInfo(null);
    } finally {
      setSchemaLoading(false);
    }
  }

  /** Runs hand-typed SQL against the local DuckDB table — no LLM, no network. */
  async function runSQLQuery(raw: string) {
    const sql = raw.trim();
    if (!sql || busy) return;

    saveToHistory(sql);

    const id = ++idRef.current;
    setExchanges((prev) => [...prev, { id, question: sql, response: null }]);
    setInput("");
    setBusy(true);

    let response: ApiResponse;
    try {
      const result = await runSQL(sql);
      const isMetric = result.rows.length === 1 && result.columns.length === 1;
      response = {
        kind: "result",
        answer: "",
        sql,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rows.length,
        ms: result.ms,
        retried: false,
        result_type: isMetric ? "metric" : "table",
        chart_metadata: null,
        confidence: null,
        tables_used: tableInfo ? [tableInfo.tableName] : [],
      };
    } catch (err) {
      response = {
        kind: "error",
        message: err instanceof Error ? err.message : "Query failed.",
      };
    }

    setExchanges((prev) =>
      prev.map((ex) => (ex.id === id ? { ...ex, response } : ex))
    );
    setBusy(false);
  }

  function submit() {
    if (mode === "sql") runSQLQuery(input);
    else ask(input);
  }

  /**
   * The NL→SQL loop. Sends ONLY {question, schema, history} to /api/query,
   * gets SQL text back, then executes that SQL locally against DuckDB and
   * assembles the result here. Row data is produced in this tab and never
   * posted anywhere.
   */
  async function ask(raw: string) {
    const question = raw.trim();
    if (!question || busy) return;

    if (!tableInfo) {
      const id = ++idRef.current;
      setExchanges((prev) => [
        ...prev,
        {
          id,
          question,
          response: {
            kind: "error",
            message: "Drop a CSV or Parquet file first — there's nothing to query yet.",
          },
        },
      ]);
      setInput("");
      return;
    }

    saveToHistory(question);

    const id = ++idRef.current;
    // Optimistic: show the question immediately with a pending response.
    setExchanges((prev) => [...prev, { id, question, response: null }]);
    setInput("");
    setBusy(true);

    let response: ApiResponse;
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Schema is column names + types only. Never rows. This object is
        // the complete set of what leaves the browser.
        body: JSON.stringify({
          question,
          schema: tableInfo.columns.map((c) => ({ name: c.name, type: c.type })),
          history: historyRef.current,
        }),
      });
      const plan = (await res.json()) as SqlPlan;

      if (plan.kind === "sql") {
        // Re-check before executing: the browser is where the SQL actually
        // runs, so this is the check that matters.
        const check = validateSql(plan.sql);
        if (!check.safe) {
          response = { kind: "blocked", message: check.reason ?? "Unsafe SQL detected." };
        } else {
          const result = await runSQL(plan.sql);
          response = {
            kind: "result",
            answer: plan.answer,
            sql: plan.sql,
            columns: result.columns,
            rows: result.rows,
            rowCount: result.rows.length,
            ms: result.ms,
            retried: false,
            result_type: plan.result_type,
            chart_metadata: plan.chart_metadata ?? null,
            confidence: plan.confidence,
            tables_used: plan.tables_used,
          };
        }
      } else {
        response = plan;
      }
    } catch (err) {
      response = {
        kind: "error",
        message:
          err instanceof Error ? err.message : "Something went wrong. Try again.",
      };
    }

    // Echo pushing: keep a rolling window of the last 6 messages.
    //
    // PRIVACY INVARIANT: `echo` must only ever be text the MODEL produced
    // (it has never seen a row) or a static error string. Never splice a
    // query result into it — e.g. "Total revenue is ₹21,52,512" — because
    // history is posted back to the server on the next turn, which would
    // leak a row-derived value out of the tab.
    const echo =
      response.kind === "result"
        ? response.answer
        : response.kind === "clarify"
          ? response.question
          : response.message;
    const nextHistory: ChatMessage[] = [
      ...historyRef.current,
      { role: "user", content: question },
      { role: "assistant", content: echo },
    ];
    historyRef.current = nextHistory.slice(-6);

    setExchanges((prev) =>
      prev.map((ex) => (ex.id === id ? { ...ex, response } : ex))
    );
    setBusy(false);
  }

  function startQuerying() {
    document
      .getElementById("console")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    inputRef.current?.focus({ preventScroll: true });
  }

  // Rendered in two different containers — a collapsible top panel on
  // mobile, a persistent 260px side column on desktop — so this single
  // definition is the source of truth for the dropzone/schema/recent-query
  // UI rather than duplicating that logic per breakpoint.
  const sidebarContent = (
    <>
      <FileDropzone onFile={handleFileLoad} busy={schemaLoading} />

      <div>
        <p className="label-mono mb-3 text-[10px] tracking-[0.2em] text-[var(--text-3)] uppercase">
          Schema
        </p>
        <SchemaSidebar table={tableInfo} loading={schemaLoading} error={schemaError} />
      </div>

      <div>
        <p className="label-mono mb-3 text-[10px] tracking-[0.2em] text-[var(--text-3)] uppercase">
          Recent Queries
        </p>
        <div className="flex flex-col gap-3 pr-1">
          {queryHistory.length === 0 ? (
            <p className="text-[12px] italic text-[var(--text-3)]">No recent queries.</p>
          ) : (
            queryHistory.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => (mode === "sql" ? runSQLQuery(q) : ask(q))}
                disabled={busy}
                className="group flex flex-col items-start gap-1 rounded-md border border-transparent bg-white/[0.03] p-3 text-left transition-all hover:border-[var(--border)] hover:bg-white/[0.06] disabled:opacity-50"
              >
                <span className="line-clamp-2 text-[12px] leading-relaxed text-[var(--text-2)] group-hover:text-[var(--text-1)]">
                  {q}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-3)] group-hover:text-[var(--text-2)]">
                  Re-run →
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex-1">
      {/* ---------------- Full-width document ---------------- */}
      <div className="mx-auto max-w-[1440px] pb-24">
        {/* ---------------- Top bar ---------------- */}
        <div className="flex items-center justify-center px-6 pt-6 pb-3 md:px-12">
          <span className="rounded-full border border-[var(--border)] px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-3)]">
            ● LOCAL-FIRST · NOTHING LEAVES THIS TAB
          </span>
        </div>

        {/* ---------------- Section 1 — Hero ---------------- */}
        <section className="relative flex min-h-[78vh] flex-col items-center justify-center border-b border-[var(--border)] px-6 py-20 md:px-12 md:py-28">
          <TopoBackground />
          <div className="relative z-10 flex flex-col items-center text-center">
            <h1
              className="mt-8 font-medium text-[var(--text-1)]"
              style={{
                fontSize: "clamp(44px, 7vw, 76px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.04,
              }}
            >
              Ask your data.
              <br />
              <span className="font-serif italic">Never leave the tab.</span>
            </h1>
            <p className="mt-7 max-w-xl text-[15px] leading-relaxed text-[var(--text-2)]">
              Drop a CSV or Parquet file and ask questions in plain English — ya Hinglish.
              Airgap turns them into SQL that runs entirely inside this browser tab. Only
              your question and column names ever reach the model; your rows never do.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={startQuerying}
                className="btn-glow flex h-11 items-center gap-1.5 px-6 text-sm font-medium"
              >
                Start querying
                <Icon name="arrow_downward" className="text-[16px]" />
              </button>
              <a
                href="#safety"
                className="btn-secondary flex h-11 items-center px-6 text-sm"
              >
                How it stays safe
              </a>
            </div>
          </div>
        </section>

        {/* ---------------- Section 2 — Query Console ---------------- */}
        <section
          id="console"
          className="border-b border-[var(--border)] px-6 py-20 md:px-12 md:py-28"
        >
          <p className="label-mono">QUERY CONSOLE</p>
          <h2 className="mt-3 text-[28px] font-medium tracking-[-0.02em] text-[var(--text-1)] md:text-[32px]">
            Poochho, <span className="font-serif italic">seedha jawab.</span>
          </h2>

          {/* Console frame */}
          <div
            className="relative mt-8 flex h-[560px] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--console-bg)] shadow-[0_0_50px_rgba(0,0,0,0.5)] md:h-[700px] md:flex-row"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileLoad(file);
            }}
          >
            {/* Mobile panel toggle (below md only) — the dropzone + schema are
                otherwise unreachable on phone, since the sidebar below is
                desktop-only. */}
            <button
              type="button"
              onClick={() => setMobilePanelOpen((o) => !o)}
              className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 text-left md:hidden"
              aria-expanded={mobilePanelOpen}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon
                  name={tableInfo ? "database" : "upload_file"}
                  className="shrink-0 text-[16px] text-[var(--text-3)]"
                />
                <span className="truncate font-mono text-xs text-[var(--text-2)]">
                  {tableInfo
                    ? `${tableInfo.fileName} · ${tableInfo.rowCount.toLocaleString("en-IN")} rows`
                    : "Drop a file to begin"}
                </span>
              </span>
              <Icon
                name={mobilePanelOpen ? "expand_less" : "expand_more"}
                className="shrink-0 text-[18px] text-[var(--text-3)]"
              />
            </button>
            {mobilePanelOpen && (
              <div className="flex max-h-[45vh] shrink-0 flex-col gap-5 overflow-y-auto border-b border-[var(--border)] bg-[var(--bg)]/30 p-4 md:hidden">
                {sidebarContent}
              </div>
            )}

            {/* Sidebar (desktop, md and up) */}
            <div className="hidden w-[260px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-[var(--border)] bg-[var(--bg)]/30 p-5 md:flex">
              {sidebarContent}
            </div>

            {/* Main Console Area */}
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Sticky mode toggle + suggestion chips */}
              <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2.5 border-b border-[var(--border)] bg-[var(--console-bg)] p-4">
                <div className="flex shrink-0 gap-0.5 rounded-full border border-[var(--border)] bg-black/20 p-0.5">
                  {(["sql", "ask"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-all ${
                        mode === m
                          ? "glow-active bg-white/[0.08] text-[var(--text-1)]"
                          : "text-[var(--text-3)] hover:text-[var(--text-2)]"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {chips.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)]">
                      Suggested
                    </span>
                    {chips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => (mode === "sql" ? runSQLQuery(chip) : ask(chip))}
                        disabled={busy}
                        className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-xs text-[var(--text-2)] transition-colors hover:border-[var(--border-strong)] hover:bg-white/[0.04] hover:text-[var(--text-1)] disabled:opacity-50"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Scrollable message thread */}
              <div className="flex-1 overflow-y-auto p-6 pb-28">
                <div className="flex flex-col gap-6">
                  {/* Intro system message */}
                  <div className="fade-up flex max-w-[85%] flex-col self-start">
                    <RoleLabel icon="database" label="SYSTEM" align="left" />
                    <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-1)]">
                      {tableInfo
                        ? `Loaded ${tableInfo.fileName} — ${tableInfo.rowCount.toLocaleString(
                            "en-IN"
                          )} rows, ${tableInfo.columns.length} columns. Ask a question in plain English, or switch to SQL to write it yourself.`
                        : "Console initialized. Drop a CSV or Parquet file to begin — everything runs locally in this tab."}
                    </p>
                  </div>

                  {exchanges.map((ex) => (
                    <div key={ex.id} className="fade-up flex flex-col gap-4">
                      <div className="flex max-w-[85%] flex-col self-end items-end">
                        <RoleLabel icon="person" label="YOU" align="right" />
                        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-1)]">
                          {ex.question}
                        </p>
                      </div>
                      <div className="flex w-full max-w-[92%] flex-col self-start">
                        <RoleLabel icon="auto_awesome" label="AIRGAP" align="left" />
                        <ResponseCard response={ex.response} />
                      </div>
                    </div>
                  ))}
                  <div ref={threadEndRef} />
                </div>
              </div>

              {/* Pinned input bar */}
              <div className="absolute inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--console-bg)] p-4">
                <form
                  className="flex items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    disabled={busy}
                    rows={1}
                    placeholder={
                      !tableInfo
                        ? "Drop a CSV or Parquet file to begin…"
                        : mode === "sql"
                          ? `SELECT * FROM ${tableInfo.tableName} LIMIT 10`
                          : "Poochho kuch bhi… e.g. \"how many rows are there?\""
                    }
                    aria-label={
                      mode === "sql"
                        ? "Run SQL against the local table"
                        : "Ask a question about your database"
                    }
                    className="glow-active max-h-32 min-h-11 flex-1 resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 font-mono text-sm text-[var(--text-1)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--text-3)] focus:border-[var(--border-strong)] disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={busy || !input.trim() || !tableInfo}
                    aria-label="Submit"
                    className="btn-glow flex size-11 shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ArrowUpIcon />
                  </button>
                </form>
                <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-3)]">
                  AIRGAP ·{" "}
                  {mode === "sql"
                    ? "SQL RUNS LOCALLY, ROWS NEVER LEAVE THE TAB"
                    : "ONLY YOUR QUESTION + COLUMN NAMES ARE SENT — ROWS NEVER LEAVE THE TAB"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Section 3 — Trust strip ---------------- */}
        <section
          id="safety"
          className="grid grid-cols-1 border-b border-[var(--border)] md:grid-cols-3"
        >
          {[
            {
              icon: "cloud_off",
              title: "LOCAL-FIRST",
              body: "Your file loads into a database running in this browser tab. It never uploads anywhere — not even to us.",
            },
            {
              icon: "visibility_off",
              title: "SCHEMA-ONLY",
              body: "Only column names and types ever reach the model — never a row of your data. Check the Network tab yourself.",
            },
            {
              icon: "shield",
              title: "READ-ONLY BY DESIGN",
              body: "Generated SQL is checked against a write-keyword blocklist before it runs, and always shown to you first.",
            },
          ].map((cell, i) => (
            <div
              key={cell.title}
              className={`flex flex-col items-center gap-3 px-6 py-12 text-center md:px-12 ${
                i > 0
                  ? "border-t border-[var(--border)] md:border-t-0 md:border-l"
                  : ""
              }`}
            >
              <Icon name={cell.icon} className="text-[28px] text-[var(--text-2)]" />
              <p className="label-mono">{cell.title}</p>
              <p className="max-w-[40ch] text-[13px] leading-relaxed text-[var(--text-2)]">
                {cell.body}
              </p>
            </div>
          ))}
        </section>

        {/* ---------------- Footer ---------------- */}
        <footer className="px-6 py-8 md:px-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)]">
            AIRGAP — LOCAL-FIRST SQL FOR ANY CSV. NOTHING LEAVES THE TAB.
          </p>
        </footer>
      </div>
    </div>
  );
}

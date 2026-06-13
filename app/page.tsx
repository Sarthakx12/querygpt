"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiResponse, ChatMessage, Exchange } from "@/lib/types";
import TopoBackground from "@/components/TopoBackground";
import ResponseCard from "@/components/ResponseCard";

/* ------------------------------------------------------------------ */
/* Suggestion chips                                                    */
/* ------------------------------------------------------------------ */

const CHIPS = [
  "How many total users are registered?",
  "Pichle mahine kitna revenue aaya?",
  "City wise users ka breakdown dikhao",
  "Top 5 cities by paid users",
  "Active users kitne hain?",
];

const DANGER_CHIP = "DROP TABLE users";

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

  /** Rolling window of the last 6 messages, sent for follow-up context. */
  const historyRef = useRef<ChatMessage[]>([]);
  const idRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("nf_history");
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
      localStorage.setItem("nf_history", JSON.stringify(next));
      return next;
    });
  }

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question || busy) return;

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
        body: JSON.stringify({ question, history: historyRef.current }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      response = (await res.json()) as ApiResponse;
    } catch (err) {
      response = {
        kind: "error",
        message:
          err instanceof Error ? err.message : "Something went wrong. Try again.",
      };
    }

    // Echo pushing: keep a rolling window of the last 6 messages.
    const echo =
      response.echo ??
      (response.kind === "result"
        ? response.answer
        : response.kind === "clarify"
          ? response.question
          : response.message);
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

  return (
    <div className="flex-1">
      {/* ---------------- Fixed header ---------------- */}
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/80 px-6 backdrop-blur-md md:px-12">
        <a href="#" className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-[4px] border border-[var(--border-strong)] font-mono text-xs text-[var(--text-1)]">
            NF
          </span>
          <span className="text-[15px] font-medium text-[var(--text-1)]">
            QueryGPT
          </span>
        </a>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--console-bg)] px-3 py-1.5">
            <span
              className="dot-pulse size-1.5 rounded-full"
              style={{ background: "var(--green)" }}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-2)]">
              DB CONNECTED
            </span>
          </span>
          <div className="hidden items-center gap-1 text-[var(--text-2)] md:flex">
            <a
              href="#safety"
              title="Schema"
              aria-label="Schema"
              className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"
            >
              <Icon name="schema" className="text-[20px]" />
            </a>
            <a
              href="https://github.com/sarthakx12/querygpt"
              target="_blank"
              rel="noreferrer"
              title="GitHub"
              aria-label="GitHub"
              className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"
            >
              <Icon name="terminal" className="text-[20px]" />
            </a>
          </div>
        </div>
      </header>

      {/* ---------------- Framed document ---------------- */}
      <div className="mx-auto max-w-[1100px] border-x border-[var(--border)] pt-14 pb-24">
        {/* ---------------- Section 1 — Hero ---------------- */}
        <section className="relative flex min-h-[78vh] flex-col items-center justify-center border-b border-[var(--border)] px-6 py-20 md:px-12 md:py-28">
          <TopoBackground />
          <div className="relative z-10 flex flex-col items-center text-center">
            <span className="rounded-full border border-[var(--border)] px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-3)]">
              ● NIKAHFOREVER · INTERNAL DATA PLATFORM
            </span>
            <h1
              className="mt-8 font-medium text-[var(--text-1)]"
              style={{
                fontSize: "clamp(44px, 7vw, 76px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.04,
              }}
            >
              Ask your database
              <br />
              <span className="font-serif italic">anything.</span>
            </h1>
            <p className="mt-7 max-w-xl text-[15px] leading-relaxed text-[var(--text-2)]">
              QueryGPT turns plain English — ya Hinglish — into safe, read-only
              SQL and answers in seconds. Every query it runs is shown to you.
              No data-team ticket required.
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
          className="scroll-mt-14 border-b border-[var(--border)] px-6 py-20 md:px-12 md:py-28"
        >
          <p className="label-mono">QUERY CONSOLE</p>
          <h2 className="mt-3 text-[28px] font-medium tracking-[-0.02em] text-[var(--text-1)] md:text-[32px]">
            Poochho, <span className="font-serif italic">seedha jawab.</span>
          </h2>

          {/* Console frame */}
          <div className="relative mt-8 flex h-[640px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--console-bg)] shadow-[0_0_50px_rgba(0,0,0,0.5)] md:h-[700px]">
            {/* Sidebar (Desktop only) */}
            <div className="hidden w-[260px] flex-col border-r border-[var(--border)] bg-[var(--bg)]/30 p-5 md:flex">
              <p className="label-mono mb-5 text-[10px] tracking-[0.2em] text-[var(--text-3)] uppercase">
                Recent Queries
              </p>
              <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                {queryHistory.length === 0 ? (
                  <p className="text-[12px] italic text-[var(--text-3)]">
                    No recent queries.
                  </p>
                ) : (
                  queryHistory.map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => ask(q)}
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

            {/* Main Console Area */}
            <div className="relative flex flex-1 flex-col overflow-hidden">
              {/* Sticky suggestion chips */}
              <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--console-bg)] p-4">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)]">
                  SUGGESTED:
                </span>
                {CHIPS.slice(0, 4).map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => ask(chip)}
                    disabled={busy}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-xs text-[var(--text-2)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-1)] disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => ask(DANGER_CHIP)}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-full border bg-[var(--surface)] px-3 py-1.5 font-mono text-xs transition-colors disabled:opacity-50"
                  style={{
                    borderColor: "rgba(255,180,171,0.3)",
                    color: "rgba(255,180,171,0.9)",
                  }}
                >
                  <Icon name="warning" className="text-[14px]" />
                  {DANGER_CHIP}
                </button>
              </div>

              {/* Scrollable message thread */}
              <div className="flex-1 overflow-y-auto p-6 pb-28">
                <div className="flex flex-col gap-6">
                  {/* Intro system message */}
                  <div className="fade-up flex max-w-[85%] flex-col self-start">
                    <RoleLabel icon="database" label="SYSTEM" align="left" />
                    <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-1)]">
                      Console initialized. Connected to primary replica. What
                      would you like to know?
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
                        <RoleLabel
                          icon="auto_awesome"
                          label="NF QUERYGPT"
                          align="left"
                        />
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
                  className="flex items-center gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask(input);
                  }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={busy}
                    placeholder='Poochho kuch bhi… e.g. "top 5 cities by paid users"'
                    aria-label="Ask a question about your database"
                    className="glow-active h-11 flex-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 font-mono text-sm text-[var(--text-1)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--text-3)] focus:border-[var(--border-strong)] disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    aria-label="Submit question"
                    className="btn-glow flex size-11 shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ArrowUpIcon />
                  </button>
                </form>
                <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-3)]">
                  NF QUERYGPT V.01 · INTERNAL USE ONLY
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Section 3 — Trust strip ---------------- */}
        <section
          id="safety"
          className="scroll-mt-14 grid grid-cols-1 border-b border-[var(--border)] md:grid-cols-3"
        >
          {[
            {
              icon: "visibility",
              title: "READ-ONLY × 3",
              body: "Prompt rules, a SQL validator, and a read-only database engine. Writes are physically impossible.",
            },
            {
              icon: "autorenew",
              title: "SELF-CORRECTING",
              body: "Failed SQL goes back to the model with the exact error and is retried automatically.",
            },
            {
              icon: "translate",
              title: "HINGLISH NATIVE",
              body: "Poocho jaise apni team se poochte ho — answers mirror your language.",
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
            NF QUERYGPT — BUILT FOR THE NIKAHFOREVER BUILDATHON · SQLITE ·
            CLAUDE
          </p>
        </footer>
      </div>
    </div>
  );
}

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
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  /** Rolling window of the last 6 messages, sent for follow-up context. */
  const historyRef = useRef<ChatMessage[]>([]);
  const idRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

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

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question || busy) return;

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
      {/* ---------------- Section 0 — Nav ---------------- */}
      <nav className="sticky top-0 z-40 h-14 border-b border-[var(--border)] bg-black/60 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-[1100px] items-center justify-between px-6 md:px-12">
          <a href="#" className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-[4px] border border-[var(--border-strong)] font-mono text-xs text-[var(--text-1)]">
              NF
            </span>
            <span className="text-[15px] font-medium text-[var(--text-1)]">
              QueryGPT
            </span>
          </a>
          <div className="flex items-center gap-5">
            <a
              href="#safety"
              className="hidden text-[13px] text-[var(--text-2)] transition-colors hover:text-white sm:block"
            >
              Schema
            </a>
            <a
              href="https://github.com/sarthakx12/querygpt"
              target="_blank"
              rel="noreferrer"
              className="hidden text-[13px] text-[var(--text-2)] transition-colors hover:text-white sm:block"
            >
              GitHub
            </a>
            <span className="flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5">
              <span
                className="dot-pulse size-1.5 rounded-full"
                style={{ background: "var(--green)" }}
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-2)]">
                DB CONNECTED · READ-ONLY
              </span>
            </span>
          </div>
        </div>
      </nav>

      {/* ---------------- Framed document ---------------- */}
      <div className="mx-auto max-w-[1100px] border-x border-[var(--border)] pb-24">
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
                className="btn-glow h-11 px-6 text-sm font-medium"
              >
                Start querying ↓
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

          {exchanges.length === 0 && (
            <div className="mt-8 flex flex-wrap gap-2.5">
              {CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => ask(chip)}
                  className="rounded-full border border-[var(--border)] px-4 py-2 font-mono text-xs text-[var(--text-2)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-1)]"
                >
                  {chip}
                </button>
              ))}
              <button
                type="button"
                onClick={() => ask(DANGER_CHIP)}
                className="rounded-full border px-4 py-2 font-mono text-xs transition-shadow"
                style={{
                  borderColor: "rgba(248,113,113,0.4)",
                  color: "rgba(248,113,113,0.9)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow =
                    "0 0 14px rgba(248,113,113,0.25)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                {DANGER_CHIP}
              </button>
            </div>
          )}

          <div className="mt-10 flex flex-col gap-6">
            {exchanges.map((ex) => (
              <div key={ex.id} className="fade-up flex flex-col gap-4">
                <div className="flex justify-end">
                  <p className="max-w-[80%] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-1)]">
                    {ex.question}
                  </p>
                </div>
                <div className="max-w-[92%]">
                  <ResponseCard response={ex.response} />
                </div>
              </div>
            ))}
            {/* clears the fixed input bar when auto-scrolled into view */}
            <div ref={threadEndRef} className="scroll-mb-24" />
          </div>
        </section>

        {/* ---------------- Section 3 — Trust strip ---------------- */}
        <section
          id="safety"
          className="scroll-mt-14 grid grid-cols-1 border-b border-[var(--border)] md:grid-cols-3"
        >
          {[
            {
              title: "READ-ONLY × 3",
              body: "Prompt rules, a SQL validator, and a read-only database engine. Writes are physically impossible.",
            },
            {
              title: "SELF-CORRECTING",
              body: "Failed SQL goes back to the model with the exact error and is retried automatically.",
            },
            {
              title: "HINGLISH NATIVE",
              body: "Poocho jaise apni team se poochte ho — answers mirror your language.",
            },
          ].map((cell, i) => (
            <div
              key={cell.title}
              className={`px-6 py-12 md:px-12 ${
                i > 0
                  ? "border-t border-[var(--border)] md:border-t-0 md:border-l"
                  : ""
              }`}
            >
              <p className="label-mono">{cell.title}</p>
              <p className="mt-3 max-w-[40ch] text-[13px] leading-relaxed text-[var(--text-2)]">
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

      {/* ---------------- Input bar (pinned) ---------------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[rgba(14,14,16,0.9)] backdrop-blur-md">
        <form
          className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-4 md:px-12"
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
            className="h-10 flex-1 rounded-md border border-transparent bg-transparent px-3 text-[15px] text-[var(--text-1)] transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-[var(--text-3)] focus:border-[var(--border-strong)] focus:shadow-[0_0_16px_rgba(255,255,255,0.08)] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Submit question"
            className="btn-glow flex size-10 shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowUpIcon />
          </button>
        </form>
      </div>
    </div>
  );
}

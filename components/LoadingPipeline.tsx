"use client";

import { useEffect, useState } from "react";

const STEPS = [
  "PARSING INTENT",
  "GENERATING SQL",
  "VALIDATING · READ-ONLY CHECK",
  "EXECUTING QUERY",
];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export default function LoadingPipeline() {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(
      () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
      900
    );
    return () => clearInterval(id);
  }, [reduced]);

  if (reduced) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <p className="label-mono text-xs">WORKING…</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <ul className="flex flex-col gap-2" aria-label="Query pipeline progress">
        {STEPS.map((label, i) => {
          if (i > step) return null;
          const done = i < step;
          return (
            <li
              key={label}
              className="font-mono text-xs uppercase tracking-[0.18em]"
              style={{ color: done ? "var(--text-3)" : "var(--text-2)" }}
            >
              {done ? (
                <span className="opacity-60">{label} ✓</span>
              ) : (
                <span>
                  {label}
                  <span className="cursor-blink ml-1 text-[var(--text-1)]">
                    ▍
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

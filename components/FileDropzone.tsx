"use client";

import { useRef, useState, type DragEvent } from "react";

/**
 * Drag-drop + click-to-browse file input. Only ever hands the raw File
 * object up to the caller — reading its bytes is DuckDB's job, inside the
 * worker (see lib/duckdb.ts). Nothing here calls file.text() or
 * file.arrayBuffer(), so a large drop never blocks this thread.
 */
export default function FileDropzone({
  onFile,
  busy,
}: {
  onFile: (file: File) => void;
  busy: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !busy && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      aria-label="Drop a CSV or Parquet file, or click to browse"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      className={`flex flex-col items-center gap-2 rounded-lg border border-dashed p-5 text-center transition-colors ${
        busy ? "cursor-wait opacity-60" : "cursor-pointer"
      }`}
      style={{
        borderColor: dragging ? "var(--border-strong)" : "var(--border)",
        background: dragging ? "rgba(255,255,255,0.04)" : "transparent",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.parquet"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <span
        className={`material-symbols-outlined text-[22px] ${
          dragging ? "text-[var(--text-1)]" : "text-[var(--text-3)]"
        }`}
        aria-hidden="true"
      >
        {busy ? "hourglass_empty" : "upload_file"}
      </span>
      <span className="label-mono">
        {busy ? "LOADING…" : "DROP CSV / PARQUET"}
      </span>
      <span className="text-[11px] text-[var(--text-3)]">
        or click to browse — stays in this tab
      </span>
    </div>
  );
}

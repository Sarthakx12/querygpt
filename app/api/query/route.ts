import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import type { ChatMessage, ColumnSchema, SqlPlan } from "@/lib/types";
import { validateSql } from "@/lib/safety";

/**
 * The schema-only LLM proxy — the single server-side component of Airgap.
 *
 * It accepts a question, the COLUMN NAMES AND TYPES of the user's local table,
 * and prior conversation turns. It returns SQL text. Row data is never sent
 * here and never returned from here: the client runs the SQL against its own
 * in-browser DuckDB instance. This asymmetry is the entire product thesis, so
 * the request body is structurally validated below rather than trusted.
 *
 * Provider: DeepSeek, via its OpenAI-compatible endpoint.
 */

const BASE_URL = "https://api.deepseek.com";
// deepseek-chat / deepseek-reasoner are deprecated as of 2026-07-24.
// v4-flash is the cheap/fast tier ($0.14 in / $0.28 out per 1M) — ample for
// turning one question plus a column list into a single SELECT.
const MODEL = "deepseek-v4-flash";
const MAX_TOKENS = 2048;

type LlmOutput = {
  needs_clarification: boolean;
  clarification_question: string | null;
  sql: string | null;
  explanation: string | null;
  result_type: "metric" | "table" | "chart" | null;
  chart: { type: "bar" | "line"; x_column: string; y_column: string } | null;
  confidence: "high" | "medium" | "low" | null;
  tables_used: string[];
};

let promptTemplate: string | null = null;
async function getPromptTemplate(): Promise<string> {
  if (promptTemplate) return promptTemplate;
  promptTemplate = await readFile(path.join(process.cwd(), "system_prompt.txt"), "utf8");
  return promptTemplate;
}

const ALLOWED_KEYS = new Set(["question", "schema", "history"]);

/**
 * Structural guard on the request body. This is deliberately strict: if a
 * future change ever starts posting rows (a "sample rows for better SQL"
 * feature, a debug payload), this rejects it loudly instead of silently
 * shipping user data off the machine.
 */
function validateBody(body: unknown):
  | { ok: true; question: string; schema: ColumnSchema[]; history: ChatMessage[] }
  | { ok: false; message: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Invalid request body." };
  }
  const record = body as Record<string, unknown>;

  const extra = Object.keys(record).filter((k) => !ALLOWED_KEYS.has(k));
  if (extra.length > 0) {
    return {
      ok: false,
      message: `Request carried unexpected field(s): ${extra.join(", ")}. Only question, schema, and history may be sent.`,
    };
  }

  const { question, schema, history } = record;

  if (typeof question !== "string" || question.trim() === "") {
    return { ok: false, message: "Question is required." };
  }
  if (!Array.isArray(schema) || schema.length === 0) {
    return { ok: false, message: "Schema is required — load a file first." };
  }
  // Each column must be exactly {name, type} — no smuggled sample values.
  for (const col of schema) {
    if (typeof col !== "object" || col === null) {
      return { ok: false, message: "Malformed schema entry." };
    }
    const c = col as Record<string, unknown>;
    const keys = Object.keys(c);
    if (
      keys.length !== 2 ||
      !keys.includes("name") ||
      !keys.includes("type") ||
      typeof c.name !== "string" ||
      typeof c.type !== "string"
    ) {
      return {
        ok: false,
        message: "Schema entries must contain exactly a name and a type.",
      };
    }
  }
  if (history !== undefined && !Array.isArray(history)) {
    return { ok: false, message: "Malformed history." };
  }

  return {
    ok: true,
    question,
    schema: schema as ColumnSchema[],
    history: (history ?? []) as ChatMessage[],
  };
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json<SqlPlan>(
      { kind: "error", message: "Invalid request body." },
      { status: 400 }
    );
  }

  const parsed = validateBody(raw);
  if (!parsed.ok) {
    return NextResponse.json<SqlPlan>(
      { kind: "error", message: parsed.message },
      { status: 400 }
    );
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return NextResponse.json<SqlPlan>({
      kind: "error",
      message:
        "DEEPSEEK_API_KEY is not configured, so plain-English questions are unavailable. Switch to SQL mode — that runs entirely locally and needs no key.",
    });
  }

  const { question, schema, history } = parsed;

  try {
    // Only names and types are interpolated — this is the one place schema
    // becomes prompt text, and there is no path from row data to here.
    const schemaText = schema.map((c) => `  ${c.name} ${c.type}`).join("\n");
    const system = (await getPromptTemplate()).replace("{SCHEMA}", schemaText);

    const client = new OpenAI({
      baseURL: BASE_URL,
      apiKey: process.env.DEEPSEEK_API_KEY,
    });

    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // DeepSeek's JSON mode requires the word "json" and a worked example in
      // the prompt — system_prompt.txt supplies both.
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        ...history.map((h) => ({
          role: h.role === "user" ? ("user" as const) : ("assistant" as const),
          content: h.content,
        })),
        { role: "user" as const, content: question },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    // Documented DeepSeek caveat: JSON mode can occasionally return empty
    // content. Surface it as a retryable message rather than a parse crash.
    if (!content || content.trim() === "") {
      return NextResponse.json<SqlPlan>({
        kind: "error",
        message: "The model returned an empty response. Try asking again.",
      });
    }

    let out: LlmOutput;
    try {
      out = JSON.parse(content) as LlmOutput;
    } catch {
      return NextResponse.json<SqlPlan>({
        kind: "error",
        message: "The model returned malformed JSON.",
      });
    }

    if (out.needs_clarification || !out.sql) {
      return NextResponse.json<SqlPlan>({
        kind: "clarify",
        question:
          out.clarification_question ?? "Could you rephrase that with a bit more detail?",
      });
    }

    // Defense in depth — the client re-checks before executing, since that's
    // where execution actually happens.
    const check = validateSql(out.sql);
    if (!check.safe) {
      return NextResponse.json<SqlPlan>({
        kind: "blocked",
        message: check.reason ?? "Unsafe SQL detected.",
      });
    }

    return NextResponse.json<SqlPlan>({
      kind: "sql",
      sql: out.sql,
      answer: out.explanation ?? "",
      result_type: out.result_type ?? "table",
      chart_metadata: out.result_type === "chart" ? out.chart : null,
      confidence: out.confidence,
      tables_used: out.tables_used?.length ? out.tables_used : ["data"],
    });
  } catch (err) {
    if (err instanceof OpenAI.AuthenticationError) {
      return NextResponse.json<SqlPlan>({
        kind: "error",
        message: "The configured DEEPSEEK_API_KEY was rejected. SQL mode still works offline.",
      });
    }
    if (err instanceof OpenAI.RateLimitError) {
      return NextResponse.json<SqlPlan>({
        kind: "error",
        message: "Rate limited by the DeepSeek API. Wait a moment and try again.",
      });
    }
    if (err instanceof OpenAI.APIConnectionError) {
      return NextResponse.json<SqlPlan>({
        kind: "error",
        message:
          "Couldn't reach the DeepSeek API — you may be offline. SQL mode still runs entirely in this tab.",
      });
    }
    console.error("[/api/query]", err);
    return NextResponse.json<SqlPlan>({
      kind: "error",
      message: err instanceof Error ? err.message : "Unexpected error generating SQL.",
    });
  }
}

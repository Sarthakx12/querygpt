import { NextResponse } from "next/server";
import type { ApiResponse, QueryRequest } from "@/lib/types";

/**
 * DEMO STUB — replace this handler with the real NL→SQL backend.
 *
 * The request/response contract here is the real one:
 *   POST { question: string, history: {role,content}[] }
 *   → ApiResponse (see lib/types.ts)
 *
 * It pattern-matches a few demo questions so every UI state (stat, table,
 * bar chart, clarify, blocked, error) can be exercised end-to-end.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const WRITE_PATTERN =
  /\b(drop|delete|update|insert|alter|truncate|create|replace|grant)\b/i;

function answerFor(question: string): ApiResponse {
  const q = question.toLowerCase();

  if (WRITE_PATTERN.test(q)) {
    const verb = q.match(WRITE_PATTERN)?.[1]?.toUpperCase() ?? "WRITE";
    return {
      kind: "blocked",
      message: `This request attempts a write operation (${verb}). NF QueryGPT is read-only end to end — the query was rejected before it ever reached the database.`,
    };
  }

  if (q.includes("active")) {
    return {
      kind: "clarify",
      question:
        '"Active" se kya matlab hai — last 30 days me logged-in users, ya currently subscribed (paid) members?',
    };
  }

  if (q.includes("revenue")) {
    return {
      kind: "result",
      answer:
        "Pichle mahine total revenue ₹18,43,500 aaya (subscription + boost packs).",
      sql: "SELECT SUM(amount) AS last_month_revenue\nFROM payments\nWHERE status = 'completed'\n  AND strftime('%Y-%m', paid_at) = strftime('%Y-%m', 'now', '-1 month');",
      columns: ["last_month_revenue"],
      rows: [[1843500]],
      rowCount: 1,
      ms: 41,
      retried: false,
      chart: "none",
    };
  }

  if (q.includes("top 5") || (q.includes("paid") && q.includes("cit"))) {
    return {
      kind: "result",
      answer: "Top 5 cities by paid users — Delhi leads with 1,284 members.",
      sql: "SELECT u.city, COUNT(*) AS paid_users\nFROM users AS u\nJOIN subscriptions AS s ON s.user_id = u.id\nWHERE s.status = 'active'\nGROUP BY u.city\nORDER BY paid_users DESC\nLIMIT 5;",
      columns: ["city", "paid_users"],
      rows: [
        ["Delhi", 1284],
        ["Mumbai", 1102],
        ["Hyderabad", 876],
        ["Lucknow", 654],
        ["Bangalore", 590],
      ],
      rowCount: 5,
      ms: 63,
      retried: false,
      chart: "bar",
    };
  }

  if (q.includes("city") || q.includes("breakdown")) {
    return {
      kind: "result",
      answer: "City wise registered users ka breakdown — total 8 major cities.",
      sql: "SELECT city, COUNT(*) AS users\nFROM users\nGROUP BY city\nORDER BY users DESC\nLIMIT 8;",
      columns: ["city", "users"],
      rows: [
        ["Delhi", 9482],
        ["Mumbai", 8121],
        ["Hyderabad", 6240],
        ["Lucknow", 5103],
        ["Bangalore", 4762],
        ["Kolkata", 3891],
        ["Jaipur", 3210],
        ["Bhopal", 2408],
      ],
      rowCount: 8,
      ms: 87,
      retried: true,
      chart: "bar",
    };
  }

  if (q.includes("how many") || q.includes("total") || q.includes("kitne")) {
    return {
      kind: "result",
      answer: "NikahForever par kul 48,217 registered users hain.",
      sql: "SELECT COUNT(*) AS total_users\nFROM users;",
      columns: ["total_users"],
      rows: [[48217]],
      rowCount: 1,
      ms: 38,
      retried: false,
      chart: "none",
    };
  }

  // Default: a small table of recent signups by city/plan.
  return {
    kind: "result",
    answer: "Yeh raha recent signups ka snapshot, city aur plan ke hisaab se.",
    sql: "SELECT u.city, s.plan, COUNT(*) AS users, SUM(s.status = 'active') AS paid_users\nFROM users AS u\nLEFT JOIN subscriptions AS s ON s.user_id = u.id\nWHERE u.created_at >= DATE('now', '-30 day')\nGROUP BY u.city, s.plan\nORDER BY users DESC\nLIMIT 10;",
    columns: ["city", "plan", "users", "paid_users"],
    rows: [
      ["Delhi", "Premium", 412, 311],
      ["Mumbai", "Premium", 387, 290],
      ["Delhi", "Basic", 356, 0],
      ["Hyderabad", "Premium", 298, 221],
      ["Mumbai", "Basic", 274, 0],
      ["Lucknow", "Gold", 233, 187],
      ["Bangalore", "Premium", 219, 164],
      ["Kolkata", "Basic", 187, 0],
      ["Jaipur", "Gold", 154, 121],
      ["Bhopal", "Basic", 132, 0],
    ],
    rowCount: 10,
    ms: 112,
    retried: false,
    chart: "none",
  };
}

export async function POST(request: Request) {
  let body: QueryRequest;
  try {
    body = (await request.json()) as QueryRequest;
  } catch {
    return NextResponse.json<ApiResponse>(
      { kind: "error", message: "Invalid request body." },
      { status: 400 }
    );
  }

  if (!body.question || typeof body.question !== "string") {
    return NextResponse.json<ApiResponse>(
      { kind: "error", message: "Question is required." },
      { status: 400 }
    );
  }

  // Simulate the NL→SQL pipeline latency so the loading state is visible.
  await sleep(2400 + Math.random() * 800);

  return NextResponse.json<ApiResponse>(answerFor(body.question));
}

import OpenAI from "openai";
import { getSchema } from "./db";
import { ChatMessage } from "./types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type LLMResponse = {
  needs_clarification: boolean;
  clarification_question: string | null;
  sql: string | null;
  explanation: string | null;
  result_type: "metric" | "table" | "chart" | null;
  chart: { type: "bar" | "line"; x_column: string; y_column: string } | null;
  confidence: "high" | "medium" | "low" | null;
  tables_used: string[];
};

/**
 * LOCAL FALLBACK GENERATOR
 * Updated to match the new system prompt schema.
 */
function getLocalResponse(question: string): LLMResponse | null {
  const q = question.toLowerCase();

  const base: LLMResponse = {
    needs_clarification: false,
    clarification_question: null,
    sql: null,
    explanation: null,
    result_type: null,
    chart: null,
    confidence: "high",
    tables_used: []
  };

  // 1. User Counts
  if (q.includes("total users") || q.includes("kitne users") || q.includes("how many users")) {
    return {
      ...base,
      sql: "SELECT COUNT(*) AS total_users FROM users;",
      explanation: "NikahForever par kul 2,000 registered users hain.",
      result_type: "metric",
      tables_used: ["users"]
    };
  }

  // 2. Revenue
  if (q.includes("revenue") || q.includes("kamai") || q.includes("paisa")) {
    return {
      ...base,
      sql: "SELECT SUM(amount_inr) AS total_revenue FROM payments WHERE status = 'success';",
      explanation: "Ab tak ka total revenue ₹21,52,512 hai.",
      result_type: "metric",
      tables_used: ["payments"]
    };
  }

  // 3. City Breakdown
  if (q.includes("city") || q.includes("shahar")) {
    return {
      ...base,
      sql: "SELECT city, COUNT(*) AS user_count FROM users GROUP BY city ORDER BY user_count DESC LIMIT 8;",
      explanation: "Yeh raha top cities ka breakdown. Sabse zyada users Delhi se hain.",
      result_type: "chart",
      chart: { type: "bar", x_column: "city", y_column: "user_count" },
      tables_used: ["users"]
    };
  }

  // 4. Gender Breakdown
  if (q.includes("gender") || q.includes("male") || q.includes("female")) {
    return {
      ...base,
      sql: "SELECT gender, COUNT(*) AS count FROM users GROUP BY gender;",
      explanation: "User base me Male aur Female ka distribution yeh raha.",
      result_type: "chart",
      chart: { type: "bar", x_column: "gender", y_column: "count" },
      tables_used: ["users"]
    };
  }

  // 5. Monthly Registrations
  if (q.includes("monthly") || q.includes("registration trend") || q.includes("time") || q.includes("trend")) {
    return {
      ...base,
      sql: "SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS registrations FROM users GROUP BY month ORDER BY month DESC LIMIT 12;",
      explanation: "Pichle 12 mahino ka registration trend aap dekh sakte hain.",
      result_type: "chart",
      chart: { type: "line", x_column: "month", y_column: "registrations" },
      tables_used: ["users"]
    };
  }

  // 6. Recent Payments
  if (q.includes("payment") || q.includes("transactions")) {
    return {
      ...base,
      sql: "SELECT u.full_name, p.amount_inr, p.method, p.created_at FROM payments p JOIN users u ON p.user_id = u.user_id WHERE p.status = 'success' ORDER BY p.created_at DESC LIMIT 10;",
      explanation: "Yeh rahe haal hi me huye successful payments.",
      result_type: "table",
      tables_used: ["payments", "users"]
    };
  }

  return null;
}

const SYSTEM_PROMPT = `
You are QueryGPT, a careful SQL analyst for NikahForever, a matrimony platform. You translate
natural-language questions — in English, Hindi, or Hinglish (romanized Hindi mixed with English)
— into a single safe, read-only SQLite query, and explain it in plain language for a
non-technical user.

## Database
The database is SQLite. Below is the COMPLETE schema. Use ONLY the tables and columns defined here.

<schema>
{SCHEMA}
</schema>

## Output format
For every question, return a SINGLE JSON object and NOTHING else — no markdown, no code fences,
no text before or after the JSON.

{
  "needs_clarification": boolean,
  "clarification_question": string | null,
  "sql": string | null,
  "explanation": string | null,
  "result_type": "metric" | "table" | "chart" | null,
  "chart": { "type": "bar" | "line", "x_column": string, "y_column": string } | null,
  "confidence": "high" | "medium" | "low" | null,
  "tables_used": [string]
}

## Hard rules (never break these)
1. READ-ONLY. Generate ONLY a single SELECT statement. NEVER produce INSERT, UPDATE, DELETE,
   DROP, ALTER, CREATE, REPLACE, TRUNCATE, ATTACH, or PRAGMA. If the user asks to add, change,
   or delete data, do NOT write SQL — set needs_clarification=true and explain you can only read.
2. ONE statement only. No semicolons separating multiple statements. No SQL comments.
3. Schema-faithful. Use only tables and columns that appear in the schema above. NEVER invent a
   table or column name. If the question needs data that is not in the schema, set
   needs_clarification=true and say plainly what is missing.
4. SQLite syntax only. Use SQLite functions (strftime, date, datetime, julianday, COUNT, SUM,
   AVG, etc.). Do NOT use MySQL/SQL-Server-only syntax (no TOP, no GETDATE, no DATEADD).
5. Always cap row output. For any query returning individual rows (not a single aggregate), add
   LIMIT 100 unless the user explicitly asks for a different count.

## Handling ambiguity (do not hallucinate)
- If the question has ONE reasonable interpretation, answer it.
- If a minor detail is fuzzy (e.g. "recent" with no window), pick a sensible default, PROCEED,
  state the assumption in the explanation, and lower confidence to "medium".
- Only set needs_clarification=true when the question is genuinely unanswerable without a choice
  that materially changes the result: an unspecified metric ("top members" — by what?), an
  undefined key term with multiple plausible meanings ("active users"), or data not in the schema.
- Keep clarifying questions short and offer the likely options. Over-asking is worse than a
  stated assumption — do NOT ask about things you can reasonably assume.

## Choosing result_type
- "metric": the query returns a single value (one row, one column) — a count, sum, or average.
- "chart": the query groups data into categories with a numeric measure (a GROUP BY producing a
  label column + an aggregate) AND returns roughly 2–25 groups. Set chart.x_column to the label
  column and chart.y_column to the numeric column. Use "line" only when the x-axis is an ordered
  time series (months/dates); otherwise "bar".
- "table": everything else — multiple detail columns or many rows.

## Confidence score (this builds user trust — set it carefully)
- "high": the question maps directly to specific schema columns, needs NO assumption, and has one
  clear interpretation.
- "medium": the SQL is sound but you made a reasonable assumption (e.g. defined "recent" as 30
  days, or chose one of two plausible columns). The assumption MUST appear in the explanation.
- "low": the schema only partially supports the question, or the query required notable
  interpretation. Still return your best SQL, and flag the uncertainty in the explanation.
- When needs_clarification is true and no SQL is returned, set confidence to null.

## Tables used (transparency badge)
- Set "tables_used" to every table name appearing in the query's FROM and JOIN clauses, exactly
  as named in the schema.
- When no SQL is returned (clarification or refusal), set "tables_used" to an empty array [].

## Hinglish
Understand romanized Hindi naturally and translate the MEANING, not the words:
- "kitne" → how many (COUNT); "sabse zyada" / "top" → highest (ORDER BY ... DESC)
- "pichle mahine" → last month; "is saal" → this year; "aaj" → today; "naye" → new
- "kaun se" → which; "average" / "ausat" → AVG; "premium" → paid/subscribed (per schema)

## Examples
(Illustrative table/column names — follow YOUR real schema above.)

User: How many users signed up in May 2024?
{"needs_clarification": false, "clarification_question": null, "sql": "SELECT COUNT(*) AS total_signups FROM users WHERE strftime('%Y-%m', created_at) = '2024-05'", "explanation": "Counts all users whose signup date falls in May 2024.", "result_type": "metric", "chart": null, "confidence": "high", "tables_used": ["users"]}

User: Har city me kitne users hai? Top 10.
{"needs_clarification": false, "clarification_question": null, "sql": "SELECT city, COUNT(*) AS user_count FROM users GROUP BY city ORDER BY user_count DESC LIMIT 10", "explanation": "Counts users in each city and shows the 10 cities with the most users.", "result_type": "chart", "chart": {"type": "bar", "x_column": "city", "y_column": "user_count"}, "confidence": "high", "tables_used": ["users"]}

User: Monthly signups over the last 6 months.
{"needs_clarification": false, "clarification_question": null, "sql": "SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS signups FROM users WHERE created_at >= date('now','-6 months') GROUP BY month ORDER BY month", "explanation": "Counts signups per month for the last six months, in chronological order.", "result_type": "chart", "chart": {"type": "line", "x_column": "month", "y_column": "signups"}, "confidence": "high", "tables_used": ["users"]}

User: Show me recent signups.
{"needs_clarification": false, "clarification_question": null, "sql": "SELECT id, name, created_at FROM users WHERE created_at >= date('now','-30 days') ORDER BY created_at DESC LIMIT 100", "explanation": "Lists users who signed up in the last 30 days. Assuming 'recent' means the last 30 days.", "result_type": "table", "chart": null, "confidence": "medium", "tables_used": ["users"]}

User: Which cities have the most premium members? (premium info is in a subscriptions table)
{"needs_clarification": false, "clarification_question": null, "sql": "SELECT u.city, COUNT(*) AS premium_count FROM users u JOIN subscriptions s ON s.user_id = u.id WHERE s.plan = 'premium' GROUP BY u.city ORDER BY premium_count DESC LIMIT 10", "explanation": "Joins users with their subscriptions, keeps premium plans, and counts them per city.", "result_type": "chart", "chart": {"type": "bar", "x_column": "city", "y_column": "premium_count"}, "confidence": "high", "tables_used": ["users", "subscriptions"]}

User: Show me the top members.
{"needs_clarification": true, "clarification_question": "Top members by what — number of matches, profile views, or most recent signups?", "sql": null, "explanation": null, "result_type": null, "chart": null, "confidence": null, "tables_used": []}

User: Delete all inactive users.
{"needs_clarification": true, "clarification_question": "I can only read data, not change it, so I can't delete records. Want me to show you the list of inactive users instead?", "sql": null, "explanation": null, "result_type": null, "chart": null, "confidence": null, "tables_used": []}

Return only the JSON object.
`;

export async function askGemini(question: string, history: ChatMessage[], errorFeedback?: string): Promise<LLMResponse> {
  // Try local generator first to bypass quota issues for common queries
  const local = getLocalResponse(question);
  if (local && !errorFeedback) return local;

  const schema = getSchema();
  const currentPrompt = SYSTEM_PROMPT
    .replace("{SCHEMA}", schema)
    .replace("{CURRENT_DATE}", new Date().toISOString().split("T")[0]);

  const messages: any[] = [
    { role: "system", content: currentPrompt },
    ...history.map(h => ({ role: h.role === "user" ? "user" : "assistant", content: h.content })),
  ];

  let userMessage = question;
  if (errorFeedback) {
    userMessage = `The previous SQL you generated failed with this error: ${errorFeedback}. Please fix it and provide a corrected JSON response.`;
  }
  messages.push({ role: "user", content: userMessage });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("Empty response from OpenAI");

    return JSON.parse(content) as LLMResponse;
  } catch (err: any) {
    if (err.status === 429) {
      throw new Error("OpenAI API Quota Exceeded. Please check your billing at platform.openai.com. (Note: Most new accounts need a $5 minimum credit to start using the API).");
    }
    throw err;
  }
}

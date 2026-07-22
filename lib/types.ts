/**
 * The /api/query contract. Do not alter — the frontend, the response
 * renderer, and the backend all depend on these exact shapes.
 */

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * The full request body sent to /api/query. These three keys are the ONLY
 * thing that ever crosses the network — `schema` is column names and types,
 * never values. See app/api/query/route.ts, which rejects any other key.
 */
export type QueryRequest = {
  question: string;
  schema: ColumnSchema[];
  history: ChatMessage[];
};

export type CellValue = string | number | null;

/** One column of a loaded table, as inferred by DuckDB's DESCRIBE. */
export type ColumnSchema = {
  name: string;
  /** DuckDB's inferred type — BIGINT, VARCHAR, DATE, DOUBLE, … */
  type: string;
};

/** The currently loaded local table. There is exactly one this week. */
export type TableInfo = {
  tableName: string;
  fileName: string;
  columns: ColumnSchema[];
  rowCount: number;
  loadMs: number;
};

/** Plain-JS result of a local DuckDB query — no Arrow types escape lib/duckdb.ts. */
export type QueryResult = {
  columns: string[];
  rows: CellValue[][];
  ms: number;
};

export type ApiResponse =
  | {
      kind: "result";
      /** One-line natural-language answer, mirrors the user's language. */
      answer: string;
      sql: string;
      columns: string[];
      rows: CellValue[][];
      rowCount: number;
      /** Query execution time in milliseconds. */
      ms: number;
      /** True when the SQL failed once and was self-corrected. */
      retried: boolean;
      /** Backend routing hint. */
      result_type: "metric" | "table" | "chart";
      /** Chart metadata. */
      chart_metadata?: { type: "bar" | "line"; x_column: string; y_column: string } | null;
      /** Confidence score. */
      confidence: "high" | "medium" | "low" | null;
      /** Tables involved in the query. */
      tables_used: string[];
      /** Assistant text pushed into the rolling history window. */
      echo?: string;
    }
  | {
      kind: "clarify";
      question: string;
      echo?: string;
    }
  | {
      kind: "blocked";
      message: string;
      echo?: string;
    }
  | {
      kind: "error";
      message: string;
      echo?: string;
    };

/**
 * What /api/query returns: a *plan* (SQL text + presentation hints), never
 * results. The client executes the SQL against its local DuckDB and builds
 * the `ApiResponse` "result" shape itself — rows are produced in the browser
 * and never round-trip through the server.
 */
export type SqlPlan =
  | {
      kind: "sql";
      sql: string;
      /** The model's own explanation of what the query does. */
      answer: string;
      result_type: "metric" | "table" | "chart";
      chart_metadata?: { type: "bar" | "line"; x_column: string; y_column: string } | null;
      confidence: "high" | "medium" | "low" | null;
      tables_used: string[];
    }
  | { kind: "clarify"; question: string }
  | { kind: "blocked"; message: string }
  | { kind: "error"; message: string };

/** One user question + its (possibly pending) response. */
export type Exchange = {
  id: number;
  question: string;
  response: ApiResponse | null; // null = in flight
};

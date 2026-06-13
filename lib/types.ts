/**
 * The /api/query contract. Do not alter — the frontend, the response
 * renderer, and the backend all depend on these exact shapes.
 */

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type QueryRequest = {
  question: string;
  history: ChatMessage[];
};

export type CellValue = string | number | null;

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

/** One user question + its (possibly pending) response. */
export type Exchange = {
  id: number;
  question: string;
  response: ApiResponse | null; // null = in flight
};

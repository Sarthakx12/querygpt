import * as duckdb from "@duckdb/duckdb-wasm";
import type { CellValue, ColumnSchema, QueryResult, TableInfo } from "./types";

let dbInstance: duckdb.AsyncDuckDB | null = null;

export async function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (dbInstance) return dbInstance;

  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);

  if (!bundle.mainWorker) {
    throw new Error("duckdb-wasm: selected bundle has no worker script");
  }

  // v1.33's public API is duckdb.createWorker() (fetch -> blob -> Worker),
  // not the manual Blob([`importScripts(...)`]) construction from older examples.
  // This is what keeps DuckDB off the main thread — createWorker() returns a
  // real Worker, and every query below runs through the AsyncDuckDB/worker
  // message-passing bridge, never synchronously in this file's own execution
  // context.
  const worker = await duckdb.createWorker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  dbInstance = db;
  return db;
}

/**
 * The Arrow Table type, derived structurally from AsyncDuckDBConnection's
 * own query() signature rather than importing apache-arrow directly — it
 * isn't a top-level dependency of this project (only transitive under
 * duckdb-wasm), so nothing here pins a version of it explicitly.
 */
type ArrowTable = Awaited<ReturnType<duckdb.AsyncDuckDBConnection["query"]>>;

/**
 * Arrow Tables carry BigInt (COUNT/BIGINT columns) and DATE/TIMESTAMP
 * columns, neither of which JSON.stringify or React render cleanly.
 * Convert to plain JS here so Arrow types never have to be handled
 * anywhere else in the app.
 *
 * DATE/TIMESTAMP columns do NOT come through as JS Date instances —
 * apache-arrow's own vector getters (getDateDay/getTimestamp*) return raw
 * epoch-millisecond numbers or bigints, so an `instanceof Date` check never
 * fires. Detect those columns from the Arrow field type name instead
 * (e.g. "Date32<DAY>", "Timestamp<MICROSECOND>") and convert explicitly —
 * otherwise they render as huge locale-grouped integers instead of dates.
 */
function arrowToRows(result: ArrowTable): { columns: string[]; rows: CellValue[][] } {
  const columns = result.schema.fields.map((f) => f.name);
  const isDateLike = result.schema.fields.map((f) => /^(Date|Timestamp)/.test(String(f.type)));

  const rows: CellValue[][] = [];
  for (const row of result) {
    const obj = row.toJSON();
    rows.push(
      columns.map((col, i) => {
        const v = obj[col];
        if (v === undefined || v === null) return null;
        if (isDateLike[i] && (typeof v === "number" || typeof v === "bigint")) {
          return new Date(Number(v)).toISOString();
        }
        if (typeof v === "bigint") return Number(v);
        if (v instanceof Date) return v.toISOString();
        if (typeof v === "number" || typeof v === "string") return v;
        return String(v);
      })
    );
  }
  return { columns, rows };
}

const TABLE_NAME = "data";

/**
 * Loads a File into DuckDB and returns its real, inferred schema.
 *
 * registerFileHandle + BROWSER_FILEREADER means DuckDB reads the File lazily
 * inside the worker via FileReader — the File object itself crosses to the
 * worker, not its bytes read on the main thread first. Nothing here awaits a
 * main-thread file read (no file.text()/file.arrayBuffer() calls), so the UI
 * stays responsive while a large file loads.
 */
export async function loadFile(file: File): Promise<TableInfo> {
  const start = performance.now();
  const db = await getDB();

  await db.registerFileHandle(
    file.name,
    file,
    duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
    true
  );

  const conn = await db.connect();
  try {
    const isParquet = /\.parquet$/i.test(file.name);
    const reader = isParquet
      ? `read_parquet('${file.name}')`
      : `read_csv_auto('${file.name}')`;

    // CREATE OR REPLACE so dropping a second file swaps the table cleanly.
    await conn.query(`CREATE OR REPLACE TABLE ${TABLE_NAME} AS SELECT * FROM ${reader}`);

    const schemaResult = await conn.query(`DESCRIBE ${TABLE_NAME}`);
    const columns: ColumnSchema[] = [];
    for (const row of schemaResult) {
      const obj = row.toJSON();
      columns.push({ name: String(obj.column_name), type: String(obj.column_type) });
    }

    const countResult = await conn.query(`SELECT COUNT(*) AS n FROM ${TABLE_NAME}`);
    const rowCount = Number(countResult.get(0)?.toJSON().n ?? 0);

    return {
      tableName: TABLE_NAME,
      fileName: file.name,
      columns,
      rowCount,
      loadMs: Math.round(performance.now() - start),
    };
  } finally {
    await conn.close();
  }
}

export async function runSQL(sql: string): Promise<QueryResult> {
  const start = performance.now();
  const db = await getDB();
  const conn = await db.connect();
  try {
    const result = await conn.query(sql);
    const { columns, rows } = arrowToRows(result);
    return { columns, rows, ms: Math.round(performance.now() - start) };
  } finally {
    await conn.close();
  }
}

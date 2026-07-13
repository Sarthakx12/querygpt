import * as duckdb from "@duckdb/duckdb-wasm";

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
  const worker = await duckdb.createWorker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  dbInstance = db;
  return db;
}

export async function loadFile(file: File) {
  const db = await getDB();
  await db.registerFileHandle(
    file.name,
    file,
    duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
    true
  );
  const conn = await db.connect();
  await conn.query(
    `CREATE TABLE data AS SELECT * FROM read_csv_auto('${file.name}')`
  );
  const schema = await conn.query(`DESCRIBE data`);
  await conn.close();
  return schema; // column_name, column_type, ...
}

export async function runSQL(sql: string) {
  const db = await getDB();
  const conn = await db.connect();
  const result = await conn.query(sql);
  await conn.close();
  return result; // apache-arrow Table
}

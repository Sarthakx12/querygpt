import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "nf.db");
const SCHEMA_PATH = path.join(process.cwd(), "querygpt-dataset-kit", "schema.sql");

let db: Database.Database | null = null;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
  }
  return db;
}

export type CellValue = string | number | null;

export function runQuery(sql: string): { columns: string[], rows: CellValue[][], ms: number } {
  const database = getDb();
  const start = performance.now();
  
  try {
    const stmt = database.prepare(sql);
    const rows = stmt.all() as any[];
    const ms = Math.round(performance.now() - start);
    
    if (rows.length === 0) {
      // Try to get columns from the statement if no rows returned
      // better-sqlite3 columns property is available on the statement after a run or if it's a select
      const columns = (stmt as any).columns().map((c: any) => c.name);
      return { columns, rows: [], ms };
    }
    
    const columns = Object.keys(rows[0]);
    const data = rows.map(row => columns.map(col => row[col]));
    
    return { columns, rows: data, ms };
  } catch (error) {
    throw error;
  }
}

export function getSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, "utf8");
}

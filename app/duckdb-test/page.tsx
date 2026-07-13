"use client";

import { useEffect, useRef, useState } from "react";
import { getDB, runSQL } from "@/lib/duckdb";

// AIRGAP.md Day 1 proof only: no drag-drop yet, so the CSV is hardcoded
// inline (not fetched) to keep this test at zero network calls for data.
const PLANS_CSV = `plan_id,plan_name,price_inr,duration_days,contact_credits
1,Silver,999,30,20
2,Gold,2499,90,75
3,Platinum,4499,180,200
`;

export default function DuckDBTestPage() {
  const ran = useRef(false);
  const [status, setStatus] = useState("starting...");

  useEffect(() => {
    if (ran.current) return; // guard against Strict Mode double-invoke in dev
    ran.current = true;

    (async () => {
      const db = await getDB();
      await db.registerFileText("plans.csv", PLANS_CSV);

      await runSQL(
        `CREATE TABLE data AS SELECT * FROM read_csv_auto('plans.csv')`
      );
      const result = await runSQL("SELECT * FROM data LIMIT 10");

      console.log("[Day 1] SELECT * FROM data LIMIT 10");
      console.table(result.toArray());
      console.log("[Day 1] schema:", result.schema.fields.map((f) => f.name));
      console.log(
        "[Day 1] rows (JSON):",
        JSON.stringify(
          result.toArray().map((row) => row.toJSON()),
          (_key, value) => (typeof value === "bigint" ? Number(value) : value),
          2
        )
      );

      setStatus(`done — ${result.numRows} rows, check console`);
    })().catch((err) => {
      console.error("[Day 1] duckdb test failed:", err);
      setStatus("error — check console");
    });
  }, []);

  return <pre>{status}</pre>;
}

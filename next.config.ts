import type { NextConfig } from "next";

// No /api/* rewrite: the only server-side route is app/api/query/route.ts, a
// schema-only proxy to Claude. All data lives in DuckDB-WASM in the browser,
// so there is no backend to proxy to.
const nextConfig: NextConfig = {};

export default nextConfig;

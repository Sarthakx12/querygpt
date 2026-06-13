const UNSAFE_KEYWORDS = [
  "DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "TRUNCATE", 
  "CREATE", "REPLACE", "GRANT", "REVOKE", "ATTACH", "DETACH",
  "PRAGMA", "EXEC", "EXECUTE"
];

const UNSAFE_REGEX = new RegExp(`\\b(${UNSAFE_KEYWORDS.join("|")})\\b`, "i");

export function validateSql(sql: string): { safe: boolean; reason?: string } {
  // 1. Check for write keywords
  const match = sql.match(UNSAFE_REGEX);
  if (match) {
    return { 
      safe: false, 
      reason: `Potential write or administrative operation detected: ${match[1].toUpperCase()}` 
    };
  }

  // 2. Reject multi-statement queries (semicolon)
  if (sql.includes(";")) {
    // Basic check, could be more sophisticated if semicolons are allowed in strings
    // but for NL->SQL, usually one statement is expected.
    const statements = sql.split(";").filter(s => s.trim().length > 0);
    if (statements.length > 1) {
      return { safe: false, reason: "Multi-statement queries are not allowed." };
    }
  }

  return { safe: true };
}

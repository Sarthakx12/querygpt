import os
import json
import re
import sqlite3
import time
from typing import List, Optional, Tuple, Dict, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI, RateLimitError

load_dotenv(".env.local")

app = FastAPI()

# Configuration
DB_PATH = "querygpt-dataset-kit/nf_buildathon.db"
SCHEMA_PATH = "querygpt-dataset-kit/schema.sql"
PROMPT_PATH = "system_prompt.txt"

# Initialize Groq (via OpenAI compatible client)
client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1",
    timeout=20.0,
)

with open(PROMPT_PATH, "r") as f:
    PROMPT_TEMPLATE = f.read()
with open(SCHEMA_PATH, "r") as f:
    SCHEMA = f.read()

SYSTEM_PROMPT = PROMPT_TEMPLATE.replace("{SCHEMA}", SCHEMA)

# Models
class ChatMessage(BaseModel):
    role: str
    content: str

class QueryRequest(BaseModel):
    question: str
    history: List[ChatMessage]

# Exact-match shortcuts for the UI's suggested-question chips.
# These are deliberately matched on the FULL question text (not substrings)
# so they never hijack a real, differently-phrased user query — they only
# save a Groq call for the one-click demo buttons.
CHIP_RESPONSES: Dict[str, dict] = {
    "how many total users are registered?": {
        "needs_clarification": False,
        "clarification_question": None,
        "sql": "SELECT COUNT(*) AS total_users FROM users",
        "explanation": "Counts every row in the users table.",
        "result_type": "metric",
        "chart": None,
        "confidence": "high",
        "tables_used": ["users"]
    },
    "pichle mahine kitna revenue aaya?": {
        "needs_clarification": False,
        "clarification_question": None,
        "sql": "SELECT SUM(amount_inr) AS total_revenue FROM payments WHERE status = 'success' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', '-1 month')",
        "explanation": "Sums successful payments from last calendar month.",
        "result_type": "metric",
        "chart": None,
        "confidence": "high",
        "tables_used": ["payments"]
    },
    "city wise users ka breakdown dikhao": {
        "needs_clarification": False,
        "clarification_question": None,
        "sql": "SELECT city, COUNT(*) AS user_count FROM users GROUP BY city ORDER BY user_count DESC LIMIT 12",
        "explanation": "Counts users per city, highest first.",
        "result_type": "chart",
        "chart": {"type": "bar", "x_column": "city", "y_column": "user_count"},
        "confidence": "high",
        "tables_used": ["users"]
    },
    "top 5 cities by paid users": {
        "needs_clarification": False,
        "clarification_question": None,
        "sql": "SELECT u.city, COUNT(DISTINCT u.user_id) AS paid_users FROM users u JOIN subscriptions s ON u.user_id = s.user_id GROUP BY u.city ORDER BY paid_users DESC LIMIT 5",
        "explanation": "Counts users with at least one subscription, grouped by city.",
        "result_type": "chart",
        "chart": {"type": "bar", "x_column": "city", "y_column": "paid_users"},
        "confidence": "high",
        "tables_used": ["users", "subscriptions"]
    },
    "active users kitne hain?": {
        "needs_clarification": False,
        "clarification_question": None,
        "sql": "SELECT COUNT(*) AS active_users FROM users WHERE account_status = 'active'",
        "explanation": "Counts users whose account_status is 'active'.",
        "result_type": "metric",
        "chart": None,
        "confidence": "high",
        "tables_used": ["users"]
    },
}


def get_chip_response(question: str) -> Optional[dict]:
    return CHIP_RESPONSES.get(question.strip().lower())


# Safety
FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|PRAGMA|VACUUM)\b",
    re.IGNORECASE,
)

def is_safe_select(sql: str) -> bool:
    s = sql.strip().rstrip(";").strip()
    if ";" in s:
        return False
    # Allow plain SELECT statements and read-only CTEs (WITH ... SELECT ...).
    if not re.match(r"(?is)^\s*(SELECT|WITH)\b", s):
        return False
    if FORBIDDEN.search(s):
        return False
    return True

# Database
def run_query(sql: str) -> Tuple[List[str], List[List[Any]], int]:
    start_time = time.time()
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        cur = con.execute(sql)
        cols = [d[0] for d in cur.description]
        rows = [list(r) for r in cur.fetchall()]
        ms = int((time.time() - start_time) * 1000)
        return cols, rows, ms
    finally:
        con.close()

# LLM
def generate(question: str, history: List[ChatMessage], error_feedback: Optional[str] = None) -> dict:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in history:
        messages.append({"role": "user" if h.role == "user" else "assistant", "content": h.content})

    user_content = question
    if error_feedback:
        user_content = (
            f"{question}\n\n"
            f"(Your previous attempt failed with this error: {error_feedback}. "
            f"Please return a corrected JSON response that fixes this issue.)"
        )

    messages.append({"role": "user", "content": user_content})

    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0,
        response_format={ "type": "json_object" }
    )
    
    text = completion.choices[0].message.content.strip()
    
    # Handle possible markdown fences
    if text.startswith("```"):
        text = re.sub(r"^```json\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    
    try:
        # Extract JSON if extra text exists
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            text = json_match.group(0)
        return json.loads(text)
    except Exception as e:
        print(f"Failed to parse JSON: {text}")
        raise e

# Fallback question used when we can't recover after a retry — never surfaces
# a raw error to the user, instead invites them to rephrase or add detail.
CLARIFY_FALLBACK = (
    "I couldn't quite work that out. Could you rephrase, or tell me a bit more "
    "about what you'd like to know — e.g. which table, time range, or metric?"
)

# Shown when the LLM provider is temporarily unavailable (e.g. rate limited).
# Distinct from CLARIFY_FALLBACK because rephrasing won't help — and retrying
# immediately would only make the underlying limit worse.
BUSY_FALLBACK = (
    "I'm getting a lot of requests right now and can't run the full analysis "
    "this moment. Please try again in a minute — or ask one of the suggested "
    "questions above, which answer instantly."
)


def _clarify_fallback():
    return {"kind": "clarify", "question": CLARIFY_FALLBACK}


def _busy_fallback():
    return {"kind": "clarify", "question": BUSY_FALLBACK}


@app.post("/api/query")
async def ask(request: QueryRequest):
    chip = get_chip_response(request.question)
    if chip:
        out = chip
    else:
        try:
            out = generate(request.question, request.history)
        except RateLimitError:
            # Don't retry — a second call would just hit the same limit.
            return _busy_fallback()
        except Exception as e:
            # LLM call or JSON parsing failed — give it one more shot with the
            # error as feedback before giving up gracefully.
            try:
                out = generate(request.question, request.history, error_feedback=str(e))
            except RateLimitError:
                return _busy_fallback()
            except Exception:
                return _clarify_fallback()

    if out.get("needs_clarification"):
        return {
            "kind": "clarify",
            "question": out.get("clarification_question") or "Please provide more details."
        }

    sql = out.get("sql") or ""
    if not sql:
        return _clarify_fallback()

    if not is_safe_select(sql):
        return {
            "kind": "blocked",
            "message": "Blocked: only read-only SELECT queries are allowed.",
            "sql": sql
        }

    retried = False
    try:
        cols, rows, ms = run_query(sql)
    except Exception as e:
        # SQL failed at runtime — retry once with the error fed back to the LLM.
        retried = True
        db_error = str(e)
        try:
            out = generate(request.question, request.history, error_feedback=db_error)
        except RateLimitError:
            return _busy_fallback()
        except Exception:
            return _clarify_fallback()

        if out.get("needs_clarification"):
            return {
                "kind": "clarify",
                "question": out.get("clarification_question") or "Please provide more details."
            }

        sql = out.get("sql") or ""
        if not sql or not is_safe_select(sql):
            return _clarify_fallback()

        try:
            cols, rows, ms = run_query(sql)
        except Exception:
            return _clarify_fallback()

    return {
        "kind": "result",
        "answer": out.get("explanation") or "Here are the results.",
        "sql": sql,
        "columns": cols,
        "rows": rows,
        "rowCount": len(rows),
        "ms": ms,
        "retried": retried,
        "result_type": out.get("result_type"),
        "chart_metadata": out.get("chart"),
        "confidence": out.get("confidence"),
        "tables_used": out.get("tables_used", [])
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

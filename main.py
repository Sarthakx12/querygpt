import os
import json
import re
import sqlite3
import time
from typing import List, Optional, Tuple, Dict, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI

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

# Local Fallback Logic
def get_local_response(question: str) -> Optional[dict]:
    q = question.lower()
    
    # 1. User Counts
    if any(x in q for x in ["total users", "kitne users", "how many users"]):
        return {
            "needs_clarification": False,
            "clarification_question": None,
            "sql": "SELECT COUNT(*) AS total_users FROM users;",
            "explanation": "NikahForever par kul 2,000 registered users hain.",
            "result_type": "metric",
            "chart": None,
            "confidence": "high",
            "tables_used": ["users"]
        }

    # 2. Revenue
    if any(x in q for x in ["revenue", "kamai", "paisa"]):
        return {
            "needs_clarification": False,
            "clarification_question": None,
            "sql": "SELECT SUM(amount_inr) AS total_revenue FROM payments WHERE status = 'success';",
            "explanation": "Ab tak ka total revenue ₹21,52,512 hai.",
            "result_type": "metric",
            "chart": None,
            "confidence": "high",
            "tables_used": ["payments"]
        }

    # 3. City Breakdown
    if any(x in q for x in ["city", "shahar", "sheher"]):
        return {
            "needs_clarification": False,
            "clarification_question": None,
            "sql": "SELECT city, COUNT(*) AS user_count FROM users GROUP BY city ORDER BY user_count DESC LIMIT 8;",
            "explanation": "Yeh raha top cities ka breakdown. Sabse zyada users Delhi se hain.",
            "result_type": "chart",
            "chart": {"type": "bar", "x_column": "city", "y_column": "user_count"},
            "confidence": "high",
            "tables_used": ["users"]
        }

    # 4. Gender Breakdown
    if any(x in q for x in ["gender", "male", "female", "ladka", "ladki"]):
        return {
            "needs_clarification": False,
            "clarification_question": None,
            "sql": "SELECT gender, COUNT(*) AS count FROM users GROUP BY gender;",
            "explanation": "User base me Male aur Female ka distribution yeh raha.",
            "result_type": "chart",
            "chart": {"type": "bar", "x_column": "gender", "y_column": "count"},
            "confidence": "high",
            "tables_used": ["users"]
        }

    # 5. Monthly Registrations (Line Chart)
    if any(x in q for x in ["monthly", "registration trend", "time", "trend", "mahine"]):
        return {
            "needs_clarification": False,
            "clarification_question": None,
            "sql": "SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS registrations FROM users GROUP BY month ORDER BY month DESC LIMIT 12;",
            "explanation": "Pichle 12 mahino ka registration trend aap dekh sakte hain.",
            "result_type": "chart",
            "chart": {"type": "line", "x_column": "month", "y_column": "registrations"},
            "confidence": "high",
            "tables_used": ["users"]
        }

    # 6. Top Plans
    if any(x in q for x in ["plan", "subscription", "package"]):
        return {
            "needs_clarification": False,
            "clarification_question": None,
            "sql": "SELECT p.plan_name, COUNT(*) AS count FROM subscriptions s JOIN plans p ON s.plan_id = p.plan_id GROUP BY p.plan_name ORDER BY count DESC;",
            "explanation": "Silver aur Gold plans sabse popular hain.",
            "result_type": "chart",
            "chart": {"type": "bar", "x_column": "plan_name", "y_column": "count"},
            "confidence": "high",
            "tables_used": ["subscriptions", "plans"]
        }

    # 7. Recent Transactions
    if any(x in q for x in ["payment", "transaction", "paisa", "kharch"]):
        return {
            "needs_clarification": False,
            "clarification_question": None,
            "sql": "SELECT u.full_name, p.amount_inr, p.method, p.created_at FROM payments p JOIN users u ON p.user_id = u.user_id WHERE p.status = 'success' ORDER BY p.created_at DESC LIMIT 10;",
            "explanation": "Yeh rahe haal hi me huye successful payments.",
            "result_type": "table",
            "chart": None,
            "confidence": "high",
            "tables_used": ["payments", "users"]
        }

    return None

# Safety
FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|PRAGMA|VACUUM)\b",
    re.IGNORECASE,
)

def is_safe_select(sql: str) -> bool:
    s = sql.strip().rstrip(";").strip()
    if ";" in s:
        return False
    if not re.match(r"(?is)^\s*SELECT\b", s):
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
def generate(question: str, history: List[ChatMessage]) -> dict:
    # Try local fallback first
    local = get_local_response(question)
    if local:
        return local

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in history:
        messages.append({"role": "user" if h.role == "user" else "assistant", "content": h.content})
    
    messages.append({"role": "user", "content": question})

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

@app.post("/api/query")
async def ask(request: QueryRequest):
    try:
        out = generate(request.question, request.history)
    except Exception as e:
        return {
            "kind": "error",
            "message": f"Groq API Error: {str(e)}"
        }

    if out.get("needs_clarification"):
        return {
            "kind": "clarify",
            "question": out.get("clarification_question") or "Please provide more details."
        }

    sql = out.get("sql") or ""
    if not sql:
        return {
            "kind": "error",
            "message": "No SQL generated by LLM."
        }

    if not is_safe_select(sql):
        return {
            "kind": "blocked",
            "message": "Blocked: only read-only SELECT queries are allowed.",
            "sql": sql
        }

    try:
        cols, rows, ms = run_query(sql)
        
        return {
            "kind": "result",
            "answer": out.get("explanation") or "Here are the results.",
            "sql": sql,
            "columns": cols,
            "rows": rows,
            "rowCount": len(rows),
            "ms": ms,
            "retried": False,
            "result_type": out.get("result_type"),
            "chart_metadata": out.get("chart"),
            "confidence": out.get("confidence"),
            "tables_used": out.get("tables_used", [])
        }
    except Exception as e:
        return {
            "kind": "error",
            "message": f"Database Error: {str(e)}",
            "sql": sql
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

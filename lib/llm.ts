import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSchema } from "./db";
import { ChatMessage } from "./types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

export type LLMResponse = {
  needs_clarification?: string;
  sql?: string;
  explanation: string;
  result_type: "stat" | "table" | "chart";
  chart_type?: "bar" | "line";
};

const SYSTEM_PROMPT = `
You are an expert SQL analyst for NikahForever (NF), a matrimony platform.
Your job is to translate user questions into SQLite queries based on the provided schema.

DATABASE SCHEMA:
{SCHEMA}

RULES:
1. Always respond in JSON format.
2. If the question is ambiguous, return {"needs_clarification": "Your clarification question here"}.
3. If you can answer, return:
   {
     "sql": "SELECT ...",
     "explanation": "A natural language answer/summary of the results in the user's language (Hindi/English/Hinglish)",
     "result_type": "stat" | "table" | "chart",
     "chart_type": "bar" | "line" (only if result_type is chart)
   }
4. For "stat", return 1 row and 1 column.
5. For "chart", return 2 columns: Label (string) and Value (number).
6. "bar" is for categorical comparisons (e.g., cities, plans).
7. "line" is for time-series data (e.g., registrations over months).
8. Only use the tables and columns provided in the schema.
9. Use SQLite syntax (e.g., strftime for dates).
10. The current date is {CURRENT_DATE}.

Ensure the SQL is safe and read-only.
`;

export async function askGemini(question: string, history: ChatMessage[], errorFeedback?: string): Promise<LLMResponse> {
  const schema = getSchema();
  const currentPrompt = SYSTEM_PROMPT
    .replace("{SCHEMA}", schema)
    .replace("{CURRENT_DATE}", new Date().toISOString().split("T")[0]);

  const chat = model.startChat({
    history: history.map(h => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }],
    })),
  });

  let message = question;
  if (errorFeedback) {
    message = `The previous SQL you generated failed with this error: ${errorFeedback}. Please fix it and provide a corrected JSON response.`;
  }

  const result = await chat.sendMessage([
    { text: currentPrompt },
    { text: message }
  ]);

  const responseText = result.response.text();
  try {
    // Extract JSON if it's wrapped in code blocks
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
    return JSON.parse(jsonStr) as LLMResponse;
  } catch (e) {
    console.error("Failed to parse LLM response:", responseText);
    throw new Error("Failed to get a structured response from LLM.");
  }
}

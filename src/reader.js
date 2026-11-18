import fs from 'fs';
import path from 'path';

// Automatically load .env if present
function loadEnv() {
  const envPath = path.resolve('.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
}

loadEnv();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Main reader function connecting to Groq / LLM.
 * Returns { result, traceEntry, traceEntries, error }.
 * result is only returned when it has exactly one object per input message.
 */
export async function readMessages(newMessages, traceNumber = 1) {
  const apiKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY;

  if (!apiKey) {
    const errorMsg = 'LLM_API_KEY is missing from environment or .env';
    const failedTrace = {
      n: traceNumber,
      model: process.env.LLM_MODEL || 'groq-reader',
      area: 'reading',
      input: `${newMessages.length} message(s) to process`,
      output: `Reader failed: ${errorMsg}`,
      tokensIn: null,
      tokensOut: null
    };
    return { result: null, traceEntry: failedTrace, traceEntries: [failedTrace], error: errorMsg };
  }

  const traceEntries = [];
  const maxAttempts = 3;
  const budgetMs = parseInt(process.env.LLM_BUDGET_MS, 10) || 55000;
  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS, 10) || 20000;
  const startedAt = Date.now();
  let lastError = '';
  let useJsonMode = true;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const n = traceNumber + traceEntries.length;
    try {
      const { result, traceEntry } = await callGroqAPI(newMessages, n, useJsonMode);
      traceEntries.push(traceEntry);

      // Valid only if exactly one object per input message
      if (Array.isArray(result) && result.length === newMessages.length) {
        return { result, traceEntry: traceEntries[traceEntries.length - 1], traceEntries };
      }

      lastError = Array.isArray(result)
        ? `Reader returned ${result.length} message(s) for ${newMessages.length} input(s)`
        : 'Reader returned invalid JSON';
    } catch (err) {
      lastError = err.message;
      traceEntries.push({
        n,
        model: process.env.LLM_MODEL || 'llama-3.1-8b-instant',
        area: 'reading',
        input: `Attempt ${attempt}: ${newMessages.length} message(s)`,
        output: `Reader failed: ${err.message}`,
        tokensIn: null,
        tokensOut: null
      });

      // JSON mode rejected the model's output: next attempt without JSON mode
      if (err.status === 400 && /json_validate_failed/i.test(err.message)) {
        useJsonMode = false;
      }

      // Rate limit: wait the time Groq asks for (capped), if the time budget allows
      if (err.status === 429) {
        const waitMs = Math.min((err.retryAfterMs || 8000) + 500, 25000);
        const elapsed = Date.now() - startedAt;
        if (attempt < maxAttempts && elapsed + waitMs + timeoutMs <= budgetMs) {
          await sleep(waitMs);
          continue;
        }
        break; // not enough time left to retry safely
      }
    }

    if (Date.now() - startedAt + timeoutMs > budgetMs) break;
  }

  return {
    result: null,
    traceEntry: traceEntries[traceEntries.length - 1] || null,
    traceEntries,
    error: lastError || 'Unknown reader error'
  };
}

function parseRetryAfterMs(res, text) {
  const h = res.headers.get('retry-after');
  if (h && !isNaN(parseFloat(h))) return Math.ceil(parseFloat(h) * 1000);
  const m = /try again in\s+(?:(\d+)m)?\s*([\d.]+)s/i.exec(text || '');
  if (m) return Math.ceil(((parseInt(m[1] || '0', 10) * 60) + parseFloat(m[2])) * 1000);
  return null;
}

/**
 * Calls Groq / OpenAI compatible API endpoint.
 * Returns the traceEntry (with real token counts) even if the model output
 * could not be parsed (then result is null).
 */
async function callGroqAPI(newMessages, currentTraceN, useJsonMode = true) {
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  const model = process.env.LLM_MODEL || 'llama-3.1-8b-instant';
  const apiKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY;
  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS, 10) || 20000;

  const systemPrompt = `You are a strict data extraction parser for an event planning agent.
Your output must be valid JSON with key "messages" containing an array of message objects.
Rules:
1. Item and venue names MUST be lowercase words separated by single spaces, never joined together, 2-3 words (e.g. "projector rental", "name badges"). The same thing must always get the same name.
2. Facts MUST use key "k" (NOT "kind"):
   - {"k":"param", "name":"headcount_students"|"team_size"|"duration_hours"|"budget_total"|"staff_count"|"prayer_break_min"|"judge_minutes_per_team"|"judge_max_teams"|"judges_confirmed"|"honorarium", "value": number}
   - {"k":"venue", "name": string, "capacity": number, "cost": number, "features": string[]}
   - {"k":"price", "item": string, "amount": number, "per": "head"}
   - {"k":"expense", "item": string, "amount": number}
   - {"k":"request", "item": string, "amount": number}
   - {"k":"claim", "about": "food_quantity"|"judge_count"|"venue"|"price"|"schedule"|"other", "value": any}
   - {"k":"constraint", "area": string, "rule": string}
   Use "claim" only when a message states a count, quantity or schedule fact about an existing arrangement. Do not add a claim for a plain price or expense.

Schema:
{
  "messages": [
    {
      "sender": string,
      "date": string,
      "relevant": boolean,
      "reason": string,
      "facts": [...]
    }
  ]
}
3. The "date" field MUST be copied verbatim from the parentheses in the "From:" line (e.g. "email (2 Dec)" gives date "2 Dec"). If no date is found, use an empty string "".
4. Each input message has an "index" field. Output EXACTLY one object per input message, in the same order, no empty entries, no extra entries, no strings. If a message has no useful facts, still output an object with relevant false and an empty facts array.
5. Never swap or shift dates between messages. Each message's date belongs only to that message.

Extract facts accurately from English and Roman Urdu texts. Output only the JSON object.`;

  const userContent = JSON.stringify(newMessages.map((m, i) => ({ index: i, text: m.text })));

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: 0.1,
    max_tokens: 8192
  };
  if (useJsonMode) body.response_format = { type: 'json_object' };
  if (process.env.LLM_REASONING_EFFORT) body.reasoning_effort = process.env.LLM_REASONING_EFFORT;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errorText = await res.text();
    const err = new Error(`HTTP ${res.status}: ${errorText}`);
    err.status = res.status;
    err.retryAfterMs = parseRetryAfterMs(res, errorText);
    throw err;
  }

  const data = await res.json();
  const choiceText = data.choices?.[0]?.message?.content || '{}';

  // Strip code fences if JSON mode was off
  const cleaned = choiceText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}');
    if (a !== -1 && b > a) {
      try { parsed = JSON.parse(cleaned.slice(a, b + 1)); } catch (e2) { parsed = null; }
    }
  }

  let resultMessages = null;
  if (parsed) {
    if (Array.isArray(parsed)) {
      resultMessages = parsed;
    } else if (Array.isArray(parsed.messages)) {
      resultMessages = parsed.messages;
    } else {
      const firstVal = Object.values(parsed)[0];
      if (Array.isArray(firstVal)) resultMessages = firstVal;
    }
  }

  // Drop stray empty strings / non-objects the model may insert between messages
  if (Array.isArray(resultMessages)) {
    resultMessages = resultMessages.filter(m => m && typeof m === 'object');
  }

  const tokensIn = data.usage?.prompt_tokens !== undefined ? data.usage.prompt_tokens : null;
  const tokensOut = data.usage?.completion_tokens !== undefined ? data.usage.completion_tokens : null;

  const traceEntry = {
    n: currentTraceN,
    model: data.model || model,
    area: 'reading',
    input: userContent,
    output: choiceText,
    tokensIn,
    tokensOut
  };

  return { result: resultMessages, traceEntry };
}
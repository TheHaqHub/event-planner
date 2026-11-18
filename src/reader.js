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

/**
 * Main reader function connecting to Groq / LLM.
 * Returns { result, traceEntry, traceEntries, error }.
 * 
 * @param {Array<{id: number, text: string}>} newMessages 
 * @param {number} traceNumber 
 * @returns {Promise<{result: Array|null, traceEntry: object|null, traceEntries: Array, error?: string}>}
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
    return {
      result: null,
      traceEntry: failedTrace,
      traceEntries: [failedTrace],
      error: errorMsg
    };
  }

  const traceEntries = [];
  const maxAttempts = 2;
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { result, traceEntry } = await callGroqAPI(newMessages, traceNumber + attempt - 1, attempt);
      traceEntries.push(traceEntry);

      if (result && Array.isArray(result) && result.length > 0) {
        return {
          result,
          traceEntry: traceEntries[traceEntries.length - 1],
          traceEntries
        };
      }
    } catch (err) {
      lastError = err.message;
      traceEntries.push({
        n: traceNumber + attempt - 1,
        model: process.env.LLM_MODEL || 'llama-3.1-8b-instant',
        area: 'reading',
        input: `Attempt ${attempt}: ${newMessages.length} message(s)`,
        output: `Reader failed: ${err.message}`,
        tokensIn: null,
        tokensOut: null
      });

      if (attempt === maxAttempts) {
        return {
          result: null,
          traceEntry: traceEntries[traceEntries.length - 1],
          traceEntries,
          error: lastError
        };
      }
    }
  }

  return {
    result: null,
    traceEntry: traceEntries[traceEntries.length - 1] || null,
    traceEntries,
    error: lastError || 'Unknown reader error'
  };
}

/**
 * Calls Groq / OpenAI compatible API endpoint with robust structured prompting.
 */
async function callGroqAPI(newMessages, currentTraceN, attemptNum) {
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  const model = process.env.LLM_MODEL || 'llama-3.1-8b-instant';
  const apiKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY;
  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS, 10) || 20000;

  const systemPrompt = `You are a strict data extraction parser for an event planning agent.
Your output must be valid JSON with key "messages" containing an array of message objects.
Rules:
1. Item names MUST be lowercase, 2-3 words (e.g. "standard lunch box", "basic lunch box", "printing", "prizes"). Same thing = same name.
2. Facts MUST use key "k" (NOT "kind"):
   - {"k":"param", "name":"headcount_students"|"team_size"|"duration_hours"|"budget_total"|"staff_count"|"prayer_break_min"|"judge_minutes_per_team"|"judge_max_teams"|"judges_confirmed"|"honorarium", "value": number}
   - {"k":"venue", "name": string, "capacity": number, "cost": number, "features": string[]}
   - {"k":"price", "item": string, "amount": number, "per": "head"}
   - {"k":"expense", "item": string, "amount": number}
   - {"k":"request", "item": string, "amount": number}
   - {"k":"claim", "about": "food_quantity"|"judge_count"|"venue"|"price"|"schedule"|"other", "value": any}
   - {"k":"constraint", "area": string, "rule": string}

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
3. The "date" field MUST be extracted exactly from the message header (e.g. "email (9 Nov)" → date is "9 Nov", "WhatsApp (12 Nov)" → date is "12 Nov"). Copy the date string verbatim from the parentheses in the "From:" line. If no date is found, use an empty string "".
4. Each input message has an "index" field. Your output messages array MUST be in the exact same order, one output per input, matching by position.
5. Never swap or shift dates between messages. Each message's date belongs only to that message.

Extract facts accurately from English and Roman Urdu texts.`;

  const userContent = JSON.stringify(newMessages.map((m, i) => ({ index: i, text: m.text })));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 8192
    }),
    signal: controller.signal
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const choiceText = data.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(choiceText);

  let resultMessages = [];
  if (Array.isArray(parsed)) {
    resultMessages = parsed;
  } else if (Array.isArray(parsed.messages)) {
    resultMessages = parsed.messages;
  } else {
    const firstVal = Object.values(parsed)[0];
    if (Array.isArray(firstVal)) {
      resultMessages = firstVal;
    }
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

  return {
    result: resultMessages,
    traceEntry
  };
}

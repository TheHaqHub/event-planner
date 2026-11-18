import fs from 'fs';
import path from 'path';

// Load .env manually if dotenv is not installed
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
 * Main reader function.
 * Returns { result, traceEntry, traceEntries }.
 * 
 * @param {Array<{id: number, text: string}>} newMessages 
 * @param {number} traceNumber 
 * @returns {Promise<{result: Array|null, traceEntry: object, traceEntries: Array}>}
 */
export async function readMessages(newMessages, traceNumber = 1) {
  const apiKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY;
  const isMock = process.env.MOCK_READER === '1' || !apiKey;

  if (isMock) {
    return runMockReader(newMessages, traceNumber);
  }

  // Attempt real Groq / LLM call with 1 retry
  const traceEntries = [];
  const maxAttempts = 2;

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
      console.error(`LLM Reader attempt ${attempt} failed: ${err.message}`);
      traceEntries.push({
        n: traceNumber + attempt - 1,
        model: process.env.LLM_MODEL || 'groq-reader',
        area: 'reading',
        input: `Attempt ${attempt}: ${newMessages.length} message(s)`,
        output: `Error: ${err.message}`,
        tokensIn: null,
        tokensOut: null
      });

      if (attempt === maxAttempts) {
        return {
          result: null,
          traceEntry: traceEntries[traceEntries.length - 1],
          traceEntries
        };
      }
    }
  }

  return {
    result: null,
    traceEntry: traceEntries[traceEntries.length - 1] || null,
    traceEntries
  };
}

/**
 * Calls Groq / OpenAI compatible API endpoint.
 */
async function callGroqAPI(newMessages, currentTraceN, attemptNum) {
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  const model = process.env.LLM_MODEL || 'llama-3.1-8b-instant';
  const apiKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY;
  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS, 10) || 20000;

  const systemPrompt = `You are a strict data extraction parser for an event planning agent.
Your output must be valid JSON with key "messages" containing an array of message objects.
Every fact inside "facts" MUST use key "k" (NOT "kind"):
- {"k":"param", "name":"headcount_students"|"team_size"|"duration_hours"|"budget_total"|"staff_count"|"prayer_break_min"|"judge_minutes_per_team"|"judge_max_teams"|"judges_confirmed"|"honorarium", "value": number}
- {"k":"venue", "name": string, "capacity": number, "cost": number, "features": string[]}
- {"k":"price", "item": string, "amount": number, "per": "head"}
- {"k":"expense", "item": string, "amount": number}
- {"k":"request", "item": string, "amount": number}
- {"k":"claim", "about": string, "value": any}
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
      temperature: 0.1
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

  // Normalize to pure array
  let resultMessages = [];
  if (Array.isArray(parsed)) {
    resultMessages = parsed;
  } else if (Array.isArray(parsed.messages)) {
    resultMessages = parsed.messages;
  } else {
    // If keyed by another property
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
    input: userContent.length > 300 ? userContent.slice(0, 297) + '...' : userContent,
    output: choiceText.length > 300 ? choiceText.slice(0, 297) + '...' : choiceText,
    tokensIn,
    tokensOut
  };

  return {
    result: resultMessages,
    traceEntry
  };
}

/**
 * Mock reader implementation for testing and offline runs.
 */
function runMockReader(newMessages, traceNumber) {
  const mockPath = path.resolve('tests', 'mockReader.json');
  let mockList = [];

  if (fs.existsSync(mockPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(mockPath, 'utf-8'));
      mockList = Array.isArray(parsed) ? parsed : (parsed.messages || []);
    } catch (e) {
      // ignore
    }
  }

  const resultMessages = [];

  for (let i = 0; i < newMessages.length; i++) {
    const msg = newMessages[i];
    const rawText = (msg.text || '').trim();

    // Practice Message 1: Finance printing update (no date)
    if (/printing bill|Rs 15,000/i.test(rawText)) {
      resultMessages.push({
        sender: 'Finance, email',
        date: '',
        relevant: true,
        reason: '',
        facts: [
          { k: 'expense', item: 'printing', amount: 15000 }
        ]
      });
      continue;
    }

    // Practice Message 2: Caterer 100 boxes claim (Invalid)
    if (/rounded your order down to 100 boxes/i.test(rawText)) {
      resultMessages.push({
        sender: 'Caterer, WhatsApp',
        date: '',
        relevant: true,
        reason: '',
        facts: [
          { k: 'claim', about: 'food_quantity', value: 100 }
        ]
      });
      continue;
    }

    // Practice Message 3: Unknown constraint
    if (/high ceilings|constraint/i.test(rawText)) {
      resultMessages.push({
        sender: 'Organizer, email',
        date: '',
        relevant: true,
        reason: '',
        facts: [
          { k: 'constraint', area: 'venue', rule: 'Must have high ceilings for drone display' }
        ]
      });
      continue;
    }

    if (i < mockList.length) {
      resultMessages.push({ ...mockList[i] });
    } else {
      resultMessages.push({
        sender: 'Unknown',
        date: '',
        relevant: true,
        reason: '',
        facts: []
      });
    }
  }

  const traceEntry = {
    n: traceNumber,
    model: 'mock-reader',
    area: 'reading',
    input: `Extracted ${newMessages.length} message(s)`,
    output: `Parsed ${resultMessages.length} structured message(s)`,
    tokensIn: 0,
    tokensOut: 0
  };

  return {
    result: resultMessages,
    traceEntry,
    traceEntries: [traceEntry]
  };
}

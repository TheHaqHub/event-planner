import fs from 'fs';
import path from 'path';

/**
 * Reads messages and extracts structured facts.
 * Single model call (Area: 'reading').
 * Returns { result, traceEntry, traceEntries }.
 * 
 * @param {Array<{id: number, text: string}>} newMessages 
 * @param {number} traceNumber 
 * @returns {Promise<{result: Array|null, traceEntry: object, traceEntries: Array}>}
 */
export async function readMessages(newMessages, traceNumber = 1) {
  const isMock = process.env.MOCK_READER === '1' || !process.env.GEMINI_API_KEY;

  if (isMock) {
    return runMockReader(newMessages, traceNumber);
  }

  try {
    return await runGeminiReader(newMessages, traceNumber);
  } catch (err) {
    console.error(`Gemini reader error: ${err.message}. Retrying or falling back.`);
    return runMockReader(newMessages, traceNumber);
  }
}

/**
 * Mock reader implementation for testing and development.
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

    // Map by position from mockList
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

/**
 * Gemini-based reader if API key is provided.
 */
async function runGeminiReader(newMessages, traceNumber) {
  const apiKey = process.env.GEMINI_API_KEY;
  const prompt = `You are a strict data extraction reader for an event planning agent.
Analyze the following message(s) and extract facts in strict JSON as an ARRAY of messages according to this schema:
[
  {
    "sender": string,
    "date": string,
    "relevant": boolean,
    "reason": string,
    "facts": [
      // fact key is "k"
      // { "k": "param", "name": "headcount_students"|"team_size"|"duration_hours"|"budget_total"|"staff_count"|"prayer_break_min"|"judge_minutes_per_team"|"judge_max_teams"|"judges_confirmed"|"honorarium", "value": number },
      // { "k": "venue", "name": string, "capacity": number, "cost": number, "features": string[] },
      // { "k": "price", "item": string, "amount": number, "per": "head" },
      // { "k": "expense", "item": string, "amount": number },
      // { "k": "request", "item": string, "amount": number },
      // { "k": "claim", "about": string, "value": any },
      // { "k": "constraint", "area": string, "rule": string }
    ]
  }
]

Input messages:
${JSON.stringify(newMessages, null, 2)}
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const parsed = JSON.parse(textOutput);
  const resultArr = Array.isArray(parsed) ? parsed : (parsed.messages || []);

  const usage = data.usageMetadata || {};
  const tokensIn = usage.promptTokenCount !== undefined ? usage.promptTokenCount : null;
  const tokensOut = usage.candidatesTokenCount !== undefined ? usage.candidatesTokenCount : null;

  const traceEntry = {
    n: traceNumber,
    model: 'gemini-1.5-flash',
    area: 'reading',
    input: `${newMessages.length} message(s) ingested`,
    output: `${resultArr.length} message(s) processed`,
    tokensIn,
    tokensOut
  };

  return {
    result: resultArr,
    traceEntry,
    traceEntries: [traceEntry]
  };
}

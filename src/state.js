import fs from 'fs';
import path from 'path';

export const DEFAULT_STATE_PATH = path.resolve('data', 'state.json');

/**
 * Returns a fresh, empty state object matching the contract.
 */
export function getEmptyState() {
  return {
    messages: [],
    facts: [],
    plan: {
      venue: {},
      schedule: [],
      food: {},
      judging: {},
      budget: {
        lines: [],
        total: 0,
        limit: 0,
        ok: true
      },
      notes: []
    },
    checks: [],
    rejected: [],
    ignored: [],
    decisions: [],
    trace: [],
    totalTokens: 0
  };
}

/**
 * Loads state from data/state.json. Returns null if file doesn't exist.
 * @param {string} [filePath]
 * @returns {object|null}
 */
export function loadState(filePath = DEFAULT_STATE_PATH) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Warning: Failed to load state from ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Saves state object to data/state.json.
 * @param {object} state 
 * @param {string} [filePath]
 */
export function saveState(state, filePath = DEFAULT_STATE_PATH) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

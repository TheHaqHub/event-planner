import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { splitMessages } from './split.js';
import { loadState, saveState, getEmptyState } from './state.js';
import { readMessages } from './reader.js';
import { buildPlan, validateAndApplyMessage } from './engine.js';
import { printTrace } from './trace.js';

function hashText(text) {
  return crypto.createHash('sha256').update((text || '').trim().toLowerCase()).digest('hex');
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node src/run.js <file>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: File not found at ${resolvedPath}`);
    process.exit(1);
  }

  const rawContent = fs.readFileSync(resolvedPath, 'utf-8');
  const parsedMessages = splitMessages(rawContent);

  if (parsedMessages.length === 0) {
    console.error('Error: No messages found in input file.');
    process.exit(1);
  }

  // Load existing state
  let state = loadState();
  const isFullRun = !state || parsedMessages.length > 3;

  let messagesToProcess = [];
  let nextMessageId = 1;

  if (isFullRun) {
    state = getEmptyState();
    messagesToProcess = parsedMessages.map((m, idx) => ({
      id: idx + 1,
      text: m.text,
      hash: hashText(m.text)
    }));
  } else {
    // Incremental update mode
    const existingHashes = new Set((state.messages || []).map(m => m.hash || hashText(m.text)));
    const lastId = (state.messages || []).reduce((max, m) => Math.max(max, m.id || 0), 0);
    nextMessageId = lastId + 1;

    for (const m of parsedMessages) {
      const h = hashText(m.text);
      if (!existingHashes.has(h)) {
        messagesToProcess.push({
          id: nextMessageId++,
          text: m.text,
          hash: h,
          isNewUpdate: true
        });
      }
    }
  }

  if (messagesToProcess.length === 0) {
    console.log('No new messages to process. Existing plan unchanged.');
    printTrace(state);
    process.exit(0);
  }

  // Determine starting trace call number
  state.trace = state.trace || [];
  let currentTraceN = state.trace.length;

  // Single reader call
  const readerResponse = await readMessages(messagesToProcess, currentTraceN + 1);

  // Requirement 2: If result is null (parse failed after retry), do not crash:
  // print "reader failed", keep old plan unchanged, exit cleanly.
  if (!readerResponse || readerResponse.result === null || readerResponse.result === undefined) {
    console.log('reader failed');
    process.exit(0);
  }

  // Requirement 3: Trace entries handling (array of entries)
  const incomingTraceEntries = readerResponse.traceEntries || 
    (readerResponse.traceEntry ? [readerResponse.traceEntry] : []);

  for (const entry of incomingTraceEntries) {
    currentTraceN += 1;
    const formattedEntry = {
      ...entry,
      n: currentTraceN,
      tokensIn: entry.tokensIn !== undefined ? entry.tokensIn : null,
      tokensOut: entry.tokensOut !== undefined ? entry.tokensOut : null
    };
    state.trace.push(formattedEntry);

    // Sum token counts if reported
    if (typeof entry.tokensIn === 'number') {
      state.totalTokens = (state.totalTokens || 0) + entry.tokensIn;
    }
    if (typeof entry.tokensOut === 'number') {
      state.totalTokens = (state.totalTokens || 0) + entry.tokensOut;
    }
  }

  // Requirement 2 & 4: Result is an array. Map by position and assign our own IDs.
  const rawResult = readerResponse.result;
  const resultMessages = Array.isArray(rawResult) ? rawResult : (rawResult.messages || []);

  if (isFullRun) {
    const mergedMessages = [];
    for (let i = 0; i < messagesToProcess.length; i++) {
      const assigned = messagesToProcess[i];
      const modelMsg = resultMessages[i] || {};
      mergedMessages.push({
        ...modelMsg,
        id: assigned.id,
        text: assigned.text,
        hash: assigned.hash,
        isNewUpdate: false
      });
    }

    const engineResult = buildPlan(mergedMessages);

    state.messages = mergedMessages;
    state.plan = engineResult.plan;
    state.checks = engineResult.checks;
    state.ignored = engineResult.ignored;
    state.decisions = engineResult.decisions;
    state.rejected = state.rejected || [];
  } else {
    // Incremental update run
    state.decisions = state.decisions || [];
    state.rejected = state.rejected || [];
    state.ignored = state.ignored || [];

    for (let i = 0; i < messagesToProcess.length; i++) {
      const assigned = messagesToProcess[i];
      const modelMsg = resultMessages[i] || {};

      // Requirement 4 & 5: Ignore model id, assign our own id; tag isNewUpdate = true
      const fullNewMsg = {
        ...modelMsg,
        id: assigned.id,
        text: assigned.text,
        hash: assigned.hash,
        isNewUpdate: true
      };

      const validation = validateAndApplyMessage(state.messages, fullNewMsg, state);

      if (validation.ok) {
        state.messages.push(fullNewMsg);
        state.plan = validation.result.plan;
        state.checks = validation.result.checks;

        if (validation.result.decisions) {
          state.decisions = Array.from(new Set(validation.result.decisions));
        }
        if (validation.result.ignored) {
          const seen = new Set();
          const uniqueIgnored = [];
          for (const item of validation.result.ignored) {
            const k = `${item.messageId}:${item.reason}`;
            if (!seen.has(k)) {
              seen.add(k);
              uniqueIgnored.push(item);
            }
          }
          state.ignored = uniqueIgnored;
        }
      } else {
        state.rejected.push({
          messageId: fullNewMsg.id,
          text: fullNewMsg.text,
          reason: validation.rejectionReason
        });
        state.decisions.push(`Message #${fullNewMsg.id} REJECTED: ${validation.rejectionReason}`);
      }
    }
  }

  // Save state
  saveState(state);

  // Print terminal trace
  printTrace(state);
}

main().catch(err => {
  console.error('Fatal engine error:', err);
  process.exit(1);
});

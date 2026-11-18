/**
 * Splits raw input text into separate messages.
 * Default behavior: splits on blank lines (two or more newlines) or common message delimiters.
 * 
 * @param {string} rawText 
 * @returns {Array<{id: number, text: string}>}
 */
export function splitMessages(rawText) {
  if (!rawText || !rawText.trim()) {
    return [];
  }

  // Normalize line endings
  const normalized = rawText.replace(/\r\n/g, '\n');

  // Split on double newlines or explicit boundary lines like '---' or '=== Message'
  const rawChunks = normalized.split(/\n\s*\n+|(?:\n|^)---+(?:\n|$)/);

  const messages = [];
  let id = 1;

  for (const chunk of rawChunks) {
    const trimmed = chunk.trim();
    if (trimmed.length > 0) {
      messages.push({
        id: id++,
        text: trimmed
      });
    }
  }

  // If no multiple chunks found (e.g. single message), return the entire trimmed text as 1 message
  if (messages.length === 0 && rawText.trim().length > 0) {
    messages.push({
      id: 1,
      text: rawText.trim()
    });
  }

  return messages;
}

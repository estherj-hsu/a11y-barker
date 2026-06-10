/**
 * Rough input-token estimate for Claude prompts (English-heavy text).
 * Anthropic does not expose a client-side tokenizer; ~4 chars/token is a common heuristic.
 * @param {string} text
 * @returns {number}
 */
function estimateInputTokens(text) {
  if (!text) return 0;
  const len = String(text).length;
  return Math.max(1, Math.ceil(len / 4));
}

if (typeof globalThis !== 'undefined') {
  globalThis.A11yBarkerTokenEstimate = { estimateInputTokens };
}

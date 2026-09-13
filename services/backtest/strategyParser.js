import { parseStrategyWithGemini } from './geminiStrategyParser.js';
import { parseStrategyDeterministic } from './deterministicStrategyParser.js';
import { validateStrategy } from './strategySchema.js';

export async function parseStrategy(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { valid: false, error: 'Please enter a strategy description, e.g. <code>/backtest BTC buy when RSI < 30 and sell when RSI > 70</code>' };
  }

  // 1. Try Gemini LLM if configured
  try {
    const aiResult = await parseStrategyWithGemini(prompt);
    if (aiResult) {
      return aiResult;
    }
  } catch (err) {
    // Fall through to deterministic parser
  }

  // 2. Deterministic NLP Parser (100% reliable, zero API key)
  const detResult = parseStrategyDeterministic(prompt);
  return detResult;
}

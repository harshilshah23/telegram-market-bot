import { parseStrategyWithGemini } from './geminiStrategyParser.js';
import { parseStrategyDeterministic } from './deterministicStrategyParser.js';
import { validateStrategy } from './strategySchema.js';

export async function parseStrategy(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return {
      valid: false,
      error: 'Please enter a strategy description, e.g. <code>/backtest BTC buy when RSI < 30 and sell when RSI > 70</code>'
    };
  }

  console.log('\n======================================================');
  console.log('[Strategy Parser Pipeline] Initiating parse for:');
  console.log(`"${prompt}"`);
  console.log('======================================================');

  // Step 1: Attempt LLM Interpretation (Gemini)
  let llmResult = null;
  try {
    llmResult = await parseStrategyWithGemini(prompt);
  } catch (err) {
    console.log(`[LLM parser → failure]: Exception during invocation - ${err.message}`);
  }

  if (llmResult) {
    console.log('[LLM parser → success]');
    console.log('[LLM output → parsed DSL]:', JSON.stringify(llmResult.strategy, null, 2));

    const validation = validateStrategy(llmResult.strategy);
    if (validation.valid) {
      console.log('[Schema validation → success]');
      console.log('[Fallback parser → not used]');
      console.log('[Final executable strategy → DSL]:', JSON.stringify(llmResult.strategy, null, 2));
      return llmResult;
    } else {
      console.log(`[Schema validation → failure]: ${validation.error}`);
    }
  } else {
    console.log('[LLM parser → not available or returned null]');
  }

  // Step 2: Fallback to Deterministic NLP Parser
  console.log('[Fallback parser → used (Deterministic NLP Engine)]');
  const detResult = parseStrategyDeterministic(prompt);

  if (detResult.isUnsupported) {
    console.log('[Deterministic parser → flagged unsupported data requirement]');
    return detResult;
  }

  const detValidation = validateStrategy(detResult.strategy);
  if (detValidation.valid) {
    console.log('[Schema validation → success]');
    console.log('[Final executable strategy → DSL]:', JSON.stringify(detResult.strategy, null, 2));
    return detResult;
  } else {
    console.log(`[Schema validation → failure]: ${detValidation.error}`);
    return {
      valid: false,
      error: detValidation.error || detResult.error || 'Could not extract valid entry conditions from the strategy.'
    };
  }
}

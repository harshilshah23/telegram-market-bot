import { getGeminiEditorialBrief } from './geminiProvider.js';
import { synthesizeDeterministicBrief } from './templateSynthesizer.js';

/**
 * Generates the "What Matters" editorial brief.
 * Uses Gemini AI if available; falls back to deterministic synthesizer.
 */
export async function generateWhatMatters(data) {
  try {
    const aiText = await getGeminiEditorialBrief(data);
    if (aiText && aiText.length > 20) {
      return {
        text: aiText,
        source: 'ai'
      };
    }
  } catch {
    // Non-fatal, fall back
  }

  const fallbackText = synthesizeDeterministicBrief(data);
  return {
    text: fallbackText,
    source: 'deterministic'
  };
}

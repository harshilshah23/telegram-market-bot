import { config } from '../../config/index.js';

/**
 * Optional Gemini AI Synthesis Provider
 * Activated only when GEMINI_API_KEY is configured.
 */
export async function getGeminiEditorialBrief(data) {
  if (!config.hasGemini) {
    return null;
  }

  const { quote, assetInfo, news = [], globalCrypto, upcomingEvents = [] } = data;

  const newsSummary = news.slice(0, 4).map(n => `- ${n.title} (${n.source})`).join('\n');
  const eventsSummary = upcomingEvents.map(e => `- ${e.title}`).join('\n');

  const prompt = `You are a senior Wall Street market intelligence editor.
Analyze the following real-time data for ${assetInfo.name} (${assetInfo.symbol}):

CURRENT MARKET DATA:
- Price: ${quote.price} ${quote.currency}
- 24h Change: ${quote.changePercent}%
- 24h High: ${quote.dayHigh ?? 'N/A'}
- 24h Low: ${quote.dayLow ?? 'N/A'}
- 24h Volume: ${quote.volume ?? 'N/A'}
- Asset Type: ${assetInfo.type}
${globalCrypto?.btcDominance ? `- Bitcoin Dominance: ${globalCrypto.btcDominance}%` : ''}

RECENT NEWS HEADLINES:
${newsSummary || 'No recent headlines.'}

UPCOMING EVENTS / CATALYSTS:
${eventsSummary || 'No immediate event scheduled.'}

TASK:
Write a concise, 2-to-3 sentence market editorial explanation under "WHAT MATTERS" explaining what is currently driving the asset.

STRICT GUIDELINES:
1. Ground your response strictly in the provided data and headlines. Do NOT invent facts or stats.
2. Maintain a neutral, factual, institutional market-intelligence tone.
3. NEVER provide trading advice or recommendations (do NOT say "buy", "sell", "pump", "guaranteed").
4. Keep it strictly 2 to 3 sentences. No bullet points, no headers.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 150,
          temperature: 0.2
        }
      }),
      signal: AbortSignal.timeout(4500)
    });

    if (!res.ok) {
      return null;
    }

    const result = await res.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || null;
  } catch (err) {
    // If Gemini fails or times out, seamlessly return null to trigger fallback
    return null;
  }
}

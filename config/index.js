import dotenv from 'dotenv';
dotenv.config();

export const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openRouterModel: process.env.OPENROUTER_MODEL || 'inclusionai/ling-3.0-flash-fin:free',
  newsApiKey: process.env.NEWS_API_KEY || '',
  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '60', 10),
  newsCacheTtlSeconds: parseInt(process.env.NEWS_CACHE_TTL_SECONDS || '300', 10),
  port: parseInt(process.env.PORT || '3000', 10),
  hasGemini: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0),
  hasOpenRouter: Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim().length > 0),
  hasLLM: Boolean(
    (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim().length > 0) ||
    (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0)
  )
};

export default config;

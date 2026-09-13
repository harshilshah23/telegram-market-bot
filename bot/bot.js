import { Bot } from 'grammy';
import { config } from '../config/index.js';
import { handleStartCommand, handleHelpCommand, handleBtcShortcut, handleEthShortcut } from './handlers/commandHandler.js';
import { handleTickerCommand } from './handlers/tickerHandler.js';
import { handleCallbackQuery } from './handlers/callbackHandler.js';

export function createBot() {
  if (!config.telegramBotToken) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN is not set in environment or .env file.');
    console.warn('   Get a token from @BotFather on Telegram and add it to your .env file.');
    return null;
  }

  const bot = new Bot(config.telegramBotToken);

  // Command handlers
  bot.command('start', handleStartCommand);
  bot.command('help', handleHelpCommand);
  bot.command('ticker', handleTickerCommand);
  bot.command('btc', handleBtcShortcut);
  bot.command('eth', handleEthShortcut);

  // Callback query handler
  bot.on('callback_query:data', handleCallbackQuery);

  // Direct ticker / name query handler (e.g. typing "BTC" or "NVDA" directly)
  bot.on('message:text', async (ctx) => {
    const text = ctx.message?.text?.trim() || '';
    if (text.startsWith('/')) return; // ignore commands
    if (text.length > 0 && text.length < 50 && !text.includes('\n')) {
      return handleTickerCommand(ctx, text);
    }
  });

  // Global error handler
  bot.catch((err) => {
    console.error('❌ Grammy bot error:', err.message);
  });

  return bot;
}

export async function startBot() {
  const bot = createBot();
  if (!bot) {
    console.error('❌ Could not start bot: missing TELEGRAM_BOT_TOKEN.');
    process.exit(1);
  }

  console.log('🚀 Starting Telegram Market Intelligence Bot...');
  console.log(`🤖 Gemini AI Mode: ${config.hasGemini ? 'ENABLED' : 'DISABLED (Using Deterministic Heuristic Synthesizer)'}`);

  // Fetch bot info
  let botUsername = 'MarketBot';
  try {
    const me = await bot.api.getMe();
    botUsername = me.username;
    console.log(`✅ Connected to Telegram as @${me.username} (${me.first_name})`);
    console.log('📡 Listening for incoming messages...');
  } catch (err) {
    console.error('❌ Failed to connect to Telegram API:', err.message);
    process.exit(1);
  }

  // Start lightweight HTTP healthcheck server for cloud hosts (e.g. Render, Railway)
  import('http').then(http => {
    const port = config.port || 3000;
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', bot: botUsername }));
    });
    server.listen(port, () => {
      console.log(`🌐 Healthcheck server listening on port ${port}`);
    });
  }).catch(() => {});

  await bot.start();
}

// Start bot if executed directly
if (process.argv[1] && process.argv[1].endsWith('bot.js')) {
  startBot();
}

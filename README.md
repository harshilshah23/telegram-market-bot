# 🌐 Telegram Market Intelligence Bot

> **"Ask any ticker. Get the story."**

A lightweight, production-grade **market-intelligence terminal inside Telegram**. It dynamically resolves any cryptocurrency, US equity, ETF, major index, or commodity and returns a concise, institutional-grade market brief combining **real-time price action, deduplicated news, upcoming catalysts, and synthesized editorial context ("What Matters")**.

Built with a **$0 Free-First Architecture**: zero paid APIs, zero subscriptions, and an intelligent deterministic synthesis engine that requires no external AI key to function.

---

## 📸 Sample Terminal Output

When a user types:
`/ticker BTC`

```html
₿ BTC — Bitcoin
$77,222.13 +0.09% 24h

📊 MARKET
24h High: $77,505.67
24h Low: $76,994.22
Volume: $704.44M
Market Cap: $1.29T
BTC Dominance: 58.2%

📰 LATEST
• Why Is The Crypto Market Down Today?
  finance.yahoo.com · 2d ago

• Why Is Bitcoin Dropping Today?
  24/7 Wall St. · 1h ago

• Bitcoin is back, but potential Clarity Act fail could impact crypto prices
  CNBC · 1d ago

📅 UPCOMING
• US CPI Inflation Print (Sep 13)
• Weekly Institutional ETF Flow & Liquidity Report

⚡ WHAT MATTERS
BTC is range-bound, holding relatively flat (+0.09%). Broader technology momentum and enterprise AI infrastructure demand continue to underpin trading flow. The primary near-term focal point is US CPI Inflation Print (Sep 13).
```

---

## ⚡ Core Features & MVP Capabilities

- **Dynamic Ticker & Name Resolution**:
  - Tickers: `BTC`, `ETH`, `NVDA`, `MSTR`, `AAPL`, `TSLA`, `SPY`, `QQQ`, `GC=F`
  - Natural names: `Bitcoin` → `BTC-USD`, `NVIDIA` → `NVDA`, `Tesla` → `TSLA`, `Apple` → `AAPL`, `Gold` → `GC=F`
  - Full universe support: Any US stock, crypto, ETF, index, or commodity supported by Yahoo Finance / Binance.
  - Ambiguity & unknown handling: Prompts users with suggested tickers if resolution is ambiguous.
- **Fast Shortcuts**:
  - `/btc` → instant Bitcoin market brief
  - `/eth` → instant Ethereum market brief
  - `/ticker <query>` → analyze any asset
  - `/help` & `/start` → onboarding and full command guide
- **Asset-Specific Adaptive Formatting**:
  - **Crypto**: 24h High/Low, Volume, Market Cap, BTC Dominance (BTC.D), crypto & macro catalysts.
  - **Equities**: Day High/Low, Volume, Market Cap, 52-week range, next earnings date, macro catalysts.
  - **ETFs & Indices**: Benchmarks, daily movement, volume, 52-week range, macro catalysts.
  - **Clean Omission**: Gracefully omits missing data fields instead of displaying broken `null` or `$0` values.
- **Aggressive News Deduplication**:
  - Real-time RSS aggregation from Google News RSS & Yahoo Finance RSS.
  - Jaccard similarity and token-cleaning engine eliminates redundant stories.
  - 3–4 clickable headlines with source attribution and relative timestamps ("1h ago", "2d ago").
- **Dual-Mode "What Matters" Intelligence**:
  - **Deterministic Financial Synthesizer (Default, $0)**: Analyzes price momentum, volume anomaly, trading range extremes, and news headlines to construct a high-grade 2–3 sentence editorial brief without any external AI API.
  - **Gemini AI Mode (Optional)**: If `GEMINI_API_KEY` is provided, enhances the editorial summary using Google Gemini 2.5 Flash with strict factual grounding and zero financial advice.
- **Interactive Inline Telegram Buttons**:
  - `🔄 Refresh`: Re-queries latest market data and updates message in-place.
  - `📊 Web Terminal`: Direct link to Yahoo Finance or CoinMarketCap chart.

---

## 🆓 Free-First Data Providers & Limitations

| Provider | Purpose | Authentication | Rate Limits & Notes |
| :--- | :--- | :--- | :--- |
| **Yahoo Finance Chart API** | Real-time equity, ETF, index, commodity quotes | **None ($0)** | ~2,000 req/hour. Rock-solid public endpoint. |
| **Binance Public API** | Real-time crypto 24h prices, volume, high/low | **None ($0)** | 1,200 req/minute. Sub-100ms latency. |
| **CoinGecko Global API** | BTC Dominance, crypto global stats | **None ($0)** | 10–30 req/min (cached for 10 min). |
| **Google News RSS** | Real-time financial & crypto news | **None ($0)** | Unmetered public RSS. Deduplicated locally. |
| **Yahoo Finance RSS** | Company-specific equity & ETF news | **None ($0)** | Unmetered public RSS. |
| **Google Gemini API** (Optional) | "What Matters" AI editorial synthesis | **Free API Key** | Generous free tier (15 RPM). Fallback is automatic if omitted. |

---

## 🔑 Required Credentials

You only need **ONE** credential to run this bot live on Telegram:

1. **`TELEGRAM_BOT_TOKEN`** *(Required)*
   - Cost: **100% Free**
   - How to get:
     1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
     2. Send `/newbot` and follow the prompts to choose a bot name and username.
     3. Copy the HTTP API token into your `.env` file.

2. **`GEMINI_API_KEY`** *(Optional)*
   - Cost: **100% Free Tier**
   - How to get: [Google AI Studio](https://aistudio.google.com/)
   - *Note:* If left blank, the bot runs using its built-in deterministic financial heuristic engine with zero degradation in reliability.

---

## 🛠️ Project Structure

```text
telegram-market-bot/
│
├── bot/
│   ├── bot.js                      # Main Telegram bot initialization & polling
│   ├── handlers/
│   │   ├── tickerHandler.js        # /ticker command handler with status state
│   │   ├── commandHandler.js       # /start, /help, /btc, /eth shortcuts
│   │   └── callbackHandler.js      # Interactive inline buttons (Refresh, Help)
│   ├── formatters/
│   │   ├── baseFormatter.js        # HTML escaping, currency, number formats
│   │   ├── cryptoFormatter.js      # Specialized crypto layout
│   │   ├── equityFormatter.js      # Specialized equity layout
│   │   ├── etfFormatter.js         # Specialized ETF & index layout
│   │   └── index.js                # Formatter dispatcher
│   └── keyboards/
│       └── tickerKeyboard.js       # Telegram inline buttons
│
├── services/
│   ├── marketOrchestrator.js       # Unified pipeline orchestrator
│   ├── resolver/
│   │   └── symbolResolver.js       # Dynamic ticker & company name resolver
│   ├── market_data/
│   │   ├── yahooMarketData.js      # Free Yahoo Finance chart & quote service
│   │   └── cryptoMarketData.js     # Binance & CoinGecko public market data
│   ├── news/
│   │   ├── newsAggregator.js       # Google News & Yahoo RSS harvester
│   │   └── newsDeduplicator.js     # Headline similarity deduplication
│   ├── earnings/
│   │   └── earningsService.js      # Equity earnings announcement extractor
│   ├── events/
│   │   └── macroEvents.js          # Scheduled macro catalysts (CPI, FOMC, NFP)
│   └── intelligence/
│       ├── intelligenceEngine.js   # "What Matters" layer coordinator
│       ├── templateSynthesizer.js  # High-grade deterministic synthesis fallback
│       └── geminiProvider.js       # Optional Gemini AI synthesis
│
├── cache/
│   └── cacheManager.js             # In-memory TTL caching
├── config/
│   └── index.js                    # Environment configuration loader
├── tests/
│   └── test_pipeline.js            # Live integration test suite
│
├── .env.example                    # Template configuration
├── .gitignore                      # Git ignore rules
├── package.json                    # Dependencies & scripts
└── README.md                       # Documentation
```

---

## 🚀 Quickstart: Running Locally

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (Node 20+ recommended)
- **npm** or **bun**

### 2. Setup
```bash
# Clone or navigate to directory
cd telegram-market-bot

# Install dependencies
npm install

# Create .env from example
cp .env.example .env
```

### 3. Add Telegram Bot Token
Edit `.env`:
```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGhIJKlmNoPQRstuVWXyz
GEMINI_API_KEY=
```

### 4. Run Integration Tests
Verify the entire live data pipeline (crypto, equities, ETFs, news, and resolution):
```bash
npm test
```

### 5. Start the Bot
```bash
npm start
```

Now open Telegram, message your bot `@YourBotName`, and type:
```text
/ticker BTC
/ticker NVDA
/ticker Tesla
```

---

## ☁️ Deployment (Free / Low-Cost Hosting)

Since this bot uses Telegram long-polling, it requires a simple persistent Node.js background process (no public domain or HTTPS certificate required).

### Option 1: Render (Free Tier Background Worker)
1. Push code to GitHub.
2. Go to [Render.com](https://render.com) and create a **Background Worker** (or Web Service).
3. Connect your repository.
4. Set:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Under **Environment Variables**, add:
   - `TELEGRAM_BOT_TOKEN` = your token
6. Click **Deploy**.

### Option 2: Railway
1. Go to [Railway.app](https://railway.app).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Add `TELEGRAM_BOT_TOKEN` in the **Variables** tab.
4. Railway will automatically detect Node.js and start `npm start`.

### Option 3: VPS with PM2 (DigitalOcean, Hetzner, AWS EC2)
```bash
git clone <your-repo>
cd telegram-market-bot
npm install
npm install -g pm2
pm2 start bot/bot.js --name "market-bot"
pm2 save
pm2 startup
```

---

## 🗺️ What We Would Build Next (Product Roadmap)

1. **Watchlists (`/watch <symbol>`)**:
   - Allow users to bookmark their favorite 5–10 assets for instant tracking.
   - `/watchlist` command to view a scannable summary table of their portfolio.
2. **Volatility & Price Alerts**:
   - "Alert me if BTC breaks above $85,000" or "Alert me on 5% daily swings".
   - Periodic cron monitoring with Telegram push notifications.
3. **Daily Market Brief (`/brief`)**:
   - Morning pre-market / evening post-market audio or text digest summarizing the top macro drivers, S&P 500 movers, and Bitcoin trend.
4. **News-Only Deep Dive (`/news <symbol>`)**:
   - Expanded feed of 8–10 categorized stories (regulatory, product, financial results) with AI bullet-point key takeaways.
5. **Community Sentiment & Polls**:
   - Allow group chats to vote bullish/bearish on daily closes and display community consensus percentages inside the market brief.

---

## 📜 License
MIT License. Free for personal, commercial, and educational use.

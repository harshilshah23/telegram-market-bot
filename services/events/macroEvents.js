/**
 * Lightweight Macroeconomic & Market Catalysts Service
 * Surfaces major scheduled catalysts (FOMC, CPI, NFP) and crypto events.
 */

/**
 * Computes estimated upcoming dates for recurring monthly macro releases based on standard schedules:
 * - NFP: First Friday of the month
 * - CPI: Typically second Wednesday/Thursday of the month
 * - FOMC: Scheduled Fed meetings
 */
function getUpcomingMacroEvents(referenceDate = new Date()) {
  const events = [];
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth(); // 0-indexed

  // Check current and next month
  for (let mOffset = 0; mOffset <= 1; mOffset++) {
    const targetMonth = (month + mOffset) % 12;
    const targetYear = month + mOffset > 11 ? year + 1 : year;

    // NFP: First Friday of the target month
    const firstDay = new Date(targetYear, targetMonth, 1);
    let dayOfWeek = firstDay.getDay(); // 0 = Sun, 5 = Fri
    let firstFridayDate = 1 + ((5 - dayOfWeek + 7) % 7);
    const nfpDate = new Date(targetYear, targetMonth, firstFridayDate, 12, 30); // 8:30 AM ET

    if (nfpDate > referenceDate) {
      events.push({
        title: 'US Non-Farm Payrolls (Jobs Report)',
        date: nfpDate,
        category: 'employment',
        impact: 'High',
        relevance: ['equity', 'etf', 'crypto', 'commodity', 'index']
      });
    }

    // CPI: Typically second Wednesday/Thursday of the month (~11th)
    const cpiDate = new Date(targetYear, targetMonth, 11, 12, 30);
    // Buffer: Must be at least 24 hours in the future to be considered upcoming
    if (cpiDate.getTime() > referenceDate.getTime() + 24 * 3600 * 1000) {
      events.push({
        title: 'US CPI Inflation Print',
        date: cpiDate,
        category: 'inflation',
        impact: 'Very High',
        relevance: ['equity', 'etf', 'crypto', 'commodity', 'index']
      });
    }

    // PPI: ~13th of each month
    const ppiDate = new Date(targetYear, targetMonth, 13, 12, 30);
    if (ppiDate.getTime() > referenceDate.getTime() + 24 * 3600 * 1000) {
      events.push({
        title: 'US PPI Wholesale Inflation',
        date: ppiDate,
        category: 'inflation',
        impact: 'Medium',
        relevance: ['equity', 'etf', 'crypto']
      });
    }
  }

  // Known FOMC meeting approximate schedule (Jan, Mar, May, Jun, Jul, Sep, Nov, Dec)
  const fomcDates = [
    new Date(year, 0, 29),
    new Date(year, 2, 18),
    new Date(year, 4, 6),
    new Date(year, 5, 17),
    new Date(year, 6, 29),
    new Date(year, 8, 23),
    new Date(year, 10, 4),
    new Date(year, 11, 16)
  ];

  for (const fDate of fomcDates) {
    if (fDate > referenceDate) {
      events.push({
        title: 'FOMC Interest Rate Decision & Fed Presser',
        date: fDate,
        category: 'central-bank',
        impact: 'Critical',
        relevance: ['equity', 'etf', 'crypto', 'commodity', 'index']
      });
      break; // Just include next one
    }
  }

  // Sort chronologically
  return events.sort((a, b) => a.date - b.date);
}

/**
 * Returns the most relevant upcoming catalyst for the requested asset.
 */
export function getRelevantUpcomingEvents(assetType, quote) {
  const now = new Date();
  const macroEvents = getUpcomingMacroEvents(now);

  const matched = [];

  // For equities: Earnings takes top priority if present
  if (assetType === 'equity' && quote?.earningsDate) {
    const d = new Date(quote.earningsDate);
    const label = !isNaN(d.getTime())
      ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : quote.earningsDate;

    matched.push({
      title: `Q Earnings Announcement (${label})`,
      type: 'earnings',
      date: d
    });
  }

  // Add the closest high-impact macro event
  const nextMacro = macroEvents.find(e => e.relevance.includes(assetType));
  if (nextMacro) {
    const formattedDate = nextMacro.date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
    matched.push({
      title: `${nextMacro.title} (${formattedDate})`,
      type: 'macro',
      date: nextMacro.date
    });
  }

  // For crypto: add crypto structural catalyst
  if (assetType === 'crypto') {
    matched.push({
      title: 'Weekly Institutional ETF Flow & Liquidity Report',
      type: 'crypto_flow',
      date: new Date()
    });
  }

  // Return at most 2 concise catalysts
  return matched.slice(0, 2);
}

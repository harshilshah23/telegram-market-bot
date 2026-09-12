/**
 * Earnings Service
 * Handles next earnings dates and previous EPS info for equities.
 * Strictly omits if unavailable or unreliable.
 */
export function formatEarningsInfo(quote) {
  if (!quote || !quote.earningsDate) {
    return null;
  }

  try {
    const d = new Date(quote.earningsDate);
    if (isNaN(d.getTime())) return null;

    const formattedDate = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    return {
      date: formattedDate,
      raw: quote.earningsDate
    };
  } catch {
    return null;
  }
}

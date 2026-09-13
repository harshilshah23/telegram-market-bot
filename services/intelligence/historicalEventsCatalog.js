/**
 * Verifiable Historical Macro Events Catalog
 * Contains authentic recorded dates for major central bank actions and policy shifts.
 */
export const HISTORICAL_MACRO_EVENTS = {
  'FED_RATE_CUT': [
    {
      name: 'Fed 50bps Easing Cycle Kickoff',
      date: '2024-09-18',
      rateChangeBps: -50,
      context: 'Fed initiates first rate cut of cycle with 50bps reduction to 4.75%-5.00%'
    },
    {
      name: 'Fed COVID Emergency 100bps Cut & QE',
      date: '2020-03-15',
      rateChangeBps: -100,
      context: 'Emergency Sunday 100bps cut to zero lower bound + $700B asset purchase program'
    },
    {
      name: 'Fed COVID Emergency 50bps Cut',
      date: '2020-03-03',
      rateChangeBps: -50,
      context: 'Inter-meeting emergency 50bps cut in response to emerging pandemic threat'
    },
    {
      name: 'Fed Mid-Cycle Insurance Cut',
      date: '2019-07-31',
      rateChangeBps: -25,
      context: 'First rate cut in over a decade ("insurance cut" amid global trade tensions)'
    }
  ],
  'ECB_RATE_CUT': [
    {
      name: 'ECB 25bps Rate Cut (Autumn Easing)',
      date: '2024-10-17',
      rateChangeBps: -25,
      context: 'ECB accelerates easing cycle with back-to-back 25bps deposit facility cut to 3.25%'
    },
    {
      name: 'ECB 25bps Rate Cut (Initial Easing)',
      date: '2024-06-06',
      rateChangeBps: -25,
      context: 'ECB cuts deposit facility rate by 25bps to 3.75%, commencing easing ahead of the Fed'
    },
    {
      name: 'ECB Deposit Rate Cut to -0.50% & APP Restart',
      date: '2019-09-12',
      rateChangeBps: -10,
      context: 'Draghi package: 10bps cut deeper into negative territory + €20B/month QE restart'
    },
    {
      name: 'ECB Benchmark Cut to 0.00% & Negative Deposit Expansion',
      date: '2016-03-10',
      rateChangeBps: -10,
      context: 'Refinancing rate lowered to 0.00%, deposit rate cut 10bps to -0.40%, expanded QE'
    },
    {
      name: 'ECB Comprehensive 50bps Easing Package',
      date: '2011-12-08',
      rateChangeBps: -50,
      context: 'Draghi delivers back-to-back 25bps cuts (50bps total in Q4) to combat Eurozone sovereign debt crisis'
    }
  ],
  'BOJ_POLICY_CHANGE': [
    {
      name: 'BoJ July 2024 Hike to 0.25% & Global Carry Trade Unwind',
      date: '2024-07-31',
      rateChangeBps: 15,
      context: 'BoJ raises uncollateralized overnight call rate to 0.25%, triggering sharp yen rally and global risk asset deleveraging'
    },
    {
      name: 'BoJ Landmark NIRP Exit to 0.00%-0.10%',
      date: '2024-03-19',
      rateChangeBps: 10,
      context: 'Ueda ends 8 years of negative interest rates, abolishing Yield Curve Control (YCC) and ETF buying'
    },
    {
      name: 'BoJ YCC Flexibility Adjustment to 1.0%',
      date: '2023-07-28',
      rateChangeBps: 0,
      context: 'BoJ relaxes 10Y JGB yield cap from strict 0.50% to flexible 1.0% upper bound'
    },
    {
      name: 'BoJ Unexpected YCC Band Widening to ±0.50%',
      date: '2022-12-20',
      rateChangeBps: 0,
      context: 'Kuroda surprises markets by doubling 10Y yield tolerance band to ±0.50%, jolting global bond and equity markets'
    }
  ],
  'US_CPI_UPSIDE_SURPRISE': [
    {
      name: 'August 2022 Core CPI Upside Shock',
      date: '2022-09-13',
      rateChangeBps: null,
      context: 'Core CPI accelerates to 6.3% YoY (above 6.1% expectations), triggering -9% daily drop in BTC and -5% in equities'
    },
    {
      name: 'May 2022 CPI 40-Year High (8.6%)',
      date: '2022-06-10',
      rateChangeBps: null,
      context: 'Headline CPI unexpectedly spikes to 8.6% shattering "peak inflation" narrative, prompting Fed to hike 75bps'
    },
    {
      name: 'April 2022 CPI Upside Surprise (8.3%)',
      date: '2022-05-11',
      rateChangeBps: null,
      context: 'CPI prints hotter than 8.1% estimate as BTC broke below 200DMA during early bear-market stage'
    },
    {
      name: 'March 2024 Hot CPI Print',
      date: '2024-04-10',
      rateChangeBps: null,
      context: 'Third consecutive hot CPI print of 2024 (0.4% MoM) forces markets to sharply push back Fed rate cut timing'
    }
  ]
};

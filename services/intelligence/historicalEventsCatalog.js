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
  ]
};

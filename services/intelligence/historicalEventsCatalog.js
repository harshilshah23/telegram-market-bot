/**
 * Known historical dates of major macro actions (e.g. Fed rate cuts / emergency cuts)
 * Allows actual historical calculation of post-event asset performance.
 */
export const HISTORICAL_MACRO_EVENTS = {
  'FED_RATE_CUT_50BPS': [
    {
      name: 'Fed Emergency Rate Cut (COVID Shock)',
      date: '2020-03-03',
      rateCutBps: 50,
      context: 'Pre-pandemic emergency rate cut of 50bps',
      btcTrend: 'downtrend'
    },
    {
      name: 'Fed Jumbo Rate Cut (Easing Cycle Kickoff)',
      date: '2024-09-18',
      rateCutBps: 50,
      context: 'Initial 50bps easing cycle kickoff',
      btcTrend: 'uptrend'
    },
    {
      name: 'Fed Inter-meeting Rate Cut (GFC)',
      date: '2008-01-22',
      rateCutBps: 75,
      context: 'Emergency 75bps intermeeting cut during Subprime turmoil',
      btcTrend: 'pre_crypto'
    },
    {
      name: 'Fed Easing Kickoff (Dot Com)',
      date: '2001-01-03',
      rateCutBps: 50,
      context: 'Emergency 50bps intermeeting cut',
      btcTrend: 'pre_crypto'
    }
  ],
  'FED_EMERGENCY_EASING': [
    {
      name: 'Fed COVID Zero Lower Bound & QE Kickoff',
      date: '2020-03-15',
      rateCutBps: 100,
      context: 'Emergency Sunday cut to 0.00-0.25% + $700B QE announcement',
      btcTrend: 'crash'
    },
    {
      name: 'Fed 50bps Cycle Kickoff',
      date: '2024-09-18',
      rateCutBps: 50,
      context: 'First rate cut after 2022-2023 tightening cycle',
      btcTrend: 'uptrend'
    }
  ]
};

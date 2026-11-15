#!/usr/bin/env node
/**
 * Regenerates data/mock/daily-metrics.json and data/mock/usage-by-hour.json.
 *
 *   node tools/generate-mock.mjs        (or: npm run mock)
 *
 * Change PARAMS below to create a different scenario, for example a bigger
 * campaign spike, a longer outage, or a different iOS/Android split.
 * For one-off tweaks you can also edit the JSON files directly.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PARAMS = {
  seed: 20261115,
  endDate: '2026-11-14',
  days: 360,                                   // 2 × 180 so every period has a "previous period"
  weekdayFactor: [0.78, 1.02, 1.04, 1.03, 1.05, 1.0, 0.82], // Sun … Sat

  activeUsers:   { start: 168000, end: 210000, noise: 0.04 },
  newAccounts:   { start: 1250, end: 1570, weekendFactor: 0.74, noise: 0.12 },
  campaigns:     [{ from: '2026-09-14', to: '2026-09-20', newAccountsMultiplier: 2.4 }],
  credentialsAddedPerNewAccount: 1.35,
  credentialsAddedBaseline: 420,

  credentialChecks: { start: 58000, end: 67000, noise: 0.06,
                      weekdayFactor: [1.3, 0.94, 0.95, 0.97, 1.05, 1.22, 1.38], failRate: [0.017, 0.021] },

  transactions:  { start: 8200, end: 10000, noise: 0.06, successRate: 0.937, successNoise: 0.006 },
  incidents:     [{ date: '2026-10-30', successRate: 0.862 }, { date: '2026-10-31', successRate: 0.868 }],

  platform:      { iosShare: 0.61, iosShareNoise: 0.01, iosSuccessAdjust: 0.003, androidSuccessAdjust: -0.004 },

  notifications: { start: 9400, end: 10500, noise: 0.1, mondayFactor: 2.2, sundayFactor: 0.2 },

  // Relative app use by hour (0–23). Shapes only; the dashboard scales them.
  hourlyWeekday: [3, 2, 1, 1, 1, 2, 6, 14, 22, 20, 17, 16, 18, 16, 14, 14, 15, 17, 18, 20, 19, 14, 9, 5],
  hourlyWeekend: [5, 3, 2, 1, 1, 1, 2, 5, 10, 15, 18, 19, 18, 16, 15, 14, 14, 15, 16, 17, 16, 13, 10, 7],
  fridayEveningBoost: 1.2,
  saturdayEveningBoost: 1.3
};

/* ------------------------------------------------------------------ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(PARAMS.seed);
const jitter = s => 1 + (rnd() - 0.5) * 2 * s;
const lerp = (a, b, t) => a + (b - a) * t;
const iso = d => d.toISOString().slice(0, 10);

const end = new Date(PARAMS.endDate + 'T00:00:00Z');
const rows = [];

for (let i = 0; i < PARAMS.days; i++) {
  const d = new Date(end); d.setUTCDate(d.getUTCDate() - (PARAMS.days - 1 - i));
  const date = iso(d), dow = d.getUTCDay(), t = i / PARAMS.days, wk = PARAMS.weekdayFactor[dow];

  const active = lerp(PARAMS.activeUsers.start, PARAMS.activeUsers.end, t) * wk * jitter(PARAMS.activeUsers.noise);

  let newAcc = lerp(PARAMS.newAccounts.start, PARAMS.newAccounts.end, t)
    * (dow === 0 || dow === 6 ? PARAMS.newAccounts.weekendFactor : 1) * jitter(PARAMS.newAccounts.noise);
  PARAMS.campaigns.forEach(c => { if (date >= c.from && date <= c.to) newAcc *= c.newAccountsMultiplier; });

  const credAdded = newAcc * PARAMS.credentialsAddedPerNewAccount * jitter(0.1) + PARAMS.credentialsAddedBaseline * jitter(0.2);

  const cc = PARAMS.credentialChecks;
  const checks = lerp(cc.start, cc.end, t) * cc.weekdayFactor[dow] * jitter(cc.noise);
  const failRate = cc.failRate[0] + rnd() * (cc.failRate[1] - cc.failRate[0]);

  const tx = lerp(PARAMS.transactions.start, PARAMS.transactions.end, t) * wk * jitter(PARAMS.transactions.noise);
  const incident = PARAMS.incidents.find(x => x.date === date);
  const success = incident ? incident.successRate : PARAMS.transactions.successRate + (rnd() - 0.5) * 2 * PARAMS.transactions.successNoise;

  const n = PARAMS.notifications;
  const notes = lerp(n.start, n.end, t) * (dow === 1 ? n.mondayFactor : dow === 0 ? n.sundayFactor : 1) * jitter(n.noise);

  const ios = PARAMS.platform.iosShare + (rnd() - 0.5) * 2 * PARAMS.platform.iosShareNoise;

  for (const [platform, share, adj] of [['ios', ios, PARAMS.platform.iosSuccessAdjust], ['android', 1 - ios, PARAMS.platform.androidSuccessAdjust]]) {
    const finished = Math.round(tx * share);
    rows.push({
      date, platform,
      activeUsers: Math.round(active * share),
      newAccounts: Math.round(newAcc * share),
      credentialsAdded: Math.round(credAdded * share),
      credentialChecks: Math.round(checks * share),
      credentialChecksFailed: Math.round(checks * share * failRate),
      transactionsFinished: finished,
      transactionsCompleted: Math.round(finished * Math.min(1, success + adj)),
      notificationsSent: Math.round(notes * share)
    });
  }
}

/* Day × hour matrix, Monday first */
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dowIndex = [1, 2, 3, 4, 5, 6, 0];
const matrix = dowIndex.map(dow => {
  const weekend = dow === 0 || dow === 6;
  const base = weekend ? PARAMS.hourlyWeekend : PARAMS.hourlyWeekday;
  return base.map((v, h) => {
    let x = v * PARAMS.weekdayFactor[dow];
    if (dow === 5 && h >= 17) x *= PARAMS.fridayEveningBoost;
    if (dow === 6 && h >= 18) x *= PARAMS.saturdayEveningBoost;
    return +x.toFixed(2);
  });
});

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'mock');
const about = 'Generated by tools/generate-mock.mjs. One row per day per platform. Edit values directly or change PARAMS in the generator and rerun it. All figures are invented.';
writeFileSync(join(out, 'daily-metrics.json'),
  `{\n  "_about": ${JSON.stringify(about)},\n  "rows": [\n${rows.map(r => '    ' + JSON.stringify(r)).join(',\n')}\n  ]\n}\n`);
writeFileSync(join(out, 'usage-by-hour.json'), JSON.stringify({
  _about: 'Relative app use for each hour of a typical week, Adelaide time. Rows are days (Monday first), columns are hours 0–23. Only the shape matters; the dashboard scales it to the period.',
  days, matrix
}, null, 2));
console.log(`Wrote ${rows.length} daily rows and the hourly matrix to ${out}`);

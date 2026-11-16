#!/usr/bin/env node
/**
 * Regenerates data/mock/daily-metrics.json, data/mock/usage-by-hour.json and
 * data/mock/azure-cost.json (see COST below).
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

/* ------------------------------------------------------------------ */
/* Azure cost: one row per day per meter, in the column shape of an Azure
 * Cost Management export (see data/mock/samples/azure-cost-sample.csv, which
 * guided the service names, meters and value ranges for Databricks, Storage
 * and Virtual Machines). The other services, every part number except the
 * three in the sample, and all amounts are invented.
 *
 * Each meter's daily AUD cost = lerp(start, end) × (fixed + traffic × that
 * day's app traffic relative to trend) × noise. Costs use their own random
 * seed, so changing them never changes daily-metrics.json.
 */
const COST = {
  seed: 20261116,
  audPerUsd: 1.4442,                           // ratio of Cost to CostUSD in the sample
  meters: [
    { service: 'Microsoft Fabric', tier: 'Fabric Capacity', meter: 'F32 Capacity Usage CU', part: 'AAK-51907',
      start: 205, end: 205, traffic: 0, noise: 0 },
    { service: 'Azure Databricks', tier: 'Az DB Regional', meter: 'Premium Serverless SQL DBU', part: 'AAN-42814',
      start: 34, end: 42, traffic: 0, noise: 0.35, weekendFactor: 0.35, min: 4,
      // heavy runs (backfills, model refreshes) on some weekdays
      spikes: { chance: 0.045, from: 120, to: 200 } },
    { service: 'Storage', tier: 'Azure Data Lake Storage Gen2 Hier Namespace', meter: 'Hot ZRS Data Stored', part: 'AAD-37832',
      start: 7, end: 12, traffic: 0, noise: 0.02 },
    { service: 'Virtual Machines', tier: 'Dsv5 Series Windows VM', meter: 'D4s v5', part: 'AAM-30605',
      start: 27, end: 27, traffic: 0, noise: 0.13 },
    { service: 'SQL Database', tier: 'SQL Database Single/Elastic Pool General Purpose - Compute Gen5', meter: 'vCore', part: 'AAH-18642',
      start: 95, end: 95, traffic: 0, noise: 0 },
    { service: 'Azure App Service', tier: 'Azure App Service Premium v3 Plan', meter: 'P1 v3', part: 'AAF-66310',
      start: 50, end: 58, traffic: 0.4, noise: 0.03 },
    { service: 'API Management', tier: 'API Management Standard v2', meter: 'Standard v2 Unit', part: 'AAP-20458',
      start: 32, end: 32, traffic: 0, noise: 0 },
    { service: 'Log Analytics', tier: 'Log Analytics', meter: 'Pay-as-you-go Data Ingestion', part: 'AAC-74129',
      start: 40, end: 48, traffic: 1, noise: 0.08 },
    { service: 'Notification Hubs', tier: 'Notification Hubs', meter: 'Standard Unit', part: 'AAJ-39071',
      start: 10, end: 12, traffic: 0.25, noise: 0.05 }
  ],
  // Extra cost on incident days: failed calls are retried and logged, and data is reloaded afterwards.
  // Keep in step with PARAMS.incidents and events.json.
  incidents: [
    { date: '2026-10-30', multiply: { 'Log Analytics': 2.5 }, set: { 'Azure Databricks': 150 } },
    { date: '2026-10-31', multiply: { 'Log Analytics': 2.5 }, set: { 'Azure Databricks': 227 } }
  ]
};

const crnd = mulberry32(COST.seed);
const cjit = s => 1 + (crnd() - 0.5) * 2 * s;
const costColumns = ['UsageDate', 'PublisherType', 'ChargeType', 'ServiceName', 'ServiceTier', 'Meter', 'PartNumber', 'CostUSD', 'Cost', 'Currency'];
const costRows = [];
const dayList = [...new Set(rows.map(r => r.date))];
dayList.forEach((date, i) => {
  const d = new Date(date + 'T00:00:00Z'), dow = d.getUTCDay(), t = i / PARAMS.days;
  const weekend = dow === 0 || dow === 6;
  const finished = rows.filter(r => r.date === date).reduce((a, r) => a + r.transactionsFinished, 0);
  const traffic = finished / lerp(PARAMS.transactions.start, PARAMS.transactions.end, t);   // about 0.78 to 1.05
  const inc = COST.incidents.find(x => x.date === date) || {};
  COST.meters.forEach(m => {
    let c = lerp(m.start, m.end, t) * (1 - m.traffic + m.traffic * traffic) * cjit(m.noise);
    if (weekend && m.weekendFactor) c *= m.weekendFactor;
    if (m.spikes) { const hit = crnd() < m.spikes.chance, size = lerp(m.spikes.from, m.spikes.to, crnd()); if (hit && !weekend) c = size; }
    if (inc.multiply && inc.multiply[m.service]) c *= inc.multiply[m.service];
    if (inc.set && inc.set[m.service] != null) c = inc.set[m.service];
    c = Math.max(m.min || 0, c);
    costRows.push([date, 'Azure', 'Usage', m.service, m.tier, m.meter, m.part, +(c / COST.audPerUsd).toFixed(4), +c.toFixed(4), 'AUD']);
  });
});
const costAbout = 'Generated by tools/generate-mock.mjs. Mock Azure cost in the column shape of an Azure Cost Management export: one row per day per service meter, with values in the order given in "columns". Cost is in AUD. Service names, meters and value ranges for Azure Databricks, Storage and Virtual Machines follow data/mock/samples/azure-cost-sample.csv; the other services and all amounts are invented.';
writeFileSync(join(out, 'azure-cost.json'),
  `{\n  "_about": ${JSON.stringify(costAbout)},\n  "columns": ${JSON.stringify(costColumns)},\n  "rows": [\n${costRows.map(r => '    ' + JSON.stringify(r)).join(',\n')}\n  ]\n}\n`);
console.log(`Wrote ${costRows.length} cost rows to ${out}`);

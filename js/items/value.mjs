/**
 * Value tab: the money case for the app.
 *
 * Built on the channel-shift estimate (ITM-26): each completed app transaction
 * is assumed to replace a counter visit, phone call or website transaction in
 * set shares, each with a unit cost. Those assumptions, and the app's other
 * running costs and build cost, live in data/mock/value.json. Azure spend
 * comes from the Cost tab's data. Every dollar figure here is an estimate
 * built on those assumptions and is labelled as one.
 *
 * Cost avoided and app costs are not split by phone type, so these items show
 * all platforms and say so when a phone type is selected.
 */
import { lineChart, hbars, legend, table } from '../ui/charts.mjs';
import { fmt, fmtC, fmtMoney, pct, dfmt, escapeHtml } from '../ui/format.mjs';
import { statusChip } from '../ui/status.mjs';

const change = (c, p) => (p ? (c - p) / p : NaN);
const money = v => (v < 0 ? '−' : '') + fmtMoney(Math.abs(v));
const cents = v => (v < 1 ? `${(v * 100).toFixed(1)}c` : `$${v.toFixed(2)}`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = m => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const platformNote = s => (s.platform === 'all' ? '' : '<p class="note">Value and cost are not split by phone type, so this item shows all platforms.</p>');
const estimate = text => `<p class="note">${statusChip('info', 'Estimate')} ${text} Change the assumptions in <code>data/mock/value.json</code>.</p>`;

const VALUE_SOURCES = ['Transactions', 'TransactionTypes', 'TransactionStatuses', 'ref.ChannelCosts', 'ref.ChannelOtherwise', 'ref.ProgrammeCosts', 'silver.AzureCostDaily'];

export default [
  {
    id: 'ITM-43', tab: 'value', span: 's12', view: 'vw_NetBenefit',
    title: 'Net benefit', sub: 'Estimated cost avoided, less what the app costs to run',
    build: {
      sources: VALUE_SOURCES,
      fields: 'Completed app transactions per day and service; channel unit costs and "otherwise" shares; Azure cost per day; other running costs per month',
      logic: 'Cost avoided = completed app transactions × the saving per transaction for their service (see ITM-26) × attribution. App running cost = Azure cost for the platform + other running costs (team, support, licences) spread evenly across the days. Net benefit = cost avoided − running cost. The ratio is dollars avoided for each dollar spent. Months are calendar months, and the first and last may be part months.',
      sql: `WITH days AS (
  SELECT d.[Date],
         SUM(t.Completed * s.SavingPerTransaction) * p.Attribution AS CostAvoided
  FROM gold.CompletedTransactionsDaily t           -- one row per day and service
  JOIN ref.ServiceSaving s ON s.Service = t.Service -- from ref.ChannelCosts and ref.ChannelOtherwise
  JOIN dim.[Date] d        ON d.[Date] = t.[Date]
  CROSS JOIN ref.ProgrammeCosts p
  WHERE t.[Date] >= @From AND t.[Date] < @To
  GROUP BY d.[Date], p.Attribution)
SELECT FORMAT(d.[Date], 'yyyy-MM')                            AS [Month],
       SUM(d.CostAvoided)                                     AS CostAvoided,
       SUM(c.Cost)                                            AS AzureCost,
       COUNT(*) * MAX(p.OtherRunningPerMonth) * 12.0 / 365    AS OtherRunningCost,
       SUM(d.CostAvoided) - SUM(c.Cost)
         - COUNT(*) * MAX(p.OtherRunningPerMonth) * 12.0 / 365 AS NetBenefit
FROM days d
JOIN (SELECT UsageDate, SUM(Cost) AS Cost FROM silver.AzureCostDaily GROUP BY UsageDate) c
  ON c.UsageDate = d.[Date]
CROSS JOIN ref.ProgrammeCosts p
GROUP BY FORMAT(d.[Date], 'yyyy-MM')
ORDER BY [Month];`
    },
    render(h, d, s) {
      const c = d.current, p = d.previous;
      if (!c) { h.innerHTML = '<p class="empty">No data for this period.</p>'; return; }
      const ch = p ? change(c.net, p.net) : NaN, up = ch >= 0;
      h.innerHTML = `${platformNote(s)}<div class="figs four">
          <div class="fig lead"><b>${money(c.net)}</b><span>net benefit in the last ${s.range} days</span>
            ${Number.isFinite(ch) ? `<small><span aria-hidden="true">${up ? '▲' : '▼'}</span> ${up ? 'Up' : 'Down'} ${pct(Math.abs(ch))} on the previous ${s.range} days</small>` : ''}</div>
          <div class="fig"><b>${fmtMoney(c.avoided)}</b><span>cost avoided</span></div>
          <div class="fig"><b>${fmtMoney(c.cost)}</b><span>running cost (Azure ${fmtMoney(c.azure)})</span></div>
          <div class="fig"><b>$${c.ratio.toFixed(1)}</b><span>avoided for every $1 spent</span></div>
        </div>
        <h4 class="mini">By calendar month</h4><div></div>
        ${estimate(`Running cost is Azure spend plus ${fmtMoney(d.otherRunningPerMonth)} a month for the team, support and licences.${d.attribution < 1 ? ` Only ${pct(d.attribution, 0)} of app transactions are counted as moved from another channel.` : ''}`)}`;
      table(h.querySelector('.mini + div'),
        [{ h: 'Month' }, { h: 'Cost avoided', num: 1 }, { h: 'Azure', num: 1 }, { h: 'Other running', num: 1 }, { h: 'Net benefit', num: 1 }],
        d.months.map(m => [`${monthName(m.month)}${m.full ? '' : ` <small class="muted">(${m.days} days)</small>`}`,
          fmtMoney(m.avoided), fmtMoney(m.azure), fmtMoney(m.other), `<b>${money(m.net)}</b>`]),
        'Net benefit by calendar month');
    }
  },
{
    id: 'ITM-26', tab: 'value', span: 's7', view: 'vw_ChannelShift',
    title: 'Value delivered', sub: 'Transactions moved to the app from counters, phone and the website',
    build: {
      sources: ['Transactions', 'TransactionTypes', 'TransactionStatuses', 'ref.ChannelCosts', 'ext.ChannelVolumes (Service SA reporting)'],
      fields: 'TransactionTypeId, TransactionStatusId, CreatedAt; ChannelCosts.Channel, UnitCost; ChannelVolumes.Service, Channel, Transactions',
      logic: 'Completed app transactions per service × the share that would otherwise have used each channel × (that channel\'s unit cost − the app\'s unit cost). App share = app ÷ (app + other channels). Unit costs and "otherwise" shares are assumptions to agree with finance; other-channel volumes come from outside the app database.',
      sql: `WITH app AS (
  SELECT ty.Name AS Service, COUNT(*) AS AppCompleted
  FROM dbo.Transactions t
  JOIN dbo.TransactionTypes ty   ON ty.TransactionTypeId  = t.TransactionTypeId
  JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = t.TransactionStatusId
  WHERE s.Name = 'Completed' AND t.CreatedAt >= @From AND t.CreatedAt < @To
  GROUP BY ty.Name)
SELECT a.Service, a.AppCompleted,
       a.AppCompleted * o.CounterShare AS CounterVisitsAvoided,
       a.AppCompleted * o.PhoneShare   AS PhoneCallsAvoided,
       a.AppCompleted * (o.CounterShare * c.Counter + o.PhoneShare * c.Phone
                         + o.WebsiteShare * c.Website - c.App) AS CostAvoided,
       CAST(a.AppCompleted AS float) / (a.AppCompleted + v.OtherChannels) AS AppShare
FROM app a
JOIN ref.ChannelOtherwise o ON o.Service = a.Service
CROSS JOIN ref.ChannelCostsPivot c
JOIN (SELECT Service, SUM(Transactions) AS OtherChannels
      FROM ext.ChannelVolumes
      WHERE PeriodStart >= @From AND PeriodStart < @To
      GROUP BY Service) v ON v.Service = a.Service;`
    },
    render(h, d, s) {
      const t = d.totals, c = change(t.costAvoided, t.previousCostAvoided), cost = d.costPerTransaction;
      const hours = t.counterAvoided * (d.minutesSavedPerCounterVisit || 0) / 60;
      const up = c >= 0;
      h.innerHTML = `<div class="figs">
          <div class="fig lead"><b>${fmtMoney(t.costAvoided)}</b><span>estimated cost avoided</span>
            ${Number.isFinite(c) ? `<small><span aria-hidden="true">${up ? '▲' : '▼'}</span> ${up ? 'Up' : 'Down'} ${pct(Math.abs(c))} on the previous ${s.range} days</small>` : ''}</div>
          <div class="fig"><b>${fmtC(t.counterAvoided)}</b><span>counter visits avoided</span></div>
          <div class="fig"><b>${fmtC(t.phoneAvoided)}</b><span>phone calls avoided</span></div>
        </div>
        <h4 class="mini">Share of each service now done in the app</h4><div></div>
        <p class="note">${statusChip('info', 'Estimate')} Uses unit costs of $${cost.counter.toFixed(2)} at a counter, $${cost.phone.toFixed(2)} by phone, $${cost.website.toFixed(2)} on the website and $${cost.app.toFixed(2)} in the app${hours ? `, and saves customers about ${fmtC(hours)} hours of travel and waiting` : ''}. Change the assumptions in <code>data/mock/value.json</code>.</p>`;
      hbars(h.querySelector('.mini + div'), d.rows.map(r => ({
        label: r.label, sub: `${fmtC(r.appCompleted)} in the app, ${fmtMoney(r.costAvoided)} avoided`,
        parts: [{ name: 'In the app', value: r.appShare, text: pct(r.appShare, 0), color: 'var(--accent)' }, { name: 'Other channels', value: 1 - r.appShare, text: pct(1 - r.appShare, 0), color: 'var(--neutral)' }],
        text: pct(r.appShare, 0),
        go: { hash: 'journeys/ITM-08', set: { txType: r.key }, label: 'Open the completion funnel for this service' }
      })), legend([['In the app', 'var(--accent)'], ['Counter, phone and website', 'var(--neutral)']]), { max: 1 });
    }
  },
  {
    id: 'ITM-45', tab: 'value', span: 's5', view: 'vw_ChannelUnitCosts',
    title: 'Cost of one transaction, by channel', sub: 'Assumed unit costs, and the app as measured',
    build: {
      sources: ['ref.ChannelCosts', 'silver.AzureCostDaily', 'ref.ProgrammeCosts', 'Transactions', 'TransactionStatuses'],
      fields: 'ChannelCosts.Channel, UnitCost; AzureCostDaily.Cost; ProgrammeCosts.OtherRunningPerMonth; completed transactions',
      logic: 'Counter, phone, website and the app\'s assumed cost come from ref.ChannelCosts, which finance should own. The two measured app figures divide the period\'s Azure cost, and Azure plus other running costs, by completed app transactions. If the measured all-in cost is far from the assumed app cost, the estimate in ITM-26 should be revisited.',
      sql: `SELECT Channel, UnitCost, 'assumed' AS Basis FROM ref.ChannelCosts
UNION ALL
SELECT 'App, measured: Azure only', SUM(c.Cost) / NULLIF(SUM(t.Completed), 0), 'measured'
FROM gold.CompletedTransactionsDaily t
JOIN (SELECT UsageDate, SUM(Cost) AS Cost FROM silver.AzureCostDaily GROUP BY UsageDate) c
  ON c.UsageDate = t.[Date]
WHERE t.[Date] >= @From AND t.[Date] < @To;`
    },
    render(h, d, s) {
      const max = Math.max(...d.channels.map(c => c.cost));
      hbars(h, d.channels.map(c => ({
        label: c.label, value: c.cost, text: cents(c.cost),
        color: c.basis === 'measured' ? 'var(--accent2)' : 'var(--accent)'
      })), legend([['Assumed unit cost', 'var(--accent)'], ['Measured for this period', 'var(--accent2)']]) +
        `${platformNote(s)}${estimate(`Measured over ${fmt(d.completed)} completed app transactions in the last ${s.range} days.`)}`, { max });
    }
  },
  {
    id: 'ITM-44', tab: 'value', span: 's12', view: 'vw_ValueCumulative', global: false,
    title: 'Payback', sub: 'Running totals since the first day of data: cost avoided against build and running costs. Not affected by the filters.',
    build: {
      sources: VALUE_SOURCES,
      fields: 'Daily cost avoided and Azure cost (as in ITM-43); ProgrammeCosts.OneOffBuild, BuildDate, OtherRunningPerMonth',
      logic: 'Cost line = the one-off build cost on the first day, plus each day\'s Azure cost and other running costs. Avoided line = running total of daily cost avoided. The app has paid for itself from the day the avoided line crosses the cost line.',
      sql: `SELECT d.[Date],
       SUM(d.CostAvoided) OVER (ORDER BY d.[Date])                         AS CumulativeAvoided,
       p.OneOffBuild + SUM(c.Cost + p.OtherRunningPerMonth * 12.0 / 365)
                       OVER (ORDER BY d.[Date])                            AS CumulativeCost
FROM gold.ValueDaily d                  -- daily cost avoided, as in ITM-43
JOIN (SELECT UsageDate, SUM(Cost) AS Cost FROM silver.AzureCostDaily GROUP BY UsageDate) c
  ON c.UsageDate = d.[Date]
CROSS JOIN ref.ProgrammeCosts p
ORDER BY d.[Date];`
    },
    render(h, d) {
      const be = d.breakEven;
      h.innerHTML = `<div class="figs">
          <div class="fig lead"><b>${money(d.net)}</b><span>net position at ${dfmt(d.dates[d.dates.length - 1], true)}</span></div>
          <div class="fig"><b>${fmtMoney(d.oneOffBuild)}</b><span>one-off build cost</span></div>
          <div class="fig"><b>${be ? dfmt(be, true) : 'Not yet'}</b><span>${be ? 'paid for itself on' : 'paid for itself'}</span></div>
        </div><div></div>
        ${estimate(`The ${fmtMoney(d.oneOffBuild)} build cost is counted on the first day of data${d.buildDate ? ` (the build itself finished ${dfmt(d.buildDate, true)})` : ''}.`)}`;
      lineChart(h.querySelector('.figs + div'), {
        dates: d.dates, title: 'Cumulative cost avoided and cumulative cost',
        series: [{ name: 'Cost avoided', values: d.avoided, color: 'var(--accent)' }, { name: 'Build and running cost', values: d.cost, color: 'var(--accent2)' }],
        yFmt: fmtMoney, tipFmt: fmtMoney
      });
    }
  },
  {
    id: 'ITM-46', tab: 'value', span: 's12', view: 'vw_ValueInputs',
    title: 'What if the assumptions change?', sub: 'Move the sliders to test the cost avoided estimate. Nothing is saved.',
    build: {
      sources: ['Transactions', 'TransactionTypes', 'ref.ChannelCosts', 'ref.ChannelOtherwise'],
      fields: 'Completed app transactions per service for the period; channel unit costs; "otherwise" shares',
      logic: 'Recalculates ITM-26 in the browser with the unit costs and attribution set on the sliders: completed × Σ(otherwise share × channel cost) − completed × app cost, × attribution. The data view only supplies the completed counts and the stored assumptions.',
      sql: `SELECT ty.Name AS Service, COUNT(*) AS Completed,
       o.CounterShare, o.PhoneShare, o.WebsiteShare
FROM dbo.Transactions t
JOIN dbo.TransactionTypes ty   ON ty.TransactionTypeId  = t.TransactionTypeId
JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = t.TransactionStatusId
JOIN ref.ChannelOtherwise o    ON o.Service = ty.Name
WHERE s.Name = 'Completed' AND t.CreatedAt >= @From AND t.CreatedAt < @To
GROUP BY ty.Name, o.CounterShare, o.PhoneShare, o.WebsiteShare;`
    },
    render(h, d, s) {
      const base = { ...d.costPerTransaction, attribution: d.attribution };
      const id = 'wi' + Math.random().toString(36).slice(2, 7);
      const SL = [
        ['counter', 'Counter visit', 0, 40, 0.5, v => `$${v.toFixed(2)}`],
        ['phone', 'Phone call', 0, 25, 0.1, v => `$${v.toFixed(2)}`],
        ['website', 'Website transaction', 0, 5, 0.05, v => `$${v.toFixed(2)}`],
        ['app', 'App transaction', 0, 5, 0.05, v => `$${v.toFixed(2)}`],
        ['attribution', 'Share counted as moved from another channel', 0, 1, 0.05, v => pct(v, 0)]
      ];
      const calc = a => d.services.map(sv => {
        const o = sv.otherwise;
        const avoided = sv.completed * (o.counter * a.counter + o.phone * a.phone + o.website * a.website - a.app) * a.attribution;
        return { label: sv.label, avoided };
      });
      const baseTotal = calc(base).reduce((x, r) => x + r.avoided, 0);
      h.innerHTML = `${platformNote(s)}<div class="wi">
          <div class="wi-controls">${SL.map(([k, label, min, max, step, f]) => `
            <div class="wi-row"><label for="${id}-${k}">${label}</label>
              <input type="range" id="${id}-${k}" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${base[k]}">
              <output for="${id}-${k}" data-o="${k}">${f(base[k])}</output></div>`).join('')}
            <button type="button" class="wd-b" data-reset>Reset to the stored assumptions</button>
          </div>
          <div class="wi-out" aria-live="polite"></div>
        </div>
        ${estimate(`Uses ${fmt(d.services.reduce((x, r) => x + r.completed, 0))} completed app transactions in the last ${s.range} days.`)}`;
      const out = h.querySelector('.wi-out'), inputs = [...h.querySelectorAll('input[type=range]')];
      const draw = () => {
        const a = { ...base };
        inputs.forEach(i => { a[i.dataset.k] = +i.value; h.querySelector(`[data-o="${i.dataset.k}"]`).textContent = SL.find(x => x[0] === i.dataset.k)[5](+i.value); });
        const rows = calc(a), total = rows.reduce((x, r) => x + r.avoided, 0), diff = total - baseTotal;
        out.innerHTML = `<div class="figs one"><div class="fig lead"><b>${money(total)}</b><span>cost avoided in the last ${s.range} days with these settings</span>
            <small>${Math.abs(diff) < 1 ? 'Same as the stored assumptions' : `${diff > 0 ? 'Up' : 'Down'} ${fmtMoney(Math.abs(diff))} on the stored assumptions (${money(baseTotal)})`}</small></div></div>
          <div></div>`;
        hbars(out.lastElementChild, rows.map(r => ({ label: r.label, value: Math.max(0, r.avoided), text: money(r.avoided) })));
      };
      inputs.forEach(i => i.addEventListener('input', draw));
      h.querySelector('[data-reset]').addEventListener('click', () => { inputs.forEach(i => { i.value = base[i.dataset.k]; }); draw(); });
      draw();
    }
  }
];

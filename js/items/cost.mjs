/**
 * Cost tab: what the platform costs to run in Azure, and what that works out
 * to per transaction and per user.
 *
 * Cost comes from an Azure Cost Management export (actual cost, daily, AUD)
 * that a scheduled export writes to ADLS and a Fabric Lakehouse shortcut
 * exposes as bronze.AzureCostExport. A notebook keeps the latest row per day
 * and meter in silver.AzureCostDaily, which these views join to app metrics.
 *
 * Cost is not split by phone type, so every item here shows all platforms
 * and says so when a phone type is selected.
 */
import { kpi, lineChart, barChart, hbars, table } from '../ui/charts.mjs';
import { fmt, fmtC, fmtMoney, fmtCents, pct, dfmt, escapeHtml } from '../ui/format.mjs';
import { eventsFor } from '../ui/events.mjs';
import { evaluate, findTarget, statusChip } from '../ui/status.mjs';

const change = (c, p) => (p ? (c - p) / p : NaN);
const dollars = v => '$' + fmt(v);
const COST_SOURCES = ['silver.AzureCostDaily (Azure Cost Management export)'];
const COST_FIELDS = 'AzureCostDaily.UsageDate, ServiceName, Meter, Cost (AUD)';
const EXPORT_NOTE = 'Cost is the daily actual-cost export from Azure Cost Management, scoped to the platform\'s resource groups, written to ADLS each night and read through a Lakehouse shortcut. Azure can restate the last few days, so the load keeps the latest row per day and meter.';

/** Shown under an item when a phone type is selected */
const platformNote = s => (s.platform === 'all' ? '' : '<p class="note">Cost is not split by phone type, so this item shows all platforms.</p>');
const withNote = (h, s) => { const body = document.createElement('div'); h.innerHTML = ''; h.append(body); h.insertAdjacentHTML('beforeend', platformNote(s)); return body; };
const monthLabel = m => new Date(m + '-01T00:00:00').toLocaleDateString('en-AU', { month: 'short' });

const DAILY_CTE = `WITH cost AS (
  SELECT UsageDate AS Day, SUM(Cost) AS CostAud
  FROM silver.AzureCostDaily
  WHERE UsageDate >= @PrevFrom AND UsageDate < @To
  GROUP BY UsageDate)`;

const items = [
  {
    id: 'ITM-36', tab: 'cost', span: 's4', kind: 'kpi', view: 'vw_PlatformCost',
    title: 'Platform cost', sub: 'Azure cost of the app backend and analytics platform in the period, AUD',
    build: {
      sources: COST_SOURCES, fields: COST_FIELDS,
      logic: `Sum of Cost for the period, compared with the previous period. ${EXPORT_NOTE}`,
      sql: `-- bronze.AzureCostExport is the export as landed; silver keeps the latest row per day and meter.
SELECT SUM(CASE WHEN UsageDate >= @From THEN Cost END) AS CurrentCost,
       SUM(CASE WHEN UsageDate <  @From THEN Cost END) AS PreviousCost
FROM silver.AzureCostDaily
WHERE UsageDate >= @PrevFrom AND UsageDate < @To
  AND Currency = 'AUD';`
    },
    render(h, d, s) {
      const c = change(d.current, d.previous);
      kpi(withNote(h, s), { value: d.current, format: fmtMoney, delta: c, deltaText: pct(Math.abs(c)), goodUp: false, sparkData: d.daily, range: s.range });
    }
  },
  {
    id: 'ITM-37', tab: 'cost', span: 's4', kind: 'kpi', view: 'vw_CostPerTransaction', also: { targets: 'vw_Targets' },
    title: 'Cost per successful transaction', sub: 'Platform cost ÷ completed transactions in the period',
    build: {
      sources: [...COST_SOURCES, 'Transactions', 'TransactionStatuses', 'ref.Targets'],
      fields: `${COST_FIELDS}; Transactions.TransactionStatusId, CreatedAt; TransactionStatuses.Name`,
      logic: 'Total platform cost for the period ÷ transactions with status Completed in the same period. All platform cost is counted, including analytics, not only the cost of the transaction services. The target is a ceiling: at or below it is On track.',
      sql: `${DAILY_CTE},
done AS (
  SELECT CAST(t.CreatedAt AS date) AS Day, COUNT(*) AS Completed
  FROM dbo.Transactions t
  JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = t.TransactionStatusId
  WHERE s.Name = 'Completed' AND t.CreatedAt >= @PrevFrom AND t.CreatedAt < @To
  GROUP BY CAST(t.CreatedAt AS date))
SELECT CASE WHEN c.Day >= @From THEN 'Current' ELSE 'Previous' END AS Period,
       SUM(c.CostAud) / NULLIF(SUM(d.Completed), 0) AS CostPerCompletedTransaction
FROM cost c
LEFT JOIN done d ON d.Day = c.Day
GROUP BY CASE WHEN c.Day >= @From THEN 'Current' ELSE 'Previous' END;`
    },
    render(h, d, s, ctx, more) {
      const c = change(d.current, d.previous), t = findTarget(more.targets, 'costPerTransaction');
      kpi(withNote(h, s), { value: d.current, format: fmtCents, delta: c, deltaText: pct(Math.abs(c)), goodUp: false, sparkData: d.daily, range: s.range,
        evaluation: evaluate(t, { value: d.current }), sparkTarget: t ? t.target : undefined });
    }
  },
  {
    id: 'ITM-38', tab: 'cost', span: 's4', kind: 'kpi', view: 'vw_CostPerActiveUser', also: { targets: 'vw_Targets' },
    title: 'Cost per active user a day', sub: 'Average daily platform cost ÷ average daily active users',
    build: {
      sources: [...COST_SOURCES, 'UsageHistories', 'ref.Targets'],
      fields: `${COST_FIELDS}; UsageHistories.UserId, CreatedAt`,
      logic: 'Platform cost for the period ÷ the sum of daily active users over the same days, which is the cost of serving one active user for one day. Daily figures are used so the measure means the same thing for every period length.',
      sql: `${DAILY_CTE},
dau AS (
  SELECT CAST(CreatedAt AS date) AS Day, COUNT(DISTINCT UserId) AS ActiveUsers
  FROM dbo.UsageHistories
  WHERE CreatedAt >= @PrevFrom AND CreatedAt < @To
  GROUP BY CAST(CreatedAt AS date))
SELECT CASE WHEN c.Day >= @From THEN 'Current' ELSE 'Previous' END AS Period,
       SUM(c.CostAud) / NULLIF(SUM(u.ActiveUsers), 0) AS CostPerActiveUserDay
FROM cost c
LEFT JOIN dau u ON u.Day = c.Day
GROUP BY CASE WHEN c.Day >= @From THEN 'Current' ELSE 'Previous' END;`
    },
    render(h, d, s, ctx, more) {
      const c = change(d.current, d.previous), t = findTarget(more.targets, 'costPerActiveUser');
      kpi(withNote(h, s), { value: d.current, format: fmtCents, delta: c, deltaText: pct(Math.abs(c)), goodUp: false, sparkData: d.daily, range: s.range,
        evaluation: evaluate(t, { value: d.current }), sparkTarget: t ? t.target : undefined });
    }
  },
  {
    id: 'ITM-39', tab: 'cost', span: 's8', view: 'vw_CostPerTransactionDaily', also: { events: 'vw_Events', targets: 'vw_Targets' },
    title: 'Cost per successful transaction by day', sub: 'Daily platform cost ÷ completed transactions, against target and the previous period',
    build: {
      sources: [...COST_SOURCES, 'Transactions', 'TransactionStatuses', 'ref.Events', 'ref.Targets'],
      fields: `${COST_FIELDS}; Transactions.TransactionStatusId, CreatedAt; TransactionStatuses.Name`,
      logic: 'For each day, total platform cost ÷ transactions that completed that day. Most of the cost is fixed, so the figure rises on days with fewer completed transactions: weekends, and incidents such as an outage. The grey dashed line is the same day in the previous period. Events that affected transactions or cost are shaded.',
      sql: `${DAILY_CTE},
done AS (
  SELECT CAST(t.CreatedAt AS date) AS Day, COUNT(*) AS Completed
  FROM dbo.Transactions t
  JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = t.TransactionStatusId
  WHERE s.Name = 'Completed' AND t.CreatedAt >= @PrevFrom AND t.CreatedAt < @To
  GROUP BY CAST(t.CreatedAt AS date))
SELECT c.Day,
       CASE WHEN c.Day >= @From THEN 'Current' ELSE 'Previous' END AS Period,
       DATEDIFF(day, CASE WHEN c.Day >= @From THEN @From ELSE @PrevFrom END, c.Day) AS DayIndex,
       c.CostAud, d.Completed,
       c.CostAud / NULLIF(d.Completed, 0) AS CostPerCompletedTransaction
FROM cost c
LEFT JOIN done d ON d.Day = c.Day
ORDER BY c.Day;`
    },
    render(h, d, s, ctx, more) {
      const t = findTarget(more.targets, 'costPerTransaction');
      lineChart(withNote(h, s), {
        dates: d.dates, series: [{ name: 'This period', values: d.costPerTransaction, color: 'var(--accent)' }],
        compare: d.previous.length ? { name: `Previous ${s.range} days`, values: d.previous } : null,
        target: t ? { value: t.target, label: `Target ${fmtCents(t.target)} or less` } : null,
        events: eventsFor(more.events, ['transactions', 'cost']),
        zero: false, yFmt: fmtCents, tipFmt: fmtCents, title: 'Cost per successful transaction by day'
      });
    }
  },
  {
    id: 'ITM-40', tab: 'cost', span: 's4', view: 'vw_CostBudget', global: false,
    title: 'Monthly spend against budget', sub: 'Calendar months, with a run-rate forecast for the month in progress',
    build: {
      sources: [...COST_SOURCES, 'ref.CostBudgets'],
      fields: `${COST_FIELDS}; CostBudgets.BudgetMonth, BudgetAud`,
      logic: 'Cost per calendar month against that month\'s budget. For the month in progress, forecast = cost so far + average daily cost over the last 14 days × days left. The forecast is an estimate and takes no account of planned changes. Calendar months are used, so the period and platform filters do not apply.',
      sql: `WITH m AS (
  SELECT DATEFROMPARTS(YEAR(UsageDate), MONTH(UsageDate), 1) AS BudgetMonth,
         SUM(Cost) AS CostAud, MAX(UsageDate) AS LastDay
  FROM silver.AzureCostDaily
  WHERE UsageDate >= DATEADD(month, -5, DATEFROMPARTS(YEAR(@AsAt), MONTH(@AsAt), 1))
  GROUP BY DATEFROMPARTS(YEAR(UsageDate), MONTH(UsageDate), 1)),
run AS (
  SELECT SUM(Cost) / 14.0 AS DailyRunRate
  FROM silver.AzureCostDaily
  WHERE UsageDate > DATEADD(day, -14, @AsAt) AND UsageDate <= @AsAt)
SELECT m.BudgetMonth, m.CostAud, b.BudgetAud,
       CASE WHEN m.LastDay < EOMONTH(m.BudgetMonth)
            THEN m.CostAud + run.DailyRunRate * DATEDIFF(day, m.LastDay, EOMONTH(m.BudgetMonth))
       END AS ForecastAud
FROM m
CROSS JOIN run
LEFT JOIN ref.CostBudgets b ON b.BudgetMonth = m.BudgetMonth
ORDER BY m.BudgetMonth;`
    },
    render(h, d) {
      const c = d.current, left = c.daysInMonth - c.daysElapsed;
      h.innerHTML = `<div></div>
        <div class="figs cost-figs">
          <div class="fig lead"><b>${fmtMoney(c.forecast)}</b><span>forecast for ${monthLabel(c.month)}</span><small>${pct(c.forecast / (c.budget || 1), 0)} of the ${fmtMoney(c.budget)} budget</small></div>
          <div class="fig"><b>${fmtMoney(c.toDate)}</b><span>spent to ${dfmt(d.asAt)}</span></div>
        </div>
        <p class="note">${statusChip('info', 'Estimate')} Forecast = spent so far + the last ${c.runRateDays} days' average (${dollars(c.runRate)} a day) × ${left} days left. Budget and run-rate days are in <code>data/mock/cost-settings.json</code>.</p>`;
      barChart(h.firstElementChild, {
        labels: d.months.map(m => monthLabel(m.month) + (m.complete ? '' : ' to date')), values: d.months.map(m => m.cost),
        name: 'Cost (AUD)', title: 'Platform cost by calendar month, AUD',
        target: c.budget ? { value: c.budget, label: `Budget ${fmtMoney(c.budget)} a month` } : null
      });
    }
  },
  {
    id: 'ITM-41', tab: 'cost', span: 's6', view: 'vw_CostByService',
    title: 'Spend by service', sub: 'Azure services by cost in the period, with the change on the previous period',
    build: {
      sources: COST_SOURCES, fields: COST_FIELDS,
      logic: 'Cost per ServiceName for the period and the one before. Share is the service\'s part of the period total. Application Insights is billed under Log Analytics.',
      sql: `SELECT ServiceName,
       SUM(CASE WHEN UsageDate >= @From THEN Cost ELSE 0 END) AS CurrentCost,
       SUM(CASE WHEN UsageDate <  @From THEN Cost ELSE 0 END) AS PreviousCost,
       SUM(CASE WHEN UsageDate >= @From THEN Cost ELSE 0 END)
         / NULLIF(SUM(SUM(CASE WHEN UsageDate >= @From THEN Cost ELSE 0 END)) OVER (), 0) AS Share
FROM silver.AzureCostDaily
WHERE UsageDate >= @PrevFrom AND UsageDate < @To
GROUP BY ServiceName
ORDER BY CurrentCost DESC;`
    },
    render(h, d, s) {
      const total = d.reduce((a, r) => a + r.cost, 0);
      hbars(withNote(h, s), d.map(r => {
        const c = change(r.cost, r.previous);
        const moved = !Number.isFinite(c) ? 'no previous period' : Math.abs(c) < 0.0005 ? 'no change' : `${c > 0 ? 'up' : 'down'} ${pct(Math.abs(c))} on the previous ${s.range} days`;
        return { label: r.service, sub: `${pct(r.share, 0)} of spend, ${moved}`, value: r.cost, text: dollars(r.cost) };
      }), `<p class="stats"><span>Total <b>${dollars(total)}</b></span><span>${d.length} services</span></p>`);
    }
  },
  {
    id: 'ITM-42', tab: 'cost', span: 's6', view: 'vw_CostThresholdDays', also: { events: 'vw_Events' },
    title: 'Daily cost and days over threshold', sub: 'Total platform cost each day, and the days a set daily amount was passed',
    build: {
      sources: [...COST_SOURCES, 'ref.CostThresholds', 'ref.Events'],
      fields: `${COST_FIELDS}; CostThresholds.ServiceName (NULL = all services), DailyThresholdAud`,
      logic: 'Total cost per day against the all-services threshold. The table lists each day when the total, or a service with its own threshold, went above the amount set in ref.CostThresholds. Thresholds are fixed amounts set by the platform owner; nothing is detected statistically.',
      sql: `WITH d AS (
  SELECT UsageDate, ServiceName, SUM(Cost) AS CostAud
  FROM silver.AzureCostDaily
  WHERE UsageDate >= @From AND UsageDate < @To
  GROUP BY GROUPING SETS ((UsageDate, ServiceName), (UsageDate)))   -- ServiceName NULL = all services
SELECT d.UsageDate, COALESCE(d.ServiceName, 'All services') AS ServiceName,
       d.CostAud, t.DailyThresholdAud, d.CostAud - t.DailyThresholdAud AS OverBy
FROM d
JOIN ref.CostThresholds t
  ON (t.ServiceName = d.ServiceName OR (t.ServiceName IS NULL AND d.ServiceName IS NULL))
WHERE d.CostAud > t.DailyThresholdAud
ORDER BY d.UsageDate DESC;`
    },
    render(h, d, s, ctx, more) {
      const body = withNote(h, s), shown = d.flagged.slice(0, 8);
      body.innerHTML = `<div></div><h4 class="mini">Days over threshold: ${d.flagged.length}${d.flagged.length > shown.length ? `, latest ${shown.length} shown` : ''}</h4><div></div>`;
      lineChart(body.children[0], {
        dates: d.dates, series: [{ name: 'Cost a day', values: d.total, color: 'var(--accent)' }],
        target: d.totalThreshold ? { value: d.totalThreshold, label: `Threshold ${dollars(d.totalThreshold)} a day` } : null,
        events: eventsFor(more.events, ['cost']),
        zero: false, yFmt: v => '$' + fmtC(v), tipFmt: dollars, title: 'Total platform cost by day, AUD'
      });
      if (!shown.length) { body.children[2].innerHTML = '<p class="empty">No day in this period went over a threshold.</p>'; return; }
      table(body.children[2], [{ h: 'Day' }, { h: 'Service' }, { h: 'Cost', num: true }, { h: 'Threshold', num: true }, { h: 'Over by', num: true }],
        shown.map(r => [dfmt(r.date), escapeHtml(r.service), dollars(r.cost), dollars(r.threshold), dollars(r.cost - r.threshold)]),
        'Days when daily cost went over a threshold, newest first');
    }
  }
];

// The tab opens on the two cards that overlap the cover band, then the headline figures.
const ORDER = ['ITM-39', 'ITM-40', 'ITM-36', 'ITM-37', 'ITM-38', 'ITM-41', 'ITM-42'];
export default ORDER.map(id => items.find(i => i.id === id));

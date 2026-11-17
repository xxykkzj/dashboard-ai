/**
 * Overview tab: the leadership view.
 * Each item = { id, tab, span, title, sub, view, build, render }.
 *   view    name of the API view / Fabric SQL view the item reads
 *   also    extra views the item needs, e.g. { targets: 'vw_Targets' };
 *           their results arrive as the fifth argument of render
 *   kind    'hero' or 'kpi' changes the card's look
 *   build   what the "How it's built" panel shows
 *   render  draws the item from the view's response
 */
import { kpi, lineChart, barChart, hbars, legend, cohortGrid } from '../ui/charts.mjs';
import { fmt, fmtC, fmtMoney, pct, pctTidy, dfmt, dRange, escapeHtml } from '../ui/format.mjs';
import { eventsFor } from '../ui/events.mjs';
import { evaluate, findTarget, statusChip, statusIcon, STATUS } from '../ui/status.mjs';

const change = (c, p) => (p ? (c - p) / p : NaN);
const current = events => (events || []).filter(e => e.inPeriod === 'current');

const TARGETS_SQL = `-- Targets live in a small reference table that the business owner maintains.
SELECT MeasureKey, Basis, TargetValue, ActionValue
FROM ref.Targets;`;

export default [
  {
    id: 'ITM-00', tab: 'overview', span: 's12', kind: 'hero', view: 'vw_Scorecard',
    also: { targets: 'vw_Targets', events: 'vw_Events' },
    title: 'Performance against targets', sub: 'Each headline measure against its target and action level',
    params: (s, ctx) => ({ threshold: ctx.threshold }),
    build: {
      sources: ['UsageHistories', 'Users', 'Transactions', 'ValidationHistories', 'silver.LocationEvents', 'ref.Targets', 'ref.Events'],
      fields: 'One value per measure for the period (and the previous period where the target is growth); ref.Targets.Basis, TargetValue, ActionValue',
      logic: 'Each measure is read from its own item view so the figures match the cards below. Status is On track at or above the target, Action below the action level, Watch in between. The bar shows where the measure sits between the action level and the target. Events come from ref.Events.',
      sql: `SELECT t.MeasureKey, t.Basis, t.TargetValue, t.ActionValue, m.Value, m.PreviousValue
FROM ref.Targets t
JOIN (
  SELECT 'activeUsers' AS MeasureKey, ActiveUsers AS Value, ActiveUsersPrevious AS PreviousValue
    FROM dbo.fn_ActiveUsers(@From, @To, @PrevFrom, @Platform)
  UNION ALL SELECT 'newAccounts', NewAccounts, NewAccountsPrevious
    FROM dbo.fn_NewAccounts(@From, @To, @PrevFrom)
  UNION ALL SELECT 'transactionSuccess', SuccessRate, NULL
    FROM dbo.fn_TransactionSuccess(@From, @To, @Platform)
  UNION ALL SELECT 'credentialChecks', Checks, ChecksPrevious
    FROM dbo.fn_CredentialChecks(@From, @To, @PrevFrom)
  UNION ALL SELECT 'onboardingConversion', FirstTransaction * 1.0 / AccountCreated, NULL
    FROM dbo.fn_OnboardingFunnel(@From, @To)
  UNION ALL SELECT 'regionalReach', RegionalPer1000 / MetroPer1000, NULL
    FROM dbo.fn_UsageByGroup(@From, @To, @Platform)
) m ON m.MeasureKey = t.MeasureKey;`
    },
    render(h, d, s, ctx, more) {
      // daily-volume targets are set for all platforms together, so they are left out when one is selected
      const rows = (more.targets || []).filter(t => !(t.basis === 'perDay' && s.platform !== 'all')).map(t => {
        const m = d.measures[t.key]; if (!m) return null;
        const e = evaluate(t, { ...m, days: d.days }); if (!e) return null;
        const pos = t.target !== t.action ? (e.measured - t.action) / (t.target - t.action) : 1;   // 0 = action level, 1 = target
        return { label: t.label, ...e, p: Math.max(0.02, Math.min(1, (pos + 0.25) / 1.5)) };
      }).filter(Boolean);
      const count = k => rows.filter(r => r.status === k).length;
      const events = current(more.events);
      h.innerHTML = `<div class="brief">
        <div class="brief-lead">
          <dl class="tally">${['good', 'watch', 'action'].map(k => `<div class="tally-${k}"><dt>${statusIcon(k)}${STATUS[k].label}</dt><dd>${count(k)}</dd></div>`).join('')}</dl>
          <p class="brief-of">of ${rows.length} measures with a target</p>
          ${events.length ? `<h4 class="mini">Events in this period</h4>
          <ul class="evkey">${events.map(e => `<li><i class="ev-${e.kind}"></i><b>${escapeHtml(e.label)}</b>, ${dRange(e.from, e.to)}${e.note ? `. ${escapeHtml(e.note)}` : ''}</li>`).join('')}</ul>` : ''}
        </div>
        <div>
          <ul class="gauges" aria-label="Each measure against its target">${rows.map(x =>
            `<li class="gauge ${x.status}"><span class="g-name">${escapeHtml(x.label)}</span>${statusChip(x.status)}
              <span class="g-now">${escapeHtml(x.text)}, ${escapeHtml(x.now)}</span>
              <span class="g-bar" aria-hidden="true"><span class="g-fill" style="--p:${(x.p * 100).toFixed(1)}%"></span><i class="g-tick soft" style="--x:16.67%"></i><i class="g-tick" style="--x:83.33%"></i></span></li>`).join('')}</ul>
          <p class="g-key" aria-hidden="true"><span><i class="soft"></i>Action level</span><span><i></i>Target</span></p>
        </div>
      </div>`;
    }
  },
  {
    id: 'ITM-01', tab: 'overview', span: 's3', kind: 'kpi', view: 'vw_ActiveUsers', also: { targets: 'vw_Targets' },
    title: 'Active users', sub: 'People who used the app in the period',
    build: {
      sources: ['UsageHistories', 'UserDevices', 'ref.Targets'],
      fields: 'UsageHistories.UserId, UsageHistories.OccurredAt, UserDevices.Platform',
      logic: 'Distinct users with at least one usage event in the period. Platform comes from the device the event was logged on. Status compares growth on the previous period with the target.',
      sql: `SELECT COUNT(DISTINCT u.UserId) AS ActiveUsers
FROM dbo.UsageHistories u
JOIN dbo.UserDevices d ON d.DeviceId = u.DeviceId
WHERE u.OccurredAt >= @From AND u.OccurredAt < @To
  AND (@Platform IS NULL OR d.Platform = @Platform);`
    },
    render(h, d, s, ctx, more) {
      const c = change(d.current, d.previous);
      kpi(h, { value: d.current, format: fmtC, delta: c, deltaText: pct(Math.abs(c)), sparkData: d.daily, range: s.range,
        evaluation: evaluate(findTarget(more.targets, 'activeUsers'), d) });
    }
  },
  {
    id: 'ITM-02', tab: 'overview', span: 's3', kind: 'kpi', view: 'vw_NewAccounts', also: { targets: 'vw_Targets' },
    title: 'New accounts', sub: 'Accounts created in the period',
    build: {
      sources: ['Users', 'ref.Targets'],
      fields: 'Users.UserId, Users.CreatedAt',
      logic: 'Count of user rows created in the period. The platform split joins the first registered device. Status compares the daily average with the target; the dashed line on the small chart is that target.',
      sql: `SELECT CAST(CreatedAt AS date) AS Day, COUNT(*) AS NewAccounts
FROM dbo.Users
WHERE CreatedAt >= @From AND CreatedAt < @To
GROUP BY CAST(CreatedAt AS date);`
    },
    render(h, d, s, ctx, more) {
      const c = change(d.current, d.previous), t = s.platform === 'all' ? findTarget(more.targets, 'newAccounts') : null;
      kpi(h, { value: d.current, format: fmt, delta: c, deltaText: pct(Math.abs(c)), sparkData: d.daily, range: s.range,
        evaluation: evaluate(t, { ...d, days: d.daily.length }), sparkTarget: t ? t.target : undefined });
    }
  },
  {
    id: 'ITM-03', tab: 'overview', span: 's3', kind: 'kpi', view: 'vw_TransactionSuccess', also: { targets: 'vw_Targets' },
    title: 'Transaction success rate', sub: 'Completed as a share of finished transactions',
    build: {
      sources: ['Transactions', 'TransactionStatuses', 'ref.Targets'],
      fields: 'Transactions.TransactionStatusId, Transactions.CreatedAt, TransactionStatuses.Name',
      logic: 'Completed ÷ (Completed + Failed). Transactions still in progress are left out so open items do not drag the rate down. The dashed line on the small chart is the target.',
      sql: `SELECT CAST(SUM(CASE WHEN s.Name = 'Completed' THEN 1 ELSE 0 END) AS float)
     / NULLIF(SUM(CASE WHEN s.Name IN ('Completed','Failed') THEN 1 ELSE 0 END), 0) AS SuccessRate
FROM dbo.Transactions t
JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = t.TransactionStatusId
WHERE t.CreatedAt >= @From AND t.CreatedAt < @To;`
    },
    render(h, d, s, ctx, more) {
      const pts = (d.current - d.previous) * 100, t = findTarget(more.targets, 'transactionSuccess');
      kpi(h, { value: d.current, format: v => pct(v), delta: pts / 100, deltaText: Math.abs(pts).toFixed(1) + ' points', sparkData: d.daily, range: s.range,
        evaluation: evaluate(t, { value: d.current }), sparkTarget: t ? t.target : undefined });
    }
  },
  {
    id: 'ITM-04', tab: 'overview', span: 's3', kind: 'kpi', view: 'vw_CredentialChecks', also: { targets: 'vw_Targets' },
    title: 'Credential checks', sub: 'Times a digital credential was verified',
    build: {
      sources: ['ValidationHistories', 'Credentials', 'ref.Targets'],
      fields: 'ValidationHistories.ValidationId, ValidationHistories.ValidatedAt',
      logic: 'Every verification (QR scan, venue scanner or online check) counts once. Status compares the daily average with the target.',
      sql: `SELECT COUNT(*) AS CredentialChecks
FROM dbo.ValidationHistories
WHERE ValidatedAt >= @From AND ValidatedAt < @To;`
    },
    render(h, d, s, ctx, more) {
      const c = change(d.current, d.previous), t = s.platform === 'all' ? findTarget(more.targets, 'credentialChecks') : null;
      kpi(h, { value: d.current, format: fmtC, delta: c, deltaText: pct(Math.abs(c)), sparkData: d.daily, range: s.range,
        evaluation: evaluate(t, { ...d, days: d.daily.length }), sparkTarget: t ? t.target : undefined });
    }
  },
  {
    id: 'ITM-05', tab: 'overview', span: 's8', view: 'vw_DailyActiveUsersByPlatform', also: { events: 'vw_Events' },
    title: 'Daily active users', sub: 'People using the app each day, by phone type',
    build: {
      sources: ['UsageHistories', 'UserDevices', 'ref.Events'],
      fields: 'UsageHistories.UserId, UsageHistories.OccurredAt, UserDevices.Platform',
      logic: 'Distinct users per day, split by platform. Campaigns and incidents from ref.Events are shaded on the chart.',
      sql: `SELECT CAST(u.OccurredAt AS date) AS Day, d.Platform,
       COUNT(DISTINCT u.UserId) AS DailyActiveUsers
FROM dbo.UsageHistories u
JOIN dbo.UserDevices d ON d.DeviceId = u.DeviceId
WHERE u.OccurredAt >= @From AND u.OccurredAt < @To
GROUP BY CAST(u.OccurredAt AS date), d.Platform;`
    },
    render(h, d, s, ctx, more) {
      const both = d.ios && d.android;
      const series = [];
      if (d.ios) series.push({ name: 'iPhone', values: d.ios, color: 'var(--accent)' });
      if (d.android) series.push({ name: 'Android', values: d.android, color: both ? 'var(--accent2)' : 'var(--accent)' });
      lineChart(h, { dates: d.dates, series, title: 'Daily active users', events: eventsFor(more.events, ['active-users']) });
    }
  },
  {
    id: 'ITM-06', tab: 'overview', span: 's4', view: 'vw_NewAccountsByWeek', also: { events: 'vw_Events', targets: 'vw_Targets' },
    title: 'New accounts per week', sub: 'Full weeks only, so a part week never looks like a dip',
    build: {
      sources: ['Users', 'ref.Events', 'ref.Targets'],
      fields: 'Users.CreatedAt',
      logic: 'Accounts grouped into full weeks counting back from the latest day. Shown per day for 7-day periods. The dashed line is the daily target multiplied by seven.',
      sql: `SELECT DATEADD(day, -((DATEPART(weekday, CreatedAt) + @@DATEFIRST - 2) % 7),
               CAST(CreatedAt AS date)) AS WeekStarting,
       COUNT(*) AS NewAccounts
FROM dbo.Users
WHERE CreatedAt >= @From AND CreatedAt < @To
GROUP BY DATEADD(day, -((DATEPART(weekday, CreatedAt) + @@DATEFIRST - 2) % 7),
                 CAST(CreatedAt AS date));`
    },
    render(h, d, s, ctx, more) {
      const t = s.platform === 'all' ? findTarget(more.targets, 'newAccounts') : null, span = d.daily ? 1 : 7;
      barChart(h, {
        labels: d.labels.map(x => dfmt(x)), values: d.values, name: 'New accounts', dates: d.labels, spanDays: span,
        title: d.daily ? 'New accounts per day' : 'New accounts per week, by week starting',
        target: t && t.basis === 'perDay' ? { value: t.target * span, label: `Target ${fmt(t.target * span)}` } : null,
        events: eventsFor(more.events, ['new-accounts'])
      });
    }
  },
  {
    id: 'ITM-29', tab: 'overview', span: 's12', view: 'vw_RetentionCohorts', global: false,
    title: 'Retention by sign-up week', sub: 'Share of each week\'s new accounts still using the app in the weeks after. Not affected by the filters.',
    build: {
      sources: ['Users', 'UsageHistories'],
      fields: 'Users.UserId, Users.CreatedAt; UsageHistories.UserId, OccurredAt',
      logic: 'Accounts are grouped by the week they were created. For each later week, count the accounts with at least one usage event in that week and divide by the cohort size. The newest cohorts have fewer weeks.',
      sql: `WITH cohort AS (
  SELECT UserId, DATEADD(day, -((DATEPART(weekday, CreatedAt) + @@DATEFIRST - 2) % 7),
                         CAST(CreatedAt AS date)) AS CohortWeek
  FROM dbo.Users
  WHERE CreatedAt >= DATEADD(week, -10, @To)),
active AS (
  SELECT DISTINCT c.CohortWeek, c.UserId,
         DATEDIFF(day, c.CohortWeek, CAST(u.OccurredAt AS date)) / 7 AS WeekNumber
  FROM cohort c
  JOIN dbo.UsageHistories u ON u.UserId = c.UserId AND u.OccurredAt >= c.CohortWeek)
SELECT a.CohortWeek, a.WeekNumber,
       COUNT(*) * 1.0 / s.CohortSize AS Retained, s.CohortSize
FROM active a
JOIN (SELECT CohortWeek, COUNT(*) AS CohortSize FROM cohort GROUP BY CohortWeek) s
  ON s.CohortWeek = a.CohortWeek
GROUP BY a.CohortWeek, a.WeekNumber, s.CohortSize
ORDER BY a.CohortWeek, a.WeekNumber;`
    },
    render: (h, d) => cohortGrid(h, d)
  },
  {
    id: 'ITM-28', tab: 'overview', span: 's6', view: 'vw_TransactionSuccessDaily', also: { events: 'vw_Events', targets: 'vw_Targets' },
    title: 'Transaction success by day', sub: 'Share of finished transactions that completed, against target and the previous period',
    build: {
      sources: ['Transactions', 'TransactionStatuses', 'ref.Events', 'ref.Targets'],
      fields: 'Transactions.TransactionStatusId, Transactions.CreatedAt, TransactionStatuses.Name',
      logic: 'Daily success rate for the period. The grey dashed line is the same day in the previous period (DayIndex lines the two periods up). Incidents from ref.Events are shaded.',
      sql: `WITH d AS (
  SELECT CAST(t.CreatedAt AS date) AS Day,
         SUM(CASE WHEN s.Name = 'Completed' THEN 1 ELSE 0 END) AS Completed,
         SUM(CASE WHEN s.Name IN ('Completed','Failed') THEN 1 ELSE 0 END) AS Finished
  FROM dbo.Transactions t
  JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = t.TransactionStatusId
  WHERE t.CreatedAt >= @PrevFrom AND t.CreatedAt < @To
  GROUP BY CAST(t.CreatedAt AS date))
SELECT Day,
       CASE WHEN Day >= @From THEN 'Current' ELSE 'Previous' END AS Period,
       DATEDIFF(day, CASE WHEN Day >= @From THEN @From ELSE @PrevFrom END, Day) AS DayIndex,
       Finished, Finished - Completed AS Failed,
       CAST(Completed AS float) / NULLIF(Finished, 0) AS SuccessRate
FROM d;`
    },
    render(h, d, s, ctx, more) {
      const t = findTarget(more.targets, 'transactionSuccess');
      lineChart(h, {
        dates: d.dates, series: [{ name: 'This period', values: d.rate, color: 'var(--accent)' }],
        compare: d.previousRate.length ? { name: `Previous ${s.range} days`, values: d.previousRate } : null,
        target: t ? { value: t.target, label: `Target ${pctTidy(t.target)}` } : null,
        events: eventsFor(more.events, ['transactions']),
        zero: false, yFmt: v => pctTidy(v), tipFmt: v => pct(v), title: 'Transaction success rate by day'
      });
    }
  }
];

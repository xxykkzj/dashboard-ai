/** Service health tab: availability, failures, app versions, notifications. */
import { hbars, lineChart, table, legend, meter, spark } from '../ui/charts.mjs';
import { fmt, pct, pctTidy, sum, dfmt, escapeHtml } from '../ui/format.mjs';

const STATUS_TEXT = { up: 'Operational', degraded: 'Degraded', down: 'Outage' };

export default [
  {
    id: 'ITM-18', tab: 'health', span: 's12', view: 'vw_ProviderAvailability',
    title: 'Backend availability', sub: 'Last 30 days, one cell per day. Not affected by the filters.',
    global: false,     // ignores the period and platform filters
    build: {
      sources: ['PortalStatuses', 'ServiceProviders'],
      fields: 'PortalStatuses.Status, CheckedAt, ServiceProviderId',
      logic: 'Worst status recorded each day per provider. Uptime = minutes not lost to outages ÷ minutes in the period.',
      sql: `SELECT sp.Name AS Provider, CAST(ps.CheckedAt AS date) AS Day,
       MAX(CASE ps.Status WHEN 'Down' THEN 2 WHEN 'Degraded' THEN 1 ELSE 0 END) AS WorstStatus
FROM dbo.PortalStatuses ps
JOIN dbo.ServiceProviders sp ON sp.ServiceProviderId = ps.ServiceProviderId
WHERE ps.CheckedAt >= DATEADD(day, -30, SYSUTCDATETIME())
GROUP BY sp.Name, CAST(ps.CheckedAt AS date);`
    },
    render(h, d) {
      h.innerHTML = `<div class="status">${d.map(p => {
        const issues = p.days.filter(x => x.status !== 'up');
        const label = `${p.name}: ${pct(p.uptime, 2)} uptime. ` + (issues.length
          ? issues.map(x => `${STATUS_TEXT[x.status]} on ${dfmt(x.date)}`).join(', ')
          : 'No incidents.');
        return `<div class="srow"><div>${escapeHtml(p.name)}<small>${escapeHtml(p.description)}</small></div>
          <div class="strip" role="img" aria-label="${escapeHtml(label)}">${p.days.map(x =>
            `<i class="${x.status === 'up' ? '' : x.status}" title="${dfmt(x.date)}: ${STATUS_TEXT[x.status] || x.status}"></i>`).join('')}</div>
          <div class="sup">${pct(p.uptime, 2)}</div></div>`;
      }).join('')}</div><div class="legend"><span><i class="s-up"></i>Operational</span><span><i class="s-degraded"></i>Degraded (half bar)</span><span><i class="s-down"></i>Outage (full bar)</span></div>`;
    }
  },
  {
    id: 'ITM-33', tab: 'health', span: 's12', view: 'vw_ProviderPerformance', global: false,
    title: 'Backend response times', sub: 'Calls from the app to each backend over the last 30 days. Not affected by the filters.',
    build: {
      sources: ['PortalStatuses', 'ServiceProviders'],
      fields: 'PortalStatuses.ServiceProviderId, CheckedAt, ResponseMs (assumed), IsError (assumed)',
      logic: 'Median and 95th-percentile response time and the share of calls that returned an error, per provider. The small chart is the daily median. If PortalStatuses holds only a status, take timings from the integration log or Application Insights instead.',
      sql: `SELECT DISTINCT sp.Name AS Provider,
       PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY ps.ResponseMs) OVER (PARTITION BY sp.Name) AS MedianMs,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ps.ResponseMs) OVER (PARTITION BY sp.Name) AS P95Ms,
       AVG(CASE WHEN ps.IsError = 1 THEN 1.0 ELSE 0 END) OVER (PARTITION BY sp.Name) AS ErrorRate
FROM dbo.PortalStatuses ps
JOIN dbo.ServiceProviders sp ON sp.ServiceProviderId = ps.ServiceProviderId
WHERE ps.CheckedAt >= DATEADD(day, -30, SYSUTCDATETIME());
-- Daily median for the small chart: same query grouped by CAST(ps.CheckedAt AS date).`
    },
    render: (h, d) => table(h,
      [{ h: 'Backend' }, { h: 'Median response', num: 1 }, { h: '95th percentile', num: 1 }, { h: 'Error rate', num: 1 }, { h: 'Slowest day', num: 1 }, { h: 'Daily median, 30 days' }],
      d.map(r => [escapeHtml(r.name), `${fmt(r.medianMs)} ms`, `${fmt(r.p95Ms)} ms`, pct(r.errorRate, 2), `${dfmt(r.worstDay.date)}, ${fmt(r.worstDay.medianMs)} ms`,
        `<span class="tspark">${spark(r.daily)}</span><span class="sr-only">Lowest ${fmt(Math.min(...r.daily))} ms, highest ${fmt(Math.max(...r.daily))} ms</span>`]),
      'Response time and error rate by backend, last 30 days')
  },
  {
    id: 'ITM-19', tab: 'health', span: 's8', view: 'vw_FailedTransactionsDaily', also: { events: 'vw_Events' },
    title: 'Failed transactions per day', sub: 'Known incidents are shaded',
    build: {
      sources: ['Transactions', 'TransactionStatuses'],
      fields: 'TransactionStatusId, CreatedAt',
      logic: 'Failed transactions per day. Incidents from ref.Events are shaded.',
      sql: `SELECT CAST(t.CreatedAt AS date) AS Day, COUNT(*) AS Failed
FROM dbo.Transactions t
JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = t.TransactionStatusId
WHERE s.Name = 'Failed'
  AND t.CreatedAt >= @From AND t.CreatedAt < @To
GROUP BY CAST(t.CreatedAt AS date);`
    },
    render(h, d, s, ctx, more) {
      const mx = Math.max(...d.failed), at = d.dates[d.failed.indexOf(mx)];
      h.innerHTML = `<div class="stats"><span>Total <b>${fmt(sum(d.failed))}</b></span><span>Worst day <b>${at ? dfmt(at) : 'none'}, ${fmt(mx)} failed</b></span></div><div></div>`;
      lineChart(h.lastElementChild, { dates: d.dates, series: [{ name: 'Failed', values: d.failed, color: 'var(--accent)' }], title: 'Failed transactions per day',
        events: (more.events || []).filter(e => e.inPeriod === 'current' && e.kind === 'incident') });
    }
  },
  {
    id: 'ITM-20', tab: 'health', span: 's4', view: 'vw_AppVersions',
    title: 'App versions in use', sub: 'Devices seen in the period',
    build: {
      sources: ['UserDevices'],
      fields: 'UserDevices.AppVersion, LastSeenAt, Platform',
      logic: 'Devices active in the period grouped by app version.',
      sql: `SELECT AppVersion, COUNT(*) AS Devices
FROM dbo.UserDevices
WHERE LastSeenAt >= @From AND LastSeenAt < @To
  AND (@Platform IS NULL OR Platform = @Platform)
GROUP BY AppVersion
ORDER BY Devices DESC;`
    },
    render: (h, d) => hbars(h, d.map(r => ({ label: r.version, value: r.devices, text: pct(r.share, 0) })))
  },
  {
    id: 'ITM-34', tab: 'health', span: 's8', view: 'vw_AppVersionAdoption', global: false,
    title: 'Uptake of the newest app version', sub: 'Share of active devices on the newest version, each day since release. Not affected by the filters.',
    build: {
      sources: ['UserDevices', 'UserDevicesHistory (temporal)'],
      fields: 'UserDevices.AppVersion, Platform, LastSeenAt, ValidFrom, ValidTo',
      logic: 'UserDevices is system-versioned, so FOR SYSTEM_TIME AS OF gives each device\'s version on each day. Share = devices on the newest version ÷ devices seen in the previous 7 days, per platform.',
      sql: `SELECT d.Day, ud.Platform,
       SUM(CASE WHEN ud.AppVersion = @NewestVersion THEN 1.0 ELSE 0 END) / COUNT(*) AS ShareOnNewest
FROM ref.Calendar d
CROSS APPLY (
  SELECT DeviceId, Platform, AppVersion
  FROM dbo.UserDevices FOR SYSTEM_TIME AS OF DATEADD(day, 1, d.Day)
  WHERE LastSeenAt >= DATEADD(day, -7, d.Day)) ud
WHERE d.Day >= @ReleaseDate AND d.Day < @To
GROUP BY d.Day, ud.Platform
ORDER BY d.Day;`
    },
    render(h, d) {
      const n = d.dates.length - 1;
      h.innerHTML = `<div class="stats"><span>Version <b>${escapeHtml(d.version)}</b>, released <b>${dfmt(d.released, true)}</b></span><span>iPhone now <b>${pct(d.ios[n], 0)}</b></span><span>Android now <b>${pct(d.android[n], 0)}</b></span></div><div></div>`;
      lineChart(h.lastElementChild, { dates: d.dates, series: [{ name: 'iPhone', values: d.ios, color: 'var(--accent)' }, { name: 'Android', values: d.android, color: 'var(--accent2)' }],
        yFmt: v => pctTidy(v), tipFmt: v => pct(v, 0), title: `Share of active devices on version ${d.version}` });
    }
  },
  {
    id: 'ITM-35', tab: 'health', span: 's4', view: 'vw_NotificationSettings',
    title: 'Notification settings', sub: 'Share of active users with each setting switched on',
    build: {
      sources: ['UserConfigurations', 'UserDevices', 'UsageHistories'],
      fields: 'UserConfigurations.UserId, SettingKey, SettingValue (assumed); UserDevices.Platform',
      logic: 'Users active in the period with each setting on ÷ all users active in the period. Only on or off is read; no other configuration values leave the database.',
      sql: `WITH active AS (
  SELECT DISTINCT u.UserId
  FROM dbo.UsageHistories u
  JOIN dbo.UserDevices d ON d.DeviceId = u.DeviceId
  WHERE u.OccurredAt >= @From AND u.OccurredAt < @To
    AND (@Platform IS NULL OR d.Platform = @Platform))
SELECT c.SettingKey,
       COUNT(DISTINCT CASE WHEN c.SettingValue = 'true' THEN c.UserId END) * 1.0
         / (SELECT COUNT(*) FROM active) AS ShareOn
FROM dbo.UserConfigurations c
JOIN active a ON a.UserId = c.UserId
WHERE c.SettingKey LIKE 'Notifications.%'
GROUP BY c.SettingKey;`
    },
    render: (h, d, s) => hbars(h, d.map(r => ({ label: r.label, value: r.share, text: pct(r.share, 0),
      sub: s.platform === 'all' ? `iPhone ${pct(r.ios, 0)}, Android ${pct(r.android, 0)}` : '' })), '', { max: 1 })
  },
  {
    id: 'ITM-21', tab: 'health', span: 's12', view: 'vw_NotificationPerformance',
    title: 'Notification performance', sub: 'Delivery, opens and follow-up action by notification type',
    build: {
      sources: ['Notifications'],
      fields: 'Type, SentAt, DeliveredAt, OpenedAt, ActionTakenAt (assumed)',
      logic: 'Rates are shares of notifications sent. "Acted" means the person went on to the linked service.',
      sql: `SELECT Type,
       COUNT(*) AS Sent,
       CAST(COUNT(DeliveredAt)   AS float) / COUNT(*) AS DeliveredRate,
       CAST(COUNT(OpenedAt)      AS float) / COUNT(*) AS OpenedRate,
       CAST(COUNT(ActionTakenAt) AS float) / COUNT(*) AS ActedRate
FROM dbo.Notifications
WHERE SentAt >= @From AND SentAt < @To
GROUP BY Type
ORDER BY Sent DESC;`
    },
    render: (h, d) => table(h,
      [{ h: 'Type' }, { h: 'Sent', num: 1 }, { h: 'Delivered', num: 1 }, { h: 'Opened', num: 1 }, { h: 'Acted', num: 1 }],
      d.map(r => [escapeHtml(r.type), fmt(r.sent), meter(r.delivered), meter(r.opened), meter(r.acted)]),
      'Notification performance by type')
  }
];

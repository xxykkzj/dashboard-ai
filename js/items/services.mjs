/** Services tab: credentials, transactions, payments and renewals. Fuel exemption items are parked (CONFIG.features). */
import { hbars, lineChart, barChart, table, legend, meter } from '../ui/charts.mjs';
import { fmt, fmtC, fmtMoney, pct, sum, avg, dfmt, escapeHtml } from '../ui/format.mjs';
import { selectControl } from '../ui/card.mjs';
import { TX_OPTIONS } from './journeys.mjs';

export default [
  {
    id: 'ITM-12', tab: 'services', span: 's6', view: 'vw_CredentialsByType',
    title: 'Active credentials by type', sub: 'Snapshot today, with additions in the period',
    build: {
      sources: ['Credentials', 'CredentialTypes', 'CredentialProviders'],
      fields: 'Credentials.Status, Credentials.AddedAt, Credentials.ExpiresAt, CredentialTypes.Name',
      logic: 'Active = status Active and not yet expired. "Added" counts rows with AddedAt inside the period.',
      sql: `SELECT ct.Name AS CredentialType,
       SUM(CASE WHEN c.Status = 'Active' AND c.ExpiresAt > SYSUTCDATETIME() THEN 1 ELSE 0 END) AS Active,
       SUM(CASE WHEN c.AddedAt >= @From AND c.AddedAt < @To THEN 1 ELSE 0 END) AS AddedInPeriod
FROM dbo.Credentials c
JOIN dbo.CredentialTypes ct ON ct.CredentialTypeId = c.CredentialTypeId
GROUP BY ct.Name
ORDER BY Active DESC;`
    },
    render: (h, d) => hbars(h, d.map(r => ({ label: r.label, value: r.active, sub: '+' + fmt(r.added) + ' added' })))
  },
  {
    id: 'ITM-13', tab: 'services', span: 's6', view: 'vw_TransactionsByType',
    title: 'Transactions by service', sub: 'Completed and failed, with the success rate. Select a service to open its completion funnel.',
    build: {
      sources: ['Transactions', 'TransactionTypes', 'TransactionStatuses'],
      fields: 'TransactionTypeId, TransactionStatusId, CreatedAt',
      logic: 'Finished transactions grouped by type and outcome. The figure on the right is the success rate.',
      sql: `SELECT ty.Name AS Service,
       SUM(CASE WHEN s.Name = 'Completed' THEN 1 ELSE 0 END) AS Completed,
       SUM(CASE WHEN s.Name = 'Failed'    THEN 1 ELSE 0 END) AS Failed
FROM dbo.Transactions t
JOIN dbo.TransactionTypes ty   ON ty.TransactionTypeId  = t.TransactionTypeId
JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = t.TransactionStatusId
WHERE t.CreatedAt >= @From AND t.CreatedAt < @To
GROUP BY ty.Name;`
    },
    render: (h, d) => hbars(h, d.map(r => ({
      label: r.label, sub: fmt(r.finished) + ' finished',
      parts: [{ name: 'Completed', value: r.completed, color: 'var(--accent)' }, { name: 'Failed', value: r.failed, color: 'var(--bad)' }],
      text: pct(r.finished ? r.completed / r.finished : 0),
      go: { hash: 'journeys/ITM-08', set: { txType: r.key }, label: 'Open the completion funnel for this service' }
    })), legend([['Completed', 'var(--accent)'], ['Failed', 'var(--bad)']]))
  },
  {
    id: 'ITM-31', tab: 'services', span: 's8', view: 'vw_TransactionDuration',
    title: 'Time to complete a transaction', sub: 'Completed transactions by how long they took from start to finish',
    deps: ['txType'],
    params: s => ({ txType: s.txType }),
    control: s => selectControl('txType', 'Service', TX_OPTIONS, s.txType),
    build: {
      sources: ['Transactions', 'TransactionTypes', 'TransactionStatuses'],
      fields: 'Transactions.CreatedAt, CompletedAt, TransactionTypeId, TransactionStatusId',
      logic: 'Seconds between CreatedAt and CompletedAt for completed transactions of the selected service, grouped into time bands. The median uses PERCENTILE_CONT.',
      sql: `WITH t AS (
  SELECT DATEDIFF(second, t.CreatedAt, t.CompletedAt) AS Seconds
  FROM dbo.Transactions t
  JOIN dbo.TransactionTypes ty   ON ty.TransactionTypeId  = t.TransactionTypeId
  JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = t.TransactionStatusId
  WHERE s.Name = 'Completed' AND ty.Name = @TransactionType
    AND t.CreatedAt >= @From AND t.CreatedAt < @To)
SELECT CASE WHEN Seconds < 60  THEN 'Under 1 min' WHEN Seconds < 120 THEN '1–2 min'
            WHEN Seconds < 180 THEN '2–3 min'     WHEN Seconds < 300 THEN '3–5 min'
            WHEN Seconds < 600 THEN '5–10 min'    ELSE 'Over 10 min' END AS Band,
       COUNT(*) AS Transactions,
       MAX(m.MedianSeconds) AS MedianSeconds
FROM t
CROSS JOIN (SELECT DISTINCT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY Seconds) OVER () AS MedianSeconds FROM t) m
GROUP BY CASE WHEN Seconds < 60  THEN 'Under 1 min' WHEN Seconds < 120 THEN '1–2 min'
              WHEN Seconds < 180 THEN '2–3 min'     WHEN Seconds < 300 THEN '3–5 min'
              WHEN Seconds < 600 THEN '5–10 min'    ELSE 'Over 10 min' END;`
    },
    render(h, d) {
      const m = Math.round(d.medianSeconds), under3 = sum(d.bands.slice(0, 3).map(b => b.share));
      h.innerHTML = `<div class="stats"><span>Median <b>${Math.floor(m / 60)} min ${m % 60} sec</b></span><span>Under 3 minutes <b>${pct(under3, 0)}</b></span></div><div></div>`;
      barChart(h.lastElementChild, { labels: d.bands.map(b => b.label), values: d.bands.map(b => b.transactions), name: 'Completed transactions', title: 'Completed transactions by time taken' });
    }
  },
  {
    id: 'ITM-32', tab: 'services', span: 's4', view: 'vw_PaymentsByService',
    title: 'Payments collected', sub: 'Value of payments made in the app, by service',
    build: {
      sources: ['Transactions', 'TransactionTypes', 'TransactionStatuses'],
      fields: 'Transactions.Amount, TransactionTypeId, TransactionStatusId, CreatedAt',
      logic: 'Sum and average of Amount for completed transactions. Services with no fee show as no payment.',
      sql: `SELECT ty.Name AS Service,
       COUNT(CASE WHEN t.Amount > 0 THEN 1 END) AS Payments,
       SUM(t.Amount) AS TotalAmount,
       AVG(NULLIF(t.Amount, 0)) AS AverageAmount
FROM dbo.Transactions t
JOIN dbo.TransactionTypes ty   ON ty.TransactionTypeId  = t.TransactionTypeId
JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = t.TransactionStatusId
WHERE s.Name = 'Completed' AND t.CreatedAt >= @From AND t.CreatedAt < @To
GROUP BY ty.Name
ORDER BY TotalAmount DESC;`
    },
    render(h, d) {
      const paid = d.filter(r => r.totalAmount > 0).sort((a, b) => b.totalAmount - a.totalAmount), free = d.filter(r => !r.totalAmount);
      const total = sum(paid.map(r => r.totalAmount));
      h.innerHTML = `<div class="figs one"><div class="fig lead"><b>${fmtMoney(total)}</b><span>collected from ${fmtC(sum(paid.map(r => r.payments)))} payments</span></div></div><div></div>
        ${free.length ? `<p class="note">No fee: ${free.map(r => escapeHtml(r.label)).join(', ')}.</p>` : ''}`;
      hbars(h.querySelector('.figs + div'), paid.map(r => ({ label: r.label, sub: `average $${r.averageAmount.toFixed(2)}`, value: r.totalAmount, text: fmtMoney(r.totalAmount) })));
    }
  },
  {
    id: 'ITM-14', tab: 'services', span: 's8', view: 'vw_CredentialChecksDaily',
    title: 'Credential checks per day', sub: 'Checks each day, with the total and the share that failed',
    build: {
      sources: ['ValidationHistories'],
      fields: 'ValidatedAt, Result',
      logic: 'Checks per day. Failure rate = checks where Result is not Valid ÷ all checks.',
      sql: `SELECT CAST(ValidatedAt AS date) AS Day,
       COUNT(*) AS Checks,
       SUM(CASE WHEN Result <> 'Valid' THEN 1 ELSE 0 END) AS FailedChecks
FROM dbo.ValidationHistories
WHERE ValidatedAt >= @From AND ValidatedAt < @To
GROUP BY CAST(ValidatedAt AS date);`
    },
    render(h, d) {
      h.innerHTML = `<div class="stats"><span>Total <b>${fmt(sum(d.checks))}</b></span><span>Daily average <b>${fmt(avg(d.checks))}</b></span>
        <span>Failed <b>${pct(sum(d.failed) / (sum(d.checks) || 1))}</b></span></div><div></div>`;
      lineChart(h.lastElementChild, { dates: d.dates, series: [{ name: 'Checks', values: d.checks, color: 'var(--accent)' }], title: 'Credential checks per day' });
    }
  },
  {
    id: 'ITM-15', tab: 'services', span: 's4', view: 'vw_CheckMethods',
    title: 'How credentials are checked', sub: 'Share of checks by method',
    build: {
      sources: ['ValidationHistories'],
      fields: 'ValidationHistories.Method',
      logic: 'Checks grouped by verification method.',
      sql: `SELECT Method, COUNT(*) AS Checks
FROM dbo.ValidationHistories
WHERE ValidatedAt >= @From AND ValidatedAt < @To
GROUP BY Method
ORDER BY Checks DESC;`
    },
    render: (h, d) => hbars(h, d.map(r => ({ label: r.label, value: r.checks, text: pct(r.share, 0) })))
  },
  {
    id: 'ITM-30', tab: 'services', span: 's6', view: 'vw_RenewalPipeline', global: false,
    title: 'Registrations due to expire', sub: 'Vehicle registrations linked in the app, by the week they expire. Not affected by the filters.',
    build: {
      sources: ['OwnedRegistrations', 'AddedRegistrations', 'Transactions', 'TransactionTypes', 'TransactionStatuses'],
      fields: 'RegistrationId, UserId, ExpiryDate; Transactions.RegistrationId (assumed), CreatedAt',
      logic: 'Registrations people own or have added whose expiry date falls in each of the next eight weeks. "Already renewed" means a completed renewal exists for that registration in the last 60 days.',
      sql: `WITH regs AS (
  SELECT RegistrationId, ExpiryDate FROM dbo.OwnedRegistrations
  UNION
  SELECT RegistrationId, ExpiryDate FROM dbo.AddedRegistrations)
SELECT DATEADD(day, (DATEDIFF(day, @To, r.ExpiryDate) / 7) * 7, @To) AS WeekStarting,
       COUNT(*) AS Due,
       SUM(CASE WHEN x.TransactionId IS NOT NULL THEN 1 ELSE 0 END) AS Renewed
FROM regs r
OUTER APPLY (
  SELECT TOP 1 t.TransactionId
  FROM dbo.Transactions t
  JOIN dbo.TransactionTypes ty   ON ty.TransactionTypeId  = t.TransactionTypeId
  JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = t.TransactionStatusId
  WHERE t.RegistrationId = r.RegistrationId AND ty.Name = 'Registration renewal'
    AND s.Name = 'Completed' AND t.CreatedAt >= DATEADD(day, -60, @To)) x
WHERE r.ExpiryDate >= @To AND r.ExpiryDate < DATEADD(week, 8, @To)
GROUP BY DATEADD(day, (DATEDIFF(day, @To, r.ExpiryDate) / 7) * 7, @To)
ORDER BY WeekStarting;`
    },
    render(h, d) {
      const due = sum(d.map(r => r.due)), out = sum(d.map(r => r.outstanding));
      h.innerHTML = `<div class="stats"><span>Due in ${d.length} weeks <b>${fmt(due)}</b></span><span>Not yet renewed <b>${fmt(out)}</b></span></div><div></div>`;
      hbars(h.lastElementChild, d.map(r => ({
        label: `Week of ${dfmt(r.weekStarting)}`, sub: `${pct(r.renewed / r.due, 0)} already renewed`,
        parts: [{ name: 'Already renewed', value: r.renewed, color: 'var(--accent)' }, { name: 'Not yet renewed', value: r.outstanding, color: 'var(--neutral)' }],
        text: fmtC(r.due)
      })), legend([['Already renewed', 'var(--accent)'], ['Not yet renewed', 'var(--neutral)']]));
    }
  },
  {
    id: 'ITM-17', feature: 'fuelExemption', tab: 'services', span: 's6', view: 'vw_FuelExemptionByCategory',
    title: 'Fuel exemption by category', sub: 'Submitted registrations, individuals and businesses',
    build: {
      sources: ['FuelExemptionIndividualRegistrations', 'FuelExemptionBusinessRegistrations', 'FuelExemptionCategories'],
      fields: 'CategoryId, SubmittedAt',
      logic: 'Submitted registrations per category, one bar segment per applicant type.',
      sql: `SELECT c.Name AS Category, r.ApplicantType, COUNT(*) AS Registrations
FROM (
  SELECT CategoryId, SubmittedAt, 'Individual' AS ApplicantType FROM dbo.FuelExemptionIndividualRegistrations
  UNION ALL
  SELECT CategoryId, SubmittedAt, 'Business'   FROM dbo.FuelExemptionBusinessRegistrations) r
JOIN dbo.FuelExemptionCategories c ON c.CategoryId = r.CategoryId
WHERE r.SubmittedAt >= @From AND r.SubmittedAt < @To
GROUP BY c.Name, r.ApplicantType;`
    },
    render: (h, d) => hbars(h, d.map(r => ({
      label: r.label,
      parts: [{ name: 'Individuals', value: r.individuals, color: 'var(--accent)' }, { name: 'Businesses', value: r.businesses, color: 'var(--accent2)' }],
      text: fmt(r.individuals + r.businesses)
    })), legend([['Individuals', 'var(--accent)'], ['Businesses', 'var(--accent2)']]) +
      '<p class="sub">Categories are examples. Replace them with the values in FuelExemptionCategories.</p>')
  },
  {
    id: 'ITM-16', tab: 'services', span: 's12', view: 'vw_FailureReasons',
    title: 'Why transactions fail', sub: 'Failure reasons in the period',
    build: {
      sources: ['Transactions', 'TransactionStatuses'],
      fields: 'Transactions.FailureReason (assumed), TransactionStatusId',
      logic: 'Failed transactions grouped by reason code. If there is no reason column, take the error from the integration log.',
      sql: `SELECT t.FailureReason, COUNT(*) AS Failures
FROM dbo.Transactions t
JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = t.TransactionStatusId
WHERE s.Name = 'Failed'
  AND t.CreatedAt >= @From AND t.CreatedAt < @To
GROUP BY t.FailureReason
ORDER BY Failures DESC;`
    },
    render: (h, d) => table(h,
      [{ h: 'Reason' }, { h: 'Code' }, { h: 'Failures', num: 1 }, { h: 'Share', num: 1 }],
      d.map(r => [escapeHtml(r.reason), `<code>${escapeHtml(r.code)}</code>`, fmt(r.failures), meter(r.share)]),
      'Transaction failure reasons')
  }
];

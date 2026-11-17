/** Journeys tab: funnels built from records the database already keeps. */
import { featureOn } from '../config.mjs';
import { funnel } from '../ui/charts.mjs';
import { selectControl } from '../ui/card.mjs';

// Keys must match transactionTypes[].key in data/mock/reference.json
// (and the TransactionTypes lookup values in the real view).
// Third entry, when present, is the feature that must be on (CONFIG.features)
const ALL_TX_OPTIONS = [
  ['rego', 'Registration renewal'],
  ['licence', "Driver's licence renewal"],
  ['address', 'Change of address'],
  ['transfer', 'Registration transfer'],
  ['fuel', 'Fuel exemption application', 'fuelExemption']
];
export const TX_OPTIONS = ALL_TX_OPTIONS.filter(o => featureOn(o[2])).map(([v, t]) => [v, t]);

export default [
  {
    id: 'ITM-07', tab: 'journeys', span: 's6', view: 'vw_OnboardingFunnel',
    title: 'Onboarding', sub: 'From account created to first completed transaction',
    build: {
      sources: ['Users', 'UserDevices', 'Credentials', 'Transactions', 'TransactionStatuses'],
      fields: 'Users.CreatedAt, Users.IdentityVerifiedAt, UserDevices.UserId, Credentials.UserId, Transactions.UserId',
      logic: 'Cohort = accounts created in the period. Each step flags whether that person ever reached it. For a strict funnel, also require the step before.',
      sql: `WITH cohort AS (
  SELECT u.UserId,
    CASE WHEN u.IdentityVerifiedAt IS NOT NULL THEN 1 ELSE 0 END AS Verified,
    CASE WHEN EXISTS (SELECT 1 FROM dbo.UserDevices d WHERE d.UserId = u.UserId) THEN 1 ELSE 0 END AS Device,
    CASE WHEN EXISTS (SELECT 1 FROM dbo.Credentials c WHERE c.UserId = u.UserId) THEN 1 ELSE 0 END AS Credential,
    CASE WHEN EXISTS (SELECT 1 FROM dbo.Transactions t
                      JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = t.TransactionStatusId
                      WHERE t.UserId = u.UserId AND s.Name = 'Completed') THEN 1 ELSE 0 END AS FirstTxn
  FROM dbo.Users u
  WHERE u.CreatedAt >= @From AND u.CreatedAt < @To)
SELECT COUNT(*) AS AccountCreated, SUM(Verified) AS IdentityVerified,
       SUM(Device) AS DeviceRegistered, SUM(Credential) AS FirstCredential,
       SUM(FirstTxn) AS FirstTransaction
FROM cohort;`
    },
    render: (h, d) => funnel(h, d, { noun: 'new customers' })
  },
  {
    id: 'ITM-08', tab: 'journeys', span: 's6', view: 'vw_TransactionFunnel',
    title: 'Transaction completion', sub: 'How far transactions get for one service',
    deps: ['txType'],
    params: s => ({ txType: s.txType }),
    control: s => selectControl('txType', 'Service', TX_OPTIONS, s.txType),
    build: {
      sources: ['Transactions', 'TransactionsHistory', 'TransactionStatuses', 'TransactionTypes'],
      fields: 'TransactionId, TransactionStatusId, TransactionTypeId, CreatedAt',
      logic: 'Transactions is system-versioned, so every status change is kept in its history table. Union current and history rows to see every status a transaction reached. Mirror the history table into Fabric too.',
      sql: `WITH allRows AS (
  SELECT TransactionId, TransactionStatusId, TransactionTypeId, CreatedAt FROM dbo.Transactions
  UNION ALL
  SELECT TransactionId, TransactionStatusId, TransactionTypeId, CreatedAt FROM dbo.TransactionsHistory)
SELECT s.Name AS Status, COUNT(DISTINCT a.TransactionId) AS Transactions
FROM allRows a
JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = a.TransactionStatusId
JOIN dbo.TransactionTypes ty   ON ty.TransactionTypeId  = a.TransactionTypeId
WHERE ty.Name = @TransactionType
  AND a.CreatedAt >= @From AND a.CreatedAt < @To
GROUP BY s.Name;`
    },
    render: (h, d) => funnel(h, d, { noun: 'transactions' })
  },
  {
    id: 'ITM-09', tab: 'journeys', span: 's6', view: 'vw_ReminderFunnel',
    title: 'Renewal reminder to renewal', sub: 'Push reminders that led to a renewal within 14 days',
    build: {
      sources: ['Notifications', 'Transactions', 'TransactionStatuses'],
      fields: 'Notifications.Type, SentAt, DeliveredAt, OpenedAt; Transactions.UserId, CreatedAt',
      logic: 'A renewal counts if the same person started one within 14 days of the reminder. OUTER APPLY takes only the first matching transaction.',
      sql: `SELECT COUNT(*) AS Sent, COUNT(n.DeliveredAt) AS Delivered, COUNT(n.OpenedAt) AS Opened,
       COUNT(t.TransactionId) AS RenewalStarted,
       SUM(CASE WHEN t.Status = 'Completed' THEN 1 ELSE 0 END) AS RenewalCompleted
FROM dbo.Notifications n
OUTER APPLY (
  SELECT TOP 1 tr.TransactionId, s.Name AS Status
  FROM dbo.Transactions tr
  JOIN dbo.TransactionStatuses s ON s.TransactionStatusId = tr.TransactionStatusId
  WHERE tr.UserId = n.UserId AND tr.TransactionTypeId = @RegoRenewalTypeId
    AND tr.CreatedAt BETWEEN n.SentAt AND DATEADD(day, 14, n.SentAt)
  ORDER BY tr.CreatedAt) t
WHERE n.Type = 'RegistrationRenewalReminder'
  AND n.SentAt >= @From AND n.SentAt < @To;`
    },
    render: (h, d) => funnel(h, d, { noun: 'reminders' })
  },
  {
    id: 'ITM-10', feature: 'fuelExemption', tab: 'journeys', span: 's6', view: 'vw_FuelExemptionFunnel',
    title: 'Fuel exemption application', sub: 'Individuals and businesses combined',
    build: {
      sources: ['FuelExemptionIndividualRegistrations', 'FuelExemptionBusinessRegistrations'],
      fields: 'RegistrationId, Status, StartedAt, SubmittedAt, DecidedAt',
      logic: 'Union both registration tables, then count how many reached each status. Use the history tables if statuses are overwritten.',
      sql: `WITH regs AS (
  SELECT RegistrationId, Status, StartedAt FROM dbo.FuelExemptionIndividualRegistrations
  UNION ALL
  SELECT RegistrationId, Status, StartedAt FROM dbo.FuelExemptionBusinessRegistrations)
SELECT Status, COUNT(*) AS Registrations
FROM regs
WHERE StartedAt >= @From AND StartedAt < @To
GROUP BY Status;`
    },
    render: (h, d) => funnel(h, d, { noun: 'applications' })
  }
];

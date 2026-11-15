/**
 * Item catalog: built from the dashboard's own item registry, so it never
 * goes out of date. VIEWS adds what the registry doesn't hold: which mock
 * file feeds each view and the shape of its answer.
 */
import { ITEMS, TABS } from '../js/items/index.mjs';

const PAIR = '{ current, previous, daily: number[] }';
const FUNNEL = '[{ label, source, value }] in step order';
export const VIEWS = {
  vw_Scorecard: ['daily-metrics.json, reference.json, lga-activity.json', '{ days, measures: { activeUsers, newAccounts, credentialChecks: { current, previous }, transactionSuccess, onboardingConversion, regionalReach: { value } } }'],
  vw_Targets: ['targets.json', "[{ key, label, basis: 'value' | 'perDay' | 'growth', target, action }]"],
  vw_Events: ['events.json', "[{ id, kind: 'campaign' | 'incident', from, to, label, note, inPeriod }]"],
  vw_ActiveUsers: ['daily-metrics.json, reference.json (uniqueUsersFactor)', PAIR],
  vw_NewAccounts: ['daily-metrics.json', PAIR],
  vw_TransactionSuccess: ['daily-metrics.json', PAIR],
  vw_CredentialChecks: ['daily-metrics.json', PAIR],
  vw_DailyActiveUsersByPlatform: ['daily-metrics.json', '{ dates: string[], ios?: number[], android?: number[] }'],
  vw_NewAccountsByWeek: ['daily-metrics.json', '{ daily: boolean, labels: string[], values: number[] }'],
  vw_RetentionCohorts: ['retention.json', '[{ week, size, retained: number[] }]'],
  vw_TransactionSuccessDaily: ['daily-metrics.json', '{ dates, rate: number[], finished: number[], failed: number[], previousRate: number[] }'],
  vw_ChannelShift: ['value.json, daily-metrics.json, reference.json', '{ currency, costPerTransaction, minutesSavedPerCounterVisit, rows: [{ key, label, appCompleted, otherChannels, appShare, counterAvoided, phoneAvoided, costAvoided }], totals }'],
  vw_OnboardingFunnel: ['reference.json (onboardingFunnel), daily-metrics.json', FUNNEL],
  vw_TransactionFunnel: ['reference.json (transactionTypes), daily-metrics.json', FUNNEL],
  vw_ReminderFunnel: ['reference.json (reminderFunnel), daily-metrics.json', FUNNEL],
  vw_FuelExemptionFunnel: ['reference.json (transactionTypes, fuelExemption)', FUNNEL],
  vw_CredentialsByType: ['reference.json (credentialTypes), daily-metrics.json', '[{ label, active, added }]'],
  vw_TransactionsByType: ['reference.json (transactionTypes), daily-metrics.json', '[{ key, label, finished, completed, failed }]'],
  vw_TransactionDuration: ['services-detail.json (durations)', '{ medianSeconds, bands: [{ label, transactions, share }] }'],
  vw_PaymentsByService: ['services-detail.json (payments)', '[{ key, label, payments, averageAmount, totalAmount }]'],
  vw_CredentialChecksDaily: ['daily-metrics.json', '{ dates, checks: number[], failed: number[] }'],
  vw_CheckMethods: ['reference.json (checkMethods)', '[{ label, checks, share }]'],
  vw_RenewalPipeline: ['services-detail.json (renewalPipeline)', '[{ weekStarting, due, renewed, outstanding }]'],
  vw_FuelExemptionByCategory: ['reference.json (fuelExemption)', '[{ label, individuals, businesses }]'],
  vw_FailureReasons: ['reference.json (failureReasons), daily-metrics.json', '[{ reason, code, failures, share }]'],
  vw_UsageByLga: ['lga-activity.json, ../reference/lga.json', '[{ code, users, per1000 }], leaving out councils below the threshold'],
  vw_LgaProfile: ['lga-activity.json, ../reference/lga.json', '{ code, users, per1000, population, rank, ranked, group, groupRate, iosShare, stateRate, metroRate, regionalRate, stateUsers, councils, hidden } or { code, suppressed: true }'],
  vw_UsageByHour: ['usage-by-hour.json', '{ days: string[7], matrix: number[7][24] }'],
  vw_ProviderAvailability: ['reference.json (providers, downtimeMinutes)', "[{ name, description, uptime, days: [{ date, status: 'up' | 'degraded' | 'down' }] }]"],
  vw_ProviderPerformance: ['operations.json (providerPerformance), reference.json (providers)', '[{ name, medianMs, p95Ms, errorRate, worstDay: { date, medianMs }, daily: number[] }]'],
  vw_FailedTransactionsDaily: ['daily-metrics.json', '{ dates, failed: number[] }'],
  vw_AppVersions: ['reference.json (appVersions)', '[{ version, devices, share }]'],
  vw_AppVersionAdoption: ['operations.json (appAdoption)', '{ version, released, dates: string[], ios: number[], android: number[] }'],
  vw_NotificationSettings: ['operations.json (notificationSettings)', '[{ label, share, ios, android }]'],
  vw_NotificationPerformance: ['reference.json (notificationTypes), daily-metrics.json', '[{ type, sent, delivered, opened, acted }]']
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tabName = id => (TABS.find(t => t.id === id) || { label: id }).label;
const rowsEl = document.getElementById('items-body'), q = document.getElementById('items-q'), tabSel = document.getElementById('items-tab'), count = document.getElementById('items-count');

tabSel.innerHTML = '<option value="">All tabs</option>' + TABS.filter(t => ITEMS.some(i => i.tab === t.id)).map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('');

const rows = ITEMS.slice().sort((a, b) => a.id.localeCompare(b.id)).map(item => {
  const views = [item.view, ...Object.values(item.also || {})];
  const html = `<tr>
    <td><a href="../index.html#${item.tab}/${item.id}">${item.id}</a></td>
    <td><b>${esc(item.title)}</b><br>${esc(item.sub)}${item.global === false ? '<br><span class="doc-pill">ignores filters</span>' : ''}</td>
    <td><span class="doc-pill">${esc(tabName(item.tab))}</span></td>
    <td>${views.map(v => `<code>${v}</code>`).join('<br>')}</td>
    <td class="sh">${esc((VIEWS[item.view] || ['', 'see README'])[1])}</td>
    <td>${views.map(v => esc((VIEWS[v] || ['?'])[0])).filter((v, i, a) => a.indexOf(v) === i).join('; ')}</td>
    <td>${item.build.sources.map(esc).join(', ')}</td></tr>`;
  return { item, html, text: [item.id, item.title, item.sub, tabName(item.tab), ...views, ...item.build.sources, ...(views.map(v => (VIEWS[v] || [''])[0]))].join(' ').toLowerCase() };
});

function draw() {
  const words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean), tab = tabSel.value;
  const shown = rows.filter(r => (!tab || r.item.tab === tab) && words.every(w => r.text.includes(w)));
  rowsEl.innerHTML = shown.map(r => r.html).join('') || '<tr><td colspan="7">No items match. Try a shorter search.</td></tr>';
  count.textContent = `Showing ${shown.length} of ${rows.length} items`;
}
q.addEventListener('input', draw);
tabSel.addEventListener('change', draw);
draw();

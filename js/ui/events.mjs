/**
 * Which events a chart should show.
 *
 * Each event in events.json lists the measures it affected in `affects`
 * (for example ["transactions"]). Each chart passes the measures it plots.
 * An event appears on a chart only when the two share a measure, so an
 * outage that broke transactions is not drawn on unrelated charts.
 * An event with no `affects` list is treated as affecting everything.
 *
 * Measures in use: active-users, new-accounts, transactions, credential-checks, cost.
 */
export function eventsFor(events, measures) {
  return (events || []).filter(e => e.inPeriod === 'current'
    && (!Array.isArray(e.affects) || !measures || e.affects.some(m => measures.includes(m))));
}

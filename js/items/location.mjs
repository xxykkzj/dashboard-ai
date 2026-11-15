/**
 * Location tab: where and when people use the app.
 * Location data is matched to council areas inside Fabric, so the browser
 * only ever receives counts per council, and small areas are suppressed.
 */
import { tileMap } from '../ui/tilemap.mjs';
import { geoMap } from '../ui/geomap.mjs';
import { hbars, heatGrid } from '../ui/charts.mjs';
import { segControl } from '../ui/card.mjs';
import { fmt, fmtC, pct, escapeHtml } from '../ui/format.mjs';
import { setState } from '../state.mjs';

/** Join the view's rows to the council reference list; missing councils are suppressed. */
function mergeLga(data, ctx) {
  const byCode = new Map(data.map(r => [r.code, r]));
  return ctx.lga.lgas.map(l => {
    const r = byCode.get(l.code);
    return { ...l, users: r ? r.users : null, per1000: r ? r.per1000 : null, suppressed: !r };
  });
}

const LGA_SQL = `-- Step 1 (Fabric notebook, at ingest): match each location to a council
-- area, keep only LgaCode, and drop the raw coordinates.
--   silver.LocationEvents (UserId, Platform, LgaCode, RecordedAt)

SELECT l.LgaCode,
       COUNT(DISTINCT l.UserId)                         AS ActiveUsers,
       COUNT(DISTINCT l.UserId) * 1000.0 / g.Population AS UsersPer1000
FROM silver.LocationEvents l
JOIN ref.Lga g ON g.LgaCode = l.LgaCode
WHERE l.RecordedAt >= @From AND l.RecordedAt < @To
  AND (@Platform IS NULL OR l.Platform = @Platform)
GROUP BY l.LgaCode, g.Population
HAVING COUNT(DISTINCT l.UserId) >= 10;   -- suppress small areas`;

export default [
  {
    id: 'ITM-22', tab: 'location', span: 's8 tall', view: 'vw_UsageByLga',
    title: 'Where people use the app', sub: 'Council areas shaded by use. A stronger colour means more use. Select a council to profile it.',
    deps: ['mapMetric', 'mapView', 'lga'],       // the query is cached, so these only re-draw
    params: (s, ctx) => ({ threshold: ctx.threshold }),
    control: (s, ctx, id) => segControl('mapView', 'Show', [['geo', 'Map'], ['tiles', 'Tiles']], s.mapView, id) +
      segControl('mapMetric', 'Shade by', [['per1000', 'Per 1,000 residents'], ['users', 'Active users']], s.mapMetric, id),
    build: {
      sources: ['LocationHistories → silver.LocationEvents', 'ref.Lga (ABS boundaries and population)'],
      fields: 'LocationHistories.UserId, Latitude, Longitude, RecordedAt; UserDevices.Platform',
      logic: 'Locations are matched to council areas during ingest and raw coordinates are dropped. The view counts distinct users per council and leaves out councils with fewer than 10 users. Per 1,000 residents uses ABS population, so small councils compare fairly with large ones.',
      sql: LGA_SQL
    },
    render(h, d, s, ctx) {
      const rows = mergeLga(d, ctx);
      const opts = { rows, metric: s.mapMetric, threshold: ctx.threshold,
        selected: s.lga || null, onSelect: code => setState({ lga: code || '' }) };
      // keep the map's own host between re-draws so zoom, focus and the open table survive
      let map = h.querySelector(':scope > .gm-host');
      if (!map || map.dataset.view !== s.mapView) {
        h.innerHTML = '<div class="gm-host"></div>';
        map = h.firstElementChild; map.dataset.view = s.mapView;
      }
      if (s.mapView === 'tiles' || !ctx.geo) tileMap(map, { ...opts, placeholder: ctx.lga.metroPlaceholder });
      else geoMap(map, { ...opts, topo: ctx.geo });
    }
  },
  {
    id: 'ITM-27', tab: 'location', span: 's4', view: 'vw_LgaProfile',
    title: 'Council profile', sub: 'How one council compares with the rest of the state',
    deps: ['lga'],
    params: (s, ctx) => ({ threshold: ctx.threshold, lga: s.lga || null }),
    build: {
      sources: ['silver.LocationEvents', 'ref.Lga'],
      fields: 'LgaCode, UserId, Platform, RecordedAt; ref.Lga.Population, IsMetro',
      logic: 'The selected council from the map view, ranked against the others and compared with its group (metropolitan or regional) and the state. Hidden councils return no figures.',
      sql: `WITH lga AS (
  SELECT l.LgaCode, g.IsMetro, g.Population,
         COUNT(DISTINCT l.UserId) AS ActiveUsers,
         COUNT(DISTINCT CASE WHEN l.Platform = 'iOS' THEN l.UserId END) AS IosUsers
  FROM silver.LocationEvents l
  JOIN ref.Lga g ON g.LgaCode = l.LgaCode
  WHERE l.RecordedAt >= @From AND l.RecordedAt < @To
  GROUP BY l.LgaCode, g.IsMetro, g.Population
  HAVING COUNT(DISTINCT l.UserId) >= 10),
r AS (
  SELECT *, ActiveUsers * 1000.0 / Population AS UsersPer1000,
         RANK() OVER (ORDER BY ActiveUsers * 1.0 / Population DESC) AS Rnk,
         SUM(ActiveUsers) OVER () * 1000.0 / SUM(Population) OVER () AS StateRate,
         SUM(ActiveUsers) OVER (PARTITION BY IsMetro) * 1000.0
           / SUM(Population) OVER (PARTITION BY IsMetro) AS GroupRate
  FROM lga)
SELECT LgaCode, ActiveUsers, UsersPer1000, Rnk, StateRate, GroupRate,
       IosUsers * 1.0 / ActiveUsers AS IosShare
FROM r WHERE LgaCode = @LgaCode;`
    },
    render(h, d, s, ctx) {
      const bars = (rows, max) => { const el = h.querySelector('.pf-bars'); hbars(el, rows, '', { max }); };
      if (!d.code) {
        h.innerHTML = `<div class="pf"><p class="pf-name">South Australia</p>
          <p class="pf-big"><b>${fmt(d.stateRate)}</b> users per 1,000 residents</p>
          <div class="pf-bars"></div>
          <p class="note">${fmtC(d.stateUsers)} people used the app across ${d.councils - d.hidden} council areas${d.hidden ? `; ${d.hidden} more ${d.hidden > 1 ? 'are' : 'is'} hidden for privacy` : ''}.</p>
          <p class="hint">Select a council on the map, or in the list below, to compare it.</p></div>`;
        bars([{ label: 'Metropolitan Adelaide', value: d.metroRate, text: fmt(d.metroRate) }, { label: 'Regional councils', value: d.regionalRate, text: fmt(d.regionalRate), color: 'var(--accent2)' }], Math.max(d.metroRate, d.regionalRate) * 1.1);
        return;
      }
      const l = ctx.lga.lgas.find(x => x.code === d.code) || { name: d.code, region: '' };
      const clear = `<button type="button" class="linkbtn" data-state="lga" data-v="">Back to South Australia</button>`;
      if (d.suppressed) {
        h.innerHTML = `<div class="pf"><p class="pf-name">${escapeHtml(l.name)}</p><p class="pf-region">${escapeHtml(l.region)}</p>
          <p class="note">Fewer than ${ctx.threshold} people used the app here in this period, so the figures are hidden to protect privacy.</p>${clear}</div>`;
        return;
      }
      const diff = d.per1000 - d.stateRate, groupName = d.group === 'metro' ? 'Metropolitan average' : 'Regional average';
      h.innerHTML = `<div class="pf"><p class="pf-name">${escapeHtml(l.name)}</p><p class="pf-region">${escapeHtml(l.region)}</p>
        <p class="pf-big"><b>${fmt(d.per1000)}</b> users per 1,000 residents</p>
        <p class="pf-rank">Ranked <b>${d.rank}</b> of ${d.ranked} council areas</p>
        <div class="pf-bars"></div>
        <dl class="pf-facts"><div><dt>Active users</dt><dd>${fmt(d.users)}</dd></div><div><dt>Residents</dt><dd>${fmt(d.population)}</dd></div>
          ${d.iosShare != null ? `<div><dt>On iPhone</dt><dd>${pct(d.iosShare, 0)}</dd></div>` : ''}</dl>
        <p class="note">${diff >= 0
          ? `${fmt(diff)} per 1,000 above the state average.`
          : `${fmt(-diff)} per 1,000 below the state average.`}</p>${clear}</div>`;
      bars([
        { label: l.name, value: d.per1000, text: fmt(d.per1000) },
        { label: groupName, value: d.groupRate, text: fmt(d.groupRate), color: 'var(--neutral)' },
        { label: 'State average', value: d.stateRate, text: fmt(d.stateRate), color: 'var(--neutral)' }
      ], Math.max(d.per1000, d.groupRate, d.stateRate) * 1.05);
    }
  },
  {
    id: 'ITM-23', tab: 'location', span: 's4', view: 'vw_UsageByLga',
    title: 'Highest and lowest use', sub: 'Users per 1,000 residents. Select a council to profile it.',
    deps: ['lga'],
    params: (s, ctx) => ({ threshold: ctx.threshold }),
    build: {
      sources: ['silver.LocationEvents', 'ref.Lga'],
      fields: 'LgaCode, UsersPer1000, Region',
      logic: 'Same view as the map, sorted. Both lists share one scale so the bars compare.',
      sql: LGA_SQL
    },
    render(h, d, s, ctx) {
      const rows = mergeLga(d, ctx), shown = rows.filter(r => !r.suppressed).sort((a, b) => b.per1000 - a.per1000);
      const hidden = rows.length - shown.length;
      h.innerHTML = `<h4 class="mini">Highest</h4><div></div><h4 class="mini">Lowest</h4><div></div>
        ${hidden ? `<p class="privacy">${hidden} council area${hidden > 1 ? 's' : ''} hidden: fewer than ${ctx.threshold} users.</p>` : ''}`;
      const [top, bottom] = h.querySelectorAll('.mini + div');
      const bar = r => ({ label: r.name, value: r.per1000, text: fmt(r.per1000), on: s.lga === r.code,
        go: { set: { lga: s.lga === r.code ? '' : r.code }, label: 'Show this council in the profile' } });
      const max = shown.length ? shown[0].per1000 : 1;   // one scale for both lists
      hbars(top, shown.slice(0, 5).map(bar), '', { max });
      hbars(bottom, shown.slice(-5).reverse().map(r => ({ ...bar(r), color: 'var(--accent2)' })), '', { max });
    }
  },
  {
    id: 'ITM-24', tab: 'location', span: 's12', view: 'vw_UsageByHour',
    title: 'When people use the app', sub: 'Average sessions in each hour of a typical week, Adelaide time',
    build: {
      sources: ['UsageHistories', 'UserDevices'],
      fields: 'UsageHistories.EventType, OccurredAt; UserDevices.Platform',
      logic: 'Session starts grouped by weekday and hour after converting from UTC to Adelaide time, divided by the number of weeks in the period. Useful for scheduling releases and maintenance in quiet hours.',
      sql: `WITH s AS (
  SELECT CAST(u.OccurredAt AT TIME ZONE 'UTC'
              AT TIME ZONE 'Cen. Australia Standard Time' AS datetime2) AS LocalTime
  FROM dbo.UsageHistories u
  JOIN dbo.UserDevices d ON d.DeviceId = u.DeviceId
  WHERE u.EventType = 'SessionStart'
    AND u.OccurredAt >= @From AND u.OccurredAt < @To
    AND (@Platform IS NULL OR d.Platform = @Platform))
SELECT DATENAME(weekday, LocalTime) AS DayOfWeek,
       DATEPART(hour, LocalTime)    AS HourOfDay,
       COUNT(*) * 7.0 / DATEDIFF(day, @From, @To) AS AvgSessions
FROM s
GROUP BY DATENAME(weekday, LocalTime), DATEPART(hour, LocalTime);`
    },
    render: (h, d) => heatGrid(h, { days: d.days, matrix: d.matrix, valueLabel: 'sessions' })
  }
];

export const locationCallout = `<div class="callout"><h3>How location privacy is protected</h3>
  <p>Raw coordinates stay inside Fabric. They are matched to a council area when data is ingested, and only council-level counts reach this page. Council areas with fewer than 10 users in the period are hidden. Before go-live, confirm that the app's collection notice covers analytics use and complete a privacy impact assessment under the SA Information Privacy Principles.</p></div>`;

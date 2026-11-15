/**
 * Live examples for the component catalog. Each example imports the real
 * dashboard module and calls it with a few made-up numbers, so what you see
 * here is exactly what the dashboard draws.
 */
import { kpi, lineChart, barChart, hbars, funnel, cohortGrid, table, meter, heatGrid, legend, spark } from '../js/ui/charts.mjs';
import { statusChip, evaluate } from '../js/ui/status.mjs';
import { cardHTML, segControl, selectControl } from '../js/ui/card.mjs';
import { tileMap } from '../js/ui/tilemap.mjs';
import { geoMap } from '../js/ui/geomap.mjs';
import { ITEMS } from '../js/items/index.mjs';
import { pct, fmt } from '../js/ui/format.mjs';

const host = id => document.querySelector(`#${id} .body`);
const days = n => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(2026, 9, 16 + i)); return d.toISOString().slice(0, 10); });
const wave = (n, base, amp, shift = 0) => Array.from({ length: n }, (_, i) => Math.round(base + amp * Math.sin(i / 1.1 + shift) + (i * base) / 300));
const events = [{ kind: 'incident', from: '2026-10-30', to: '2026-10-31', label: 'Example outage', note: 'A note about the event.' }];
const run = (id, fn) => { try { fn(host(id)); } catch (e) { console.error(id, e); host(id).innerHTML = `<p class="err">This example couldn't draw: ${e.message}</p>`; } };

function drawAll() {
  run('demo-kpi', h => kpi(h, {
    value: 42252, delta: -0.211, deltaText: '21.1%', range: 30, sparkData: wave(30, 1400, 220), sparkTarget: 1400,
    evaluation: evaluate({ basis: 'perDay', target: 1400, action: 1200 }, { current: 42252, days: 30 })
  }));

  run('demo-line', h => lineChart(h, {
    dates: days(30), title: 'Daily active users',
    series: [{ name: 'iPhone', values: wave(30, 120000, 14000), color: 'var(--accent)' }, { name: 'Android', values: wave(30, 76000, 9000, 1), color: 'var(--accent2)' }],
    events
  }));

  run('demo-line2', h => lineChart(h, {
    dates: days(30), title: 'Success rate by day', zero: false, yFmt: v => pct(v, 0), tipFmt: v => pct(v),
    series: [{ name: 'This period', values: wave(30, 0.936, 0.004).map((v, i) => (i === 14 || i === 15 ? 0.865 : 0.936 + 0.004 * Math.sin(i))), color: 'var(--accent)' }],
    compare: { name: 'Previous 30 days', values: Array.from({ length: 30 }, (_, i) => 0.937 + 0.003 * Math.cos(i)) },
    target: { value: 0.935, label: 'Target 93.5%' }, events
  }));

  run('demo-bar', h => barChart(h, {
    labels: ['18 Oct', '25 Oct', '1 Nov', '8 Nov'], values: [10100, 9450, 9800, 10250], name: 'New accounts', title: 'New accounts per week',
    target: { value: 9800, label: 'Target 9,800' }
  }));

  run('demo-hbars', h => hbars(h, [
    { label: 'QR scan in person', value: 0.61, text: '61%' },
    { label: 'Venue ID scanner', value: 0.27, text: '27%' },
    { label: 'Online verification', value: 0.12, text: '12%', sub: 'a second line' }
  ]));

  run('demo-hbars2', h => hbars(h, [
    { label: 'Registration renewal', sub: '130,620 finished', text: '94.2%', parts: [{ name: 'Completed', value: 123000, color: 'var(--accent)' }, { name: 'Failed', value: 7600, color: 'var(--bad)' }], go: { hash: 'journeys/ITM-08', set: { txType: 'rego' }, label: 'Open the completion funnel' } },
    { label: 'Registration transfer', sub: '45,433 finished', text: '88.2%', parts: [{ name: 'Completed', value: 40000, color: 'var(--accent)' }, { name: 'Failed', value: 5400, color: 'var(--bad)' }] }
  ], legend([['Completed', 'var(--accent)'], ['Failed', 'var(--bad)']])));
  // in the dashboard the link stays on the page; from the docs it opens the dashboard at that item
  document.querySelectorAll('#demo-hbars2 a.hrow').forEach(a => a.setAttribute('href', '../index.html' + a.getAttribute('href')));

  run('demo-funnel', h => funnel(h, [
    { label: 'Account created', value: 42252 }, { label: 'Identity verified', value: 36337 },
    { label: 'First credential added', value: 27845 }, { label: 'First transaction completed', value: 12252 }
  ], { noun: 'new customers' }));

  run('demo-cohort', h => cohortGrid(h, [
    { week: '2026-10-12', size: 10390, retained: [1, 0.65, 0.56, 0.51] },
    { week: '2026-10-19', size: 10110, retained: [1, 0.66, 0.57] },
    { week: '2026-10-26', size: 9480, retained: [1, 0.58] },
    { week: '2026-11-02', size: 9930, retained: [1] }
  ]));

  run('demo-table', h => table(h,
    [{ h: 'Reason' }, { h: 'Failures', num: 1 }, { h: 'Share', num: 1 }, { h: 'Trend' }],
    [['Payment declined', fmt(6902), meter(0.36), `<span class="tspark">${spark(wave(20, 200, 40))}</span>`], ['Session expired', fmt(2876), meter(0.15), `<span class="tspark">${spark(wave(20, 90, 25, 2))}</span>`]],
    'Example table'));

  run('demo-heat', h => heatGrid(h, {
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    matrix: Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, hr) => Math.max(40, Math.round(900 * Math.exp(-((hr - (d > 4 ? 13 : 9)) ** 2) / 30) + 700 * Math.exp(-((hr - 19) ** 2) / 12))))),
    valueLabel: 'sessions'
  }));

  run('demo-status', h => {
    const t = { basis: 'value', target: 0.935, action: 0.925 };
    h.innerHTML = `<p>${statusChip('good')} ${statusChip('watch')} ${statusChip('action')} ${statusChip('info', 'Estimate')}</p>
      <p class="note">evaluate() with a 93.5% target and 92.5% action level:</p>
      <p>${[0.94, 0.93, 0.92].map(v => { const e = evaluate(t, { value: v }); return `${pct(v)} ${statusChip(e.status)}`; }).join(' &nbsp; ')}</p>`;
  });

  run('demo-score', h => ITEMS.find(i => i.id === 'ITM-00').render(h, {
    days: 30, measures: { newAccounts: { current: 42252, previous: 53000 }, transactionSuccess: { value: 0.932 }, onboardingConversion: { value: 0.29 }, credentialChecks: { current: 2284000, previous: 2190000 } }
  }, { platform: 'all' }, {}, {
    targets: [
      { key: 'newAccounts', label: 'New accounts', basis: 'perDay', target: 1400, action: 1200 },
      { key: 'transactionSuccess', label: 'Transaction success rate', basis: 'value', target: 0.935, action: 0.925 },
      { key: 'credentialChecks', label: 'Credential checks', basis: 'perDay', target: 70000, action: 60000 },
      { key: 'onboardingConversion', label: 'First transaction completed', basis: 'value', target: 0.35, action: 0.30 }
    ], events: [{ ...events[0], inPeriod: 'current' }]
  }));

  run('demo-controls', h => {
    h.innerHTML = `<div class="ctrl">${segControl('demoMeasure', 'Shade by', [['per1000', 'Per 1,000 residents'], ['users', 'Active users']], 'per1000', 'demo')}</div>
      <div class="ctrl">${selectControl('demoService', 'Service', [['rego', 'Registration renewal'], ['licence', "Driver's licence renewal"]], 'rego')}</div>
      <p class="note" id="demo-controls-out">Nothing chosen yet. In the dashboard, main.mjs listens for these and calls setState.</p>`;
    h.onclick = e => { const b = e.target.closest('button[data-state]'); if (!b) return; b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); document.getElementById('demo-controls-out').textContent = `setState({ ${b.dataset.state}: '${b.dataset.v}' })`; };
    h.onchange = e => { const s = e.target.closest('select[data-state]'); if (s) document.getElementById('demo-controls-out').textContent = `setState({ ${s.dataset.state}: '${s.value}' })`; };
  });

  const demoItem = {
    id: 'DEMO-01', span: 's12', view: 'vw_Example', title: 'An example card', sub: 'The line under the title',
    build: { sources: ['ExampleTable'], fields: 'ExampleTable.Value, CreatedAt', logic: 'What the query does, in a sentence.', sql: 'SELECT COUNT(*) AS Value\nFROM dbo.ExampleTable\nWHERE CreatedAt >= @From AND CreatedAt < @To;' }
  };
  const cardHost = document.getElementById('demo-card');
  cardHost.innerHTML = cardHTML(demoItem, {}, {});
  cardHost.querySelector('.body').innerHTML = '<p class="note">The item\'s render function draws here.</p>';
  cardHost.onclick = e => { const how = e.target.closest('.how'); if (!how) return; const p = document.getElementById(how.getAttribute('aria-controls')); p.hidden = !p.hidden; how.setAttribute('aria-expanded', String(!p.hidden)); };
}

async function drawMaps() {
  try {
    const [lga, topo] = await Promise.all([fetch('../data/reference/lga.json').then(r => r.json()), fetch('../data/reference/sa-lga-2023.topo.json').then(r => r.json())]);
    // made-up values: every council gets a rate, one is hidden for privacy
    const rows = lga.lgas.map((l, i) => ({ ...l, per1000: 300 + ((i * 53) % 260), users: Math.round(l.population * (0.3 + ((i * 53) % 260) / 1000)), suppressed: i === 40 }))
      .map(r => (r.suppressed ? { ...r, per1000: null, users: null } : r));
    const say = id => code => { document.getElementById(id).textContent = code ? `onSelect('${code}')` : 'onSelect(null)'; };
    run('demo-geo', h => geoMap(h, { rows, topo, metric: 'per1000', threshold: 10, onSelect: say('demo-geo-out') }));
    run('demo-tile', h => tileMap(h, { rows, metric: 'per1000', threshold: 10, placeholder: lga.metroPlaceholder, onSelect: say('demo-tile-out') }));
  } catch (e) {
    console.error(e);
    ['demo-geo', 'demo-tile'].forEach(id => { host(id).innerHTML = '<p class="err">The map example needs the files in data/reference.</p>'; });
  }
}

drawAll();
drawMaps();

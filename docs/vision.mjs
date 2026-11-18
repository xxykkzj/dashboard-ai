/**
 * Vision page: the animated data journey and the "compared with 3 years ago" demo.
 * Plain DOM and SVG, colours from the dashboard tokens. Respects reduced motion:
 * dots stop moving and the journey only changes when a step button is pressed.
 */
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ---------------- data journey ---------------- */
const STAGES = [
  {
    key: 'sources', title: 'Sources',
    text: 'Data starts in the systems people already use: the mySA GOV app database, government websites, the ID service that connects about 20 identity providers, and the Azure platform itself (monitoring and cost). Nothing changes for the people using these services.'
  },
  {
    key: 'ingest', title: 'Bring it in',
    text: 'Fabric Data Factory brings each source in the cheapest way that fits. Mirroring keeps a near real-time copy of the app database (on-premises SQL Server or Azure SQL) with no pipeline code. Copy jobs and pipelines handle files and APIs, and any existing Azure Data Factory work can be mounted in Fabric and upgraded. Eventstream takes live sign-in events from the ID service. Shortcuts point at data that already lives in Dataverse or Azure storage, without copying it.'
  },
  {
    key: 'store', title: 'One lake',
    text: 'Everything lands in OneLake, one copy per organisation in open Delta format, in an Australian region. It is kept in three layers: Bronze as it arrived, Silver cleaned and de-identified, and Gold shaped for reporting. Keeping Bronze and Silver for years is what makes "compared with 3 years ago" possible.'
  },
  {
    key: 'model', title: 'Shared meaning',
    text: 'A semantic model defines each measure once, such as "completed transaction" or "active user", including rolling 12 months and same period in earlier years. Live data goes to an Eventhouse for second-by-second queries. Fabric IQ adds business meaning so Copilot and agents answer from the same definitions as the reports.'
  },
  {
    key: 'use', title: 'Use it',
    text: 'The same numbers then reach people where they work: Power BI reports and this dashboard, a monthly report delivered to email and Teams on a schedule, a real-time dashboard with alerts for outages, Copilot and data agents in Teams and Excel, and Power Apps or Power Automate when someone needs to act on what they see.'
  }
];

function initJourney() {
  const root = document.getElementById('vj');
  if (!root) return;
  const panel = document.getElementById('vj-panel');
  const playBtn = document.getElementById('vj-play');
  const stages = [...root.querySelectorAll('.vj-stage')];
  const stepBtns = [...document.querySelectorAll('[data-vj-step]')];
  let current = -1, timer = null;

  const show = i => {
    current = i;
    stages.forEach((s, k) => {
      s.classList.toggle('on', k === i);
      s.classList.toggle('done', i >= 0 && k < i);
    });
    root.classList.toggle('focused', i >= 0);
    stepBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    panel.innerHTML = i < 0
      ? '<p><b>Five steps from source to screen.</b> Select a step, or play the journey.</p>'
      : `<p class="vj-step-n">Step ${i + 1} of ${STAGES.length}</p><h3>${STAGES[i].title}</h3><p>${STAGES[i].text}</p>`;
  };

  const stop = () => {
    clearInterval(timer); timer = null;
    playBtn.textContent = 'Play the journey';
    playBtn.setAttribute('aria-pressed', 'false');
  };
  const play = () => {
    if (timer) { stop(); return; }
    playBtn.textContent = 'Pause';
    playBtn.setAttribute('aria-pressed', 'true');
    show(current >= STAGES.length - 1 ? 0 : current + 1);
    timer = setInterval(() => {
      if (current >= STAGES.length - 1) { stop(); return; }
      show(current + 1);
    }, 5200);
  };

  playBtn.addEventListener('click', play);
  stepBtns.forEach((b, k) => b.addEventListener('click', () => { stop(); show(current === k ? -1 : k); }));
  stages.forEach((s, k) => s.addEventListener('click', () => { stop(); show(current === k ? -1 : k); }));
  document.addEventListener('keydown', e => {
    if (!root.closest('section').contains(document.activeElement)) return;
    if (e.key === 'ArrowRight') { stop(); show(Math.min(STAGES.length - 1, current + 1)); }
    if (e.key === 'ArrowLeft') { stop(); show(Math.max(0, current - 1)); }
  });

  // Pause the moving dots when the diagram is off screen or motion is reduced
  const motion = () => root.classList.toggle('still', reduce.matches);
  reduce.addEventListener?.('change', motion);
  motion();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => root.classList.toggle('paused', !en.isIntersecting)).observe(root);
  }
  show(-1);
}

/* ---------------- comparison demo ---------------- */
// Illustrative monthly completed transactions, Jan 2022 to Oct 2026. Not real data.
function makeMonths() {
  const out = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  // Australian financial year effect: registration renewals cluster in June–July
  const season = [0.86, 0.9, 1.0, 0.97, 1.0, 1.12, 1.16, 1.03, 1.0, 1.02, 0.99, 0.9];
  for (let y = 2022; y <= 2026; y++) {
    for (let m = 0; m < 12; m++) {
      if (y === 2026 && m > 9) break;
      const t = (y - 2022) * 12 + m;
      let v = (84000 + t * 3600) * season[m] * (0.97 + rnd() * 0.06);
      if (y === 2026 && m === 8) v *= 1.11;      // licence-renewal campaign, Sep 2026
      if (y === 2026 && m === 9) v *= 0.985;     // licensing outage, Oct 2026
      out.push({ key: `${y}-${String(m + 1).padStart(2, '0')}`, y, m, v: Math.round(v) });
    }
  }
  return out;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nf = new Intl.NumberFormat('en-AU');
const fmtK = v => (v >= 1e6 ? (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : Math.round(v / 1000) + 'k');
const pct = x => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1) + '%';

function initCompare() {
  const host = document.getElementById('vc-chart');
  if (!host) return;
  const months = makeMonths();
  const state = { view: 'monthly', cmp: '3y' };
  const figs = document.getElementById('vc-figs');

  const valueAt = (i, view) => {
    if (view === 'monthly') return months[i].v;
    if (i < 11) return null;
    let s = 0; for (let k = i - 11; k <= i; k++) s += months[k].v;
    return s;
  };
  const lag = { '1y': 12, '3y': 36, none: 0 };

  const draw = () => {
    const last = months.length - 1;
    const start = state.view === 'rolling' ? 11 : 0;
    const showFrom = start + lag[state.cmp];
    // Plot the latest 22 months (or as many as the comparison allows)
    const from = Math.max(showFrom, last - 21);
    const idx = []; for (let i = from; i <= last; i++) idx.push(i);
    const cur = idx.map(i => valueAt(i, state.view));
    const cmp = state.cmp === 'none' ? null : idx.map(i => valueAt(i - lag[state.cmp], state.view));

    const W = Math.max(320, Math.round(host.clientWidth || 640)), H = 250, pl = 48, pr = 26, pt = 16, pb = 30;
    const all = cur.concat(cmp || []).filter(v => v != null);
    const hi = Math.max(...all) * 1.08, lo = Math.min(...all) * 0.85;
    const step = (() => { const r = (hi - lo) / 4, mag = 10 ** Math.floor(Math.log10(r)), f = r / mag; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag; })();
    const t0 = Math.floor(lo / step) * step, ticks = []; for (let v = t0; v <= hi + step / 2; v += step) ticks.push(v);
    const top = ticks[ticks.length - 1];
    const X = k => pl + k * (W - pl - pr) / Math.max(1, idx.length - 1);
    const Y = v => pt + (H - pt - pb) * (1 - (v - t0) / (top - t0));
    const line = vals => vals.map((v, k) => `${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    let g = '';
    ticks.forEach(t => { g += `<line class="vc-grid" x1="${pl}" x2="${W - pr}" y1="${Y(t)}" y2="${Y(t)}"/><text class="vc-y" x="${pl - 8}" y="${Y(t) + 4}">${fmtK(t)}</text>`; });
    const every = Math.ceil(idx.length / (W < 480 ? 4 : 8));
    idx.forEach((i, k) => { if (k % every === 0 || k === idx.length - 1) g += `<text class="vc-x" x="${X(k)}" y="${H - 8}" text-anchor="middle">${MON[months[i].m]} ${String(months[i].y).slice(2)}</text>`; });
    if (cmp) g += `<polyline class="vc-cmp" points="${line(cmp)}"/>`;
    g += `<polyline class="vc-cur" points="${line(cur)}"/><circle class="vc-end" cx="${X(idx.length - 1)}" cy="${Y(cur[cur.length - 1])}" r="4"/>`;

    const lastV = cur[cur.length - 1], lastCmp = cmp ? cmp[cmp.length - 1] : null;
    const label = state.view === 'rolling' ? '12 months to Oct 2026' : 'October 2026';
    const cmpLabel = { '1y': 'a year earlier', '3y': '3 years earlier', none: '' }[state.cmp];
    const summary = `Completed transactions, ${label}: ${nf.format(lastV)}` + (lastCmp ? `, against ${nf.format(lastCmp)} ${cmpLabel} (${pct(lastV / lastCmp - 1)}).` : '.');
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${summary}">${g}</svg>`;
    figs.innerHTML = `<div class="vc-fig lead"><b>${nf.format(lastV)}</b><span>${label}</span></div>` +
      (lastCmp ? `<div class="vc-fig"><b>${nf.format(lastCmp)}</b><span>${cmpLabel}</span></div><div class="vc-fig"><b>${pct(lastV / lastCmp - 1)}</b><span>change</span></div>` : '');
    document.getElementById('vc-legend').innerHTML = `<span><i class="cur"></i>This period</span>` + (cmp ? `<span><i class="cmp"></i>Same months ${cmpLabel}</span>` : '');
  };

  document.querySelectorAll('[data-vc]').forEach(b => b.addEventListener('click', () => {
    const [k, v] = b.dataset.vc.split(':');
    state[k] = v;
    document.querySelectorAll(`[data-vc^="${k}:"]`).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  }));
  let w = 0;
  new ResizeObserver(() => { if (Math.abs(host.clientWidth - w) > 20) { w = host.clientWidth; draw(); } }).observe(host);
  draw();
}

initJourney();
initCompare();

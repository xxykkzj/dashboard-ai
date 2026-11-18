/**
 * Vision page: a scroll story in four chapters.
 * - Sections fade in as they reach the screen ([data-reveal] gets .in).
 * - In chapter 2, the layer nearest the middle of the screen is highlighted.
 * - Chapter dots on wide screens show where the reader is.
 * - Chapter 4 plays a short, illustrative Copilot exchange.
 * - "Compared with 3 years ago" demo in chapter 3.
 * Reduced motion: everything shows at once and nothing moves (see vision.css).
 */
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const hasIO = 'IntersectionObserver' in window;

function initReveal() {
  const els = [...document.querySelectorAll('[data-reveal]')];
  if (!hasIO || reduce.matches) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); onReveal(en.target); }
  }), { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  els.forEach(e => io.observe(e));
}
const revealHooks = [];
const onReveal = el => revealHooks.forEach(h => h(el));

function initLayers() {
  const layers = [...document.querySelectorAll('.layer')];
  if (!layers.length || !hasIO) return;
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) layers.forEach(l => l.classList.toggle('on', l === en.target));
  }), { rootMargin: '-45% 0px -45% 0px' });
  layers.forEach(l => io.observe(l));
}

function initChapterDots() {
  const nav = document.querySelector('.ch-dots');
  if (!nav || !hasIO) return;
  const links = [...nav.querySelectorAll('a')];
  const secs = links.map(a => document.getElementById(a.dataset.ch));
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    links.forEach(a => a.setAttribute('aria-current', String(a.dataset.ch === en.target.id)));
  }), { rootMargin: '-40% 0px -55% 0px' });
  secs.forEach(s => s && io.observe(s));
  const hero = document.querySelector('.hero');
  new IntersectionObserver(([en]) => nav.classList.toggle('show', !en.isIntersecting)).observe(hero);
}

function initChat(months) {
  const chat = document.querySelector('.chat');
  if (!chat) return;
  const last = months[months.length - 1], then = months[months.length - 37];
  const change = last.v / then.v - 1;
  const ans = document.getElementById('chat-ans');
  ans.innerHTML = `<b>${nf.format(last.v)}</b> completed transactions in ${MONTH_LONG[last.m]} ${last.y}, up <b>${Math.round(change * 100)}%</b> on ${MONTH_LONG[then.m]} ${then.y} (${nf.format(then.v)}).` +
    `<small>Source: "Completed transactions" measure, mySA GOV semantic model. Numbers are made up for this page.</small>`;
  const parts = [...chat.querySelectorAll('[data-chat]')];
  const typing = chat.querySelector('.typing');
  const play = () => {
    if (reduce.matches) { parts.forEach(p => p.classList.add('shown')); typing.hidden = true; return; }
    ans.hidden = true; typing.hidden = false;
    setTimeout(() => parts[0].classList.add('shown'), 300);
    setTimeout(() => parts[1].classList.add('shown'), 1300);
    setTimeout(() => { typing.hidden = true; ans.hidden = false; }, 2900);
    setTimeout(() => parts[2].classList.add('shown'), 3500);
  };
  if (!hasIO || reduce.matches) { play(); return; }
  revealHooks.push(el => { if (el === chat) play(); });
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

const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nf = new Intl.NumberFormat('en-AU');
const fmtK = v => (v >= 1e6 ? (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : Math.round(v / 1000) + 'k');
const pct = x => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1) + '%';

function initCompare(months) {
  const host = document.getElementById('vc-chart');
  if (!host) return;
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

const months = makeMonths();
initCompare(months);
initChat(months);
initLayers();
initChapterDots();
initReveal();

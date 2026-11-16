/**
 * Entry point: loads data, builds tabs and cards, wires filters and
 * drill-down links, and re-renders items when state changes.
 *
 * Address format: #tab or #tab/ITM-id (opens the tab and jumps to that item).
 */
import { CONFIG } from './config.mjs';
import { state, setState, subscribe } from './state.mjs';
import { createSource } from './data/source.mjs';
import { fetchJson } from './data/fetch-json.mjs';
import { TABS, ITEMS, TAB_FOOTERS, STORY } from './items/index.mjs';
import { renderModel } from './items/model.mjs';
import { cardHTML } from './ui/card.mjs';
import { dRange, addDays, escapeHtml } from './ui/format.mjs';
import { initPresent } from './present.mjs';
import { initWanted } from './wanted.mjs';
import { motifSVG } from './ui/motif.mjs';

const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main'), tabsEl = $('#tabs'), announcer = $('#announcer');

let source, ctx;
const cache = new Map();          // query results, keyed by view + params
const dirty = new Set();          // items that need re-rendering when their tab is shown

/* ---------- helpers ---------- */
function announce(msg) {
  announcer.textContent = '';
  requestAnimationFrame(() => { announcer.textContent = msg; });
}

function showBanner(html) {
  const b = $('#banner');
  b.innerHTML = html;
  b.hidden = false;
}

// from is inclusive, to is exclusive (the day after the last day shown)
function paramsFor(item) {
  const to = addDays(source.asAt, 1), from = addDays(to, -state.range);
  return { from, to, range: state.range, platform: state.platform, ...(item.params ? item.params(state, ctx) : {}) };
}

function query(view, params) {
  const key = view + '|' + JSON.stringify(params);
  if (!cache.has(key)) cache.set(key, source.query(view, params).catch(e => { cache.delete(key); throw e; }));
  return cache.get(key);
}

function periodText() {
  const to = source.asAt, from = addDays(to, -(state.range - 1));
  return { now: dRange(from, to, true), before: dRange(addDays(from, -state.range), addDays(from, -1)) };
}

/* ---------- rendering ---------- */
// An item can be on screen twice: in its tab and on a presentation slide.
const bodiesOf = item => [...document.querySelectorAll(`[data-item="${item.id}"] > .body`)].filter(b => !b.closest('[hidden]'));

async function renderItem(item) {
  const bodies = bodiesOf(item);
  if (!bodies.length) return;
  if (bodies.some(b => main.contains(b))) dirty.delete(item.id);
  bodies.forEach(b => b.setAttribute('aria-busy', 'true'));
  try {
    const p = paramsFor(item), also = Object.entries(item.also || {});
    const [data, ...extra] = await Promise.all([query(item.view, p), ...also.map(([, view]) => query(view, p))]);
    const more = Object.fromEntries(also.map(([name], i) => [name, extra[i]]));
    bodies.forEach(b => { if (b.isConnected) item.render(b, data, state, ctx, more); });
  } catch (e) {
    console.error(item.id, e);
    bodies.forEach(b => { b.innerHTML = `<p class="err">Couldn't load ${escapeHtml(item.view)}: ${escapeHtml(e.message)}</p>`; });
  } finally {
    bodies.forEach(b => b.removeAttribute('aria-busy'));
  }
}

function invalidate(items) {
  items.forEach(i => dirty.add(i.id));
  return Promise.all(items.map(renderItem));
}

function buildShell() {
  tabsEl.innerHTML = TABS.map(t => `<a href="#${t.id}" data-tab="${t.id}">${t.label}</a>`).join('');
  main.innerHTML = TABS.map(t => `<section id="panel-${t.id}" aria-labelledby="tab-title" hidden>
      ${t.id === 'model' ? '' : `<div class="grid">${ITEMS.filter(i => i.tab === t.id).map(i => cardHTML(i, state, ctx)).join('')}</div>`}
      ${TAB_FOOTERS[t.id] || ''}
    </section>`).join('');
  renderModel($('#panel-model'));
  ITEMS.forEach(i => dirty.add(i.id));
}

function showPeriod() {
  const p = periodText();
  $('#asat').innerHTML = `<b>${p.now}</b><span>compared with ${p.before}</span>`;
}

async function showTab() {
  const [id, itemId] = location.hash.slice(1).split('/');
  const tab = TABS.find(t => t.id === id) || TABS[0];
  const changed = state.tab !== tab.id || !main.dataset.ready;
  state.tab = tab.id;
  main.dataset.ready = '1';
  TABS.forEach(t => { $(`#panel-${t.id}`).hidden = t.id !== tab.id; });
  tabsEl.querySelectorAll('a').forEach(a => {
    if (a.dataset.tab === tab.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#tab-title').textContent = tab.title;
  $('#tabdesc').textContent = tab.desc;
  document.title = `${tab.label} – mySA GOV Insights`;
  $('#filters').hidden = tab.id === 'model';
  await Promise.all(ITEMS.filter(i => i.tab === tab.id && dirty.has(i.id)).map(renderItem));
  const card = itemId && document.getElementById(itemId);
  if (card && main.contains(card)) {
    card.scrollIntoView({ block: 'start', behavior: 'auto' });
    card.focus({ preventScroll: true });
    card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
  } else if (changed && itemId === undefined && document.activeElement && tabsEl.contains(document.activeElement)) {
    window.scrollTo(0, 0);
  }
}

/* ---------- controls ---------- */
const PLATFORM_TEXT = { all: 'all platforms', ios: 'iPhone', android: 'Android' };

function bindSegment(id, key, toValue) {
  $('#' + id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    setState({ [key]: toValue(b.dataset.v) });
  });
}

// keep every control in step with state, wherever the change came from
function syncControls() {
  document.querySelectorAll('button[data-state]').forEach(b => {
    if (b.closest('.seg')) b.setAttribute('aria-pressed', String(b.dataset.v === String(state[b.dataset.state])));
  });
  document.querySelectorAll('select[data-state]').forEach(s => { s.value = state[s.dataset.state]; });
  [['range', 'range'], ['platform', 'platform']].forEach(([id, key]) =>
    $('#' + id).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(state[key])))));
}

function bindControls() {
  bindSegment('range', 'range', Number);
  bindSegment('platform', 'platform', String);

  // Delegated on the whole page so cards work the same in tabs and on slides.
  document.addEventListener('click', e => {
    // drill-down: data-set changes state; a link's href then moves to the related item
    const go = e.target.closest('[data-set]');
    if (go) { try { setState(JSON.parse(go.dataset.set)); } catch (err) { console.error(err); } return; }
    // card-level controls declare data-state="key"
    const seg = e.target.closest('button[data-state]');
    if (seg) { setState({ [seg.dataset.state]: seg.dataset.v }); return; }
    const how = e.target.closest('.how');
    if (how) {
      const panel = document.getElementById(how.getAttribute('aria-controls'));
      panel.hidden = !panel.hidden;
      how.setAttribute('aria-expanded', String(!panel.hidden));
      return;
    }
    const copy = e.target.closest('.copy');
    if (copy) {
      const code = copy.nextElementSibling;
      const done = t => { copy.textContent = t; setTimeout(() => { copy.textContent = 'Copy SQL'; }, 1500); };
      const fallback = () => {
        const r = document.createRange(); r.selectNodeContents(code);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r); done('Selected');
      };
      try { navigator.clipboard.writeText(code.textContent).then(() => done('Copied'), fallback); } catch { fallback(); }
    }
  });
  document.addEventListener('change', e => {
    const sel = e.target.closest('select[data-state]');
    if (sel) setState({ [sel.dataset.state]: sel.value });
  });

  subscribe(changed => {
    const global = changed.some(k => k === 'range' || k === 'platform');
    const affected = ITEMS.filter(i => (global && i.global !== false) || (i.deps || []).some(k => changed.includes(k)));
    syncControls();
    invalidate(affected);
    if (global) {
      showPeriod();
      announce(`Showing ${periodText().now}, ${PLATFORM_TEXT[state.platform]}.`);
    }
    if (changed.includes('lga')) {
      const l = ctx.lga.lgas.find(x => x.code === state.lga);
      announce(l ? `Council profile shows ${l.name}.` : 'Council profile shows South Australia.');
    }
  });

  window.addEventListener('hashchange', showTab);
}

/* ---------- theme ---------- */
function bindTheme() {
  const btn = $('#theme-btn'), root = document.documentElement;
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  const label = () => { btn.textContent = isDark() ? 'Light theme' : 'Dark theme'; };
  try { const saved = localStorage.getItem('theme'); if (saved === 'dark' || saved === 'light') root.dataset.theme = saved; } catch { /* storage may be blocked */ }
  label();
  btn.addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch { /* fine without it */ }
    label();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', label);
}

/* ---------- start ---------- */
async function boot() {
  bindTheme();
  if (location.protocol === 'file:') return;   // index.html shows instructions
  try {
    const [src, lga, geo] = await Promise.all([createSource(), fetchJson(CONFIG.referenceBasePath + 'lga.json'),
      fetchJson(CONFIG.referenceBasePath + 'sa-lga-2023.topo.json').catch(() => null)]);
    source = src;
    ctx = { lga, geo, threshold: CONFIG.suppressionThreshold };
  } catch (e) {
    console.error(e);
    showBanner(`<p><b>The dashboard couldn't load its data.</b> ${escapeHtml(e.message)}</p>
      <p>Check that the JSON files in <code>data/</code> are valid and that you're viewing the page through a web server.</p>`);
    $('#asat').textContent = 'Not loaded';
    return;
  }
  $('#source-pill').textContent = CONFIG.dataSource === 'api' ? 'Live data' : 'Prototype with mock data';
  showPeriod();
  const motif = motifSVG(ctx.geo);
  ['motif', 'deck-motif'].forEach(id => { $('#' + id).innerHTML = motif; });
  buildShell();
  bindControls();
  initWanted({ announce });
  showTab();

  initPresent({
    STORY, ITEMS, state, announce, periodText, renderItem,
    card: (item, span) => cardHTML(item, state, ctx, { deck: true, span })
  });
}

boot();

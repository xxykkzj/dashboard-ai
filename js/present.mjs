/**
 * Presentation mode: steps through the slides in STORY (js/items/index.mjs)
 * full-width, for walking a meeting through the story on a shared screen.
 *
 * Each slide re-uses the same reporting items and the same data as the tabs,
 * so filters, hover details and drill-down all keep working.
 *
 * Keys: Right / Page Down / Space = next, Left / Page Up = previous,
 * Home / End = first / last, F = full screen, Esc = leave.
 */
import { subscribe } from './state.mjs';
import { escapeHtml } from './ui/format.mjs';

export function initPresent(api) {
  const $ = id => document.getElementById(id);
  const deck = $('deck'), btn = $('present-btn'), stage = $('deck-stage');
  const page = [...document.querySelectorAll('body > :not(#deck):not(#announcer):not(script)')];
  const { STORY, ITEMS } = api;
  let i = 0, on = false, token = 0;

  $('deck-dots').innerHTML = STORY.map((s, k) =>
    `<li><button type="button" data-k="${k}" aria-label="Slide ${k + 1}: ${escapeHtml(s.title)}"></button></li>`).join('');

  async function show(k, { quiet = false } = {}) {
    i = Math.max(0, Math.min(STORY.length - 1, k));
    const slide = STORY[i], mine = ++token;
    const items = slide.items.map(([id, span]) => [ITEMS.find(x => x.id === id), span]).filter(([it]) => it);
    $('deck-count').textContent = `${i + 1} of ${STORY.length}`;
    $('deck-title').textContent = slide.title;
    const intro = $('deck-intro'); intro.classList.remove('in'); void intro.offsetWidth; intro.classList.add('in');
    stage.innerHTML = `<div class="grid">${items.map(([it, span]) => api.card(it, span)).join('')}</div>`;
    stage.scrollTop = 0;
    $('deck-prev').disabled = i === 0;
    $('deck-next').disabled = i === STORY.length - 1;
    $('deck-dots').querySelectorAll('button').forEach((b, n) => { if (n === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    period();
    await Promise.all(items.map(([it]) => api.renderItem(it)));
    if (!quiet && mine === token) api.announce(`Slide ${i + 1} of ${STORY.length}: ${slide.title}`);
  }

  function period() {
    const p = api.periodText();
    $('deck-period').textContent = `${p.now}, compared with ${p.before}`;
  }

  function open() {
    on = true;
    deck.hidden = false;
    document.body.classList.add('presenting');
    page.forEach(el => { el.inert = true; });
    show(0);
    deck.focus();
  }

  function close() {
    on = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    stage.innerHTML = '';
    deck.hidden = true;
    document.body.classList.remove('presenting');
    page.forEach(el => { el.inert = false; });
    btn.focus();
    api.announce('Presentation closed.');
  }

  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (deck.requestFullscreen) deck.requestFullscreen().catch(() => {});
  }
  document.addEventListener('fullscreenchange', () => { $('deck-full').textContent = document.fullscreenElement ? 'Leave full screen' : 'Full screen'; });

  btn.addEventListener('click', open);
  $('deck-exit').addEventListener('click', close);
  $('deck-full').addEventListener('click', fullscreen);
  $('deck-prev').addEventListener('click', () => show(i - 1));
  $('deck-next').addEventListener('click', () => show(i + 1));
  $('deck-dots').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(+b.dataset.k); });

  // Links on a slide lead to tabs, so leave the presentation first.
  stage.addEventListener('click', e => { if (e.target.closest('a[href^="#"]')) close(); });

  document.addEventListener('keydown', e => {
    if (!on || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target, typing = t.matches && t.matches('select, input, textarea');
    const inMap = t.closest && t.closest('.tm-grid');          // arrow keys move between councils there
    const onButton = t.matches && t.matches('button, a');
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (typing) return;
    if ((e.key === 'ArrowRight' && !inMap) || e.key === 'PageDown' || (e.key === ' ' && !onButton)) { e.preventDefault(); show(i + 1); }
    else if ((e.key === 'ArrowLeft' && !inMap) || e.key === 'PageUp') { e.preventDefault(); show(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); show(0); }
    else if (e.key === 'End') { e.preventDefault(); show(STORY.length - 1); }
    else if (e.key === 'f' || e.key === 'F') { fullscreen(); }
  });

  // filters changed while presenting: refresh the period shown in the header
  subscribe(changed => { if (on && changed.some(k => k === 'range' || k === 'platform')) period(); });
}

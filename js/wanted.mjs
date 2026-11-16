/**
 * "Wanted" marks for demos.
 *
 * Each card's id label (ITM-xx) is a toggle. Marking a card records that the
 * audience wants that reporting item. Marks are kept in this browser's
 * localStorage, so they survive a refresh but are not shared with other
 * people or computers. The "Wanted" button in the masthead lists the marked
 * items, copies the list as text, shows only wanted cards, or clears all.
 */
import { ITEMS, TABS } from './items/index.mjs';
import { escapeHtml } from './ui/format.mjs';

const KEY = 'mysagov-insights:wanted';
const STAR = '<svg class="want-i" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 12l-4.2 2.2.8-4.7L1.2 6.2l4.7-.7z"/></svg>';

let wanted = new Set();
try { wanted = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { /* storage blocked: marks last until refresh */ }

const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...wanted])); } catch { /* ignore */ } };
// Built on first use: card.mjs imports this file while the item modules are still loading
let idMap;
const byId = { get: id => (idMap ||= new Map(ITEMS.map(i => [i.id, i]))).get(id), has: id => !!byId.get(id) };
const tabLabel = id => (TABS.find(t => t.id === id) || { label: id }).label;
const sorted = () => [...wanted].filter(id => byId.has(id)).sort();

/** Markup for the card footer toggle (used by card.mjs) */
export function wantButton(id) {
  const on = wanted.has(id);
  return `<button type="button" class="want${on ? ' on' : ''}" data-want="${id}" aria-pressed="${on}"
    title="${on ? 'Wanted. Select to unmark' : 'Mark as wanted'}">${STAR}<span class="want-id">${id}</span><span class="want-word">${on ? 'Wanted' : ''}</span></button>`;
}

export function initWanted({ announce = () => {} } = {}) {
  const btn = document.getElementById('wanted-btn');
  const dlg = document.getElementById('wanted-dlg');
  const list = dlg.querySelector('.wd-list');
  const only = dlg.querySelector('#wd-only');
  const clearBtn = dlg.querySelector('[data-wd="clear"]');
  let confirmClear = false;

  const paintCards = () => {
    document.querySelectorAll('button.want[data-want]').forEach(b => {
      const on = wanted.has(b.dataset.want);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.title = on ? 'Wanted. Select to unmark' : 'Mark as wanted';
      b.querySelector('.want-word').textContent = on ? 'Wanted' : '';
    });
    document.querySelectorAll('.card[data-item]').forEach(c => c.classList.toggle('is-wanted', wanted.has(c.dataset.item)));
    btn.querySelector('.wb-n').textContent = wanted.size;
    btn.classList.toggle('has', wanted.size > 0);
  };

  const paintList = () => {
    const ids = sorted();
    list.innerHTML = ids.length
      ? ids.map(id => { const i = byId.get(id); return `<li><a href="#${i.tab}/${id}" data-wd-go>${id}</a>
          <span><b>${escapeHtml(i.title)}</b><small>${escapeHtml(tabLabel(i.tab))}</small></span>
          <button type="button" class="wd-x" data-want="${id}" aria-label="Unmark ${id}">Remove</button></li>`; }).join('')
      : '<li class="wd-empty">Nothing marked yet. Select the star next to an item number, for example ITM-05, at the bottom of any card.</li>';
    clearBtn.disabled = !ids.length;
    confirmClear = false;
    clearBtn.textContent = 'Clear all';
  };

  const toggle = id => {
    if (wanted.has(id)) wanted.delete(id); else wanted.add(id);
    save(); paintCards(); if (dlg.open) paintList();
    const i = byId.get(id);
    announce(`${id} ${i ? i.title : ''} ${wanted.has(id) ? 'marked as wanted' : 'unmarked'}. ${wanted.size} wanted.`);
  };

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-want]');
    if (t) { e.preventDefault(); toggle(t.dataset.want); }
  });

  btn.addEventListener('click', () => { paintList(); dlg.showModal(); });
  dlg.addEventListener('click', e => {
    if (e.target === dlg || e.target.closest('[data-wd="close"]')) { dlg.close(); return; }
    if (e.target.closest('[data-wd-go]')) { dlg.close(); return; }   // the link's hash moves to the item
    if (e.target.closest('[data-wd="copy"]')) {
      const text = sorted().map(id => { const i = byId.get(id); return `${id}  ${i.title} (${tabLabel(i.tab)})`; }).join('\n');
      const out = dlg.querySelector('.wd-msg');
      navigator.clipboard.writeText(text).then(() => { out.textContent = 'Copied the list.'; },
        () => { out.textContent = 'Copy is blocked here. Select the list and copy it instead.'; });
      return;
    }
    if (e.target.closest('[data-wd="clear"]')) {
      if (!confirmClear) { confirmClear = true; clearBtn.textContent = 'Select again to clear all'; return; }
      wanted.clear(); save(); paintCards(); paintList(); announce('All wanted marks cleared.');
    }
  });
  only.addEventListener('change', () => {
    document.body.classList.toggle('wanted-only', only.checked);
    announce(only.checked ? 'Showing wanted items only.' : 'Showing all items.');
  });

  paintCards();
}

/**
 * Card shell shared by every reporting item: title, optional control,
 * the chart body, and the "How it's built" panel with tables, fields,
 * logic, the API view name and the SQL.
 *
 * The same shell is used in presentation mode ({ deck: true }), where the
 * build panel is left out and the card takes the span the slide asks for.
 */
import { wantButton } from '../wanted.mjs';
import { escapeHtml } from './format.mjs';

export function cardHTML(item, state, ctx, { deck = false, span } = {}) {
  const b = item.build, id = (deck ? 'deck-' : '') + item.id;
  const views = [item.view, ...Object.values(item.also || {})];
  return `<article class="card ${span || item.span}${item.kind ? ' card-' + item.kind : ''}" id="${id}" data-item="${item.id}" aria-labelledby="${id}-t" tabindex="-1">
    <header class="chead">
      <div class="t"><h3 id="${id}-t">${escapeHtml(item.title)}</h3><p class="sub">${escapeHtml(item.sub)}</p></div>
      ${item.control ? `<div class="ctrl">${item.control(state, ctx, id)}</div>` : ''}
    </header>
    <div class="body" aria-busy="true"><div class="skeleton"></div></div>
    ${deck ? '' : `<footer class="cfoot">
      <button class="how" type="button" aria-expanded="false" aria-controls="${id}-b"><span class="chev" aria-hidden="true"></span>How it's built</button>
      ${wantButton(item.id)}
    </footer>
    <div class="build" id="${id}-b" hidden>
      <dl>
        <dt>Tables</dt><dd class="chips">${b.sources.map(s => `<span class="chip">${escapeHtml(s)}</span>`).join('')}</dd>
        <dt>Fields</dt><dd class="fields">${escapeHtml(b.fields)}</dd>
        <dt>Logic</dt><dd>${escapeHtml(b.logic)}</dd>
        <dt>API ${views.length > 1 ? 'views' : 'view'}</dt><dd class="chips">${views.map(v => `<code class="chip">${v}</code>`).join('')}</dd>
      </dl>
      <div class="sqlbox"><button class="copy" type="button">Copy SQL</button><pre><code>${escapeHtml(b.sql)}</code></pre></div>
    </div>`}
  </article>`;
}

/** Segmented control bound to a state key, e.g. segControl('mapMetric', 'Measure', [['per1000','Per 1,000'], …], current, id) */
export function segControl(key, label, options, current, scope = '') {
  const id = `seg-${key}-${scope}`;
  return `<span class="flabel" id="${id}">${escapeHtml(label)}</span>
    <div class="seg sm" role="group" aria-labelledby="${id}">${options.map(([v, t]) =>
      `<button type="button" data-state="${key}" data-v="${v}" aria-pressed="${v === current}">${escapeHtml(t)}</button>`).join('')}</div>`;
}

/** Select bound to a state key */
export function selectControl(key, label, options, current) {
  return `<label><span class="flabel">${escapeHtml(label)}</span><select data-state="${key}">${options.map(([v, t]) =>
    `<option value="${v}"${v === current ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select></label>`;
}

/** Design tokens page: draws a swatch for each colour token with its current value. */
const GROUPS = {
  'sw-surfaces': [['--bg', 'Page background'], ['--surface', 'Cards'], ['--surface-2', 'Tracks, code, quiet panels'], ['--ink', 'Text'], ['--muted', 'Secondary text'], ['--line', 'Borders'], ['--line-strong', 'Rules above figures']],
  'sw-mast': [['--mast', 'Masthead and cover'], ['--mast-ink', 'Text on the cover'], ['--mast-muted', 'Secondary text on the cover'], ['--mast-line', 'Borders on the cover'], ['--mast-hi', 'Copper: current tab, primary action'], ['--motif', 'Boundary drawing']],
  'sw-data': [['--accent', 'Series 1, links'], ['--accent-soft', 'Hover and chips'], ['--accent2', 'Series 2'], ['--neutral', 'Comparison, "everything else"']],
  'sw-status': [['--good', 'On track'], ['--good-soft', 'On track chip'], ['--warn', 'Watch'], ['--warn-soft', 'Watch chip'], ['--bad', 'Action'], ['--bad-soft', 'Action chip']],
  'sw-seq': [['--seq-1', 'Lowest'], ['--seq-2', ''], ['--seq-3', ''], ['--seq-4', ''], ['--seq-5', 'Highest']]
};
function draw() {
  const cs = getComputedStyle(document.documentElement);
  Object.entries(GROUPS).forEach(([id, list]) => {
    document.getElementById(id).innerHTML = list.map(([name, use]) =>
      `<li><i style="background:var(${name})"></i><span>${name}</span><small>${cs.getPropertyValue(name).trim()}${use ? ' · ' + use : ''}</small></li>`).join('');
  });
  document.querySelectorAll('[data-token]').forEach(el => { el.textContent = cs.getPropertyValue(el.dataset.token).trim(); });
}
draw();
document.addEventListener('doc-theme', draw);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);

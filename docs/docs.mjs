/**
 * Small helpers shared by every docs page: theme switch (same setting as the
 * dashboard), "copy" buttons on code blocks, and the current-page marker.
 */
const root = document.documentElement;
const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
try { const saved = localStorage.getItem('theme'); if (saved === 'dark' || saved === 'light') root.dataset.theme = saved; } catch { /* storage may be blocked */ }

const btn = document.getElementById('doc-theme');
if (btn) {
  const label = () => { btn.textContent = isDark() ? 'Light theme' : 'Dark theme'; };
  label();
  btn.addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch { /* fine without it */ }
    label();
    document.dispatchEvent(new CustomEvent('doc-theme'));
  });
}

document.querySelectorAll('.doc-code').forEach(fig => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'doc-copy'; b.textContent = 'Copy';
  b.addEventListener('click', () => {
    const text = fig.querySelector('pre').textContent;
    const done = t => { b.textContent = t; setTimeout(() => { b.textContent = 'Copy'; }, 1500); };
    const select = () => { const r = document.createRange(); r.selectNodeContents(fig.querySelector('pre')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); done('Selected'); };
    try { navigator.clipboard.writeText(text).then(() => done('Copied'), select); } catch { select(); }
  });
  fig.appendChild(b);
});

// On phones the contents list starts closed so the page content comes first
const nav = document.querySelector('.doc-nav');
if (nav && matchMedia('(max-width: 860px)').matches) nav.removeAttribute('open');

/* reef demo — shared shell: data loading, i18n, nav state, reveal-on-scroll */

export const state = { lang: 'ko', strings: null, ev: null, digest: null, qa: null };

const LS_KEY = 'reef-demo-lang';

async function loadData() {
  const base = document.body.dataset.base || '.';
  const [strings, ev, digest] = await Promise.all([
    fetch(`${base}/data/strings.json`, { cache: 'no-cache' }).then(r => r.json()),
    fetch(`${base}/data/evidence.json`, { cache: 'no-cache' }).then(r => r.json()),
    fetch(`${base}/data/digest.json`, { cache: 'no-cache' }).then(r => r.json()).catch(() => ({ items: [] })),
  ]);
  state.strings = strings;
  state.ev = ev;
  state.digest = digest;
}

export function t(key, vars) {
  const entry = state.strings?.[key];
  if (!entry) return `⟨${key}⟩`;
  const s = entry[state.lang] ?? entry.ko ?? `⟨${key}⟩`;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
}

/* Values any copy string may interpolate. They come from evidence.json, so a count in
   a sentence and the same count in a figure can never drift apart. */
export function copyVars() {
  const c = state.ev?.fixture?.counts || {};
  return { repos: c.fixture_repos, files: c.fixture_files, docs: c.source_docs };
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n, copyVars());
  });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  document.documentElement.lang = state.lang === 'ko' ? 'ko' : 'en';
  document.querySelectorAll('.lang button').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang));
  });
  document.dispatchEvent(new CustomEvent('reef:lang', { detail: { lang: state.lang } }));
}

function wireLang() {
  document.querySelectorAll('.lang button').forEach(b => {
    b.addEventListener('click', () => {
      state.lang = b.dataset.lang;
      try { localStorage.setItem(LS_KEY, state.lang); } catch {}
      applyI18n();
    });
  });
}

function wireNav() {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a').forEach(a => {
    if ((a.getAttribute('href') || '').endsWith(here)) a.setAttribute('aria-current', 'page');
  });
}

/* Reveal sections as they enter. Scroll advances scenes; it does not reveal paragraphs. */
function wireReveal() {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.dataset.active = 'true';
        e.target.dispatchEvent(new CustomEvent('reef:enter'));
      }
    });
  }, { threshold: 0.35 });
  document.querySelectorAll('.beat').forEach(b => io.observe(b));
}

export async function boot(afterI18n) {
  try { state.lang = localStorage.getItem(LS_KEY) || 'ko'; } catch {}
  await loadData();
  wireLang();
  wireNav();
  applyI18n();
  wireReveal();
  if (afterI18n) {
    afterI18n();
    document.addEventListener('reef:lang', afterI18n);
  }
  return true;
}

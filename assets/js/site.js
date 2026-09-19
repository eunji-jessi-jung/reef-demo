/* reef demo — shared shell: data loading, i18n, nav state, reveal-on-scroll */

export const state = { lang: 'ko', strings: null, ev: null, digest: null, qa: null, sources: null };

const LS_KEY = 'reef-demo-lang';

async function loadData() {
  const base = document.body.dataset.base || '.';
  const get = (name, fallback) =>
    fetch(`${base}/data/${name}`, { cache: 'no-cache' }).then(r => r.json()).catch(() => fallback);
  const [strings, ev, digest, sources] = await Promise.all([
    get('strings.json', {}),
    get('evidence.json', {}),
    get('digest.json', { items: [] }),
    get('sources-manifest.json', { groups: [], files_n: 0 }),
  ]);
  state.strings = strings;
  state.ev = ev;
  state.digest = digest;
  state.sources = sources;
}

export function t(key, vars) {
  const entry = state.strings?.[key];
  if (!entry) return `⟨${key}⟩`;
  const s = entry[state.lang] ?? entry.ko ?? `⟨${key}⟩`;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
}

/* Values any copy string may interpolate. They come from evidence.json and the source
   manifest, so a count in a sentence and the same count in a figure can never drift
   apart — and neither can drift from the repositories they were generated out of. */
const kTok = n => (n ? `${(n / 1000).toFixed(1)}K` : null);

export function copyVars() {
  const ev = state.ev || {};
  const f = ev.fixture?.counts || {};
  const r = ev.reef?.counts || {};
  const e = ev.evaluation || {};
  const l = ev.loop || {};
  return {
    repos: f.fixture_repos,
    docs: f.source_docs,
    artifacts: r.artifacts,
    facts: state.digest?.facts,
    sourced: state.digest?.facts_sourced,
    unsourced: state.digest ? state.digest.facts - state.digest.facts_sourced : null,
    unknowns: r.unknowns,
    owner: r.owner_questions,
    questions: e.questions,
    answered: e.answered,
    partial: e.partial,
    understated: e.self_understated,
    report: e.report,
    frag: e.fragments_total,
    changed: l.changed_files,
    gone: l.artifacts_gone_false,
    refreshed: l.artifacts_refreshed,
    verified: ev.external?.eth?.verified,
    /* How long this reef took, read off its own log by tools/build-evidence.py. */
    drafts: ev.build?.drafts,
    drafts_min: ev.build?.drafts_min,
    full_hours: ev.build?.full_hours,
    log_entries: ev.build?.entries,
    /* The no-reef arm's inventory, straight from the manifest the proxy was built from. */
    files: state.sources?.files_n,
    /* Context actually given to each arm, as the API reported it on a recorded run. */
    reefTok: kTok(state.qa?.recorded?.context_tokens?.reef),
    rawTok: kTok(state.qa?.recorded?.context_tokens?.raw),
    recordedAt: state.qa?.recorded?.at,
  };
}

/* Copy carries a little inline markup — `identifiers` and **emphasis** — because a
   sentence about SANGTAE_CD reads wrong without it. Escaped first, so a string file is
   never a way to inject markup. */
export function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function md(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

export function applyI18n(root = document) {
  const vars = copyVars();
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n, vars);
  });
  root.querySelectorAll('[data-md]').forEach(el => {
    el.innerHTML = md(t(el.dataset.md, vars));
  });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
    el.title = t(el.dataset.i18nAria);
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

/* The bar wraps on a narrow screen, so its height is not a constant and main cannot
   reserve a fixed number. Measured instead, and kept measured. */
/* The menu only exists on a phone; on a wider screen the group is always visible and
   the button is not rendered. Closing on navigation is not needed — every link leaves
   the page — but closing on Escape and on a link tap keeps it from covering content. */
function wireMenu() {
  const btn = document.querySelector('[data-menu-toggle]');
  const group = document.getElementById('gnb');
  if (!btn || !group) return;
  const close = () => { delete group.dataset.open; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => {
    const open = group.hasAttribute('data-open');
    if (open) close();
    else { group.dataset.open = ''; btn.setAttribute('aria-expanded', 'true'); }
  });
  group.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

function trackBarHeight() {
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  const set = () => document.documentElement.style.setProperty('--bar', `${bar.offsetHeight}px`);
  set();
  if ('ResizeObserver' in window) new ResizeObserver(set).observe(bar);
  else addEventListener('resize', set);
  document.addEventListener('reef:lang', set);
}

function wireNav() {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a').forEach(a => {
    if ((a.getAttribute('href') || '').endsWith(here)) a.setAttribute('aria-current', 'page');
  });
}

export async function boot(afterI18n) {
  try { state.lang = localStorage.getItem(LS_KEY) || 'ko'; } catch {}
  await loadData();
  wireLang();
  wireMenu();
  trackBarHeight();
  wireNav();
  applyI18n();
  if (afterI18n) {
    afterI18n();
    document.addEventListener('reef:lang', afterI18n);
  }
  return true;
}

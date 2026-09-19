/* reef demo — shared shell: data loading, i18n, nav state, reveal-on-scroll */

export const state = { lang: 'ko', strings: null, ev: null, digest: null, qa: null, sources: null };

const LS_KEY = 'reef-demo-lang';

async function loadData() {
  const base = document.body.dataset.base || '.';
  const get = (name, fallback) =>
    fetch(`${base}/data/${name}`, { cache: 'no-cache' }).then(r => r.json()).catch(() => fallback);
  /* digest.json is the single largest file here (250KB+) and nothing on first paint
     reads it — only a click on a citation chip does, well after the page is up. It
     still starts alongside everything else, so it is not slow when it IS needed —
     it just is not one of the things loadData() makes the page wait for. Whoever
     reads state.digest before then awaits state.digestReady instead. */
  state.digestReady = get('digest.json', { items: [] }).then(d => { state.digest = d; return d; });
  /* qa.json is part of the shell load rather than the pair modules' own, because the
     recorded run's context sizes are interpolated into copy. Fetched after the first
     applyI18n, {reefTok} and {rawTok} render as null. */
  const [strings, ev, sources, qa] = await Promise.all([
    get('strings.json', {}),
    get('evidence.json', {}),
    get('sources-manifest.json', { groups: [], files_n: 0 }),
    get('qa.json', { items: [] }),
  ]);
  state.strings = strings;
  state.ev = ev;
  state.sources = sources;
  state.qa = qa;
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
  const rs = ev.runs || {};
  return {
    /* What three of the runs recorded about themselves, read back out of log.md. */
    discovered: rs.snorkel?.answered,
    discovery: rs.snorkel?.questions,
    askQ: rs.ask?.questions,
    askUnknowns: rs.ask?.unknowns,
    askArtifacts: rs.ask?.artifacts,
    skills: ev.plugin?.skills,
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

/* The pages are read in an order — what it is, then try it, then check it — so each
   one ends with the way on and the way back. Kept here because the sequence is a fact
   about the site, and three copies of it in three footers is three chances to drift. */
const PAGES = [
  { file: 'index.html', key: 'nav.home' },
  { file: 'try.html', key: 'nav.try' },
  { file: 'about.html', key: 'nav.about' },
];

function renderPager() {
  const host = document.querySelector('.pager');
  if (!host) return;
  const here = location.pathname.split('/').pop() || 'index.html';
  const i = PAGES.findIndex(p => p.file === here);
  if (i < 0) { host.hidden = true; return; }
  host.setAttribute('aria-label', t('ui.pager'));

  /* The ends of the sequence keep their empty cell, so the one link that is there
     stays on its own side instead of sliding into the middle. */
  const cell = (page, dir) => {
    if (!page) return '<span class="pager-gap"></span>';
    const arrow = dir === 'prev' ? '&#8592;' : '&#8594;';
    return `<a class="pager-link pager-${dir}" href="${page.file}">
      <span class="pager-dir">${dir === 'prev' ? arrow + ' ' : ''}${esc(t(`pager.${dir}`))}${dir === 'next' ? ' ' + arrow : ''}</span>
      <b>${esc(t(page.key))}</b>
    </a>`;
  };
  host.innerHTML = cell(PAGES[i - 1], 'prev') + cell(PAGES[i + 1], 'next');
}

/* The three public repositories, in the order they are worth opening: the plugin,
   the fixture it was pointed at, and what it produced. The URLs come from
   evidence.json; the name is read off the end of each one rather than typed again. */
const REPOS = ['plugin', 'fixture', 'reef'];

function renderRepos() {
  const host = document.querySelector('.foot-repos');
  if (!host) return;
  const urls = state.ev?.repos || {};
  host.setAttribute('aria-label', t('ui.repos'));
  host.innerHTML = REPOS.filter(k => urls[k])
    .map(k => `<a href="${esc(urls[k])}" target="_blank" rel="noopener">${esc(urls[k].split('/').pop())}</a>`)
    .join('<span class="foot-repos-sep" aria-hidden="true">·</span>');
}

function wireNav() {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a').forEach(a => {
    if ((a.getAttribute('href') || '').endsWith(here)) a.setAttribute('aria-current', 'page');
  });
}

/* Marks the page ready to be seen. Called once, by each page, at the point its own
   render sequence actually finishes — see the CSS: the page fades in from here
   rather than popping in piece by piece as each fetch happens to resolve. */
export function reveal() {
  document.documentElement.classList.add('is-ready');
}

export async function boot(afterI18n) {
  try { state.lang = localStorage.getItem(LS_KEY) || 'ko'; } catch {}
  await loadData();
  wireLang();
  wireMenu();
  trackBarHeight();
  wireNav();
  applyI18n();
  renderPager();
  renderRepos();
  document.addEventListener('reef:lang', () => { renderPager(); renderRepos(); });
  if (afterI18n) {
    afterI18n();
    document.addEventListener('reef:lang', afterI18n);
  }
  return true;
}

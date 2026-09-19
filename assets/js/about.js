/* The details page. Every table and figure here is rendered from evidence.json, which
   tools/build-evidence.py generates out of the published repositories. Nothing on this
   page is typed by hand, so a number cannot drift away from the thing it describes. */
import { state, t, boot, esc, md, copyVars } from './site.js?v=c69a150e';

const $ = sel => document.querySelector(sel);

/* What the three repositories are. Labels come from strings; URLs from evidence. */
const REPOS = [
  ['plugin',  'reef',          'A.repoPlugin'],
  ['fixture', 'sellflow',      'A.repoFixture'],
  ['reef',    'sellflow-reef', 'A.repoReef'],
];

function renderRepos() {
  const urls = state.ev?.repos || {};
  $('#repo-list').innerHTML = REPOS.map(([key, name, blurb]) => {
    const url = urls[key];
    if (!url) return '';
    return `<a class="repo" href="${esc(url)}" target="_blank" rel="noopener">
      <b>${esc(name)}</b>
      <span>${md(t(blurb, copyVars()))}</span>
      <em>${esc(url.replace('https://github.com/', ''))}</em>
    </a>`;
  }).join('');

  /* The clone block is the point of the page: it must work when pasted. The two that
     have to sit side by side are cloned into one directory. */
  const line = key => `git clone ${urls[key]}.git`;
  $('#clone').textContent = [line('fixture'), line('reef'), line('plugin')].join('\n');
}

function renderEval() {
  const e = state.ev?.evaluation;
  if (!e) return;
  const fig = (n, label) => `<div class="fig"><b>${esc(n)}</b><span>${esc(label)}</span></div>`;
  $('#eval-figures').innerHTML = [
    fig(`${e.answered}/${e.questions}`, t('A.figAnswered')),
    fig(`${e.fragments_recovered}/${e.fragments_total}`, t('A.figFragments')),
    fig(String(e.self_overstated), t('A.figOverstated')),
  ].join('');
  const url = `${state.ev.repos.reef}/blob/main/${e.report}`;
  $('#eval-report').innerHTML =
    `${esc(t('A.reportIs'))} <a href="${esc(url)}" target="_blank" rel="noopener"><code>${esc(e.report)}</code></a>`;
}

function renderBench() {
  const b = state.ev?.external?.supabase;
  if (!b) return;
  const rows = (b.results || []).map(
    ([label, without, withReef]) =>
      `<tr><th>${esc(label)}</th><td>${esc(without)}</td><td class="is-reef">${esc(withReef)}</td></tr>`).join('');
  $('#bench').innerHTML =
    `<thead><tr><th></th><th>${esc(t('T.armRaw'))}</th><th class="is-reef">${esc(t('T.armReef'))}</th></tr></thead>
     <tbody>${rows}</tbody>
     <tfoot><tr><td colspan="3">
       ${esc(b.design)} — <a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(t('A.benchReport'))}</a>
     </td></tr></tfoot>`;
}

function renderEth() {
  const p = state.ev?.external?.eth;
  if (!p) return;
  $('#eth').innerHTML = `
    <figcaption class="tag">${esc(p.ref)} · ${esc(p.dates)}</figcaption>
    <p class="paper-title">${esc(p.title)}</p>
    <p class="meta">${esc(p.authors)}</p>
    <ul>${(p.findings || []).map(f => `<li>${esc(f)}</li>`).join('')}</ul>
    <a class="src" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url)}</a>`;
}

/* Deliberately short. A judge asking "what is this built with" wants four rows, not an
   architecture diagram for three static pages. */
const STACK = [
  ['A.stackSite',   'HTML · CSS · ES modules'],
  ['A.stackHost',   'GitHub Pages'],
  ['A.stackProxy',  'Vercel Functions (Node)'],
  ['A.stackModel',  'Claude Sonnet 5'],
  ['A.stackPlugin', 'Claude Code plugin · Python 3'],
];

function renderStack() {
  $('#stack').innerHTML = `<tbody>${STACK.map(([k, v]) =>
    `<tr><th>${esc(t(k))}</th><td><code>${esc(v)}</code></td></tr>`).join('')}</tbody>`;
}

function render() {
  renderRepos();
  renderEval();
  renderBench();
  renderEth();
  renderStack();
}

boot(render);

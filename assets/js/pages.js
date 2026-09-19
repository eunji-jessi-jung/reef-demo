/* reef demo — the why / how / verify pages.
 *
 * Same rule as the landing: the figures, the pipeline log and the external evidence
 * all come from data/evidence.json. The external block is the only hand-maintained
 * part of it, and each entry records the date its primary source was checked.
 */
import { runShot } from './shot.js?v=61b6fd32';
import { boot, state, t } from './site.js?v=27772b03';

const $  = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
const num = n => Number(n).toLocaleString('en-US');

/* ---- why -------------------------------------------------------------- */

function renderPaper(ev) {
  const host = $('#eth');
  if (!host) return;
  const p = ev.external.eth;
  host.innerHTML = `
    <figure class="panel paper-card">
      <figcaption class="tag" data-static>${t('why.challenge')}</figcaption>
      <p class="paper-title">${esc(p.title)}</p>
      <p class="src">${esc(p.authors)} · ${esc(p.ref)} · ${esc(p.dates)}</p>
      <ul class="paper-findings">${p.findings.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <p class="src"><a href="${p.url}" target="_blank" rel="noopener">${p.url}</a>
        · checked ${p.verified}</p>
    </figure>`;
}

function renderBenchmark(ev) {
  const host = $('#supabase');
  if (!host) return;
  const b = ev.external.supabase;
  host.innerHTML = `
    <figure class="panel bench">
      <figcaption class="tag">${esc(b.title)}</figcaption>
      <p class="src">${esc(b.design)}</p>
      <table class="bench-table"><tbody>${b.results.map(([k, a, c]) =>
        `<tr><th>${esc(k)}</th><td>${esc(a)}</td><td class="to">→</td><td class="good">${esc(c)}</td></tr>`
      ).join('')}</tbody></table>
      <p class="tag">what this benchmark says about itself</p>
      <ul class="caveats">${b.caveats.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      <p class="src"><a href="${b.url}" target="_blank" rel="noopener">report</a> · checked ${b.verified}</p>
    </figure>`;
}

/* ---- how -------------------------------------------------------------- */

const PIPELINE = /Source extraction|Snorkel|Scuba|Deep:|Test pass|Owner question|Consistency|update/i;

function renderHow(ev) {
  const figs = $('#how-figures');
  if (!figs) return;
  const c = ev.reef.counts, f = ev.fixture.counts, e = ev.evaluation;
  figs.innerHTML = [
    [f.fixture_repos, 'repositories'], [f.fixture_files, 'fixture files'],
    [c.artifacts, 'artifacts'], [num(c.unknowns), 'recorded unknowns'],
    [c.owner_questions, 'owner questions'], [`${e.answered}/${e.questions}`, 'answered'],
  ].map(([v, l]) => `<div class="figure"><b>${v}</b><span>${l}</span></div>`).join('');

  $('#how-log').innerHTML = ev.log
    .filter(l => PIPELINE.test(l.text))
    .map(l => `<li><span class="when">${esc(l.at)}</span><span>${esc(l.text)}</span></li>`)
    .join('');

  /* One capability that was missing, then five defects that only using it exposed.
     Four of the five broke change detection, which is the pillar this plugin sells. */
  $('#how-plugin').innerHTML = [
    ['/reef:ask — 부재', 'known_unknowns is required on every artifact and referenced 60+ times across the skills, and nothing collected it. Built here, pushed back into the plugin.'],
    ['diff — 결함', 'Artifacts with no snapshot were invisible to change detection: 54 of 80 had one, and the artifact most affected by a change was not in the output. Now expanded through the source-artifact map.'],
    ['snapshot — 결함', 'Snapshots stored under a lowercase id matched no artifact, so 27 of 54 were silently dropped from every comparison.'],
    ['snapshot — 결함', 'An unqualified source ref bound to whichever repository matched first, so an artifact was reported as affected whenever the wrong repo changed.'],
    ['health — 결함', 'It compared against a cached index without refreshing it, so a reef whose sources had moved came back clean — the one answer a health check must never get wrong.'],
    ['index — 결함', 'It recorded the resolved absolute path, putting a home directory into every published copy and undoing the portability of a relative one.'],
  ].map(([k, v]) => `<li><span class="when">${esc(k)}</span><span>${esc(v)}</span></li>`).join('');

  $('#how-arch').innerHTML = [
    ['reef.py — no model calls', 'init · index · snapshot · diff · lint · audit · manifest · unknowns · rebuild-index · rebuild-map · log'],
    ['skills — judgement only', 'init · snorkel · source · scuba · deep · artifact · ask · update · feed · test · health · lint · help'],
  ].map(([k, v]) => `<div class="panel"><p class="tag">${esc(k)}</p><p class="src">${esc(v)}</p></div>`).join('');
}

/* ---- verify ----------------------------------------------------------- */

function renderVerify(ev) {
  const host = $('#v-steps');
  if (!host) return;
  const r = ev.repos;
  $('#v-clone').textContent =
    `git clone ${r.fixture}.git\ngit clone ${r.reef}.git\ngit clone ${r.plugin}.git`;
  $('#v-links').innerHTML = Object.entries(r)
    .map(([k, u]) => `<a class="repo-link" href="${u}" target="_blank" rel="noopener">${k} ↗</a>`).join('');

  const steps = [
    ['verify.v1', 'verify.v1b', 'open sellflow-reef/ANSWER-KEY.md'],
    ['verify.v2', 'verify.v2b', 'open sellflow-reef/.reef/test-report-2026-09-19.md'],
    ['verify.v3', 'verify.v3b',
      'cd sellflow-reef\npython3 ../reef/scripts/reef.py index  --reef .\npython3 ../reef/scripts/reef.py diff   --reef .'],
    ['verify.v4', null,
      'python3 ../reef/scripts/reef.py unknowns --reef . | head -20\nwc -l .reef/questions-for-owner.md'],
  ];
  host.innerHTML = steps.map(([h, b, cmd]) => `
    <li><p class="tag">${esc(t(h))}</p>
      ${b ? `<p class="body">${esc(t(b))}</p>` : ''}
      <pre class="term small">${esc(cmd)}</pre></li>`).join('');
}

boot(() => {
  const ev = state.ev;
  if (!ev) return;
  renderPaper(ev); renderBenchmark(ev); renderHow(ev); renderVerify(ev);
}).then(runShot);

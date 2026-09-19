/* The landing page.
 *
 * Two things move. The grading figures come from evidence.json so the page cannot
 * quote a score the repositories no longer support, and the hero carries a recorded
 * comparison — the product, in the first screen, rather than a click away.
 *
 * The pair is recorded rather than live on purpose: it renders instantly, costs
 * nothing, and is the same every visit. Asking a live question is what try.html is
 * for, and that is where the button goes.
 */
import { state, t, boot, esc } from './site.js?v=8027c50d';
import { addRow, fillRecorded, shortestPair, wireArtifactPanel } from './pair.js?v=f8566019';
import { stageShot, shotReady } from './shot.js?v=3f039834';

function renderBench() {
  const host = document.getElementById('bench');
  const b = state.ev?.external?.supabase;
  if (!host || !b) return;
  const rows = (b.results || []).map(([label, without, withReef]) =>
    `<tr><th>${esc(label)}</th><td>${esc(without)}</td><td class="is-reef">${esc(withReef)}</td></tr>`).join('');
  host.innerHTML =
    `<thead><tr><th></th><th>${esc(t('T.armRaw'))}</th><th class="is-reef">${esc(t('T.armReef'))}</th></tr></thead>
     <tbody>${rows}</tbody>
     <tfoot><tr><td colspan="3">
       ${esc(b.design)} — <a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(t('A.benchReport'))}</a>
     </td></tr></tfoot>`;
}

function renderEval() {
  const host = document.getElementById('eval-figures');
  const e = state.ev?.evaluation;
  if (!host || !e) return;
  const fig = (n, label) => `<div class="fig"><b>${esc(n)}</b><span>${esc(label)}</span></div>`;
  host.innerHTML = [
    fig(`${e.answered}/${e.questions}`, t('A.figAnswered')),
    fig(`${e.fragments_recovered}/${e.fragments_total}`, t('A.figFragments')),
    fig(String(e.self_overstated), t('A.figOverstated')),
  ].join('');
}

/* The shortest recorded pair, so a long answer cannot run past the fold and look
   truncated. Re-renders on a language change because the answers are per language. */
function renderHeroPair() {
  const host = document.getElementById('hero-pair');
  if (!host) return;
  host.innerHTML = '';
  const item = shortestPair(state.lang);
  if (!item) return;
  const q = item.q[state.lang] || item.q.ko;
  fillRecorded(addRow(host, q, 'hero'), item, state.lang);
  markCrop();
}

/* Whether the pair is actually being cut, which depends on the window. Only then does
   the fade at the bottom mean anything. */
function markCrop() {
  const box = document.querySelector('.hero-demo');
  if (!box) return;
  const cropped = box.scrollHeight > box.clientHeight + 4;
  if (cropped) box.dataset.cropped = '';
  else delete box.dataset.cropped;
}

function render() {
  renderBench();
  renderEval();
  renderHeroPair();
}

await stageShot();
await boot(() => { render(); shotReady(); });

/* The answers are loaded after the shell, so the hero pair is drawn once they arrive. */
const base = document.body.dataset.base || '.';
state.qa = await fetch(`${base}/data/qa.json`, { cache: 'no-cache' })
  .then(r => r.json()).catch(() => ({ items: [] }));
renderHeroPair();
wireArtifactPanel(document, document.getElementById('artifact'));
addEventListener('resize', markCrop);
shotReady();

/* The landing page. Its only moving part is the three grading figures, which come
   from evidence.json so the page cannot quote a score the repositories no longer
   support. */
import { state, t, boot, esc } from './site.js?v=b3ed5e9a';
import { stageShot, shotReady } from './shot.js?v=3f039834';

/* The benchmark that answers "does this work anywhere but your fictual company".
   Straight from evidence.json's external.supabase block. */
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

await stageShot();
boot(() => { renderBench(); renderEval(); shotReady(); });

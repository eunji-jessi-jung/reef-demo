/* The landing page. Its only moving part is the three grading figures, which come
   from evidence.json so the page cannot quote a score the repositories no longer
   support. */
import { state, t, boot, esc } from './site.js?v=47ab1988';

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

boot(renderEval);

/* The landing page.
 *
 * The grading figures come from evidence.json so the page cannot quote a score the
 * repositories no longer support; the comparison is recorded; and each step of the
 * skill flow has a replay of that step beside it (cast.js).
 *
 * The pair is recorded rather than live on purpose: it renders instantly, costs
 * nothing, and is the same every visit. Asking a live question is what try.html is
 * for, and that is where the button goes.
 */
import { state, t, boot, esc } from './site.js?v=253c4e71';
import { addRow, fillRecorded, wireArtifactPanel } from './pair.js?v=b55ddb71';
import { startCast } from './cast.js?v=9c527923';
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

/* Which recorded questions the fold offers. Four rather than all eight, because the
   point of the fold is that the reader can act, not that they can read everything —
   try.html carries the rest. The four are chosen to cover the range: a plain question
   of fact, a question about whether a document can be trusted, a question about a
   number, and the one the comparison exists for, which is what nobody can know. */
const FOLD = ['q1', 'q3', 'q4', 'q8'];

function foldItems() {
  const items = state.qa?.items || [];
  const picked = FOLD.map(id => items.find(it => it.id === id)).filter(Boolean);
  return picked.length ? picked : items.slice(0, 4);
}

let current = null;

function renderChips() {
  const host = document.getElementById('hero-qs');
  if (!host) return;
  const items = foldItems();
  if (!items.length) return;
  if (!items.some(it => it.id === current)) current = items[0].id;
  host.innerHTML = items.map(it => {
    const q = it.q[state.lang] || it.q.ko;
    return `<button type="button" data-q="${esc(it.id)}" aria-pressed="${it.id === current}">${esc(q)}</button>`;
  }).join('');
}

/* Re-renders on a language change too, because the answers are recorded per language. */
function renderHeroPair() {
  const host = document.getElementById('hero-pair');
  if (!host) return;
  const item = foldItems().find(it => it.id === current);
  host.innerHTML = '';
  if (!item) return;
  fillRecorded(addRow(host, item.q[state.lang] || item.q.ko, 'hero'), item, state.lang);
}

/* Both arms open together. Expanding one and not the other would make the shorter
   answer look like the complete one. */
function renderMore() {
  const btn = document.getElementById('pair-more');
  const box = document.querySelector('.hero-demo');
  if (!btn || !box) return;
  btn.textContent = t(box.hasAttribute('data-clamped') ? 'L.pairMore' : 'L.pairLess');
}

function wireHero() {
  const chips = document.getElementById('hero-qs');
  const btn = document.getElementById('pair-more');
  const box = document.querySelector('.hero-demo');
  chips?.addEventListener('click', e => {
    const b = e.target.closest('button[data-q]');
    if (!b || b.dataset.q === current) return;
    current = b.dataset.q;
    renderChips();
    renderHeroPair();
  });
  btn?.addEventListener('click', () => {
    if (box.hasAttribute('data-clamped')) box.removeAttribute('data-clamped');
    else box.setAttribute('data-clamped', '');
    renderMore();
  });
}

/* The flow as a stepper on a phone. Steps are the .stage rows in document order,
   across both phases; the phase name travels with the position. Off a phone the
   attribute comes off and the CSS shows the whole column again. */
function wireStepper() {
  const deck = document.getElementById('stage-deck');
  const nav = document.getElementById('stage-nav');
  if (!deck || !nav) return;
  const steps = [...deck.querySelectorAll('.stage')];
  const phaseOf = st => st.closest('.stages')?.previousElementSibling?.textContent || '';
  const mq = matchMedia('(max-width: 900px)');
  let i = 0;

  const show = () => {
    steps.forEach((st, k) => { if (k === i) st.dataset.active = ''; else delete st.dataset.active; });
    nav.querySelector('.stage-phase').textContent = phaseOf(steps[i]);
    nav.querySelector('.stage-count').textContent = `${i + 1} / ${steps.length}`;
    nav.querySelector('.stage-prev').disabled = i === 0;
    nav.querySelector('.stage-next').disabled = i === steps.length - 1;
  };
  const go = d => {
    i = Math.min(steps.length - 1, Math.max(0, i + d));
    show();
    const top = deck.getBoundingClientRect().top;
    if (top < 0) deck.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const apply = () => {
    if (mq.matches) { deck.dataset.stepper = ''; nav.hidden = false; show(); }
    else { delete deck.dataset.stepper; nav.hidden = true; steps.forEach(st => delete st.dataset.active); }
  };
  nav.querySelector('.stage-prev').addEventListener('click', () => go(-1));
  nav.querySelector('.stage-next').addEventListener('click', () => go(1));
  document.addEventListener('reef:lang', show);
  mq.addEventListener('change', apply);
  apply();
}

function render() {
  renderBench();
  renderEval();
  renderChips();
  renderHeroPair();
  renderMore();
}

await stageShot();
await boot(() => { render(); shotReady(); });

/* The answers arrive with the shell, so the hero pair can be drawn straight away. */
renderChips();
renderHeroPair();
renderMore();
wireHero();
wireArtifactPanel(document, document.getElementById('artifact'));
document.querySelectorAll('.cast').forEach(startCast);
wireStepper();
shotReady();

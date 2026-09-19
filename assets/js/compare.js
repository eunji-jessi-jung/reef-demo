/* reef demo — the comparison.
 *
 * One question goes to two arms of the proxy and comes back as two answers, rendered
 * side by side. The arms are held equal in every respect the browser can see and every
 * respect it cannot: same model, same effort, same token ceiling, rules written line
 * for line against each other. One holds the reef's artifacts; the other holds the
 * sellflow sources. That is the whole experiment.
 *
 * Both sides' citations are clickable, and that is the point of the page. A reef
 * citation opens the artifact and what it says it does not know; a source citation
 * opens the actual file on GitHub. Neither side gets to be believed.
 *
 * If the proxy is absent, over budget or unreachable, the page falls back to recorded
 * runs from data/qa.json and says so. It never arrives at a broken state.
 */
import { state, t, boot, esc, copyVars, applyI18n } from './site.js?v=aa474e4a';
import { ARMS, renderAnswer, addRow as addPairRow, fill, fillRecorded,
         shortestPair, wireArtifactPanel } from './pair.js?v=624e1b4b';
import { stageShot, shotReady, shotId } from './shot.js?v=3f039834';

const API = window.REEF_API || '';

let live = Boolean(API);
let offlineKey = 'chat.offline';
const history = { reef: [], raw: [] };
let el = {};
let seq = 0;

/* ---------- asking ---------- */

function addRow(question) {
  return addPairRow(el.compare, question, `cmp${++seq}`);
}

async function ask(question) {
  const id = addRow(question);
  if (live) return askLive(id, question);
  return askRecorded(id, question);
}

/* The fallback. A recorded pair is a real run that was saved, so it is labelled as
   one and never as a live answer. A question with no recorded pair gets an honest
   blank. */
function askRecorded(id, question) {
  const item = (state.qa?.items || []).find(it => it.q.ko === question || it.q.en === question);
  fillRecorded(id, item, state.lang);
}

async function askLive(id, question) {
  el.form?.setAttribute('aria-busy', 'true');
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question,
        arms: ARMS,
        lang: state.lang,
        histories: { reef: history.reef.slice(-6), raw: history.raw.slice(-6) },
      }),
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      /* Budget spent or key missing: stop offering the box, and show what was recorded
         instead of failing twice. */
      if (['budget_spent', 'not_configured'].includes(data.error)) {
        live = false;
        offlineKey = data.error === 'budget_spent' ? 'chat.spent' : 'chat.offline';
      }
      askRecorded(id, question);
      if (!live) syncInput();
      return;
    }

    for (const arm of ARMS) {
      const res = data.arms?.[arm];
      if (!res || res.error) {
        fill(id, arm, `<p class="muted">${esc(t('T.armFail'))}</p>`, res?.error || '');
        continue;
      }
      history[arm].push({ role: 'user', content: question },
                        { role: 'assistant', content: res.answer });
      const usage = res.usage || {};
      const ctx = (usage.cache_read_input_tokens || 0) + (usage.input_tokens || 0)
                + (usage.cache_creation_input_tokens || 0);
      fill(id, arm, renderAnswer(arm, res.answer),
        `${data.model} · ${t('chat.live')}${ctx ? ` · ${Math.round(ctx / 1000)}K tok` : ''}`);
    }
  } catch {
    live = false;
    askRecorded(id, question);
    syncInput();
  } finally {
    el.form?.removeAttribute('aria-busy');
  }
}

/* ---------- the page around it ---------- */

function chips() {
  el.chips.innerHTML = '';
  (state.qa?.items || []).forEach(it => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = it.q[state.lang] || it.q.ko;
    b.addEventListener('click', () => ask(b.textContent));
    el.chips.append(b);
  });
}

/* The source inventory, rendered from the manifest tools/build-corpus.py writes. The
   page cannot claim the no-reef arm was given something it was not. */
function renderSources() {
  const groups = state.sources?.groups || [];
  el.srcGrid.innerHTML = groups.map(g => {
    const isDocs = g.name === 'sellflow-docs';
    return `<div class="src-card${isDocs ? ' is-docs' : ''}">
      <p class="src-name"><code>${esc(g.name)}</code><b>${g.n}</b></p>
      <p class="src-kind">${esc(t(isDocs ? 'T.srcDocs' : 'T.srcCode'))}</p>
      <details><summary>${esc(t('T.srcList'))}</summary>
        <ul>${g.paths.map(p => `<li><code>${esc(p)}</code></li>`).join('')}</ul>
      </details>
    </div>`;
  }).join('');
  el.srcExcluded.innerHTML = (state.sources?.excluded || [])
    .map(x => `<li><code>${esc(x)}</code></li>`).join('');
}

/* The commands, in the order the skills actually run, with the plugin's own install
   line. Kept here rather than in the copy file because it is code, not prose. */
function renderRun() {
  const el2 = document.getElementById('run');
  if (!el2) return;
  const plugin = state.ev?.repos?.plugin || '';
  /* No comments on these lines: the block should read the same in both languages,
     and the copy above already says what each one does. */
  el2.textContent = [
    `/plugin install ${plugin.replace('https://github.com/', '')}`,
    '',
    '/reef:init',
    '/reef:scuba',
    '/reef:test',
    '/reef:update',
  ].join('\n');
}

function syncInput() {
  if (el.form) el.form.hidden = !live;
  if (el.offline) {
    el.offline.hidden = live;
    el.offline.textContent = t(offlineKey);
  }
}

async function mount() {
  const base = document.body.dataset.base || '.';
  state.qa = await fetch(`${base}/data/qa.json`, { cache: 'no-cache' })
    .then(r => r.json()).catch(() => ({ items: [] }));

  el = {
    chips: document.getElementById('chips'),
    form: document.getElementById('ask-form'),
    input: document.querySelector('#ask-form .chat-input'),
    offline: document.getElementById('ask-offline'),
    compare: document.getElementById('compare'),
    srcGrid: document.getElementById('src-grid'),
    srcExcluded: document.getElementById('src-excluded'),
    panel: document.getElementById('artifact'),
    panelTitle: document.querySelector('#artifact .artifact-title'),
    panelBody: document.querySelector('#artifact .artifact-body'),
    panelLink: document.querySelector('#artifact .artifact-link'),
  };

  chips();
  renderSources();
  renderRun();
  syncInput();
  /* qa.json arrives after the shell has filled the copy, and it carries the measured
     context sizes, so the strings that quote them are refilled once it is in. */
  applyI18n();

  el.form?.addEventListener('submit', e => {
    e.preventDefault();
    const v = el.input.value.trim();
    if (!v) return;
    el.input.value = '';
    ask(v);
  });

  wireArtifactPanel(document, el.panel);
}

/* The shell loads the data first; everything here reads it. Chips and the inventory
   are language-dependent and re-render on a language change, but answers already on
   screen are left alone — each was answered in the language it was asked in, and
   re-translating one would be a new claim, not a translation. */
(async () => {
  const shooting = await stageShot();
  await boot();
  await mount();
  document.addEventListener('reef:lang', () => { chips(); renderSources(); });

  /* A screenshot of this page has to show an answered question — an empty chat says
     nothing. The recorded pairs are used rather than the live proxy: instant, free,
     and the same every time, which is what a screenshot needs. */
  if (shooting) {
    live = false;
    if (shotId === 'ask') {
      /* Pick the shortest recorded pair. A 16:9 frame is 900px tall and a long answer
         runs off the bottom mid-sentence, which looks like a bug rather than an answer.
         Choosing by length keeps the shot whole even after the pairs are re-recorded. */
      const len = it => Math.max((it.a?.[state.lang] || it.a?.ko || '').length,
                                 (it.a_raw?.[state.lang] || it.a_raw?.ko || '').length);
      const pick = [...(state.qa?.items || [])].sort((a, b) => len(a) - len(b))[0];
      if (pick) {
        const q = pick.q[state.lang] || pick.q.ko;
        askRecorded(addRow(q), q);
      }
    }
    shotReady();
  }
})();

/* The terminal replay on the landing page.
 *
 * It plays data/cast.json, which tools/build-cast.py assembles from the run log and
 * from reef.py's own output — the page says as much beside it. This file only decides
 * pacing: a command is typed, its output arrives line by line, the clock in the bar
 * jumps to the real timestamp of that milestone, and at the end it holds, clears and
 * goes round again.
 *
 * It does nothing while off screen, because a loop nobody is looking at is a fan
 * spinning for no one; and under prefers-reduced-motion, or in screenshot mode, it
 * lays the whole transcript out at once and stays still.
 */
import { esc } from './site.js?v=c38408c3';

/* Slower than a terminal really is. The first cut typed at forty milliseconds a
   character and nobody could read it; this is the pace of someone watching. */
const T = { char: 64, line: 190, art: 60, afterCmd: 420, scene: 1100, hold: 5200, clear: 420 };

const still = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches ||
  new URLSearchParams(location.search).has('shot');

/* A line's role decides its colour: what the reader typed, what reef asked, what reef
   printed. The cast marks nothing; the shape of the line is enough. */
function classify(line) {
  if (line.startsWith('> ')) return 'ans';
  if (line.startsWith('? ')) return 'ask';
  if (/^[~─━]/.test(line.trim()) || /reef ~$/.test(line)) return 'art';
  return 'out';
}

function lineEl(line, cls) {
  const el = document.createElement('span');
  el.className = `tl ${cls}`;
  el.innerHTML = esc(line) || '&nbsp;';
  return el;
}

export function startCast(root) {
  const body = root.querySelector('.cast-body');
  const clock = root.querySelector('.cast-clock');
  if (!body) return;

  let scenes = [];
  let running = false;
  let visible = false;
  let timer = null;
  let gen = 0;

  const base = document.body.dataset.base || '.';
  fetch(`${base}/data/cast.json`, { cache: 'no-cache' })
    .then(r => r.json())
    .then(cast => {
      /* A player may ask for a subset by scene id — one skill's replay beside that
         skill's description — or, with no attribute, play the whole day. */
      const want = (root.dataset.scene || '').split(',').map(x => x.trim()).filter(Boolean);
      scenes = (cast.scenes || []).filter(sc => !want.length || want.includes(sc.id));
      if (still()) renderStill(); else observe();
    })
    .catch(() => { body.textContent = ''; });

  const sleep = ms => new Promise(res => { timer = setTimeout(res, ms); });
  const atBottom = () => { body.scrollTop = body.scrollHeight; };

  function renderStill() {
    body.innerHTML = '';
    for (const s of scenes) {
      body.appendChild(lineEl(s.cmd, 'in'));
      s.lines.forEach(l => body.appendChild(lineEl(l, classify(l))));
      body.appendChild(lineEl('', 'out'));
    }
    if (clock && scenes.length) {
      const ats = scenes.map(sc => sc.at).filter(Boolean);
      clock.textContent = ats.length > 1 ? `${ats[0]} → ${ats.at(-1)}` : (ats[0] || 'now');
    }
  }

  async function play(myGen) {
    body.innerHTML = '';
    for (const s of scenes) {
      if (myGen !== gen) return;
      if (clock) clock.textContent = s.at || 'now';

      const cmd = lineEl('', 'in');
      const cur = document.createElement('i');
      cur.className = 'cur';
      cmd.appendChild(cur);
      body.appendChild(cmd);
      atBottom();
      for (const ch of s.cmd) {
        if (myGen !== gen) return;
        cur.before(document.createTextNode(ch));
        await sleep(T.char);
      }
      await sleep(T.afterCmd);
      cur.remove();

      for (const l of s.lines) {
        if (myGen !== gen) return;
        const cls = classify(l);
        body.appendChild(lineEl(l, cls));
        atBottom();
        await sleep(cls === 'art' ? T.art : T.line);
      }
      body.appendChild(lineEl('', 'out'));
      await sleep(T.scene);
    }
    if (myGen !== gen) return;
    await sleep(T.hold);
    if (myGen !== gen) return;
    root.dataset.fading = '';
    await sleep(T.clear);
    delete root.dataset.fading;
    if (myGen === gen) play(myGen);
  }

  function start() {
    if (running || !scenes.length) return;
    running = true;
    play(++gen);
  }
  function stop() {
    if (!running) return;
    running = false;
    gen++;
    clearTimeout(timer);
  }

  function observe() {
    const io = new IntersectionObserver(entries => {
      visible = entries.some(e => e.isIntersecting);
      if (visible) start(); else stop();
    }, { threshold: 0.25 });
    io.observe(root);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop(); else if (visible) start();
    });
  }
}

/* Screenshot mode: ?shot=<scene>
 *
 * Submission screenshots have to show a scene mid-interaction — both search panels
 * open, the grep finished, the hops advanced — which a plain page load never does.
 * Rather than drive a browser through the interaction, the page can put itself into
 * the state and say when it is ready. Only active when the query parameter is
 * present, so it costs a normal visitor nothing.
 *
 * Sets document.title to READY when settled, which is what the capture script waits for.
 */
const SCENES = {
  search:     async () => { document.querySelectorAll('.find-btn[data-find]').forEach(b => b.click()); },
  crosscheck: async () => {},
  reveal:     async () => { document.querySelector('#b4-term')?.click(); },
  path:       async () => { const n = document.querySelector('#b5-next'); for (let i = 0; i < 9; i++) n?.click(); },
  backlog:    async () => {},
  evaluation: async () => {},
  loop:       async () => {},
  unknowns:   async () => {},
  verify:     async () => {},
  ask:        async () => {
    const chips = [...document.querySelectorAll('.chip')];
    (chips.find(c => c.textContent.includes('1억')) || chips[0])?.click();
    await new Promise(r => setTimeout(r, 400));
    document.querySelector('.cite')?.click();
  },
  paper:      async () => {},
};

export async function runShot() {
  const scene = new URLSearchParams(location.search).get('shot');
  if (!scene) return false;

  document.body.dataset.shot = scene;
  document.documentElement.style.scrollBehavior = 'auto';

  /* Headless Chrome's --screenshot captures the document origin and ignores the
     scroll position, so scrolling to a scene yields a blank frame. Hide every other
     beat instead: the target becomes the only thing on the page and lands in view. */
  const target = document.querySelector(`#${CSS.escape(scene)}`)
    || document.querySelector('.paper-card')?.closest('.beat')
    || document.querySelector('.beat');
  document.querySelectorAll('.beat').forEach(b => { if (b !== target) b.hidden = true; });
  document.querySelector('footer')?.setAttribute('hidden', '');

  await new Promise(r => setTimeout(r, 200));
  await (SCENES[scene] || (async () => {}))();
  await new Promise(r => setTimeout(r, 500));

  window.scrollTo({ top: 0, behavior: 'instant' });
  await new Promise(r => setTimeout(r, 150));
  document.title = 'READY';
  return true;
}

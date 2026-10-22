// When the page on the canvas may have changed (the plan's stage 4, "per-frame loops": every field shown read the
// page's computed values at every frame, dozens of loops at once): the one clock the readers of the page measure by.
// The canvas frame says the page may have changed — the store changed (a document, a selection, a breakpoint, a
// zoom), the page loaded, a font arrived, the page's box was resized (an image that loaded) — and every reader
// measures once, at the next frame, together. Nothing measures while nothing changes.
type Listener = () => void;

const listeners = new Set<Listener>();
let scheduled = false;
// how many times the page may have changed: a measure of the page read at the same version reads the same page
let version = 0;
export const pageVersion = (): number => version;

// the page may have changed: the readers measure at the next frame, once however many times it was said
export function pageChanged(): void {
  // a read made from now on reads the changed page, whether or not the readers were told yet
  version += 1;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    for (const listener of [...listeners]) listener();
  });
}

// a reader of the page: measured at each tick of the clock, until the returned stop
export function onPageChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A reader that follows the page by its clock: `measure` runs when the page may have changed (and at once), then at
// every frame while it reads something new (it says so) or the page moves on its own (`animating`: a transition, an
// animation of the page), stopping after a few still frames — what it draws from a measure is committed a frame later
// and may be read back by the next. `tick` asks for a measure for a cause the clock does not hear (a control of the
// stage moved, a box of the reader's own resized); `stop` ends it.
const STILL_FRAMES = 4;
export function followPage(measure: () => boolean, animating: () => boolean): { readonly tick: () => void; readonly stop: () => void } {
  let request = 0;
  let running = false;
  let still = 0;
  const follow = () => {
    still = measure() ? 0 : still + 1;
    if (still < STILL_FRAMES || animating()) request = requestAnimationFrame(follow);
    else running = false;
  };
  const tick = () => {
    still = 0;
    if (running) return;
    running = true;
    request = requestAnimationFrame(follow);
  };
  tick();
  const unlisten = onPageChange(tick);
  return {
    tick,
    stop: () => {
      cancelAnimationFrame(request);
      unlisten();
    },
  };
}

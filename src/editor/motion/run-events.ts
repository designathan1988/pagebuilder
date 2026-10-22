// Run interactions, the Interactions tab's part (spec motion-run-in-editor): while the canvas runs the interactions,
// each element's interactions (core/events: a click that scrolls, a hover that shows, a class added, a dialog opened)
// and the site's dialog openers (data-wc-open, js/widgets.js) work on the canvas as on the exported page. The motion
// runtime ran the Motion interactions alone, so a person who turned Run interactions on and clicked a button saw
// nothing happen. The actions are the exported script's (core/events/script.ts), bound to the canvas's own marks
// (data-node); an address is never opened from the canvas (the editor stays), the status bar says where it goes.
import type { DocumentJson, Interaction, NodeId } from '../../core/document/model.ts';
import { walk } from '../../core/document/model.ts';
import { actionTarget, firesOnce, interactionsOf } from '../../core/events/interactions.ts';
import { playedClassName } from '../../core/animation/animation.ts';
import { canvasSelector } from './canvas.ts';

// the browser events a trigger listens to (script.ts wiringJs)
const EVENTS: Readonly<Record<string, string>> = { click: 'click', 'double-click': 'dblclick', hover: 'pointerenter', 'mouse-leave': 'pointerleave', focus: 'focusin', blur: 'focusout', change: 'change', 'form-submit': 'submit' };

type Element_ = Element & { hidden?: boolean };

// A modal opened on the canvas stands in the middle of what the person sees of the page: the canvas's page is as tall
// as the whole page, so a dialog centred in it stood far below the stage, its backdrop alone in sight. The dialog's
// place is set from the stage's box over the frame, in the page's own pixels (the frame may be zoomed); closed, it is
// given back to its own styles.
function showOnStage(view: Window, dialog: HTMLDialogElement): void {
  dialog.showModal();
  const frame = view.frameElement as HTMLElement | null;
  const stage = frame?.closest('[data-canvas-stage]');
  if (frame === null || frame === undefined || stage === null || stage === undefined) return;
  const f = frame.getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  const zoom = view.innerHeight > 0 ? f.height / view.innerHeight : 1;
  const top = (Math.max(s.top, f.top) - f.top) / zoom;
  const height = (Math.min(s.bottom, f.bottom) - Math.max(s.top, f.top)) / zoom;
  if (height <= 0) return;
  const held = dialog.getAttribute('style');
  dialog.style.top = `${String(Math.round(top + height / 2))}px`;
  dialog.style.bottom = 'auto';
  dialog.style.marginTop = '0';
  dialog.style.marginBottom = '0';
  dialog.style.transform = 'translateY(-50%)';
  dialog.addEventListener('close', () => (held === null ? dialog.removeAttribute('style') : dialog.setAttribute('style', held)), { once: true });
}

// what the canvas says: an address a link or an interaction would open, a media the browser refused to play; and the
// page brought to an element: the canvas's frame is as tall as the page, so the page does not scroll in it, the
// editor's camera moves it under the stage
export interface RunSays {
  readonly opened: (address: string) => void;
  readonly scrolled: (to: Element) => void;
  readonly problem: (problem: { readonly code: string; readonly detail: string }) => void;
}

function act(view: Window, interaction: Interaction, target: Element_ | null, says: RunSays): void {
  if (interaction.action === 'open-link') {
    if (interaction.address !== undefined) says.opened(interaction.address);
    return;
  }
  if (target === null) return;
  const html = target as HTMLElement;
  switch (interaction.action) {
    case 'show':
      html.hidden = false;
      return;
    case 'hide':
      html.hidden = true;
      return;
    case 'toggle':
      html.hidden = !html.hidden;
      return;
    case 'toggle-class':
      if (interaction.className !== undefined) target.classList.toggle(interaction.className);
      return;
    case 'add-class':
      if (interaction.className !== undefined) target.classList.add(interaction.className);
      return;
    case 'remove-class':
      if (interaction.className !== undefined) target.classList.remove(interaction.className);
      return;
    case 'focus':
      html.focus();
      return;
    case 'open-dialog':
      if (target.localName === 'dialog') {
        const dialog = target as HTMLDialogElement;
        if (!dialog.open) showOnStage(view, dialog);
      } else html.hidden = false;
      return;
    case 'close-dialog':
      if (target.localName === 'dialog') (target as HTMLDialogElement).close();
      else html.hidden = true;
      return;
    case 'play-media':
    case 'pause-media': {
      const found = target.localName === 'video' || target.localName === 'audio' ? target : target.querySelector('video, audio');
      if (found !== null) {
        const media = found as HTMLMediaElement;
        if (interaction.action === 'pause-media') media.pause();
        else media.play().catch((error: unknown) => says.problem({ code: 'media-refused', detail: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    case 'scroll-to':
      says.scrolled(target);
      return;
    case 'play-animation':
      if (interaction.animation !== undefined) {
        const name = playedClassName(interaction.animation);
        target.classList.remove(name);
        void html.offsetWidth;
        target.classList.add(name);
      }
      return;
    default:
      return;
  }
}

// Binds every interaction of the page the canvas shows; the function it returns lets every one go (the canvas renders a
// change anew, and the runtime binds again on what it rendered).
export function runEventsOnCanvas(view: Window, document: DocumentJson, says: RunSays): () => void {
  const page = view.document;
  const undo: (() => void)[] = [];
  const listen = (element: Element, type: string, handler: EventListener) => {
    element.addEventListener(type, handler);
    undo.push(() => element.removeEventListener(type, handler));
  };
  for (const tree of document.pages.map((one) => one.tree)) {
    for (const node of walk(tree)) {
      for (const interaction of interactionsOf(node)) {
        const elements = [...page.querySelectorAll(interaction.scope === undefined ? canvasSelector(node.id as NodeId) : `.${interaction.scope}`)];
        for (const element of elements) {
          const target = (): Element_ | null => (interaction.target === undefined ? element : page.querySelector(canvasSelector(actionTarget(node, interaction))));
          let fired = false;
          const run = () => {
            if (firesOnce(interaction) && fired) return;
            fired = true;
            const delay = interaction.delay ?? 0;
            const go = () => act(view, interaction, target(), says);
            if (delay > 0) {
              const timer = view.setTimeout(go, delay);
              undo.push(() => view.clearTimeout(timer));
            } else go();
          };
          if (interaction.trigger === 'page-load') run();
          else if (interaction.trigger === 'scroll-into-view') {
            const observer = new IntersectionObserver((entries) => {
              if (entries.some((entry) => entry.isIntersecting)) run();
            }, { threshold: 0.5 });
            observer.observe(element);
            undo.push(() => observer.disconnect());
          } else {
            const type = EVENTS[interaction.trigger];
            if (type === undefined) continue;
            listen(element, type, (event) => {
              if (type === 'submit') event.preventDefault();
              run();
            });
            // a hover's leave runs the show or hide the other way (script.ts reverseJs)
            if (interaction.trigger === 'hover' && interaction.target !== undefined && (interaction.action === 'show' || interaction.action === 'hide')) {
              listen(element, 'pointerleave', () => act(view, { ...interaction, action: interaction.action === 'show' ? 'hide' : 'show' }, target(), says));
            }
          }
        }
      }
    }
  }
  // the site's dialog openers (js/widgets.js popups): a button naming a dialog opens it, its close buttons and its
  // backdrop close it
  for (const opener of page.querySelectorAll('[data-wc-open]:not([data-wc-open=""])')) {
    listen(opener, 'click', (event) => {
      const dialog = page.getElementById(opener.getAttribute('data-wc-open') ?? '');
      if (dialog !== null && dialog.localName === 'dialog') {
        event.preventDefault();
        showOnStage(view, dialog as HTMLDialogElement);
      }
    });
  }
  for (const dialog of page.querySelectorAll('dialog')) {
    listen(dialog, 'click', (event) => {
      if (event.target === dialog) (dialog as HTMLDialogElement).close();
    });
    for (const closer of dialog.querySelectorAll('[data-wc-close]')) listen(closer, 'click', () => (dialog as HTMLDialogElement).close());
  }
  // a link of the page never leaves the editor while the canvas runs
  for (const link of page.querySelectorAll('a[href]')) {
    listen(link, 'click', (event) => {
      event.preventDefault();
      says.opened(link.getAttribute('href') ?? '');
    });
  }
  return () => {
    for (const one of undo.splice(0)) one();
  };
}

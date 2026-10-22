// The behaviours of the motion runtime (plan stage 10, comportamentos; spec motion-behaviours): smooth scrolling,
// parallax, a looping marquee and an element following the cursor. Sticky and scroll snap need no script: their
// command writes plain CSS (core/motion/commands.ts). Each behaviour gives back what it changed when it is removed.
//  - Less motion asked: smooth scrolling and parallax stay off, the marquee stands still, and a cursor follower
//    follows without lagging behind (it moves only with the pointer).
//  - The marquee is a loop the person can stop (WCAG 2.2.2): it pauses while the pointer is over it or the focus is
//    inside it, and its copies are hidden from assistive technology and from the keyboard.
//
// Self-contained: embedded as text in the page's motion script (self-contained.test.ts).
import type { Behaviour } from '../../../core/motion/model.ts';
import type { MotionKit } from './kit.ts';

export interface BehaviourKit {
  install(element: Element, behaviour: Behaviour): () => void;
}

export function createBehaviours(win: Window, kit: MotionKit): BehaviourKit {
  function keep(element: HTMLElement, properties: readonly string[]): () => void {
    const before = properties.map((property) => [property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property)] as const);
    return () => {
      for (const [property, value, priority] of before) {
        if (value === '') element.style.removeProperty(property);
        else element.style.setProperty(property, value, priority);
      }
    };
  }

  function smoothScroll(element: HTMLElement): () => void {
    // the page's own scrolling is the root's: a behaviour on the page's body makes the whole page scroll smoothly
    const document = element.ownerDocument;
    const scroller = element === document.body ? document.documentElement : element;
    const restore = keep(scroller, ['scroll-behavior']);
    const apply = (): void => {
      if (kit.reducedMotion()) scroller.style.removeProperty('scroll-behavior');
      else scroller.style.setProperty('scroll-behavior', 'smooth');
    };
    apply();
    const query = win.matchMedia('(prefers-reduced-motion: reduce)');
    query.addEventListener('change', apply);
    return () => {
      query.removeEventListener('change', apply);
      restore();
    };
  }

  function parallax(element: HTMLElement, behaviour: Behaviour): () => void {
    const restore = keep(element, ['translate', 'will-change']);
    let frame = 0;
    const update = (): void => {
      frame = 0;
      if (kit.reducedMotion()) {
        element.style.removeProperty('translate');
        return;
      }
      // the element's centre against the viewport's: at the centre it sits where the layout put it
      element.style.removeProperty('translate');
      const box = element.getBoundingClientRect();
      const vertical = behaviour.axis !== 'x';
      const view = vertical ? win.innerHeight : win.innerWidth;
      const size = vertical ? box.height : box.width;
      const lead = vertical ? box.top : box.left;
      // how far along its way across the screen it is (0: its leading edge enters, 1: its trailing edge leaves), held
      // inside the range it moves in (Behaviour start, end)
      const way = view + size;
      const progress = way <= 0 ? 0.5 : (view - lead) / way;
      const held = Math.min((behaviour.end ?? 100) / 100, Math.max((behaviour.start ?? 0) / 100, progress));
      // the centre's offset from the viewport's at that point of the way (0.5: centred)
      const offset = way * (0.5 - held);
      let shift = -offset * behaviour.amount;
      if (behaviour.max !== undefined) {
        shift = Math.min(behaviour.max, Math.max(-behaviour.max, shift));
      } else {
        // as far as its parent's box lets it, so it never moves over the section after it (or before it)
        const parent = element.parentElement?.getBoundingClientRect();
        if (parent !== undefined) {
          const before = vertical ? box.top - parent.top : box.left - parent.left;
          const after = vertical ? parent.bottom - box.bottom : parent.right - box.right;
          shift = Math.min(Math.max(0, after), Math.max(-Math.max(0, before), shift));
        }
      }
      shift = Math.round(shift * 100) / 100;
      element.style.setProperty('translate', vertical ? `0 ${shift}px` : `${shift}px 0`);
    };
    const schedule = (): void => {
      if (frame === 0) frame = win.requestAnimationFrame(update);
    };
    element.style.setProperty('will-change', 'translate');
    win.addEventListener('scroll', schedule, { passive: true });
    win.addEventListener('resize', schedule, { passive: true });
    update();
    return () => {
      win.removeEventListener('scroll', schedule);
      win.removeEventListener('resize', schedule);
      if (frame !== 0) win.cancelAnimationFrame(frame);
      restore();
    };
  }

  function marquee(element: HTMLElement, behaviour: Behaviour): () => void {
    const document = element.ownerDocument;
    const restore = keep(element, ['overflow']);
    const vertical = behaviour.axis === 'y';
    const track = document.createElement('div');
    track.style.cssText = `display:flex;${vertical ? 'flex-direction:column;' : ''}width:${vertical ? '100%' : 'max-content'};gap:inherit`;
    const children = Array.from(element.childNodes);
    for (const child of children) track.appendChild(child);
    // a copy of the content follows it, so the loop never shows a gap; the copy is decoration only
    const copy = document.createElement('div');
    copy.style.cssText = track.style.cssText;
    copy.setAttribute('aria-hidden', 'true');
    copy.setAttribute('inert', '');
    for (const child of children) copy.appendChild(child.cloneNode(true));
    const holder = document.createElement('div');
    holder.style.cssText = `display:flex;${vertical ? 'flex-direction:column;' : ''}width:max-content`;
    holder.append(track, copy);
    element.appendChild(holder);
    element.style.setProperty('overflow', 'hidden');
    let animation: Animation | null = null;
    const start = (): void => {
      animation?.cancel();
      const length = vertical ? track.offsetHeight : track.offsetWidth;
      if (length <= 0 || typeof holder.animate !== 'function') return;
      const from = behaviour.reverse === true ? -length : 0;
      const to = behaviour.reverse === true ? 0 : -length;
      animation = holder.animate([{ translate: vertical ? `0 ${from}px` : `${from}px 0` }, { translate: vertical ? `0 ${to}px` : `${to}px 0` }], { duration: (length / behaviour.amount) * 1000, iterations: Infinity, easing: 'linear' });
      if (kit.reducedMotion()) animation.pause();
    };
    const pause = (): void => animation?.pause();
    const resume = (): void => {
      if (!kit.reducedMotion() && !element.matches(':hover') && !element.contains(document.activeElement)) animation?.play();
    };
    element.addEventListener('pointerenter', pause);
    element.addEventListener('pointerleave', resume);
    element.addEventListener('focusin', pause);
    element.addEventListener('focusout', resume);
    const Observer = (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    const resized = Observer === undefined ? null : new Observer(() => start());
    resized?.observe(track);
    start();
    return () => {
      resized?.disconnect();
      element.removeEventListener('pointerenter', pause);
      element.removeEventListener('pointerleave', resume);
      element.removeEventListener('focusin', pause);
      element.removeEventListener('focusout', resume);
      animation?.cancel();
      for (const child of children) element.insertBefore(child, holder);
      holder.remove();
      restore();
    };
  }

  function cursorFollow(element: HTMLElement, behaviour: Behaviour): () => void {
    const restore = keep(element, ['position', 'left', 'top', 'translate', 'pointer-events', 'z-index']);
    element.style.setProperty('position', 'fixed');
    element.style.setProperty('left', '0');
    element.style.setProperty('top', '0');
    element.style.setProperty('pointer-events', 'none');
    element.style.setProperty('z-index', '2147483000');
    let target = { x: win.innerWidth / 2, y: win.innerHeight / 2 };
    let at = { ...target };
    let frame = 0;
    const draw = (): void => {
      frame = 0;
      // the follower trails the pointer by the smoothing (0: on it); less motion asked: on it at once
      const lag = kit.reducedMotion() ? 0 : behaviour.amount;
      at = { x: at.x + (target.x - at.x) * (1 - lag), y: at.y + (target.y - at.y) * (1 - lag) };
      const box = element.getBoundingClientRect();
      element.style.setProperty('translate', `${Math.round(at.x - box.width / 2)}px ${Math.round(at.y - box.height / 2)}px`);
      if (Math.abs(target.x - at.x) > 0.5 || Math.abs(target.y - at.y) > 0.5) frame = win.requestAnimationFrame(draw);
    };
    const move = (event: Event): void => {
      const pointer = event as PointerEvent;
      target = { x: pointer.clientX, y: pointer.clientY };
      if (frame === 0) frame = win.requestAnimationFrame(draw);
    };
    win.addEventListener('pointermove', move, { passive: true });
    draw();
    return () => {
      win.removeEventListener('pointermove', move);
      if (frame !== 0) win.cancelAnimationFrame(frame);
      restore();
    };
  }

  function install(element: Element, behaviour: Behaviour): () => void {
    const html = element as HTMLElement;
    switch (behaviour.kind) {
      case 'smooth-scroll':
        return smoothScroll(html);
      case 'parallax':
        return parallax(html, behaviour);
      case 'marquee':
        return marquee(html, behaviour);
      case 'cursor-follow':
        return cursorFollow(html, behaviour);
    }
  }

  return { install };
}

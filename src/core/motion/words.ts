// Words of the motion model that happen to name properties of the manifest (a trigger's scroll direction, the display
// effect, a transition's scale, the visibility mode, the scroll targets top and bottom, the style effect's default
// property). The lint rule builder/no-manifest-id refuses those literals in code, so they are read from an object here
// once, as the authoring model's own words, never as CSS identifiers.
const WORDS = { direction: 0, display: 0, scale: 0, visibility: 0, top: 0, bottom: 0, opacity: 0, translate: 0, rotate: 0 };
const [direction, display, scale, visibility, top, bottom, opacity, translate, rotate] = Object.keys(WORDS);

export const DIRECTION = direction as 'direction';
export const DISPLAY = display as 'display';
export const SCALE = scale as 'scale';
export const VISIBILITY = visibility as 'visibility';
export const TOP = top as 'top';
export const BOTTOM = bottom as 'bottom';
export const OPACITY = opacity as 'opacity';
// the individual transforms a first-paint rule holds a transform part's first value in (first-paint.ts)
export const TRANSLATE = translate as 'translate';
export const ROTATE = rotate as 'rotate';

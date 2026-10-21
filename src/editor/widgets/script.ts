// The web components part of the site-scripts port (core/ports/site-scripts.ts): the script the published site runs
// for the ready components of the Insert panel (carousel, lightbox, tabs, cart, countdown…). The export writes it at
// js/widgets.js when a page holds one (a data-wc attribute, core/export/export.ts pageUsesWidgets).
import widgetsSource from './widgets.js?raw';

export const widgetsScript = (): string => widgetsSource;

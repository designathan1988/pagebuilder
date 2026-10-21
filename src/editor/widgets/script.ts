// The web components part of the site-scripts port (core/ports/site-scripts.ts): the script the published site runs
// for the ready components of the Insert panel (carousel, lightbox, tabs, cart, countdown…). The export writes it at
// js/widgets.js when a page holds one (a data-wc attribute, core/export/export.ts pageUsesWidgets).
import widgetsSource from './widgets.js?raw';
import { withSiteWords } from '../app-runtime/words.ts';

// the visitor's words of the components (the script's words): the lightbox's buttons, the carousel's role, the cart's
// buttons and the order it sends
const widgets = withSiteWords(widgetsSource, {
  close: 'siteRuntime.widgets.close',
  previous: 'siteRuntime.widgets.previous',
  next: 'siteRuntime.widgets.next',
  carousel: 'siteRuntime.widgets.carousel',
  cart: 'siteRuntime.widgets.cart',
  decrease: 'siteRuntime.widgets.decrease',
  increase: 'siteRuntime.widgets.increase',
  remove: 'siteRuntime.widgets.remove',
  greeting: 'siteRuntime.widgets.greeting',
  total: 'siteRuntime.widgets.total',
  orderSubject: 'siteRuntime.widgets.orderSubject',
});

export const widgetsScript = (): string => widgets;

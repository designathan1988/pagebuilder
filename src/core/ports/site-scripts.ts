import type { RuntimeConfig } from '../motion/export.ts';
import type { SyntaxCheck } from '../logic/compile.ts';

/** Browser runtimes are supplied by the composition layer; the document core never imports the DOM. */
export interface SiteScripts {
  forms(): string;
  // the motion script of the site (js/motion.js): the runtime and the site's motion data (spec export-motion-js)
  motion?(config: RuntimeConfig): string;
  // the Lottie player (js/lottie.min.js), written only when a timeline plays a Lottie animation
  lottie?(): string;
  // the web components' script (js/widgets.js): carousel, lightbox, tabs, cart, countdown… (data-wc attributes)
  widgets?(): string;
  // the application runtime (js/app-layer/runtime.js, spec app-logic), written when the project has an application
  // layer
  app?(): string;
  // the parser that says which piece of the application's code does not parse (core/logic/compile.ts)
  checkSyntax?: SyntaxCheck;
}

// The parts of the motion runtime a site may not use, as the page's motion script writes them when it does not: a
// Lottie player for a site that plays no Lottie animation, a text splitter for one that splits no text, behaviours for
// one that sets none (script.ts leaves the real factory out, spec export-motion-js: "only the parts the site uses").
// Each keeps its part's shape, so the rest of the runtime reaches it as it reaches the real one.
//
// Self-contained: embedded as text in the page's motion script (self-contained.test.ts).
import type { BehaviourKit } from './behaviours.ts';
import type { LottieKit } from './lottie.ts';
import type { SplitKit } from './split-text.ts';

export function createNoLottie(): LottieKit {
  return { control: () => undefined, dispose: () => undefined };
}

export function createNoSplitText(): SplitKit {
  return { split: () => ({ pieces: [], restore: () => undefined }) };
}

export function createNoBehaviours(): BehaviourKit {
  return { install: () => () => undefined };
}

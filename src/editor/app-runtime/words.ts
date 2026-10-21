// The words a site's own runtimes show its visitors (js/app-layer/runtime.js, js/widgets.js): read from the editor's
// catalogues (siteRuntime.* keys), so each wording lives in one place. The runtime source holds the marker below where
// its word tables go; the builder writes every UI language's table there, and the page's language (<html lang>, the
// project's language unless the page sets its own) picks one in the visitor's browser: Portuguese for a pt page,
// English for any other. The export and the preview write the same source, so both show the same words.
import { LOCALES, type MessageId } from '../../generated/ids.ts';
import { translate } from '../../i18n/index.ts';

export const SITE_WORDS_MARKER = '/* site words */ {}';

export function withSiteWords(source: string, keys: Readonly<Record<string, MessageId>>): string {
  if (!source.includes(SITE_WORDS_MARKER)) throw new Error(`The runtime source has no "${SITE_WORDS_MARKER}" for its words.`);
  const tables = Object.fromEntries(LOCALES.map((locale) => [locale, Object.fromEntries(Object.entries(keys).map(([word, key]) => [word, translate(locale, key)]))]));
  return source.replace(SITE_WORDS_MARKER, () => JSON.stringify(tables));
}

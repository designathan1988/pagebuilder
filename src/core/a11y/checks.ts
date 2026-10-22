// The page's accessibility and structure checks (the user's real-use audit, 7.5 and
// A3.39): the one owner of the list the Checks panel shows. It reads the document and nothing else — never the
// rendered page, never a computed style — so the list is the same before and after a reload, it updates with every
// command (the panel reads it from the store), and it never blocks editing or exporting: a check is advice, and the
// export writes the page whatever the list says.
//  - Every issue names the node it is about, the rule it breaks and the fix to suggest, as message keys; the panel
//    draws one row per issue, and its door (selection.select, the region's `checks-issue` entry) selects the node.
//  - The rules: an image with no alt; a link with no text; a link with no address; a heading that skips a level
//    (h2 after h1 is fine, h4 after h2 is not); text whose colour and the first background colour above it are both
//    set and do not reach the 4.5:1 contrast WCAG asks for body text; an embedded frame with no title; an image with no
//    source (export: the canvas draws a placeholder in its place, the exported page nothing — the journey "site"); a
//    form with no submit button (WCAG technique H32: a visitor has no way to send it; the audit's AUD-22, the one
//    html-validate error of a fixture export left to the person, src/core/export/validity.test.ts); a WhatsApp link
//    with no phone number, and a shop's cart with no number or e-mail to send the order to.
//  - A colour that names the project's variables (var(--brand)) is read as the variable's value, its aliases and
//    fallbacks followed (core/style/swatch.ts resolvedVariables). A value the reader still cannot understand (a
//    variable the project does not define, a keyword, a translucent colour over an unknown one) is left alone: a check
//    never guesses, so an element whose own background is unknown makes the background unknown for it and everything
//    inside it (never the one further out), and a page that says nothing about colour is never reported.
import type { MessageId } from '../../generated/ids.ts';
import type { DocNode, DocumentJson, NodeId } from '../document/model.ts';
import { resolvedVariables } from '../style/swatch.ts';

export interface CheckIssue {
  // the node the issue is about
  readonly node: NodeId;
  // the category of the issue (manifest/checks.json), which its message names
  readonly category: string;
  // the rule it breaks, and the fix to suggest (both message keys)
  readonly rule: MessageId;
  readonly fix: MessageId;
  // a heading that skips a level: the level it should take, the one after the heading before it (checks.fix)
  readonly level?: number;
}

// WCAG 2.1's minimum contrast for body text
export const CONTRAST_MINIMUM = 4.5;

// a colour the reader understands: #rgb, #rrggbb, rgb(r, g, b) and rgba(r, g, b, a) with a fully opaque alpha; null
// for everything else (a variable, a keyword, a partly transparent colour)
// a colour as red, green, blue; a translucent one is laid over the colour under it, when that is known
function readColour(text: string, under: readonly [number, number, number] | null = null): readonly [number, number, number] | null {
  const value = text.trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/.exec(value);
  if (short !== null) {
    const [r, g, b] = [...(short[1] ?? '')].map((one) => parseInt(`${one}${one}`, 16));
    return [r ?? 0, g ?? 0, b ?? 0];
  }
  const long = /^#([0-9a-f]{6})$/.exec(value);
  if (long !== null) {
    const digits = long[1] ?? '';
    return [parseInt(digits.slice(0, 2), 16), parseInt(digits.slice(2, 4), 16), parseInt(digits.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(value);
  if (rgb === null) return null;
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
  const colour = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] as const;
  if (alpha >= 1) return colour;
  if (under === null || alpha <= 0) return null;
  return [0, 1, 2].map((i) => Math.round((colour[i] as number) * alpha + (under[i] as number) * (1 - alpha))) as unknown as readonly [number, number, number];
}

// the luminance of a colour, and the contrast between two of them, as WCAG defines them
function luminance([r, g, b]: readonly [number, number, number]): number {
  const channel = (one: number) => {
    const part = one / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrast(one: readonly [number, number, number], other: readonly [number, number, number]): number {
  const [light, dark] = luminance(one) >= luminance(other) ? [one, other] : [other, one];
  return (luminance(light) + 0.05) / (luminance(dark) + 0.05);
}

// the value a node sets for a property at the base state of the desktop breakpoint, if it sets one
function baseValue(node: DocNode, property: string): string | null {
  const base = node.styles.desktop?.base as Readonly<Record<string, unknown>> | undefined;
  const value = base?.[property];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

const textWithin = (node: DocNode): string => `${node.text ?? ''}${node.children.map((child) => textWithin(child)).join('')}`.trim();

// whether a node is hidden (its own flag, or one of an ancestor's): a hidden element is nobody's problem
const hiddenWithin = (node: DocNode, hidden: boolean): boolean => node.hidden === true || hidden;

// A row of three or more elements that never wraps nor turns into a column, at no breakpoint and in no state: on a
// phone its elements run past the screen's edge and the page scrolls sideways (WCAG 1.4.10, Reflow). A row placed
// before rows wrapped by default (Wrap in a row) stayed so, and the person saw it only in the Phone preview.
const ROW_WRAP_MINIMUM = 3;
function rowNeverWraps(node: DocNode): boolean {
  if (node.children.length < ROW_WRAP_MINIMUM) return false;
  const layers = Object.values(node.styles).flatMap((byState) => Object.values(byState ?? {})) as Readonly<Record<string, unknown>>[];
  const said = (property: string): string[] => layers.flatMap((layer) => (typeof layer[property] === 'string' ? [String(layer[property]).trim()] : []));
  if (!said('display').some((value) => value === 'flex' || value === 'inline-flex')) return false;
  if (said('flex-direction').some((value) => value.startsWith('column'))) return false;
  return !said('flex-wrap').some((value) => value === 'wrap' || value === 'wrap-reverse');
}

// Every issue the page has, in document order: the checks of the report, each once, over every page of the project.
// the properties the contrast check reads, named by the manifest (interactions.json checks), never here
export interface CheckProperties {
  readonly colourProperty: string;
  readonly backgroundProperty: string;
  readonly backgroundImageProperty: string;
}

// whether a form holds a control that sends it: a button whose type is submit (the export writes submit for a button
// in a form that says nothing, core/export/names.ts buttonKind), or a submit or image input; a form inside it sends
// itself
function submitsWithin(form: DocNode): boolean {
  const sends = (node: DocNode): boolean => {
    if (node.tag === 'button') return node.attributes.buttonType === undefined || node.attributes.buttonType === 'submit';
    if (node.tag === 'input') return node.attributes.inputType === 'submit' || node.attributes.inputType === 'image';
    return node.tag !== 'form' && node.children.some(sends);
  };
  return form.children.some(sends);
}

// A WhatsApp link that names no phone number (wa.me/ with nothing but a message): it opens WhatsApp to pick a contact,
// so a visitor's "talk to us" reaches nobody. The ready-made blocks ship this way, for the business to type its own
// number (the audit's TPL-13: a sample number sent orders to a stranger).
const WHATSAPP_WITHOUT_NUMBER = /^https?:\/\/wa\.me\/?(?:[?#]|$)/u;

// A shop's cart (the Components' cart, data-wc="cart", read by src/editor/widgets/widgets.js) with neither a WhatsApp
// number nor an e-mail to send the order to: its checkout button does nothing.
function cartWithoutAddress(node: DocNode): boolean {
  const custom = node.customAttributes;
  if (custom?.['data-wc'] !== 'cart') return false;
  return (custom['data-wc-whatsapp'] ?? '').replace(/\D/gu, '') === '' && (custom['data-wc-email'] ?? '').trim() === '';
}

// A form field a visitor types into or chooses in (an input but a hidden one or a button, a text area, a list) says what
// it asks only by a name a screen reader reads: a label around it or pointing at it (its `for`), an accessible name, or a
// tooltip. A placeholder is no name: it goes as the visitor types (WCAG 1.3.1 and 4.1.2).
const UNNAMED_INPUTS: ReadonlySet<string> = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
const needsName = (node: DocNode): boolean =>
  node.tag === 'textarea' || node.tag === 'select' || (node.tag === 'input' && !UNNAMED_INPUTS.has(String(node.attributes.inputType ?? 'text')));
const namedByItself = (node: DocNode): boolean => ['ariaLabel', 'title'].some((name) => String(node.attributes[name as keyof DocNode['attributes']] ?? '').trim() !== '');

export function checksOf(document: DocumentJson, properties: CheckProperties): readonly CheckIssue[] {
  const issues: CheckIssue[] = [];
  // the fields a label points at (its `for` names the field's node)
  const labelled = new Set<string>();
  const collectLabels = (node: DocNode): void => {
    if (node.tag === 'label' && typeof node.attributes.labelFor === 'string') labelled.add(node.attributes.labelFor);
    node.children.forEach(collectLabels);
  };
  document.pages.forEach((page) => collectLabels(page.tree));
  const tokens = document.tokens ?? [];
  const templateFiles = new Set(document.pages.filter((page) => page.tree.dataItem?.template === true).map((page) => page.file));
  // a colour value as the page paints it: its variables resolved, then read; null when either cannot be done
  const colourOf = (text: string, under: readonly [number, number, number] | null = null) => {
    const resolved = resolvedVariables(text, tokens);
    return resolved === null ? null : readColour(resolved, under);
  };
  // the background behind a node's content: unknown over an image or a gradient of its own (a photo's colours are not
  // read), the one under it when the node sets none (or a transparent one), its own when it can be read, else unknown
  const backgroundOf = (node: DocNode, under: readonly [number, number, number] | null) => {
    const image = baseValue(node, properties.backgroundImageProperty);
    if (image !== null && resolvedVariables(image, tokens)?.trim().toLowerCase() !== 'none') return null;
    const set = baseValue(node, properties.backgroundProperty);
    if (set === null || resolvedVariables(set, tokens)?.trim().toLowerCase() === 'transparent') return under;
    return colourOf(set, under);
  };
  const visit = (node: DocNode, hidden: boolean, background: readonly [number, number, number] | null, seenHeading: number, inLabel = false): number => {
    const isHidden = hiddenWithin(node, hidden);
    if (isHidden || node.tag === null) return seenHeading;
    if (needsName(node) && !inLabel && !labelled.has(node.id) && !namedByItself(node)) issues.push({ node: node.id, category: 'accessibility', rule: 'checks.fieldName', fix: 'checks.fieldName.fix' });
    const own = backgroundOf(node, background);
    const level = /^h([1-6])$/.exec(node.tag);
    let heading = seenHeading;
    if (level !== null) {
      const depth = Number(level[1]);
      if (seenHeading !== 0 && depth > seenHeading + 1) issues.push({ node: node.id, category: 'accessibility', rule: 'checks.headingLevel', fix: 'checks.headingLevel.fix', level: seenHeading + 1 });
      heading = depth;
    }
    if (node.tag === 'img' && !('alt' in node.attributes)) issues.push({ node: node.id, category: 'accessibility', rule: 'checks.imageAlt', fix: 'checks.imageAlt.fix' });
    if (node.tag === 'img' && String(node.attributes.src ?? '') === '') issues.push({ node: node.id, category: 'export', rule: 'checks.imageSource', fix: 'checks.imageSource.fix' });
    if (node.tag === 'iframe' && !('title' in node.attributes)) issues.push({ node: node.id, category: 'accessibility', rule: 'checks.iframeTitle', fix: 'checks.iframeTitle.fix' });
    if (node.tag === 'form' && !submitsWithin(node)) issues.push({ node: node.id, category: 'accessibility', rule: 'checks.formSubmit', fix: 'checks.formSubmit.fix' });
    if (node.tag === 'a') {
      if (node.attributes.href === undefined || String(node.attributes.href) === '') issues.push({ node: node.id, category: 'links', rule: 'checks.linkHref', fix: 'checks.linkHref.fix' });
      // a template page is written once per item and never at its own file: a link to it is broken on the site
      else if (templateFiles.has(String(node.attributes.href))) issues.push({ node: node.id, category: 'links', rule: 'checks.linkTemplate', fix: 'checks.linkTemplate.fix' });
      if (textWithin(node) === '') issues.push({ node: node.id, category: 'links', rule: 'checks.linkText', fix: 'checks.linkText.fix' });
      if (WHATSAPP_WITHOUT_NUMBER.test(String(node.attributes.href ?? ''))) issues.push({ node: node.id, category: 'links', rule: 'checks.whatsappLink', fix: 'checks.whatsappLink.fix' });
    }
    if (rowNeverWraps(node)) issues.push({ node: node.id, category: 'accessibility', rule: 'checks.rowNoWrap', fix: 'checks.rowNoWrap.fix' });
    if (cartWithoutAddress(node)) issues.push({ node: node.id, category: 'export', rule: 'checks.cartDestination', fix: 'checks.cartDestination.fix' });
    // text with a colour of its own over a background that is known: below the contrast WCAG asks for is an issue
    const colour = colourOf(baseValue(node, properties.colourProperty) ?? '');
    if (colour !== null && own !== null && textWithin(node) !== '' && contrast(colour, own) < CONTRAST_MINIMUM) {
      issues.push({ node: node.id, category: 'accessibility', rule: 'checks.contrast', fix: 'checks.contrast.fix' });
    }
    return node.children.reduce((carried, child) => visit(child, isHidden, own, carried, inLabel || node.tag === 'label'), heading);
  };
  for (const page of document.pages) visit(page.tree, false, null, 0);
  return issues;
}

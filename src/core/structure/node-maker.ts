// What makes new elements (elements.json): a new node of a type with its name, tag, default styles, text and natural
// children. element.insert (core/structure/insert.ts), the tables' parts (core/elements/table.ts) and the component
// commands make their elements here, so none of them imports another to make one (plan I.8: no cycle).
import type { ElementType, MessageId } from '../../generated/ids.ts';
import type { IdGenerator } from '../ports/ids.ts';
import { allNodes, type DocNode, type DocumentJson, type Styles } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';

// What makes new nodes: the model, the ids, the person's words, and the names already taken (the document's and those
// of the nodes made so far), so every new node gets a name no other node has.
export interface NodeMaker {
  readonly rules: ModelRules;
  readonly ids: IdGenerator;
  readonly words: (key: MessageId) => string;
  // the words of the page the nodes go into (HandlerContext.pageWords), for what they show and say on the page: their
  // text and their alt, aria-label, placeholder and title (the audit's TPL-3); the person's words when not given
  readonly pageWords: (key: MessageId) => string;
  readonly taken: Set<string>;
  // the HTML ids the document's nodes already hold: a template's own ids are renamed off them (paletteNode)
  readonly htmlIds: ReadonlySet<string>;
  // the moment the nodes are placed (the clock port's milliseconds), from which a template's dates are counted
  // (customDaysAhead: a countdown's end); absent for a maker that places nothing dated
  readonly now?: number;
}

export function nodeMaker(document: DocumentJson, rules: ModelRules, ids: IdGenerator, words: (key: MessageId) => string, now?: number, pageWords?: (key: MessageId) => string): NodeMaker {
  const nodes = [...allNodes(document)];
  const htmlIds = new Set(nodes.map((n) => n.attributes.id).filter((id): id is string => typeof id === 'string' && id !== ''));
  return { rules, ids, words, pageWords: pageWords ?? words, taken: new Set(nodes.map((n) => n.name)), htmlIds, ...(now === undefined ? {} : { now }) };
}

export function freshName(make: NodeMaker, base: string): string {
  let name = base;
  for (let n = 2; make.taken.has(name); n += 1) name = `${base} ${n}`;
  make.taken.add(name);
  return name;
}

// A new element of a type, as element.insert makes it (elements.json): named by its type in the person's language
// (numbered when the name is taken), its first tag, its default styles at the base breakpoint and state, its default
// text in the page's language, and its natural children (naturalChild: one element of each type, in order, each with
// its own), so a blockquote starts with a paragraph, a list with an item and a definition list with a term and a
// description. The children given replace the natural ones (a table's parts, core/elements/table.ts).
export function newElement(make: NodeMaker, type: string, children?: (make: NodeMaker) => DocNode[], nameKey?: MessageId): DocNode {
  const { rules } = make;
  const element = rules.elements.get(type as ElementType);
  if (element === undefined) throw new Error(`newElement: elements.json defines no ${type}`);
  const holdsText = element.content === 'text' || element.content === 'markup';
  return {
    id: make.ids.next(),
    type: type as ElementType,
    name: freshName(make, make.words(nameKey ?? element.labelKey)),
    tag: element.tags[0] ?? null,
    attributes: {},
    classes: [],
    styles: Object.keys(element.defaultStyles).length > 0 ? ({ [rules.baseLayer.breakpoint]: { [rules.baseLayer.state]: element.defaultStyles } } as Styles) : {},
    text: holdsText ? (element.defaultTextKey === null ? '' : make.pageWords(element.defaultTextKey)) : null,
    children: children === undefined ? element.naturalChildren.map((child) => newElement(make, child)) : children(make),
  };
}

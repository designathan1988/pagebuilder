// Identity repair for a deep copy of document trees. The copy makers choose names and styles; this one pass owns
// the identities shared by all of them: HTML ids, references inside the copied group and interaction targets.
import { allNodes, type DocNode, type DocumentJson, type NodeId } from './model.ts';
import { referenceHtmlOf } from '../elements/references.ts';
import { mapInlineLinks } from '../text/inline.ts';

type Pair = { readonly source: DocNode; readonly copy: DocNode };

const IDREF_LISTS = new Set(['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'headers']);
const IDREF_SINGLES = new Set(['aria-activedescendant', 'list']);

// A copy's animations under @keyframes names no animation of the document (nor of the copies made before it) holds:
// one stylesheet holds every animation, so a copy that kept a name would move as the original's keyframes say, and an
// edit of either would change both (the audit's UQ1). The copy's own interactions that play one follow its new name.
export function withFreshAnimationNames(node: DocNode, taken: Set<string>): DocNode {
  const renamed = new Map<string, string>();
  const animations = node.animations?.map((animation) => {
    if (!taken.has(animation.name)) {
      taken.add(animation.name);
      return animation;
    }
    let name = `${animation.name}-2`;
    for (let n = 3; taken.has(name); n += 1) name = `${animation.name}-${n}`;
    taken.add(name);
    renamed.set(animation.name, name);
    return { ...animation, name };
  });
  const interactions = renamed.size === 0 ? node.interactions : node.interactions?.map((one) => (one.animation !== undefined && renamed.has(one.animation) ? { ...one, animation: renamed.get(one.animation) as string } : one));
  return {
    ...node,
    ...(animations === undefined ? {} : { animations }),
    ...(interactions === undefined ? {} : { interactions }),
    children: node.children.map((child) => withFreshAnimationNames(child, taken)),
  };
}

// every @keyframes name the pages of a document hold
export function animationNamesOf(document: DocumentJson): Set<string> {
  return new Set([...allNodes(document)].flatMap((node) => (node.animations ?? []).map((animation) => animation.name)));
}

// The HTML ids a copy already carries in place of its source's, element by element (two trees of one shape): what a
// writer that chose each copy's ids itself (a component's instance keeps its own ids, the audit's STRUCT-5) hands to
// refreshCopiedIdentities, so the references the source's elements made by HTML id follow the copy's.
export function htmlIdMapOf(source: DocNode, copy: DocNode): Map<string, string> {
  const found = new Map<string, string>();
  const visit = (from: DocNode, to: DocNode): void => {
    const was = from.attributes.id;
    const now = to.attributes.id;
    if (typeof was === 'string' && was !== '' && typeof now === 'string' && now !== '' && was !== now) found.set(was, now);
    from.children.forEach((child, i) => {
      const other = to.children[i];
      if (other !== undefined) visit(child, other);
    });
  };
  visit(source, copy);
  return found;
}

// `renamedHtmlIds`: HTML ids the copies already carry in place of their sources' (htmlIdMapOf). The copies' `id`
// attributes are left as they are; every reference to a source's HTML id (a label's `for`, a link's "#…", an inline
// link, aria-labelledby/-describedby/-controls/-owns, headers, aria-activedescendant, list) names the copy's instead.
export function refreshCopiedIdentities(document: DocumentJson, pairs: readonly Pair[], regenerateHtmlIds: boolean | 'collisions' = true, renamedHtmlIds: ReadonlyMap<string, string> = new Map()): DocNode[] {
  const occupied = new Set([...allNodes(document)].map((node) => node.attributes.id).filter((id): id is string => typeof id === 'string' && id !== ''));
  const nodeIds = new Map<string, NodeId>();
  const htmlIds = new Map<string, string>();
  // the HTML ids a reference follows: the ones this pass renames and the ones the caller renamed
  const referred = (id: string): string | undefined => htmlIds.get(id) ?? renamedHtmlIds.get(id);

  const visitPairs = (source: DocNode, copy: DocNode): void => {
    nodeIds.set(source.id, copy.id);
    const htmlId = source.attributes.id;
    if (regenerateHtmlIds && typeof htmlId === 'string' && htmlId !== '' && (regenerateHtmlIds !== 'collisions' || occupied.has(htmlId))) {
      let candidate = `${htmlId}-copy`;
      for (let n = 2; occupied.has(candidate); n += 1) candidate = `${htmlId}-copy-${n}`;
      occupied.add(candidate);
      htmlIds.set(htmlId, candidate);
    }
    if (typeof htmlId === 'string') occupied.add(htmlId);
    if (source.children.length !== copy.children.length) throw new Error('refreshCopiedIdentities: the copy changed the tree shape');
    source.children.forEach((child, index) => {
      const copiedChild = copy.children[index];
      if (copiedChild === undefined) throw new Error('refreshCopiedIdentities: a copied child is missing');
      visitPairs(child, copiedChild);
    });
  };
  pairs.forEach(({ source, copy }) => visitPairs(source, copy));

  const repair = (copy: DocNode): DocNode => withReferencesRenamed(copy, (id) => nodeIds.get(id), referred, htmlIds);
  // a copy kept outside the pages (a component's definition: regenerateHtmlIds false) keeps its element's names
  const names = animationNamesOf(document);
  return pairs.map(({ copy }) => (regenerateHtmlIds === false ? repair(copy) : withFreshAnimationNames(repair(copy), names)));
}

// A tree whose identity references are renamed: an interaction's target, a layer colour's node and a reference
// attribute by node id (`node`), a reference by HTML id (`html`: attributes, inline links, ARIA IDREFs), and the `id`
// attributes themselves (`ownIds`). The one place that knows where a tree's elements name each other.
function withReferencesRenamed(copy: DocNode, node: (id: string) => string | undefined, html: (id: string) => string | undefined, ownIds: ReadonlyMap<string, string>): DocNode {
  const reference = (value: string): string => {
    const fragment = value.startsWith('#');
    const named = fragment ? value.slice(1) : value;
    const replacement = node(named) ?? html(named);
    return replacement === undefined ? value : fragment ? `#${replacement}` : replacement;
  };
  const repair = (one: DocNode): DocNode => {
    const attributes = Object.fromEntries(Object.entries(one.attributes).map(([name, value]) => [
      name,
      name === 'id' && typeof value === 'string' ? (ownIds.get(value) ?? value) :
        typeof value === 'string' && referenceHtmlOf(name) !== undefined ? reference(value) : value,
    ])) as DocNode['attributes'];
    const customAttributes = one.customAttributes === undefined ? undefined : Object.fromEntries(
      Object.entries(one.customAttributes).map(([name, value]) => [name,
        IDREF_LISTS.has(name) ? value.split(/\s+/).map((part) => html(part) ?? part).join(' ') :
          IDREF_SINGLES.has(name) ? (html(value) ?? value) : value,
      ]),
    );
    const interactions = one.interactions?.map((interaction) => {
      const target = interaction.target === undefined ? undefined : node(interaction.target);
      return target === undefined ? interaction : { ...interaction, target: target as NodeId };
    });
    const layerColors = one.layerColors?.map((colour) => ({ ...colour, node: (node(colour.node) ?? colour.node) as NodeId }));
    const inline = one.inline === undefined ? undefined : mapInlineLinks(one.inline, href => href.startsWith('#') ? reference(href) : href);
    return { ...one, attributes, ...(customAttributes === undefined ? {} : { customAttributes }),
      ...(interactions === undefined ? {} : { interactions }), ...(layerColors === undefined ? {} : { layerColors }),
      ...(inline === undefined ? {} : { inline }),
      children: one.children.map(repair) };
  };
  return repair(copy);
}

// A tree whose elements' references to one another name each element by its place in the tree ("@0.2", "@" the root)
// instead of its id: two copies that point among themselves alike read as equal although each keeps ids of its own.
// What a shared region compares its instances by (core/data/regions.ts).
export function withPlaceReferences(tree: DocNode): DocNode {
  const places = new Map<string, string>();
  const visit = (one: DocNode, place: string): void => {
    places.set(one.id, place);
    one.children.forEach((child, i) => visit(child, place === '@' ? `@${i}` : `${place}.${i}`));
  };
  visit(tree, '@');
  return withReferencesRenamed(tree, (id) => places.get(id), () => undefined, new Map());
}

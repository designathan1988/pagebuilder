// The Insert view (spec palette-click-insert): the element grid of elements.json's palette, its search and density,
// where a new element goes, and the project's components after the element groups.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { isFeatureBuilt } from '../../../core/commands/registry.ts';
import type { DocNode, Location } from '../../../core/document/model.ts';
import { insertLanding, paletteNode, placement } from '../../../core/structure/insert.ts';
import { nodeMaker } from '../../../core/structure/node-maker.ts';
import { instanceLanding, newInstance } from '../../../core/design/components.ts';
import { sequentialIds } from '../../../core/ports/ids.ts';
import type { FeatureId, MessageId } from '../../../generated/ids.ts';
import { elementIcon, manifest } from '../../../manifest/runtime.ts';
import { DoorControl, Icon } from '../../doors/door.tsx';
import { GLYPHS } from '../../doors/placement.ts';
import { alsoNamed, paletteDensity, paletteMatches, paletteRank, tagOfElement } from '../../palette/palette.ts';
import { MODEL_RULES, useEditorState, type EditorState } from '../../store.ts';
import { ViewTitle } from '../view-title.tsx';
import { usePointerValue } from '../../input/pointer/use-views.ts';
import { useLocale, useT } from '../../text.ts';
import { Slots } from '../slots.tsx';
import { componentsOf } from '../../../core/design/instances.ts';
import { requireDoor, drawnAs } from './doors.tsx';

// an element tile: the item whose command takes a palette entry (a component tile takes a component)
export const INSERT_TILE = requireDoor('insert', (d) => drawnAs(d) === 'item' && Object.values(d.command.args).some((a) => a.type === 'palette-entry'));

const INSERT_GROUP = requireDoor('insert', (d) => drawnAs(d) === 'disclosure');

// a component's tile (components.insertInstance): the project's components, after the element groups
const COMPONENT_TILE = requireDoor('insert', (d) => drawnAs(d) === 'item' && 'component' in d.command.args);

// every palette entry, for the search's count of all the panel's entries
const PALETTE_SIZE = manifest.elements.palette.reduce((n, g) => n + g.entries.length, 0);


// The tile a click is about to insert, so the line that says where names that tile's own landing: the tile under the
// pointer, else the one the keyboard is on, else the only tile a search shows (the real-use audit's V-5: the line
// said "Insert in Menu…, after Container 17" while the component tile under it went after the selected header). Each
// is the JSON of the tile's arguments ({"entry": …} or {"component": …}); the panel's own view, shared with the
// Layers' dashed line.
const aim = { focused: null as string | null, sole: null as string | null };
const aimListeners = new Set<() => void>();
function setAim(key: keyof typeof aim, value: string | null): void {
  if (aim[key] === value) return;
  aim[key] = value;
  for (const listener of aimListeners) listener();
}
const subscribeAim = (listener: () => void) => {
  aimListeners.add(listener);
  return () => void aimListeners.delete(listener);
};
export function useAimedTile(): string | null {
  // the pointer's tile is the pointer owner's view (input/pointer/events.ts); the focused and the only one, the panel's
  const pointed = usePointerValue('tileOver');
  const own = useSyncExternalStore(subscribeAim, () => aim.focused ?? aim.sole);
  return pointed ?? own;
}

// the arguments of the tile the focus is on, as their JSON; null off a tile
function tileOf(target: EventTarget): string | null {
  const tile = target instanceof Element ? target.closest('[data-door][data-args]') : null;
  const door = tile?.getAttribute('data-door');
  if (tile === null || tile === undefined || (door !== INSERT_TILE.ref && door !== COMPONENT_TILE.ref)) return null;
  return tile.getAttribute('data-args');
}

// the words a probe's names are made of: only where it lands is read, never its names
const probeWords = (key: MessageId): string => key;

// Where a click on a tile inserts now: the insert commands' own rules (element.insert's insertLanding, the grid's empty
// cell included; components.insertInstance's instanceLanding), given the node the tile makes, so the line and the
// click never differ (G3). With no tile aimed at, where a plain element goes (`placement` with no node: the selected
// container takes it as its last child, a selected leaf is followed by it, nothing selected puts it at the page's end,
// before its footer). The Insert view's top line says it, and the Layers draws a dashed line at the row there (the
// user's real-use audit, A3.19); null when the document has no page.
export function insertDestination(state: EditorState, tile: string | null = null): { readonly parent: Location; readonly previous: DocNode | null } | null {
  const args = tile === null ? {} : (JSON.parse(tile) as { readonly entry?: unknown; readonly component?: unknown });
  // a probe node's ids never reach the document; its moment is the epoch (a dated template's date does not place it)
  const make = () => nodeMaker(state.document, MODEL_RULES, sequentialIds('landing-'), probeWords, 0);
  const definition = typeof args.component === 'string' ? componentsOf(state.document).find((c) => c.name === args.component) : undefined;
  const at =
    typeof args.entry === 'string' ? insertLanding(state, MODEL_RULES, paletteNode(make(), args.entry), undefined, undefined)
    : definition !== undefined ? instanceLanding(state, MODEL_RULES, newInstance(state.document, MODEL_RULES, sequentialIds('landing-'), probeWords, definition), undefined, undefined)
    : placement(state, state.selection, MODEL_RULES, undefined, undefined);
  if (at === null) return null;
  const previous = at.index > 0 ? at.parent.node.children[at.index - 1] ?? null : null;
  return { parent: at.parent, previous };
}

// The line at the top of the Insert view naming where a click inserts: the destination as one JSON text (the hook's
// value stays stable), said in the language the editor shows (the user's real-use audit, A3.19)
function InsertDestination() {
  const t = useT();
  const tile = useAimedTile();
  const said = useEditorState((s) => {
    const at = insertDestination(s, tile);
    return at === null ? null : JSON.stringify({ parent: at.parent.node.name, sibling: at.previous?.name ?? null });
  });
  if (said === null) return null;
  const { parent, sibling } = JSON.parse(said) as { parent: string; sibling: string | null };
  return (
    <p className="insert__destination" data-insert-destination>
      {sibling === null ? t('insert.destination.inside', { parent }) : t('insert.destination.after', { parent, sibling })}
    </p>
  );
}

export function Insert() {
  const t = useT();
  const locale = useLocale();
  const density = useEditorState((s) => paletteDensity(s.ui));
  const collapsed = useEditorState((s) => s.ui.preferences.collapsedGroups ?? NO_GROUPS);
  // what the search field holds: the panel's own view (a filter, not a command)
  const [query, setQuery] = useState('');
  const searching = query.trim() !== '';
  // the entries that answer the search, the best answers first (palette.ts paletteRank): the name in the person's
  // language, then its English name and its synonyms (palette.keywords.<entry>, where the catalogue has them)
  const groups = manifest.elements.palette.map((g) => ({
    group: g,
    entries: g.entries
      .map((e) => ({ e, rank: paletteRank(query, t(e.labelKey as MessageId), tagOfElement(e.element), alsoNamed(locale, e.id, e.labelKey)) }))
      .filter((one): one is { e: (typeof g.entries)[number]; rank: number } => one.rank !== null)
      .sort((a, b) => a.rank - b.rank)
      .map((one) => one.e),
  }));
  // the project's components the search matches (their tiles come after the element groups): a search that matches
  // only a component says so, never "No element matches" above its tile (the real-use audit's V-5)
  const componentText = useEditorState((s) => componentsOf(s.document).map((c) => c.name).join('\n'));
  const allComponents = componentText === '' ? [] : componentText.split('\n');
  const components = allComponents.filter((name) => paletteMatches(query, name, null));
  const entriesShown = groups.flatMap((g) => g.entries);
  const matches = entriesShown.length + components.length;
  // the only tile a search shows is the one a click inserts, so the line says where it lands (useAimedTile)
  const [onlyEntry] = entriesShown;
  const sole = !searching || matches !== 1 ? null : onlyEntry !== undefined ? JSON.stringify({ entry: onlyEntry.id }) : JSON.stringify({ component: components[0] });
  useEffect(() => setAim('sole', sole), [sole]);
  useEffect(() => () => {
    setAim('sole', null);
    setAim('focused', null);
  }, []);
  return (
    <section className="view" aria-label={t('activity.insert')} data-region="insert">
      <ViewTitle panel="elements" title={t('activity.insert')} />
      <InsertDestination />
      <div
        className={`insert insert--${density}`}
        onFocus={(event) => setAim('focused', tileOf(event.target))}
        onBlur={() => setAim('focused', null)}
      >
        <input className="search" type="search" placeholder={t('insert.search')} aria-label={t('insert.search')} data-local="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        {/* the densities, each the small button of its icon with its name as its tooltip (the canonical .seg.icons); they
            are one Tab stop, the density shown, and the arrows move among them (a roving group) */}
        <div className="segmented segmented--icons" role="group">
          <Slots region="insert" render={(slot) => (slot.kind === 'door' && drawnAs(slot.entry) === 'segment' ? <DoorControl key={slot.entry.ref} entry={slot.entry} roving /> : null)} />
        </div>
        {groups.map(({ group: g, entries }) => {
          if (searching && entries.length === 0) return null;
          // a search shows every group that matches, collapsed or not
          const open = searching || !collapsed.includes(g.id);
          return (
            <div key={g.id} className="palette-group">
              <DoorControl entry={INSERT_GROUP} args={{ group: g.id }} expanded={open} className="palette-group__header">
                <span className="door__label">{t(g.labelKey as MessageId)}</span>
                <span className="palette-group__count">{entries.length}</span>
              </DoorControl>
              {/* the tiles are the palette's key context: Enter and Space insert the focused tile's entry */}
              {open ? (
                // a group's tiles are one Tab stop, its first tile; the arrows walk the others (the palette key
                // context; journey03 plan, stage 5: the Insert panel was 74 Tab stops)
                <div className="tiles" data-region="palette-tiles" data-key-context="palette">
                  {entries.map((e, index) => (
                    <DoorControl key={e.id} entry={INSERT_TILE} args={{ entry: e.id }} className="tile" label={t(e.labelKey as MessageId)} ready={isFeatureBuilt(e.feature as FeatureId)} tabbable={index === 0}>
                      <Icon name={e.icon ?? elementIcon(e.element) ?? GLYPHS.folder} />
                      <span className="tile__label">{t(e.labelKey as MessageId)}</span>
                      {density === 'list' ? <span className="tile__tag">{`<${tagOfElement(e.element) ?? ''}>`}</span> : null}
                    </DoorControl>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        <ComponentTiles names={components} density={density} />
        {searching ? <p className="insert__matches">{matches === 0 ? t('palette.search.noMatch', { query: query.trim() }) : t('palette.search.matchCount', { count: matches, total: PALETTE_SIZE + allComponents.length })}</p> : null}
      </div>
    </section>
  );
}

const NO_GROUPS: readonly string[] = [];

// The Components group of the Insert view (`insert` 7; spec reusable-components): a tile per component
// of the project that the search matches (`names`), which places an instance (its click, or its drag onto the page);
// no group while none matches.
function ComponentTiles({ names, density }: { readonly names: readonly string[]; readonly density: string }) {
  const t = useT();
  if (names.length === 0) return null;
  return (
    <div className="palette-group">
      <div className="palette-group__header palette-group__header--static">
        <span className="door__label">{t('palette.group.components')}</span>
        <span className="palette-group__count">{names.length}</span>
      </div>
      {/* a component tile is a button of its own: Enter and Space press it (the palette key context inserts
         elements) */}
      <div className="tiles" data-region="palette-tiles">
        {names.map((name) => (
          <DoorControl key={name} entry={COMPONENT_TILE} args={{ component: name }} className="tile" label={t(COMPONENT_TILE.door.labelKey as MessageId, { component: name })}>
            {COMPONENT_TILE.door.icon !== null ? <Icon name={COMPONENT_TILE.door.icon} /> : null}
            <span className="tile__label">{name}</span>
            {density === 'list' ? <span className="tile__tag">{t('palette.group.components')}</span> : null}
          </DoorControl>
        ))}
      </div>
    </div>
  );
}

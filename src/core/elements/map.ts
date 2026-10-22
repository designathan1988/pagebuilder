// The place a map shows (Settings' "Place on the map", element.setMapPlace): a Map with address placed a fixed spot in
// São Paulo, and the person could change it only by writing an embed address by hand in the frame's Source. The place
// is written as words: an address, or a latitude and a longitude ("-23.56, -46.65"). Coordinates keep the frame on
// OpenStreetMap (its embed takes a box around a marker); an address goes to Google Maps' embed by query, the one
// embed that finds an address with no key (the decision is recorded in auditoria/decisoes.md). The directions links
// beside the map (a link to OpenStreetMap's or Google Maps' directions in the same block) follow the same place, in the
// same undo step.
import type { NodeId } from '../../generated/commands.ts';
import { message, registerHandler, registerPredicate, type Outcome } from '../commands/registry.ts';
import { locate, walk, type DocNode, type DocumentJson, type Location } from '../document/model.ts';
import type { Patch } from '../history/transaction.ts';
import { lockRefusal } from '../nodes/flags.ts';

const OSM_EMBED = /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/;
const GOOGLE_EMBED = /^https:\/\/maps\.google\.com\/maps\?/;
const DIRECTIONS = /^https:\/\/(www\.openstreetmap\.org\/directions\?|www\.google\.com\/maps\/dir\/\?)/;
const COORDINATES = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
// the box an OpenStreetMap embed shows around its marker, in degrees (a few streets each way)
const SPAN = { latitude: 0.006, longitude: 0.01 } as const;

const srcOf = (node: DocNode): string => {
  const src = (node.attributes as Readonly<Record<string, unknown>>).src;
  return typeof src === 'string' ? src : '';
};

// whether the node is a frame that shows a map this command writes
export function isMapFrame(node: DocNode): boolean {
  return node.tag === 'iframe' && (OSM_EMBED.test(srcOf(node)) || GOOGLE_EMBED.test(srcOf(node)));
}

// The place the frame shows now, in the words the field takes: the address of a Google Maps query, the marker of an
// OpenStreetMap embed as "latitude, longitude"; empty for any other map address.
export function mapPlaceOf(node: DocNode): string {
  let url: URL;
  try {
    url = new URL(srcOf(node));
  } catch {
    // not an address the browser reads: no place to show in the field, which writes a new one
    return '';
  }
  if (GOOGLE_EMBED.test(url.href)) return url.searchParams.get('q') ?? '';
  const marker = url.searchParams.get('marker');
  return marker === null ? '' : marker.split(',').join(', ');
}

// the frame's address and the directions' address for a place
export function mapAddresses(place: string): { readonly embed: string; readonly directions: string } {
  const at = COORDINATES.exec(place);
  if (at !== null) {
    const latitude = Number(at[1]);
    const longitude = Number(at[2]);
    const box = [longitude - SPAN.longitude, latitude - SPAN.latitude, longitude + SPAN.longitude, latitude + SPAN.latitude].map((n) => n.toFixed(4)).join(',');
    const marker = `${String(latitude)},${String(longitude)}`;
    return {
      embed: `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(box)}&layer=mapnik&marker=${encodeURIComponent(marker)}`,
      directions: `https://www.openstreetmap.org/directions?to=${encodeURIComponent(marker)}`,
    };
  }
  const query = encodeURIComponent(place.trim());
  return { embed: `https://maps.google.com/maps?q=${query}&output=embed`, directions: `https://www.google.com/maps/dir/?api=1&destination=${query}` };
}

function selectedMap(state: { readonly document: DocumentJson; readonly selection: readonly NodeId[] }): Location | null {
  const id = state.selection.length === 1 ? state.selection[0] : undefined;
  const at = id === undefined ? null : locate(state.document, id);
  return at !== null && isMapFrame(at.node) ? at : null;
}

export const mapSelected = registerPredicate('mapSelected', (state) => selectedMap(state) !== null);

// the directions links of the block the map stands in: its parent's subtree, else its grandparent's (a Map with
// address keeps the link in the text column beside the map's)
function directionsLinks(document: DocumentJson, map: Location): Location[] {
  for (let up = map.parent === null ? null : locate(document, map.parent.id), steps = 0; up !== null && steps < 3; up = up.parent === null ? null : locate(document, up.parent.id), steps += 1) {
    const links = [...walk(up.node)].filter((node) => {
      const href = (node.attributes as Readonly<Record<string, unknown>>).href;
      return typeof href === 'string' && DIRECTIONS.test(href);
    });
    if (links.length > 0) return links.map((node) => locate(document, node.id)).filter((at): at is Location => at !== null);
  }
  return [];
}

export const setMapPlaceCommand = registerHandler('element.setMapPlace', ({ state }, { value }): Outcome<never> => {
  const at = selectedMap(state);
  if (at === null) return { kind: 'refused', message: message('status.map.selectMap') };
  const refused = lockRefusal(state.document, at.node.id, 'status.locked.edit');
  if (refused !== null) return { kind: 'refused', message: refused };
  if (value.trim() === '') return { kind: 'refused', message: message('status.map.emptyPlace') };
  const { embed, directions } = mapAddresses(value);
  // the same place again changes nothing (the history keeps no step: noChange no-entry)
  if (embed === srcOf(at.node)) return { kind: 'change', patches: [] };
  const patches: Patch[] = [
    { op: 'replace', path: [...at.path, 'attributes', 'src'], value: embed },
    ...directionsLinks(state.document, at).map((link): Patch => ({ op: 'replace', path: [...link.path, 'attributes', 'href'], value: directions })),
  ];
  return { kind: 'change', patches, message: message('status.map.placed', { place: value.trim() }) };
});

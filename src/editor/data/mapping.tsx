// Connect fields (spec content-data, "binding"; journey03 C4, bet C): the element to repeat — the one selected, or the
// repeated item it lies in — and each of its parts that can show a value (a text, an image's source and alternative
// text, a link's address), with the field it shows: chosen in its menu (a field of the item, or of the item a
// reference names: "Author › Name"), or by dragging a column (of the grid or of the list here) onto it, which the
// pointer owner runs (data-door, data-args); a bound number, date or yes/no has its format menu. The selected element's
// show row says when it shows (a field set, empty, equal to a value). Under them, a preview of what the first items
// would show, with the problem of a value no element could show (an image no project file answers to). Then the
// labelled Fill, which repeats the element for every item the query shows — or, for an element inside an item, Fill
// from a multireference field of that item (a nested list) — and Unbind for a list bound already.
import type { ReactNode } from 'react';
import type { NodeId } from '../../generated/commands.ts';
import { DataRefusal, collectionNamed, lookupIn, queryItems } from '../../core/data/collections.ts';
import { bindablePaths, fieldFits, formatsOf, itemPagesOf, pathField, reached, repeats, shownBy, siteCurrency, targetsOf, valueFor } from '../../core/data/bindings.ts';
import { enclosingCollection } from '../../core/data/commands.ts';
import { CURRENCIES, ITEM_PAGE, SHOW, SHOW_WHEN, type BindTarget, type Bound, type Collection, type Query } from '../../core/data/model.ts';
import { lineage, locate, type DocNode, type DocumentJson } from '../../core/document/model.ts';
import { fileAt, objectUrl } from '../../core/files/files.ts';
import { plainText, type InlineRun } from '../../core/text/inline.ts';
import type { MessageId } from '../../generated/ids.ts';
import { manifest } from '../../manifest/runtime.ts';
import { DoorControl } from '../doors/door.tsx';
import { MODEL_RULES, useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { DoorField, doorOf, type Option } from './controls.tsx';

const MAPPING = 'data-mapping';
const BIND = doorOf(MAPPING, 'bind-field');
const FORMAT = doorOf(MAPPING, 'bind-format');
const CURRENCY = doorOf(MAPPING, 'bind-currency');
const SHOW_FIELD = doorOf(MAPPING, 'show-field');
const SHOW_WHEN_DOOR = doorOf(MAPPING, 'show-when');
const SHOW_VALUE = doorOf(MAPPING, 'show-value');
const FILL = doorOf(MAPPING, 'fill-list');
const FILL_NESTED = doorOf(MAPPING, 'fill-nested');
const UNBIND = doorOf(MAPPING, 'unbind');
const COLUMN_DRAG = manifest.doors.find((entry) => entry.door.kind === 'panel-drag' && entry.door.source === 'data-column');
// the items the preview shows
const PREVIEWED = 3;

// The element a fill repeats for the selected one: the item of a nested list it lies in, else the repeated item of a
// bound list it lies in, else the instance it lies in, else the element itself; the page's root never.
function templateOf(document: DocumentJson, id: NodeId): { readonly root: DocNode; readonly list: DocNode | null } | null {
  const chain = lineage(document, id);
  for (let i = chain.length - 1; i >= 1; i -= 1) {
    const node = chain[i] as DocNode;
    const parent = chain[i - 1] as DocNode;
    if (parent.dataList?.via !== undefined && repeats(parent.dataList, node)) return { root: node, list: parent };
    if (node.component !== undefined) return { root: node, list: parent.dataList?.component === node.component ? parent : null };
  }
  const node = chain.at(-1);
  return node === undefined || chain.length < 2 ? null : { root: node, list: null };
}

// What a value shows in the preview: a text, a thumbnail of a project image, an address.
function Shown({ document, value, to }: { readonly document: DocumentJson; readonly value: string | readonly InlineRun[] | undefined; readonly to: BindTarget }): ReactNode {
  const t = useT();
  if (value === undefined) return <span className="data-preview__empty">{t('data.emptyValue')}</span>;
  const text = typeof value === 'string' ? value : plainText(value);
  const file = to === 'image' ? fileAt(document, text) : null;
  if (file !== null) return <img className="data-preview__image" src={objectUrl(file)} alt="" />;
  return <span>{text}</span>;
}

// The format menu of a bound part, while its field has formats (a number, a date, a yes/no), and the currency menu of a
// currency format.
function FormatFields({ node, bound, collection }: { readonly node: DocNode; readonly bound: Bound; readonly collection: Collection }): ReactNode {
  const t = useT();
  const document = useEditorState((state) => state.document);
  const field = bound.field === ITEM_PAGE ? undefined : pathField(lookupIn(document), collection, bound.field);
  const formats = field === undefined ? [] : formatsOf(field);
  if (field === undefined || formats.length === 0 || bound.to === SHOW) return null;
  const options: Option[] = [...(field.type === 'boolean' ? [] : [{ value: 'plain', label: t('data.format.plain') }]), ...formats.filter((format) => format !== 'plain').map((format) => ({ value: format, label: t(`data.format.${format}` as MessageId) }))];
  const current = bound.format ?? (field.type === 'boolean' ? 'yes-no' : 'plain');
  const args = { node: node.id, to: bound.to };
  return (
    <>
      <DoorField entry={FORMAT} args={args} name="format" value={current} options={options} label={t('data.bindFormat', { name: node.name })} className="data-field--format" />
      {current !== 'currency' ? null : <DoorField entry={CURRENCY} args={{ ...args, format: 'currency' }} name="currency" value={bound.currency ?? siteCurrency(document.language)} options={CURRENCIES.map((code) => ({ value: code, label: code }))} label={t('data.bindCurrency', { name: node.name })} className="data-field--format" />}
    </>
  );
}

// The show row of the selected element: the field that decides whether it shows ("Always" for none), when, and the
// value an equality compares with.
function ShowRow({ node, collection }: { readonly node: DocNode; readonly collection: Collection }): ReactNode {
  const t = useT();
  const document = useEditorState((state) => state.document);
  const show = (node.bind ?? []).find((b) => b.to === SHOW);
  const paths = bindablePaths(lookupIn(document), collection);
  const args = { node: node.id, field: show?.field ?? '', when: show?.when ?? 'filled', value: show?.value ?? '' };
  return (
    <div className="data-show" role="group" aria-label={t('data.showTitle', { name: node.name })}>
      <span className="data-show__title">{t('data.showTitle', { name: node.name })}</span>
      <DoorField entry={SHOW_FIELD} args={args} name="field" value={show?.field ?? ''} options={[{ value: '', label: t('data.showAlways') }, ...paths.map((path) => ({ value: path.path, label: path.label }))]} label={t('data.showField', { name: node.name })} className="data-field--show" />
      {show === undefined ? null : <DoorField entry={SHOW_WHEN_DOOR} args={args} name="when" value={show.when ?? 'filled'} options={SHOW_WHEN.map((when) => ({ value: when, label: t(`data.when.${when}` as MessageId) }))} label={t('data.showWhenLabel', { name: node.name })} className="data-field--show" />}
      {show === undefined || (show.when !== 'eq' && show.when !== 'neq') ? null : <DoorField entry={SHOW_VALUE} args={args} name="value" value={show.value ?? ''} label={t('data.showValue', { name: node.name })} className="data-field--show" />}
    </div>
  );
}

export function MappingView({ collection: shown, query, selected }: { readonly collection: Collection; readonly query: Query; readonly selected: NodeId | null }): ReactNode {
  const t = useT();
  const document = useEditorState((state) => state.document);
  const lookup = lookupIn(document);
  const template = selected === null ? null : templateOf(document, selected);
  // the collection the element shows: its list's, else the item's it stands in (a page made for an item), else the one
  // the panel shows
  const listed = template?.list?.dataList === undefined ? undefined : collectionNamed(document, template.list.dataList.collection);
  const outer = template === null ? undefined : enclosingCollection(document, template.root.id as NodeId);
  const collection = listed ?? (template?.list === null && outer !== undefined && outer.name !== shown.name && template.root.component === undefined ? outer : shown);
  const columns = (
    <ul className="data-columns" aria-label={t('data.columns')}>
      {collection.fields.map((field) => (
        <li key={field.key} className="data-column" data-door={COLUMN_DRAG?.ref} data-args={JSON.stringify({ field: field.key })} data-column={field.key}>
          {field.label}
          <span className="data-column__type">{t(`data.type.${field.type}` as MessageId)}</span>
        </li>
      ))}
    </ul>
  );
  if (template === null) {
    return (
      <section className="data-mapping" data-region="data-mapping" aria-label={t('data.mapping')}>
        <p className="data-panel__note">{t('data.selectToRepeat')}</p>
        {columns}
      </section>
    );
  }
  const targets = [...reached(template.root)].flatMap((node) => targetsOf(node, MODEL_RULES).map((to) => ({ node, to })));
  const paths = bindablePaths(lookup, collection);
  const options = (to: BindTarget): Option[] => [
    { value: '', label: t('data.none') },
    ...paths.filter((path) => fieldFits(to, path.field)).map((path) => ({ value: path.path, label: path.label })),
    ...(fieldFits(to, ITEM_PAGE) ? [{ value: ITEM_PAGE, label: t('data.itemPage') }] : []),
  ];
  const pages = itemPagesOf(document);
  const usedQuery = collection.name === shown.name ? query : (template.list?.dataList?.query ?? {});
  const rows = queryItems(collection, usedQuery, lookup).slice(0, PREVIEWED);
  const bound = targets.flatMap(({ node, to }) => (node.bind ?? []).filter((b) => b.to === to).map((b) => ({ node, bound: b, to })));
  const selectedNode = selected === null ? null : (locate(document, selected)?.node ?? null);
  // a nested list for an element inside an item: each multireference field of that item, to the collection it names
  // a nested list: the element a nested list repeats already, else the element selected inside an item (not a list's
  // own repeated item), repeated for the items a multireference field of that item names
  const via = template.list?.dataList?.via;
  const nestedNode = via !== undefined ? template.root : selectedNode !== null && !(template.list !== null && selectedNode.id === template.root.id) ? selectedNode : null;
  const nestedOuter = nestedNode === null ? undefined : via !== undefined && template.list !== null ? enclosingCollection(document, template.list.id as NodeId) : enclosingCollection(document, nestedNode.id as NodeId);
  const nested = nestedNode === null ? [] : (nestedOuter?.fields ?? []).filter((field) => field.type === 'multireference' && field.collection !== undefined && (via === undefined || field.key === via));
  return (
    <section className="data-mapping" data-region="data-mapping" aria-label={t('data.mapping')}>
      <p className="data-panel__note">{t('data.mappingHelp', { name: template.root.name })}</p>
      {collection.name === shown.name ? null : <p className="data-panel__note">{t('data.listOf', { name: template.list?.name ?? template.root.name, collection: collection.name })}</p>}
      {columns}
      <ul className="data-targets" aria-label={t('data.targets')}>
        {targets.map(({ node, to }) => {
          // what the part shows now (a paragraph's text, an image's file): three paragraphs of a card are told apart by
          // what they say (the final use's USE-9: three rows read "Paragra… text")
          const shows = shownBy(node, to)?.trim() ?? '';
          const held = (node.bind ?? []).find((b) => b.to === to);
          return (
            <li key={`${node.id}:${to}`} className="data-target" data-data-target="" data-args={JSON.stringify({ node: node.id, to })}>
              {/* the part's name, what it shows and what of it binds, each on its line; the menu moves under them when
                  the panel is too narrow for both (panel.css), and the whole texts stay readable on hover */}
              <span className="data-target__name" title={[node.name, shows, t(`data.target.${to}` as MessageId)].filter((part) => part !== '').join(' — ')}>
                <span className="data-target__label">{node.name}</span>
                {shows === '' ? null : <span className="data-target__shows">{shows}</span>}
                <span className="data-column__type">{t(`data.target.${to}` as MessageId)}</span>
              </span>
              <DoorField entry={BIND} args={{ node: node.id, to }} name="field" value={held?.field ?? ''} options={options(to)} label={t('data.bindLabel', { name: node.name, target: t(`data.target.${to}` as MessageId) })} />
              {held === undefined ? null : <FormatFields node={node} bound={held} collection={collection} />}
            </li>
          );
        })}
      </ul>
      {selectedNode === null ? null : <ShowRow node={selectedNode} collection={collection} />}
      {bound.length === 0 ? null : (
        <div className="data-grid" aria-label={t('data.previewTitle')}>
          <table className="data-grid__table">
            <thead>
              <tr>
                {bound.map(({ node, bound: b }) => (
                  <th key={`${node.id}:${b.to}`} scope="col">
                    {node.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const place = { collection, item, row: collection.items.indexOf(item) + 1 };
                return (
                  <tr key={item.id}>
                    {bound.map(({ node, bound: b, to }) => {
                      try {
                        return (
                          <td key={`${node.id}:${b.to}`}>
                            <Shown document={document} value={valueFor(document, b, place, pages)} to={to} />
                          </td>
                        );
                      } catch (error) {
                        if (!(error instanceof DataRefusal)) throw error;
                        return (
                          <td key={`${node.id}:${b.to}`} className="data-panel__problem" role="alert">
                            {t(error.refusal.key, error.refusal.params)}
                          </td>
                        );
                      }
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {nested.length === 0 || nestedOuter === undefined || nestedNode === null ? null : <p className="data-panel__note">{t('data.fillNestedHelp', { name: nestedNode.name, outer: nestedOuter.name, field: nested[0]?.label ?? '', collection: nested[0]?.collection ?? '' })}</p>}
      <div className="data-panel__actions">
        {via !== undefined || (template.list === null && isInsideItem(document, template.root)) ? null : <DoorControl entry={FILL} args={{ node: template.root.id, collection: collection.name, query: usedQuery }} />}
        {nested.map((field) => (
          <DoorControl key={field.key} entry={FILL_NESTED} args={{ node: (nestedNode ?? template.root).id, collection: field.collection ?? '', query: field.collection === shown.name ? query : {}, via: field.key }} label={t('data.fillNestedFace', { field: field.label })}>
            <span className="door__label">{t('data.fillNestedFace', { field: field.label })}</span>
          </DoorControl>
        ))}
        {template.list === null ? null : <DoorControl entry={UNBIND} args={{ node: template.list.id }} />}
      </div>
    </section>
  );
}

// Whether an element stands inside a repeated item of a bound list (where a plain Fill would make a component inside
// an instance, which the model refuses): there, only a nested fill repeats it.
function isInsideItem(document: DocumentJson, node: DocNode): boolean {
  return lineage(document, node.id as NodeId).some((one, i, chain) => {
    const next = chain[i + 1];
    return one.dataList !== undefined && next !== undefined && repeats(one.dataList, next);
  });
}

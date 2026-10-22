// The Data panel's collection (spec data-collections): its name, its fields (label, type, removal, a new one), the
// query that chooses and orders what the grid shows and what Fill repeats, and the grid of its items, each cell a
// field that keeps what is typed in the field's type. The columns a person drags onto an element are Connect fields'
// (mapping.tsx), drawn once, so a drag always starts from one handle per column.
import type { ReactNode } from 'react';
import { collectionsOf, fieldText, itemTitle, lookupIn, MAX_DECIMALS, queryItems } from '../../core/data/collections.ts';
import { FIELD_TYPES, FILTER_OPERATORS, PAGINGS, isReferenceType, type Collection, type Field, type Query } from '../../core/data/model.ts';
import type { MessageId } from '../../generated/ids.ts';
import { filesOf } from '../../core/document/model.ts';
import { typedMarkupOf, type InlineRun } from '../../core/text/inline.ts';
import { DoorControl } from '../doors/door.tsx';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { DoorField, DoorForm, doorOf, type Option } from './controls.tsx';

const COLLECTION = 'data-collection';
const GRID = 'data-grid';
const RENAME = doorOf(COLLECTION, 'collection-name');
const REMOVE_COLLECTION = doorOf(COLLECTION, 'collection-delete');
const FIELD_LABEL = doorOf(COLLECTION, 'field-label');
const FIELD_TYPE = doorOf(COLLECTION, 'field-type');
const FIELD_REMOVE = doorOf(COLLECTION, 'field-remove');
// a number field's decimal places (DATA-1): the fewest it shows on the page, 0 to MAX_DECIMALS, digits in any language
const FIELD_DECIMALS = doorOf(COLLECTION, 'field-decimals');
const DECIMAL_PLACES: readonly Option[] = Array.from({ length: MAX_DECIMALS + 1 }, (_, n) => ({ value: String(n), label: String(n) }));
const FIELD_ADD = doorOf(COLLECTION, 'field-add');
// a reference's collection, an option's choices, the field a slug is made from
const FIELD_TARGET = doorOf(COLLECTION, 'field-target');
const FIELD_OPTIONS = doorOf(COLLECTION, 'field-options');
const FIELD_FROM = doorOf(COLLECTION, 'field-from');
const PAGE_SIZE = doorOf(COLLECTION, 'page-size');
const PAGING = doorOf(COLLECTION, 'paging');
const FILTER_FIELD = doorOf(COLLECTION, 'filter-field');
const FILTER_OPERATOR = doorOf(COLLECTION, 'filter-operator');
const FILTER_VALUE = doorOf(COLLECTION, 'filter-value');
const SORT_FIRST = doorOf(COLLECTION, 'sort-first');
const SORT_SECOND = doorOf(COLLECTION, 'sort-second');
const OFFSET = doorOf(COLLECTION, 'offset');
const LIMIT = doorOf(COLLECTION, 'limit');
const CLEAR = doorOf(COLLECTION, 'query-clear');
const CELL = doorOf(GRID, 'cell');
const ITEM_UP = doorOf(GRID, 'item-up');
const ITEM_DOWN = doorOf(GRID, 'item-down');
const ITEM_DELETE = doorOf(GRID, 'item-delete');
const ITEM_ADD = doorOf(GRID, 'item-add');

// A control under its caption: what a number counts, what a menu chooses ("Made from: Título").
const part = (caption: string, field: ReactNode, wide = false): ReactNode => (
  <div className={`data-part${wide ? ' data-part--wide' : ''}`}>
    <span className="data-part__caption">{caption}</span>
    {field}
  </div>
);

function typeOptions(t: ReturnType<typeof useT>): Option[] {
  return FIELD_TYPES.map((type) => ({ value: type, label: t(`data.type.${type}` as MessageId) }));
}

function Fields({ collection }: { readonly collection: Collection }): ReactNode {
  const t = useT();
  const types = typeOptions(t);
  const collections = useEditorState((state) => collectionsOf(state.document));
  const targets: Option[] = collections.map((one) => ({ value: one.name, label: one.name }));
  const sources: Option[] = [{ value: '', label: t('data.fieldFromFirst') }, ...collection.fields.filter((f) => f.type === 'text').map((f) => ({ value: f.key, label: f.label }))];
  return (
    <div className="data-fields" role="group" aria-label={t('data.fields')}>
      {collection.fields.map((field) => (
        <div key={field.key} className="data-fields__row">
          <DoorField entry={FIELD_LABEL} args={{ collection: collection.name, field: field.key }} name="label" value={field.label} />
          {/* Delete beside the name it removes: the type menu, as wide as its longest type, takes the next line */}
          <DoorControl entry={FIELD_REMOVE} args={{ collection: collection.name, field: field.key }} label={t('data.removeFieldNamed', { label: field.label })} />
          <DoorField entry={FIELD_TYPE} args={{ collection: collection.name, field: field.key }} name="type" value={field.type} options={types} className="data-field--type" />
          {/* its name in sight: a lone "0" under the type said nothing */}
          {field.type === 'number' ? part(t('data.fieldDecimals'), <DoorField entry={FIELD_DECIMALS} args={{ collection: collection.name, field: field.key }} name="decimals" value={String(field.decimals ?? 0)} options={DECIMAL_PLACES} transform={Number} className="data-field--decimals" />, true) : null}
          {isReferenceType(field.type) ? part(t('data.fieldTarget'), <DoorField entry={FIELD_TARGET} args={{ collection: collection.name, field: field.key }} name="target" value={field.collection ?? ''} options={targets} />, true) : null}
          {field.type === 'option' ? part(t('data.fieldOptions'), <DoorField entry={FIELD_OPTIONS} args={{ collection: collection.name, field: field.key }} name="options" value={(field.options ?? []).join(', ')} />, true) : null}
          {field.type === 'slug' ? part(t('data.fieldFrom'), <DoorField entry={FIELD_FROM} args={{ collection: collection.name, field: field.key }} name="from" value={field.from ?? ''} options={sources} />, true) : null}
        </div>
      ))}
      <DoorForm entry={FIELD_ADD} args={{ collection: collection.name }} className="data-fields__add">
        <input className="input" name="label" aria-label={t('data.newFieldLabel')} placeholder={t('data.newFieldLabel')} autoComplete="off" />
        <select className="input" name="type" aria-label={t('data.newFieldType')} defaultValue="text">
          {types.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </DoorForm>
    </div>
  );
}

// The query's controls, each its own door of data.setQuery keeping the text of its part: the filter (its field, its
// operator, the text it compares with), the order by up to two fields, the offset, the limit, and clearing it all.
function QueryBar({ collection, query }: { readonly collection: Collection; readonly query: Query }): ReactNode {
  const t = useT();
  const none: Option = { value: '', label: t('data.none') };
  const filter = query.filters?.[0];
  const order = query.order ?? [];
  const sortOptions: Option[] = [
    none,
    ...collection.fields.flatMap((f) => [
      // the order in the words of the field's kind: a price lowest first, a date oldest first, a text A to Z
      { value: `${f.key}:asc`, label: t(f.type === 'number' ? 'data.sortLowest' : f.type === 'date' ? 'data.sortOldest' : 'data.sortAscending', { label: f.label }) },
      { value: `${f.key}:desc`, label: t(f.type === 'number' ? 'data.sortHighest' : f.type === 'date' ? 'data.sortNewest' : 'data.sortDescending', { label: f.label }) },
    ]),
  ];
  const sortValue = (i: number) => (order[i] === undefined ? '' : `${order[i].field}:${order[i].direction}`);
  // each part under its caption, so a number a person reads says what it counts (the skip, the most shown, the items
  // per page) and a menu shows its whole choice ("Data (Z a A, 9 a 0)" read "Data (Z a" beside the filter's menu)
  return (
    <div className="data-query" role="group" aria-label={t('data.query')}>
      {part(t('data.filterField'), <DoorField entry={FILTER_FIELD} args={{}} name="value" value={filter?.field ?? ''} options={[none, ...collection.fields.map((f) => ({ value: f.key, label: f.label }))]} />, true)}
      {filter === undefined ? null : (
        <>
          {part(t('data.filterOperator'), <DoorField entry={FILTER_OPERATOR} args={{}} name="value" value={filter.operator} options={FILTER_OPERATORS.map((operator) => ({ value: operator, label: t(`data.operator.${operator}` as MessageId) }))} />)}
          {filter.operator === 'empty' || filter.operator === 'filled' ? null : part(t('data.filterValue'), <DoorField entry={FILTER_VALUE} args={{}} name="value" value={filter.value ?? ''} />)}
        </>
      )}
      {part(t('data.sortFirst'), <DoorField entry={SORT_FIRST} args={{}} name="value" value={sortValue(0)} options={sortOptions} />, true)}
      {order[0] === undefined ? null : part(t('data.sortSecond'), <DoorField entry={SORT_SECOND} args={{}} name="value" value={sortValue(1)} options={sortOptions} />, true)}
      {part(t('data.offset'), <DoorField entry={OFFSET} args={{}} name="value" value={String(query.offset ?? 0)} />)}
      {part(t('data.limit'), <DoorField entry={LIMIT} args={{}} name="value" value={query.limit === undefined ? '' : String(query.limit)} />)}
      {part(t('data.pageSize'), <DoorField entry={PAGE_SIZE} args={{}} name="value" value={query.pageSize === undefined ? '' : String(query.pageSize)} />)}
      {query.pageSize === undefined ? null : part(t('data.paging'), <DoorField entry={PAGING} args={{}} name="value" value={query.paging ?? 'more'} options={PAGINGS.map((paging) => ({ value: paging, label: t(`data.paging.${paging}` as MessageId) }))} />, true)}
      <DoorControl entry={CLEAR} />
    </div>
  );
}

function Grid({ collection, query }: { readonly collection: Collection; readonly query: Query }): ReactNode {
  const t = useT();
  const words = { yes: t('data.yes'), no: t('data.no') };
  // a number reads as the site shows it: in the site's language, with its field's decimal places
  const language = useEditorState((state) => state.document.language);
  const document = useEditorState((state) => state.document);
  const lookup = lookupIn(document);
  const rows = queryItems(collection, query, lookup);
  // an option is chosen from its choices, an item of a reference from the items of its collection (by id, shown by
  // title); every other value is typed (a multireference: the titles parted by commas)
  const choices = (field: Field): Option[] | undefined => {
    if (field.type === 'option') return [{ value: '', label: t('data.none') }, ...(field.options ?? []).map((option) => ({ value: option, label: option }))];
    // a yes or no is chosen, as the grid shows it (it was a text box that took "yes", "sim", "1"… with nothing saying so)
    if (field.type === 'boolean') return [{ value: '', label: t('data.none') }, { value: words.yes, label: words.yes }, { value: words.no, label: words.no }];
    const target = field.type === 'reference' && field.collection !== undefined ? lookup(field.collection) : undefined;
    return target === undefined ? undefined : [{ value: '', label: t('data.none') }, ...target.items.map((item) => ({ value: item.id, label: itemTitle(target, item, language) }))];
  };
  // an image, a video or a file cell offers the project's files of its kind as it is typed, and says what it takes:
  // it was an empty box, and nothing told the person to write "img/photo.png" or where the project's images were
  const fileKinds: Readonly<Partial<Record<Field['type'], string>>> = { image: 'image/', video: 'video/', file: '' };
  const CELL_HINTS: Readonly<Partial<Record<Field['type'], MessageId>>> = { image: 'data.cellImageHint', video: 'data.cellVideoHint', file: 'data.cellFileHint', link: 'data.cellLinkHint', colour: 'data.cellColourHint', email: 'data.cellEmailHint', multireference: 'data.cellItemsHint', richtext: 'data.cellRichHint' };
  // the control a cell is: a date with its calendar, an email checked as one, a rich text over several lines
  const CELL_KINDS: Readonly<Partial<Record<Field['type'], 'date' | 'email' | 'textarea'>>> = { date: 'date', email: 'email', richtext: 'textarea' };
  const suggested = (field: Field): readonly string[] | undefined => {
    // a link offers the site's pages (a web address is typed)
    if (field.type === 'link') return document.pages.filter((one) => one.tree.dataItem?.template !== true).map((one) => one.file);
    // a colour offers the hex colours of the project's variables (a cell holds a hex colour)
    if (field.type === 'colour') return [...new Set((document.tokens ?? []).map((one) => one.value.trim().toLowerCase()).filter((value) => /^#[0-9a-f]{3,8}$/u.test(value)))];
    const kind = fileKinds[field.type];
    return kind === undefined ? undefined : filesOf(document).filter((one) => one.type.startsWith(kind)).map((one) => one.path);
  };
  const cell = (field: Field, value: string, item: string) => {
    const options = choices(field);
    const files = options === undefined ? (suggested(field) ?? (CELL_HINTS[field.type] === undefined ? undefined : [])) : undefined;
    return <DoorField entry={CELL} args={{ collection: collection.name, item, field: field.key }} name="value" value={value} {...(options === undefined ? {} : { options })} {...(CELL_KINDS[field.type] === undefined ? {} : { kind: CELL_KINDS[field.type] })} {...(files === undefined ? {} : { suggestions: files, placeholder: t(CELL_HINTS[field.type] ?? 'data.cellFileHint') })} label={t('data.cellLabel', { column: field.label, row: collection.items.findIndex((one) => one.id === item) + 1 })} />;
  };
  return (
    <div className="data-grid" data-region="data-grid">
      <table className="data-grid__table">
        <thead>
          <tr>
            <th scope="col" className="data-grid__number">
              {t('data.row')}
            </th>
            {collection.fields.map((field) => (
              <th key={field.key} scope="col">
                <span className="data-column">
                  {field.label}
                  <span className="data-column__type">{t(`data.type.${field.type}` as MessageId)}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const at = collection.items.indexOf(item);
            return (
              <tr key={item.id}>
                {/* the row's number with its Move and Delete, held at the table's start while the fields scroll sideways:
                    held at its end, they lay over the last field (Price could not be typed in) */}
                <th scope="row" className="data-grid__number">
                  <span className="data-grid__row">
                    {at + 1}
                    <span className="data-grid__actions">
                      <DoorControl entry={ITEM_UP} args={{ collection: collection.name, item: item.id, to: at - 1 }} ready={at > 0} label={t('data.moveUp', { row: at + 1 })} />
                      <DoorControl entry={ITEM_DOWN} args={{ collection: collection.name, item: item.id, to: at + 1 }} ready={at < collection.items.length - 1} label={t('data.moveDown', { row: at + 1 })} />
                      <DoorControl entry={ITEM_DELETE} args={{ collection: collection.name, items: [item.id] }} label={t('data.deleteRow', { row: at + 1 })} />
                    </span>
                  </span>
                </th>
                {collection.fields.map((field) => (
                  <td key={field.key}>{cell(field, field.type === 'reference' ? String(item.values[field.key] ?? '') : field.type === 'richtext' && Array.isArray(item.values[field.key]) ? typedMarkupOf(item.values[field.key] as InlineRun[]) : fieldText(field, item.values[field.key], words, { language, decimals: field.decimals }, lookup), item.id)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="data-panel__note">{t(collection.items.length === 0 ? 'data.noItems' : 'data.noMatches')}</p> : null}
      <DoorControl entry={ITEM_ADD} args={{ collection: collection.name }} />
    </div>
  );
}

export function CollectionView({ collection, query }: { readonly collection: Collection; readonly query: Query }): ReactNode {
  return (
    <div className="data-collection" data-region="data-collection">
      <div className="data-collection__head">
        <DoorField entry={RENAME} args={{ collection: collection.name }} name="name" value={collection.name} />
        <DoorControl entry={REMOVE_COLLECTION} args={{ collection: collection.name }} />
      </div>
      <Fields collection={collection} />
      <QueryBar collection={collection} query={query} />
      <Grid collection={collection} query={query} />
    </div>
  );
}

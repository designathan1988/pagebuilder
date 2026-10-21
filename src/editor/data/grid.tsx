// The Data panel's collection (spec data-collections): its name, its fields (label, type, removal, a new one), the
// query that chooses and orders what the grid shows and what Fill repeats, and the grid of its items, each cell a
// field that keeps what is typed in the field's type. The columns a person drags onto an element are Connect fields'
// (mapping.tsx), drawn once, so a drag always starts from one handle per column.
import type { ReactNode } from 'react';
import { cellText, queryItems } from '../../core/data/collections.ts';
import { FIELD_TYPES, FILTER_OPERATORS, type Collection, type Field, type Query } from '../../core/data/model.ts';
import type { MessageId } from '../../generated/ids.ts';
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
const FIELD_ADD = doorOf(COLLECTION, 'field-add');
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

function typeOptions(t: ReturnType<typeof useT>): Option[] {
  return FIELD_TYPES.map((type) => ({ value: type, label: t(`data.type.${type}` as MessageId) }));
}

function Fields({ collection }: { readonly collection: Collection }): ReactNode {
  const t = useT();
  const types = typeOptions(t);
  return (
    <div className="data-fields" role="group" aria-label={t('data.fields')}>
      {collection.fields.map((field) => (
        <div key={field.key} className="data-fields__row">
          <DoorField entry={FIELD_LABEL} args={{ collection: collection.name, field: field.key }} name="label" value={field.label} />
          <DoorField entry={FIELD_TYPE} args={{ collection: collection.name, field: field.key }} name="type" value={field.type} options={types} className="data-field--type" />
          <DoorControl entry={FIELD_REMOVE} args={{ collection: collection.name, field: field.key }} label={t('data.removeFieldNamed', { label: field.label })} />
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
      { value: `${f.key}:asc`, label: t('data.sortAscending', { label: f.label }) },
      { value: `${f.key}:desc`, label: t('data.sortDescending', { label: f.label }) },
    ]),
  ];
  const sortValue = (i: number) => (order[i] === undefined ? '' : `${order[i].field}:${order[i].direction}`);
  return (
    <div className="data-query" role="group" aria-label={t('data.query')}>
      <DoorField entry={FILTER_FIELD} args={{}} name="value" value={filter?.field ?? ''} options={[none, ...collection.fields.map((f) => ({ value: f.key, label: f.label }))]} />
      {filter === undefined ? null : (
        <>
          <DoorField entry={FILTER_OPERATOR} args={{}} name="value" value={filter.operator} options={FILTER_OPERATORS.map((operator) => ({ value: operator, label: t(`data.operator.${operator}` as MessageId) }))} />
          {filter.operator === 'empty' || filter.operator === 'filled' ? null : <DoorField entry={FILTER_VALUE} args={{}} name="value" value={filter.value ?? ''} />}
        </>
      )}
      <DoorField entry={SORT_FIRST} args={{}} name="value" value={sortValue(0)} options={sortOptions} />
      {order[0] === undefined ? null : <DoorField entry={SORT_SECOND} args={{}} name="value" value={sortValue(1)} options={sortOptions} />}
      <DoorField entry={OFFSET} args={{}} name="value" value={String(query.offset ?? 0)} />
      <DoorField entry={LIMIT} args={{}} name="value" value={query.limit === undefined ? '' : String(query.limit)} />
      <DoorControl entry={CLEAR} />
    </div>
  );
}

function Grid({ collection, query }: { readonly collection: Collection; readonly query: Query }): ReactNode {
  const t = useT();
  const words = { yes: t('data.yes'), no: t('data.no') };
  // a number reads as the site shows it: in the site's language, with its field's decimal places
  const language = useEditorState((state) => state.document.language);
  const rows = queryItems(collection, query);
  const cell = (field: Field, value: string, item: string) => <DoorField entry={CELL} args={{ collection: collection.name, item, field: field.key }} name="value" value={value} label={t('data.cellLabel', { column: field.label, row: collection.items.findIndex((one) => one.id === item) + 1 })} />;
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
            <th scope="col">
              <span className="visually-hidden">{t('data.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const at = collection.items.indexOf(item);
            return (
              <tr key={item.id}>
                <th scope="row" className="data-grid__number">
                  {at + 1}
                </th>
                {collection.fields.map((field) => (
                  <td key={field.key}>{cell(field, cellText(item.values[field.key], words, { language, decimals: field.decimals }), item.id)}</td>
                ))}
                <td className="data-grid__actions">
                  <DoorControl entry={ITEM_UP} args={{ collection: collection.name, item: item.id, to: at - 1 }} ready={at > 0} label={t('data.moveUp', { row: at + 1 })} />
                  <DoorControl entry={ITEM_DOWN} args={{ collection: collection.name, item: item.id, to: at + 1 }} ready={at < collection.items.length - 1} label={t('data.moveDown', { row: at + 1 })} />
                  <DoorControl entry={ITEM_DELETE} args={{ collection: collection.name, items: [item.id] }} label={t('data.deleteRow', { row: at + 1 })} />
                </td>
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

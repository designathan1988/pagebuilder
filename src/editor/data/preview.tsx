// The preview of a data file being imported (spec content-data, "import"): its sheets, the problem of a sheet that
// cannot be read, its columns with the type each will take (a menu per column) and its first rows; then where its rows
// go — a new collection named as typed (the file's name when nothing is), or into the collection the panel shows,
// after its items, in place of them, or updating the items whose first column matches.
import type { ReactNode } from 'react';
import { cellText, decimalsOf, readCell } from '../../core/data/collections.ts';
import { FIELD_TYPES, type Collection } from '../../core/data/model.ts';
import type { MessageId } from '../../generated/ids.ts';
import { DoorControl } from '../doors/door.tsx';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { DoorField, DoorForm, doorOf } from './controls.tsx';
import { columnFields, previewSheet, type DataPreview } from './state.ts';

const PREVIEW = 'data-preview';
const SHEET = doorOf(PREVIEW, 'preview-sheet');
const TYPE = doorOf(PREVIEW, 'preview-type');
const CLOSE = doorOf(PREVIEW, 'preview-close');
const IMPORT_NEW = doorOf(PREVIEW, 'import-new');
const IMPORT_APPEND = doorOf(PREVIEW, 'import-append');
const IMPORT_REPLACE = doorOf(PREVIEW, 'import-replace');
const IMPORT_UPDATE = doorOf(PREVIEW, 'import-update');
// the rows a preview shows: enough to check the columns, few enough to read at a glance
const SHOWN_ROWS = 5;

export function PreviewView({ preview, into }: { readonly preview: DataPreview; readonly into: Collection | undefined }): ReactNode {
  const t = useT();
  const sheet = previewSheet(preview);
  const words = { yes: t('data.yes'), no: t('data.no') };
  // a cell shows what the import will store, as the site writes it (DATA-1: "1.500" on a pt-BR site is 1500, and a
  // number keeps its column's decimal places); a value its type refuses shows as the file writes it
  const language = useEditorState((state) => state.document.language);
  const shown = (column: string, raw: string | number | boolean | undefined): string => {
    const type = preview.types[column] ?? 'text';
    const read = readCell(type, raw, language);
    if (read === null) return cellText(raw, words);
    return cellText(read, words, { language, decimals: type === 'number' ? decimalsOf(sheet?.rows.map((row) => row[column]) ?? [], language) : undefined });
  };
  const matched = into === undefined || sheet === undefined ? null : columnFields(sheet.columns, into.fields);
  return (
    <section className="data-preview" data-region="data-preview" aria-label={t('data.previewTitle')}>
      <div className="data-preview__head">
        <span className="data-preview__file">{preview.file}</span>
        <DoorControl entry={CLOSE} />
      </div>
      {preview.sheets.length > 1 ? (
        <div className="data-preview__sheets" role="group" aria-label={t('data.sheets')}>
          {preview.sheets.map((one) => (
            <DoorControl key={one.name} entry={SHEET} args={{ sheet: one.name }} label={one.name}>
              <span className="door__label">{one.name}</span>
            </DoorControl>
          ))}
        </div>
      ) : null}
      {sheet === undefined ? null : sheet.problem !== undefined ? (
        <p className="data-panel__problem" role="alert">
          {t(sheet.problem.key, sheet.problem.params)}
        </p>
      ) : (
        <>
          <p className="data-panel__note">{t('data.previewRows', { count: sheet.rows.length, columns: sheet.columns.length })}</p>
          <div className="data-grid">
            <table className="data-grid__table">
              <thead>
                <tr>
                  {sheet.columns.map((column) => (
                    <th key={column} scope="col">
                      <span className="data-column">{column}</span>
                      <DoorField entry={TYPE} args={{ column }} name="type" value={preview.types[column] ?? 'text'} options={FIELD_TYPES.map((type) => ({ value: type, label: t(`data.type.${type}` as MessageId) }))} label={t('data.columnType', { column })} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.slice(0, SHOWN_ROWS).map((row, i) => (
                  <tr key={i}>
                    {sheet.columns.map((column) => (
                      <td key={column}>{shown(column, row[column])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DoorForm entry={IMPORT_NEW} args={{}} className="data-preview__new">
            <input className="input" name="name" aria-label={t('data.newCollectionName')} placeholder={preview.file.replace(/\.[^.]+$/, '')} autoComplete="off" spellCheck={false} />
          </DoorForm>
          {into === undefined || matched === null ? null : (
            <div className="data-preview__into" role="group" aria-label={t('data.importIntoNamed', { collection: into.name })}>
              <p className="data-panel__note">{t('data.importIntoNamed', { collection: into.name })}</p>
              <p className="data-panel__note">
                {matched.size === 0
                  ? t('status.data.noColumnMatches', { collection: into.name })
                  : t('data.columnsMatched', { columns: [...matched].map(([column, field]) => (column === field.label ? column : t('data.columnMapped', { column, field: field.label }))).join(', ') })}
              </p>
              {sheet.columns.some((column) => !matched.has(column)) ? <p className="data-panel__note">{t('data.columnsIgnored', { columns: sheet.columns.filter((column) => !matched.has(column)).join(', ') })}</p> : null}
              <div className="data-panel__actions">
                <DoorControl entry={IMPORT_APPEND} args={{ collection: into.name }} />
                <DoorControl entry={IMPORT_REPLACE} args={{ collection: into.name }} />
                <DoorControl entry={IMPORT_UPDATE} args={{ collection: into.name }} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

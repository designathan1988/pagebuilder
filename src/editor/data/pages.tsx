// Pages from a page and shared regions (spec content-data; journey03 C2, C3): new pages from the open page and a list
// of names (one per line), or one page per item of the collection the panel shows; and the regions every page shows —
// share the selected header, footer or menu with the chosen pages (and the pages made later), detach a page's copy,
// stop sharing.
import type { ReactNode } from 'react';
import type { NodeId } from '../../generated/commands.ts';
import { templatePaths } from '../../core/data/bindings.ts';
import { collectionNamed, itemTitle } from '../../core/data/collections.ts';
import type { Collection } from '../../core/data/model.ts';
import { NEW_PAGES } from '../../core/data/regions.ts';
import { locate, walk, type DocumentJson, type Page } from '../../core/document/model.ts';
import { DoorControl } from '../doors/door.tsx';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { DoorField, DoorForm, doorOf } from './controls.tsx';

const PAGES = 'data-pages';
const SHARED = 'data-shared';
const FROM_NAMES = doorOf(PAGES, 'pages-from-names');
const FROM_COLLECTION = doorOf(PAGES, 'pages-from-collection');
const PREVIEW_ITEM = doorOf(PAGES, 'preview-item');
const SHARE = doorOf(SHARED, 'share');
const DETACH = doorOf(SHARED, 'shared-detach');
const STOP = doorOf(SHARED, 'shared-stop');

export function PagesView({ page, collection }: { readonly page: Page; readonly collection: Collection | undefined }): ReactNode {
  const t = useT();
  // the field that addresses the item pages: the collection's slug, else its first text field
  const nameField = collection?.fields.find((field) => field.type === 'slug') ?? collection?.fields.find((field) => field.type === 'text') ?? collection?.fields[0];
  const language = useEditorState((state) => state.document.language);
  const document = useEditorState((state) => state.document);
  const mark = page.tree.dataItem;
  const templated = mark?.template === true ? collectionNamed(document, mark.collection) : undefined;
  return (
    <section className="data-pages" data-region="data-pages" aria-label={t('data.pagesTitle')}>
      <p className="data-panel__note">{t('data.pagesFromHelp', { name: page.name })}</p>
      <DoorForm entry={FROM_NAMES} args={{}}>
        <textarea className="input" name="names" rows={3} aria-label={t('data.pageNames')} placeholder={t('data.pageNamesHint')} spellCheck={false} />
      </DoorForm>
      {templated === undefined ? null : (
        <div className="data-template" role="group" aria-label={t('data.templateTitle', { collection: templated.name })}>
          <p className="data-panel__note">{t('data.templateHelp', { name: page.name, collection: templated.name, example: [...(templatePaths(document).get(templated.name)?.values() ?? [])][0] ?? '' })}</p>
          {templated.items.length === 0 ? null : <DoorField entry={PREVIEW_ITEM} args={{}} name="item" value={mark?.item ?? ''} options={templated.items.map((item, i) => ({ value: item.id, label: `${i + 1}. ${itemTitle(templated, item, language)}` }))} label={t('data.previewItem')} />}
        </div>
      )}
      {collection === undefined || nameField === undefined || templated !== undefined ? null : (
        <div className="data-panel__actions">
          <DoorControl entry={FROM_COLLECTION} args={{ collection: collection.name, nameField: nameField.key }} label={t('data.templatePerItem', { name: page.name, collection: collection.name, field: nameField.label })}>
            <span className="door__label">{t('data.templatePerItem', { name: page.name, collection: collection.name, field: nameField.label })}</span>
          </DoorControl>
          <span className="data-panel__note">{t('data.itemPagesCount', { count: collection.items.length, examples: collection.items.slice(0, 2).map((item) => itemTitle(collection, item, language)).join(', ') })}</span>
        </div>
      )}
    </section>
  );
}

// The elements a page shows a shared region with: each instance of the region's component, with its page.
function regionPlaces(document: DocumentJson, component: string): { readonly page: Page; readonly node: NodeId }[] {
  return document.pages.flatMap((page) => [...walk(page.tree)].filter((node) => node.component === component).map((node) => ({ page, node: node.id as NodeId })));
}

export function SharedView({ document, selected }: { readonly document: DocumentJson; readonly selected: NodeId | null }): ReactNode {
  const t = useT();
  const found = selected === null ? null : locate(document, selected);
  // an element directly inside a page's root is what a page shares: a header, a footer, a menu
  const topLevel = found !== null && found.parent !== null && locate(document, found.parent.id as NodeId)?.parent === null;
  const own = found === null ? null : document.pages.find((page) => [...walk(page.tree)].some((node) => node.id === found.node.id));
  const regions = (document.components ?? []).filter((definition) => definition.shared !== undefined);
  return (
    <section className="data-shared" data-region="data-shared" aria-label={t('data.shared')}>
      {topLevel && found !== null ? (
        <DoorForm entry={SHARE} args={{}} label={t('data.shareNamed', { name: found.node.name })}>
          <fieldset className="data-shared__pages">
            <legend>{t('data.shareWith', { name: found.node.name })}</legend>
            {document.pages
              .filter((page) => page.id !== own?.id)
              .map((page) => (
                <label key={page.id} className="data-check">
                  <input type="checkbox" name="pages" value={page.file} defaultChecked />
                  {page.name}
                </label>
              ))}
            <label className="data-check">
              <input type="checkbox" name="pages" value={NEW_PAGES} defaultChecked />
              {t('data.newPages')}
            </label>
          </fieldset>
        </DoorForm>
      ) : (
        <p className="data-panel__note">{t('data.selectToShare')}</p>
      )}
      {regions.length === 0 ? null : (
        <ul className="data-shared__list" aria-label={t('data.sharedRegions')}>
          {regions.map((definition) => (
            <li key={definition.name} className="data-shared__region">
              <span className="data-shared__name">{definition.name}</span>
              <span className="data-panel__note">{t(definition.shared?.newPages === true ? 'data.sharedWithNew' : 'data.sharedWithChosen')}</span>
              <ul className="data-shared__places">
                {regionPlaces(document, definition.name).map(({ page, node }) => (
                  <li key={node} className="data-shared__place">
                    {page.name}
                    <DoorControl entry={DETACH} args={{ node }} label={t('data.detachOn', { name: definition.name, page: page.name })} />
                  </li>
                ))}
              </ul>
              <DoorControl entry={STOP} args={{ component: definition.name }} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

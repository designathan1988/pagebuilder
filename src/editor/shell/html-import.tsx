import { useEffect, useRef } from 'react';
import { importPageFiles } from '../../core/import/import.ts';
import type { MessageId } from '../../generated/ids.ts';
import { DoorControl, useDoor } from '../doors/door.tsx';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { doorSlots } from '../doors/placement.ts';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { ModalDialog } from './dialog.tsx';

const CHOICES = doorSlots('html-import');
// One destination: its button and what it does, or, while it cannot run (inside, with nothing selected), why — said
// under the button, where the hint stands, not only in its tooltip
function Choice({ entry, target }: { readonly entry: DoorEntry; readonly target: string | undefined }) {
  const t = useT();
  const args = target === undefined ? {} : { target };
  const door = useDoor(entry, args);
  const destination = String(entry.door.args.destination);
  return <div className="html-import__choice" data-import-default={destination === 'page' ? '' : undefined}>
    <DoorControl entry={entry} args={args} {...(destination === 'page' ? { className: 'door--primary' } : {})} />
    <p>{door.built && !door.available && door.reason !== null ? t(door.reason) : t(`import.hint.${destination}` as MessageId)}</p>
  </div>;
}

export function HtmlImportDialog() {
  const request = useEditorState(s => s.ui.dialog === 'html-import' ? s.ui.htmlImport : undefined);
  const target = useEditorState(s => s.selection.length === 1 ? s.selection[0] : undefined);
  const message = useEditorState(s => s.message);
  const t = useT();
  const choices = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (request) choices.current?.querySelector<HTMLButtonElement>('[data-import-default] button')?.focus();
  }, [request]);
  if (!request) return null;
  return <ModalDialog region="html-import" titleKey="import.title" className="html-import">
    <div className="dialog__body">
      <p>{t('import.destinationHelp')}</p>
      <ul>{importPageFiles(request.files).map(file => <li key={file.name}>{file.name}</li>)}</ul>
      <div ref={choices} className="html-import__choices">
        {CHOICES.map(entry => <Choice key={entry.ref} entry={entry} target={target} />)}
      </div>
      {message && ((message.key.startsWith('status.import.') && message.key !== 'status.import.done') || message.key.startsWith('status.locked.')) ? <p role="alert">{t(message.key, message.params)}</p> : null}
    </div>
  </ModalDialog>;
}

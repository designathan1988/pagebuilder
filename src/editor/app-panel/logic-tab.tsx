// The Logic tab of the inspector (spec app-logic): what the selected element does in the running site — its text or
// HTML from an expression, when it shows, what it repeats for each item of a list, the variable a field keeps, the code
// component it draws, its bindings (an attribute, a class, a style or a component's prop that follows an expression)
// and its events (code that runs on click, on a key, on mount, every frame or on a timer). Every control is a door the
// manifest places in the inspector-logic region; the code fields complete the project's names (scope.ts).
import { useId, type ReactNode } from 'react';
import { primaryNodeOf } from '../../core/events/interactions.ts';
import { logicOf, type NodeLogic } from '../../core/logic/model.ts';
import type { NodeId } from '../../generated/commands.ts';
import type { MessageId } from '../../generated/ids.ts';
import { elementIcon } from '../../manifest/runtime.ts';
import { DoorField, DoorForm, doorOf, type Option } from '../data/controls.tsx';
import { DoorControl, Icon } from '../doors/door.tsx';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import type { CodeScope } from './code-editor.tsx';
import { DoorCode } from './door-code.tsx';
import { LogicTextField } from './logic-field.tsx';
import { localsAt, projectScope } from './scope.ts';
import './panel.css';

const REGION = 'inspector-logic';
const FIELD = doorOf(REGION, 'logic-field');
const BINDING = doorOf(REGION, 'logic-binding');
const ADD_BINDING = doorOf(REGION, 'logic-add-binding');
const ADD_HANDLER = doorOf(REGION, 'logic-add-handler');
const HANDLER_EVENT = doorOf(REGION, 'logic-handler-event');
const HANDLER_CODE = doorOf(REGION, 'logic-handler-code');
const HANDLER_REMOVE = doorOf(REGION, 'logic-handler-remove');
const CLEAR = doorOf(REGION, 'logic-clear');

type ExpressionField = 'text' | 'html' | 'show' | 'each' | 'key' | 'model';

function Group({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactNode {
  return (
    <div className="logic-group">
      <div className="section-title">
        <span className="section-title__text">{title}</span>
      </div>
      <div className="logic-group__body">{children}</div>
    </div>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return (
    <div className="logic-row">
      <span className="logic-row__label">{label}</span>
      <div className="logic-row__value">{children}</div>
    </div>
  );
}

export function LogicTab(): ReactNode {
  const t = useT();
  const example = useId();
  const document = useEditorState((state) => state.document);
  const selection = useEditorState((state) => state.selection);
  const node = selection.length === 1 ? primaryNodeOf(document, selection) : null;
  if (node === null) {
    return (
      <div className="inspector-tab inspector-tab--logic" data-region={REGION}>
        <p className="logic-tab__note">{t('logic.nothingSelected')}</p>
      </div>
    );
  }
  const logic: NodeLogic = logicOf(node);
  const project = projectScope(document);
  const inside: CodeScope = { ...project, locals: localsAt(document, node.id as NodeId, true) };
  const outside: CodeScope = { ...project, locals: localsAt(document, node.id as NodeId, false) };
  const expression = (field: ExpressionField, scope: CodeScope, hint?: MessageId) => (
    <DoorCode entry={FIELD} args={{ field }} name="value" value={logic[field] ?? ''} kind="expression" scope={scope} target={node.id} label={t(`logic.field.${field}` as MessageId)} {...(hint === undefined ? {} : { placeholder: t(hint) })} />
  );
  const components: Option[] = [{ value: '', label: '—' }, ...(document.app?.components ?? []).map((one) => ({ value: one.name, label: one.name }))];
  const binds = Object.entries(logic.binds ?? {});
  const handlers = logic.on ?? [];
  return (
    <div className="inspector-tab inspector-tab--logic" data-region={REGION}>
      <div className="interactions__head">
        <span className="interactions__element">
          <Icon name={elementIcon(node.type) ?? 'box'} size="sm" />
          <span className="interactions__name">{node.name}</span>
          {node.tag === null ? null : <span className="interactions__tag">{node.tag}</span>}
        </span>
        <DoorControl entry={CLEAR} />
      </div>
      {/* the fields of one element are its own: another element's are drawn anew, so no field carries a typing, a text
          or an undo history of the element shown before (the logic audit's LOGIC-3 and LOGIC-4) */}
      <div key={node.id} className="inspector-scroll">
        <p className="logic-tab__note">{t('logic.help')}</p>
        <Group title={t('logic.section.content')}>
          <Row label={t('logic.field.text')}>{expression('text', inside, 'logic.hint.text')}</Row>
          <Row label={t('logic.field.html')}>{expression('html', inside)}</Row>
          <Row label={t('logic.field.show')}>{expression('show', inside, 'logic.hint.show')}</Row>
          <Row label={t('logic.field.model')}>{expression('model', inside, 'logic.hint.model')}</Row>
          <Row label={t('logic.field.component')}>
            <DoorField entry={FIELD} args={{ field: 'component' }} name="value" value={logic.component ?? ''} options={components} label={t('logic.field.component')} />
          </Row>
        </Group>
        <Group title={t('logic.section.repeat')}>
          <Row label={t('logic.field.each')}>{expression('each', outside, 'logic.hint.each')}</Row>
          <Row label={t('logic.field.as')}>
            <LogicTextField entry={FIELD} args={{ field: 'as' }} name="value" value={logic.as ?? ''} target={node.id} label={t('logic.field.as')} />
          </Row>
          <Row label={t('logic.field.key')}>{expression('key', inside)}</Row>
        </Group>
        <Group title={t('logic.section.bindings')}>
          {binds.map(([binding, code]) => (
            <div key={binding} className="logic-binding">
              <LogicTextField entry={BINDING} args={{ previous: binding, value: code }} name="binding" value={binding} target={node.id} className="logic-binding__name" />
              <DoorCode entry={BINDING} args={{ binding }} name="value" value={code} kind="expression" scope={inside} target={node.id} label={`${t('logic.binding.value')} · ${binding}`} />
            </div>
          ))}
          {/* the add row starts empty again once its binding is in (its key is the element's bindings, so a binding added
              draws it anew; a refusal or a binding already there as typed keeps what was typed to correct): pressed
              again it no longer adds the same binding and leaves the last message standing as if it had (the real-use
              audit's V-7) */}
          <DoorForm key={JSON.stringify(binds)} entry={ADD_BINDING} args={{}} className="logic-binding__add">
            {/* the example of a binding's name stands in a line of its own under the field, wrapping in any width: as the
                field's placeholder it was cut mid-word (the real-use audit, USE-12) */}
            <input className="input" name="binding" aria-label={t('command.logic.addBinding')} aria-describedby={example} autoComplete="off" spellCheck={false} />
            <small id={example} className="logic-binding__example">{t('logic.binding.new')}</small>
            <input className="input input--code" name="value" aria-label={t('logic.binding.value')} placeholder={t('logic.binding.value')} autoComplete="off" spellCheck={false} />
          </DoorForm>
        </Group>
        <Group title={t('logic.section.events')}>
          {handlers.length === 0 ? <p className="logic-tab__note">{t('logic.events.none')}</p> : null}
          {handlers.map((handler, index) => (
            // a handler is named by its place (logic.updateHandler)
            <div key={index} className="logic-handler">
              <div className="logic-handler__row">
                <LogicTextField entry={HANDLER_EVENT} args={{ handler: index }} name="event" value={handler.event} target={node.id} className="logic-handler__event" />
                <DoorControl entry={HANDLER_REMOVE} args={{ handler: index }} label={`${t('command.logic.removeHandler')} ${handler.event}`} />
              </div>
              <DoorCode entry={HANDLER_CODE} args={{ handler: index }} name="code" value={handler.code} kind="statements" scope={{ ...inside, event: true }} target={node.id} label={`${t('logic.handler.code')} · ${handler.event}`} />
            </div>
          ))}
          <DoorControl entry={ADD_HANDLER} />
          <p className="logic-tab__note">{t('logic.events.help')}</p>
        </Group>
      </div>
    </div>
  );
}

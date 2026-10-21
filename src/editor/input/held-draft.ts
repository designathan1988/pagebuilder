// A value field that keeps what is typed in its own state (a panel's field, the typed field of a spacing band, a value
// of the Guides & Grids dialog) holds it in the one registry of typing (input/pending.ts; CLAUDE.md, rule G2), as the
// inspector's fields do: a press elsewhere, a command from outside the field, a selection changed keep it first, and
// so does the focus leaving the field or the field going. The keep runs the field's own command with the text, in the
// context the typing began in (rule G1); Enter runs the same command through the field and lets the registry go.
// The field's own commands are its keep's and, for a field with keys of its own (a side of the box model: its arrows,
// its Escape), theirs: they run in the context of the typing instead of keeping it first.
// The field, its region and its keep are given as refs, read only when the person acts, never while drawing.
// auditoria/defeitos.md, DEF-0514.
import type { RefObject } from 'react';
import type { EditContext } from '../../core/store/store.ts';
import type { CommandId } from '../../generated/ids.ts';
import { editContextOf, type EditorStore } from '../store.ts';
import { readDecimal } from '../../core/style/decimal.ts';
import { heldTyping, holdTyping, keepTyping, releaseTyping } from './pending.ts';

export interface HeldDraft {
  // the person typed: the field holds its typing, with the context of its first key
  readonly typed: () => void;
  // the field is left (the focus went elsewhere) or goes: the typing it holds is kept
  readonly left: () => void;
  // the field kept its typing itself (Enter): the registry lets it go
  readonly done: () => void;
}

export function heldDraft(
  store: EditorStore,
  field: RefObject<HTMLElement | null>,
  region: RefObject<HTMLElement | null>,
  command: CommandId | readonly CommandId[],
  keep: RefObject<(context: EditContext) => void>,
): HeldDraft {
  const own: readonly CommandId[] = typeof command === 'string' ? [command] : command;
  // The element the typing was held for, kept from its first key: when the field goes, React has already let go of the
  // field's ref by the time the effect's cleanup runs (refs are detached in the commit, before the cleanups of the
  // passive effects), so the field's own element is the only way the leave still finds its typing (DEF-0526).
  let typedIn: HTMLElement | null = null;
  const holding = (): HTMLElement | null => (typedIn !== null && heldTyping()?.field === typedIn ? typedIn : null);
  return {
    typed: () => {
      const element = field.current;
      if (element === null || holding() === element) return;
      typedIn = element;
      const context = editContextOf(store.getState());
      holdTyping({ field: element, region: region.current ?? element, context, owns: (id) => own.includes(id), keep: () => keep.current(context) });
    },
    left: () => {
      if (holding() !== null) keepTyping();
    },
    done: () => {
      const element = holding();
      if (element !== null) releaseTyping(element);
    },
  };
}

// The text of a field whose command takes a number, as that number: converted, never judged. An empty text or one that
// is no number becomes NaN, which the command refuses with its own words (rule G3; DEF-0515). A decimal comma is a
// decimal point ("12,5", ",5": the pt-BR keyboard that inputMode="decimal" opens offers only the comma; the input
// audit's INPUT-9), read by the one decimal reader the style values read through (core/style/decimal.ts).
export const typedNumber = (text: string): number => readDecimal(text);

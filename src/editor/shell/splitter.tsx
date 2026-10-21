// A splitter (spec panel-resize): the divider of the splitter named, drawn as its manifest data says — its axis, its
// bounds and the size the person gave it (workspace.resizeSplitter) — a separator the keyboard reaches (the splitter
// key context: its four arrows) and the pointer drags (the pointer owner, through the panel drag door whose source is a
// splitter). Between the sidebar's view and its stack, and at the inner edges of the sidebar and the inspector, whose
// widths the person sets (the plan's stage 5, 1280 × 720).
import type { MessageId } from '../../generated/ids.ts';
import { manifest } from '../../manifest/runtime.ts';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { SPLITTERS, splitterSize, type SplitterId } from '../workspace/layout.ts';

// the divider's drag door: the panel-drag door whose source is a splitter
const SPLITTER_DRAG = manifest.doors.find((d) => d.door.kind === 'panel-drag' && d.door.source === 'splitter');

// `drawn`: the height its panel is drawn at, where the window holds less than its size (sidebar.tsx): the value the
// separator says is the one the person sees
export function Splitter({ splitter, className, drawn = null }: { readonly splitter: string; readonly className?: string; readonly drawn?: number | null }) {
  const t = useT();
  const chosen = useEditorState((s) => splitterSize(s.ui, splitter));
  const size = chosen === null || drawn === null ? chosen : Math.min(chosen, drawn);
  const data = SPLITTERS[splitter as SplitterId] as (typeof SPLITTERS)[SplitterId] | undefined;
  if (data === undefined || size === null || SPLITTER_DRAG === undefined) return null;
  return (
    <div
      role="separator"
      aria-orientation={data.axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={t(data.labelKey as MessageId)}
      aria-valuenow={size}
      aria-valuemin={data.min}
      aria-valuemax={data.max}
      tabIndex={0}
      data-key-context="splitter"
      data-door={SPLITTER_DRAG.ref}
      data-args={JSON.stringify({ splitter })}
      className={['splitter', `splitter--${data.axis}`, className ?? ''].filter((c) => c !== '').join(' ')}
    />
  );
}

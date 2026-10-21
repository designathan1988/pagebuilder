// The activity bar and the sidebar : Explorer (Pages, Files, Layers), Insert (the element
// grid of elements.json's palette) and Styles (classes and variables). Rows and tiles are the doors of their regions,
// one per page, node or palette entry; a section's actions are the region's controls before its first item.
// Each view is a file of its own under sidebar/ (plan I.12): explorer.tsx, layers.tsx, insert.tsx, styles.tsx, and the
// doors they share in doors.tsx; this file draws the activity bar, the sidebar and the views' table.
import { AssistantPanel } from '../assistant/panel.tsx';
import { DataPanel } from '../data/panel.tsx';
import { AppPanel } from '../app-panel/panel.tsx';
import { onFirstUse, wiring } from '../wiring.ts';
import type { MessageId } from '../../generated/ids.ts';
import { DoorControl } from '../doors/door.tsx';
import { useEditorState } from '../store.ts';
import { atPlace, isPanelOpen } from '../workspace/panels.ts';
import { panelName, stackedSections, type Panel } from '../workspace/panel-catalogue.ts';
import { Splitter } from './splitter.tsx';
import { combinationAt, splitterSize } from '../workspace/layout.ts';
import { PanelArea } from '../workspace/windows.tsx';
import { useT } from '../text.ts';
import type { BodyTable } from './bodies.ts';
import { Slots } from './slots.tsx';
import { Explorer } from './sidebar/explorer.tsx';
import { Insert } from './sidebar/insert.tsx';
import { Styles } from './sidebar/styles.tsx';
import { LayersSection } from './sidebar/layers.tsx';

export function ActivityBar() {
  const t = useT();
  const ui = useEditorState((s) => s.ui);
  return (
    <nav className="activity-bar" data-region="activity-bar" data-key-context="toolbar">
      <Slots region="activity-bar" render={(slot) => {
        if (slot.kind !== 'door' || typeof slot.entry.door.args.panel !== 'string') return undefined;
        const active = isPanelOpen(ui, slot.entry.door.args.panel as Panel);
        return <DoorControl key={slot.entry.ref} entry={slot.entry} title={active ? t('activity.openPanelHint', { panel: t(slot.entry.door.labelKey as MessageId) }) : undefined} />;
      }} />
    </nav>
  );
}

// The body of each sidebar view the editor draws; a view without one says "not available yet" and the doors that
// only open it are not available yet (bodies.ts).
// (the views of the installed modules join them: app/modules-view.ts)
export const SIDEBAR_VIEWS = onFirstUse((): BodyTable => ({ app: AppPanel, assistant: AssistantPanel, data: DataPanel, explorer: Explorer, elements: Insert, variables: Styles, ...wiring().sidebarViews }));

// The body of each section that belongs to no view, drawn in the sidebar's stack below the view (bodies.ts)
export const SIDEBAR_SECTIONS: BodyTable = { layers: LayersSection };

function EmptyView({ panel }: { readonly panel: Panel }) {
  const t = useT();
  return (
    <section className="view" aria-label={t(panelName(panel))}>
      <div className="view__title">{t(panelName(panel))}</div>
      <p className="view__empty">{t('common.notAvailableYet')}</p>
    </section>
  );
}

export function Sidebar() {
  const view = useEditorState((s) => s.ui.panels.sidebarView);
  const View = SIDEBAR_VIEWS()[view];
  // every stacked section, in the manifest's order, and which of them show (each one's header stays drawn while it is
  // folded, so the header that opens it is there to press); both as one text (the hook's values stay stable)
  // the sections that are still the sidebar's: one that left its place (a window, the right dock, a combined area) is
  // drawn there and never twice (spec floating-panels)
  const here = useEditorState((s) => stackedSections().filter((panel) => atPlace(s.ui, panel)).join(','));
  const shown = useEditorState((s) => stackedSections().filter((panel) => isPanelOpen(s.ui, panel) && atPlace(s.ui, panel)).join(','));
  const size = useEditorState((s) => splitterSize(s.ui, 'sidebar-stack'));
  const open = new Set(shown === '' ? [] : shown.split(','));
  // panels combined with the view's area (spec panel-combine-tabs): one more tab of it, or one stacked under it; the
  // area then draws itself (PanelArea), so the tab strip and the stacked bodies have one owner
  const combined = useEditorState((s) => combinationAt(s.ui, view).tabs.length > 1 || combinationAt(s.ui, view).stack.length > 0);
  // The sidebar takes its column in every window, a narrow one too (workspace/narrow.ts): it lies over nothing, so the
  // canvas beside it shows whole and a press there leaves it open (CLAUDE.md, rule G4)
  return (
    <aside className="sidebar">
      {combined ? (
        <PanelArea panel={view} />
      ) : (
        <div className="sidebar__view" data-panel-area={view}>
          {View ? <View /> : <EmptyView panel={view} />}
        </div>
      )}
      {open.size > 0 ? <Splitter splitter="sidebar-stack" /> : null}
      {(here === '' ? [] : here.split(',')).map((name) => {
        const panel = name as Panel;
        return (
          <div key={panel} className="sidebar__stack" style={open.has(name) ? { height: size ?? undefined } : undefined}>
            {/* the section draws itself and everything combined with it (spec panel-combine-tabs) */}
            <PanelArea panel={panel} />
          </div>
        );
      })}
      {/* the sidebar's width, which the person sets (spec panel-resize) */}
      <Splitter splitter="sidebar-width" className="splitter--column-end" />
    </aside>
  );
}

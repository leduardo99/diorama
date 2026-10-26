import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Layout, LayoutChangedMeta, PanelImperativeHandle, PanelSize } from 'react-resizable-panels';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

/** A side column's width bounds, in any unit the panels library reads (`20rem`, `320px`, `40%`). */
export interface SideSize {
  initial: string;
  min: string;
  max: string;
}

interface Props {
  /** Names the remembered width (`diorama:panel.<id>` in the browser's storage). */
  id: string;
  /** Which side the column is on. */
  side: 'start' | 'end';
  size: SideSize;
  /** The side column. It fills the panel: it scrolls its own content. */
  panel: ReactNode;
  /** The main area, beside it. */
  children: ReactNode;
  /** The smallest the main area may get, so a wide column never crushes it. */
  mainMin?: string;
  /**
   * A column that can be hidden (the painter's piece panel): it stays mounted, at no width, so what it holds (a search,
   * its thumbnails) is there when it comes back. Dragging it shut, or Enter on its handle, closes it too.
   */
  open?: boolean;
  onOpen?: (open: boolean) => void;
  className?: string;
}

const storageKey = (id: string) => `diorama:panel.${id}`;

/** The width last given to a column, if any. Storage can be blocked, so every access is guarded. */
function storedWidth(id: string): number | undefined {
  try {
    const width = Number(localStorage.getItem(storageKey(id)));
    return Number.isFinite(width) && width > 0 ? width : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A page's main area beside a side column the user can widen or narrow by dragging the line between them (or with the
 * arrow keys once it has the focus). The column keeps its width in pixels when the window changes, the main area takes
 * the rest, and the width is remembered per column. What the main area draws in follows by its own `ResizeObserver`.
 */
export function SidePanelLayout({ id, side, size, panel, children, mainMin = '40%', open = true, onOpen, className }: Props) {
  const { t } = useT();
  const [initial] = useState(() => storedWidth(id));
  const panelRef = useRef<PanelImperativeHandle>(null);

  // A column hidden by its toggle is collapsed before the first paint, and follows the toggle from then on.
  useLayoutEffect(() => {
    const handle = panelRef.current;
    if (!handle || handle.isCollapsed() === !open) return;
    // Back at the width it was given last (`expand` alone would bring a column hidden since the page opened at its least).
    if (open) handle.resize(storedWidth(id) ?? size.initial);
    else handle.collapse();
  }, [open]);

  const onResize = (next: PanelSize, _id: string | number | undefined, previous: PanelSize | undefined) => {
    // Shut by a drag or by Enter on the handle: the page's own toggle follows. Not on mount, where the toggle leads.
    const shown = next.inPixels > 0;
    if (onOpen && previous && shown !== open) onOpen(shown);
  };
  // Once a drag or a key has settled the layout (not a window resize, which may squeeze the column for a while, nor the
  // mount), in percents of the room the two panels share, which their widths add up to whatever the split; a shut
  // column keeps the width it had open.
  const sideEl = useRef<HTMLDivElement>(null);
  const mainEl = useRef<HTMLDivElement>(null);
  const save = (layout: Layout, { isUserInteraction }: LayoutChangedMeta) => {
    if (!isUserInteraction) return;
    const room = (sideEl.current?.offsetWidth ?? 0) + (mainEl.current?.offsetWidth ?? 0);
    const width = Math.round(((layout[`${id}-side`] ?? 0) / 100) * room);
    if (width === 0) return;
    try {
      localStorage.setItem(storageKey(id), String(width));
    } catch {
      // Not remembered; the width still holds for this visit.
    }
  };

  const main = (
    <ResizablePanel id={`${id}-main`} elementRef={mainEl} minSize={mainMin} className="flex min-w-0 flex-col" style={{ overflow: 'hidden' }}>
      {children}
    </ResizablePanel>
  );
  const column = (
    <ResizablePanel
      id={`${id}-side`}
      elementRef={sideEl}
      panelRef={panelRef}
      defaultSize={initial ? `${initial}px` : size.initial}
      minSize={size.min}
      maxSize={size.max}
      collapsible={onOpen !== undefined}
      collapsedSize={0}
      groupResizeBehavior="preserve-pixel-size"
      onResize={onResize}
      className="flex flex-col"
      style={{ overflow: 'hidden' }}
    >
      {/* Out of the focus order while hidden, as it was when it was not drawn. */}
      <div className="flex min-h-0 flex-1 flex-col" inert={!open}>{panel}</div>
    </ResizablePanel>
  );
  const handle = <ResizableHandle withHandle aria-label={t('common.resizePanel')} className={cn(!open && 'hidden')} />;

  return (
    <ResizablePanelGroup orientation="horizontal" onLayoutChanged={save} className={cn('min-h-0 flex-1', className)}>
      {side === 'start' ? <>{column}{handle}{main}</> : <>{main}{handle}{column}</>}
    </ResizablePanelGroup>
  );
}

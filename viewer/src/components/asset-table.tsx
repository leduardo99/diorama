import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { assetDomId } from '@/lib/use-asset-selection';
import type { AssetTableInstance } from '@/lib/use-asset-table';
import type { AssetFileMeta } from '@/lib/types';
import { AssetContextMenu } from './asset-menu';

/** Column widths; the name column takes what is left. */
const widths: Record<string, string> = {
  thumb: 'w-16',
  folder: 'w-[18%]',
  role: 'w-36',
  engine: 'w-24',
  dimensions: 'w-28',
  frames: 'w-20',
  fileSize: 'w-24',
  modified: 'w-28',
  actions: 'w-12',
};

/** A row is a 48px thumbnail plus padding; measured once shown, so this only has to be close. */
const ROW_ESTIMATE = 53;

interface Props {
  table: AssetTableInstance;
  activeKey: string | null;
  /** The element that scrolls; the table only renders the rows inside it. */
  scrollRef: RefObject<HTMLElement | null>;
  onOpen: (asset: AssetFileMeta) => void;
}

export function AssetTable({ table, activeKey, scrollRef, onOpen }: Props) {
  const { t } = useT();
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;

  // The header sticks to the top of the scroller, so it is also the space above the first row.
  const headRef = useRef<HTMLTableSectionElement>(null);
  const [headHeight, setHeadHeight] = useState(0);
  useLayoutEffect(() => setHeadHeight(headRef.current?.offsetHeight ?? 0), []);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    getItemKey: (index) => rows[index].id,
    scrollMargin: headHeight,
    scrollPaddingStart: headHeight,
    overscan: 12,
  });

  // Only when the active row changes: sorting or filtering must not drag the scroll back to it.
  useEffect(() => {
    if (!activeKey) return;
    const index = rows.findIndex((row) => row.id === activeKey);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [activeKey]);

  const items = virtualizer.getVirtualItems();
  const spaceAbove = items.length ? items[0].start - headHeight : 0;
  const spaceBelow = items.length ? virtualizer.getTotalSize() - (items[items.length - 1].end - headHeight) : 0;

  return (
    // The shadcn Table wraps <table> in its own overflow box, which would stop the header from sticking to the scroller.
    <div className="px-4 pb-4 [&_[data-slot=table-container]]:overflow-visible">
      <Table className="min-w-6xl table-fixed" aria-label={t('assets.listLabel')} aria-rowcount={rows.length + 1}>
        <TableHeader ref={headRef} className="sticky top-0 z-10 bg-background shadow-[0_1px_0_var(--border)] [&_tr]:border-0">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    className={widths[header.column.id]}
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                  >
                    {header.isPlaceholder || !header.column.getCanSort() ? (
                      <table.FlexRender header={header} />
                    ) : (
                      <Button variant="ghost" size="xs" className="-ml-2" onClick={header.column.getToggleSortingHandler()}>
                        <table.FlexRender header={header} />
                        {sorted === 'asc' && <ArrowUpIcon data-icon="inline-end" />}
                        {sorted === 'desc' && <ArrowDownIcon data-icon="inline-end" />}
                      </Button>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          <Spacer height={spaceAbove} columns={columnCount} />
          {items.map((item) => {
            const row = rows[item.index];
            return (
              <AssetContextMenu key={row.id} asset={row.original} onDetails={onOpen}>
                <TableRow
                  id={assetDomId(row.original.subpath)}
                  ref={virtualizer.measureElement}
                  tabIndex={-1}
                  data-index={item.index}
                  aria-rowindex={item.index + 2}
                  data-tour={item.index === 0 ? 'asset' : undefined}
                  data-state={row.id === activeKey ? 'selected' : undefined}
                  className={cn('cursor-pointer outline-none tabular-nums', row.id === activeKey && 'bg-accent')}
                  onClick={() => onOpen(row.original)}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={cn('truncate', cell.column.id === 'actions' && 'text-right')}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              </AssetContextMenu>
            );
          })}
          <Spacer height={spaceBelow} columns={columnCount} />
        </TableBody>
      </Table>
    </div>
  );
}

/** Stands in for the rows that are not mounted, so the scrollbar and the rows on screen keep their place. */
function Spacer({ height, columns }: { height: number; columns: number }) {
  if (height <= 0) return null;
  return (
    <TableRow aria-hidden className="border-0 hover:bg-transparent">
      <TableCell colSpan={columns} className="p-0" style={{ height }} />
    </TableRow>
  );
}

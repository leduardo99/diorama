import { useEffect, useState, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ColorSwatch } from '@/components/ui/color-swatch';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import { dirname } from '@/lib/format';
import { assetTitle, roleDetail, roleOf } from '@/lib/asset-role';
import { isStale } from '@/lib/export-state';
import { GRID_GAP, GRID_PADDING } from '@/lib/use-grid-columns';
import { entryKey, type AssetEntry, type AssetGroup } from '@/lib/groups';
import { assetDomId } from '@/lib/use-asset-selection';
import type { AssetFileMeta } from '@/lib/types';
import { AssetContextMenu, AssetMenuButton, GroupContextMenu, GroupMenuButton } from './asset-menu';
import { AssetThumb, GroupThumb } from './asset-thumb';
import { EngineBadge } from './engine-badge';
import { FrameSummary } from './frame-counts';
import { StaleBadge } from './stale-badge';

/** An item icon's rarity tier, in the color the project gave it, and how many fit in a slot. */
function ItemBadges({ asset }: { asset: AssetFileMeta }) {
  const { t } = useT();
  const info = asset.atlasInfo;
  if (!info) return null;
  return (
    <>
      {info.rarity && (
        <Badge variant="outline" className="gap-1.5">
          <ColorSwatch size="xs" color={info.rarity.color} aria-hidden />
          {info.rarity.label}
        </Badge>
      )}
      {info.kind && <Badge variant="secondary">{info.kind}</Badge>}
      {info.stack !== null && info.stack > 1 && <span title={t('assets.card.itemsPerSlot')}>×{info.stack}</span>}
    </>
  );
}

interface CardProps {
  active: boolean;
  /** Its place in the whole list: the rows that are not on screen are not in the DOM, so a screen reader cannot count them. */
  position: { index: number; total: number };
  onOpen: (asset: AssetFileMeta) => void;
}

function AssetCard({ asset, active, position, onOpen }: CardProps & { asset: AssetFileMeta }) {
  const [hovered, setHovered] = useState(false);
  const { t, bytes } = useT();
  const role = roleOf(asset);
  const detail = roleDetail(asset, t);
  return (
    <AssetContextMenu asset={asset} onDetails={onOpen}>
      <EntryCard
        id={assetDomId(asset.subpath)}
        active={active}
        position={position}
        onOpen={() => onOpen(asset)}
        onHover={setHovered}
        thumb={<AssetThumb asset={asset} hovering={hovered} />}
        flag={isStale(asset) ? <StaleBadge /> : null}
        title={assetTitle(asset)}
        description={dirname(asset.subpath) || '—'}
        menu={<AssetMenuButton asset={asset} onDetails={onOpen} />}
      >
        {role === 'gear' && <Badge variant="secondary">{detail ?? t('assets.card.gear')}</Badge>}
        {(role === 'vfx' || role === 'ui') && detail && <Badge variant="secondary">{detail}</Badge>}
        {role === 'icon' && <ItemBadges asset={asset} />}
        {asset.engine && <EngineBadge engine={asset.engine} />}
        <FrameSummary info={asset.atlasInfo} />
        {asset.width && <span>{asset.width}×{asset.height}</span>}
        <span className="ml-auto">{bytes(asset.size)}</span>
      </EntryCard>
    </AssetContextMenu>
  );
}

function GroupCard({ group, active, position, onOpen }: CardProps & { group: AssetGroup }) {
  const [hovered, setHovered] = useState(false);
  const { plural, bytes } = useT();
  const [first] = group.assets;
  const staleClips = group.assets.filter(isStale).length;
  return (
    <GroupContextMenu group={group} onOpen={onOpen}>
      <EntryCard
        id={assetDomId(`group:${group.id}`)}
        active={active}
        position={position}
        onOpen={() => onOpen(first)}
        onHover={setHovered}
        thumb={<GroupThumb clips={group.assets} hovering={hovered} />}
        flag={staleClips > 0 ? <StaleBadge count={staleClips} /> : null}
        title={group.name}
        // A character is named by its label, with its folder (its id among the exports) under it.
        description={group.character ? group.folder : dirname(group.folder) || '—'}
        menu={<GroupMenuButton group={group} onOpen={onOpen} />}
      >
        {first.engine && <EngineBadge engine={first.engine} />}
        <Badge variant="secondary">{plural('assets.card.animations', group.assets.length)}</Badge>
        <span className="ml-auto">{bytes(group.assets.reduce((sum, a) => sum + a.size, 0))}</span>
      </EntryCard>
    </GroupContextMenu>
  );
}

/** Extra props (ref, handlers) come from the context menu trigger wrapping the card. */
interface EntryCardProps extends Omit<React.ComponentProps<typeof Card>, 'title' | 'onClick'> {
  id: string;
  active: boolean;
  position: CardProps['position'];
  onOpen: () => void;
  onHover: (hovering: boolean) => void;
  thumb: React.ReactNode;
  /** Pinned to the corner of the thumbnail, e.g. the export state. */
  flag: React.ReactNode;
  title: string;
  description: string;
  menu: React.ReactNode;
}

function EntryCard({ id, active, position, onOpen, onHover, thumb, flag, title, description, menu, children, ...rest }: EntryCardProps) {
  return (
    <Card
      {...rest}
      id={id}
      size="sm"
      role="option"
      aria-selected={active}
      aria-posinset={position.index + 1}
      aria-setsize={position.total}
      onClick={onOpen}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn('cursor-pointer gap-0 pt-0 pb-0 transition-colors hover:bg-accent/40', active && 'ring-2 ring-primary')}
    >
      <div className="relative">
        {thumb}
        {flag && <div className="absolute top-1.5 left-1.5">{flag}</div>}
      </div>
      <CardHeader className="pt-2">
        {/* Long names and paths are cut to the card: the browser's own tooltip gives them whole (a Radix one per card would weigh on the grid). */}
        <CardTitle className="truncate" title={title}>{title}</CardTitle>
        <CardDescription className="truncate" title={description}>{description}</CardDescription>
        <CardAction>{menu}</CardAction>
      </CardHeader>
      {/*
        One line at every card size: what does not fit wraps onto a second line that the fixed height hides, so the facts
        go in order of weight (the type, the engine, the frames, the size in pixels, the file size, all of them in the
        Details window too) and a narrow card drops the last ones whole, never half a badge.
      */}
      <CardFooter className="py-2">
        <div className="flex h-5 min-w-0 flex-1 flex-wrap items-center gap-x-2 overflow-hidden whitespace-nowrap text-muted-foreground tabular-nums *:shrink-0">{children}</div>
      </CardFooter>
    </Card>
  );
}

/** A thumbnail is 4:3; the header and footer add about this much. Only a first guess: rows are measured once shown. */
const CARD_CHROME = 88;

interface Props {
  entries: AssetEntry[];
  activeKey: string | null;
  /** The width a card really has, from `useGridColumns`. */
  cardWidth: number;
  /** Cards per row, from `useGridColumns`. */
  columns: number;
  /** The element that scrolls; the grid only renders the rows inside it. */
  scrollRef: RefObject<HTMLElement | null>;
  onOpen: (asset: AssetFileMeta) => void;
}

export function AssetGrid({ entries, activeKey, cardWidth, columns, scrollRef, onOpen }: Props) {
  const { t } = useT();
  const virtualizer = useVirtualizer({
    count: Math.ceil(entries.length / columns),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => Math.round((cardWidth * 3) / 4) + CARD_CHROME,
    getItemKey: (row) => entryKey(entries[row * columns]),
    gap: GRID_GAP,
    paddingStart: GRID_PADDING,
    paddingEnd: GRID_PADDING,
    overscan: 2,
  });

  // A new card size or column count changes every row's height, including the rows that are not mounted.
  useEffect(() => virtualizer.measure(), [virtualizer, cardWidth, columns]);

  // Only when the active entry changes: filtering or resizing must not drag the scroll back to it.
  useEffect(() => {
    if (!activeKey) return;
    const index = entries.findIndex((entry) => entryKey(entry) === activeKey);
    if (index >= 0) virtualizer.scrollToIndex(Math.floor(index / columns), { align: 'auto' });
  }, [activeKey]);

  const rows = virtualizer.getVirtualItems();
  return (
    <div role="listbox" aria-label={t('assets.listLabel')} className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {/* The mounted rows move together as one block, so measuring a row never shifts the others. */}
      <div className="absolute inset-x-0 top-0 flex flex-col gap-3 px-4" style={{ transform: `translateY(${rows[0]?.start ?? 0}px)` }}>
        {rows.map((row) => (
          <div
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            role="presentation"
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {entries.slice(row.index * columns, (row.index + 1) * columns).map((entry, i) => {
              const key = entryKey(entry);
              const position = { index: row.index * columns + i, total: entries.length };
              return entry.type === 'group' ? (
                <GroupCard key={key} group={entry.group} active={activeKey === key} position={position} onOpen={onOpen} />
              ) : (
                <AssetCard key={key} asset={entry.asset} active={activeKey === key} position={position} onOpen={onOpen} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

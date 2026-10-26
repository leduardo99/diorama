import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDownIcon, ChevronRightIcon, GamepadIcon, SearchIcon, SearchXIcon, XIcon } from 'lucide-react';
import { AssetThumb } from '@/components/asset-thumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { buildRows, entrySubtitle, ROOT, type Entry, type KindFilter } from '@/lib/playground/catalog';
import { SEARCH_KEYS } from '@/lib/playground/keys';
import type { Armed } from '@/lib/playground/library';

const HEADER_HEIGHT = 28;
const ENTRY_HEIGHT = 48;

interface Props {
  entries: Entry[];
  /** Entry keys, newest first. */
  recent: string[];
  armedKey: string | null;
  playerId: string | null;
  onArm: (armed: Armed | null) => void;
  onControl: (characterId: string) => void;
}

/**
 * Everything that can be put on the scene. Built for hundreds of assets: it is searchable (↑ ↓ ↵ from the
 * search box), filterable, grouped in folders that collapse, remembers recents and only renders visible rows.
 */
export function PlacementList({ entries, recent, armedKey, playerId, onArm, onControl }: Props) {
  const i18n = useT();
  const { t } = i18n;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<KindFilter>('all');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => buildRows(entries, { query, filter, collapsed, recent }), [entries, query, filter, collapsed, recent]);
  const entryRows = useMemo(() => rows.flatMap((row, index) => (row.type === 'entry' ? [{ index, row }] : [])), [rows]);
  // While searching, the first match is already the active one, so Enter picks it.
  const active = entryRows.find(({ row }) => row.key === activeKey) ?? (query.trim() ? entryRows[0] : undefined);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i].type === 'header' ? HEADER_HEIGHT : ENTRY_HEIGHT),
    getItemKey: (i) => rows[i].key,
    overscan: 8,
  });

  const counts = useMemo(
    () => ({ all: entries.length, character: entries.filter((e) => e.kind === 'character').length, object: entries.filter((e) => e.kind !== 'character').length }),
    [entries],
  );

  const arm = (entry: Entry) => onArm(armedKey === entry.key ? null : entry.armed);
  const move = (offset: number) => {
    if (entryRows.length === 0) return;
    const at = active ? entryRows.indexOf(active) : -1;
    const next = entryRows[Math.max(0, Math.min(entryRows.length - 1, at + offset))];
    setActiveKey(next.row.key);
    virtualizer.scrollToIndex(next.index, { align: 'auto' });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          id="playground-search"
          autoComplete="off"
          placeholder={t('playground.list.searchAmong', { count: i18n.number(entries.length) })}
          aria-label={t('playground.list.searchLabel')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveKey(null);
          }}
          onKeyDown={(e) => {
            if (e.key === SEARCH_KEYS.next) move(1);
            else if (e.key === SEARCH_KEYS.previous) move(-1);
            else if (e.key === SEARCH_KEYS.arm && active && active.row.type === 'entry') arm(active.row.entry);
            else if (e.key === SEARCH_KEYS.clear) {
              if (query) setQuery('');
              else e.currentTarget.blur();
            } else return;
            e.preventDefault();
          }}
        />
        {query && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label={t('playground.list.clearSearch')} onClick={() => setQuery('')}>
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={filter} onValueChange={(value) => value && setFilter(value as KindFilter)} aria-label={t('playground.list.type')} className="w-full">
        <ToggleGroupItem value="all" className="flex-1">{t('playground.list.all', { count: counts.all })}</ToggleGroupItem>
        <ToggleGroupItem value="character" className="flex-1">{t('playground.list.characters', { count: counts.character })}</ToggleGroupItem>
        <ToggleGroupItem value="object" className="flex-1">{t('playground.list.objects', { count: counts.object })}</ToggleGroupItem>
      </ToggleGroup>

      <div ref={scrollRef} role="listbox" aria-label={t('playground.list.listLabel')} className="min-h-0 flex-1 overflow-y-auto rounded-md border">
        {rows.length === 0 ? (
          <Empty className="p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon"><SearchXIcon /></EmptyMedia>
              <EmptyTitle>{t('playground.list.nothing')}</EmptyTitle>
              <EmptyDescription>{t('playground.list.nothingHint')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtual) => {
              const row = rows[virtual.index];
              const style = { height: virtual.size, transform: `translateY(${virtual.start}px)` };
              if (row.type === 'header') {
                const toggleable = row.key.startsWith('group|');
                // A folder header is the folder's path as written, as the asset list shows it: only "Recent" is a heading in capitals.
                return (
                  <button
                    key={virtual.key}
                    type="button"
                    className={cn('absolute inset-x-0 top-0 flex items-center gap-1.5 bg-background/95 px-2 text-xs font-medium text-muted-foreground hover:text-foreground', row.kind === 'recent' && 'uppercase')}
                    style={style}
                    disabled={!toggleable || query.trim() !== ''}
                    onClick={() => {
                      const group = row.key.slice('group|'.length);
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (!next.delete(group)) next.add(group);
                        return next;
                      });
                    }}
                  >
                    {toggleable && (row.collapsed ? <ChevronRightIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />)}
                    <span className="truncate">{row.kind === 'recent' ? t('playground.entry.recent') : row.label === ROOT ? t('playground.entry.root') : row.label}</span>
                    <span className="ml-auto tabular-nums">{row.count}</span>
                  </button>
                );
              }
              const { entry } = row;
              const isPlayer = entry.armed.type === 'character' && entry.armed.character.id === playerId;
              return (
                <Item
                  key={virtual.key}
                  role="option"
                  aria-selected={armedKey === entry.key}
                  variant={armedKey === entry.key ? 'muted' : 'default'}
                  size="xs"
                  className={cn('absolute inset-x-0 top-0 cursor-pointer rounded-none py-1', active?.row.key === row.key && 'bg-accent')}
                  style={style}
                  onClick={() => arm(entry)}
                >
                  <ItemMedia>
                    <div className="w-10 overflow-hidden rounded-sm ring-1 ring-foreground/10">
                      <AssetThumb asset={entry.cover} />
                    </div>
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="truncate">{entry.name}</ItemTitle>
                    <ItemDescription className="truncate">{entrySubtitle(entry.detail, i18n)}</ItemDescription>
                  </ItemContent>
                  {entry.armed.type === 'character' && (
                    <ItemActions>
                      {isPlayer ? (
                        <Badge variant="secondary">{t('playground.list.controlling')}</Badge>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t('playground.list.controlLabel', { name: entry.name })}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (entry.armed.type === 'character') onControl(entry.armed.character.id);
                              }}
                            >
                              <GamepadIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('playground.list.controlHint')}</TooltipContent>
                        </Tooltip>
                      )}
                    </ItemActions>
                  )}
                </Item>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

import { ArrowDownIcon, ArrowUpIcon, LayersIcon, LayoutGridIcon, Rows3Icon, SearchIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { assetsRoute } from '@/lib/routes';
import { isSortId, sortIds } from '@/lib/search';
import type { FolderRow } from '@/lib/folders';
import { AssetFilters } from './asset-filters';

export const gridSizes = { s: 132, m: 176, l: 240 } as const;
export type GridSize = keyof typeof gridSizes;

interface Props {
  /** The project's folders in tree order, with the number of assets below each (`lib/folders.ts`). */
  folders: FolderRow[];
  gridSize: GridSize;
  onGridSize: (size: GridSize) => void;
}

export function AssetToolbar({ folders, gridSize, onGridSize }: Props) {
  const { t } = useT();
  const search = assetsRoute.useSearch();
  const navigate = assetsRoute.useNavigate();
  const setSearch = (patch: Partial<typeof search>) => void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
      <InputGroup className="w-72">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          id="asset-search"
          type="search"
          placeholder={t('assets.toolbar.searchPlaceholder')}
          aria-label={t('assets.toolbar.searchLabel')}
          autoComplete="off"
          value={search.q}
          onChange={(e) => setSearch({ q: e.target.value })}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            if (search.q) setSearch({ q: '' });
            else e.currentTarget.blur();
          }}
        />
        <InputGroupAddon align="inline-end">
          {search.q ? (
            <InputGroupButton size="icon-xs" aria-label={t('assets.toolbar.clearSearch')} onClick={() => setSearch({ q: '' })}>
              <XIcon />
            </InputGroupButton>
          ) : (
            <Kbd>/</Kbd>
          )}
        </InputGroupAddon>
      </InputGroup>

      <AssetFilters folders={folders} />

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <ButtonGroup>
          <Select value={search.sort} onValueChange={(value) => isSortId(value) && setSearch({ sort: value })}>
            <SelectTrigger aria-label={t('assets.toolbar.sortBy')} className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sortIds.map((id) => <SelectItem key={id} value={id}>{t(`assets.sort.${id}`)}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={search.dir === 'asc' ? t('assets.toolbar.ascending') : t('assets.toolbar.descending')}
                onClick={() => setSearch({ dir: search.dir === 'asc' ? 'desc' : 'asc' })}
              >
                {search.dir === 'asc' ? <ArrowUpIcon /> : <ArrowDownIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{search.dir === 'asc' ? t('assets.toolbar.ascending') : t('assets.toolbar.descending')}</TooltipContent>
          </Tooltip>
        </ButtonGroup>

        {search.view === 'grid' && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle variant="outline" pressed={search.group} onPressedChange={(group) => setSearch({ group })}>
                  <LayersIcon data-icon="inline-start" />
                  {t('assets.toolbar.group')}
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>{t('assets.toolbar.groupHint')}</TooltipContent>
            </Tooltip>
            <ToggleGroup type="single" variant="outline" spacing={0} value={gridSize} onValueChange={(size) => size && onGridSize(size as GridSize)} aria-label={t('assets.toolbar.cardSize')}>
              {(Object.keys(gridSizes) as GridSize[]).map((size) => (
                <ToggleGroupItem key={size} value={size}>{size.toUpperCase()}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </>
        )}
        <ToggleGroup type="single" variant="outline" spacing={0} value={search.view} onValueChange={(view) => (view === 'grid' || view === 'table') && setSearch({ view })} aria-label={t('assets.toolbar.view')}>
          <ToggleGroupItem value="grid" aria-label={t('assets.toolbar.grid')}><LayoutGridIcon /></ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label={t('assets.toolbar.table')}><Rows3Icon /></ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}

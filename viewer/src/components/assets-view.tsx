import { useEffect, useMemo, useRef } from 'react';
import NiceModal from '@ebay/nice-modal-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { PackageOpenIcon, PlusIcon, SearchXIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { assetsQuery, projectsQuery } from '@/lib/queries';
import { assetsRoute } from '@/lib/routes';
import { useT } from '@/i18n';
import { folderTree } from '@/lib/folders';
import { pendingExports } from '@/lib/export-state';
import { entryCover, entryKey, entryOf, groupAnimations, type AssetEntry } from '@/lib/groups';
import { usePref } from '@/lib/use-pref';
import { useAssetTable } from '@/lib/use-asset-table';
import { assetDomId, useEntrySelection } from '@/lib/use-asset-selection';
import { useGridColumns } from '@/lib/use-grid-columns';
import type { AssetFileMeta } from '@/lib/types';
import { DeleteAssetsModal } from '@/modals/delete-assets-modal';
import { NewModal } from '@/modals/new-modal';
import { AssetGrid } from './asset-grid';
import { AssetTable } from './asset-table';
import { AssetToolbar, gridSizes, type GridSize } from './asset-toolbar';
import { ExportBanner } from './export-banner';
import { DetailsDialog } from './details/details-dialog';

export function AssetsView() {
  const { project } = assetsRoute.useParams();
  const { t, plural } = useT();
  const search = assetsRoute.useSearch();
  const navigate = assetsRoute.useNavigate();
  const { data: allAssets } = useSuspenseQuery(assetsQuery);
  const { data: projects } = useSuspenseQuery(projectsQuery);
  const [gridSize, setGridSize] = usePref<GridSize>('grid.size', 'm');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { columns, cardWidth } = useGridColumns(scrollRef, gridSizes[gridSize]);

  const assets = useMemo(() => allAssets.filter((a) => a.project === project), [allAssets, project]);
  const folders = useMemo(() => folderTree(assets.map((a) => a.subpath)), [assets]);
  const table = useAssetTable(assets);
  const rows = table.getRowModel().rows;
  const visible = useMemo(() => rows.map((row) => row.original), [rows]);

  // The grid can collapse a character's animations into one card; the table always lists every asset.
  const entries = useMemo<AssetEntry[]>(
    () => (search.group ? groupAnimations(visible, assets) : visible.map((asset) => ({ type: 'asset' as const, asset }))),
    [search.group, visible, assets],
  );
  const asGrid = search.view === 'grid';
  const keys = useMemo(() => (asGrid ? entries.map(entryKey) : visible.map((a) => a.subpath)), [asGrid, entries, visible]);

  const setSearch = (patch: Partial<typeof search>, replace = true) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace });
  const openDetails = (asset: AssetFileMeta) => setSearch({ asset: asset.subpath }, false);
  const clearFilters = () => setSearch({ q: '', engine: undefined, folder: undefined, role: undefined });

  const entryByKey = (key: string) => entries.find((entry) => entryKey(entry) === key);
  const { activeKey, setActiveKey } = useEntrySelection({
    keys,
    view: search.view,
    columns,
    paused: search.asset !== undefined,
    onOpen: (key) => {
      const entry = entryByKey(key);
      const asset = entry ? entryCover(entry) : visible.find((a) => a.subpath === key);
      if (asset) openDetails(asset);
    },
    onDelete: (key) => {
      const entry = entryByKey(key);
      const targets = entry?.type === 'group' ? entry.group.assets : visible.filter((a) => a.subpath === key);
      if (targets.length) void NiceModal.show(DeleteAssetsModal, { assets: targets });
    },
  });
  const keyOf = (asset: AssetFileMeta) => {
    const entry = asGrid ? entryOf(entries, asset) : undefined;
    return entry ? entryKey(entry) : asset.subpath;
  };
  const open = (asset: AssetFileMeta) => {
    setActiveKey(keyOf(asset));
    openDetails(asset);
  };

  const detailsAsset = search.asset ? assets.find((a) => a.subpath === search.asset) : undefined;
  useEffect(() => {
    if (detailsAsset && activeKey === null) setActiveKey(keyOf(detailsAsset));
  }, [detailsAsset, activeKey]);
  const filtered = search.q.trim() !== '' || search.engine !== undefined || search.folder !== undefined || search.role !== undefined;
  const projectMeta = projects.find((p) => p.name === project);
  const sheetCount = projectMeta?.sheetCount ?? 0;
  const pending = useMemo(() => pendingExports(assets, projectMeta), [assets, projectMeta]);
  const shown = asGrid ? entries.length : visible.length;

  return (
    <>
      <AssetToolbar folders={folders} gridSize={gridSize} onGridSize={setGridSize} />

      <div className="flex items-center gap-3 px-4 pt-2 text-xs text-muted-foreground tabular-nums">
        {filtered ? t('assets.filtered', { shown: visible.length, total: plural('counts.assets', assets.length) }) : plural('counts.assets', assets.length)}
        {asGrid && search.group && entries.length < visible.length && <span>{plural('assets.grouped', entries.length)}</span>}
        {filtered && (
          <Button variant="link" size="xs" onClick={clearFilters}>
            {t('assets.clearFiltersLink')}
          </Button>
        )}
      </div>

      {assets.length > 0 && (
        <div className="px-4 pt-2 empty:hidden">
          <ExportBanner project={project} pending={pending} />
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {assets.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><PackageOpenIcon /></EmptyMedia>
              <EmptyTitle>{t('assets.empty.title')}</EmptyTitle>
              <EmptyDescription>
                {sheetCount > 0 ? plural('assets.empty.withSheets', sheetCount) : t('assets.empty.withoutSheets')}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center">
              <Button variant="outline" onClick={() => void NiceModal.show(NewModal, { tab: 'new-asset', project })}>
                <PlusIcon data-icon="inline-start" />
                {t('assets.empty.newAsset')}
              </Button>
              {sheetCount > 0 && <Button onClick={() => void NiceModal.show(NewModal, { tab: 'export', project })}>{t('assets.empty.exportProject')}</Button>}
            </EmptyContent>
          </Empty>
        ) : shown === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><SearchXIcon /></EmptyMedia>
              <EmptyTitle>{t('assets.noMatch.title')}</EmptyTitle>
              <EmptyDescription>{t('assets.noMatch.description')}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={clearFilters}>{t('assets.clearFilters')}</Button>
            </EmptyContent>
          </Empty>
        ) : asGrid ? (
          <AssetGrid
            entries={entries}
            activeKey={activeKey}
            cardWidth={cardWidth}
            columns={columns}
            scrollRef={scrollRef}
            onOpen={open}
          />
        ) : (
          <AssetTable table={table} activeKey={activeKey} scrollRef={scrollRef} onOpen={open} />
        )}
      </div>

      {detailsAsset && (
        <DetailsDialog
          asset={detailsAsset}
          openerId={assetDomId(activeKey ?? keyOf(detailsAsset))}
          projectAssets={assets}
          visibleAssets={visible}
          onClose={() => setSearch({ asset: undefined }, false)}
          onSelect={(next) => setSearch({ asset: next.subpath })}
        />
      )}
    </>
  );
}

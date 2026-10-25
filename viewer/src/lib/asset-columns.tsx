import {
  columnFilteringFeature, createColumnHelper, createFilteredRowModel, createSortedRowModel,
  rowSortingFeature, tableFeatures,
} from '@tanstack/react-table';
import { AssetThumb } from '@/components/asset-thumb';
import { AssetMenuButton } from '@/components/asset-menu';
import { EngineBadge } from '@/components/engine-badge';
import { StaleBadge } from '@/components/stale-badge';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/i18n';
import { assetTitle, roleDetail, roleOf, type RoleId } from './asset-role';
import { isStale } from './export-state';
import { dirname } from './format';
import type { AssetFileMeta, Engine } from './types';

/** Stable, module-level inputs: Table v9 recomputes row models whenever these change identity. */
export const assetFeatures = tableFeatures({
  columnFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
});

const helper = createColumnHelper<typeof assetFeatures, AssetFileMeta>();

type Sortable = { original: AssetFileMeta };
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byNumber = (pick: (a: AssetFileMeta) => number) => (a: Sortable, b: Sortable) => pick(a.original) - pick(b.original);
const byText = (pick: (a: AssetFileMeta) => string) => (a: Sortable, b: Sortable) => collator.compare(pick(a.original), pick(b.original));

/** A column's title. The columns are made once, at module level, so each text asks for its language when it is drawn. */
function Heading({ id }: { id: 'name' | 'folder' | 'role' | 'engine' | 'dimensions' | 'frames' | 'fileSize' | 'modified' }) {
  const { t } = useT();
  return t(`assets.columns.${id}`);
}

function RoleBadge({ asset }: { asset: AssetFileMeta }) {
  const { t } = useT();
  const role = roleOf(asset);
  if (role === 'other') return <span className="text-muted-foreground">—</span>;
  const detail = roleDetail(asset, t);
  const name = t(`roles.badge.${role}`);
  return <Badge variant="secondary">{detail ? `${name} · ${detail}` : name}</Badge>;
}

function FileSize({ size }: { size: number }) {
  return useT().bytes(size);
}

function Modified({ ms }: { ms: number }) {
  return useT().relative(ms);
}

const dimensionsOf = (a: AssetFileMeta) => (a.width ?? 0) * (a.height ?? 0);
const frameCountOf = (a: AssetFileMeta) => a.atlasInfo?.frameCount ?? 1;

export const assetColumns = helper.columns([
  helper.display({
    id: 'thumb',
    header: '',
    enableSorting: false,
    cell: ({ row }) => (
      <div className="w-12 overflow-hidden rounded-sm ring-1 ring-foreground/10">
        <AssetThumb asset={row.original} />
      </div>
    ),
  }),
  helper.accessor((a) => a.subpath, {
    id: 'name',
    header: () => <Heading id="name" />,
    sortFn: byText((a) => a.subpath),
    // Every word of the query must appear somewhere in "project/path".
    filterFn: (row, _columnId, query: string) => {
      // A gear sheet is also found by its label and group (its id, as the kit writes it), a character's clip by its
      // character's label and id ("Ravenlight", "ossuary-guard").
      const { label, group, character } = row.original.atlasInfo ?? {};
      const haystack = `${row.original.project}/${row.original.subpath} ${label ?? ''} ${group ?? ''} ${character?.label ?? ''} ${character?.name ?? ''}`.toLowerCase();
      return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
    },
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <span className="truncate font-medium" title={row.original.subpath}>{assetTitle(row.original)}</span>
        {isStale(row.original) && <StaleBadge />}
      </span>
    ),
  }),
  helper.accessor((a) => dirname(a.subpath), {
    id: 'folder',
    header: () => <Heading id="folder" />,
    sortFn: byText((a) => dirname(a.subpath)),
    filterFn: (row, _columnId, folder: string) => row.original.subpath.startsWith(`${folder}/`),
    cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() || '—'}</span>,
  }),
  helper.accessor(roleOf, {
    id: 'role',
    header: () => <Heading id="role" />,
    sortFn: byText(roleOf),
    filterFn: (row, _columnId, role: RoleId) => roleOf(row.original) === role,
    cell: ({ row }) => <RoleBadge asset={row.original} />,
  }),
  helper.accessor((a) => a.engine ?? '', {
    id: 'engine',
    header: () => <Heading id="engine" />,
    sortFn: byText((a) => a.engine ?? ''),
    filterFn: (row, _columnId, engine: Engine | 'none') => (engine === 'none' ? row.original.engine === null : row.original.engine === engine),
    cell: ({ row }) => (row.original.engine ? <EngineBadge engine={row.original.engine} /> : <span className="text-muted-foreground">—</span>),
  }),
  helper.accessor(dimensionsOf, {
    id: 'dimensions',
    header: () => <Heading id="dimensions" />,
    sortFn: byNumber(dimensionsOf),
    cell: ({ row }) => (row.original.width ? `${row.original.width}×${row.original.height}` : '—'),
  }),
  helper.accessor(frameCountOf, {
    id: 'frames',
    header: () => <Heading id="frames" />,
    sortFn: byNumber(frameCountOf),
    cell: ({ row }) => {
      const info = row.original.atlasInfo;
      if (!info || info.mode === 'sheet') return <span className="text-muted-foreground">—</span>;
      return `${info.frameCount}${info.directions.length > 1 ? ` × ${info.directions.length}` : ''}`;
    },
  }),
  helper.accessor((a) => a.size, {
    id: 'fileSize',
    header: () => <Heading id="fileSize" />,
    sortFn: byNumber((a) => a.size),
    cell: ({ row }) => <FileSize size={row.original.size} />,
  }),
  helper.accessor((a) => a.mtime, {
    id: 'modified',
    header: () => <Heading id="modified" />,
    sortFn: byNumber((a) => a.mtime),
    cell: ({ row }) => <Modified ms={row.original.mtime} />,
  }),
  helper.display({
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: ({ row }) => <AssetMenuButton asset={row.original} />,
  }),
]);

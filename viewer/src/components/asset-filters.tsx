import { useMemo, useState } from 'react';
import { ListFilterIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Field, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useT } from '@/i18n';
import { isRoleId, roleIds } from '@/lib/asset-role';
import { searchFolders, type FolderRow } from '@/lib/folders';
import { assetsRoute } from '@/lib/routes';
import type { Engine } from '@/lib/types';

/** Radix Select cannot hold an empty value, so "no filter" is this sentinel. */
const ALL = 'all';

/**
 * Engine, type and folder, folded into one popover so the toolbar stays on one line. The trigger counts the filters in
 * use; each one is still its own search param (`engine`, `role`, `folder`), so links keep working.
 */
export function AssetFilters({ folders }: { folders: FolderRow[] }) {
  const { t } = useT();
  const search = assetsRoute.useSearch();
  const navigate = assetsRoute.useNavigate();
  const setSearch = (patch: Partial<typeof search>) => void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const active = [search.engine, search.role, search.folder].filter((value) => value !== undefined).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label={active > 0 ? t('assets.filters.labelActive', { count: active }) : t('assets.filters.label')}>
          <ListFilterIcon data-icon="inline-start" />
          {t('assets.filters.label')}
          {active > 0 && <Badge className="tabular-nums">{active}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-0 p-0">
        <FieldGroup className="gap-3 p-3">
          <Field>
            <FieldLabel htmlFor="asset-filter-engine">{t('assets.toolbar.engine')}</FieldLabel>
            <Select value={search.engine ?? ALL} onValueChange={(value) => setSearch({ engine: value === ALL ? undefined : (value as Engine | 'none') })}>
              <SelectTrigger id="asset-filter-engine" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL}>{t('assets.toolbar.allEngines')}</SelectItem>
                  <SelectItem value="volume">volume</SelectItem>
                  <SelectItem value="rig">rig</SelectItem>
                  <SelectItem value="none">{t('assets.toolbar.noEngine')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="asset-filter-type">{t('assets.toolbar.type')}</FieldLabel>
            <Select value={search.role ?? ALL} onValueChange={(value) => setSearch({ role: isRoleId(value) ? value : undefined })}>
              <SelectTrigger id="asset-filter-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL}>{t('assets.toolbar.allTypes')}</SelectItem>
                  {roleIds.map((id) => <SelectItem key={id} value={id}>{t(`roles.filter.${id}`)}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldTitle id="asset-filter-folder">{t('assets.toolbar.folder')}</FieldTitle>
            <FolderPicker folders={folders} value={search.folder} onChange={(folder) => setSearch({ folder })} />
          </Field>
        </FieldGroup>
        <Separator />
        <div className="flex justify-end p-2">
          <Button variant="ghost" size="sm" disabled={active === 0} onClick={() => setSearch({ engine: undefined, role: undefined, folder: undefined })}>
            {t('assets.clearFilters')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The project's folders as a tree (`lib/folders.ts: folderTree`), indented by depth, with the assets below each one.
 * Typing searches the whole paths, and the matches show their path so that two folders of the same name can be told apart.
 */
function FolderPicker({ folders, value, onChange }: { folders: FolderRow[]; value: string | undefined; onChange: (folder: string | undefined) => void }) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => searchFolders(folders, query), [folders, query]);
  const searching = query.trim() !== '';

  return (
    <Command shouldFilter={false} aria-labelledby="asset-filter-folder" className="rounded-md border p-0">
      <CommandInput value={query} onValueChange={setQuery} placeholder={t('assets.filters.searchFolders')} aria-label={t('assets.filters.searchFolders')} />
      <CommandList className="max-h-60">
        <CommandEmpty>{t('assets.filters.noFolder')}</CommandEmpty>
        <CommandGroup>
          {!searching && (
            <CommandItem value={ALL} data-checked={value === undefined} onSelect={() => onChange(undefined)}>
              {t('assets.toolbar.allFolders')}
            </CommandItem>
          )}
          {shown.map((row) => (
            <CommandItem key={row.path} value={row.path} data-checked={value === row.path} title={row.path} onSelect={() => onChange(row.path)}>
              {/* The tree's indent: a step per level, only when the whole tree is shown. */}
              <span className="truncate" style={searching ? undefined : { paddingInlineStart: `${row.depth * 0.75}rem` }}>
                {searching ? row.path : row.name}
              </span>
              <span className="ml-auto text-muted-foreground tabular-nums">{row.count}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

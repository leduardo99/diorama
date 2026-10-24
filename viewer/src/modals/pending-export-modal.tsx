import NiceModal from '@ebay/nice-modal-react';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon, FileCodeIcon, UploadIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { Rich, useT } from '@/i18n';
import { pendingExports } from '@/lib/export-state';
import { useExportSheets } from '@/lib/mutations';
import { projectDir } from '@/lib/project-paths';
import { assetsQuery, projectsQuery } from '@/lib/queries';
import { useModalDialog } from '@/lib/use-modal-dialog';
import { StaleBadge } from '@/components/stale-badge';

interface Props {
  project: string;
}

/** Every sheet that is not exported or out of date, each one with its own Export button. It follows the catalog live. */
export const PendingExportModal = NiceModal.create(({ project }: Props) => {
  const { modal, rootProps, contentProps } = useModalDialog();
  const { data: assets = [] } = useQuery(assetsQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const exportSheets = useExportSheets();
  const { t } = useT();

  const meta = projects.find((p) => p.name === project);
  const dir = projectDir(project);
  const pending = pendingExports(
    assets.filter((asset) => asset.project === project),
    meta,
  );
  const rows = [
    ...pending.missing.map((sheet) => ({ sheet, stale: false })),
    ...pending.stale.flatMap((asset) => (asset.sheet ? [{ sheet: asset.sheet, stale: true }] : [])),
  ];
  const exportAll = () => exportSheets.mutate({ project, sheets: rows.map((row) => row.sheet) });

  return (
    <Dialog {...rootProps}>
      <DialogContent {...contentProps} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('modals.pendingExport.title')}</DialogTitle>
          <DialogDescription>
            <Rich id="modals.pendingExport.description" vars={{ dir }} />
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><CheckIcon /></EmptyMedia>
              <EmptyTitle>{t('modals.pendingExport.allDone')}</EmptyTitle>
              <EmptyDescription>{t('modals.pendingExport.allDoneHint')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="max-h-72 gap-1 overflow-auto">
            {rows.map(({ sheet, stale }) => (
              <Item key={sheet} variant="muted" size="xs">
                <ItemMedia variant="icon">
                  <FileCodeIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="font-mono break-all">{sheet}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  {stale ? <StaleBadge /> : <Badge variant="outline">{t('modals.pendingExport.notExported')}</Badge>}
                  <Button variant="outline" size="xs" disabled={exportSheets.isPending} onClick={() => exportSheets.mutate({ project, sheets: [sheet] })}>
                    {t('modals.pendingExport.exportOne')}
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => modal.hide()}>{t('common.close')}</Button>
          <Button disabled={rows.length === 0 || exportSheets.isPending} onClick={exportAll}>
            {exportSheets.isPending ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
            {rows.length > 0 ? t('modals.pendingExport.exportCount', { count: rows.length }) : t('modals.pendingExport.exportAll')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

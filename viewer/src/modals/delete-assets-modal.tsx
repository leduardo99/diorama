import { useState } from 'react';
import NiceModal from '@ebay/nice-modal-react';
import { useQueries } from '@tanstack/react-query';
import { FileCodeIcon, FileImageIcon, FileJsonIcon, Trash2Icon } from 'lucide-react';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { Rich, useT } from '@/i18n';
import { deletePlanQuery } from '@/lib/queries';
import { useDeleteAssets } from '@/lib/mutations';
import { useModalDialog } from '@/lib/use-modal-dialog';
import type { AssetFileMeta, FileKind } from '@/lib/types';

const kindIcon: Record<FileKind, typeof FileImageIcon> = { image: FileImageIcon, atlas: FileJsonIcon, sheet: FileCodeIcon };

interface Props {
  assets: AssetFileMeta[];
}

/** Confirms moving exported assets to the trash, listing exactly the files the server will move. */
export const DeleteAssetsModal = NiceModal.create(({ assets }: Props) => {
  const { modal, rootProps, contentProps } = useModalDialog();
  const remove = useDeleteAssets();
  const { t, plural } = useT();
  const [deleteSheet, setDeleteSheet] = useState(false);

  const plans = useQueries({ queries: assets.map((a) => deletePlanQuery(a.project, a.subpath)) });
  const loading = plans.some((p) => p.isPending);
  const failed = plans.find((p) => p.isError);
  const files = plans.flatMap((p) => p.data?.files ?? []);
  const hasSheet = files.some((f) => f.kind === 'sheet');
  const moving = files.filter((f) => !f.optional || deleteSheet);
  const title = assets.length === 1 ? t('modals.deleteAssets.title', { name: assets[0].subpath.split('/').pop() ?? '' }) : plural('modals.deleteAssets.titleMany', assets.length);

  return (
    <AlertDialog {...rootProps}>
      <AlertDialogContent {...contentProps} className="data-[size=default]:sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            <Rich id="modals.deleteAssets.description" vars={{ project: assets[0].project }} />
          </AlertDialogDescription>
        </AlertDialogHeader>

        {loading && <Spinner />}
        {failed?.error && (
          <Alert variant="destructive">
            <AlertDescription>{failed.error.message}</AlertDescription>
          </Alert>
        )}
        <ItemGroup className="max-h-60 gap-1 overflow-auto">
          {files.map((file) => {
            const Icon = kindIcon[file.kind];
            const kept = file.optional && !deleteSheet;
            return (
              <Item key={file.path} variant="muted" size="xs">
                <ItemMedia variant="icon">
                  <Icon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="font-mono break-all">{file.path}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Badge variant={kept ? 'outline' : 'destructive'}>{kept ? t('modals.deleteAssets.stays') : t('modals.deleteAssets.trash')}</Badge>
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>

        <Field orientation="horizontal" data-disabled={!hasSheet || undefined}>
          <Checkbox id="delete-sheet" checked={deleteSheet} disabled={!hasSheet} onCheckedChange={(checked) => setDeleteSheet(checked === true)} />
          <FieldContent>
            <FieldLabel htmlFor="delete-sheet">{t('modals.deleteAssets.alsoSheet')}</FieldLabel>
            {!hasSheet && !loading && <FieldDescription>{assets.length === 1 ? t('modals.deleteAssets.noSheetOne') : t('modals.deleteAssets.noSheetMany')}</FieldDescription>}
          </FieldContent>
        </Field>
        {deleteSheet && hasSheet && (
          <Alert>
            <AlertDescription>{t('modals.deleteAssets.sheetWarning')}</AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={loading || failed !== undefined || remove.isPending}
            onClick={() => remove.mutate({ assets, deleteSheet }, { onSuccess: () => modal.hide() })}
          >
            {remove.isPending ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
            {plural('modals.deleteAssets.move', moving.length)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

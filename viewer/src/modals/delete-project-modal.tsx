import { useState } from 'react';
import NiceModal from '@ebay/nice-modal-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Rich, useT } from '@/i18n';
import { projectsQuery } from '@/lib/queries';
import { useDeleteProject } from '@/lib/mutations';
import { useModalDialog } from '@/lib/use-modal-dialog';

/** Moves a whole project to the trash. Asks for the project name first, like destructive actions on GitHub. */
export const DeleteProjectModal = NiceModal.create(({ project }: { project: string }) => {
  const { modal, rootProps, contentProps } = useModalDialog();
  const { data: projects } = useSuspenseQuery(projectsQuery);
  const remove = useDeleteProject();
  const { t, plural, bytes } = useT();
  const [typed, setTyped] = useState('');
  const meta = projects.find((p) => p.name === project);

  return (
    <AlertDialog {...rootProps}>
      <AlertDialogContent {...contentProps} className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('modals.deleteProject.title', { project })}</AlertDialogTitle>
          <AlertDialogDescription>
            <Rich
              id="modals.deleteProject.description"
              vars={{
                details: meta
                  ? t('modals.deleteProject.details', {
                      assets: plural('modals.deleteProject.detailsAssets', meta.assetCount),
                      sheets: plural('counts.sheets', meta.sheetCount),
                      size: bytes(meta.totalSize),
                    })
                  : '',
              }}
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Alert variant="destructive">
          <AlertDescription>{t(meta?.hasStyle ? 'modals.deleteProject.warning' : 'modals.deleteProject.warningNoStyle')}</AlertDescription>
        </Alert>
        <Field>
          <FieldLabel htmlFor="confirm-project">{t('modals.deleteProject.confirmLabel')}</FieldLabel>
          <Input id="confirm-project" autoComplete="off" placeholder={project} value={typed} onChange={(e) => setTyped(e.target.value)} />
          <FieldDescription>
            <Rich id="modals.deleteProject.confirmHint" vars={{ project }} />
          </FieldDescription>
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={typed !== project || remove.isPending}
            onClick={() => remove.mutate({ project }, { onSuccess: () => modal.hide() })}
          >
            {remove.isPending ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
            {t('modals.deleteProject.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

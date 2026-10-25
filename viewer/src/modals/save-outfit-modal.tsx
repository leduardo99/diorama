import { useState } from 'react';
import NiceModal from '@ebay/nice-modal-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { OutfitData } from '@core/rig';
import { CheckIcon, SaveIcon, TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Rich, useT } from '@/i18n';
import { api } from '@/lib/api';
import { exportFailureText } from '@/lib/export-errors';
import { isValidCharacterName } from '@/lib/outfit/save';
import { useModalDialog } from '@/lib/use-modal-dialog';

interface Props {
  project: string;
  /** The id of the character the outfit was made on: the new one gets its skeleton and clips. */
  characterId: string;
  outfit: OutfitData;
  /** The clips made for something this outfit does not hold, with what they need: the new character is not given them. */
  skipped?: Array<[key: string, needs: string]>;
}

interface Saved {
  name: string;
  /** What the two scripts printed. */
  output: string;
  exported: boolean;
}

/** Saves the outfit as a new character of the project, exports its sheets, and links to where to see it. */
export const SaveOutfitModal = NiceModal.create(({ project, characterId, outfit, skipped = [] }: Props) => {
  const { modal, rootProps, contentProps } = useModalDialog();
  const { t, plural } = useT();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [force, setForce] = useState(false);
  const valid = isValidCharacterName(name);

  const save = useMutation({
    mutationFn: async (): Promise<Saved> => {
      const created = await api.cli({ command: 'new-outfit-character', project, name, from: characterId, outfit, force });
      if (!created.ok) throw new Error(created.output);
      // The folder is new: export all of it, so the sheets exist when the user opens the playground.
      const exported = await api.cli({ command: 'export', project, subpath: `characters/${name}/` });
      return { name, output: [created.output, exported.ok ? exported.output : exportFailureText(exported.output, t('toasts.fixTypeErrors'))].filter(Boolean).join('\n\n'), exported: exported.ok };
    },
    // The catalog changed under the viewer whether or not the export worked.
    onSettled: () => Promise.all([queryClient.invalidateQueries({ queryKey: ['assets'] }), queryClient.invalidateQueries({ queryKey: ['projects'] })]),
  });
  const saved = save.data;

  return (
    <Dialog {...rootProps}>
      <DialogContent {...contentProps} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('modals.saveOutfit.title')}</DialogTitle>
          <DialogDescription>
            <Rich id="modals.saveOutfit.description" vars={{ name: name || t('modals.saveOutfit.namePlaceholder'), project }} />
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-3">
          <Field data-invalid={(name !== '' && !valid) || undefined}>
            <FieldLabel htmlFor="outfit-name">{t('modals.save.name')}</FieldLabel>
            <Input
              id="outfit-name"
              className="font-mono"
              autoComplete="off"
              placeholder={t('modals.saveOutfit.example')}
              aria-invalid={name !== '' && !valid}
              value={name}
              disabled={save.isPending}
              onChange={(e) => { setName(e.target.value); save.reset(); }}
            />
            {name !== '' && !valid ? <FieldError>{t('modals.saveOutfit.invalid', { example: t('modals.saveOutfit.example') })}</FieldError> : <FieldDescription>{t('modals.save.hint')}</FieldDescription>}
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="outfit-force" checked={force} disabled={save.isPending} onCheckedChange={(checked) => setForce(checked === true)} />
            <FieldLabel htmlFor="outfit-force" className="font-normal">{t('modals.save.replace')}</FieldLabel>
          </Field>
        </FieldGroup>

        {skipped.length > 0 && !saved && (
          <Alert>
            <TriangleAlertIcon />
            <AlertTitle>{plural('modals.saveOutfit.skipped', skipped.length)}</AlertTitle>
            <AlertDescription>
              {t('modals.saveOutfit.skippedBody', { list: skipped.map(([key, needs]) => t('modals.saveOutfit.skippedItem', { key, needs })).join(', ') })}
            </AlertDescription>
          </Alert>
        )}
        {save.isError && (
          <Alert variant="destructive">
            <AlertTitle>{t('modals.save.failed')}</AlertTitle>
            <AlertDescription><pre className="max-h-40 overflow-auto font-mono whitespace-pre-wrap">{save.error.message}</pre></AlertDescription>
          </Alert>
        )}
        {saved && (
          <Alert variant={saved.exported ? 'default' : 'destructive'}>
            <CheckIcon />
            <AlertTitle>{t(saved.exported ? 'modals.saveOutfit.saved' : 'modals.saveOutfit.savedExportFailed', { name: saved.name })}</AlertTitle>
            <AlertDescription>
              <pre className="max-h-40 overflow-auto font-mono whitespace-pre-wrap">{saved.output}</pre>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {saved ? (
            <>
              <Button variant="outline" onClick={() => modal.hide()}>{t('common.close')}</Button>
              <Button asChild onClick={() => modal.hide()}>
                <Link to="/p/$project/playground" params={{ project }}>{t('modals.saveOutfit.openPlayground')}</Link>
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => modal.hide()}>{t('common.cancel')}</Button>
              <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
                {save.isPending ? t('modals.save.saving') : t('modals.save.saveAndExport')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

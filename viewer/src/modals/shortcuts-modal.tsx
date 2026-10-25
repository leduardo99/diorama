import NiceModal from '@ebay/nice-modal-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useT } from '@/i18n';
import type { Key } from '@/i18n';
import { useModalDialog } from '@/lib/use-modal-dialog';

/** The keys are the same in every language, apart from the ones that are words (Space). */
const groups: Array<{ title: Key; items: Array<[keys: string[], label: Key]> }> = [
  {
    title: 'modals.shortcuts.list',
    items: [
      [['/'], 'modals.shortcuts.search'],
      [['↑', '↓', '←', '→'], 'modals.shortcuts.moveSelection'],
      [['↵'], 'modals.shortcuts.openDetails'],
      [['⌫'], 'modals.shortcuts.delete'],
      [['Esc'], 'modals.shortcuts.clear'],
      [['N'], 'modals.shortcuts.newThing'],
      [['⌘', 'K'], 'modals.shortcuts.switchProject'],
    ],
  },
  {
    title: 'modals.shortcuts.details',
    items: [
      [['space'], 'modals.shortcuts.playPause'],
      [['←', '→'], 'modals.shortcuts.frame'],
      [['↑', '↓', '1–8'], 'modals.shortcuts.direction'],
      [['[', ']'], 'modals.shortcuts.animation'],
      [['+', '−', '0'], 'modals.shortcuts.zoom'],
      [['B'], 'modals.shortcuts.background'],
      [['P', 'G'], 'modals.shortcuts.guides'],
    ],
  },
];

export const ShortcutsModal = NiceModal.create(() => {
  const { rootProps, contentProps } = useModalDialog();
  const { t } = useT();
  return (
    <Dialog {...rootProps}>
      <DialogContent {...contentProps} className="sm:max-w-xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('modals.shortcuts.title')}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-6">
          {groups.map((group) => (
            <section key={group.title} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase">{t(group.title)}</h3>
              <dl className="flex flex-col gap-1.5">
                {group.items.map(([keys, label]) => (
                  <div key={label} className="flex items-center gap-3">
                    <dt className="flex min-w-20 gap-1">{keys.map((key) => <Kbd key={key}>{key === 'space' ? t('keys.space') : key}</Kbd>)}</dt>
                    <dd className="text-muted-foreground">{t(label)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
});

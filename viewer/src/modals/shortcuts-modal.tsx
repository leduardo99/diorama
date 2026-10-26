import NiceModal from '@ebay/nice-modal-react';
import { useLocation, useParams } from '@tanstack/react-router';
import { SignpostIcon } from 'lucide-react';
import { ShortcutList } from '@/components/shortcut-list';
import { startTour } from '@/components/tour/tour-control';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/i18n';
import { sectionOf } from '@/lib/sections';
import { ANYWHERE, SHORTCUT_TABS, SHORTCUTS } from '@/lib/shortcuts';
import { useModalDialog } from '@/lib/use-modal-dialog';

/**
 * The keys of every page on top, then one tab per section of a project, open on the section the user is in. On a project
 * page, "Take the tour" closes the window and starts the tour of the page (which waits for the window to be gone).
 */
export const ShortcutsModal = NiceModal.create(() => {
  const { modal, rootProps, contentProps } = useModalDialog();
  const { project } = useParams({ strict: false });
  const { t } = useT();
  // The modal is mounted afresh on every show, so the tab it opens on is always the page's.
  const section = useLocation({ select: (location) => sectionOf(location.pathname) });
  return (
    <Dialog {...rootProps}>
      <DialogContent {...contentProps} className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('modals.shortcuts.title')}</DialogTitle>
        </DialogHeader>
        <ShortcutList section={ANYWHERE} columns={2} />
        <Tabs defaultValue={section}>
          <TabsList variant="line" aria-label={t('sections.label')}>
            {SHORTCUT_TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab}>{t(`sections.${tab}`)}</TabsTrigger>
            ))}
          </TabsList>
          {/* Every tab sits in the same cell, the hidden ones keeping their room: the window is as tall as the tallest and does not jump when the tab changes. */}
          <div className="grid">
            {SHORTCUT_TABS.map((tab) => (
              <TabsContent key={tab} value={tab} forceMount className="col-start-1 row-start-1 grid content-start gap-6 pt-2 data-[state=inactive]:invisible sm:grid-cols-2">
                {SHORTCUTS[tab].map((list) => <ShortcutList key={list.title} section={list} />)}
              </TabsContent>
            ))}
          </div>
        </Tabs>
        {project && (
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void modal.hide();
                startTour();
              }}
            >
              <SignpostIcon data-icon="inline-start" />
              {t('tour.start')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
});

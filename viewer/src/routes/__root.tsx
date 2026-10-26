import NiceModal from '@ebay/nice-modal-react';
import { createRootRouteWithContext, ErrorComponent, Link, Outlet, useParams, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { assetsQuery, projectsQuery } from '@/lib/queries';
import { APP_KEYS, isModalOpen, isTyping, useWindowKeydown } from '@/lib/hotkeys';
import { Rich, useT } from '@/i18n';
import { AppHeader } from '@/components/app-header';
import { NewModal } from '@/modals/new-modal';
import { ShortcutsModal } from '@/modals/shortcuts-modal';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: ({ context: { queryClient } }) =>
    Promise.all([queryClient.ensureQueryData(projectsQuery), queryClient.ensureQueryData(assetsQuery)]),
  component: Shell,
  errorComponent: LoadError,
  notFoundComponent: NotFound,
});

function LoadError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const { t } = useT();
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-3 px-5 py-[15vh]">
      <h1 className="text-base font-semibold">{t('app.loadError.title')}</h1>
      <ErrorComponent error={error} />
      <p className="text-muted-foreground"><Rich id="app.loadError.hint" /></p>
      <Button onClick={() => void router.invalidate()}>{t('app.loadError.retry')}</Button>
    </div>
  );
}

function NotFound() {
  const { t } = useT();
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-3 px-5 py-[15vh]">
      <h1 className="text-base font-semibold">{t('app.notFound')}</h1>
      <Button variant="outline" asChild>
        <Link to="/">{t('app.backHome')}</Link>
      </Button>
    </div>
  );
}

function Shell() {
  // N opens the New dialog on the project in use, as the header's New does.
  const { project } = useParams({ strict: false });
  useWindowKeydown((e) => {
    // A modal dialog or an open menu keeps the keys; a popover does not (the Playground's and the painter's selection
    // popovers stay open while the page is used), so N and ? still work over one.
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || isModalOpen()) return;
    const key = e.key.toLowerCase();
    if (key === APP_KEYS.newThing) {
      e.preventDefault();
      void NiceModal.show(NewModal, { project });
    } else if (key === APP_KEYS.help) {
      e.preventDefault();
      void NiceModal.show(ShortcutsModal);
    }
  });

  return (
    <TooltipProvider>
      {/* The one place modals are mounted: any component can open one with NiceModal.show(). */}
      <NiceModal.Provider>
        <div className="flex h-svh min-w-0 flex-col overflow-hidden">
          <AppHeader />
          <main className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </main>
        </div>
        <Toaster />
      </NiceModal.Provider>
    </TooltipProvider>
  );
}

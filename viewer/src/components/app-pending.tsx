import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useT } from '@/i18n';

/**
 * What a cold load shows while the root loader reads the projects and the catalog: the header as it will be (the logo,
 * the controls as skeletons) and a spinner where the page goes. The router shows it only once loading has taken a moment
 * (`pendingMs` on the root route), so a fast load goes straight to the page.
 */
export function AppPending() {
  const { t } = useT();
  return (
    <div className="flex h-svh min-w-0 flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
        <span className="flex items-center gap-2 px-1 py-1">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">D</span>
          <span className="font-medium">Diorama</span>
        </span>
        <Skeleton className="mx-3 h-6 w-32" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="size-6" />
          <Skeleton className="size-6" />
          <Skeleton className="h-6 w-24" />
        </div>
      </header>
      <main role="status" className="flex min-h-0 flex-1 items-center justify-center gap-2 text-muted-foreground">
        <Spinner />
        {t('common.loading')}
      </main>
    </div>
  );
}

import NiceModal from '@ebay/nice-modal-react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { BoxesIcon, CopyIcon, FolderPlusIcon, SparklesIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Kbd } from '@/components/ui/kbd';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Rich, useT } from '@/i18n';
import { copyText } from '@/lib/clipboard';
import { SAMPLE_COMMAND, SAMPLE_PROJECT, useTrySample } from '@/lib/mutations';
import { projectsQuery } from '@/lib/queries';
import { NovoModal } from '@/modals/novo-modal';

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context: { queryClient } }) => {
    const projects = await queryClient.ensureQueryData(projectsQuery);
    const last = (() => {
      try {
        return localStorage.getItem('diorama:lastProject');
      } catch {
        return null;
      }
    })();
    const target = projects.find((p) => p.name === last) ?? projects[0];
    if (target) throw redirect({ to: '/p/$project', params: { project: target.name }, replace: true });
  },
  component: NoProjects,
});

/**
 * The app with no project in `projects/`: what Diorama is, and the two ways in, a new project (the New dialog) or the
 * sample, which `npm run example` copies into `projects/` and exports (run here through the CLI endpoint, or in a terminal).
 */
function NoProjects() {
  const { t, number } = useT();
  const sample = useTrySample();
  const running = sample.isPending;
  // While the sample comes in, the catalog is read every second: the copy shows up, then its sheets get their exports.
  const { data: projects = [] } = useQuery({ ...projectsQuery, refetchInterval: running ? 1000 : false });
  const copy = running ? projects.find((p) => p.name === SAMPLE_PROJECT) : undefined;
  const failure = sample.isError ? sample.error.message : sample.data && !sample.data.ok ? sample.data.output : null;

  return (
    <Empty className="h-full">
      <EmptyHeader className="max-w-md">
        <EmptyMedia variant="icon"><BoxesIcon /></EmptyMedia>
        <EmptyTitle>{t('projects.none.title')}</EmptyTitle>
        <EmptyDescription>{t('projects.none.description')}</EmptyDescription>
        <EmptyDescription><Rich id="projects.none.where" /></EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-md">
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => void NiceModal.show(NovoModal, { tab: 'new-project' })}>
            <FolderPlusIcon data-icon="inline-start" />
            {t('projects.none.create')}
          </Button>
          <Button variant="outline" disabled={running} onClick={() => sample.mutate()}>
            {running ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
            {running ? t('projects.none.sampleRunning') : t('projects.none.sample')}
          </Button>
        </div>
        <p className="text-muted-foreground" aria-live="polite">
          {running
            ? copy
              ? t('projects.none.exporting', { done: number(copy.sheetCount - copy.pendingSheets.length), total: number(copy.sheetCount) })
              : t('projects.none.copying')
            : <Rich id="projects.none.sampleHint" />}
        </p>
        <div className="flex w-full items-center gap-2 rounded-md bg-muted/50 p-2 text-left">
          <Kbd>CLI</Kbd>
          <span className="sr-only">{t('projects.none.terminal')}</span>
          <code className="min-w-0 flex-1 truncate font-mono text-xs">{SAMPLE_COMMAND}</code>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={t('projects.none.copyCommand')} onClick={() => void copyText(SAMPLE_COMMAND, t('projects.none.commandLabel'))}>
                <CopyIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('projects.none.copyCommand')}</TooltipContent>
          </Tooltip>
        </div>
        {failure !== null && (
          <Alert variant="destructive" className="text-left">
            <AlertTitle>{t('projects.none.sampleFailed')}</AlertTitle>
            <AlertDescription>
              <pre className="max-h-48 w-full overflow-auto font-mono text-xs whitespace-pre-wrap">{failure}</pre>
            </AlertDescription>
          </Alert>
        )}
      </EmptyContent>
    </Empty>
  );
}

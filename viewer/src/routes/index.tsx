import NiceModal from '@ebay/nice-modal-react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { BoxesIcon, CopyIcon, FolderOpenIcon, FolderPlusIcon, SparklesIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Rich, useT } from '@/i18n';
import { copyText } from '@/lib/clipboard';
import { progressPercent } from '@/lib/export-state';
import { SAMPLE_COMMAND, SAMPLE_PROJECT, useTrySample } from '@/lib/mutations';
import { exampleRunQuery, projectsQuery } from '@/lib/queries';
import { NewModal } from '@/modals/new-modal';

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
 * A run that is going on anywhere (this page, another tab, a terminal: `/__api/example-run`) shows as running, and no
 * second one starts. Once the copy is in the catalog and nothing runs (a run that failed in its export, or one that
 * ended elsewhere), the page says so and opens it.
 */
function NoProjects() {
  const { t, number } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sample = useTrySample();
  // Read every second while a run goes on, to see it end.
  const { data: run } = useQuery({ ...exampleRunQuery, refetchInterval: (query) => (query.state.data?.running ? 1000 : false) });
  const elsewhere = Boolean(run?.running);
  const running = sample.isPending || elsewhere;
  // While the sample comes in, the catalog is read every second: the copy shows up, then its sheets get their exports.
  const { data: projects = [] } = useQuery({ ...projectsQuery, refetchInterval: running ? 1000 : false });
  // A run that ends elsewhere has no callback here: read the catalog once more when the server says it ended.
  useEffect(() => {
    if (!elsewhere) void queryClient.invalidateQueries({ queryKey: projectsQuery.queryKey });
  }, [elsewhere, queryClient]);
  const copy = projects.find((p) => p.name === SAMPLE_PROJECT);
  const there = copy !== undefined && !running;
  const result = sample.data;
  // This page's last run failed, unless the copy has every sheet exported since (by a run in a terminal or another tab).
  const done = copy !== undefined && copy.pendingSheets.length === 0;
  const failure = running || done ? null : sample.isError ? sample.error.message : result && !result.ok && !result.running ? result.output : null;
  const exportedCount = copy ? t('projects.none.exportCount', { done: number(copy.sheetCount - copy.pendingSheets.length), total: number(copy.sheetCount) }) : undefined;
  const openSample = () => void navigate({ to: '/p/$project', params: { project: SAMPLE_PROJECT } });

  return (
    <Empty className="h-full">
      <EmptyHeader className="max-w-md">
        <EmptyMedia variant="icon"><BoxesIcon /></EmptyMedia>
        <EmptyTitle>{there ? t('projects.none.sampleThere') : t('projects.none.title')}</EmptyTitle>
        <EmptyDescription>{t('projects.none.description')}</EmptyDescription>
        <EmptyDescription><Rich id="projects.none.where" /></EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-md">
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => void NiceModal.show(NewModal, { tab: 'new-project' })}>
            <FolderPlusIcon data-icon="inline-start" />
            {t('projects.none.create')}
          </Button>
          {there && failure === null ? (
            <Button variant="outline" onClick={openSample}>
              <FolderOpenIcon data-icon="inline-start" />
              {t('projects.none.open', { project: SAMPLE_PROJECT })}
            </Button>
          ) : (
            <Button variant="outline" disabled={running} onClick={() => sample.mutate()}>
              {running ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
              {running ? t('projects.none.sampleRunning') : t('projects.none.sample')}
            </Button>
          )}
        </div>
        {running ? (
          // The copy first (no count yet: the bar waits), then its sheets get their exports, counted from the catalog.
          <Field aria-live="polite">
            <FieldLabel id="sample-progress-label" className="font-normal text-muted-foreground">
              <span>{copy ? t('projects.none.exporting') : t('projects.none.copying')}</span>
              {copy && <span className="ml-auto tabular-nums">{exportedCount}</span>}
            </FieldLabel>
            <Progress
              aria-labelledby="sample-progress-label"
              value={copy ? progressPercent(copy.sheetCount - copy.pendingSheets.length, copy.sheetCount) : null}
              getValueLabel={() => exportedCount ?? t('projects.none.copying')}
            />
          </Field>
        ) : (
          <p className="text-muted-foreground"><Rich id={there ? 'projects.none.sampleThereHint' : 'projects.none.sampleHint'} /></p>
        )}
        <div className="flex w-full items-center gap-2 rounded-md bg-muted/50 p-2 text-left">
          <Badge variant="outline">CLI</Badge>
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
            <AlertTitle>{copy ? t('projects.none.sampleExportFailed') : t('projects.none.sampleFailed')}</AlertTitle>
            <AlertDescription className="flex min-w-0 flex-col items-start gap-2">
              <pre className="max-h-48 w-full overflow-auto font-mono text-xs whitespace-pre-wrap">{failure}</pre>
              {copy && (
                <>
                  <div>{t('projects.none.sampleRetryHint')}</div>
                  <Button variant="outline" size="sm" onClick={openSample}>
                    <FolderOpenIcon data-icon="inline-start" />
                    {t('projects.none.open', { project: SAMPLE_PROJECT })}
                  </Button>
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
      </EmptyContent>
    </Empty>
  );
}

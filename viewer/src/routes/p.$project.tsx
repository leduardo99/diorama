import { useEffect } from 'react';
import NiceModal from '@ebay/nice-modal-react';
import { createFileRoute, Link, notFound, Outlet, useLocation, type NotFoundRouteProps } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Gamepad2Icon, PlusIcon, UploadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { assetsQuery, projectsQuery } from '@/lib/queries';
import { Rich, useT } from '@/i18n';
import { projectTotals } from '@/lib/export-state';
import { projectUrl } from '@/lib/project-paths';
import { sectionOf } from '@/lib/sections';
import { NewModal } from '@/modals/new-modal';

/** What `beforeLoad` hands the not-found page when the project itself is missing. */
const MISSING_PROJECT = 'missing-project';

export const Route = createFileRoute('/p/$project')({
  beforeLoad: async ({ params, context: { queryClient } }) => {
    const known = (await queryClient.ensureQueryData(projectsQuery)).some((p) => p.name === params.project);
    // A project created moments ago (by an agent, say) may not be in the cached list yet.
    const found = known || (await queryClient.fetchQuery({ ...projectsQuery, staleTime: 0 })).some((p) => p.name === params.project);
    if (!found) throw notFound({ data: MISSING_PROJECT });
  },
  component: ProjectLayout,
  notFoundComponent: ProjectNotFound,
});

/**
 * Two cases end here: the project does not exist (`beforeLoad` says so), or it does and the path under it matches no
 * section (`/p/soulkeeper/nope`), which the router hands to the nearest layout with a not-found page, this one.
 */
function ProjectNotFound({ data }: NotFoundRouteProps) {
  const { project } = Route.useParams();
  const { t } = useT();
  const missing = data === MISSING_PROJECT;
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-3 px-5 py-[15vh]">
      <h1 className="text-base font-semibold">{t(missing ? 'app.projectNotFound' : 'app.notFound')}</h1>
      <Button variant="outline" asChild>
        {missing ? <Link to="/">{t('app.backHome')}</Link> : <Link to="/p/$project" params={{ project }}>{t('app.backToProject', { project })}</Link>}
      </Button>
    </div>
  );
}

function ProjectLayout() {
  const { project } = Route.useParams();
  const i18n = useT();
  const { t } = i18n;
  const { data: projects } = useSuspenseQuery(projectsQuery);
  const { data: assets } = useSuspenseQuery(assetsQuery);
  const meta = projects.find((p) => p.name === project);
  const pathname = useLocation({ select: (location) => location.pathname });
  const section = sectionOf(pathname);

  useEffect(() => {
    try {
      localStorage.setItem('diorama:lastProject', project);
    } catch {
      // Remembering the last project is a convenience only.
    }
  }, [project]);

  if (!meta) return null;
  const count = assets.filter((a) => a.project === project).length;

  return (
    <>
      <header className="flex items-center gap-4 border-b px-4 pt-1.5">
        <Tabs value={section} className="min-w-0 overflow-x-auto">
          <TabsList variant="line" aria-label={t('sections.label')}>
            <TabsTrigger value="assets" asChild>
              <Link to="/p/$project" params={{ project }}>
                {t('sections.assets')} <span className="text-muted-foreground tabular-nums">{count}</span>
              </Link>
            </TabsTrigger>
            <TabsTrigger value="playground" asChild>
              <Link to="/p/$project/playground" params={{ project }}>{t('sections.playground')}</Link>
            </TabsTrigger>
            <TabsTrigger value="customize" asChild>
              <Link to="/p/$project/customize" params={{ project }}>{t('sections.customize')}</Link>
            </TabsTrigger>
            <TabsTrigger value="scenery" asChild>
              <Link to="/p/$project/scenery" params={{ project }}>{t('sections.scenery')}</Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground tabular-nums max-xl:hidden">
          {projectTotals(meta, count, i18n)}
        </span>
        <div className="flex shrink-0 items-center gap-2 pb-1.5 max-xl:ml-auto">
          {meta.hasGame && (
            // The game is a page of its own (game/index.html, rule 8), not a route of the viewer: a plain link, in a new tab.
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" asChild>
                  <a href={projectUrl(project, 'game/')} target="_blank" rel="noopener">
                    <Gamepad2Icon data-icon="inline-start" />
                    {t('project.playGame')}
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><Rich id="project.playGameHint" /></TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => void NiceModal.show(NewModal, { tab: 'export', project })}>
                <UploadIcon data-icon="inline-start" />
                {t('project.export')}
              </Button>
            </TooltipTrigger>
            {/* The Export tab's own description, in one span so it wraps as one paragraph (the content is a flex row). */}
            <TooltipContent side="bottom"><span><Rich id="modals.new.exportDescription" /></span></TooltipContent>
          </Tooltip>
          <Button size="sm" onClick={() => void NiceModal.show(NewModal, { tab: 'new-asset', project })}>
            <PlusIcon data-icon="inline-start" />
            {t('project.newAsset')}
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </>
  );
}

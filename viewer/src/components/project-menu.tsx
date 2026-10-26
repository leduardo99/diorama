import NiceModal from '@ebay/nice-modal-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { CopyIcon, Gamepad2Icon, MoreHorizontalIcon, PlusIcon, SignpostIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { copyText } from '@/lib/clipboard';
import { projectDir, projectUrl } from '@/lib/project-paths';
import { projectsQuery } from '@/lib/queries';
import { DeleteProjectModal } from '@/modals/delete-project-modal';
import { NewModal } from '@/modals/new-modal';
import { startTour } from './tour/tour-control';

/**
 * What can be done with the project in use: add an asset, export it, open its game (when it has `game/index.html`), copy
 * its path, take the tour of its page, delete it (to the trash, with Undo). Every project here is one of `projects/`.
 */
export function ProjectMenu({ project }: { project: string }) {
  const { data: projects } = useSuspenseQuery(projectsQuery);
  const meta = projects.find((p) => p.name === project);
  const { t } = useT();
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('projects.menu.label', { project })}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('projects.menu.tooltip')}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => void NiceModal.show(NewModal, { tab: 'new-asset', project })}>
            <PlusIcon />
            {t('projects.menu.newAsset')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void NiceModal.show(NewModal, { tab: 'export', project })}>
            <UploadIcon />
            {t('projects.menu.export')}
          </DropdownMenuItem>
          {meta?.hasGame && (
            // A page of its own, not a route of the viewer: a plain link, in a new tab.
            <DropdownMenuItem asChild>
              <a href={projectUrl(project, 'game/')} target="_blank" rel="noopener">
                <Gamepad2Icon />
                {t('projects.menu.openGame')}
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void copyText(projectDir(project), t('projects.menu.pathLabel'))}>
            <CopyIcon />
            {t('projects.menu.copyPath')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {/* Started once the menu is gone: the tour waits for it to close. */}
          <DropdownMenuItem onSelect={startTour}>
            <SignpostIcon />
            {t('tour.start')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onSelect={() => void NiceModal.show(DeleteProjectModal, { project })}>
            <Trash2Icon />
            {t('projects.menu.delete')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

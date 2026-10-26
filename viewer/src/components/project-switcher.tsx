import { useState } from 'react';
import NiceModal from '@ebay/nice-modal-react';
import { useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ChevronsUpDownIcon, FolderPlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useT } from '@/i18n';
import { APP_KEYS, isModalOpen, useWindowKeydown } from '@/lib/hotkeys';
import { projectsQuery } from '@/lib/queries';
import { SECTION_PATHS, type Section } from '@/lib/sections';
import { NewModal } from '@/modals/new-modal';

/** The project's initial on a small tile: what the switcher shows in place of a logo for each project. */
function ProjectTile({ name }: { name: string }) {
  return <span className="grid size-5 shrink-0 place-items-center rounded-sm bg-muted text-[0.625rem] font-medium uppercase">{name.charAt(0)}</span>;
}

/**
 * The project in use, and a searchable list to switch to another (⌘K): the way organisations are switched in most
 * web apps. Switching keeps the section the user is in (assets, playground, scenery...). The projects are the folders of
 * `projects/`, the user's own: a sample of `examples/` is listed once `npm run example` has copied it there.
 */
export function ProjectSwitcher({ project, section }: { project: string | undefined; section: Section }) {
  const { data: projects } = useSuspenseQuery(projectsQuery);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { t } = useT();

  useWindowKeydown((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === APP_KEYS.switchProject) {
      // A dialog, a menu or the tour keeps the page's keys: ⌘K does not open the switcher under it (it still closes it).
      if (!open && isModalOpen()) return;
      e.preventDefault();
      setOpen((now) => !now);
    }
  });

  const choose = (name: string) => {
    setOpen(false);
    if (name !== project) void navigate({ to: SECTION_PATHS[section], params: { project: name } });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" role="combobox" aria-expanded={open} aria-label={t('projects.switcher.label')} className="max-w-64 gap-2">
          {project ? <ProjectTile name={project} /> : null}
          <span className="truncate">{project ?? t('projects.switcher.choose')}</span>
          <ChevronsUpDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-0">
        <Command>
          <CommandInput placeholder={t('projects.switcher.searchPlaceholder')} aria-label={t('projects.switcher.searchLabel')} />
          <CommandList>
            <CommandEmpty>{t('projects.switcher.empty')}</CommandEmpty>
            <CommandGroup heading={t('projects.switcher.heading')}>
              {projects.map((p) => (
                <CommandItem key={p.name} value={p.name} data-checked={p.name === project} onSelect={() => choose(p.name)}>
                  <ProjectTile name={p.name} />
                  <span className="truncate">{p.name}</span>
                  <span className="ml-auto text-muted-foreground tabular-nums">{p.assetCount}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {/* Always listed: a search that finds nothing is often a project that does not exist yet. */}
              <CommandItem
                forceMount
                value={`${t('projects.switcher.new')} ${t('common.create')}`}
                onSelect={() => {
                  setOpen(false);
                  void NiceModal.show(NewModal, { tab: 'new-project' });
                }}
              >
                <FolderPlusIcon />
                {t('projects.switcher.new')}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="flex items-center gap-1 border-t px-2.5 py-1.5 text-muted-foreground">
          <Kbd>⌘K</Kbd> {t('projects.switcher.toggleHint')}
        </div>
      </PopoverContent>
    </Popover>
  );
}

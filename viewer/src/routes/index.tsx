import NiceModal from '@ebay/nice-modal-react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { FolderPlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Rich, useT } from '@/i18n';
import { projectsQuery } from '@/lib/queries';
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

function NoProjects() {
  const { t } = useT();
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon"><FolderPlusIcon /></EmptyMedia>
        <EmptyTitle>{t('projects.none.title')}</EmptyTitle>
        <EmptyDescription>
          <Rich id="projects.none.description" />
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => void NiceModal.show(NewModal, { tab: 'new-project' })}>{t('projects.none.create')}</Button>
      </EmptyContent>
    </Empty>
  );
}

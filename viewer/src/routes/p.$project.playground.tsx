import { createFileRoute } from '@tanstack/react-router';
import { PlaygroundView } from '@/components/playground/playground-view';
import { playgroundSearchSchema } from '@/lib/search';

export const Route = createFileRoute('/p/$project/playground')({
  validateSearch: playgroundSearchSchema,
  component: PlaygroundView,
});

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import type { Engine } from '@/lib/types';

const dot: Record<Engine, string> = {
  volume: 'bg-engine-volume',
  rig: 'bg-engine-rig',
};

/** The engine an asset is drawn with. Its name is the engine's id, the same in every language; the tooltip says what it is. */
export function EngineBadge({ engine }: { engine: Engine }) {
  const { t } = useT();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline">
          <span className={cn('size-1.5 rounded-xs', dot[engine])} />
          {engine}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t(`assets.engineHint.${engine}`)}</TooltipContent>
    </Tooltip>
  );
}

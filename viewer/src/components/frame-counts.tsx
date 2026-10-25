import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import type { AtlasInfo } from '@/lib/types';

/** "16f": the frames of one direction of an animation, said in full in a tooltip. */
export function FrameCount({ info, className }: { info: AtlasInfo; className?: string }) {
  const { t, plural } = useT();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{t('assets.card.frameCount', { count: info.frameCount })}</span>
      </TooltipTrigger>
      <TooltipContent>{info.facings > 1 ? plural('assets.card.framesPerDirection', info.frameCount) : plural('counts.frames', info.frameCount)}</TooltipContent>
    </Tooltip>
  );
}

/**
 * "16f · 8d" for an animation of 16 frames facing 8 directions, each part explained in a tooltip; nothing for stills and
 * sheets. The directions are the facings of its rows (`AtlasInfo.facings`): an interface piece's states, a wall's heights
 * and a scenery piece's variants are rows too, but not directions.
 */
export function FrameSummary({ info }: { info: AtlasInfo | null }) {
  const { t } = useT();
  if (!info || info.mode === 'sheet') return null;
  const frames = info.frameCount > 1;
  const directions = info.facings;
  if (!frames && directions < 2) return null;
  return (
    <span>
      {frames && <FrameCount info={info} />}
      {frames && directions > 1 && ' · '}
      {directions > 1 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{t('assets.card.directionCount', { count: directions })}</span>
          </TooltipTrigger>
          <TooltipContent>{t('assets.card.directionsHint', { count: directions })}</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

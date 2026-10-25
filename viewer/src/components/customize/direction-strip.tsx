import { useEffect, useRef } from 'react';
import type { OutfitCharacterInfo, Skin } from '@core/rig';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { DIRECTION_COUNT, directionLabel, paintFrame } from '@/lib/outfit/render';

/** Thumbnails are drawn at this fraction of the character's size. */
const THUMB_ZOOM = 0.5;
/** Pause between two thumbnails while playing: one direction at a time keeps the page responsive. */
const SWEEP_MS = 60;

interface Props {
  character: OutfitCharacterInfo;
  skin: Skin;
  clipKey: string;
  /** The frame the thumbnails show. While playing they follow it one direction at a time, a few times per second. */
  frame: number;
  playing: boolean;
  direction: number;
  onDirection: (index: number) => void;
}

/** The eight facings of the sheet, each one a click away from the big preview. */
export function DirectionStrip({ character, skin, clipKey, frame, playing, direction, onDirection }: Props) {
  const { t } = useT();
  const canvases = useRef<Array<HTMLCanvasElement | null>>([]);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  // While paused every change (a new frame included) repaints the eight once; while playing the sweep never stops.
  const repaint = playing ? 'playing' : frame;

  useEffect(() => {
    const scale = THUMB_ZOOM * (window.devicePixelRatio || 1);
    let next = 0;
    let painted = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sweep = () => {
      const canvas = canvases.current[next];
      if (canvas) paintFrame(canvas, character, skin, clipKey, frameRef.current, next, scale);
      next = (next + 1) % DIRECTION_COUNT;
      painted++;
      if (playing || painted < DIRECTION_COUNT) timer = setTimeout(sweep, playing ? SWEEP_MS : 0);
    };
    sweep();
    return () => clearTimeout(timer);
    // `repaint` stands for the frame while paused, so the effect does not restart on every frame while playing.
  }, [character, skin, clipKey, playing, repaint]);

  return (
    <div role="radiogroup" aria-label={t('details.inspector.direction')} className="flex gap-1 overflow-x-auto pb-1">
      {Array.from({ length: DIRECTION_COUNT }, (_, index) => (
        <button
          key={index}
          type="button"
          role="radio"
          aria-checked={index === direction}
          aria-label={directionLabel(index)}
          onClick={() => onDirection(index)}
          className={cn('checker pixelated relative shrink-0 rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring', index === direction ? 'ring-2 ring-primary' : 'hover:bg-accent/40')}
        >
          <canvas
            ref={(element) => { canvases.current[index] = element; }}
            style={{ width: character.width * THUMB_ZOOM, height: character.height * THUMB_ZOOM }}
          />
          <span className="absolute bottom-0.5 left-1 font-mono text-[0.625rem] text-muted-foreground">{directionLabel(index)}</span>
        </button>
      ))}
    </div>
  );
}

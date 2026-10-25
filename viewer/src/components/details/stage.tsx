import { useEffect, useRef } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { AssetFileMeta } from '@/lib/types';
import type { Player } from './use-player';
import type { Flight } from './vfx-section';

const backdrops = { checker: 'checker', dark: 'bg-background', light: 'bg-foreground' } as const;

/** Draws the current frame, scaled without smoothing, with the optional pivot and bounds overlays. */
export function Stage({ player, asset, highlight, ring = null, flight = null }: { player: Player; asset: AssetFileMeta; highlight: string | null; ring?: number | null; flight?: Flight | null }) {
  const { image, current, scale, stageRef, atlas, kind, showPivot, showBounds, backdrop, events, index, stepZoom } = player;
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flyingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !image || !current) return;
    if (canvas.width !== current.width) canvas.width = current.width;
    if (canvas.height !== current.height) canvas.height = current.height;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, current.x, current.y, current.width, current.height, 0, 0, current.width, current.height);
  }, [image, current]);

  // Wheel zooms the stage; the listener is native because React registers wheel handlers as passive.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stepZoom(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // A projectile flies at its own speed along its heading and starts again at its range: the wrapper is moved without rendering React.
  useEffect(() => {
    const wrapper = flyingRef.current;
    if (!wrapper || !flight) return;
    let raf = 0;
    const started = performance.now();
    const tilt = Math.sin((flight.tilt * Math.PI) / 180);
    const tick = (now: number) => {
      const distance = ((((now - started) / 1000) * flight.speed) % flight.range) * scale;
      wrapper.style.transform = `translate(${Math.cos(flight.heading) * distance}px, ${Math.sin(flight.heading) * tilt * distance}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      wrapper.style.transform = '';
    };
  }, [flight, scale]);

  const pivot = atlas?.meta.pivot;
  const hovered = highlight && atlas ? atlas.frames[highlight] : null;
  const currentEvents = events.get(index) ?? [];

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={stageRef} className={cn('absolute inset-0 flex', flight ? 'overflow-hidden' : 'overflow-auto', backdrops[backdrop])}>
        {player.failed && (
          <Alert variant="destructive" className="m-4 h-fit">
            <AlertDescription>{t('errors.loadFile', { url: asset.url })}</AlertDescription>
          </Alert>
        )}
        {current && (
          <div className="relative m-auto shrink-0" style={{ width: current.width * scale, height: current.height * scale }}>
            {ring !== null && pivot && (
              <div
                className="pointer-events-none absolute rounded-full border border-dashed border-primary/70"
                style={{ left: pivot.x * scale - ring * scale, top: pivot.y * scale - ring * scale, width: ring * 2 * scale, height: ring * 2 * scale }}
              />
            )}
            <div ref={flyingRef} className="absolute inset-0 will-change-transform">
            <canvas ref={canvasRef} className="pixelated block size-full" />
            </div>
            {showBounds && <div className="pointer-events-none absolute inset-0 outline-1 -outline-offset-1 outline-primary/80 outline-dashed" />}
            {showPivot && pivot && kind === 'animated' && (
              <>
                <div className="pointer-events-none absolute inset-y-0 w-px bg-primary/80" style={{ left: pivot.x * scale }} />
                <div className="pointer-events-none absolute inset-x-0 h-px bg-primary/80" style={{ top: pivot.y * scale }} />
                <div
                  className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary-foreground bg-primary"
                  style={{ left: pivot.x * scale, top: pivot.y * scale }}
                />
              </>
            )}
            {hovered && (
              <div
                className="pointer-events-none absolute border border-primary bg-primary/15"
                style={{ left: hovered.x * scale, top: hovered.y * scale, width: hovered.width * scale, height: hovered.height * scale }}
              />
            )}
          </div>
        )}
      </div>
      {player.atlasError && (
        <Alert className="absolute inset-x-3 top-3 w-auto">
          <AlertDescription>{player.atlasError.message}</AlertDescription>
        </Alert>
      )}
      {currentEvents.length > 0 && <Badge className="absolute bottom-3 left-3 font-mono">{currentEvents.join(' · ')}</Badge>}
      <Badge variant="secondary" className="absolute right-3 bottom-3 tabular-nums">
        {current ? `${current.width}×${current.height}` : ''} · {Math.round(scale * 100)}%
      </Badge>
    </div>
  );
}

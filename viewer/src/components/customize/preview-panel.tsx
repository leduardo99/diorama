import { useEffect, useMemo, useRef, useState } from 'react';
import type { GearCatalog, OutfitCharacterInfo, OutfitData, Skin } from '@core/rig';
import { GripVerticalIcon, PauseIcon, PlayIcon, SquareSplitHorizontalIcon, TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CompareSlider, CompareSliderAfter, CompareSliderBefore, CompareSliderHandle } from '@/components/ui/compare-slider';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { buildSkin, clipOf, directionLabel, framesOf, paintFrame } from '@/lib/outfit/render';
import { usePref } from '@/lib/use-pref';
import { DirectionStrip } from './direction-strip';

const ZOOMS = ['1', '2', '3'] as const;

interface Props {
  character: OutfitCharacterInfo;
  catalog: GearCatalog;
  outfit: OutfitData;
  /** The clips made for something the character does not hold now, with what they need: marked in the picker (the preview still plays them). */
  unusable?: ReadonlyMap<string, string>;
}

/**
 * The character as the export would draw it, live: one big frame that plays, and the eight facings. The engine draws
 * only when the outfit, the clip, the frame, the facing or the zoom change. "Compare" puts the character's own outfit
 * (as the kit saves it) under the edited one, split by a handle that is dragged or moved with the arrows; the saved one
 * is built and drawn only while the comparison is on.
 */
export function PreviewPanel({ character, catalog, outfit, unusable }: Props) {
  const { t, plural, number } = useT();
  // Building a skin is the engine's work: only an edit of the outfit redoes it, never a frame of the animation.
  const built = useMemo(() => buildSkin(outfit, catalog), [outfit, catalog]);
  // An outfit with problems cannot be built: the last one that could stays on screen, with the problems above it.
  const [lastGood, setLastGood] = useState<Skin | null>(null);
  useEffect(() => {
    // A skin is a function, which `setState` would call as an updater: wrap it.
    const good = built.skin;
    if (good) setLastGood(() => good);
  }, [built.skin]);
  const skin = built.skin ?? lastGood;

  const clipKeys = Object.keys(character.clips);
  const [clipKey, setClipKey] = useState(clipKeys.includes('idle') ? 'idle' : clipKeys[0]);
  const entry = character.clips[clipKey];
  const frames = framesOf(character, entry);
  const fps = frames / clipOf(entry).seconds;

  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [direction, setDirection] = useState(0);
  const [zoom, setZoom] = usePref<number>('customize.zoom', 2);
  const [drawError, setDrawError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [compare, setCompare] = useState(false);
  // Where the handle stands, in percent of the width: the left of it shows the saved outfit.
  const [compareShown, setCompareShown] = useState(50);
  // The outfit as saved: built once when the comparison is turned on (it never changes while the character is open).
  const savedSkin = useMemo(() => (compare ? buildSkin(character.outfit, catalog).skin : null), [compare, character.outfit, catalog]);
  const savedCanvas = useRef<HTMLCanvasElement>(null);

  // The clip's own clock: the frame advances at the exported fps, and the page redraws only when it changes.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let elapsed = (frame / fps) % (frames / fps);
    let last = performance.now();
    let shown = frame;
    const tick = (now: number) => {
      elapsed += Math.min(0.1, (now - last) / 1000);
      last = now;
      const next = Math.floor(elapsed * fps) % frames;
      if (next !== shown) {
        shown = next;
        setFrame(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Restarted only when the clip or the play state change; the frame it starts from is the one on screen.
  }, [playing, clipKey, fps, frames]);

  // `compare` is a dependency: turning it on or off puts a new canvas on the page, which must be drawn even while paused.
  useEffect(() => {
    if (!canvas.current || !skin) return;
    setDrawError(paintFrame(canvas.current, character, skin, clipKey, frame, direction, zoom * (window.devicePixelRatio || 1), t));
  }, [character, skin, clipKey, frame, direction, zoom, t, compare]);
  useEffect(() => {
    if (!savedCanvas.current || !savedSkin) return;
    paintFrame(savedCanvas.current, character, savedSkin, clipKey, frame, direction, zoom * (window.devicePixelRatio || 1), t);
  }, [character, savedSkin, clipKey, frame, direction, zoom, t]);
  const size = { width: character.width * zoom, height: character.height * zoom };
  const label = t('customize.preview.canvas', { character: character.label, direction: directionLabel(direction) });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Field orientation="horizontal" className="w-auto">
          <FieldLabel htmlFor="preview-clip">{t('customize.preview.clip')}</FieldLabel>
          <Select value={clipKey} onValueChange={(key) => { setClipKey(key); setFrame(0); }}>
            <SelectTrigger id="preview-clip" size="sm" className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {clipKeys.map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                    {unusable?.has(key) && <TriangleAlertIcon aria-label={t('customize.preview.madeFor', { needs: unusable.get(key) ?? '' })} className="text-amber-500" />}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Button variant="outline" size="sm" onClick={() => setPlaying((p) => !p)}>
          {playing ? <PauseIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
          {playing ? t('customize.preview.pause') : t('customize.preview.play')}
        </Button>
        <Field orientation="horizontal" className="w-auto">
          <FieldLabel id="preview-zoom">{t('customize.preview.zoom')}</FieldLabel>
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} aria-labelledby="preview-zoom" value={String(zoom)} onValueChange={(value) => value && setZoom(Number(value))}>
            {ZOOMS.map((z) => <ToggleGroupItem key={z} value={z}>{t('units.times', { value: z })}</ToggleGroupItem>)}
          </ToggleGroup>
        </Field>
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle variant="outline" size="sm" pressed={compare} onPressedChange={setCompare} disabled={!skin}>
              <SquareSplitHorizontalIcon data-icon="inline-start" />
              {t('customize.preview.compare')}
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>{t('customize.preview.compareHint')}</TooltipContent>
        </Tooltip>
        <span className="font-mono text-muted-foreground tabular-nums">{t('customize.preview.status', { direction: directionLabel(direction), frame, last: frames - 1, fps: number(fps, { maximumFractionDigits: 1 }) })}</span>
      </div>

      {built.problems.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>{plural('customize.preview.problems', built.problems.length)}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {built.problems.map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
            {skin && <p className="mt-1">{t('customize.preview.lastDrawable')}</p>}
          </AlertDescription>
        </Alert>
      )}
      {drawError && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>{t('customize.preview.drawFailed')}</AlertTitle>
          <AlertDescription className="font-mono">{drawError}</AlertDescription>
        </Alert>
      )}

      <div className="checker pixelated relative grid min-h-0 flex-1 place-items-center overflow-auto rounded-lg border p-4">
        {skin && compare ? (
          <>
            {/* The saved outfit on the left of the handle, the edited one on its right: Dice UI's "before" layer is the one
                shown right of the handle, so the edited canvas goes in it. */}
            <Badge variant="secondary" className="absolute top-2 left-2">{t('customize.preview.saved')}</Badge>
            <Badge variant="secondary" className="absolute top-2 right-2">{t('customize.preview.edited')}</Badge>
            <CompareSlider className="shrink-0" style={size} aria-label={t('customize.preview.compareSlider')} aria-valuetext={t('customize.preview.compareValue', { percent: Math.round(compareShown) })} onValueChange={setCompareShown} defaultValue={compareShown}>
              <CompareSliderBefore aria-hidden={false} aria-label={t('customize.preview.edited')}>
                <canvas ref={canvas} style={size} aria-label={label} />
              </CompareSliderBefore>
              <CompareSliderAfter aria-hidden={false} aria-label={t('customize.preview.saved')}>
                <canvas ref={savedCanvas} style={size} aria-label={label} />
              </CompareSliderAfter>
              {/* A thin line with its grip at the foot: the default round knob sits mid-height, over the character's head. */}
              <CompareSliderHandle>
                <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary" />
                <div className="absolute bottom-1 grid size-5 place-items-center rounded-full border bg-background text-muted-foreground">
                  <GripVerticalIcon className="size-3" />
                </div>
              </CompareSliderHandle>
            </CompareSlider>
          </>
        ) : skin ? (
          <canvas ref={canvas} style={size} aria-label={label} />
        ) : (
          <p className="text-muted-foreground">{t('customize.preview.fix')}</p>
        )}
      </div>

      <Field>
        <FieldLabel htmlFor="preview-frame">{t('customize.preview.frame')}</FieldLabel>
        <Slider
          id="preview-frame"
          min={0}
          max={frames - 1}
          step={1}
          value={[frame]}
          onValueChange={([next]) => { setPlaying(false); setFrame(next); }}
        />
      </Field>

      {skin && <DirectionStrip character={character} skin={skin} clipKey={clipKey} frame={frame} playing={playing} direction={direction} onDirection={setDirection} />}
    </div>
  );
}

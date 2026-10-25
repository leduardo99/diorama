import type { ReactNode } from 'react';
import { RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Rich, useT } from '@/i18n';
import { copyText } from '@/lib/clipboard';
import { COMPASS, eventsOf, type Atlas } from '@/lib/atlas';
import { projectFile } from '@/lib/project-paths';
import type { AssetFileMeta } from '@/lib/types';
import { ZOOMS, type Backdrop, type Player, type Zoom } from './use-player';

/**
 * A section of a right-hand panel. A fieldset is as wide as its widest line by default (`min-inline-size: min-content`),
 * so a long path would push the values out of the column: `min-w-0` keeps every line inside it, and a path that does not
 * fit ends in an ellipsis.
 */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <FieldSet className="min-w-0 gap-3 border-b p-4">
      <FieldLegend variant="label" className="mb-0 text-muted-foreground uppercase">{title}</FieldLegend>
      {children}
    </FieldSet>
  );
}

interface Props {
  player: Player;
  asset: AssetFileMeta;
  directionIndex: number;
  onDirection: (index: number) => void;
  onHighlight: (frame: string | null) => void;
  /** Sections that come before the playback ones: what the asset is (an effect's kind, reach and speed). */
  top?: ReactNode;
}

/** Whether every row is named by a compass point: the compass can pick them; sixteen facings, or numbered ones, are picked by a slider. */
const onCompass = (directions: string[]) => directions.every((name) => COMPASS.flat().includes(name));

export function Inspector({ player, asset, directionIndex, onDirection, onHighlight, top }: Props) {
  const { atlas, kind, directions, frames, fps, atlasFps, fpsOverride, setFpsOverride, index, seek } = player;
  const { t, number } = useT();
  const eventList = eventsOf(atlas);
  const sheetFrames = kind === 'sheet' && atlas ? Object.entries(atlas.frames) : [];

  return (
    <div className="h-full min-h-0 overflow-y-auto border-l bg-card/40">
      {top}
      {kind === 'animated' && frames.length > 1 && (
        <Section title={t('details.inspector.playback')}>
          <Field>
            <FieldLabel htmlFor="details-fps">{t('details.inspector.fps')}</FieldLabel>
            <div className="flex items-center gap-3">
              <Slider min={1} max={60} step={1} value={[Math.round(fps)]} aria-label={t('details.inspector.fps')} onValueChange={([value]) => setFpsOverride(value)} />
              <Input
                id="details-fps"
                type="number"
                min={1}
                max={60}
                className="w-16 font-mono"
                value={Math.round(fps * 10) / 10}
                onChange={(e) => setFpsOverride(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              />
              <Button variant="ghost" size="icon" aria-label={t('details.inspector.resetFps')} disabled={fpsOverride === null} onClick={() => setFpsOverride(null)}>
                <RotateCcwIcon />
              </Button>
            </div>
            {fpsOverride !== null && <FieldDescription>{t('details.inspector.atlasFps', { fps: number(atlasFps, { maximumFractionDigits: 2 }) })}</FieldDescription>}
          </Field>
        </Section>
      )}

      {directions.length > 1 && !onCompass(directions) && (
        <Section title={t('details.inspector.direction')}>
          <Slider min={0} max={directions.length - 1} step={1} value={[Math.min(directionIndex, directions.length - 1)]} aria-label={t('details.inspector.direction')} onValueChange={([value]) => onDirection(value)} />
          <FieldDescription>
            <Rich
              id="details.inspector.directionSlider"
              vars={{ name: directions[Math.min(directionIndex, directions.length - 1)], index: Math.min(directionIndex, directions.length - 1) + 1, total: directions.length }}
            />
          </FieldDescription>
        </Section>
      )}

      {directions.length > 1 && onCompass(directions) && (
        <Section title={t('details.inspector.direction')}>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label={t('details.inspector.direction')}
            value={String(directionIndex)}
            onValueChange={(value) => value && onDirection(Number(value))}
            className="grid w-fit grid-cols-3 gap-1 self-center"
          >
            {COMPASS.flat().map((name, i) => {
              // The middle of the compass stays empty: the highlighted point already names the direction.
              if (!name) return <span key={i} aria-hidden />;
              const at = directions.indexOf(name);
              return (
                <ToggleGroupItem key={name} value={at < 0 ? `missing-${name}` : String(at)} disabled={at < 0} className="w-11 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground" title={at < 0 ? t('details.inspector.directionMissing', { name }) : `${name} · ${at + 1}`}>
                  {name}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
          <FieldDescription>
            <Rich id="details.inspector.compassHint" vars={{ count: directions.length }} />
          </FieldDescription>
        </Section>
      )}

      <Section title={t('details.inspector.view')}>
        <Field orientation="horizontal">
          <FieldTitle id="details-zoom-label">{t('details.inspector.zoom')}</FieldTitle>
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} aria-labelledby="details-zoom-label" value={String(player.zoom)} onValueChange={(value) => value && player.setZoom((value === 'fit' ? 'fit' : Number(value)) as Zoom)}>
            <ToggleGroupItem value="fit">{t('details.inspector.fit')}</ToggleGroupItem>
            {ZOOMS.map((z) => <ToggleGroupItem key={z} value={String(z)}>{t('units.times', { value: z })}</ToggleGroupItem>)}
          </ToggleGroup>
        </Field>
        <Field orientation="horizontal">
          <FieldTitle id="details-backdrop-label">{t('details.inspector.background')}</FieldTitle>
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} aria-labelledby="details-backdrop-label" value={player.backdrop} onValueChange={(value) => value && player.setBackdrop(value as Backdrop)}>
            <ToggleGroupItem value="checker">{t('details.inspector.checker')}</ToggleGroupItem>
            <ToggleGroupItem value="dark">{t('details.inspector.dark')}</ToggleGroupItem>
            <ToggleGroupItem value="light">{t('details.inspector.light')}</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field orientation="horizontal">
          <Switch id="details-pivot" checked={player.showPivot} disabled={!atlas?.meta.pivot} onCheckedChange={player.setShowPivot} />
          <FieldLabel htmlFor="details-pivot">{t('details.inspector.pivot')} <Kbd>P</Kbd></FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Switch id="details-bounds" checked={player.showBounds} onCheckedChange={player.setShowBounds} />
          <FieldLabel htmlFor="details-bounds">{t('details.inspector.frameEdges')} <Kbd>G</Kbd></FieldLabel>
        </Field>
      </Section>

      {kind === 'animated' && (
        <Section title={`${t('details.inspector.events')}${eventList.length ? ` · ${eventList.length}` : ''}`}>
          {eventList.length > 0 ? (
            <ul className="flex max-h-56 flex-col gap-0.5 overflow-auto">
              {eventList.map((event, i) => (
                <li key={`${event.frame}-${event.name}-${i}`}>
                  <Button variant={event.frame === index ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start" onClick={() => seek(event.frame)}>
                    <span className="text-muted-foreground tabular-nums">{String(event.frame).padStart(2, '0')}</span>
                    {event.name}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <FieldDescription>{t('details.inspector.noEvents')}</FieldDescription>
          )}
        </Section>
      )}

      {sheetFrames.length > 0 && (
        <Section title={`${t('details.inspector.frames')} · ${sheetFrames.length}`}>
          <ul className="flex max-h-56 flex-col gap-0.5 overflow-auto">
            {sheetFrames.map(([name, rect]) => (
              <li key={name}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between"
                  onMouseEnter={() => onHighlight(name)}
                  onMouseLeave={() => onHighlight(null)}
                  onFocus={() => onHighlight(name)}
                  onBlur={() => onHighlight(null)}
                >
                  <span className="truncate">{name}</span>
                  <span className="text-muted-foreground tabular-nums">{rect.width}×{rect.height}</span>
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t('details.inspector.data')}>
        <Info atlas={atlas} asset={asset} frameCount={frames.length} />
      </Section>
    </div>
  );
}

function Info({ atlas, asset, frameCount }: { atlas: Atlas | undefined; asset: AssetFileMeta; frameCount: number }) {
  const { t, number, date } = useT();
  const meta = atlas?.meta;
  const exportedPath = projectFile(asset.project, `assets/${asset.subpath}`);
  const sheetPath = asset.sheet ? projectFile(asset.project, `sheets/${asset.sheet}`) : null;
  // A piece's clip sheet names its clip with an object (frames, fps, from, to): show its name. JSON can hold null there.
  const written = meta?.data?.clip;
  const clip = typeof written === 'object' && written !== null ? written.name : written;
  const rows: Array<[string, string | undefined]> = [
    [t('details.data.sheet'), meta?.width && meta.height ? `${meta.width}×${meta.height}` : asset.width && asset.height ? `${asset.width}×${asset.height}` : undefined],
    [t('details.data.frame'), meta?.frameWidth ? `${meta.frameWidth}×${meta.frameHeight}` : undefined],
    [t('details.data.frames'), meta?.frameCount ? (meta.directions?.length ? t('details.data.framesWithDirections', { frames: meta.frameCount, directions: meta.directions.length }) : String(meta.frameCount)) : frameCount > 1 ? String(frameCount) : undefined],
    [t('details.data.scale'), meta?.scale ? t('units.times', { value: number(meta.scale) }) : undefined],
    [t('details.data.fps'), meta?.fps ? number(meta.fps, { maximumFractionDigits: 2 }) : undefined],
    [t('details.data.duration'), meta?.data?.seconds ? t('units.seconds', { value: number(meta.data.seconds, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }) : undefined],
    [t('details.data.pivot'), meta?.pivot ? `${number(meta.pivot.x, { maximumFractionDigits: 2 })}, ${number(meta.pivot.y, { maximumFractionDigits: 2 })}` : undefined],
    [t('details.data.speed'), meta?.data?.groundSpeed ? t('units.worldPerSecond', { value: number(meta.data.groundSpeed, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : undefined],
    [t('details.data.skeleton'), meta?.data?.skeleton],
    [t('details.data.clip'), clip],
    [t('details.data.loop'), meta?.data?.loop === undefined ? undefined : meta.data.loop ? t('common.yes') : t('common.no')],
    [t('details.data.modified'), date(asset.mtime)],
  ];
  return (
    <>
      <dl className="flex flex-col gap-1.5">
        {rows.filter((r): r is [string, string] => r[1] !== undefined).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{key}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {/* A path is cut to the column; its title shows it whole on hover (it is data, so a plain title, as on the compass). */}
      <div className="flex flex-col gap-1">
        <Button variant="outline" size="sm" className="justify-start font-mono" title={exportedPath} onClick={() => void copyText(exportedPath, t('details.data.filePathLabel'))}>
          <span className="truncate">{exportedPath}</span>
        </Button>
        {sheetPath && (
          <Button variant="outline" size="sm" className="justify-start font-mono" title={sheetPath} onClick={() => void copyText(sheetPath, t('details.data.sheetPathLabel'))}>
            <span className="truncate">{sheetPath}</span>
          </Button>
        )}
      </div>
    </>
  );
}

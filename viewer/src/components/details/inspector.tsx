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
import { axisLabel, framesLabel, keyedAxis, rowWith, stepLabel, type SheetRows } from '@/lib/rows';
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

/** Whether every facing is named by a compass point: the compass can pick them; sixteen facings, or numbered ones, are picked by a slider. */
const onCompass = (facings: string[]) => facings.every((name) => COMPASS.flat().includes(name));

/**
 * The rows of a sheet are picked by what they are (`lib/rows.ts`): its facings with the compass (or a slider), and a
 * scenery clip's variants, a wall's heights or an interface piece's states with a control named after them. `directionIndex`
 * is the row shown.
 */
export function Inspector({ player, asset, directionIndex, onDirection, onHighlight, top }: Props) {
  const { atlas, kind, rows, frames, fps, atlasFps, fpsOverride, setFpsOverride, index, seek } = player;
  const { t, number } = useT();
  const row = Math.min(directionIndex, Math.max(0, rows.rows.length - 1));
  const { facing, step } = rows.rows[row] ?? { facing: 0, step: 0 };
  const { facings, axis, steps } = rows;
  const keyed = keyedAxis(rows);
  const eventList = eventsOf(atlas);
  const sheetFrames = kind === 'sheet' && atlas ? Object.entries(atlas.frames) : [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-card/40">
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

      {facings.length > 1 && !onCompass(facings) && (
        <Section title={t('details.inspector.direction')}>
          <Slider min={0} max={facings.length - 1} step={1} value={[facing]} aria-label={t('details.inspector.direction')} onValueChange={([value]) => onDirection(rowWith(rows, row, { facing: value }))} />
          <FieldDescription>
            <Rich id="details.inspector.directionSlider" vars={{ name: facings[facing], index: facing + 1, total: facings.length }} />
          </FieldDescription>
        </Section>
      )}

      {facings.length > 1 && onCompass(facings) && (
        <Section title={t('details.inspector.direction')}>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label={t('details.inspector.direction')}
            value={String(facing)}
            onValueChange={(value) => value && onDirection(rowWith(rows, row, { facing: Number(value) }))}
            className="grid w-fit grid-cols-3 gap-1 self-center"
          >
            {COMPASS.flat().map((name, i) => {
              // The middle of the compass stays empty: the highlighted point already names the direction.
              if (!name) return <span key={i} aria-hidden />;
              const at = facings.indexOf(name);
              return (
                <ToggleGroupItem key={name} value={at < 0 ? `missing-${name}` : String(at)} disabled={at < 0} className="w-11 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground" title={at < 0 ? t('details.inspector.directionMissing', { name }) : `${name} · ${at + 1}`}>
                  {name}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
          <FieldDescription>
            <Rich id="details.inspector.compassHint" vars={{ count: facings.length }} />
          </FieldDescription>
        </Section>
      )}

      {axis && steps.length > 1 && (
        <Section title={axisLabel(t, axis)}>
          {/* A variant has no name in a clip sheet: its number is the button, "Variation 2" its label. The row shown is marked as the compass marks it. */}
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            aria-label={axisLabel(t, axis)}
            value={String(step)}
            onValueChange={(value) => value && onDirection(rowWith(rows, row, { step: Number(value) }))}
            className="w-fit flex-wrap"
          >
            {steps.map((_, i) => (
              <ToggleGroupItem key={i} value={String(i)} aria-label={stepLabel(t, rows, i)} className="min-w-9 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                {axis === 'variant' ? i + 1 : stepLabel(t, rows, i)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription>
            <span className="text-foreground">{stepLabel(t, rows, step)}</span>
            {keyed === 'step' && <> · <Rich id="details.rows.keysHint" vars={{ count: steps.length }} /></>}
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
        <Info atlas={atlas} asset={asset} rows={rows} frameCount={frames.length} />
      </Section>
    </div>
  );
}

function Info({ atlas, asset, rows, frameCount }: { atlas: Atlas | undefined; asset: AssetFileMeta; rows: SheetRows; frameCount: number }) {
  const { t, number, date } = useT();
  const meta = atlas?.meta;
  const exportedPath = projectFile(asset.project, `assets/${asset.subpath}`);
  const sheetPath = asset.sheet ? projectFile(asset.project, `sheets/${asset.sheet}`) : null;
  // A piece's clip sheet names its clip with an object (frames, fps, from, to): show its name. JSON can hold null there.
  const written = meta?.data?.clip;
  const clip = typeof written === 'object' && written !== null ? written.name : written;
  const lines: Array<[string, string | undefined]> = [
    [t('details.data.sheet'), meta?.width && meta.height ? `${meta.width}×${meta.height}` : asset.width && asset.height ? `${asset.width}×${asset.height}` : undefined],
    [t('details.data.frame'), meta?.frameWidth ? `${meta.frameWidth}×${meta.frameHeight}` : undefined],
    // Directions only when the rows are facings, as the asset cards count them; a clip's variants and a wall's heights are counted as what they are.
    [t('details.data.frames'), meta?.frameCount ? framesLabel(t, rows, meta.frameCount) : frameCount > 1 ? String(frameCount) : undefined],
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
        {lines.filter((r): r is [string, string] => r[1] !== undefined).map(([key, value]) => (
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

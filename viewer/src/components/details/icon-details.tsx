import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ColorSwatch } from '@/components/ui/color-swatch';
import { Field, FieldDescription, FieldTitle } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { roleOf } from '@/lib/asset-role';
import { clipFrames, type Atlas, type Insets, type Rect } from '@/lib/atlas';
import { atlasQuery } from '@/lib/queries';
import type { AssetFileMeta } from '@/lib/types';
import { usePref } from '@/lib/use-pref';
import { cn } from '@/lib/utils';
import { DetailsColumns } from './details-shell';
import { Section } from './inspector';
import { useSheet } from './use-sheet';

const COLUMNS = 8;
const ROWS = 5;
const ZOOMS = [1, 2, 3, 4] as const;

const sheetUrl = (asset: AssetFileMeta) => `${asset.url}?t=${asset.mtime}`;

/** The project's slot sheet (`kind: 'slot'`, nine-slice with `states` and `content`): what a framed inventory draws its slots with. */
interface Frame {
  url: string;
  sheet: { width: number; height: number };
  /** Exported px per logical px of the sheet. */
  scale: number;
  /** The margin round the well (logical px): where the icon goes. */
  content: Insets;
  rect: (state: 'empty' | 'hover' | 'selected') => Rect | undefined;
}

const slotSheetOf = (assets: AssetFileMeta[]) => {
  const slots = assets.filter((a) => roleOf(a) === 'ui' && a.atlasInfo?.kind === 'slot');
  return slots.find((a) => /inventor/i.test(a.subpath)) ?? slots[0] ?? null;
};

/** What the slot sheet says about itself; null when it does not tell where the icon goes (`data.content`). */
function frameOf(asset: AssetFileMeta, atlas: Atlas | undefined): Frame | null {
  const data = atlas?.meta.data;
  if (!atlas || !data?.content || !atlas.meta.width || !atlas.meta.height) return null;
  const states = data.states ?? ['empty'];
  const rects = (name: string) => clipFrames(atlas, 'default', Math.max(0, states.indexOf(name)))[0];
  return {
    url: `${asset.url}?t=${asset.mtime}`,
    sheet: { width: atlas.meta.width, height: atlas.meta.height },
    scale: atlas.meta.scale ?? 1,
    content: data.content,
    rect: (state) => (states.includes(state) ? rects(state) : state === 'empty' ? rects('empty') : undefined),
  };
}

/** A state of the slot sheet as a background: the frame cut from the sheet, scaled with hard edges. */
const layerOf = (frame: Frame, state: 'empty' | 'hover' | 'selected', zoom: number) => {
  const rect = frame.rect(state);
  if (!rect) return undefined;
  return { backgroundImage: `url(${frame.url})`, backgroundSize: `${frame.sheet.width * zoom}px ${frame.sheet.height * zoom}px`, backgroundPosition: `${-rect.x * zoom}px ${-rect.y * zoom}px`, backgroundRepeat: 'no-repeat', imageRendering: 'pixelated' as const };
};

interface SlotProps {
  asset: AssetFileMeta | null;
  selected: boolean;
  /** The slot's size on the screen, px. */
  box: { width: number; height: number };
  zoom: number;
  /** The project's slot art; without it a plain box stands in. */
  frame: Frame | null;
  onSelect: (asset: AssetFileMeta) => void;
}

/** One slot of the inventory: its icon (centred in the slot's `content` box when the project has slot art), the rarity's color round it and, for what stacks, how many. */
function Slot({ asset, selected, box, zoom, frame, onSelect }: SlotProps) {
  const { t } = useT();
  const info = asset?.atlasInfo;
  const color = info?.rarity?.color;
  const stack = info?.stack ?? 1;
  const { content } = frame ?? { content: { left: 0, top: 0, right: 0, bottom: 0 } };
  const well = frame
    ? { left: content.left * frame.scale * zoom, top: content.top * frame.scale * zoom, right: content.right * frame.scale * zoom, bottom: content.bottom * frame.scale * zoom }
    : { left: 0, top: 0, right: 0, bottom: 0 };
  const slot = (
    <button
      type="button"
      disabled={!asset}
      aria-label={asset ? (info?.label ?? asset.subpath) : t('details.icon.emptySlot')}
      aria-pressed={selected}
      onClick={() => asset && onSelect(asset)}
      className={cn('group relative block focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none enabled:cursor-pointer', !frame && 'rounded-xs bg-black/40 ring-1 ring-foreground/10 enabled:hover:bg-black/20', !frame && selected && 'ring-2 ring-primary')}
      style={{ width: box.width, height: box.height, ...(frame ? { ...layerOf(frame, 'empty', zoom) } : {}) }}
    >
      {frame && asset && <span aria-hidden className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100" style={layerOf(frame, 'hover', zoom)} />}
      {frame && selected && <span aria-hidden className="pointer-events-none absolute inset-0" style={layerOf(frame, 'selected', zoom)} />}
      {asset && (
        <span className="absolute grid place-items-center" style={{ left: well.left, top: well.top, right: well.right, bottom: well.bottom, ...(color ? { boxShadow: `inset 0 0 0 2px ${color}` } : {}) }}>
          <img src={sheetUrl(asset)} alt="" draggable={false} className="pixelated size-full object-contain" />
          {stack > 1 && <span className="pointer-events-none absolute right-0.5 bottom-0 font-mono text-[0.6875rem] leading-none text-white tabular-nums [text-shadow:1px_1px_0_#000,-1px_1px_0_#000,1px_-1px_0_#000,-1px_-1px_0_#000]">{stack}</span>}
        </span>
      )}
    </button>
  );
  if (!asset) return slot;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{slot}</TooltipTrigger>
      <TooltipContent>
        {info?.label ?? asset.subpath}
        {info?.rarity && <span className="block text-background/70">{info.rarity.label}{info.kind ? ` · ${info.kind}` : ''}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * An item icon the way a game shows it: in an inventory grid, among the project's other icons, each slot ringed in its
 * rarity's color and numbered by its stack. The sheet says what the item is (`meta.data.item`); the icon's own art already
 * carries the rarity in its frame, so the ring in the grid is the slot's, not the icon's. When the project has a slot sheet
 * the slots are drawn with it (its states: empty, hover, selected) and each icon sits in the box its `content` margins leave.
 */
export function IconDetails({ asset, projectAssets, onSelect }: { asset: AssetFileMeta; projectAssets: AssetFileMeta[]; onSelect: (asset: AssetFileMeta) => void }) {
  const { atlas, atlasError, image, failed } = useSheet(asset);
  const { t, plural } = useT();
  const [zoom, setZoom] = usePref<number>('details.icon.zoom', 1);
  const item = atlas?.meta.data?.item;
  const icons = useMemo(() => projectAssets.filter((a) => roleOf(a) === 'icon'), [projectAssets]);
  // The inventory starts at the chosen icon and goes on through the project's others; what is left over is empty slots.
  const slots = useMemo(() => {
    const at = Math.max(0, icons.findIndex((a) => a.subpath === asset.subpath));
    const ordered = [...icons.slice(at), ...icons.slice(0, at)].slice(0, COLUMNS * ROWS);
    return Array.from({ length: COLUMNS * ROWS }, (_, i) => ordered[i] ?? null);
  }, [icons, asset.subpath]);
  const rarities = useMemo(() => {
    const seen = new Map<string, { id: string; label: string; color: string }>();
    for (const a of icons) if (a.atlasInfo?.rarity) seen.set(a.atlasInfo.rarity.id, a.atlasInfo.rarity);
    return [...seen.values()];
  }, [icons]);
  // The project's slot art, when it has some and says where the icon goes.
  const slotAsset = useMemo(() => slotSheetOf(projectAssets), [projectAssets]);
  const slotAtlas = useQuery({ ...atlasQuery(slotAsset ?? asset), enabled: slotAsset !== null }).data;
  const frame = useMemo(() => (slotAsset ? frameOf(slotAsset, slotAtlas) : null), [slotAsset, slotAtlas]);
  const emptyRect = frame?.rect('empty');
  // The icon's own size in exported px, so the slot is as big as the art (or as big as the slot sheet's frame).
  const base = atlas?.meta.frameWidth ?? image?.naturalWidth ?? 64;
  const box = frame && emptyRect ? { width: emptyRect.width * zoom, height: emptyRect.height * zoom } : { width: base * zoom, height: base * zoom };

  return (
    <DetailsColumns
      stage={
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-6">
            {(failed || atlasError) && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{failed ? t('errors.loadFile', { url: asset.url }) : atlasError?.message}</AlertDescription>
              </Alert>
            )}
            <div role="group" aria-label={t('details.icon.inventory')} className="mx-auto grid w-fit gap-1.5 rounded-md bg-card/60 p-3 ring-1 ring-foreground/10" style={{ gridTemplateColumns: `repeat(${COLUMNS}, ${box.width}px)` }}>
              {slots.map((slot, i) => <Slot key={slot?.subpath ?? `empty-${i}`} asset={slot} selected={slot?.subpath === asset.subpath} box={box} zoom={zoom} frame={frame && emptyRect ? frame : null} onSelect={onSelect} />)}
            </div>
          </div>
          <div className="flex items-center gap-3 border-t px-4 py-2.5">
            <Field orientation="horizontal" className="w-auto">
              <FieldTitle id="details-icon-zoom">{t('details.icon.zoom')}</FieldTitle>
              <ToggleGroup type="single" variant="outline" size="sm" spacing={0} aria-labelledby="details-icon-zoom" value={String(zoom)} onValueChange={(value) => value && setZoom(Number(value))}>
                {ZOOMS.map((z) => <ToggleGroupItem key={z} value={String(z)}>{t('units.times', { value: z })}</ToggleGroupItem>)}
              </ToggleGroup>
            </Field>
            <span className="ml-auto text-muted-foreground tabular-nums">{frame && slotAsset ? `${t('details.icon.slotsOf', { name: slotAsset.atlasInfo?.label ?? slotAsset.subpath })} · ` : ''}{plural('details.icon.count', icons.length)}</span>
          </div>
        </section>
      }
      inspector={
        <div className="min-h-0 flex-1 overflow-y-auto bg-card/40">
          <Section title={t('details.icon.item')}>
            {item ? (
              <>
                <div className="flex items-start gap-3">
                  <img src={sheetUrl(asset)} alt="" draggable={false} className="pixelated size-16 shrink-0 object-contain" />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-medium">{item.label}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="gap-1.5">
                        <ColorSwatch size="xs" color={item.rarityColor} aria-hidden />
                        {item.rarityLabel ?? item.rarity}
                      </Badge>
                      <Badge variant="secondary">{item.kind}</Badge>
                    </div>
                  </div>
                </div>
                {item.description && <FieldDescription>{item.description}</FieldDescription>}
                <dl className="flex flex-col gap-1.5">
                  {[
                    [t('details.icon.id'), item.id],
                    [t('details.icon.stack'), item.stack !== undefined ? t('details.icon.perSlot', { count: item.stack }) : undefined],
                    [t('details.icon.rarityColor'), item.rarityColor],
                    [t('details.icon.gearPart'), item.gear],
                    [t('details.icon.icon'), atlas?.meta.frameWidth ? t('units.px', { value: `${atlas.meta.frameWidth}×${atlas.meta.frameHeight}` }) : undefined],
                  ].filter((row): row is [string, string] => row[1] !== undefined).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{key}</dt>
                      <dd className="text-right font-mono">{value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <FieldDescription>{t('details.icon.noDescription')}</FieldDescription>
            )}
          </Section>
          {rarities.length > 0 && (
            <Section title={t('details.icon.rarities')}>
              <ul className="flex flex-col gap-1.5">
                {rarities.map((rarity) => (
                  <li key={rarity.id} className="flex items-center gap-2">
                    <ColorSwatch size="xs" color={rarity.color} aria-hidden />
                    <span>{rarity.label}</span>
                    <span className="ml-auto font-mono text-muted-foreground">{rarity.color}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      }
    />
  );
}

import { useMemo, useState } from 'react';
import { ArrowUpRightIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/i18n';
import type { EffectMeta } from '@/lib/atlas';
import { effectKind, roleOf } from '@/lib/asset-role';
import { basename, stripExtension } from '@/lib/format';
import type { AssetFileMeta } from '@/lib/types';
import { usePref } from '@/lib/use-pref';
import { Section } from './inspector';
import type { Player } from './use-player';

/** A projectile flying across the stage at its own speed: `speed` and `range` in exported px (at the sheet's scale), `heading` a screen angle. */
export interface Flight {
  speed: number;
  range: number;
  heading: number;
  /** The camera's tilt in degrees: the depth part of the flight shrinks by its sine, as a character's walk does. */
  tilt: number;
}

/** The camera tilt assumed for an effect sheet, which does not carry one. */
const TILT = 48;

/** What the Details window of an effect adds to the player: its reach as a ring, and for a projectile its flight. */
export function useVfx(player: Player, directionIndex: number) {
  const { atlas } = player;
  const effect: EffectMeta | null = atlas?.meta.data?.role === 'vfx' ? (atlas.meta.data.effect ?? null) : null;
  const [ring, setRing] = usePref<boolean>('details.vfx.ring', true);
  const [flying, setFlying] = useState(false);
  const scale = atlas?.meta.scale ?? 1;
  const speed = effect?.travel?.speed;
  const range = effect?.travel?.range;
  const heading = atlas?.meta.directionFacings?.[directionIndex] ?? Math.PI / 2;
  // Memoized by its numbers: the player renders at every frame of the effect, and a new object each time would restart the flight.
  const flight = useMemo<Flight | null>(() => (flying && speed !== undefined ? { speed: speed * scale, range: (range ?? 150) * scale, heading, tilt: TILT } : null), [flying, speed, range, scale, heading]);
  return { effect, ring, setRing, flying, setFlying, ringRadius: ring && effect ? effect.size * scale : null, flight };
}

export type Vfx = ReturnType<typeof useVfx>;

/** What an effect sheet says about the effect: kind, layer, reach, speed, what follows it; and the toggles of the Details window. */
export function VfxSection({ vfx, projectAssets, onSelect }: { vfx: Vfx; projectAssets: AssetFileMeta[]; onSelect: (asset: AssetFileMeta) => void }) {
  const { effect } = vfx;
  const { t, number } = useT();
  if (!effect) return null;
  const followed = effect.follows ? projectAssets.find((a) => roleOf(a) === 'vfx' && basename(stripExtension(a.subpath)) === effect.follows) : undefined;
  const rows: Array<[string, string | undefined]> = [
    [t('details.vfx.layer'), effect.layer === 'ground' ? t('details.vfx.layerGround') : t('details.vfx.layerAir')],
    [t('details.vfx.floor'), t('units.world', { value: number(effect.height) })],
    [t('details.vfx.reach'), t('units.world', { value: number(effect.size) })],
    [t('details.data.loop'), effect.loop ? t('common.yes') : t('common.no')],
    [t('details.vfx.speed'), effect.travel ? t('units.worldPerSecond', { value: number(effect.travel.speed) }) : undefined],
    [t('details.vfx.maxDistance'), effect.travel ? (effect.travel.range !== undefined ? t('units.world', { value: number(effect.travel.range) }) : undefined) : undefined],
  ];
  return (
    <Section title={t('details.vfx.title')}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{effectKind(effect.kind, t)}</Badge>
        {effect.label && <span className="truncate font-medium">{effect.label}</span>}
      </div>
      <dl className="flex flex-col gap-1.5">
        {rows.filter((r): r is [string, string] => r[1] !== undefined).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{key}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {effect.follows && (
        <Button variant="outline" size="sm" className="justify-between" disabled={!followed} onClick={() => followed && onSelect(followed)}>
          <span className="truncate">{t('details.vfx.then', { name: effect.follows })}</span>
          <ArrowUpRightIcon data-icon="inline-end" />
        </Button>
      )}
      <Field orientation="horizontal">
        <Switch id="details-vfx-ring" checked={vfx.ring} onCheckedChange={vfx.setRing} />
        <FieldLabel htmlFor="details-vfx-ring">{t('details.vfx.ring')}</FieldLabel>
      </Field>
      {effect.travel && (
        <Field orientation="horizontal">
          <Switch id="details-vfx-flight" checked={vfx.flying} onCheckedChange={vfx.setFlying} />
          <FieldLabel htmlFor="details-vfx-flight">{t('details.vfx.simulate')}</FieldLabel>
        </Field>
      )}
      {vfx.flying && effect.travel && <FieldDescription>{t('details.vfx.flightNote', { speed: t('units.worldPerSecond', { value: number(effect.travel.speed) }) })}</FieldDescription>}
    </Section>
  );
}

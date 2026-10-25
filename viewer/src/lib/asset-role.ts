import type { TFn } from '../i18n/core';
import { groupLabel } from './outfit/labels';
import { basename, dirname, stripExtension } from './format';
import type { AssetFileMeta } from './types';

/** What an exported sheet is, as the viewer sorts it: its atlas says (`meta.data.role`), anything else is "other". */
export const roleIds = ['character', 'gear', 'scenery', 'prop', 'vfx', 'icon', 'ui', 'other'] as const;
export type RoleId = (typeof roleIds)[number];

/** The roles a scenery kit's sheets carry: floor tiles, walls, fences, decals, and whole scenes. */
const SCENERY_ROLES = new Set(['tile', 'wall', 'fence', 'decal', 'scene']);

export function roleOf(asset: AssetFileMeta): RoleId {
  const role = asset.atlasInfo?.role;
  if (role === 'character' || role === 'gear' || role === 'prop' || role === 'vfx' || role === 'icon' || role === 'ui') return role;
  return role && SCENERY_ROLES.has(role) ? 'scenery' : 'other';
}

export const isRoleId = (value: string): value is RoleId => (roleIds as readonly string[]).includes(value);

/** The name shown for an asset: a gear item's own label ("Elmo"), otherwise its file name. */
export const assetTitle = (asset: AssetFileMeta) => asset.atlasInfo?.label ?? basename(stripExtension(asset.subpath));

/**
 * The name people read for a character's sheet, the one every surface shows ("Ossuary Guard"): its manifest's label, or its
 * id for an atlas exported before labels. Null for any other sheet.
 */
export const characterLabel = (asset: AssetFileMeta): string | null => asset.atlasInfo?.character?.label ?? null;

/**
 * The name the Details window carries. A character's clip is titled by its character, not by the clip: its label
 * (`characterLabel`), as its group card is, or for an older sheet without a manifest the folder its clips live in
 * ("captain" for characters/captain/idle.png). Anything else carries its own title, its label or else its file name, even a
 * scenery piece whose folder holds other animated sheets.
 */
export function detailsTitle(asset: AssetFileMeta): string {
  const folder = dirname(asset.subpath);
  return characterLabel(asset) ?? (roleOf(asset) === 'character' && folder ? basename(folder) : assetTitle(asset));
}

/** The group of a gear item ("Head"), or null for anything else. */
export const gearGroup = (asset: AssetFileMeta, t: TFn) => (roleOf(asset) === 'gear' && asset.atlasInfo?.group ? groupLabel(t, asset.atlasInfo.group) : null);

/** The kinds of effect the interface has words for (`details.vfx.kinds`). */
const EFFECT_KINDS = ['projectile', 'impact', 'cast', 'aura', 'area', 'burst', 'trail'] as const;
const isEffectKind = (kind: string): kind is (typeof EFFECT_KINDS)[number] => (EFFECT_KINDS as readonly string[]).includes(kind);

/** An effect's kind in the language of the screen ("Projectile"); a kind the interface has no word for is shown as the atlas writes it. */
export const effectKind = (kind: string, t: TFn) => (isEffectKind(kind) ? t(`details.vfx.kinds.${kind}`) : kind);

/** What more an asset is, for a badge: a gear item's group ("Head"), an effect's kind in words, an item's or interface piece's kind. */
export function roleDetail(asset: AssetFileMeta, t: TFn): string | null {
  const role = roleOf(asset);
  const kind = asset.atlasInfo?.kind ?? null;
  if (role === 'gear') return gearGroup(asset, t);
  if (role === 'vfx') return kind && effectKind(kind, t);
  if (role === 'icon' || role === 'ui') return kind;
  return null;
}

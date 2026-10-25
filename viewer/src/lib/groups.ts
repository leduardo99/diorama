import { characterLabel } from './asset-role';
import { basename, dirname } from './format';
import type { AssetFileMeta, AtlasInfo } from './types';

/** The clips of one character, shown as one entry. */
export interface AssetGroup {
  id: string;
  /** The name people read: the character's label, or its folder's name for an older sheet without a manifest. */
  name: string;
  folder: string;
  /** The character's manifest, its id and label; null for older sheets without one. */
  character: AtlasInfo['character'];
  assets: AssetFileMeta[];
}

export type AssetEntry = { type: 'asset'; asset: AssetFileMeta } | { type: 'group'; group: AssetGroup };

/**
 * The character a sheet is a clip of, as the runtime groups them (`packages/runtime/src/library.ts`): its manifest in its
 * folder, or for an older character sheet without a manifest its folder alone. Null for anything else: only a character's
 * clips are one thing. A scenery folder's animated sheets (a door's `--closing`, a candle's `--flicker`), effects, item icons
 * and interface pieces are each an asset of their own, whatever else their folder holds.
 */
function characterKey({ subpath, atlasInfo }: AssetFileMeta): string | null {
  const folder = dirname(subpath);
  if (!folder || !atlasInfo || (atlasInfo.mode !== 'strip' && atlasInfo.mode !== 'directions')) return null;
  if (atlasInfo.character) return `${folder}|${atlasInfo.character.name}`;
  return atlasInfo.role === 'character' ? `${folder}|` : null;
}

/** Idle first, then alphabetical: the order animations are shown in. */
function byClip(a: AssetFileMeta, b: AssetFileMeta) {
  const rank = (asset: AssetFileMeta) => (basename(asset.subpath).startsWith('idle') ? 0 : 1);
  return rank(a) - rank(b) || a.subpath.localeCompare(b.subpath, undefined, { numeric: true });
}

/** The project's characters by `characterKey`, each with its clips. A character with a single clip is one too. */
function charactersOf(assets: AssetFileMeta[]): Map<string, AssetGroup> {
  const groups = new Map<string, AssetGroup>();
  for (const asset of assets) {
    const key = characterKey(asset);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) group.assets.push(asset);
    else groups.set(key, { id: key, name: '', folder: dirname(asset.subpath), character: null, assets: [asset] });
  }
  for (const group of groups.values()) {
    group.assets.sort(byClip);
    const [first] = group.assets;
    group.character = first.atlasInfo?.character ?? null;
    group.name = characterLabel(first) ?? basename(group.folder);
  }
  return groups;
}

/** The other animations of the same character, or just the asset itself when it is not a character's. */
export function clipsOf(allAssets: AssetFileMeta[], asset: AssetFileMeta): AssetFileMeta[] {
  const key = characterKey(asset);
  return (key !== null && charactersOf(allAssets).get(key)?.assets) || [asset];
}

/**
 * Collapses a character's clips into one entry, placed where the first of them was.
 * `all` is the whole project: filters may hide some clips, but the group must stay complete.
 */
export function groupAnimations(visible: AssetFileMeta[], all: AssetFileMeta[]): AssetEntry[] {
  const groups = charactersOf(all);
  const placed = new Set<string>();
  const entries: AssetEntry[] = [];
  for (const asset of visible) {
    const key = characterKey(asset);
    const group = key === null ? undefined : groups.get(key);
    if (!group) {
      entries.push({ type: 'asset', asset });
    } else if (!placed.has(group.id)) {
      placed.add(group.id);
      entries.push({ type: 'group', group });
    }
  }
  return entries;
}

export const entryKey = (entry: AssetEntry) => (entry.type === 'asset' ? entry.asset.subpath : `group:${entry.group.id}`);

/** The entry an asset is shown in: its own, or its character's. */
export const entryOf = (entries: AssetEntry[], asset: AssetFileMeta): AssetEntry | undefined =>
  entries.find((entry) => (entry.type === 'asset' ? entry.asset.subpath === asset.subpath : entry.group.assets.some((a) => a.subpath === asset.subpath)));

/** What opens when an entry is clicked: the asset itself, or the first animation of a group. */
export const entryCover = (entry: AssetEntry): AssetFileMeta => (entry.type === 'asset' ? entry.asset : entry.group.assets[0]);

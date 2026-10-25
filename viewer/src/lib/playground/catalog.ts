import { basename, dirname, stripExtension } from '../format';
import type { Translator } from '../../i18n/core';
import type { AssetFileMeta } from '../types';
import type { Armed, Character, Library } from './library';

/** Everything the palette can offer, flattened so it can be searched, grouped and virtualized. */
export type EntryKind = 'character' | 'animated' | 'still';
export type KindFilter = 'all' | 'character' | 'object';

/** What an entry says under its name, as numbers: `entrySubtitle` turns it into words in the language of the screen. */
export type EntryDetail = { type: 'character'; clips: number } | { type: 'sprite'; frames: number; facings: number };

export interface Entry {
  key: string;
  kind: EntryKind;
  name: string;
  /** The folder the entry is listed under; `ROOT` for the top of the project. */
  group: string;
  detail: EntryDetail;
  cover: AssetFileMeta;
  armed: Armed;
}

/** A header is the block of recent entries (`recent`, which has no label of its own) or one folder (its path, `ROOT` for none). */
export type Row =
  | { type: 'header'; key: string; kind: 'recent' | 'folder'; label: string; count: number; collapsed: boolean }
  | { type: 'entry'; key: string; entry: Entry };

/** The group of an entry at the top of the project, which the list names in the language of the screen. */
export const ROOT = '';

/** "3 animations", "8 frames · 8 directions": the line under an entry's name. */
export function entrySubtitle(detail: EntryDetail, { plural, t }: Pick<Translator, 'plural' | 't'>): string {
  if (detail.type === 'character') return plural('assets.card.animations', detail.clips);
  return [detail.frames > 1 ? plural('playground.entry.frames', detail.frames) : t('playground.entry.still'), detail.facings > 1 ? t('playground.entry.directions', { count: detail.facings }) : ''].filter(Boolean).join(' · ');
}

/**
 * The clip that pictures a character: its idle, else its first move or action, else whatever clip it has. While its atlases
 * load, a character can be its hit or death clip alone for a moment (the runtime binds neither as an action), and the scene
 * starts it the same way.
 */
export const coverClip = (character: Character) => character.idle ?? character.locomotion[0] ?? character.actions[0] ?? character.clips[0];

export function listEntries(library: Library): Entry[] {
  const characters = library.characters.map<Entry>((character) => {
    const first = coverClip(character);
    return {
      key: `character:${character.id}`,
      kind: 'character',
      name: character.name,
      group: dirname(character.folder) || ROOT,
      detail: { type: 'character', clips: character.clips.length },
      cover: first.asset,
      armed: { key: `character:${character.id}`, type: 'character', character },
    };
  });
  const sprites = library.sprites.map<Entry>((sprite) => {
    const { atlas, frameCount, asset } = sprite.clip;
    const facings = atlas.meta.directions?.length ?? 0;
    return {
      key: `sprite:${sprite.id}`,
      kind: frameCount > 1 ? 'animated' : 'still',
      name: atlas.meta.data?.label ?? basename(stripExtension(asset.subpath)),
      group: dirname(asset.subpath) || ROOT,
      detail: { type: 'sprite', frames: frameCount, facings },
      cover: asset,
      armed: { key: `sprite:${sprite.id}`, type: 'sprite', clip: sprite.clip, row: 0 },
    };
  });
  return [...characters, ...sprites];
}

/** Every word of the query must appear in "group/name". */
export function matches(entry: Entry, query: string): boolean {
  const haystack = `${entry.group}/${entry.name}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

const inFilter = (entry: Entry, filter: KindFilter) =>
  filter === 'all' || (filter === 'character' ? entry.kind === 'character' : entry.kind !== 'character');

interface RowOptions {
  query: string;
  filter: KindFilter;
  collapsed: ReadonlySet<string>;
  /** Entry keys, newest first. */
  recent: readonly string[];
}

/** Flat rows: a block of recent entries, then one header per folder followed by its entries. */
export function buildRows(entries: Entry[], { query, filter, collapsed, recent }: RowOptions): Row[] {
  const searching = query.trim() !== '';
  const visible = entries.filter((e) => inFilter(e, filter) && matches(e, query));
  const rows: Row[] = [];

  if (!searching) {
    const recents = recent.map((key) => visible.find((e) => e.key === key)).filter((e): e is Entry => e !== undefined);
    if (recents.length > 0) {
      rows.push({ type: 'header', key: 'recent', kind: 'recent', label: '', count: recents.length, collapsed: false });
      for (const entry of recents) rows.push({ type: 'entry', key: `recent|${entry.key}`, entry });
    }
  }

  const groups = new Map<string, Entry[]>();
  for (const entry of visible) groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  for (const [group, members] of [...groups].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
    // A search opens every folder: collapsing only helps when browsing.
    const isCollapsed = !searching && collapsed.has(group);
    rows.push({ type: 'header', key: `group|${group}`, kind: 'folder', label: group, count: members.length, collapsed: isCollapsed });
    if (isCollapsed) continue;
    for (const entry of members.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
      rows.push({ type: 'entry', key: entry.key, entry });
    }
  }
  return rows;
}

export const RECENT_LIMIT = 6;

/** The scene the playground plays: the one a link names when the project has it, else the one chosen last time, else none. */
export const sceneToPlay = (scenes: readonly string[], linked: string | undefined, remembered: string): string =>
  linked !== undefined && scenes.includes(linked) ? linked : scenes.includes(remembered) ? remembered : '';

/** Puts a key first, drops repeats and keeps the list short. */
export function pushRecent(recent: readonly string[], key: string): string[] {
  return [key, ...recent.filter((k) => k !== key)].slice(0, RECENT_LIMIT);
}

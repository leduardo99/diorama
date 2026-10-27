import { SPACE_PRESETS, type SpacePresetName } from '@core/volume';
import type { Translator } from '../i18n/core';

/**
 * The kinds of game a new project can start from: the engine's space presets (core/volume/space.ts), in its order, so a
 * preset the engine adds shows up in the New dialog. `new-project --genre` writes the chosen one to `src/space.ts`.
 */
export const GENRES = Object.keys(SPACE_PRESETS) as SpacePresetName[];

/** A new project that has not chosen yet: no `--genre`, so no `src/space.ts`. */
export const GENRE_LATER = 'later';

/** The default height of a standing character, in world units (`new-project --character`, tools/cli.ts). */
export const DEFAULT_CHARACTER = '80';

/** What a preset sets, said in the reader's language: each size against the character's height, and where walls stand. */
export function genreSizes(name: SpacePresetName, { t, number }: Pick<Translator, 't' | 'number'>): string {
  const { ratios, walls } = SPACE_PRESETS[name];
  const ratio = (value: number) => number(value, { maximumFractionDigits: 2 });
  return t('modals.new.genreSizes', {
    cell: ratio(ratios.cell),
    wall: ratio(ratios.wall),
    door: ratio(ratios.door),
    fence: ratio(ratios.fence),
    placement: t(walls === 'border' ? 'modals.new.wallsBorder' : 'modals.new.wallsCenter'),
  });
}

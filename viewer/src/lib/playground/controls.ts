import type { Key, TFn } from '../../i18n/core';
import { capsFor, keyLabel } from '../shortcuts';
import { PLAYGROUND_KEYS } from './keys';
import type { Character } from './library';

/**
 * The keys the Playground's palette shows (`components/playground/palette.tsx`), drawn from the shortcut lists
 * (`lib/shortcuts.ts`), so the palette and the shortcuts window show the same caps (⇧, not "Shift"; the arrows beside
 * W A S D) and say the keys that are words the same way ("Botão direito"). What the palette adds is the character's
 * own: the clip each key plays.
 */

const row = (what: Key) => capsFor('playground', what);

export interface ControlRow {
  /** The caps, as the shortcuts window writes them: `keyLabel` says a word key ('space') in the language of the screen. */
  keys: readonly string[];
  /** What the key does for this character: the clip it plays ("walk", "slash"), or what it does in the words of the screen. */
  label: string;
  /** The clip's kind, shown beside its name when it says more ("slash" is an attack). */
  kind?: string;
}

/**
 * The controlled character's keys, in the order of the shortcuts window's "Controlled character" list: move (W A S D and
 * the arrows, which play its first gait), run (⇧, its last gait, when it has more than one), its actions (Space for the
 * first, then 2 to 9: `actionIndexOf`), hit (H), death (K), restart (R, when there is a death or a held pose to come back
 * from) and use (E). [ and ] are in the picker's label, beside the character they change.
 */
export function controlRows(character: Pick<Character, 'locomotion' | 'actions' | 'hit' | 'death'>, t: TFn): ControlRow[] {
  const { locomotion, actions, hit, death } = character;
  const [space] = row('modals.shortcuts.playground.actions');
  const rows: ControlRow[] = [
    { keys: row('modals.shortcuts.playground.move'), label: locomotion[0]?.key ?? t('playground.controls.move'), kind: locomotion[0]?.kind },
  ];
  const run = locomotion.length > 1 ? locomotion.at(-1) : undefined;
  if (run) rows.push({ keys: row('modals.shortcuts.playground.run'), label: run.key, kind: run.kind });
  // Space and 1 both play the first action; past the ninth, an action has no key.
  actions.slice(0, PLAYGROUND_KEYS.actions.length).forEach((action, i) => rows.push({ keys: [i === 0 ? space : PLAYGROUND_KEYS.actions[i]], label: action.key, kind: action.kind }));
  if (hit) rows.push({ keys: row('modals.shortcuts.playground.hit'), label: hit.key, kind: hit.kind });
  if (death) rows.push({ keys: row('modals.shortcuts.playground.death'), label: death.key, kind: death.kind });
  if (death || actions.some((action) => action.hold)) rows.push({ keys: row('modals.shortcuts.playground.reset'), label: t('playground.controls.restart') });
  rows.push({ keys: row('modals.shortcuts.playground.use'), label: t('playground.controls.use') });
  return rows;
}

/** The caps of [ and ], which step through the characters to control: the picker shows them in its label. */
export const switchCaps = () => row('modals.shortcuts.playground.switchCharacter');

/** The keys the palette's "Place in the scene" hint names, as the window's Scene list writes them (`playground.palette.placeHint`). */
export function placeHintVars(t: TFn) {
  return {
    rightButton: keyLabel(t, row('modals.shortcuts.playground.rightButton')[0]),
    remove: row('modals.shortcuts.playground.remove')[0],
    escape: row('modals.shortcuts.playground.escape')[0],
    search: row('modals.shortcuts.search')[0],
  };
}

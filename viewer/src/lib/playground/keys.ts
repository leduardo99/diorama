/**
 * The keys the Playground answers to, by what they do, as `KeyboardEvent.key` names them (a letter in lower case,
 * whatever Shift does to it: `keyOf`). The scene (`scene.tsx`) and the page (`playground-view.tsx`) read their keys
 * here, and `tests/viewer/shortcuts.test.ts` checks that the shortcut list (`lib/shortcuts.ts`) shows each one.
 */
export const PLAYGROUND_KEYS = {
  // The controlled character.
  move: ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
  /** Held while moving: the last gait. */
  run: ['Shift'],
  firstAction: [' '],
  /** The actions in order, read by `actionIndexOf`. */
  actions: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
  hit: ['h'],
  death: ['k'],
  reset: ['r'],
  use: ['e'],
  // The scene and the page.
  remove: ['Delete', 'Backspace'],
  escape: ['Escape'],
  switchCharacter: ['[', ']'],
  search: ['/'],
} as const satisfies Record<string, readonly string[]>;

export type PlaygroundCommand = keyof typeof PLAYGROUND_KEYS;

/** True when the key (as `keyOf` reads it) does that. */
export const isKey = (command: PlaygroundCommand, key: string) => (PLAYGROUND_KEYS[command] as readonly string[]).includes(key);

/** The palette's search field (`placement-list.tsx`): ↑ ↓ go through the list, Enter arms the item, Esc clears the search and then leaves the field. */
export const SEARCH_KEYS = { previous: 'ArrowUp', next: 'ArrowDown', arm: 'Enter', clear: 'Escape' } as const;

/** A key as the scene reads it: a letter in lower case whatever Shift does to it, any other key by its name. */
export const keyOf = (e: Pick<KeyboardEvent, 'key'>) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);

/**
 * The action a key plays (0 for Space and 1), or null. The digit row is read by its place (`e.code`), so ⇧ (running)
 * still plays an action where it types "!"; the number pad by what it types.
 */
export function actionIndexOf(e: Pick<KeyboardEvent, 'key' | 'code'>): number | null {
  if (isKey('firstAction', e.key)) return 0;
  const digit = /^Digit([1-9])$/.exec(e.code)?.[1] ?? e.key;
  const index = (PLAYGROUND_KEYS.actions as readonly string[]).indexOf(digit);
  return index < 0 ? null : index;
}

/**
 * The keys the Playground answers to, by what they do, as `KeyboardEvent.key` names them (a letter in lower case,
 * whatever Shift does to it: `keyOf`). The scene (`scene.tsx`) and the page (`playground-view.tsx`) read their keys
 * here, and `tests/viewer/shortcuts.test.ts` checks that the shortcut list (`lib/shortcuts.ts`) shows each one.
 */

/** Where each move key takes the controlled character, [dx, dy] on the screen: WASD and the arrows. */
const MOVES: Readonly<Record<string, readonly [dx: number, dy: number]>> = {
  w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0],
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};

export const PLAYGROUND_KEYS = {
  // The controlled character.
  /** Held, each takes the character its way (`MOVES`, read by `inputOf`). */
  move: Object.keys(MOVES),
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
 * What the keys held (as `keyOf` reads them) ask of the controlled character: the way it goes, each axis -1, 0 or 1 (a
 * letter and its arrow held together do not add up), and whether it runs.
 */
export function inputOf(held: ReadonlySet<string>): { dx: number; dy: number; run: boolean } {
  const toward = (dx: number, dy: number) => Object.entries(MOVES).some(([key, [x, y]]) => x === dx && y === dy && held.has(key));
  return {
    dx: Number(toward(1, 0)) - Number(toward(-1, 0)),
    dy: Number(toward(0, 1)) - Number(toward(0, -1)),
    run: PLAYGROUND_KEYS.run.some((key) => held.has(key)),
  };
}

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

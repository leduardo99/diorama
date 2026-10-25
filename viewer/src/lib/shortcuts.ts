import type { Key, TFn } from '../i18n/core';
import type { Section } from './sections';
import { TOOLS, TOOL_KEYS } from './scenery/labels';

/**
 * The shortcut lists: the shortcuts window (`modals/shortcuts-modal.tsx`) shows them, and the painter's keyboard
 * popover (`components/scenery/scene-toolbar.tsx`) shows the Scenery tab's. A key added to a handler gets a row here:
 * `tests/viewer/shortcuts.test.ts` checks every key the handlers read (`lib/hotkeys.ts`, `lib/playground/keys.ts`,
 * `lib/scenery/keys.ts`) against these lists. The keys are the same in every language, apart from the ones that are
 * words (`WORD_KEYS`). ⌘ stands for "⌘ or Ctrl" wherever the handler takes both.
 */

/** One row: the keys, side by side, and what they do. */
export interface Shortcut {
  keys: readonly string[];
  what: Key;
}

/** A titled list of rows. */
export interface ShortcutSection {
  title: Key;
  items: readonly Shortcut[];
}

/** The keys that are words, said in the interface's language (`keys.*`). Every other key is shown as it is written (⇧, Esc, Tab, Ctrl). */
export const WORD_KEYS = ['space', 'rightButton'] as const;
type WordKey = (typeof WORD_KEYS)[number];
const isWordKey = (key: string): key is WordKey => (WORD_KEYS as readonly string[]).includes(key);

/** The text of a key's cap. */
export const keyLabel = (t: TFn, key: string) => (isWordKey(key) ? t(`keys.${key}`) : key);

/**
 * The caps of the row of a tab that does `what`: a page that shows some of its keys itself (the Playground's palette)
 * shows them as the window does. A row that is not there is a mistake in the code, not something to show.
 */
export function capsFor(tab: Section, what: Key): readonly string[] {
  const row = SHORTCUTS[tab].flatMap((list) => list.items).find((item) => item.what === what);
  if (!row) throw new Error(`No shortcut row does ${what} in the ${tab} tab`);
  return row.keys;
}

/** The keys of every page, over the tabs. */
export const ANYWHERE: ShortcutSection = {
  title: 'modals.shortcuts.anywhere',
  items: [
    { keys: ['N'], what: 'modals.shortcuts.newThing' },
    { keys: ['⌘', 'K'], what: 'modals.shortcuts.switchProject' },
    { keys: ['?'], what: 'modals.shortcuts.help' },
  ],
};

/** One tab per section of a project, in the project bar's order. The window opens on the section the user is in. */
export const SHORTCUT_TABS: readonly Section[] = ['assets', 'playground', 'customize', 'scenery'];

/** Undo and redo, as Customize and the painter read them (`historyCommand`). */
const history = (undo: Key, redo: Key): Shortcut[] => [
  { keys: ['⌘', 'Z'], what: undo },
  { keys: ['⇧', '⌘', 'Z'], what: redo },
  { keys: ['Ctrl', 'Y'], what: redo },
];

export const SHORTCUTS: Readonly<Record<Section, readonly ShortcutSection[]>> = {
  assets: [
    {
      title: 'modals.shortcuts.list',
      items: [
        { keys: ['/'], what: 'modals.shortcuts.search' },
        { keys: ['↑', '↓', '←', '→'], what: 'modals.shortcuts.moveSelection' },
        { keys: ['Home', 'End'], what: 'modals.shortcuts.firstLast' },
        { keys: ['↵'], what: 'modals.shortcuts.openDetails' },
        { keys: ['⌫'], what: 'modals.shortcuts.delete' },
        { keys: ['Esc'], what: 'modals.shortcuts.clear' },
      ],
    },
    {
      title: 'modals.shortcuts.details',
      items: [
        { keys: ['space'], what: 'modals.shortcuts.playPause' },
        { keys: ['←', '→'], what: 'modals.shortcuts.frame' },
        { keys: ['↑', '↓', '1–8'], what: 'modals.shortcuts.direction' },
        // A character's clips, else the list the window was opened from (`lib/groups.ts: peersOf`).
        { keys: ['[', ']'], what: 'modals.shortcuts.animationOrAsset' },
        { keys: ['+', '−', '0'], what: 'modals.shortcuts.zoom' },
        { keys: ['B'], what: 'modals.shortcuts.background' },
        { keys: ['P', 'G'], what: 'modals.shortcuts.guides' },
      ],
    },
  ],
  playground: [
    {
      title: 'modals.shortcuts.character',
      items: [
        // W A S D over the arrows: the caps wrap after four.
        { keys: ['W', 'A', 'S', 'D', '↑', '←', '↓', '→'], what: 'modals.shortcuts.playground.move' },
        { keys: ['⇧'], what: 'modals.shortcuts.playground.run' },
        { keys: ['space', '1–9'], what: 'modals.shortcuts.playground.actions' },
        { keys: ['H'], what: 'modals.shortcuts.playground.hit' },
        { keys: ['K'], what: 'modals.shortcuts.playground.death' },
        { keys: ['R'], what: 'modals.shortcuts.playground.reset' },
        { keys: ['E'], what: 'modals.shortcuts.playground.use' },
        { keys: ['[', ']'], what: 'modals.shortcuts.playground.switchCharacter' },
      ],
    },
    {
      title: 'modals.shortcuts.scene',
      items: [
        { keys: ['/'], what: 'modals.shortcuts.search' },
        { keys: ['↑', '↓', '↵'], what: 'modals.shortcuts.playground.searchList' },
        { keys: ['⌫'], what: 'modals.shortcuts.playground.remove' },
        { keys: ['Esc'], what: 'modals.shortcuts.playground.escape' },
        { keys: ['rightButton'], what: 'modals.shortcuts.playground.rightButton' },
      ],
    },
  ],
  customize: [{ title: 'modals.shortcuts.edit', items: history('customize.undo', 'customize.redo') }],
  scenery: [
    // Built from the tools, so a new tool or a key bound again shows up by itself.
    { title: 'scenery.toolsLabel', items: TOOLS.map((tool) => ({ keys: [TOOL_KEYS[tool]], what: `scenery.tools.${tool}` as const })) },
    {
      title: 'modals.shortcuts.edit',
      items: [
        ...history('scenery.toolbar.keys.undo', 'scenery.toolbar.keys.redo'),
        { keys: ['R'], what: 'scenery.toolbar.keys.rotate' },
        { keys: ['⌫'], what: 'scenery.toolbar.keys.delete' },
        { keys: ['⌘', 'D'], what: 'scenery.toolbar.keys.duplicate' },
        { keys: ['←', '↑', '→', '↓'], what: 'scenery.toolbar.keys.nudge' },
        { keys: ['Esc'], what: 'scenery.toolbar.keys.escape' },
      ],
    },
    {
      title: 'modals.shortcuts.view',
      items: [
        { keys: ['G'], what: 'scenery.toolbar.keys.grid' },
        { keys: ['Tab'], what: 'scenery.toolbar.keys.tab' },
        { keys: ['−', '+'], what: 'scenery.toolbar.keys.zoom' },
        { keys: ['0'], what: 'scenery.toolbar.keys.fit' },
        { keys: ['space'], what: 'scenery.toolbar.keys.pan' },
      ],
    },
    {
      title: 'modals.shortcuts.mouse',
      items: [
        { keys: ['⇧'], what: 'scenery.toolbar.keys.shift' },
        { keys: ['⌥'], what: 'scenery.toolbar.keys.alt' },
        { keys: ['rightButton'], what: 'scenery.toolbar.rightButtonDoes' },
      ],
    },
  ],
};

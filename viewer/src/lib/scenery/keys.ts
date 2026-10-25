import { TOOL_KEYS, type Tool } from './labels';

/**
 * The painter's keys without ⌘ or Ctrl, by what they do, as `KeyboardEvent.key` names them in lower case. The tools'
 * are `TOOL_KEYS`, undo and redo `historyCommand` (`lib/hotkeys.ts`). The painter (`scenery-view.tsx`) and its canvas
 * (`scene-canvas.tsx`, space held) read them here, and `tests/viewer/shortcuts.test.ts` checks that the shortcut list
 * (`lib/shortcuts.ts`) shows each one.
 */
export const PAINTER_KEYS = {
  /** ⇧ turns the other way. */
  rotate: ['r'],
  remove: ['delete', 'backspace'],
  escape: ['escape'],
  grid: ['g'],
  zoomIn: ['=', '+'],
  zoomOut: ['-'],
  fit: ['0'],
  panel: ['tab'],
  /** Held, the main button drags the view. */
  pan: [' '],
} as const satisfies Record<string, readonly string[]>;

export type PainterCommand = keyof typeof PAINTER_KEYS;

/** True when the key, in lower case, does that. */
export const isPainterKey = (command: PainterCommand, key: string) => (PAINTER_KEYS[command] as readonly string[]).includes(key);

/** Open dialogs, menus and lists own the keyboard; the popovers do not (the selection's stays open while the painter is used). */
const OPEN_LAYER = '[role="dialog"]:not([data-slot="popover-content"]), [role="alertdialog"], [role="menu"], [role="listbox"]';

/**
 * True while a dialog (the shortcuts window, a save), a menu or a list is open: it owns the keyboard, and neither the
 * painter's keys (`scenery-view.tsx`) nor Space held to pan (`scene-canvas.tsx`) act, so Space presses the dialog's button.
 */
export const isLayerOpen = () => document.querySelector(OPEN_LAYER) !== null;

/** With ⌘ or Ctrl: D duplicates the selected prop. */
export const PAINTER_COMMAND_KEYS = { duplicate: 'd' } as const;

/** The arrows nudge the selection a cell. */
export const NUDGE_KEYS: Readonly<Record<string, readonly [number, number]>> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };

/** The tool a key (in lower case) arms. */
export const TOOL_OF_KEY = Object.fromEntries(Object.entries(TOOL_KEYS).map(([tool, key]) => [key.toLowerCase(), tool])) as Readonly<Record<string, Tool>>;

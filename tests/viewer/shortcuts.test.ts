import assert from 'node:assert/strict';
import { createTranslator, stringsOf } from '../../viewer/src/i18n/core';
import { APP_KEYS, historyCommand } from '../../viewer/src/lib/hotkeys';
import { controlRows, placeHintVars, switchCaps } from '../../viewer/src/lib/playground/controls';
import { actionIndexOf, inputOf, keyOf, PLAYGROUND_KEYS, SEARCH_KEYS } from '../../viewer/src/lib/playground/keys';
import { NUDGE_KEYS, PAINTER_COMMAND_KEYS, PAINTER_KEYS, TOOL_OF_KEY } from '../../viewer/src/lib/scenery/keys';
import { TOOLS, TOOL_KEYS } from '../../viewer/src/lib/scenery/labels';
import { SECTION_PATHS, sectionOf } from '../../viewer/src/lib/sections';
import { ANYWHERE, capsFor, keyLabel, SHORTCUT_TABS, SHORTCUTS, WORD_KEYS, type Shortcut, type ShortcutSection } from '../../viewer/src/lib/shortcuts';

console.log('🧪 Checking the shortcut lists (one tab per section, every key the handlers read is listed, both languages)...\n');

const rowsOf = (lists: readonly ShortcutSection[]): Shortcut[] => lists.flatMap((list) => list.items);
const capsOf = (lists: readonly ShortcutSection[]) => new Set(rowsOf(lists).flatMap((row) => row.keys));
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((key, i) => key === b[i]);

/** The cap a key the handlers read (`KeyboardEvent.key`) is shown with. */
const GLYPHS: Record<string, string> = {
  arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', shift: '⇧', ' ': 'space', delete: '⌫', backspace: '⌫',
  escape: 'Esc', enter: '↵', tab: 'Tab', '=': '+', '-': '−',
};
const capOf = (key: string) => GLYPHS[key.toLowerCase()] ?? key.toUpperCase();

/**
 * The caps of a key with ⌘ or Ctrl, as the lists show it: ⌘ stands for both wherever the handler takes both, Ctrl is
 * written when only Ctrl works. Shift comes first, as in ⇧⌘Z.
 */
function chordOf(event: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }, command: (e: typeof event) => unknown): string[] {
  const asCommand = { ...event, ctrlKey: false, metaKey: true };
  const modifier = event.metaKey || command(asCommand) === command(event) ? '⌘' : 'Ctrl';
  return [...(event.shiftKey ? ['⇧'] : []), modifier, capOf(event.key)];
}

/** Every chord with ⌘ or Ctrl the handler answers to, with what it does; Shift only where it changes what the key does. */
function chordsOf<C>(command: (e: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => C | null) {
  const found: Array<{ caps: string[]; does: C }> = [];
  for (const key of 'abcdefghijklmnopqrstuvwxyz0123456789') {
    for (const meta of [false, true]) {
      for (const ctrl of [false, true]) {
        if (meta === ctrl) continue;
        for (const shift of [false, true]) {
          const event = { key, metaKey: meta, ctrlKey: ctrl, shiftKey: shift };
          const does = command(event);
          if (does === null || (shift && command({ ...event, shiftKey: false }) === does)) continue;
          const caps = chordOf(event, command);
          if (!found.some((chord) => same(chord.caps, caps))) found.push({ caps, does });
        }
      }
    }
  }
  return found;
}

// 1. One tab per section of a project, in the project bar's order (SECTION_PATHS, routes/p.$project.tsx), and the window
//    opens on the tab of the section the user is in: Customize has its own.
assert.deepEqual(SHORTCUT_TABS, Object.keys(SECTION_PATHS), 'the tabs follow the project bar');
assert.deepEqual(Object.keys(SHORTCUTS).sort(), [...SHORTCUT_TABS].sort(), 'every tab has its lists');
for (const [path, tab] of [['/p/x', 'assets'], ['/p/x/playground', 'playground'], ['/p/x/customize', 'customize'], ['/p/x/scenery', 'scenery'], ['/', 'assets']] as const) {
  assert.equal(sectionOf(path), tab, `${path} opens the ${tab} tab`);
  assert.ok(SHORTCUT_TABS.includes(sectionOf(path)));
}

// 2. The keys of every page (routes/__root.tsx, project-switcher.tsx), over the tabs.
assert.deepEqual(ANYWHERE.items.map((row) => row.keys), [[capOf(APP_KEYS.newThing)], ['⌘', capOf(APP_KEYS.switchProject)], [APP_KEYS.help]]);

// 3. The Playground: every key its handlers read (scene.tsx, playground-view.tsx, the palette's search) has its cap.
const playground = capsOf(SHORTCUTS.playground);
const playgroundKeys = [...Object.values(PLAYGROUND_KEYS).flat(), ...Object.values(SEARCH_KEYS)];
const playgroundCap = (key: string) => (PLAYGROUND_KEYS.actions as readonly string[]).includes(key) ? '1–9' : capOf(key);
for (const key of playgroundKeys) assert.ok(playground.has(playgroundCap(key)), `the Playground tab shows ${JSON.stringify(key)} (${playgroundCap(key)})`);
// ... and nothing it does not read: the right button removes (scene.tsx), the rest are keys.
assert.deepEqual([...playground].filter((cap) => cap !== 'rightButton' && !playgroundKeys.some((key) => playgroundCap(key) === cap)), [], 'the Playground tab shows only keys it reads');
const move = rowsOf(SHORTCUTS.playground).find((row) => row.what === 'modals.shortcuts.playground.move');
assert.deepEqual(move?.keys, ['W', 'A', 'S', 'D', '↑', '←', '↓', '→'], 'the move row shows the arrows as caps too');
// The digits play the actions with or without ⇧ (running): the digit row is read by its place.
assert.equal(actionIndexOf({ key: ' ', code: 'Space' }), 0, 'Space is the first action');
assert.equal(actionIndexOf({ key: '1', code: 'Digit1' }), 0);
assert.equal(actionIndexOf({ key: '!', code: 'Digit1' }), 0, '⇧1 still plays the first action');
assert.equal(actionIndexOf({ key: '@', code: 'Digit2' }), 1, '⇧2 the second');
assert.equal(actionIndexOf({ key: '9', code: 'Numpad9' }), 8, 'the number pad by what it types');
assert.equal(actionIndexOf({ key: '0', code: 'Digit0' }), null, '0 plays nothing');
assert.equal(actionIndexOf({ key: 'h', code: 'KeyH' }), null);
assert.equal(keyOf({ key: 'H' }), 'h', 'a letter whatever Shift does to it');
assert.equal(keyOf({ key: 'ArrowUp' }), 'ArrowUp');
// Every move key takes the character its own way (inputOf, what the scene steps it with); a letter and its arrow do not add up.
for (const key of PLAYGROUND_KEYS.move) {
  const { dx, dy } = inputOf(new Set([key]));
  assert.equal(Math.abs(dx) + Math.abs(dy), 1, `${key} moves the character one way`);
}
assert.deepEqual(inputOf(new Set(['d', 'ArrowRight', 'Shift'])), { dx: 1, dy: 0, run: true }, 'D and → together, running');
assert.deepEqual(inputOf(new Set(['a', 'w'])), { dx: -1, dy: -1, run: false });
assert.deepEqual(inputOf(new Set(['a', 'ArrowRight'])), { dx: 0, dy: 0, run: false }, 'opposite ways cancel');
assert.deepEqual(inputOf(new Set(['h'])), { dx: 0, dy: 0, run: false });

// 4. The painter: the tools in order, built from TOOLS, so a new tool or a key bound again cannot be missing.
const [tools] = SHORTCUTS.scenery;
assert.equal(tools.title, 'scenery.toolsLabel');
assert.deepEqual(tools.items.map((row) => row.keys), TOOLS.map((tool) => [TOOL_KEYS[tool]]));
assert.deepEqual(tools.items.map((row) => row.what), TOOLS.map((tool) => `scenery.tools.${tool}`));
assert.deepEqual(Object.keys(TOOL_OF_KEY).sort(), TOOLS.map((tool) => TOOL_KEYS[tool].toLowerCase()).sort(), 'every tool has its own key');
// Every other key the painter reads (scenery-view.tsx, scene-canvas.tsx) has its cap; Fit (0) among them.
const scenery = capsOf(SHORTCUTS.scenery);
const sceneryKeys = [...Object.values(PAINTER_KEYS).flat(), ...Object.keys(NUDGE_KEYS), ...Object.values(TOOL_KEYS)];
for (const key of sceneryKeys) assert.ok(scenery.has(capOf(key)), `the Scenery tab shows ${JSON.stringify(key)} (${capOf(key)})`);
assert.ok(scenery.has('0') && scenery.has('Tab') && scenery.has('space'));
// With ⌘ or Ctrl: duplicate, undo and redo (Ctrl+Y too), each in a row of its own caps.
const sceneryRows = rowsOf(SHORTCUTS.scenery);
const duplicate = sceneryRows.find((row) => row.what === 'scenery.toolbar.keys.duplicate');
assert.deepEqual(duplicate?.keys, ['⌘', capOf(PAINTER_COMMAND_KEYS.duplicate)]);
const history = chordsOf(historyCommand);
assert.deepEqual(history.map((chord) => chord.caps.join('')).sort(), ['CtrlY', '⇧⌘Z', '⌘Z'].sort(), 'undo and redo: ⌘Z, ⇧⌘Z and Ctrl+Y');
for (const { caps, does } of history) {
  const row = sceneryRows.find((r) => same(r.keys, caps));
  assert.equal(row?.what, `scenery.toolbar.keys.${does}`, `the Scenery tab shows ${caps.join('')} (${does})`);
}
// The pointer (scene-canvas.tsx): ⇧ draws a line, ⌥ or ⌘ picks, the right button erases.
for (const cap of ['⇧', '⌥', 'rightButton']) assert.ok(scenery.has(cap), `the Scenery tab shows ${cap}`);
const chordCaps = history.flatMap((chord) => chord.caps).concat(duplicate!.keys);
assert.deepEqual([...scenery].filter((cap) => !['⇧', '⌥', 'rightButton'].includes(cap) && !chordCaps.includes(cap) && !sceneryKeys.some((key) => capOf(key) === cap)), [], 'the Scenery tab shows only keys the painter reads');

// 5. Customize: undo and redo, with its own strings (customize-view.tsx reads historyCommand too), and nothing else.
const customize = rowsOf(SHORTCUTS.customize);
assert.equal(customize.length, history.length, 'the Customize tab has undo and redo only');
for (const { caps, does } of history) assert.equal(customize.find((row) => same(row.keys, caps))?.what, `customize.${does}`, `the Customize tab shows ${caps.join('')} (${does})`);

// 3b. The palette shows the controlled character's keys (palette.tsx) with the window's caps: ⇧ and not "Shift", the arrows
//     beside W A S D, E; [ and ] in the picker's label, the scene's keys in the "Place in the scene" hint.
const en = createTranslator('en').t;
const pt = createTranslator('pt-BR').t;
const clip = (key: string, kind = key, hold = false) => ({ key, kind, hold }) as Parameters<typeof controlRows>[0]['actions'][number];
const captain = { locomotion: [clip('walk'), clip('run')], actions: [clip('slash', 'attack'), clip('block', 'block', true), clip('kick', 'attack')], hit: clip('hit'), death: clip('death') };
const controls = controlRows(captain, en);
assert.deepEqual(controls.map((row) => [row.keys.join(' '), row.label]), [
  ['W A S D ↑ ← ↓ →', 'walk'], ['⇧', 'run'], ['space', 'slash'], ['2', 'block'], ['3', 'kick'], ['H', 'hit'], ['K', 'death'], ['R', 'restart'], ['E', 'use'],
]);
assert.deepEqual(controls[0].keys, move?.keys, 'the palette moves with the window\'s caps');
for (const row of controls) for (const key of row.keys) assert.ok(playground.has(key) || (PLAYGROUND_KEYS.actions as readonly string[]).includes(key), `the palette's ${key} is a cap of the Playground tab`);
assert.ok(controls.every((row) => !row.keys.includes('Shift')), 'no "Shift" cap');
assert.deepEqual(controls.map((row) => keyLabel(pt, row.keys[0])).slice(1, 3), ['⇧', 'Espaço'], 'a word key in the language of the screen');
assert.deepEqual(controlRows(captain, pt).slice(-2).map((row) => row.label), ['reiniciar', 'usar']);
// A character with one gait, no death and no held pose: no ⇧, no R. Past the ninth action, no key.
const many = controlRows({ locomotion: [clip('walk')], actions: Array.from({ length: 11 }, (_, i) => clip(`a${i}`)), hit: null, death: null }, en);
assert.deepEqual(many.map((row) => row.keys.join(' ')), ['W A S D ↑ ← ↓ →', 'space', '2', '3', '4', '5', '6', '7', '8', '9', 'E']);
assert.equal(controlRows({ locomotion: [], actions: [], hit: null, death: null }, pt)[0].label, 'mover', 'a character with no gait still moves');
assert.deepEqual(switchCaps(), ['[', ']']);
// The hint says the right button the way the window does ("Botão direito", never "Clique direito"), with ⌫, Esc and /.
assert.deepEqual(placeHintVars(pt), { rightButton: 'Botão direito', remove: '⌫', escape: 'Esc', search: '/' });
assert.equal(placeHintVars(en).rightButton, keyLabel(en, 'rightButton'));
for (const t of [en, pt]) {
  const hint = t('playground.palette.placeHint', placeHintVars(t));
  for (const cap of [keyLabel(t, 'rightButton'), '⌫', 'Esc', '/']) assert.ok(hint.includes(`<kbd>${cap}</kbd>`), `the hint shows ${cap}: ${hint}`);
}
assert.doesNotMatch(pt('playground.palette.placeHint', placeHintVars(pt)), /clique direito/i);
assert.throws(() => capsFor('customize', 'modals.shortcuts.playground.move'), /No shortcut row/, 'a row asked of the wrong tab is a mistake');

// 6. The asset list and the Details window, as their handlers read them (use-asset-selection.ts, details-dialog.tsx, details-shell.tsx).
assert.deepEqual(rowsOf(SHORTCUTS.assets).map((row) => row.keys.join(' ')), ['/', '↑ ↓ ← →', 'Home End', '↵', '⌫', 'Esc', 'space', '← →', '↑ ↓ 1–8', '[ ]', '+ − 0', 'B', 'P G']);
// [ and ] go through a character's animations, or through the list for any other asset (`peersOf`): the row says both.
const step = rowsOf(SHORTCUTS.assets).find((row) => row.keys.join(' ') === '[ ]')!;
assert.match(en(step.what), /animation.*asset/);
assert.match(pt(step.what), /Animação.*asset/);
// ↑ ↓ and the digits turn the facings, or step through a clip's variants or a wall's heights on a sheet that does not turn (`lib/rows.ts: keyedAxis`).
const turn = rowsOf(SHORTCUTS.assets).find((row) => row.keys.join(' ') === '↑ ↓ 1–8')!;
assert.match(en(turn.what), /direction.*variation.*height/);
assert.match(pt(turn.what), /direção.*variação.*altura/);

// 7. Every heading, every row and every key that is a word is in both dictionaries (not through t(), which falls back to English).
const all = [ANYWHERE, ...SHORTCUT_TABS.flatMap((tab) => SHORTCUTS[tab])];
for (const lang of ['en', 'pt-BR'] as const) {
  const strings = stringsOf(lang);
  for (const list of all) {
    assert.ok(strings.has(list.title), `${lang}: ${list.title}`);
    for (const row of list.items) assert.ok(strings.has(row.what), `${lang}: ${row.what}`);
  }
  for (const word of WORD_KEYS) assert.ok(strings.has(`keys.${word}`), `${lang}: keys.${word}`);
}
// A row is told apart by its keys (the list keys its rows by them), and its caps by their text.
for (const list of all) {
  const keys = list.items.map((row) => row.keys.join(' '));
  assert.equal(new Set(keys).size, keys.length, `${list.title}: no two rows with the same keys`);
  for (const row of list.items) assert.equal(new Set(row.keys).size, row.keys.length, `${list.title}: ${row.what} repeats a cap`);
}

// 8. A key that is a word is said in the interface's language; every other one is shown as it is written.
assert.equal(keyLabel(pt, 'space'), 'Espaço');
assert.equal(keyLabel(en, 'rightButton'), 'Right button');
assert.equal(keyLabel(pt, 'rightButton'), 'Botão direito');
assert.equal(keyLabel(en, 'R'), 'R');
assert.equal(keyLabel(pt, 'Esc'), 'Esc');

console.log('✅ shortcut lists passed');

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator, LANGS } from '../../viewer/src/i18n/core';
import {
  readTourMemory, rememberTour, sectionOfStop, shouldOfferTour, skipFrom, targetSelector, TOUR_STORAGE_KEY, tourStops, type TourStop,
} from '../../viewer/src/lib/tour';

console.log('🧪 Checking the tour of a project page (which stops apply, where each is shown, what the browser remembers)...\n');

const FULL = { assetCount: 198, hasGearKit: true, hasSceneryKit: true };
const BARE = { assetCount: 0, hasGearKit: false, hasSceneryKit: false };
const summary = (stops: TourStop[]) => stops.map((s) => `${s.id}:${s.place}:${s.target}:${s.body}`);

// 1. A project with assets and both kits: every stop, in the order of the page, each on its own section; the first two on
//    the bars every section has, the last back where the tour started.
assert.deepEqual(summary(tourStops(FULL)), [
  'project:here:project:tour.project.body',
  'create:here:actions:tour.create.body',
  'find:assets:find:tour.find.body',
  'asset:assets:asset:tour.asset.body',
  'playground:playground:playground:tour.playground.body',
  'customize:customize:customize:tour.customize.body',
  'scenery:scenery:scenery:tour.scenery.body',
  'shortcuts:start:shortcuts:tour.shortcuts.body',
]);

// 2. No assets and no kits: no list to search and no card to open; the sections point at their tabs, where the stop is
//    (no going there), and say what each section needs.
assert.deepEqual(summary(tourStops(BARE)), [
  'project:here:project:tour.project.body',
  'create:here:actions:tour.create.body',
  'playground-tab:here:tab-playground:tour.playground.empty',
  'customize-tab:here:tab-customize:tour.customize.noKit',
  'scenery-tab:here:tab-scenery:tour.scenery.noKit',
  'shortcuts:start:shortcuts:tour.shortcuts.body',
]);
// Each kit decides its own section, and assets decide the list and the Playground.
assert.deepEqual(tourStops({ ...FULL, hasGearKit: false }).map((s) => s.id), ['project', 'create', 'find', 'asset', 'playground', 'customize-tab', 'scenery', 'shortcuts']);
assert.deepEqual(tourStops({ ...FULL, hasSceneryKit: false }).map((s) => s.id), ['project', 'create', 'find', 'asset', 'playground', 'customize', 'scenery-tab', 'shortcuts']);
assert.deepEqual(tourStops({ ...BARE, assetCount: 1 }).map((s) => s.id), ['project', 'create', 'find', 'asset', 'playground', 'customize-tab', 'scenery-tab', 'shortcuts']);

// 3. A section's stop that cannot be shown (its panel hidden, nothing to play yet, a kit that does not load) falls back to
//    its tab, saying what the section is for: never that the project has no kit, since it has one.
for (const stop of tourStops(FULL).filter((s) => ['playground', 'customize', 'scenery'].includes(s.id))) {
  assert.deepEqual(
    stop.fallback && { place: stop.fallback.place, target: stop.fallback.target, title: stop.fallback.title, body: stop.fallback.body },
    { place: 'here', target: `tab-${stop.id}`, title: stop.title, body: `tour.${stop.id}.tab` },
    `${stop.id}: the fallback is its tab`,
  );
}
// The other stops are on every page of their section, or on the bars: nothing to fall back to.
assert.deepEqual(tourStops(FULL).filter((s) => !s.fallback).map((s) => s.id), ['project', 'create', 'find', 'asset', 'shortcuts']);

// 4. Every stop, fallbacks included, has its words in both languages, and every target is marked in the viewer's code
//    (`data-tour="…"`, or `data-tour={… 'asset' …}` on the first card of the list).
const everyStop = [...tourStops(FULL), ...tourStops(BARE)].flatMap((s) => (s.fallback ? [s, s.fallback] : [s]));
for (const lang of LANGS) {
  const { t } = createTranslator(lang);
  for (const stop of everyStop) {
    for (const key of [stop.title, stop.body]) assert.notEqual(t(key), key, `${lang}: ${key} is in the dictionary`);
  }
}
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx$/.test(name) ? [path] : [];
  });
}
const marked = new Set<string>();
for (const file of sourceFiles('viewer/src')) {
  for (const m of readFileSync(file, 'utf8').matchAll(/data-tour=(?:"([\w-]+)"|\{[^}]*?'([\w-]+)'[^}]*\})/g)) marked.add(m[1] ?? m[2]);
}
assert.deepEqual([...new Set(everyStop.map((s) => s.target))].filter((target) => !marked.has(target)), [], 'every target is marked in the code');
assert.equal(targetSelector(tourStops(FULL)[0]), '[data-tour="project"]');

// 5. Where a stop is shown: its section, wherever the tour is for the bars, and back where it started for the last.
const [project, , find, , playground, , , shortcuts] = tourStops(FULL);
assert.equal(sectionOfStop(project, 'scenery', 'assets'), 'scenery');
assert.equal(sectionOfStop(find, 'scenery', 'playground'), 'assets');
assert.equal(sectionOfStop(playground, 'assets', 'assets'), 'playground');
assert.equal(sectionOfStop(shortcuts, 'scenery', 'playground'), 'playground');
assert.equal(sectionOfStop(playground.fallback!, 'playground', 'assets'), 'playground', 'a fallback stays on the section it fell back on');

// 6. A stop that cannot be shown is skipped the way the tour goes; going back from the first goes forward; past the last
//    the tour is over.
assert.equal(skipFrom(3, 1, 8), 4);
assert.equal(skipFrom(3, -1, 8), 2);
assert.equal(skipFrom(0, -1, 8), 1);
assert.equal(skipFrom(7, 1, 8), null);
assert.equal(skipFrom(0, -1, 1), null);

// 7. What the browser remembers, under diorama:tour: nothing yet offers the tour; "Not now", skipping and finishing each
//    stop the offer. Something else stored, blocked storage or no storage at all count as nothing yet, and remembering
//    never throws.
assert.equal(TOUR_STORAGE_KEY, 'diorama:tour');
const store = new Map<string, string>();
const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
assert.equal(readTourMemory(storage), 'new');
assert.equal(shouldOfferTour(readTourMemory(storage)), true);
for (const answer of ['declined', 'skipped', 'finished'] as const) {
  rememberTour(answer, storage);
  assert.equal(store.get('diorama:tour'), answer);
  assert.equal(readTourMemory(storage), answer);
  assert.equal(shouldOfferTour(readTourMemory(storage)), false, `${answer}: not offered again`);
}
store.set('diorama:tour', 'maybe');
assert.equal(readTourMemory(storage), 'new', 'an unknown value is nothing yet');
const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
assert.equal(readTourMemory(blocked), 'new');
assert.doesNotThrow(() => rememberTour('declined', blocked));
assert.equal(readTourMemory(undefined), 'new', 'no storage at all');
assert.doesNotThrow(() => rememberTour('finished'), 'the default storage, absent here, is not an error');

console.log(`✅ tour checks passed (${tourStops(FULL).length} stops for a full project, ${tourStops(BARE).length} for an empty one)`);

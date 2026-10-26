import type { Key } from '../i18n/core';
import type { ProjectMeta } from './types';
import type { Section } from './sections';

/**
 * The first-run tour of a project page (`components/tour/`): which stops apply to a project, where each is shown, and
 * what the browser remembers about it. Pure, so `tests/viewer/tour.test.ts` can hold it; the page finds each stop's
 * target with its `data-tour` attribute, and a stop whose target is not on the page when it gets there is shown in its
 * `fallback` form, or skipped.
 */

/**
 * Where a stop is shown: on a section of the project (the tour goes there), on the section the tour started from (it
 * comes back), or wherever the tour is (a stop on the bars every section has: the header, the project bar).
 */
export type TourPlace = Section | 'start' | 'here';

export interface TourStop {
  id: string;
  place: TourPlace;
  /** The value of the `data-tour` attribute it points at. */
  target: string;
  /** The side of the target the stop's card is on, and how it lines up with the target along that side. */
  side: 'top' | 'right' | 'bottom' | 'left';
  align: 'start' | 'center' | 'end';
  title: Key;
  body: Key;
  /** What to show instead when the target is not there (the page is empty, or still has nothing to show after a wait). */
  fallback?: TourStop;
}

/** What a project has that decides which stops apply. */
export type TourProject = Pick<ProjectMeta, 'assetCount' | 'hasGearKit' | 'hasSceneryKit'>;

/** A section's tab in the project bar, which every section has: where a stop about a section stands when the section has nothing to show. */
const atTab = (section: Section, body: Key): TourStop => ({
  id: `${section}-tab`,
  place: 'here',
  target: `tab-${section}`,
  side: 'bottom',
  align: 'start',
  title: `tour.${section}.title` as Key,
  body,
});

const PROJECT: TourStop = { id: 'project', place: 'here', target: 'project', side: 'bottom', align: 'start', title: 'tour.project.title', body: 'tour.project.body' };
const CREATE: TourStop = { id: 'create', place: 'here', target: 'actions', side: 'bottom', align: 'end', title: 'tour.create.title', body: 'tour.create.body' };
const FIND: TourStop = { id: 'find', place: 'assets', target: 'find', side: 'bottom', align: 'start', title: 'tour.find.title', body: 'tour.find.body' };
const ASSET: TourStop = { id: 'asset', place: 'assets', target: 'asset', side: 'right', align: 'start', title: 'tour.asset.title', body: 'tour.asset.body' };
const SHORTCUTS: TourStop = { id: 'shortcuts', place: 'start', target: 'shortcuts', side: 'bottom', align: 'end', title: 'tour.shortcuts.title', body: 'tour.shortcuts.body' };

/**
 * A section's own stop, with its tab as the fallback when the section does not show what the stop points at (a library
 * with nothing to play, a kit with no characters or that fails to load, the painter's piece panel hidden): the tab then
 * says what the section is for, without pointing at anything on it.
 */
const onPage = (section: 'playground' | 'customize' | 'scenery', side: TourStop['side']): TourStop => ({
  id: section,
  place: section,
  target: section,
  side,
  align: 'start',
  title: `tour.${section}.title` as Key,
  body: `tour.${section}.body` as Key,
  fallback: atTab(section, `tour.${section}.tab` as Key),
});

/**
 * The stops for a project, in order. A project with no assets has no list to search and no card to open, and nothing to
 * play; a project without a kit cannot be dressed or painted yet. Those stops point at the section's tab and say what
 * the section needs, without going there.
 */
export function tourStops(project: TourProject): TourStop[] {
  const hasAssets = project.assetCount > 0;
  return [
    PROJECT,
    CREATE,
    ...(hasAssets ? [FIND, ASSET] : []),
    hasAssets ? onPage('playground', 'right') : atTab('playground', 'tour.playground.empty'),
    project.hasGearKit ? onPage('customize', 'right') : atTab('customize', 'tour.customize.noKit'),
    project.hasSceneryKit ? onPage('scenery', 'left') : atTab('scenery', 'tour.scenery.noKit'),
    SHORTCUTS,
  ];
}

/** The section a stop is shown on, given the section the tour is on now and the one it started from. */
export function sectionOfStop(stop: TourStop, here: Section, start: Section): Section {
  if (stop.place === 'here') return here;
  if (stop.place === 'start') return start;
  return stop.place;
}

/** The CSS selector of a stop's target. */
export const targetSelector = (stop: TourStop) => `[data-tour="${stop.target}"]`;

/**
 * Where the tour goes after a stop that cannot be shown: on in the direction it was going, or, going back from the first
 * stop, forward again. Past the last stop the tour is over (`null`).
 */
export function skipFrom(index: number, direction: 1 | -1, count: number): number | null {
  const next = index + direction;
  if (next < 0) return index + 1 < count ? index + 1 : null;
  return next < count ? next : null;
}

/**
 * What the browser remembers: nothing yet (`new`, the tour is offered on the next project page), "Not now", or a tour
 * that was skipped or finished. Any of the three stops the offer; the tour can still be taken from the Shortcuts window
 * and the project's ⋯ menu.
 */
export type TourMemory = 'new' | 'declined' | 'skipped' | 'finished';
const ANSWERS: readonly TourMemory[] = ['declined', 'skipped', 'finished'];

export const TOUR_STORAGE_KEY = 'diorama:tour';

type TourStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The storage of the browser, or none: reading `localStorage` itself throws when the site's storage is blocked. */
function browserStorage(): TourStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** What is remembered, or `new` when nothing is (or storage is blocked, or holds something else). */
export function readTourMemory(storage: TourStorage | undefined = browserStorage()): TourMemory {
  try {
    const value = storage?.getItem(TOUR_STORAGE_KEY);
    return ANSWERS.find((answer) => answer === value) ?? 'new';
  } catch {
    return 'new';
  }
}

/** Remembers an answer. Storage can be blocked: the answer then holds until the page is reloaded. */
export function rememberTour(answer: Exclude<TourMemory, 'new'>, storage: TourStorage | undefined = browserStorage()) {
  try {
    storage?.setItem(TOUR_STORAGE_KEY, answer);
  } catch {
    // Not remembered; the offer may come back on the next visit.
  }
}

/** The tour is offered only to a browser that has never answered it. */
export const shouldOfferTour = (memory: TourMemory) => memory === 'new';

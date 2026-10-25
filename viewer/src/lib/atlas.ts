/**
 * Shapes written by tools/export.ts and helpers to turn an atlas into playable frames. The contract's types and the frame
 * helpers live in `@diorama/runtime`, which games share; this module re-exports them for the viewer and adds what only the
 * viewer shows (the compass of the direction picker, how a sheet is played in the Details window).
 */

import { isAnimated, type Atlas } from '@diorama/runtime';

export type { Atlas, EffectMeta, Insets, Rect } from '@diorama/runtime';
export { clipFrames, clipNames, eventsByFrame, eventsOf } from '@diorama/runtime';

/** Compass layout for the direction picker: row 0 faces the camera (S), each next row turns clockwise. */
export const COMPASS: ReadonlyArray<ReadonlyArray<string | null>> = [
  ['NW', 'N', 'NE'],
  ['W', null, 'E'],
  ['SW', 'S', 'SE'],
];

export type PlaybackKind = 'animated' | 'sheet' | 'still';

export function playbackKind(atlas: Atlas | undefined): PlaybackKind {
  if (!atlas) return 'still';
  return isAnimated(atlas) ? 'animated' : 'sheet';
}

import type { TFn } from '../i18n/core';
import { heightLabel, stateLabel } from './scenery/labels';

/**
 * What the rows of a sheet are. They are not always facings: an interface piece's rows are its states, a wall or fence in
 * several heights has a row per height (`data.rows: 'heights'`), and a scenery clip sheet says the facing and the variant
 * of each row (`data.rows: [{ row, dir, variant }]`). Any other sheet has a row per facing, named in `meta.directions`.
 * The asset cards count the facings by the same rule (`viewer/server/catalog.ts: facingsOf`, held to this one by
 * `tests/viewer/details.test.ts`); the Details window turns the facings with its compass and steps through the rest by
 * what they are.
 */

/** What a row is besides a facing. */
export type RowAxis = 'variant' | 'state' | 'height';

export interface SheetRows {
  /** The facings the rows turn through, by name ('S', 'W', 'N', 'E'): one for a sheet that never turns, none for a sheet without rows. */
  facings: string[];
  /** What the rows go through besides the facings, or null when every row is a facing. */
  axis: RowAxis | null;
  /** The steps of that axis: a state's or a height's name (a height without one in world units), a variant's 0-based number. */
  steps: Array<string | number>;
  /** Each row of the sheet: its facing (an index of `facings`) and its step (an index of `steps`, 0 without an axis). */
  rows: Array<{ facing: number; step: number }>;
}

/** The engine's names of the facings (`DIRECTION_NAMES`, core/volume/frame.ts), which a scenery clip sheet's rows refer to by number. */
export const FACING_NAMES: Readonly<Record<number, readonly string[]>> = {
  1: ['S'],
  4: ['S', 'W', 'N', 'E'],
  8: ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'],
};
const facingName = (index: number, count: number) => FACING_NAMES[count]?.[index] ?? `D${index}`;

/** What the viewer reads of an atlas's `meta` to tell its rows apart: JSON, so anything may be missing or of another type. */
export interface RowsMeta {
  directions?: unknown;
  data?: Record<string, any> | null;
}

const sorted = (values: Iterable<number>) => [...new Set(values)].sort((a, b) => a - b);

export function sheetRows(meta: RowsMeta | undefined): SheetRows {
  const names = Array.isArray(meta?.directions) ? meta.directions.map(String) : [];
  const data = meta?.data ?? {};
  const count = Math.max(1, names.length);
  const each = <T>(fn: (row: number) => T) => Array.from({ length: count }, (_, row) => fn(row));
  // An interface piece's rows are its states, named in `data.states` (the export names the rows S, W... all the same).
  if (data.role === 'ui') {
    const states: unknown[] = Array.isArray(data.states) && data.states.length === count ? data.states : names;
    return { facings: ['S'], axis: count > 1 ? 'state' : null, steps: each((row) => String(states[row] ?? row + 1)), rows: each((row) => ({ facing: 0, step: row })) };
  }
  // A wall or fence in several heights: a row per height, with the space profile's name or its height in world units.
  if (data.rows === 'heights') {
    const heights: Array<{ name?: unknown; world?: unknown }> = Array.isArray(data.heights) ? data.heights : [];
    const stepOf = (row: number): string | number => {
      const height = heights[row];
      return typeof height?.name === 'string' ? height.name : typeof height?.world === 'number' ? height.world : row + 1;
    };
    return { facings: ['S'], axis: 'height', steps: each(stepOf), rows: each((row) => ({ facing: 0, step: row })) };
  }
  // A scenery clip sheet: down, the piece's facings for each of its variants, and which is which in `data.rows`.
  if (Array.isArray(data.rows)) {
    const entries = each((row) => {
      const entry = data.rows.find((e: any) => e?.row === row) ?? data.rows[row];
      return { dir: Number(entry?.dir ?? 0), variant: Number(entry?.variant ?? 0) };
    });
    const dirs = sorted(entries.map((e) => e.dir));
    const variants = sorted(entries.map((e) => e.variant));
    return {
      facings: dirs.map((dir) => facingName(dir, dirs.length)),
      axis: variants.length > 1 ? 'variant' : null,
      steps: variants.length > 1 ? variants : [],
      rows: entries.map((e) => ({ facing: dirs.indexOf(e.dir), step: variants.length > 1 ? variants.indexOf(e.variant) : 0 })),
    };
  }
  // Any other sheet: a row per facing.
  return { facings: names, axis: null, steps: [], rows: each((row) => ({ facing: names.length ? row : 0, step: 0 })) };
}

/** The keys of the Details window (↑ ↓ and the digits) turn the facings when there are several, else they step through the other axis. */
export function keyedAxis(rows: SheetRows): 'facing' | 'step' | null {
  if (rows.facings.length > 1) return 'facing';
  return rows.axis && rows.steps.length > 1 ? 'step' : null;
}

/** How many places the keys go through: the facings, or the steps. */
export const keyedCount = (rows: SheetRows) => (keyedAxis(rows) === 'facing' ? rows.facings.length : keyedAxis(rows) === 'step' ? rows.steps.length : 0);

/**
 * The row that shows a facing or a step, keeping the other part of the row it starts from: another variant of the same
 * facing, the same variant turned. A combination the sheet has not got falls back to the first row of what was asked for;
 * the row stays when nothing has it.
 */
export function rowWith(rows: SheetRows, from: number, change: { facing?: number; step?: number }): number {
  const current = rows.rows[Math.min(Math.max(0, from), rows.rows.length - 1)] ?? { facing: 0, step: 0 };
  const facing = change.facing ?? current.facing;
  const step = change.step ?? current.step;
  const exact = rows.rows.findIndex((r) => r.facing === facing && r.step === step);
  if (exact >= 0) return exact;
  const near = rows.rows.findIndex((r) => (change.facing !== undefined ? r.facing === facing : r.step === step));
  return near >= 0 ? near : from;
}

/** The row one place further along the keyed axis (`offset` 1 or -1), wrapping round; the row stays when the keys go nowhere. */
export function stepRow(rows: SheetRows, from: number, offset: number): number {
  const axis = keyedAxis(rows);
  const count = keyedCount(rows);
  if (!axis) return from;
  const current = rows.rows[Math.min(Math.max(0, from), rows.rows.length - 1)];
  const at = axis === 'facing' ? current.facing : current.step;
  const next = (at + offset + count) % count;
  return rowWith(rows, from, axis === 'facing' ? { facing: next } : { step: next });
}

/** The row a digit picks (1 is the first facing, or the first step), or null when the digit is past the last. */
export function digitRow(rows: SheetRows, from: number, digit: number): number | null {
  const axis = keyedAxis(rows);
  if (!axis || digit < 1 || digit > keyedCount(rows)) return null;
  return rowWith(rows, from, axis === 'facing' ? { facing: digit - 1 } : { step: digit - 1 });
}

/** The name of an axis, as the Details window titles its control: "Variation", "State", "Height". */
export const axisLabel = (t: TFn, axis: RowAxis) => t(`details.rows.${axis}`);

/** A step by name, in the words of the screen: "Variation 2", a state ("Open", or the project's own name), a height ("Wall"). */
export function stepLabel(t: TFn, rows: SheetRows, step: number): string {
  const value = rows.steps[step];
  if (value === undefined) return '';
  if (rows.axis === 'variant') return t('details.rows.variantN', { n: Number(value) + 1 });
  if (rows.axis === 'state') return stateLabel(t, String(value));
  return heightLabel(t, value);
}

/**
 * The frames and rows of a sheet as the Data panel says them: "16 × 8 directions" only when the rows are facings, "6 × 3
 * variations", "64 × 2 heights", "1 × 4 states", "6 × 4 directions × 2 variations" for a clip with both; the frames alone
 * with a single row.
 */
export function framesLabel(t: TFn, rows: SheetRows, frames: number): string {
  const facings = rows.facings.length;
  const steps = rows.axis ? rows.steps.length : 0;
  if (facings > 1 && steps > 1) return t('details.data.framesWithDirectionsAndVariants', { frames, directions: facings, count: steps });
  if (facings > 1) return t('details.data.framesWithDirections', { frames, directions: facings });
  if (steps > 1 && rows.axis) return t(`details.data.framesWith.${rows.axis}`, { frames, count: steps });
  return String(frames);
}

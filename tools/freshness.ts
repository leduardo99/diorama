/**
 * Diorama - when an export is out of date. Shared by the viewer (its stale badge, `viewer/src/lib/export-state.ts`)
 * and `npm run export -- <project> --changed`, so both agree on which sheets need exporting.
 *
 * No Node imports: the viewer's browser code imports this file. What a sheet reaches (the newest modification time
 * of the sheet and of the local files it imports) is read by `tools/sources.ts`.
 */

/** The images an export can be: an image in `assets/` belongs to the sheet at the same path (`assets/a/b.png` to `sheets/a/b.ts`). */
export const IMAGE_RE = /\.(png|jpe?g|webp|svg)$/i;

/** The image extensions of `IMAGE_RE`, in the order they are looked for next to a sheet's path. */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'svg'] as const;

/** Checkouts and copies touch many files at once; a second of slack keeps them from all looking out of date. */
export const STALE_TOLERANCE_MS = 1000;

/**
 * The sheet, or a local file it imports, changed after the image was exported. `sourceMtime` is null for an
 * image without a sheet, which is never stale.
 */
export function isOutOfDate(sourceMtime: number | null, imageMtime: number): boolean {
  return sourceMtime !== null && sourceMtime > imageMtime + STALE_TOLERANCE_MS;
}

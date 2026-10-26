import { isOutOfDate } from '../../../tools/freshness';
import type { Translator } from '../i18n/core';
import type { AssetFileMeta, ProjectMeta } from './types';

/**
 * The sheet, or a file of `src/` it imports, changed after this asset was exported (with a second of slack). The rule
 * is tools/freshness.ts, the one `npm run export -- <project> --changed` uses to pick what it exports.
 */
export const isStale = (asset: AssetFileMeta) => isOutOfDate(asset.sourceMtime, asset.mtime);

export interface PendingExports {
  /** Exported, but the sheet or the code it imports is newer than the image. */
  stale: AssetFileMeta[];
  /** Sheets (relative to sheets/, with `.ts`) that have no exported image. */
  missing: string[];
}

export function pendingExports(assets: AssetFileMeta[], project: ProjectMeta | undefined): PendingExports {
  return { stale: assets.filter(isStale), missing: project?.pendingSheets ?? [] };
}

/** How far a run of `total` steps is with `done` of them finished, as the percentage a progress bar takes (0 to 100). */
export const progressPercent = (done: number, total: number): number => (total > 0 ? Math.min(100, Math.max(0, (done / total) * 100)) : 0);

/** What `tools/export.ts` takes to export one sheet: its path under sheets/ without the extension. */
export const exportTarget = (sheet: string) => sheet.replace(/\.[^/.]+$/, '');

/**
 * The project bar's totals: its assets and the size of their images, then the sheets not exported yet, while there are
 * any. A sheet exports to one asset at its own path, so the sheets are not counted a second time.
 */
export function projectTotals(project: ProjectMeta, assets: number, { plural, bytes }: Translator): string {
  return [
    plural('counts.assets', assets),
    bytes(project.totalSize),
    project.pendingSheets.length > 0 && plural('project.notExported', project.pendingSheets.length),
  ].filter(Boolean).join(' · ');
}

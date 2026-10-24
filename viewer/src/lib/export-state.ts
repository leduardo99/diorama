import { isOutOfDate } from '../../../tools/freshness';
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

/** What `tools/export.ts` takes to export one sheet: its path under sheets/ without the extension. */
export const exportTarget = (sheet: string) => sheet.replace(/\.[^/.]+$/, '');

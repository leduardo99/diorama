/**
 * What the viewer may import of the server (docs/ARCHITECTURE.md): the data types of the API's
 * answers, and with `import type` only, so nothing of the server ships in the viewer's bundle
 * (`viewer/src/lib/types.ts` re-exports them for the app). The routes that carry them are in app.ts.
 */

export type { AssetFileMeta, AtlasInfo, Engine, ProjectMeta } from './catalog';
export type { DeletePlan, DeleteResult, FileKind, PlannedFile } from './assets-fs';

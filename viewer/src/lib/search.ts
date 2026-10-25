import { z } from 'zod';
import { roleIds } from './asset-role';

export const sortIds = ['name', 'folder', 'role', 'engine', 'dimensions', 'frames', 'fileSize', 'modified'] as const;
export type SortId = (typeof sortIds)[number];

/** URL state of a project's asset list: everything that should survive a reload or be shared as a link. */
export const assetsSearchSchema = z.object({
  q: z.string().default('').catch(''),
  sort: z.enum(sortIds).default('name').catch('name'),
  dir: z.enum(['asc', 'desc']).default('asc').catch('asc'),
  view: z.enum(['grid', 'table']).default('grid').catch('grid'),
  group: z.boolean().default(true).catch(true),
  engine: z.enum(['volume', 'rig', 'none']).optional().catch(undefined),
  folder: z.string().optional().catch(undefined),
  role: z.enum(roleIds).optional().catch(undefined),
  asset: z.string().optional().catch(undefined),
});

/** Values that are omitted from the URL because they are what a missing param means. */
export const assetsSearchDefaults = { q: '', sort: 'name', dir: 'asc', view: 'grid', group: true } as const;

export const isSortId = (value: string): value is SortId => (sortIds as readonly string[]).includes(value);

/** URL state of the customize tab: which character is being dressed. `fixture` loads the built-in kit (development). */
export const customizeSearchSchema = z.object({
  character: z.string().optional().catch(undefined),
  fixture: z.boolean().optional().catch(undefined),
});

/** URL state of the scenery tab. `fixture` loads the built-in kit (development). */
export const scenerySearchSchema = z.object({
  fixture: z.boolean().optional().catch(undefined),
});

/**
 * URL state of the playground. `scene` opens it on a saved scene of the project (Save scene's "Play it in the
 * Playground"), which then becomes the chosen one and leaves the address; `fixture` stands the built-in kit's scene
 * behind the actors (development).
 */
export const playgroundSearchSchema = z.object({
  fixture: z.boolean().optional().catch(undefined),
  scene: z.string().optional().catch(undefined),
});

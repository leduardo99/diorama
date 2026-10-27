/**
 * What the viewer may import of the server (docs/ARCHITECTURE.md): the data types of the API's
 * answers and events, and with `import type` only, so nothing of the server ships in the viewer's bundle
 * (`viewer/src/lib/types.ts` re-exports them for the app). The routes that carry them are in app.ts.
 */

export type { AssetFileMeta, AtlasInfo, Engine, ProjectMeta } from './catalog';
export type { DeletePlan, DeleteResult, FileKind, PlannedFile } from './assets-fs';

/** The commands the server runs as jobs: the ones `/__api/cli` runs, all of which write into a project. */
export type JobCommand = 'new-project' | 'new-asset' | 'new-outfit-character' | 'new-scene' | 'gear-items' | 'export' | 'example';
export type JobState = 'queued' | 'running' | 'succeeded' | 'failed';

/** How far an export (or the export inside `example`) is: sheets finished, exported or failed, of those it exports. */
export interface JobProgress {
  done: number;
  total: number;
  /** The sheet that finished last, relative to sheets/ without its extension. */
  current?: string;
}

export interface Job {
  /** Unique within one run of the server. */
  id: string;
  command: JobCommand;
  /** The name in projects/ the job writes to. */
  project: string;
  /** export: what it exports, relative to sheets/ ([] is everything); other commands: []. */
  subpaths: string[];
  state: JobState;
  /** ISO times. */
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  progress?: JobProgress;
  /** The command's text output, once it has finished. */
  output?: string;
}

/** What `GET /__api/events` sends, as Server-Sent Events: `event:` is the name, `data:` the JSON. */
export type ServerEvent =
  | { event: 'job.queued'; data: { job: Job } }
  | { event: 'job.started'; data: { job: Job } }
  | { event: 'job.progress'; data: { id: string; progress: JobProgress } }
  | { event: 'job.finished'; data: { job: Job } }
  | { event: 'catalog.changed'; data: { projects: string[] } }
  | { event: 'example.changed'; data: { running: boolean; startedAt?: string } };

/**
 * The server's events (contract.ts, `ServerEvent`): a hub that the queue and the watcher emit into and each
 * `GET /__api/events` stream listens to, and the watch that turns file changes under projects/ into
 * `catalog.changed` and `example.changed`. Nothing is replayed: a client that connects reads the jobs
 * (`GET /__api/jobs`) and the catalog, then follows the events.
 */

import { relative, sep } from 'node:path';
import type { ServerEvent } from './contract';

export type Listener = (event: ServerEvent) => void;

export class EventHub {
  private listeners = new Set<Listener>();

  /** Starts sending every event to `listener`; the function it returns stops it. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: ServerEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  get size(): number {
    return this.listeners.size;
  }
}

/**
 * Where file changes come from: a function that calls `listener` with the absolute path of each file or folder
 * added, changed or removed, and returns a function that stops it. In the dev server it is Vite's watcher; run
 * alone, `fs.watch` on projects/ (server/src/main.ts).
 */
export type ChangeSource = (listener: (path: string) => void) => () => void;

/** How long changes are gathered before one `catalog.changed` names every project they touched. */
export const CATALOG_GROUP_MS = 150;

/**
 * The project a changed path belongs to, when the change is one the catalog shows: a file under
 * `projects/<name>/assets|sheets|src/`, or the project folder itself appearing or going away (a bare entry of
 * projects/ with a dot in its name is a file, such as projects/README.md). A folder of projects/ whose name starts
 * with a dot is no project (npm run example copies into one, then renames it into place).
 */
export function catalogProjectOf(rel: string): string | undefined {
  const inside = /^projects\/([^/.][^/]*)\/(?:assets|sheets|src)\/./.exec(rel);
  if (inside) return inside[1];
  const folder = /^projects\/([^/.]+)$/.exec(rel);
  return folder?.[1];
}

export interface CatalogWatchOptions {
  root: string;
  changes: ChangeSource;
  hub: EventHub;
  /** The repository path of the sample's lock (tools/lock.ts, EXAMPLE_LOCK). */
  lock: string;
  /** Called when the lock may have been taken or released: the app re-reads the run's state. */
  onLock: () => void;
  groupMs?: number;
}

/** Follows the changes under projects/: `catalog.changed`, grouped, once per project; the lock to `onLock`. */
export function watchCatalog({ root, changes, hub, lock, onLock, groupMs = CATALOG_GROUP_MS }: CatalogWatchOptions): () => void {
  let pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    const projects = [...pending].sort();
    pending = new Set();
    if (projects.length) hub.emit({ event: 'catalog.changed', data: { projects } });
  };
  const stop = changes((path) => {
    const rel = relative(root, path).split(sep).join('/');
    if (rel === lock) return onLock();
    const project = catalogProjectOf(rel);
    if (!project) return;
    pending.add(project);
    // The first change of a group starts the clock, so a long export still reports every groupMs.
    timer ??= setTimeout(flush, groupMs);
  });
  return () => {
    stop();
    if (timer) clearTimeout(timer);
  };
}

import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { ExampleRun } from './api';
import type { Job, JobProgress, ServerEvent } from './types';

/**
 * The server's events (`GET /__api/events`, server/src/contract.ts): one `EventSource` for the whole app, opened in
 * main.tsx. They keep the catalog's queries fresh and tell each job the viewer started how it goes, so nothing polls
 * the server. Nothing is replayed, so every (re)connection refetches the catalog and asks for the jobs still awaited.
 */

/** The names the server sends, in `ServerEvent`'s order. */
const EVENT_NAMES: ServerEvent['event'][] = ['job.queued', 'job.started', 'job.progress', 'job.finished', 'catalog.changed', 'example.changed'];

/** What an event changes in the query cache: queries to refetch, and the sample's run when it is known. */
export interface QueryUpdates {
  invalidate: QueryKey[];
  exampleRun?: ExampleRun;
}

/** The catalog's queries: what disk changes show in. */
export const CATALOG_KEYS: QueryKey[] = [['assets'], ['projects']];

export function queryUpdatesFor(event: ServerEvent): QueryUpdates {
  switch (event.event) {
    case 'catalog.changed':
      return { invalidate: CATALOG_KEYS };
    case 'example.changed':
      return { invalidate: [], exampleRun: event.data };
    case 'job.finished':
      // A job that wrote nothing the watch sees (a failure before any file) still ends with the catalog read again.
      return { invalidate: CATALOG_KEYS };
    default:
      return { invalidate: [] };
  }
}

/** What a caller of `runJob` hears while its job is on its way. */
export interface JobHooks {
  /** The job waits behind another one (of its project, or another export). */
  onQueued?: (job: Job) => void;
  onStarted?: (job: Job) => void;
  onProgress?: (progress: JobProgress) => void;
}

interface Waiter {
  hooks: JobHooks;
  resolve: (job: Job) => void;
  reject: (error: Error) => void;
}

/** How many finished jobs are remembered for a caller whose POST answered after the job had already ended. */
const FINISHED_REMEMBERED = 50;

/**
 * Follows the jobs the viewer waits for. Pure: it hears events through `handle`, so tests drive it without a server.
 * A job can finish before its POST has answered (the events and the answer travel separately): finished jobs are
 * remembered for a while, and `wait` resolves at once for one of them.
 */
export function createJobTracker() {
  const waiters = new Map<string, Waiter[]>();
  const finished = new Map<string, Job>();

  const settle = (job: Job) => {
    finished.set(job.id, job);
    if (finished.size > FINISHED_REMEMBERED) finished.delete(finished.keys().next().value!);
    for (const waiter of waiters.get(job.id) ?? []) waiter.resolve(job);
    waiters.delete(job.id);
  };

  return {
    handle(event: ServerEvent) {
      switch (event.event) {
        case 'job.started':
          for (const waiter of waiters.get(event.data.job.id) ?? []) waiter.hooks.onStarted?.(event.data.job);
          break;
        case 'job.progress':
          for (const waiter of waiters.get(event.data.id) ?? []) waiter.hooks.onProgress?.(event.data.progress);
          break;
        case 'job.finished':
          settle(event.data.job);
          break;
      }
    },
    /** Resolves with the job once it has finished; `job` is what the POST answered. */
    wait(job: Job, hooks: JobHooks = {}): Promise<Job> {
      const done = finished.get(job.id);
      if (done) return Promise.resolve(done);
      if (job.state === 'queued') hooks.onQueued?.(job);
      else if (job.state === 'running') hooks.onStarted?.(job);
      if (job.progress) hooks.onProgress?.(job.progress);
      return new Promise((resolve, reject) => {
        waiters.set(job.id, [...(waiters.get(job.id) ?? []), { hooks, resolve, reject }]);
      });
    },
    /** The jobs someone still waits for: asked for again after a reconnection, since their events may be lost. */
    awaited(): string[] {
      return [...waiters.keys()];
    },
    /** A job the server no longer knows (it restarted): its waiters fail with `error`. */
    lose(id: string, error: Error) {
      for (const waiter of waiters.get(id) ?? []) waiter.reject(error);
      waiters.delete(id);
    },
    /** A job read from `GET /__api/jobs/<id>`: settles it when it has finished. */
    update(job: Job) {
      if (job.state === 'succeeded' || job.state === 'failed') settle(job);
    },
  };
}

export const jobs = createJobTracker();

/**
 * Opens the event stream for the app's lifetime. Each open (the first and every reconnection, which the browser
 * makes by itself) refetches the catalog and the sample's run, and asks for the jobs still awaited.
 */
export function connectServerEvents(queryClient: QueryClient, onLost: (id: string) => Error): () => void {
  const source = new EventSource('/__api/events');
  const apply = (event: ServerEvent) => {
    jobs.handle(event);
    const updates = queryUpdatesFor(event);
    if (updates.exampleRun) queryClient.setQueryData(['example-run'], updates.exampleRun);
    for (const queryKey of updates.invalidate) void queryClient.invalidateQueries({ queryKey });
  };
  for (const name of EVENT_NAMES) {
    source.addEventListener(name, (message) => {
      apply({ event: name, data: JSON.parse((message as MessageEvent<string>).data) } as ServerEvent);
    });
  }
  source.addEventListener('open', () => {
    for (const queryKey of [...CATALOG_KEYS, ['example-run']]) void queryClient.invalidateQueries({ queryKey });
    for (const id of jobs.awaited()) {
      void fetch(`/__api/jobs/${encodeURIComponent(id)}`).then(async (res) => {
        if (res.status === 404) jobs.lose(id, onLost(id));
        else if (res.ok) jobs.update((await res.json()) as Job);
      }).catch(() => {});
    }
  });
  return () => source.close();
}

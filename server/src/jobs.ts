/**
 * The queue of the commands that write (contract.ts, `Job`). Its rules (docs/ARCHITECTURE.md):
 * - one job per project at a time, in the order the jobs arrived;
 * - at most one `export` or `example` at a time across all projects: each starts headless Chromium with a lane per core;
 * - a request equal to a job still queued answers that job instead of queueing a second;
 * - a job that fails does not stop the queue, and a job's temporary files are removed when it ends.
 * Every change of a job is an event of the hub (`job.queued`, `job.started`, `job.progress`, `job.finished`).
 */

import type { EventHub } from './events';
import type { Job, JobCommand, JobProgress } from './contract';

export interface CommandResult {
  ok: boolean;
  output: string;
}

/** What a job asks for: the command, the project it writes to, and the script's arguments (`node --import tsx <args>`). */
export interface JobRequest {
  command: JobCommand;
  project: string;
  subpaths: string[];
  args: string[];
  /** Removes what the request left on disk (the outfit or scene JSON), once the job ends. */
  cleanup?: () => Promise<unknown> | unknown;
}

/** Runs a job's command, reporting the progress lines of `--progress` as they come. */
export type JobRunner = (args: string[], onProgress: (progress: JobProgress) => void) => Promise<CommandResult>;

/** The commands that start headless Chromium: one of them at a time. */
const HEAVY: ReadonlySet<JobCommand> = new Set(['export', 'example']);

/** How many finished jobs `list()` keeps after the ones queued or running. */
export const FINISHED_KEPT = 20;

interface Entry {
  job: Job;
  request: JobRequest;
  done: Promise<Job>;
  resolve: (job: Job) => void;
}

export interface Submitted {
  job: Job;
  /** Resolves with the job once it has finished. */
  done: Promise<Job>;
  /** True when the request was equal to a job already queued, which it answers. */
  existing: boolean;
}

export class JobQueue {
  private entries: Entry[] = [];
  private finished: Job[] = [];
  private counter = 0;

  constructor(private readonly options: { run: JobRunner; hub: EventHub; now?: () => string }) {}

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }

  /** A copy, so what an event or an answer carries never changes after it is sent. */
  private static copy(job: Job): Job {
    return { ...job, subpaths: [...job.subpaths], ...(job.progress ? { progress: { ...job.progress } } : {}) };
  }

  submit(request: JobRequest): Submitted {
    const same = this.entries.find((e) => e.job.state === 'queued' && e.request.command === request.command
      && e.request.project === request.project && e.request.args.join('\0') === request.args.join('\0'));
    if (same) {
      void request.cleanup?.();
      return { job: JobQueue.copy(same.job), done: same.done, existing: true };
    }
    let resolve!: (job: Job) => void;
    const done = new Promise<Job>((r) => (resolve = r));
    const job: Job = { id: `job-${++this.counter}`, command: request.command, project: request.project, subpaths: [...request.subpaths], state: 'queued', queuedAt: this.now() };
    this.entries.push({ job, request, done, resolve });
    this.options.hub.emit({ event: 'job.queued', data: { job: JobQueue.copy(job) } });
    this.pump();
    return { job: JobQueue.copy(job), done, existing: false };
  }

  /** The jobs queued or running, in the order they arrived, then the last finished ones, newest first. */
  list(): Job[] {
    return [...this.entries.map((e) => JobQueue.copy(e.job)), ...this.finished.map(JobQueue.copy)];
  }

  get(id: string): Job | undefined {
    const job = this.entries.find((e) => e.job.id === id)?.job ?? this.finished.find((j) => j.id === id);
    return job && JobQueue.copy(job);
  }

  /** Whether a job of this command is queued or running. */
  has(command: JobCommand): boolean {
    return this.entries.some((e) => e.job.command === command);
  }

  /** Starts every queued job the rules let run now. */
  private pump(): void {
    const running = this.entries.filter((e) => e.job.state === 'running');
    const busy = new Set(running.map((e) => e.job.project));
    let heavy = running.some((e) => HEAVY.has(e.job.command));
    for (const entry of this.entries) {
      if (entry.job.state !== 'queued') continue;
      const isHeavy = HEAVY.has(entry.job.command);
      // A job waiting for its project keeps the ones after it in the same project waiting too, so they run in order.
      if (busy.has(entry.job.project) || (isHeavy && heavy)) {
        busy.add(entry.job.project);
        continue;
      }
      busy.add(entry.job.project);
      if (isHeavy) heavy = true;
      void this.start(entry);
    }
  }

  private async start(entry: Entry): Promise<void> {
    const { job, request } = entry;
    job.state = 'running';
    job.startedAt = this.now();
    this.options.hub.emit({ event: 'job.started', data: { job: JobQueue.copy(job) } });
    let result: CommandResult;
    try {
      result = await this.options.run(request.args, (progress) => {
        job.progress = { ...progress };
        this.options.hub.emit({ event: 'job.progress', data: { id: job.id, progress: { ...progress } } });
      });
    } catch (err) {
      result = { ok: false, output: err instanceof Error ? err.message : String(err) };
    }
    try {
      await request.cleanup?.();
    } catch {
      // A temporary file that cannot be removed does not change how the job ended.
    }
    job.state = result.ok ? 'succeeded' : 'failed';
    job.output = result.output;
    job.finishedAt = this.now();
    this.entries = this.entries.filter((e) => e !== entry);
    this.finished = [job, ...this.finished].slice(0, FINISHED_KEPT);
    this.options.hub.emit({ event: 'job.finished', data: { job: JobQueue.copy(job) } });
    entry.resolve(JobQueue.copy(job));
    this.pump();
  }
}

/** The JSON line `--progress` prints for a finished sheet (tools/export.ts), or undefined for any other line. */
export function parseProgressLine(line: string): JobProgress | undefined {
  if (!line.startsWith('{"diorama":"progress"')) return undefined;
  try {
    const value = JSON.parse(line) as { done?: unknown; total?: unknown; sheet?: unknown };
    if (typeof value.done !== 'number' || typeof value.total !== 'number') return undefined;
    return { done: value.done, total: value.total, ...(typeof value.sheet === 'string' ? { current: value.sheet } : {}) };
  } catch {
    return undefined;
  }
}

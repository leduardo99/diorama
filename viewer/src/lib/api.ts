import { currentTranslator } from '../i18n/store';
import { jobs, type JobHooks } from './server-events';
import type { AssetFileMeta, DeletePlan, DeleteResult, Job, ProjectMeta } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? body?.output ?? currentTranslator().t('errors.request', { status: res.status }));
  return body as T;
}

function post<T>(url: string, payload: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** How a job the viewer ran ended: its command's ok and output (api.run). */
export interface CliResult {
  ok: boolean;
  output: string;
  /** `example` only: another process is bringing the sample in, so this one was not started. */
  running?: boolean;
  /** The finished job, when one ran. */
  job?: Job;
}

/** Whether `npm run example` is bringing the sample in: from the viewer, a terminal or another server (tools/lock.ts). */
export interface ExampleRun {
  running: boolean;
  startedAt?: string;
}

export const api = {
  assets: () => request<AssetFileMeta[]>('/__api/assets'),
  projects: () => request<ProjectMeta[]>('/__api/projects'),
  deletePlan: (project: string, subpath: string) =>
    request<DeletePlan>(`/__api/asset-files?${new URLSearchParams({ project, subpath })}`),
  deleteAsset: (input: { project: string; subpath: string; deleteSheet: boolean }) =>
    post<DeleteResult & { ok: true }>('/__api/delete', input),
  restoreAsset: (input: { project: string; trashId: string }) =>
    post<{ ok: true; restored: string[] }>('/__api/restore', input),
  deleteProject: (input: { project: string }) => post<{ ok: true; project: string; trashId: string }>('/__api/delete-project', input),
  restoreProject: (input: { project: string; trashId: string }) => post<{ ok: true; restored: string }>('/__api/restore-project', input),
  exampleRun: () => request<ExampleRun>('/__api/example-run'),
  // Queues a command as a job (`POST /__api/jobs`) and resolves once it has finished, from the server's events
  // (server-events.ts). A failed command resolves with ok:false and its output; a bad request rejects. An `example`
  // while another process brings the sample in (409) resolves with running:true, since it is no failure.
  run: async (payload: Record<string, unknown>, hooks?: JobHooks): Promise<CliResult> => {
    const res = await fetch('/__api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (res.status === 409 && body?.running) return { ok: false, running: true, output: body.error ?? '' };
    if (!res.ok) throw new Error(body?.error ?? currentTranslator().t('errors.request', { status: res.status }));
    const job = await jobs.wait((body as { job: Job }).job, hooks);
    return { ok: job.state === 'succeeded', output: job.output ?? '', job };
  },
};

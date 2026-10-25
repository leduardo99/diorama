import { currentTranslator } from '../i18n/store';
import type { AssetFileMeta, DeletePlan, DeleteResult, ProjectMeta } from './types';

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

export interface CliResult {
  ok: boolean;
  output: string;
  /** `example` only: another run of it is bringing the sample in, so this one was not started. */
  running?: boolean;
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
  // The cli endpoint answers 200 with ok:false when a script fails, 400 when the request itself is invalid and 409
  // (running: true) for an `example` while another run of it goes on.
  cli: async (payload: Record<string, unknown>): Promise<CliResult> => {
    const res = await fetch('/__api/cli', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as CliResult;
  },
};

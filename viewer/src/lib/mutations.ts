import { createElement } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { api } from './api';
import { exportFailureText, failedSheets } from './export-errors';
import type { JobHooks } from './server-events';
import { exportTarget, pendingExports, progressPercent } from './export-state';
import { ToastProgress } from '../components/toast-progress';
import { useT } from '../i18n';
import type { Translator } from '../i18n/core';
import { stripExtension } from './format';
import { projectDir } from './project-paths';
import { assetsQuery, exampleRunQuery, projectsQuery } from './queries';
import type { AssetFileMeta } from './types';

/** Disk changed under the catalog: refetch everything derived from it. */
function useRefreshCatalog() {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['assets'] }),
    queryClient.invalidateQueries({ queryKey: ['projects'] }),
  ]);
}

export function useRestoreAssets() {
  const refresh = useRefreshCatalog();
  const { t } = useT();
  return useMutation({
    mutationFn: (entries: Array<{ project: string; trashId: string }>) => Promise.all(entries.map(api.restoreAsset)),
    onSuccess: async () => {
      await refresh();
      toast.success(t('toasts.restored'));
    },
    onError: (error) => toast.error(t('toasts.undoFailed'), { description: error.message }),
  });
}

/** Moves one or more exported assets (and optionally their sheets) to the trash, with an undo toast. */
export function useDeleteAssets() {
  const refresh = useRefreshCatalog();
  const restore = useRestoreAssets();
  const { t, plural } = useT();
  return useMutation({
    mutationFn: async (input: { assets: AssetFileMeta[]; deleteSheet: boolean }) => {
      const results = [];
      for (const { project, subpath } of input.assets) {
        results.push(await api.deleteAsset({ project, subpath, deleteSheet: input.deleteSheet }));
      }
      return results;
    },
    onSuccess: async (results) => {
      await refresh();
      const files = results.reduce((sum, r) => sum + r.moved.length, 0);
      toast(t('toasts.movedToTrash'), {
        description: t('toasts.movedDescription', {
          what: results.length === 1 ? results[0].subpath : plural('counts.assets', results.length),
          files: plural('counts.files', files),
        }),
        duration: 9000,
        action: {
          label: t('common.undo'),
          onClick: () => restore.mutate(results.map(({ project, trashId }) => ({ project, trashId }))),
        },
      });
    },
    onError: (error) => toast.error(t('toasts.deleteFailed'), { description: error.message }),
  });
}

export function useDeleteProject() {
  const refresh = useRefreshCatalog();
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const restore = useMutation({
    mutationFn: api.restoreProject,
    onSuccess: async ({ restored }) => {
      await refresh();
      toast.success(t('toasts.projectRestored'), { description: restored });
    },
    onError: (error) => toast.error(t('toasts.projectRestoreFailed'), { description: error.message }),
  });
  return useMutation({
    mutationFn: api.deleteProject,
    onSuccess: async ({ project, trashId }) => {
      await refresh();
      queryClient.removeQueries({ queryKey: ['atlas', project] });
      void navigate({ to: '/', replace: true });
      toast(t('toasts.projectMovedToTrash'), {
        description: project,
        duration: 12000,
        action: { label: t('common.undo'), onClick: () => restore.mutate({ project, trashId }) },
      });
    },
    onError: (error) => toast.error(t('toasts.projectDeleteFailed'), { description: error.message }),
  });
}

/** Runs tools/cli.ts or tools/export.ts as a job; the New dialog shows the output itself. */
export function useCli() {
  const refresh = useRefreshCatalog();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.run(payload),
    // Awaited, so callers that navigate right after a create see the new project in the catalog.
    onSuccess: async (result) => {
      if (result.ok) await refresh();
    },
  });
}

/** The project `npm run example` brings in: Soulkeeper, the sample game, copied from examples/soulkeeper to projects/soulkeeper. */
export const SAMPLE_PROJECT = 'soulkeeper';

/** What a terminal runs for the same thing: the empty state shows it to copy. */
export const SAMPLE_COMMAND = 'npm run example';

/**
 * Brings the sample in: `example` copies it into projects/ and exports it there (tools/cli.ts), then the project opens
 * if the user is still on the start page (they may have opened another project meanwhile; the toast offers it then).
 * The callbacks live on the hook: the empty state that starts it may be gone when it ends. A failed run leaves its
 * output in `data` for the empty state to show; a run refused because another one goes on (`running`) is no failure:
 * the empty state shows that one running.
 */
export function useTrySample() {
  const refresh = useRefreshCatalog();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: () => api.run({ command: 'example' }),
    onSuccess: async (result) => {
      // A run that failed half way may still have copied the project: the catalog shows what is there either way.
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: exampleRunQuery.queryKey })]);
      if (!result.ok) return;
      const open = () => void router.navigate({ to: '/p/$project', params: { project: SAMPLE_PROJECT } });
      const onStartPage = Boolean(router.matchRoute({ to: '/' }));
      toast.success(t('projects.none.sampleReady'), {
        description: projectDir(SAMPLE_PROJECT),
        action: onStartPage ? undefined : { label: t('projects.none.open', { project: SAMPLE_PROJECT }), onClick: open },
      });
      if (onStartPage) open();
    },
  });
}

/**
 * Keeps an export's toast up to date with its job: waiting behind another job, then the sheets as they finish. The
 * bar fills with the sheets already on disk; the title counts the one being exported.
 */
function exportToastHooks(toastId: string | number, project: string, t: Translator['t']): JobHooks {
  return {
    onQueued: () => toast.loading(t('toasts.exportQueued', { project }), { id: toastId }),
    onStarted: () => toast.loading(t('toasts.exporting'), { id: toastId, description: null }),
    onProgress: ({ done, total, current }) => {
      const title = t('toasts.exportingProgress', { current: Math.min(done + 1, total), total });
      toast.loading(title, { id: toastId, description: createElement(ToastProgress, { detail: current ?? '', value: progressPercent(done, total), label: title }) });
    },
  };
}

/**
 * Re-runs tools/export.ts for one asset, as a job. The callbacks live on the hook, not on mutate():
 * the menu that triggers this unmounts as soon as it closes, and mutate-level callbacks die with it.
 */
export function useReexport() {
  const refresh = useRefreshCatalog();
  const { t } = useT();
  return useMutation({
    mutationFn: async ({ project, subpath }: { project: string; subpath: string }) => {
      const toastId = toast.loading(t('toasts.exporting'), { description: subpath });
      try {
        const result = await api.run({ command: 'export', project, subpaths: [stripExtension(subpath)] }, {
          ...exportToastHooks(toastId, project, t),
          onProgress: undefined,
          onStarted: () => toast.loading(t('toasts.exporting'), { id: toastId, description: subpath }),
        });
        if (!result.ok) {
          toast.error(t('toasts.exportFailed'), { id: toastId, description: exportFailureText(result.output, t('toasts.fixTypeErrors')) });
          return;
        }
        await refresh();
        toast.success(t('toasts.exportedAgain'), { id: toastId, description: subpath });
      } catch (error) {
        toast.error(t('toasts.exportFailed'), { id: toastId, description: error instanceof Error ? error.message : String(error) });
      }
    },
  });
}

/**
 * Exports sheets in one job, so one headless browser renders them all, behind a single toast that counts them. The
 * export goes on past a sheet that fails: the toast at the end names the ones that failed.
 */
export function useExportSheets() {
  const refresh = useRefreshCatalog();
  const { t, plural } = useT();
  return useMutation({
    mutationFn: async ({ project, sheets }: { project: string; sheets: string[] }) => {
      const toastId = toast.loading(t('toasts.exporting'));
      try {
        const result = await api.run({ command: 'export', project, subpaths: sheets.map(exportTarget) }, exportToastHooks(toastId, project, t));
        if (result.ok) {
          // The bar goes with the run: the toast that counted it says only how many were exported.
          toast.success(plural('toasts.assetsExported', sheets.length), { id: toastId, description: null });
          return;
        }
        const failed = failedSheets(result.output);
        toast.error(failed.length ? t('toasts.exportSomeFailed', { failed: failed.length, total: sheets.length }) : t('toasts.exportFailed'), {
          id: toastId,
          description: failed.length ? failed.join('\n') : exportFailureText(result.output, t('toasts.fixTypeErrors')),
        });
      } catch (error) {
        toast.error(t('toasts.exportFailed'), { id: toastId, description: error instanceof Error ? error.message : String(error) });
      }
    },
    onSettled: refresh,
  });
}

/** The folder the project's gear items are generated into (`sheets/gear/`, by `gear-items`) and exported to (`assets/gear/`). */
const GEAR_ITEMS = 'gear/';

/**
 * Brings the exported gear items (the pickers' thumbnails) up to date: writes a file for every part that has none, and
 * exports the folder when something in it is missing or older than its sheet.
 */
export function useRefreshGearItems() {
  const queryClient = useQueryClient();
  const refresh = useRefreshCatalog();
  const { t, plural } = useT();
  return useMutation({
    mutationFn: async ({ project }: { project: string }) => {
      const toastId = toast.loading(t('toasts.gearUpdating'));
      try {
        const created = await api.run({ command: 'gear-items', project });
        if (!created.ok) throw new Error(created.output);
        await refresh();
        const assets = (queryClient.getQueryData(assetsQuery.queryKey) ?? []).filter((a) => a.project === project && a.subpath.startsWith(GEAR_ITEMS));
        const meta = queryClient.getQueryData(projectsQuery.queryKey)?.find((p) => p.name === project);
        const pending = pendingExports(assets, meta && { ...meta, pendingSheets: meta.pendingSheets.filter((s) => s.startsWith(GEAR_ITEMS)) });
        const count = pending.stale.length + pending.missing.length;
        if (count === 0) {
          toast.success(t('toasts.gearUpToDate'), { id: toastId, description: plural('toasts.gearExported', assets.length) });
          return;
        }
        toast.loading(t('toasts.gearExporting'), { id: toastId, description: plural('toasts.gearChanged', count) });
        const exported = await api.run({ command: 'export', project, subpaths: [GEAR_ITEMS] });
        if (!exported.ok) throw new Error(exportFailureText(exported.output, t('toasts.fixTypeErrors')));
        toast.success(t('toasts.gearUpdated'), { id: toastId, description: plural('toasts.gearExported', count) });
      } catch (error) {
        toast.error(t('toasts.gearUpdateFailed'), { id: toastId, description: error instanceof Error ? error.message : String(error) });
      }
    },
    onSettled: refresh,
  });
}

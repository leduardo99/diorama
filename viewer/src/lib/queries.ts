import { queryOptions } from '@tanstack/react-query';
import { api } from './api';
import type { AssetFileMeta } from './types';
import type { Atlas } from './atlas';
import { currentTranslator } from '../i18n/store';
import { projectUrl } from './project-paths';

export const projectsQuery = queryOptions({
  queryKey: ['projects'],
  queryFn: api.projects,
});

export const assetsQuery = queryOptions({
  queryKey: ['assets'],
  queryFn: api.assets,
});

/** Whether `npm run example` is running (any run: the viewer's, a terminal's): the empty state shows it as running. */
export const exampleRunQuery = queryOptions({
  queryKey: ['example-run'],
  queryFn: api.exampleRun,
});

export const deletePlanQuery = (project: string, subpath: string) =>
  queryOptions({
    queryKey: ['delete-plan', project, subpath],
    queryFn: () => api.deletePlan(project, subpath),
    // The plan is a snapshot of the disk: never reuse one from an earlier open of the dialog.
    gcTime: 0,
  });

/** An atlas only changes when the asset is re-exported, which changes its mtime. */
export const atlasQuery = (asset: AssetFileMeta) =>
  queryOptions({
    queryKey: ['atlas', asset.project, asset.atlas, asset.mtime],
    enabled: asset.atlas !== null,
    staleTime: Infinity,
    queryFn: async (): Promise<Atlas> => {
      const res = await fetch(`${projectUrl(asset.project, `assets/${asset.atlas}`)}?t=${asset.mtime}`);
      if (!res.ok) throw new Error(currentTranslator().t('errors.readFile', { path: asset.atlas ?? '' }));
      return res.json();
    },
  });

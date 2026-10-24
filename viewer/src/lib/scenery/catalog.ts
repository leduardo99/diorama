import { queryOptions } from '@tanstack/react-query';
import type { SceneData, SceneryCatalog } from '@core/volume';
import { kitCatalogUrl, sceneUrl } from '../project-paths';

/** The name of the scene the built-in kit brings (`?fixture=true`). */
export const FIXTURE_SCENE_NAME = 'cantinho-do-cemiterio';

/** A scene saved in the project: `src/scenes/<name>.ts` exports it as `SCENE`. */
export interface SavedScene {
  name: string;
  scene: SceneData;
}

/** Loads a project's scenery catalog (`src/scenery/catalog.ts`). The dev server transforms the file on request. */
export const loadCatalog = async (project: string) =>
  ((await import(/* @vite-ignore */ kitCatalogUrl(project, 'scenery'))) as { SCENERY: SceneryCatalog }).SCENERY;

/** Loads a saved scene. A stamp keeps the browser from reusing a copy of a scene that was saved again. */
export const loadScene = async (project: string, name: string) =>
  ((await import(/* @vite-ignore */ `${sceneUrl(project, name)}?t=${Date.now()}`)) as { SCENE: SceneData }).SCENE;

/**
 * The scenery catalog of a project, or null when it has no `src/scenery/catalog.ts` (`available` comes from the server
 * catalog, which looks at the disk: a kit created while the viewer runs shows up at the next refresh). `fixture` loads
 * the built-in kit instead, to develop the tab without a project kit. The catalog holds functions and class
 * instances: it is kept as is.
 */
export const sceneryQuery = (project: string, fixture: boolean, available: boolean) =>
  queryOptions({
    queryKey: ['scenery', project, fixture, available],
    staleTime: Infinity,
    structuralSharing: false,
    queryFn: async (): Promise<SceneryCatalog | null> => {
      if (fixture) return (await import('./fixture')).FIXTURE_SCENERY;
      if (!available) return null;
      return loadCatalog(project);
    },
  });

/** The scenes saved in a project (`names` come from the server catalog), by name. The fixture brings one so loading can be tried. */
export const savedScenesQuery = (project: string, fixture: boolean, names: string[]) =>
  queryOptions({
    queryKey: ['saved-scenes', project, fixture, names.join(',')],
    staleTime: Infinity,
    structuralSharing: false,
    queryFn: async (): Promise<SavedScene[]> => {
      if (fixture) return [{ name: FIXTURE_SCENE_NAME, scene: (await import('./fixture')).FIXTURE_SCENE }];
      return Promise.all(names.map(async (name) => ({ name, scene: await loadScene(project, name) })));
    },
  });

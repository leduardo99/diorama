import { queryOptions } from '@tanstack/react-query';
import type { SceneData, SceneRenderer, SceneryCatalog } from '@core/volume';
import type * as Living from './living';
import type { Geometry } from './render';

/**
 * A saved scene, ready to stand in the playground: its floors and decals drawn once (what never covers a character),
 * and a renderer that holds the frames of everything that stands (walls, fences, doors, props), drawn at the same
 * scale, so characters can be sorted in among them every frame. The engine and the code that plays a scene
 * (`living.ts`) load with the first scene chosen, not with the playground.
 */
export interface World {
  catalog: SceneryCatalog;
  /** The scene as saved: doors and pieces rest in their saved states. */
  scene: SceneData;
  geo: Geometry;
  renderer: SceneRenderer;
  /** The code that plays a scene, loaded with it. */
  living: typeof Living;
  /** Floors and decals, drawn once at `scale` (the export scale: one drawn pixel is one exported pixel). */
  background: HTMLCanvasElement;
  scale: number;
  /** Its size in actor units (exported pixels), the unit the playground works in. */
  width: number;
  height: number;
}

/** The floors and decals alone: what is drawn as the ground (placements, which stand, are left out). */
export function groundOf(scene: SceneData): SceneData {
  const { figures: _figures, ...rest } = scene;
  return { ...rest, walls: scene.walls.map((line) => line.map(() => null)), props: [] };
}

/**
 * Loads a saved scene of the project (or the fixture's) and draws its ground. The picture is made once, at the export
 * scale: zooming only scales it with hard edges, as it does the characters, so a zoom never draws a frame again.
 */
export const sceneWorldQuery = (project: string, name: string, fixture: boolean) =>
  queryOptions({
    queryKey: ['scene-world', project, name, fixture],
    staleTime: Infinity,
    gcTime: 60_000,
    structuralSharing: false,
    queryFn: async (): Promise<World> => {
      const [{ validateScene, createSceneRenderer }, { loadCatalog, loadScene }, { geometryOf, paintScene }, living] = await Promise.all([import('@core/volume'), import('./catalog'), import('./render'), import('./living')]);
      const [catalog, scene] = fixture
        ? await import('./fixture').then((f) => [f.FIXTURE_SCENERY, f.FIXTURE_SCENE] as const)
        : await Promise.all([loadCatalog(project), loadScene(project, name)]);
      const problems = validateScene(scene, catalog);
      if (problems.length) throw new Error(problems[0]);
      const geo = geometryOf(scene, catalog);
      const renderer = createSceneRenderer(catalog);
      const background = document.createElement('canvas');
      const scale = living.WORLD_SCALE;
      const error = paintScene(background, renderer, geo, groundOf(scene), scale);
      if (error) throw new Error(error);
      return { catalog, scene, geo, renderer, living, background, scale, width: geo.width * scale, height: geo.height * scale };
    },
  });

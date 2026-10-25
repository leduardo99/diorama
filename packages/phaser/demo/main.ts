/**
 * The test bench of @diorama/phaser, served at `/packages/phaser/demo/` by `npm run view`: one character of a project's
 * exports played by the package. `?project=<name>` (default soulkeeper) and `?character=<id>` (default its first) pick it;
 * the projects and their characters (the folders of `assets/characters/` whose sheets are characters) come from the dev
 * server's catalog (`/__api/projects`, `/__api/assets`), which lists the viewer's projects, those of `projects/` (the
 * sample once `npm run example` has copied it there), and the exports are read where the server serves them,
 * `/projects/<project>/assets/`. `?renderer=canvas` or `webgl` picks a renderer (default: WebGL
 * when the browser has it), and `?clock=manual` stops the loop for a test, which then steps it with `window.bench.step(frames)`.
 *
 * It is no project's game (a project's game is its own `game/`, rule 8 of docs/ARCHITECTURE.md): it imports the package's
 * own files, the runtime and Phaser only, like the package itself (tests/engine/boundary.test.ts).
 */

import Phaser from 'phaser';
import { manualClock, sleepOnStart, withDiorama } from '../src/index.js';
import { BenchScene, SIZE } from './bench.js';
import { language, renderFooter, renderNothing, type BenchProject, type Nothing } from './footer.js';

const query = new URLSearchParams(location.search);
const manual = query.get('clock') === 'manual';
const renderers: Record<string, number> = { canvas: Phaser.CANVAS, webgl: Phaser.WEBGL };
const lang = language();
const parent = document.getElementById('game')!;
const footer = document.getElementById('footer')!;
const nothingBox = document.getElementById('nothing')!;

declare global {
  interface Window {
    /** What a test reads and drives: the game, the scene, and with `?clock=manual`, the clock. */
    bench?: { game: Phaser.Game; scene: () => BenchScene; step?: (frames?: number, ms?: number) => void };
  }
}

/** What the catalog says of a project and of an asset, the little the bench reads. */
interface CatalogProject {
  name: string;
}
interface CatalogAsset {
  project: string;
  subpath: string;
  /** `character` is the clip's manifest, its id and the name people read (null for older atlases without one). */
  atlasInfo: { role: string | null; character?: { name: string; label: string } | null } | null;
}

const CHARACTER_SHEET = /^characters\/([^/]+)\/[^/]+\.png$/;

/** The projects that have exported characters, and their character folders in the catalog's order, each with its label. */
async function readCatalog(): Promise<BenchProject[] | null> {
  try {
    const [projects, assets] = await Promise.all(['/__api/projects', '/__api/assets'].map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.json() as Promise<unknown>;
    })) as [CatalogProject[], CatalogAsset[]];
    const byProject = new Map<string, Map<string, string>>();
    for (const asset of assets) {
      const id = CHARACTER_SHEET.exec(asset.subpath)?.[1];
      if (!id || asset.atlasInfo?.role !== 'character') continue;
      const characters = byProject.get(asset.project) ?? byProject.set(asset.project, new Map()).get(asset.project)!;
      if (!characters.has(id) || asset.atlasInfo.character) characters.set(id, asset.atlasInfo.character?.label ?? id);
    }
    return projects.flatMap(({ name }) => {
      const characters = byProject.get(name);
      return characters ? [{ name, characters: [...characters].map(([id, label]) => ({ id, label })) }] : [];
    });
  } catch {
    return null;
  }
}

/** No canvas: the page says why, with the links that lead to something to play. */
function showNothing(projects: BenchProject[], nothing: Nothing) {
  parent.hidden = true;
  renderNothing(nothingBox, lang, projects, nothing);
}

document.documentElement.lang = lang;
const catalog = await readCatalog();
const projectName = query.get('project') ?? 'soulkeeper';
const project = catalog?.find((p) => p.name === projectName) ?? null;
const character = query.get('character') ?? project?.characters[0]?.id ?? null;
renderFooter(footer, lang, catalog ?? [], project, character);

if (!catalog) {
  showNothing([], { kind: 'catalog' });
} else if (!project) {
  showNothing(catalog, { kind: 'project', name: projectName });
} else if (character === null || !project.characters.some((c) => c.id === character)) {
  showNothing(catalog, { kind: 'character', id: character ?? '', project });
} else {
  const game: Phaser.Game = new Phaser.Game(withDiorama({
    type: renderers[query.get('renderer') ?? ''] ?? Phaser.AUTO,
    parent,
    width: SIZE.width,
    height: SIZE.height,
    backgroundColor: '#14121a',
    banner: false,
    audio: { noAudio: true },
    // The canvas keeps its 1280 × 720 pixels and is shown to fit the window above the footer, never larger: where there is
    // room, one canvas px is one screen px and every frame is drawn as it was exported; a smaller window shrinks it whole.
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, max: { width: SIZE.width, height: SIZE.height } },
    scene: new BenchScene({
      folder: `characters/${character}`,
      // The catalog's projects are the folders of projects/, served from the repository's root.
      assets: `/projects/${project.name}/assets/`,
      onUnknown: () => {
        game.destroy(true);
        showNothing(catalog, { kind: 'character', id: character, project });
      },
    }),
    callbacks: manual ? { postBoot: sleepOnStart } : {},
  }));
  window.bench = { game, scene: () => game.scene.getScene('bench') as BenchScene, step: manual ? manualClock(game) : undefined };
}

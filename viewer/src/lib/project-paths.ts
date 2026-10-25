/**
 * Where a project's files are, as the viewer names them. The viewer's projects are the folders of `projects/` (the
 * server lists no other: the samples in `examples/` ship with Diorama, and `npm run example` copies one in). Inside a
 * project: `src/` (code), `sheets/` (one file per exported sheet), `assets/` (the exports), `review/` (scratch).
 */

/** The folder of the repository that holds the viewer's projects (`VIEWER_ROOTS` in tools/project.ts). */
const PROJECTS = 'projects';

/** The project's folder from the repository root, as typed in a terminal: `projects/soulkeeper`. */
export const projectDir = (name: string) => `${PROJECTS}/${name}`;

/** A file of the project from the repository root: `projects/soulkeeper/sheets/gear/helm.ts`. */
export const projectFile = (name: string, path: string) => `${projectDir(name)}/${path}`;

/** Where the dev server serves a file of the project from: `/projects/soulkeeper/src/gear/catalog.ts`. */
export const projectUrl = (name: string, path: string) => `/${projectFile(name, path)}`;

/** Where a project's kit catalogs are (`src/<kit>/catalog.ts`): the customize and scenery tabs import them. */
export const kitCatalogUrl = (name: string, kit: 'gear' | 'scenery') => projectUrl(name, `src/${kit}/catalog.ts`);

/** A scene saved by the scene painter: `src/scenes/<name>.ts` exports it as `SCENE`. */
export const sceneUrl = (name: string, scene: string) => projectUrl(name, `src/scenes/${scene}.ts`);

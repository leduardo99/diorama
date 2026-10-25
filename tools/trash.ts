/**
 * The trash a project goes to when it is deleted: `<repo>/.diorama-trash/projects/<id>/<project>`, outside every project,
 * so no tool that lists projects or checks a layout ever sees it, and a delete can be undone by moving the folder back.
 * The viewer's "Delete project" (viewer/server/assets-fs.ts) and `npm run example -- --force` (tools/cli.ts) share it;
 * the viewer's asset deletes keep their own entries beside it, in `.diorama-trash/assets/`.
 *
 * Only the projects of `projects/` (VIEWER_ROOTS) are moved: a sample of `examples/` ships with Diorama.
 */

import { existsSync } from 'node:fs';
import { lstat, mkdir, readdir, realpath, rename, rm, rmdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { VIEWER_ROOTS, findProject } from './project.js';

/** A request that names something it may not touch, or nothing at all: the viewer answers it with 400. */
export class PathError extends Error {}

const PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TRASH_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function safeProjectName(name: unknown): string {
  const s = String(name ?? '');
  if (!PROJECT_RE.test(s) || s.includes('..')) throw new PathError(`Invalid project name "${s}".`);
  return s;
}

export function safeTrashId(raw: unknown): string {
  const s = String(raw ?? '');
  if (!TRASH_ID_RE.test(s) || s.includes('..')) throw new PathError(`Invalid trash id "${s}".`);
  return s;
}

/** Where deletes wait, outside every project. */
export function trashRoot(repo: string): string {
  return resolve(repo, '.diorama-trash');
}

/** Deleted projects wait here, outside projects/. */
export function projectTrashDir(repo: string): string {
  return join(trashRoot(repo), 'projects');
}

/** A new entry's name: the time it was made, unique once the caller adds `-<n>` on a clash. */
export function newTrashId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** Removes `from` and then each parent that is left empty, up to (not including) `stopAt`. */
export async function pruneEmptyDirs(from: string, stopAt: string): Promise<void> {
  let dir = from;
  while (dir.startsWith(stopAt + sep)) {
    const entries = await readdir(dir).catch(() => null);
    if (!entries || entries.length > 0) return;
    await rmdir(dir).catch(() => {});
    dir = dirname(dir);
  }
}

export interface ProjectTrashResult {
  trashId: string;
  project: string;
}

/** Moves a whole project folder of projects/ to <repo>/.diorama-trash/projects/<id>/<project>, where restoreProject finds it. */
export async function deleteProject(repo: string, projectInput: string): Promise<ProjectTrashResult> {
  const project = safeProjectName(projectInput);
  const ref = findProject(project, repo, VIEWER_ROOTS);
  if (!ref) throw new PathError(`Project "${project}" does not exist in projects/.`);
  const projectsDir = resolve(repo, 'projects');
  const info = await lstat(ref.dir).catch(() => null);
  if (!info?.isDirectory()) throw new PathError(`Project "${project}" does not exist.`);
  if (!(await realpath(ref.dir)).startsWith((await realpath(projectsDir)) + sep)) {
    throw new PathError(`Project "${project}" resolves outside ${projectsDir}.`);
  }

  const root = projectTrashDir(repo);
  let trashId = newTrashId();
  for (let n = 1; existsSync(join(root, trashId)); n++) trashId = `${newTrashId()}-${n}`;
  await mkdir(join(root, trashId), { recursive: true });
  await rename(ref.dir, join(root, trashId, project));
  return { trashId, project };
}

/** Moves a trashed project back into projects/. Refuses if a project with that name is there again. */
export async function restoreProject(repo: string, projectInput: string, trashIdInput: string): Promise<{ restored: string }> {
  const project = safeProjectName(projectInput);
  const trashId = safeTrashId(trashIdInput);
  const from = join(projectTrashDir(repo), trashId, project);
  const to = resolve(repo, 'projects', project);
  if (!existsSync(from)) throw new PathError(`Nothing in the trash for project "${project}" (${trashId}).`);
  if (existsSync(to) || (await lstat(to).catch(() => null))) throw new PathError(`Cannot restore, project "${project}" already exists.`);
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
  await rm(join(projectTrashDir(repo), trashId), { recursive: true, force: true });
  await pruneEmptyDirs(projectTrashDir(repo), dirname(trashRoot(repo)));
  return { restored: project };
}

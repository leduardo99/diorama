/**
 * Filesystem side of the viewer's delete / undo feature.
 *
 * A project is found by name in projects/ only (tools/project.ts, VIEWER_ROOTS): the samples in examples/ ship with
 * Diorama and the viewer never touches them. Every path that reaches the disk goes through safeProjectName /
 * safeSubpath and a containment check, so a request can only touch files inside <project>/assets or <project>/sheets.
 * Deleting moves files to <repo>/.diorama-trash/assets/<project>/<id>/ together with a manifest (the trash lives outside
 * the project: a project root holds only src/, sheets/, assets/, review/); restore moves them back. A whole project goes
 * to <repo>/.diorama-trash/projects/<id>/<project>, which `npm run example -- --force` uses too for the copy it replaces.
 */

import { existsSync } from 'node:fs';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { LAYOUT, VIEWER_ROOTS, findProject, type ProjectRef, type ProjectRoot } from '../../tools/project';

export class PathError extends Error {}

export type Area = 'assets' | 'sheets';
export type FileKind = 'image' | 'atlas' | 'sheet';

export interface PlannedFile {
  kind: FileKind;
  area: Area;
  /** Path relative to <project>/<area>, forward slashes. */
  rel: string;
  /** Path relative to the repository root, forward slashes. */
  path: string;
  /** Sheet files only go when the caller asks for it. */
  optional: boolean;
}

export interface DeletePlan {
  project: string;
  subpath: string;
  files: PlannedFile[];
}

export interface DeleteResult {
  trashId: string;
  project: string;
  subpath: string;
  moved: PlannedFile[];
}

const PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TRASH_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|svg)$/i;
const SHEET_EXT = '.ts';

export function safeProjectName(name: unknown): string {
  const s = String(name ?? '');
  if (!PROJECT_RE.test(s) || s.includes('..')) throw new PathError(`Invalid project name "${s}".`);
  return s;
}

/** A relative path made only of plain segments: no "..", ".", empty segments, backslashes or drive letters. */
export function safeSubpath(raw: unknown): string {
  const s = String(raw ?? '');
  if (!s) throw new PathError('Path is empty.');
  if (s.includes('\0') || s.includes('\\') || s.includes(':')) throw new PathError(`Invalid path "${s}".`);
  const parts = s.split('/');
  for (const part of parts) {
    if (part === '' || part === '.' || part === '..') throw new PathError(`Invalid path "${s}".`);
  }
  return parts.join('/');
}

export function safeTrashId(raw: unknown): string {
  const s = String(raw ?? '');
  if (!TRASH_ID_RE.test(s) || s.includes('..')) throw new PathError(`Invalid trash id "${s}".`);
  return s;
}

/** Joins rel onto root and refuses anything that resolves outside root (including through symlinks). */
export async function resolveInside(root: string, rel: string): Promise<string> {
  const abs = resolve(root, ...rel.split('/'));
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  if (!abs.startsWith(rootPrefix)) throw new PathError(`Path escapes ${root}: ${rel}`);
  // Symlinked folders can lead out of root even when the lexical path looks fine.
  let probe = dirname(abs);
  while (!existsSync(probe) && probe !== root) probe = dirname(probe);
  if (existsSync(probe)) {
    const realRoot = await realpath(root);
    const realProbe = await realpath(probe);
    if (realProbe !== realRoot && !realProbe.startsWith(realRoot + sep)) {
      throw new PathError(`Path escapes ${root} through a symlink: ${rel}`);
    }
  }
  return abs;
}

export function stripImageExt(subpath: string): string {
  if (!IMAGE_EXT_RE.test(subpath)) throw new PathError(`"${subpath}" is not an exported image.`);
  return subpath.replace(IMAGE_EXT_RE, '');
}

/** Where the viewer's deletes wait, outside every project so no tool that lists projects or checks a layout sees them. */
function trashRoot(repo: string): string {
  return resolve(repo, '.diorama-trash');
}

/** A project of the viewer: `projects/<name>`, never a sample of `examples/`. */
function viewerProject(repo: string, name: string): ProjectRef | undefined {
  return findProject(name, repo, VIEWER_ROOTS);
}

function projectPaths(repo: string, project: string) {
  const name = safeProjectName(project);
  const ref = viewerProject(repo, name);
  if (!ref) throw new PathError(`Project "${name}" does not exist in projects/.`);
  return {
    ref,
    assetsDir: join(ref.dir, LAYOUT.assets),
    sheetsDir: join(ref.dir, LAYOUT.sheets),
    trashDir: join(trashRoot(repo), 'assets', ref.name),
  };
}

const areaDir = (paths: { assetsDir: string; sheetsDir: string }, area: Area) => (area === 'assets' ? paths.assetsDir : paths.sheetsDir);

function repoRel(ref: ProjectRef, area: Area, rel: string): string {
  return `${ref.rel}/${area}/${rel}`;
}

/** The files a delete of this exported image would move. Only files that exist are listed. */
export async function planDelete(repo: string, projectInput: string, subpathInput: string): Promise<DeletePlan> {
  const subpath = safeSubpath(subpathInput);
  const base = stripImageExt(subpath);
  const paths = projectPaths(repo, projectInput);
  const { ref } = paths;

  const candidates: Array<Omit<PlannedFile, 'path'>> = [
    { kind: 'image', area: 'assets', rel: subpath, optional: false },
    { kind: 'atlas', area: 'assets', rel: `${base}.json`, optional: false },
    { kind: 'sheet', area: 'sheets', rel: `${base}${SHEET_EXT}`, optional: true },
  ];

  const files: PlannedFile[] = [];
  for (const c of candidates) {
    const abs = await resolveInside(areaDir(paths, c.area), c.rel);
    if (existsSync(abs)) files.push({ ...c, path: repoRel(ref, c.area, c.rel) });
  }
  if (!files.some((f) => f.kind === 'image')) throw new PathError(`No exported file at ${ref.name}/${subpath}.`);
  return { project: ref.name, subpath, files };
}

function newTrashId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function pruneEmptyDirs(from: string, stopAt: string): Promise<void> {
  let dir = from;
  while (dir.startsWith(stopAt + sep)) {
    const entries = await readdir(dir).catch(() => null);
    if (!entries || entries.length > 0) return;
    await rmdir(dir).catch(() => {});
    dir = dirname(dir);
  }
}

export async function deleteAsset(
  repo: string,
  projectInput: string,
  subpathInput: string,
  opts: { deleteSheet?: boolean } = {},
): Promise<DeleteResult> {
  const plan = await planDelete(repo, projectInput, subpathInput);
  const paths = projectPaths(repo, plan.project);
  const { ref, trashDir } = paths;
  const toMove = plan.files.filter((f) => !f.optional || opts.deleteSheet);

  let trashId = newTrashId();
  for (let n = 1; existsSync(join(trashDir, trashId)); n++) trashId = `${newTrashId()}-${n}`;
  const entryDir = join(trashDir, trashId);

  const moved: PlannedFile[] = [];
  try {
    for (const file of toMove) {
      const from = await resolveInside(areaDir(paths, file.area), file.rel);
      const to = await resolveInside(join(entryDir, file.area), file.rel);
      await mkdir(dirname(to), { recursive: true });
      await rename(from, to);
      moved.push(file);
    }
  } catch (err) {
    // Put back whatever was already moved so a failed delete never leaves half an asset behind.
    for (const file of moved.reverse()) {
      await rename(join(entryDir, file.area, ...file.rel.split('/')), resolve(areaDir(paths, file.area), ...file.rel.split('/'))).catch(() => {});
    }
    await rm(entryDir, { recursive: true, force: true });
    throw err;
  }

  await writeFile(
    join(entryDir, 'manifest.json'),
    JSON.stringify({ id: trashId, project: ref.name, root: ref.root, subpath: plan.subpath, deletedAt: new Date().toISOString(), files: moved.map(({ kind, area, rel }) => ({ kind, area, rel })) }, null, 2),
    'utf8',
  );

  for (const file of moved) {
    const root = areaDir(paths, file.area);
    await pruneEmptyDirs(dirname(resolve(root, ...file.rel.split('/'))), root);
  }
  return { trashId, project: ref.name, subpath: plan.subpath, moved };
}

interface Manifest {
  project: string;
  /** Where the project lived when the asset was deleted. */
  root?: ProjectRoot;
  subpath: string;
  files: Array<{ kind: FileKind; area: Area; rel: string }>;
}

/** Moves a trashed asset back. Refuses (and moves nothing) if any destination file exists again. */
export async function restoreAsset(repo: string, projectInput: string, trashIdInput: string): Promise<{ restored: string[] }> {
  const trashId = safeTrashId(trashIdInput);
  const paths = projectPaths(repo, projectInput);
  const { ref, trashDir } = paths;
  const entryDir = join(trashDir, trashId);
  const manifestPath = join(entryDir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new PathError(`Nothing in the trash with id ${trashId}.`);

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  if (manifest.project !== ref.name || !Array.isArray(manifest.files)) throw new PathError('Trash manifest does not match this project.');
  if (manifest.root !== undefined && manifest.root !== ref.root) throw new PathError(`The asset was deleted from ${manifest.root}/${ref.name}, which is not where "${ref.name}" lives now (${ref.rel}).`);

  // The manifest is data on disk like any other: re-validate every entry before moving.
  const pairs: Array<{ from: string; to: string; label: string }> = [];
  for (const f of manifest.files) {
    if (f.area !== 'assets' && f.area !== 'sheets') throw new PathError(`Bad area in manifest: ${f.area}`);
    const rel = safeSubpath(f.rel);
    const to = await resolveInside(areaDir(paths, f.area), rel);
    const from = await resolveInside(join(entryDir, f.area), rel);
    pairs.push({ from, to, label: repoRel(ref, f.area, rel) });
  }
  const conflicts = pairs.filter((p) => existsSync(p.to));
  if (conflicts.length) throw new PathError(`Cannot restore, already exists: ${conflicts.map((c) => c.label).join(', ')}`);

  for (const p of pairs) {
    await mkdir(dirname(p.to), { recursive: true });
    await rename(p.from, p.to);
  }
  await rm(entryDir, { recursive: true, force: true });
  // An emptied trash leaves no folders behind (.diorama-trash/assets/<project>/ and up).
  await pruneEmptyDirs(trashDir, dirname(trashRoot(repo)));
  return { restored: pairs.map((p) => p.label) };
}

/** Deleted projects wait here, outside projects/, so no tool that lists projects ever sees them. */
function projectTrashDir(repo: string): string {
  return join(trashRoot(repo), 'projects');
}

export interface ProjectTrashResult {
  trashId: string;
  project: string;
}

/** Moves a whole project folder of projects/ to <repo>/.diorama-trash/projects/<id>/<project>, where restoreProject finds it. */
export async function deleteProject(repo: string, projectInput: string): Promise<ProjectTrashResult> {
  const project = safeProjectName(projectInput);
  const ref = viewerProject(repo, project);
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
  if (existsSync(to)) throw new PathError(`Cannot restore, project "${project}" already exists.`);
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
  await rm(join(projectTrashDir(repo), trashId), { recursive: true, force: true });
  await pruneEmptyDirs(projectTrashDir(repo), dirname(trashRoot(repo)));
  return { restored: project };
}

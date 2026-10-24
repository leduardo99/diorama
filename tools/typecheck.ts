/**
 * Diorama - the type check of one project, shared by `npm run check` and `npm run export`.
 *
 * It compiles the project's `src/`, `sheets/` and `game/` (and what they import: the engine, and the
 * packages a game plays the exports with) with the repository's tsconfig.json, in this process, instead of
 * type checking the whole repository: about 2 s for the sample against about 5 s for `tsc -p .`. The errors
 * in the project's files are the project's; errors elsewhere (the engine's and the packages' files the project
 * imports) are counted apart, because they are not the project's to fix. The export checks `src/` and
 * `sheets/` alone (`game: false`): a game draws nothing that gets exported.
 */

import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { LAYOUT, type ProjectRef } from './project.js';

export interface TypeCheckResult {
  /** One line per error in the project's files: `examples/x/src/a.ts(3,5): error TS2322: ...` (the format of tsc). */
  projectErrors: string[];
  /** The same for errors outside the project (the engine and package files it imports, the compiler options). */
  otherErrors: string[];
  /** Source files the program read (the project's, the engine's and the libraries'). */
  files: number;
  /** How long the check took, in milliseconds. */
  ms: number;
}

/** A diagnostic as one line, in tsc's own format, with the path from the repository root. */
function formatDiagnostic(d: ts.Diagnostic, repo: string): string {
  const message = ts.flattenDiagnosticMessageText(d.messageText, ' ');
  if (!d.file || d.start === undefined) return `error TS${d.code}: ${message}`;
  const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
  const path = relative(repo, d.file.fileName).split(sep).join('/');
  return `${path}(${line + 1},${character + 1}): error TS${d.code}: ${message}`;
}

/** Type checks a project's `src/`, `sheets/` and (unless `game: false`) `game/` with the repository's compiler options. */
export function typeCheckProject(project: ProjectRef, repo = process.cwd(), options: { game?: boolean } = {}): TypeCheckResult {
  const start = Date.now();
  const configFile = resolve(repo, 'tsconfig.json');
  const read = ts.readConfigFile(configFile, ts.sys.readFile);
  if (read.error) return { projectErrors: [], otherErrors: [formatDiagnostic(read.error, repo)], files: 0, ms: Date.now() - start };
  // The repository's options, with only this project's code as roots.
  const places = options.game === false ? [LAYOUT.src, LAYOUT.sheets] : [LAYOUT.src, LAYOUT.sheets, LAYOUT.game];
  const include = places.map(place => `${project.rel}/${place}/**/*`);
  const parsed = ts.parseJsonConfigFileContent({ ...read.config, include, files: undefined }, ts.sys, repo, undefined, configFile);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } });
  const projectDir = resolve(repo, project.rel) + sep;
  const projectErrors: string[] = [];
  const otherErrors: string[] = [];
  for (const d of ts.getPreEmitDiagnostics(program)) {
    if (d.category !== ts.DiagnosticCategory.Error) continue;
    const inProject = d.file !== undefined && resolve(d.file.fileName).startsWith(projectDir);
    (inProject ? projectErrors : otherErrors).push(formatDiagnostic(d, repo));
  }
  return { projectErrors, otherErrors, files: program.getSourceFiles().length, ms: Date.now() - start };
}

/**
 * The commands the viewer runs through `/__api/cli` (vite.config.ts): a request from the "New" dialog, the customizer, the
 * scene painter, an export or "Try the sample" becomes a tools/ script and its arguments (the layout of
 * docs/ARCHITECTURE.md: new-asset writes src/ + sheets/, new-scene src/scenes/ + sheets/scenes/, gear-items sheets/gear/,
 * new-outfit-character src/characters/<name>/ + sheets/characters/<name>/; export takes paths relative to sheets/; example
 * copies the sample into projects/ and exports it there).
 *
 * The viewer's projects are those of projects/ alone, so a project is passed to the scripts as `projects/<name>`: what the
 * viewer saves never lands in a sample of examples/, even when no project of that name is left (a bare name would find
 * examples/<name> then). The scripts do all the validation; this only rejects values that would be read as flags or paths.
 * Tested in tests/viewer/cli-args.test.ts.
 */

/** The commands `/__api/cli` runs. */
export const CLI_COMMANDS = ['new-project', 'new-asset', 'new-outfit-character', 'new-scene', 'gear-items', 'export', 'example'] as const;

/**
 * The script and arguments for a request's body (`node --import tsx <args>`). `outfitFile` is where the handler saved the
 * outfit (or scene) of a new-outfit-character / new-scene request. Throws an Error with the message to answer on a bad request.
 */
export function cliArgs(body: any, outfitFile?: string): string[] {
  const str = (v: unknown, field: string): string => {
    const s = String(v ?? '').trim();
    if (!s) throw new Error(`${field} is required.`);
    if (s.startsWith('-')) throw new Error(`${field} cannot start with "-".`);
    return s;
  };
  const optional = (v: unknown, field: string): string | undefined =>
    String(v ?? '').trim() ? str(v, field) : undefined;
  const project = (v: unknown): string => {
    const name = str(v, 'project');
    if (name.includes('/') || name.includes('\\') || name.startsWith('.')) throw new Error('project must be the name of a project in projects/.');
    return `projects/${name}`;
  };
  switch (body?.command) {
    case 'new-project': {
      const args = ['tools/cli.ts', 'new-project', str(body.name, 'name')];
      if (body.style) args.push('--style');
      return args;
    }
    case 'new-asset': {
      // The subpath is sheets/<subpath>.ts (kebab-case names joined by "/"); the drawing goes in src/.
      const engine = str(body.engine, 'engine');
      if (engine !== 'volume' && engine !== 'rig') throw new Error('engine must be volume or rig.');
      const args = [
        'tools/cli.ts', 'new-asset', project(body.project), str(body.subpath, 'subpath'),
        `--engine=${engine}`,
        `--frames=${str(body.frames, 'frames')}`,
      ];
      // Both turn to face other directions.
      const directions = optional(body.directions, 'directions');
      if (directions) args.push(`--directions=${directions}`);
      if (engine === 'volume') {
        args.push(`--size=${str(body.size, 'size')}`, `--fps=${str(body.fps, 'fps')}`);
      } else {
        // A rig clip takes the cell of its skeleton and plays at the speed its seconds set: no --size, no --fps.
        // The first clip of a character folder creates src/<folder>/character.ts. Without --clip the script uses the file name when it is a clip name.
        args.push(`--skeleton=${str(body.skeleton, 'skeleton')}`);
        const clip = optional(body.clip, 'clip');
        if (clip) args.push(`--clip=${clip}`);
      }
      return args;
    }
    case 'gear-items': {
      // One sheet (sheets/gear/<part>.ts) per part of the project's gear catalog (it keeps the ones already there).
      const args = ['tools/cli.ts', 'gear-items', project(body.project)];
      if (body.force) args.push('--force');
      return args;
    }
    case 'new-scene': {
      if (!outfitFile) throw new Error('scene is required.');
      const args = ['tools/cli.ts', 'new-scene', project(body.project), str(body.name, 'name'), '--scene', outfitFile];
      if (body.force) args.push('--force');
      return args;
    }
    case 'new-outfit-character': {
      if (!outfitFile) throw new Error('outfit is required.');
      const args = [
        'tools/cli.ts', 'new-outfit-character', project(body.project), str(body.name, 'name'),
        '--from', str(body.from, 'from'), '--outfit', outfitFile,
      ];
      if (body.force) args.push('--force');
      return args;
    }
    case 'export': {
      // The subpath is relative to sheets/. Empty exports the whole project; a trailing "/" exports a folder.
      const args = ['tools/export.ts', project(body.project)];
      const subpath = optional(body.subpath, 'subpath');
      if (subpath) args.push(subpath);
      if (body.sheet === 'grid' || body.sheet === 'compact') {
        args.push(`--${body.sheet}`);
        const gap = optional(body.gap, 'gap');
        const cols = optional(body.cols, 'cols');
        if (gap) args.push(`--gap=${gap}`);
        if (cols) args.push(`--cols=${cols}`);
        if (body.both) args.push('--both');
      }
      if (body.mockup) args.push('--mockup');
      return args;
    }
    case 'example':
      // Copies examples/soulkeeper to projects/soulkeeper and exports it there. Never --force from the viewer: an existing
      // copy is the user's, and the command only exports what changed in it.
      return ['tools/cli.ts', 'example'];
    default:
      throw new Error('command must be new-project, new-asset, new-outfit-character, new-scene, gear-items, export or example.');
  }
}

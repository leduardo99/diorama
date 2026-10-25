/**
 * Who answers on a dev-server port. The viewer's dev server (vite.config.ts) says at /__api/server that it is Diorama
 * and which folder it serves, so a command reuses a running server only when it is this checkout's: another program, or
 * the dev server of another checkout (another clone, a worktree, an older tool), would serve other code.
 */

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/** A folder's real path, links followed (the folder itself when it cannot be read). */
export const realDir = (dir: string) => {
  try {
    return realpathSync(dir);
  } catch {
    return resolve(dir);
  }
};

export type ServerOnPort = { kind: 'none' | 'ours' | 'other' } | { kind: 'diorama'; root: string };

/**
 * What answers on a port: nothing; this checkout's dev server (`ours`); the dev server of another checkout of Diorama,
 * with the folder it serves; or some other program.
 */
export async function serverOn(port: number, root = process.cwd()): Promise<ServerOnPort> {
  let response: Response;
  try {
    response = await fetch(`http://localhost:${port}/__api/server`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(2000) });
  } catch {
    // Nothing answers (or nothing that speaks HTTP: then the dev server cannot take the port, and says so).
    return { kind: 'none' };
  }
  const body = (await response.json().catch(() => null)) as { app?: unknown; root?: unknown } | null;
  if (!response.ok || body?.app !== 'diorama' || typeof body.root !== 'string') return { kind: 'other' };
  return realDir(body.root) === realDir(root) ? { kind: 'ours' } : { kind: 'diorama', root: body.root };
}

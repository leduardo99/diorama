/**
 * One run at a time: a lock file that holds the process id of the run that took it. `npm run example` takes
 * `projects/.example.lock` (EXAMPLE_LOCK) for as long as it copies and exports, so a second run, from a terminal or from
 * the viewer's "Try the sample", refuses instead of copying and exporting the same project beside it; the viewer reads
 * the same file to show a run that is going on.
 *
 * A lock whose process is gone (a run that was killed) is stale: it never stops anyone, and the next run replaces it.
 */

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** The lock of `npm run example`, from the repository root: in projects/, which Diorama does not version. */
export const EXAMPLE_LOCK = 'projects/.example.lock';

export interface LockHolder {
  pid: number;
  /** When the run took the lock (ISO time). */
  startedAt: string;
  /** What the run is, for messages: `npm run example -- soulkeeper`. */
  command: string;
}

/** Is the process `pid` running? A process of another user counts (signalling it is not allowed, but it is there). */
export function isRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readHolder(file: string): LockHolder | undefined {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<LockHolder>;
    if (typeof data.pid !== 'number') return undefined;
    return { pid: data.pid, startedAt: String(data.startedAt ?? ''), command: String(data.command ?? '') };
  } catch {
    return undefined;
  }
}

/** A lock that a run is still writing (it creates the file, then writes its pid): this young, it is not stale yet. */
const WRITING_MS = 5000;

/** The run that holds the lock at `file`, or undefined when there is no lock or its process is gone. */
export function lockHolder(file: string): LockHolder | undefined {
  const holder = readHolder(file);
  if (holder) return isRunning(holder.pid) ? holder : undefined;
  try {
    // A file without a pid: one being written right now holds the lock; an old one is what a crash left.
    const age = Date.now() - statSync(file).mtimeMs;
    return age < WRITING_MS ? { pid: 0, startedAt: '', command: '' } : undefined;
  } catch {
    return undefined;
  }
}

export type LockResult = { ok: true; release: () => void } | { ok: false; holder: LockHolder };

/**
 * Takes the lock at `file` for this process, or says who holds it. A stale lock (a process that is gone, or a file
 * without a pid older than a few seconds) is replaced. The file is created exclusively, so of two runs that start together only one gets it.
 * `release` removes it, only while it is still this process's; the caller also calls it on exit.
 */
export function takeLock(file: string, command: string): LockResult {
  const path = resolve(file);
  mkdirSync(dirname(path), { recursive: true });
  const mine: LockHolder = { pid: process.pid, startedAt: new Date().toISOString(), command };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      writeFileSync(path, `${JSON.stringify(mine)}\n`, { flag: 'wx' });
      let released = false;
      return {
        ok: true,
        release: () => {
          if (released) return;
          released = true;
          if (readHolder(path)?.pid === process.pid) rmSync(path, { force: true });
        },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
    const holder = lockHolder(path);
    if (holder) return { ok: false, holder };
    // Stale: its run is gone. Removed and taken again; a run that removes it at the same moment loses the exclusive create.
    rmSync(path, { force: true });
  }
  const holder = readHolder(path);
  return { ok: false, holder: holder ?? { pid: 0, startedAt: '', command: '' } };
}

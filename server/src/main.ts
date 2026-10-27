/**
 * `npm run server` runs the API alone: the same Hono app the `diorama-api` plugin mounts inside the
 * dev server (server/src/app.ts, vite.config.ts), without the viewer's pages. Local only, on
 * `localhost`, port 5180 unless `--port <n>` says another. Its events follow projects/ through `fs.watch`.
 */

import { existsSync, watch } from 'node:fs';
import { join, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import type { ChangeSource } from './events';

const USAGE = 'Usage: npm run server -- [--port <n>]';
const args = process.argv.slice(2);
let port = 5180;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    console.log(USAGE);
    process.exit(0);
  }
  if (arg === '--port') port = Number(args[++i]);
  else if (arg.startsWith('--port=')) port = Number(arg.slice('--port='.length));
  else {
    // An option it does not take is refused, never ignored (--prot 5181 would serve on 5180).
    console.error(`${arg} is not an option of npm run server. ${USAGE}`);
    process.exit(1);
  }
}
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(USAGE);
  process.exit(1);
}

const root = resolve('.');
const projects = join(root, 'projects');
// fs.watch names a path relative to the folder it watches, and says only that something there changed.
const changes: ChangeSource = (listener) => {
  if (!existsSync(projects)) return () => {};
  const watcher = watch(projects, { recursive: true }, (_event, name) => {
    if (name) listener(join(projects, name.toString()));
  });
  return () => watcher.close();
};

serve({ fetch: createApp({ root, changes }).fetch, hostname: 'localhost', port }, (info) => {
  console.log(`diorama api on http://localhost:${info.port}`);
});

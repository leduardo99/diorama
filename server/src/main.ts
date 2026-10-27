/**
 * `npm run server` runs the API alone: the same Hono app the `diorama-api` plugin mounts inside the
 * dev server (server/src/app.ts, vite.config.ts), without the viewer's pages. Local only, on
 * `localhost`, port 5180 unless `--port <n>` says another.
 */

import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';

const args = process.argv.slice(2);
let port = 5180;
const at = args.indexOf('--port');
if (at >= 0) port = Number(args[at + 1]);
const inline = args.find((arg) => arg.startsWith('--port='));
if (inline) port = Number(inline.slice('--port='.length));
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error('Usage: npm run server -- [--port <n>]');
  process.exit(1);
}

const root = resolve('.');
serve({ fetch: createApp({ root }).fetch, hostname: 'localhost', port }, (info) => {
  console.log(`diorama api on http://localhost:${info.port}`);
});

import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { serverOn } from '../../tools/dev-server';

console.log('🧪 Checking how commands tell this checkout\'s dev server from anything else on its port...\n');

/** A local server answering /__api/server with `body` (or plain HTML when there is none), on a free port. */
async function serve(body: unknown): Promise<{ port: number; server: Server }> {
  const server = createServer((req, res) => {
    if (body !== undefined && req.url === '/__api/server') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    } else {
      res.setHeader('content-type', 'text/html');
      res.end('<!doctype html><title>something else</title>');
    }
  });
  await new Promise<void>((done) => server.listen(0, 'localhost', done));
  return { port: (server.address() as AddressInfo).port, server };
}

const close = (server: Server) => new Promise<void>((done) => server.close(() => done()));

const ours = await serve({ app: 'diorama', root: process.cwd() });
const otherCheckout = await serve({ app: 'diorama', root: '/somewhere/else/diorama' });
const otherProgram = await serve(undefined);
try {
  assert.deepEqual(await serverOn(ours.port), { kind: 'ours' }, 'this checkout\'s server is reused');
  assert.deepEqual(await serverOn(otherCheckout.port), { kind: 'diorama', root: '/somewhere/else/diorama' }, 'another checkout\'s server is told apart, with its folder');
  assert.deepEqual(await serverOn(otherProgram.port), { kind: 'other' }, 'a page server that is not Diorama is "other"');
} finally {
  await Promise.all([close(ours.server), close(otherCheckout.server), close(otherProgram.server)]);
}
assert.deepEqual(await serverOn(ours.port), { kind: 'none' }, 'nothing listening is "none"');

console.log('✅ dev server identity checks passed');

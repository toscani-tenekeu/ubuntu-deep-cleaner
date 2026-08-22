import { chmod, mkdir, unlink } from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { analyzeSystem } from './analyzers.js';
import { executeActions } from './actions.js';
import { Quarantine } from './quarantine.js';
import type { AgentAction, ScanDepth } from '../shared/contracts.js';

const socketPath = process.env.UDC_AGENT_SOCKET ?? '/run/ubuntu-deep-cleaner/agent.sock';
const stateRoot = process.env.UDC_STATE_DIR ?? '/var/lib/ubuntu-deep-cleaner';
const agentGroup = process.env.UDC_AGENT_GROUP ?? 'ubuntu-deep-cleaner';

async function readJson<T>(request: IncomingMessage, limit = 64 * 1024): Promise<T> {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > limit) throw new Error('Request body is too large');
  }
  return JSON.parse(body || '{}') as T;
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') {
      send(response, 200, { ok: true });
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/scan') {
      const body = await readJson<{ scanId: string; depth: ScanDepth }>(request);
      if (!/^[0-9a-f-]{36}$/i.test(body.scanId) || !['standard', 'deep'].includes(body.depth)) {
        send(response, 400, { error: 'Invalid scan request' });
        return;
      }
      send(response, 200, await analyzeSystem(body.depth, body.scanId));
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/execute') {
      const body = await readJson<{ planId: string; actions: AgentAction[] }>(request);
      if (!/^[0-9a-f-]{36}$/i.test(body.planId) || !Array.isArray(body.actions)) {
        send(response, 400, { error: 'Invalid cleanup request' });
        return;
      }
      send(response, 200, await executeActions(body.planId, body.actions, stateRoot));
      return;
    }
    if (request.method === 'GET' && request.url === '/v1/quarantine') {
      send(response, 200, await new Quarantine(stateRoot).list());
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/quarantine/restore') {
      const body = await readJson<{ id: string }>(request);
      send(response, 200, await new Quarantine(stateRoot).restore(body.id));
      return;
    }
    send(response, 404, { error: 'Not found' });
  } catch (error) {
    send(response, 500, { error: error instanceof Error ? error.message : 'Agent error' });
  }
});

async function start() {
  await mkdir(path.dirname(socketPath), { recursive: true, mode: 0o750 });
  await unlink(socketPath).catch(() => undefined);
  server.listen(socketPath, async () => {
    await chmod(socketPath, 0o660);
    if (process.getuid?.() === 0 && agentGroup) {
      const { runCommand } = await import('./command.js');
      await runCommand('chgrp', [agentGroup, socketPath], { timeoutMs: 3_000 }).catch(() => undefined);
    }
    process.stdout.write(`Ubuntu Deep Cleaner agent listening on ${socketPath}\n`);
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

await start();

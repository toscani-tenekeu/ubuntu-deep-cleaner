import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, statfs } from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentAction,
  BootstrapResponse,
  CleanupPlan,
  CleanupResult,
  Job,
  QuarantineEntry,
  ScanDepth,
  ScanResult,
  SystemSummary,
} from '../shared/contracts.js';
import { AgentClient } from './agent-client.js';
import { demoScan, demoSummary } from './demo.js';
import { RequestSecurity } from './security.js';
import { Store } from './store.js';

const port = Number(process.env.UDC_PORT ?? 8787);
const host = process.env.UDC_HOST ?? '127.0.0.1';
const stateRoot = process.env.UDC_STATE_DIR ?? '/var/lib/ubuntu-deep-cleaner';
const agentSocket = process.env.UDC_AGENT_SOCKET ?? '/run/ubuntu-deep-cleaner/agent.sock';
const demoMode = process.env.UDC_DEMO_MODE === '1';
const currentFile = fileURLToPath(import.meta.url);
const webRoot = process.env.UDC_WEB_ROOT ?? path.resolve(path.dirname(currentFile), '../web');
const security = new RequestSecurity(port);
const store = new Store(stateRoot);
const agent = new AgentClient(agentSocket);
const jobs = new Map<string, Job>();
const listeners = new Map<string, Set<ServerResponse>>();
let cleanupRunning = false;

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

async function body<T>(request: IncomingMessage, limit = 128 * 1024): Promise<T> {
  let data = '';
  for await (const chunk of request) {
    data += chunk.toString('utf8');
    if (Buffer.byteLength(data) > limit) throw new Error('Request body is too large');
  }
  return JSON.parse(data || '{}') as T;
}

function updateJob<T>(job: Job<T>, update: Partial<Job<T>>): Job<T> {
  Object.assign(job, update, { updatedAt: new Date().toISOString() });
  jobs.set(job.id, job);
  store.saveJob(job);
  for (const response of listeners.get(job.id) ?? []) {
    response.write(`event: job\ndata: ${JSON.stringify(job)}\n\n`);
    if (['completed', 'failed', 'cancelled'].includes(job.status)) response.end();
  }
  return job;
}

function newJob<T>(type: Job<T>['type'], stage: string): Job<T> {
  const now = new Date().toISOString();
  const job: Job<T> = { id: randomUUID(), type, status: 'queued', stage, createdAt: now, updatedAt: now };
  jobs.set(job.id, job);
  store.saveJob(job);
  return job;
}

async function localSummary(): Promise<SystemSummary> {
  try {
    const info = await statfs('/');
    const totalBytes = Number(info.blocks) * Number(info.bsize);
    const freeBytes = Number(info.bavail) * Number(info.bsize);
    const usedBytes = totalBytes - freeBytes;
    return {
      hostname: hostname(),
      platform: 'Ubuntu Linux',
      disk: {
        totalBytes,
        usedBytes,
        freeBytes,
        usedPercent: totalBytes ? Math.round((usedBytes / totalBytes) * 100) : 0,
      },
      failedServices: 0,
      health: 'healthy',
      potentialSavingsBytes: 0,
    };
  } catch {
    return demoSummary;
  }
}

async function startScan(job: Job<ScanResult>, depth: ScanDepth): Promise<void> {
  updateJob(job, { status: 'running', stage: 'Inspecting packages and filesystem' });
  try {
    const result = demoMode
      ? await new Promise<ScanResult>((resolve) => setTimeout(() => resolve(demoScan(depth, job.id)), 1_000))
      : await agent.request<ScanResult>('/v1/scan', 'POST', { scanId: job.id, depth });
    store.saveScan(result);
    updateJob(job, { status: 'completed', stage: 'Scan completed', progress: 100, result });
  } catch (error) {
    updateJob(job, { status: 'failed', stage: 'Scan failed', error: error instanceof Error ? error.message : 'Scan failed' });
  }
}

async function startCleanup(job: Job<CleanupResult>, plan: CleanupPlan): Promise<void> {
  cleanupRunning = true;
  updateJob(job, { status: 'running', stage: 'Revalidating cleanup plan', progress: 5 });
  try {
    const actions = plan.findings.map((item) => item.action).filter(Boolean) as AgentAction[];
    let result: CleanupResult;
    if (demoMode) {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      const free = demoSummary.disk.freeBytes;
      result = {
        planId: plan.id,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        beforeFreeBytes: free,
        afterFreeBytes: free + plan.estimatedBytes,
        results: actions.map((action) => ({
          kind: action.kind,
          ok: true,
          reclaimedBytes: plan.estimatedBytes / Math.max(1, actions.length),
          detail: 'Demo action completed.',
        })),
      };
    } else {
      updateJob(job, { stage: 'Applying approved cleanup actions', progress: 35 });
      result = await agent.request<CleanupResult>('/v1/execute', 'POST', { planId: plan.id, actions });
    }
    updateJob(job, { status: 'completed', stage: 'Cleanup verified', progress: 100, result });
  } catch (error) {
    updateJob(job, { status: 'failed', stage: 'Cleanup failed', error: error instanceof Error ? error.message : 'Cleanup failed' });
  } finally {
    cleanupRunning = false;
  }
}

function hashPlan(scanId: string, findingIds: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify({ scanId, findingIds: [...findingIds].sort() })).digest('hex');
}

async function serveStatic(requestPath: string, response: ServerResponse): Promise<void> {
  const requested = requestPath === '/' ? 'index.html' : requestPath.replace(/^\//, '');
  const normalized = path.normalize(requested);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    json(response, 400, { error: 'Invalid path', code: 'INVALID_PATH' });
    return;
  }
  let filePath = path.join(webRoot, normalized);
  try {
    if (!(await stat(filePath)).isFile()) throw new Error('Not a file');
  } catch {
    filePath = path.join(webRoot, 'index.html');
  }
  const extension = path.extname(filePath);
  const contentTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
  };
  response.writeHead(200, {
    'content-type': contentTypes[extension] ?? 'application/octet-stream',
    'content-security-policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
  createReadStream(filePath).pipe(response);
}

async function api(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith('/api/')) return false;
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method ?? 'GET');
  const check = security.validate(request, mutating);
  if (!check.ok) {
    json(response, 403, { error: check.reason, code: 'REQUEST_REJECTED' });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/v1/bootstrap') {
    const latestScan = store.latestScan();
    const result: BootstrapResponse = {
      csrfToken: security.csrfToken,
      summary: latestScan?.summary ?? (demoMode ? demoSummary : await localSummary()),
      ...(latestScan ? { latestScan } : {}),
      agentConnected: demoMode || (await agent.connected()),
      demoMode,
    };
    json(response, 200, result);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/v1/scans') {
    const input = await body<{ depth?: ScanDepth }>(request);
    const depth = input.depth ?? 'deep';
    if (!['standard', 'deep'].includes(depth)) {
      json(response, 400, { error: 'Invalid scan depth', code: 'INVALID_SCAN_DEPTH' });
      return true;
    }
    const job = newJob<ScanResult>('scan', 'Preparing scan');
    void startScan(job, depth);
    json(response, 202, job);
    return true;
  }

  const scanMatch = url.pathname.match(/^\/api\/v1\/scans\/([0-9a-f-]{36})$/i);
  if (request.method === 'GET' && scanMatch) {
    const scan = store.getScan(scanMatch[1] ?? '');
    if (!scan) json(response, 404, { error: 'Scan not found', code: 'NOT_FOUND' });
    else json(response, 200, scan);
    return true;
  }

  const eventsMatch = url.pathname.match(/^\/api\/v1\/jobs\/([0-9a-f-]{36})\/events$/i);
  if (request.method === 'GET' && eventsMatch) {
    const jobId = eventsMatch[1] ?? '';
    const job = jobs.get(jobId) ?? store.listJobs(200).find((candidate) => candidate.id === jobId);
    if (!job) {
      json(response, 404, { error: 'Job not found', code: 'NOT_FOUND' });
      return true;
    }
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    response.write(`event: job\ndata: ${JSON.stringify(job)}\n\n`);
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      response.end();
      return true;
    }
    const set = listeners.get(jobId) ?? new Set<ServerResponse>();
    set.add(response);
    listeners.set(jobId, set);
    request.on('close', () => set.delete(response));
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/v1/history') {
    json(response, 200, store.listJobs());
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/v1/plans') {
    const input = await body<{ scanId: string; findingIds: string[] }>(request);
    const scan = store.getScan(input.scanId);
    if (!scan || !Array.isArray(input.findingIds) || input.findingIds.length === 0) {
      json(response, 400, { error: 'A valid scan and at least one finding are required', code: 'INVALID_PLAN' });
      return true;
    }
    const uniqueIds = [...new Set(input.findingIds)].sort();
    const findings = uniqueIds.map((id) => scan.findings.find((item) => item.id === id)).filter(Boolean);
    if (findings.length !== uniqueIds.length || findings.some((item) => !item?.action)) {
      json(response, 400, { error: 'The selection contains an unavailable action', code: 'INVALID_PLAN' });
      return true;
    }
    const id = randomUUID();
    const plan: CleanupPlan = {
      id,
      scanId: scan.scanId,
      findingIds: uniqueIds,
      findings: findings as CleanupPlan['findings'],
      estimatedBytes: findings.reduce((sum, item) => sum + (item?.reclaimableBytes ?? 0), 0),
      confirmationPhrase: `CLEAN ${findings.length} ${findings.length === 1 ? 'ITEM' : 'ITEMS'}`,
      hash: hashPlan(scan.scanId, uniqueIds),
      createdAt: new Date().toISOString(),
    };
    store.savePlan(plan);
    json(response, 201, plan);
    return true;
  }

  const executeMatch = url.pathname.match(/^\/api\/v1\/plans\/([0-9a-f-]{36})\/execute$/i);
  if (request.method === 'POST' && executeMatch) {
    if (cleanupRunning) {
      json(response, 409, { error: 'Another cleanup is already running', code: 'CLEANUP_LOCKED' });
      return true;
    }
    const plan = store.getPlan(executeMatch[1] ?? '');
    const input = await body<{ confirmationPhrase: string; hash: string }>(request);
    if (!plan || input.hash !== plan.hash || input.confirmationPhrase !== plan.confirmationPhrase) {
      json(response, 409, { error: 'The plan or confirmation phrase is no longer valid', code: 'PLAN_CHANGED' });
      return true;
    }
    const job = newJob<CleanupResult>('cleanup', 'Preparing cleanup');
    void startCleanup(job, plan);
    json(response, 202, job);
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/v1/quarantine') {
    const entries = demoMode ? [] : await agent.request<QuarantineEntry[]>('/v1/quarantine', 'GET');
    json(response, 200, entries);
    return true;
  }

  const restoreMatch = url.pathname.match(/^\/api\/v1\/quarantine\/([0-9a-f-]{36})\/restore$/i);
  if (request.method === 'POST' && restoreMatch) {
    if (demoMode) {
      json(response, 404, { error: 'Demo quarantine entry not found', code: 'NOT_FOUND' });
      return true;
    }
    const restored = await agent.request<QuarantineEntry>('/v1/quarantine/restore', 'POST', {
      id: restoreMatch[1],
    });
    json(response, 200, restored);
    return true;
  }

  json(response, 404, { error: 'API endpoint not found', code: 'NOT_FOUND' });
  return true;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `localhost:${port}`}`);
    if (await api(request, response, url)) return;
    if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) {
      json(response, 405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
      return;
    }
    await serveStatic(url.pathname, response);
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : 'Server error', code: 'SERVER_ERROR' });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Ubuntu Deep Cleaner listening on http://${host}:${port}${demoMode ? ' (demo mode)' : ''}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

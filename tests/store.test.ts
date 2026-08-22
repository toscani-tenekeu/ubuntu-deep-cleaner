import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoScan } from '../src/server/demo.js';
import { Store } from '../src/server/store.js';

describe('audit store', () => {
  it('persists jobs, scans and immutable plans', async () => {
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'udc-store-'));
    const store = new Store(stateRoot);
    const now = new Date().toISOString();
    store.saveJob({
      id: '11111111-1111-4111-8111-111111111111',
      type: 'scan',
      status: 'completed',
      stage: 'done',
      createdAt: now,
      updatedAt: now,
    });
    const scan = demoScan('deep', '11111111-1111-4111-8111-111111111111');
    store.saveScan(scan);
    const plan = {
      id: '22222222-2222-4222-8222-222222222222',
      scanId: scan.scanId,
      findingIds: ['apt-cache'],
      findings: [scan.findings[0]!],
      estimatedBytes: scan.findings[0]!.reclaimableBytes,
      confirmationPhrase: 'CLEAN 1 ITEM',
      hash: 'test-hash',
      createdAt: now,
    };
    store.savePlan(plan);

    expect(store.listJobs()).toHaveLength(1);
    expect(store.latestScan()?.scanId).toBe(scan.scanId);
    expect(store.getPlan(plan.id)?.hash).toBe('test-hash');
  });
});

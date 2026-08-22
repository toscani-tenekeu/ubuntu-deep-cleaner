import { randomUUID } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import type { ActionResult, AgentAction, CleanupResult } from '../shared/contracts.js';
import { commandExists, runCommand } from './command.js';
import { discoverNginxOrphans, discoverRotatedLogs } from './analyzers.js';
import { Quarantine } from './quarantine.js';

async function freeBytes(): Promise<number> {
  const value = await statfs('/');
  return Number(value.bavail) * Number(value.bsize);
}

async function runChecked(command: string, args: string[], timeoutMs = 120_000): Promise<string> {
  const result = await runCommand(command, args, { timeoutMs, maxBytes: 4 * 1024 * 1024 });
  if (result.code !== 0) throw new Error(result.stderr.trim() || `${command} exited with ${result.code}`);
  return result.stdout.trim();
}

async function removeDisabledSnaps(): Promise<string> {
  if (!(await commandExists('snap'))) return 'Snap is not installed.';
  const listing = await runChecked('snap', ['list', '--all'], 20_000);
  let removed = 0;
  for (const line of listing.split('\n').slice(1)) {
    if (!line.includes('disabled')) continue;
    const columns = line.trim().split(/\s+/);
    const name = columns[0];
    const revision = columns[2];
    if (!name || !revision || !/^\d+$/.test(revision)) continue;
    await runChecked('snap', ['remove', name, '--revision', revision], 120_000);
    removed += 1;
  }
  return `Removed ${removed} disabled Snap revision${removed === 1 ? '' : 's'}.`;
}

export async function executeActions(
  planId: string,
  actions: readonly AgentAction[],
  stateRoot: string,
): Promise<CleanupResult> {
  const allowed = new Set([
    'apt-cache-clean',
    'apt-autoremove',
    'journal-vacuum',
    'docker-image-prune',
    'snap-disabled-remove',
    'rotated-logs-quarantine',
    'nginx-orphans-quarantine',
  ]);
  if (actions.some((action) => !allowed.has(action.kind))) throw new Error('The cleanup plan contains an unsupported action');
  if (new Set(actions.map((action) => action.kind)).size !== actions.length) throw new Error('Duplicate cleanup action');

  const startedAt = new Date().toISOString();
  const beforeFreeBytes = await freeBytes();
  const quarantine = new Quarantine(stateRoot);
  const results: ActionResult[] = [];

  for (const action of actions) {
    const before = await freeBytes();
    try {
      let detail = '';
      switch (action.kind) {
        case 'apt-cache-clean':
          detail = await runChecked('apt-get', ['clean']);
          break;
        case 'apt-autoremove':
          detail = await runChecked('apt-get', ['-y', 'autoremove'], 300_000);
          break;
        case 'journal-vacuum':
          detail = await runChecked('journalctl', ['--vacuum-size=100M'], 120_000);
          break;
        case 'docker-image-prune':
          detail = await runChecked('docker', ['image', 'prune', '--all', '--force'], 300_000);
          await runChecked('docker', ['builder', 'prune', '--force'], 300_000).catch(() => '');
          break;
        case 'snap-disabled-remove':
          detail = await removeDisabledSnaps();
          break;
        case 'rotated-logs-quarantine': {
          const entries = await quarantine.moveFiles(randomUUID(), await discoverRotatedLogs(), ['/var/log']);
          detail = `Moved ${entries.length} rotated logs to quarantine.`;
          break;
        }
        case 'nginx-orphans-quarantine': {
          const entries = await quarantine.moveFiles(randomUUID(), await discoverNginxOrphans(), [
            '/etc/nginx/sites-available',
          ]);
          detail = `Moved ${entries.length} unreferenced Nginx configurations to quarantine.`;
          break;
        }
      }
      const after = await freeBytes();
      results.push({ kind: action.kind, ok: true, reclaimedBytes: Math.max(0, after - before), detail: detail || 'Completed.' });
    } catch (error) {
      results.push({
        kind: action.kind,
        ok: false,
        reclaimedBytes: 0,
        detail: error instanceof Error ? error.message : 'Action failed.',
      });
    }
  }

  return {
    planId,
    startedAt,
    completedAt: new Date().toISOString(),
    beforeFreeBytes,
    afterFreeBytes: await freeBytes(),
    results,
  };
}

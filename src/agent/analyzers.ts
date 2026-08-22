import { hostname } from 'node:os';
import { readFile, readdir, readlink, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import type { Finding, ScanDepth, ScanResult, SystemSummary } from '../shared/contracts.js';
import { parseHumanBytes } from '../shared/format.js';
import { commandExists, runCommand } from './command.js';
import { directorySize, isRotatedLogName } from './filesystem.js';

const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function finding(input: Omit<Finding, 'selectedByDefault'>): Finding {
  return { ...input, selectedByDefault: false };
}

async function diskSummary() {
  const info = await statfs('/');
  const totalBytes = Number(info.blocks) * Number(info.bsize);
  const freeBytes = Number(info.bavail) * Number(info.bsize);
  const usedBytes = totalBytes - freeBytes;
  return {
    totalBytes,
    usedBytes,
    freeBytes,
    usedPercent: totalBytes === 0 ? 0 : Math.round((usedBytes / totalBytes) * 100),
  };
}

async function failedServices(): Promise<string[]> {
  if (!(await commandExists('systemctl'))) return [];
  const result = await runCommand('systemctl', ['--failed', '--no-legend', '--plain'], { timeoutMs: 10_000 });
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function failedServicesFinding(lines: readonly string[]): Finding | undefined {
  if (lines.length === 0) return undefined;
  const units = lines.map((line) => line.split(/\s+/)[0]).filter(Boolean).slice(0, 12);
  return finding({
    id: 'failed-services-review',
    title: 'Failed systemd services require review',
    category: 'Services',
    risk: 'high',
    reclaimableBytes: 0,
    recovery: 'manual',
    status: 'review',
    evidence: `${lines.length} failed unit${lines.length === 1 ? '' : 's'}: ${units.join(', ')}. Services are never disabled or removed automatically.`,
  });
}

async function aptFindings(): Promise<Finding[]> {
  const findings: Finding[] = [];
  const cacheBytes = await directorySize('/var/cache/apt/archives');
  if (cacheBytes > 0) {
    findings.push(
      finding({
        id: 'apt-cache',
        title: 'APT package cache',
        category: 'Packages',
        risk: 'low',
        reclaimableBytes: cacheBytes,
        recovery: 'automatic',
        status: 'detected',
        evidence: `${cacheBytes} bytes are stored in /var/cache/apt/archives.`,
        action: { kind: 'apt-cache-clean' },
      }),
    );
  }
  if (!(await commandExists('apt-get'))) return findings;
  try {
    const simulation = await runCommand('apt-get', ['-s', 'autoremove'], { timeoutMs: 30_000 });
    const summary = simulation.stdout.match(/After this operation,\s+(.+?)\s+disk space will be freed\./i);
    const bytes = summary ? parseHumanBytes(summary[1] ?? '') : 0;
    const removeLine = simulation.stdout.match(/The following packages will be REMOVED:\n([\s\S]*?)\n\d+ upgraded/i);
    if (bytes > 0 || removeLine) {
      findings.push(
        finding({
          id: 'apt-autoremove',
          title: 'Unused APT dependencies',
          category: 'Packages',
          risk: 'medium',
          reclaimableBytes: bytes,
          recovery: 'automatic',
          status: 'detected',
          evidence: summary?.[0] ?? 'APT reports removable dependency packages.',
          action: { kind: 'apt-autoremove' },
        }),
      );
    }
  } catch {
    // APT may be locked; the scan remains useful without it.
  }
  return findings;
}

async function journalFinding(): Promise<Finding | undefined> {
  if (!(await commandExists('journalctl'))) return undefined;
  try {
    const result = await runCommand('journalctl', ['--disk-usage'], { timeoutMs: 10_000 });
    const match = result.stdout.match(/take up\s+(.+?)\s+in the file system/i);
    const current = match ? parseHumanBytes(match[1] ?? '') : 0;
    const reclaimable = Math.max(0, current - 100 * 1024 * 1024);
    if (reclaimable === 0) return undefined;
    return finding({
      id: 'journal-vacuum',
      title: 'Oversized system journal',
      category: 'Logs',
      risk: 'low',
      reclaimableBytes: reclaimable,
      recovery: 'automatic',
      status: 'detected',
      evidence: `System journal uses ${current} bytes; the cleanup target is 100 MB.`,
      action: { kind: 'journal-vacuum' },
    });
  } catch {
    return undefined;
  }
}

async function dockerFinding(): Promise<Finding | undefined> {
  if (!(await commandExists('docker'))) return undefined;
  try {
    const result = await runCommand('docker', ['system', 'df', '--format', '{{json .}}'], { timeoutMs: 20_000 });
    let reclaimable = 0;
    for (const line of result.stdout.split('\n').filter(Boolean)) {
      const row = JSON.parse(line) as Record<string, string>;
      if ((row.Type ?? '').toLowerCase() === 'images') reclaimable += parseHumanBytes(row.Reclaimable ?? '0 B');
      if ((row.Type ?? '').toLowerCase() === 'build cache') reclaimable += parseHumanBytes(row.Reclaimable ?? '0 B');
    }
    if (reclaimable === 0) return undefined;
    return finding({
      id: 'docker-images',
      title: 'Unused container images and build cache',
      category: 'Containers',
      risk: 'medium',
      reclaimableBytes: reclaimable,
      recovery: 'automatic',
      status: 'detected',
      evidence: 'Docker reports reclaimable images or build cache. Running containers and volumes are excluded.',
      action: { kind: 'docker-image-prune' },
    });
  } catch {
    return undefined;
  }
}

async function disabledSnapFinding(): Promise<Finding | undefined> {
  if (!(await commandExists('snap'))) return undefined;
  try {
    const result = await runCommand('snap', ['list', '--all'], { timeoutMs: 10_000 });
    let total = 0;
    let count = 0;
    for (const line of result.stdout.split('\n').slice(1)) {
      const columns = line.trim().split(/\s+/);
      if (!line.includes('disabled') || columns.length < 3) continue;
      count += 1;
      const snapPath = `/var/lib/snapd/snaps/${columns[0]}_${columns[2]}.snap`;
      try {
        total += (await stat(snapPath)).size;
      } catch {
        // The snap can disappear between listing and sizing.
      }
    }
    if (count === 0) return undefined;
    return finding({
      id: 'snap-disabled',
      title: 'Disabled Snap revisions',
      category: 'Packages',
      risk: 'medium',
      reclaimableBytes: total,
      recovery: 'automatic',
      status: 'detected',
      evidence: `${count} disabled Snap revision${count === 1 ? '' : 's'} detected.`,
      action: { kind: 'snap-disabled-remove' },
    });
  } catch {
    return undefined;
  }
}

export async function discoverRotatedLogs(): Promise<string[]> {
  const roots = ['/var/log'];
  const results: string[] = [];
  const threshold = Date.now() - LOG_RETENTION_MS;
  const stack = [...roots];
  while (stack.length && results.length < 5_000) {
    const current = stack.pop();
    if (!current) continue;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && isRotatedLogName(entry.name)) {
        try {
          if ((await stat(fullPath)).mtimeMs < threshold) results.push(fullPath);
        } catch {
          // Ignore a disappearing log.
        }
      }
    }
  }
  return results;
}

async function rotatedLogsFinding(): Promise<Finding | undefined> {
  const files = await discoverRotatedLogs();
  let total = 0;
  for (const file of files) {
    try {
      total += (await stat(file)).size;
    } catch {
      // Ignore a disappearing log.
    }
  }
  if (files.length === 0) return undefined;
  return finding({
    id: 'rotated-logs',
    title: 'Old rotated log files',
    category: 'Logs',
    risk: 'low',
    reclaimableBytes: total,
    recovery: 'quarantine',
    status: 'detected',
    evidence: `${files.length} rotated logs older than seven days were found under /var/log.`,
    action: { kind: 'rotated-logs-quarantine' },
  });
}

export async function discoverNginxOrphans(): Promise<string[]> {
  const availableRoot = '/etc/nginx/sites-available';
  const enabledRoot = '/etc/nginx/sites-enabled';
  let available: string[] = [];
  let enabled: string[] = [];
  try {
    available = await readdir(availableRoot);
    enabled = await readdir(enabledRoot);
  } catch {
    return [];
  }
  const linked = new Set<string>();
  for (const name of enabled) {
    try {
      const target = await readlink(path.join(enabledRoot, name));
      linked.add(path.basename(target));
    } catch {
      linked.add(name);
    }
  }
  return available
    .filter((name) => name !== 'default' && !linked.has(name))
    .map((name) => path.join(availableRoot, name));
}

async function nginxFinding(): Promise<Finding | undefined> {
  const files = await discoverNginxOrphans();
  if (files.length === 0) return undefined;
  let total = 0;
  for (const file of files) {
    try {
      total += (await stat(file)).size;
    } catch {
      // Ignore a disappearing configuration.
    }
  }
  return finding({
    id: 'nginx-orphans',
    title: 'Unreferenced Nginx configurations',
    category: 'Configuration',
    risk: 'high',
    reclaimableBytes: total,
    recovery: 'quarantine',
    status: 'review',
    evidence: `${files.length} files in sites-available have no enabled symbolic link.`,
    action: { kind: 'nginx-orphans-quarantine' },
  });
}

async function discoverBrokenLinks(): Promise<string[]> {
  const roots = ['/etc/nginx/sites-enabled', '/etc/systemd/system'];
  const broken: string[] = [];
  const stack = [...roots];
  let visited = 0;
  while (stack.length > 0 && visited < 5_000) {
    const current = stack.pop();
    if (!current) continue;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      visited += 1;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      if (!entry.isSymbolicLink()) continue;
      try {
        await stat(fullPath);
      } catch {
        broken.push(fullPath);
      }
    }
  }
  return broken;
}

async function brokenLinksFinding(): Promise<Finding | undefined> {
  const links = await discoverBrokenLinks();
  if (links.length === 0) return undefined;
  return finding({
    id: 'broken-links-review',
    title: 'Broken configuration links',
    category: 'Configuration',
    risk: 'high',
    reclaimableBytes: 0,
    recovery: 'manual',
    status: 'review',
    evidence: `${links.length} broken symbolic link${links.length === 1 ? '' : 's'} found in Nginx or systemd configuration. Review: ${links.slice(0, 8).join(', ')}.`,
  });
}

async function collectText(root: string, extensions: readonly string[], limit = 512): Promise<string> {
  const stack = [root];
  const chunks: string[] = [];
  let visited = 0;
  while (stack.length > 0 && visited < limit) {
    const current = stack.pop();
    if (!current) continue;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      visited += 1;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))) {
        try {
          chunks.push(await readFile(fullPath, 'utf8'));
        } catch {
          // Unreadable or transient configuration files do not invalidate the scan.
        }
      }
    }
  }
  return chunks.join('\n');
}

async function certbotFinding(): Promise<Finding | undefined> {
  const renewalRoot = '/etc/letsencrypt/renewal';
  let renewalFiles: string[];
  try {
    renewalFiles = (await readdir(renewalRoot)).filter((name) => name.endsWith('.conf'));
  } catch {
    return undefined;
  }
  if (renewalFiles.length === 0) return undefined;
  const nginxText = await collectText('/etc/nginx', ['.conf', '']);
  const unreferenced: string[] = [];
  for (const file of renewalFiles) {
    const lineage = file.replace(/\.conf$/, '');
    let renewal = '';
    try {
      renewal = await readFile(path.join(renewalRoot, file), 'utf8');
    } catch {
      continue;
    }
    const certificatePath = renewal.match(/^cert\s*=\s*(.+)$/m)?.[1]?.trim();
    if (!nginxText.includes(`/live/${lineage}/`) && (!certificatePath || !nginxText.includes(certificatePath))) {
      unreferenced.push(lineage);
    }
  }
  if (unreferenced.length === 0) return undefined;
  return finding({
    id: 'certbot-lineages-review',
    title: 'Certbot lineages not referenced by Nginx',
    category: 'Certificates',
    risk: 'high',
    reclaimableBytes: 0,
    recovery: 'manual',
    status: 'review',
    evidence: `${unreferenced.length} lineage${unreferenced.length === 1 ? '' : 's'} are not referenced in Nginx configuration: ${unreferenced.slice(0, 12).join(', ')}. They may still serve another application, so no cleanup action is offered.`,
  });
}

async function pm2LogsFinding(): Promise<Finding | undefined> {
  const rootPm2Logs = '/root/.pm2/logs';
  const homeRoot = '/home';
  let total = await directorySize(rootPm2Logs);
  if (total === 0 && (await commandExists('pm2'))) {
    try {
      const result = await runCommand('pm2', ['jlist'], { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024 });
      const applications = JSON.parse(result.stdout || '[]') as Array<{ pm2_env?: { pm_out_log_path?: string; pm_err_log_path?: string } }>;
      const logPaths = applications.flatMap((application) => [
        application.pm2_env?.pm_out_log_path,
        application.pm2_env?.pm_err_log_path,
      ]).filter((value): value is string => Boolean(value));
      for (const logPath of new Set(logPaths)) {
        if (!logPath.startsWith(`${homeRoot}/`)) continue;
        try {
          total += (await stat(logPath)).size;
        } catch {
          // Ignore logs that rotate during the scan.
        }
      }
    } catch {
      return undefined;
    }
  }
  if (total < 50 * 1024 * 1024) return undefined;
  return finding({
    id: 'pm2-logs-review',
    title: 'Large PM2 logs require review',
    category: 'Logs',
    risk: 'medium',
    reclaimableBytes: total,
    recovery: 'manual',
    status: 'review',
    evidence: `PM2 log files use ${total} bytes. Use PM2 log rotation or flush them deliberately; this tool will not remove them automatically.`,
  });
}

async function deepReviewFindings(): Promise<Finding[]> {
  if (!(await commandExists('find'))) return [];
  try {
    const result = await runCommand(
      'find',
      ['/var', '/opt', '/root', '-xdev', '-type', 'f', '-size', '+500M', '-printf', '%p|%s\n'],
      { timeoutMs: 120_000, maxBytes: 512 * 1024 },
    );
    const lines = result.stdout.split('\n').filter(Boolean).slice(0, 50);
    if (lines.length === 0) return [];
    const bytes = lines.reduce((sum, line) => sum + Number(line.split('|').at(-1) ?? 0), 0);
    return [
      finding({
        id: 'large-files-review',
        title: 'Large files requiring review',
        category: 'Files',
        risk: 'high',
        reclaimableBytes: bytes,
        recovery: 'manual',
        status: 'review',
        evidence: `${lines.length} files larger than 500 MB were found. They are never removed automatically.`,
      }),
    ];
  } catch {
    return [];
  }
}

export async function analyzeSystem(depth: ScanDepth, scanId: string): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];
  const findings: Finding[] = [];
  const disk = await diskSummary();
  const failedLines = await failedServices().catch(() => []);
  const failed = failedLines.length;
  const analyzers = [
    () => aptFindings(),
    async () => [await journalFinding()].filter(Boolean) as Finding[],
    async () => [await dockerFinding()].filter(Boolean) as Finding[],
    async () => [await disabledSnapFinding()].filter(Boolean) as Finding[],
    async () => [await rotatedLogsFinding()].filter(Boolean) as Finding[],
    async () => [await nginxFinding()].filter(Boolean) as Finding[],
    async () => [failedServicesFinding(failedLines)].filter(Boolean) as Finding[],
  ];
  for (const analyzer of analyzers) {
    try {
      findings.push(...(await analyzer()));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'An analyzer failed.');
    }
  }
  if (depth === 'deep') {
    const deepAnalyzers = [
      deepReviewFindings,
      async () => [await brokenLinksFinding()].filter(Boolean) as Finding[],
      async () => [await certbotFinding()].filter(Boolean) as Finding[],
      async () => [await pm2LogsFinding()].filter(Boolean) as Finding[],
    ];
    for (const analyzer of deepAnalyzers) {
      try {
        findings.push(...(await analyzer()));
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : 'A deep analyzer failed.');
      }
    }
  }
  const potentialSavingsBytes = findings
    .filter((item) => item.action)
    .reduce((total, item) => total + item.reclaimableBytes, 0);
  const summary: SystemSummary = {
    hostname: hostname(),
    platform: 'Ubuntu Linux',
    disk,
    failedServices: failed,
    health: failed === 0 ? 'healthy' : 'attention',
    lastScanAt: new Date().toISOString(),
    potentialSavingsBytes,
  };
  return {
    scanId,
    depth,
    startedAt,
    completedAt: new Date().toISOString(),
    summary,
    findings,
    warnings,
  };
}

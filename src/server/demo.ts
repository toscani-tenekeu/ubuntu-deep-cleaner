import { hostname } from 'node:os';
import type { ScanDepth, ScanResult, SystemSummary } from '../shared/contracts.js';

export const demoSummary: SystemSummary = {
  hostname: hostname(),
  platform: 'Ubuntu Linux',
  disk: {
    totalBytes: 72 * 1024 ** 3,
    usedBytes: 33 * 1024 ** 3,
    freeBytes: 39 * 1024 ** 3,
    usedPercent: 46,
  },
  failedServices: 0,
  health: 'healthy',
  potentialSavingsBytes: 0,
};

export function demoScan(depth: ScanDepth, scanId: string): ScanResult {
  const now = new Date().toISOString();
  const findings = [
    {
      id: 'apt-cache',
      title: 'APT package cache',
      category: 'Packages',
      risk: 'low' as const,
      reclaimableBytes: 512 * 1024 ** 2,
      recovery: 'automatic' as const,
      status: 'detected' as const,
      evidence: 'Cached package archives are available for cleanup.',
      action: { kind: 'apt-cache-clean' as const },
      selectedByDefault: false as const,
    },
    {
      id: 'docker-images',
      title: 'Unused container images and build cache',
      category: 'Containers',
      risk: 'medium' as const,
      reclaimableBytes: 1.6 * 1024 ** 3,
      recovery: 'automatic' as const,
      status: 'detected' as const,
      evidence: 'Running containers and volumes are excluded.',
      action: { kind: 'docker-image-prune' as const },
      selectedByDefault: false as const,
    },
    {
      id: 'rotated-logs',
      title: 'Old rotated log files',
      category: 'Logs',
      risk: 'low' as const,
      reclaimableBytes: 320 * 1024 ** 2,
      recovery: 'quarantine' as const,
      status: 'detected' as const,
      evidence: 'Rotated logs older than seven days.',
      action: { kind: 'rotated-logs-quarantine' as const },
      selectedByDefault: false as const,
    },
    {
      id: 'snap-disabled',
      title: 'Disabled Snap revisions',
      category: 'Packages',
      risk: 'medium' as const,
      reclaimableBytes: 280 * 1024 ** 2,
      recovery: 'automatic' as const,
      status: 'detected' as const,
      evidence: 'Disabled revisions are not used by active applications.',
      action: { kind: 'snap-disabled-remove' as const },
      selectedByDefault: false as const,
    },
    {
      id: 'nginx-orphans',
      title: 'Unreferenced Nginx configurations',
      category: 'Configuration',
      risk: 'high' as const,
      reclaimableBytes: 84 * 1024,
      recovery: 'quarantine' as const,
      status: 'review' as const,
      evidence: 'Configurations are not linked from sites-enabled.',
      action: { kind: 'nginx-orphans-quarantine' as const },
      selectedByDefault: false as const,
    },
  ];
  const potentialSavingsBytes = findings.reduce((total, item) => total + item.reclaimableBytes, 0);
  return {
    scanId,
    depth,
    startedAt: now,
    completedAt: now,
    summary: { ...demoSummary, lastScanAt: now, potentialSavingsBytes },
    findings,
    warnings: [],
  };
}

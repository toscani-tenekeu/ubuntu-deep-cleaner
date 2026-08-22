export type ScanDepth = 'standard' | 'deep';
export type Risk = 'low' | 'medium' | 'high';
export type RecoveryMode = 'automatic' | 'quarantine' | 'manual';
export type FindingStatus = 'detected' | 'review';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ActionKind =
  | 'apt-cache-clean'
  | 'apt-autoremove'
  | 'journal-vacuum'
  | 'docker-image-prune'
  | 'snap-disabled-remove'
  | 'rotated-logs-quarantine'
  | 'nginx-orphans-quarantine';

export interface AgentAction {
  kind: ActionKind;
}

export interface Finding {
  id: string;
  title: string;
  category: string;
  risk: Risk;
  reclaimableBytes: number;
  recovery: RecoveryMode;
  status: FindingStatus;
  evidence: string;
  action?: AgentAction;
  selectedByDefault: false;
}

export interface DiskSummary {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
}

export interface SystemSummary {
  hostname: string;
  platform: string;
  disk: DiskSummary;
  failedServices: number;
  health: 'healthy' | 'attention';
  lastScanAt?: string;
  potentialSavingsBytes: number;
}

export interface ScanResult {
  scanId: string;
  depth: ScanDepth;
  startedAt: string;
  completedAt: string;
  summary: SystemSummary;
  findings: Finding[];
  warnings: string[];
}

export interface CleanupPlan {
  id: string;
  scanId: string;
  findingIds: string[];
  findings: Finding[];
  estimatedBytes: number;
  confirmationPhrase: string;
  hash: string;
  createdAt: string;
}

export interface ActionResult {
  kind: ActionKind;
  ok: boolean;
  reclaimedBytes: number;
  detail: string;
}

export interface CleanupResult {
  planId: string;
  startedAt: string;
  completedAt: string;
  beforeFreeBytes: number;
  afterFreeBytes: number;
  results: ActionResult[];
}

export interface Job<T = unknown> {
  id: string;
  type: 'scan' | 'cleanup' | 'restore';
  status: JobStatus;
  stage: string;
  progress?: number;
  createdAt: string;
  updatedAt: string;
  result?: T;
  error?: string;
}

export interface QuarantineEntry {
  id: string;
  jobId: string;
  originalPath: string;
  quarantinedPath: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
  restoredAt?: string;
}

export interface BootstrapResponse {
  csrfToken: string;
  summary: SystemSummary;
  latestScan?: ScanResult;
  agentConnected: boolean;
  demoMode: boolean;
}

export interface ApiError {
  error: string;
  code: string;
}

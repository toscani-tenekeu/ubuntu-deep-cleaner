import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { QuarantineEntry } from '../shared/contracts.js';
import { assertSafeRegularFile } from './filesystem.js';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export class Quarantine {
  readonly root: string;
  private readonly manifestPath: string;

  constructor(stateRoot: string) {
    this.root = path.join(stateRoot, 'quarantine');
    this.manifestPath = path.join(this.root, 'manifest.json');
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    try {
      await readFile(this.manifestPath, 'utf8');
    } catch {
      await this.save([]);
    }
  }

  async list(): Promise<QuarantineEntry[]> {
    await this.initialize();
    try {
      const parsed = JSON.parse(await readFile(this.manifestPath, 'utf8')) as QuarantineEntry[];
      return parsed.filter((entry) => !entry.restoredAt);
    } catch {
      return [];
    }
  }

  async moveFiles(jobId: string, files: readonly string[], allowedRoots: readonly string[]): Promise<QuarantineEntry[]> {
    await this.initialize();
    const entries = await this.readAll();
    const added: QuarantineEntry[] = [];
    const jobRoot = path.join(this.root, jobId);
    await mkdir(jobRoot, { recursive: true, mode: 0o700 });
    for (const originalPath of files) {
      await assertSafeRegularFile(originalPath, allowedRoots);
      const info = await stat(originalPath);
      const id = randomUUID();
      const quarantinedPath = path.join(jobRoot, `${id}-${path.basename(originalPath)}`);
      await rename(originalPath, quarantinedPath);
      const createdAt = new Date();
      const entry: QuarantineEntry = {
        id,
        jobId,
        originalPath,
        quarantinedPath,
        sizeBytes: info.size,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + RETENTION_MS).toISOString(),
      };
      entries.push(entry);
      added.push(entry);
    }
    await this.save(entries);
    return added;
  }

  async restore(id: string): Promise<QuarantineEntry> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid quarantine identifier');
    const entries = await this.readAll();
    const entry = entries.find((candidate) => candidate.id === id && !candidate.restoredAt);
    if (!entry) throw new Error('Quarantine entry not found');
    await mkdir(path.dirname(entry.originalPath), { recursive: true });
    try {
      await access(entry.originalPath);
      throw new Error(`Restore target already exists: ${entry.originalPath}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Restore target')) throw error;
    }
    await rename(entry.quarantinedPath, entry.originalPath);
    entry.restoredAt = new Date().toISOString();
    await this.save(entries);
    return entry;
  }

  async purgeExpired(now = Date.now()): Promise<{ purged: number; bytes: number }> {
    const entries = await this.readAll();
    let purged = 0;
    let bytes = 0;
    const retained: QuarantineEntry[] = [];
    for (const entry of entries) {
      if (entry.restoredAt || new Date(entry.expiresAt).getTime() > now) {
        retained.push(entry);
        continue;
      }
      const relative = path.relative(this.root, entry.quarantinedPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        retained.push(entry);
        continue;
      }
      try {
        await unlink(entry.quarantinedPath);
        purged += 1;
        bytes += entry.sizeBytes;
      } catch {
        retained.push(entry);
      }
    }
    await this.save(retained);
    return { purged, bytes };
  }

  private async readAll(): Promise<QuarantineEntry[]> {
    await this.initialize();
    return JSON.parse(await readFile(this.manifestPath, 'utf8')) as QuarantineEntry[];
  }

  private async save(entries: readonly QuarantineEntry[]): Promise<void> {
    await writeFile(this.manifestPath, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 });
  }
}

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type * as NodeSqlite from 'node:sqlite';
import type { CleanupPlan, Job, ScanResult } from '../shared/contracts.js';

// createRequire keeps the node: protocol intact when tsup bundles the server.
// A static import is rewritten to the unrelated package name "sqlite" by
// current esbuild versions, while this native runtime lookup is preserved.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof NodeSqlite;

export class Store {
  private readonly database: NodeSqlite.DatabaseSync;

  constructor(stateRoot: string) {
    mkdirSync(stateRoot, { recursive: true, mode: 0o750 });
    this.database = new DatabaseSync(path.join(stateRoot, 'audit.db'));
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        stage TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload_json TEXT,
        result_json TEXT,
        error TEXT
      );
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        completed_at TEXT NOT NULL,
        result_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        plan_json TEXT NOT NULL
      );
    `);
  }

  saveJob(job: Job): void {
    this.database
      .prepare(`
        INSERT INTO jobs (id, type, status, stage, created_at, updated_at, result_json, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status=excluded.status,
          stage=excluded.stage,
          updated_at=excluded.updated_at,
          result_json=excluded.result_json,
          error=excluded.error
      `)
      .run(
        job.id,
        job.type,
        job.status,
        job.stage,
        job.createdAt,
        job.updatedAt,
        job.result === undefined ? null : JSON.stringify(job.result),
        job.error ?? null,
      );
  }

  listJobs(limit = 50): Job[] {
    const rows = this.database
      .prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?')
      .all(Math.min(200, Math.max(1, limit))) as Array<Record<string, string | null>>;
    return rows.map((row) => ({
      id: String(row.id),
      type: String(row.type) as Job['type'],
      status: String(row.status) as Job['status'],
      stage: String(row.stage),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      ...(row.result_json ? { result: JSON.parse(row.result_json) } : {}),
      ...(row.error ? { error: row.error } : {}),
    }));
  }

  saveScan(scan: ScanResult): void {
    this.database
      .prepare('INSERT OR REPLACE INTO scans (id, completed_at, result_json) VALUES (?, ?, ?)')
      .run(scan.scanId, scan.completedAt, JSON.stringify(scan));
  }

  getScan(id: string): ScanResult | undefined {
    const row = this.database.prepare('SELECT result_json FROM scans WHERE id = ?').get(id) as
      | { result_json: string }
      | undefined;
    return row ? (JSON.parse(row.result_json) as ScanResult) : undefined;
  }

  latestScan(): ScanResult | undefined {
    const row = this.database.prepare('SELECT result_json FROM scans ORDER BY completed_at DESC LIMIT 1').get() as
      | { result_json: string }
      | undefined;
    return row ? (JSON.parse(row.result_json) as ScanResult) : undefined;
  }

  savePlan(plan: CleanupPlan): void {
    this.database
      .prepare('INSERT OR REPLACE INTO plans (id, scan_id, hash, created_at, plan_json) VALUES (?, ?, ?, ?, ?)')
      .run(plan.id, plan.scanId, plan.hash, plan.createdAt, JSON.stringify(plan));
  }

  getPlan(id: string): CleanupPlan | undefined {
    const row = this.database.prepare('SELECT plan_json FROM plans WHERE id = ?').get(id) as
      | { plan_json: string }
      | undefined;
    return row ? (JSON.parse(row.plan_json) as CleanupPlan) : undefined;
  }
}

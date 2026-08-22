import { describe, expect, it } from 'vitest';
import { demoScan } from '../src/server/demo.js';

describe('demo scan', () => {
  it('provides non-preselected, typed cleanup findings', () => {
    const scan = demoScan('deep', '11111111-1111-4111-8111-111111111111');
    expect(scan.findings.length).toBeGreaterThan(3);
    expect(scan.findings.every((finding) => finding.selectedByDefault === false)).toBe(true);
    expect(scan.summary.potentialSavingsBytes).toBeGreaterThan(0);
    expect(scan.findings.some((finding) => finding.risk === 'high')).toBe(true);
  });
});

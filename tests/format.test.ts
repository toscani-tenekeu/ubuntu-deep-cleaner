import { describe, expect, it } from 'vitest';
import { formatBytes, parseHumanBytes } from '../src/shared/format.js';

describe('byte formatting', () => {
  it('formats binary units for operators', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10 * 1024 ** 3)).toBe('10 GB');
  });

  it('parses journal and Docker size strings', () => {
    expect(parseHumanBytes('1.5 GiB')).toBe(Math.round(1.5 * 1024 ** 3));
    expect(parseHumanBytes('420 MB (80%)')).toBe(420 * 1024 ** 2);
    expect(parseHumanBytes('unknown')).toBe(0);
  });
});

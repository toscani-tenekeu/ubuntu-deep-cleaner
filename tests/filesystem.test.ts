import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertSafeRegularFile, directorySize, isRotatedLogName } from '../src/agent/filesystem.js';

describe('filesystem safety', () => {
  it('accepts regular files only inside an allowed real path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'udc-path-'));
    const file = path.join(root, 'safe.log.1');
    await writeFile(file, 'safe');
    await expect(assertSafeRegularFile(file, [root])).resolves.toBeUndefined();

    const link = path.join(root, 'link');
    await symlink(file, link);
    await expect(assertSafeRegularFile(link, [root])).rejects.toThrow('regular file');
    await expect(assertSafeRegularFile('/etc/passwd', [root])).rejects.toThrow('allowed roots');
  });

  it('sizes files without following symlinks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'udc-size-'));
    await writeFile(path.join(root, 'one'), '12345');
    await symlink('/etc/passwd', path.join(root, 'outside'));
    expect(await directorySize(root)).toBe(5);
  });

  it('recognizes common rotated log names', () => {
    expect(isRotatedLogName('syslog.2.gz')).toBe(true);
    expect(isRotatedLogName('app.log-20260801')).toBe(true);
    expect(isRotatedLogName('current.log')).toBe(false);
  });
});

import { lstat, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export async function directorySize(root: string, limit = 100_000): Promise<number> {
  let total = 0;
  let visited = 0;
  const stack = [root];
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
      try {
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) stack.push(fullPath);
        else if (entry.isFile()) total += (await stat(fullPath)).size;
      } catch {
        // Files may disappear during a scan.
      }
    }
  }
  return total;
}

export async function assertSafeRegularFile(filePath: string, roots: readonly string[]): Promise<void> {
  if (!path.isAbsolute(filePath) || filePath.includes('\0')) throw new Error('Path must be absolute');
  const parentReal = await realpath(path.dirname(filePath));
  const allowed = roots.some((root) => parentReal === root || parentReal.startsWith(`${root}${path.sep}`));
  if (!allowed) throw new Error(`Path is outside the allowed roots: ${filePath}`);
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Path is not a regular file: ${filePath}`);
}

export function isRotatedLogName(name: string): boolean {
  return /\.(?:[1-9]\d*|gz|xz|zst)$/.test(name) || /\.log-[\d]{8,}/.test(name);
}

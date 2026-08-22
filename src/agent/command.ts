import { spawn } from 'node:child_process';

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function runCommand(
  command: string,
  args: readonly string[],
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      shell: false,
      env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C', LC_ALL: 'C' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      if (!settled) {
        settled = true;
        reject(new Error(`${command} timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    const collect = (target: 'stdout' | 'stderr', chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        child.kill('SIGKILL');
        return;
      }
      if (target === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };
    child.stdout.on('data', (chunk: Buffer) => collect('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => collect('stderr', chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (bytes > maxBytes) {
        reject(new Error(`${command} exceeded the ${maxBytes} byte output limit`));
        return;
      }
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

export async function commandExists(command: string): Promise<boolean> {
  try {
    return (await runCommand('/usr/bin/which', [command], { timeoutMs: 3_000, maxBytes: 8_192 })).code === 0;
  } catch {
    return false;
  }
}

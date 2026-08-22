const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${UNITS[exponent]}`;
}

export function parseHumanBytes(input: string): number {
  const match = input.trim().replaceAll(',', '').match(/([\d.]+)\s*([kmgt]?i?b)/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? 'b';
  const powers: Record<string, number> = {
    b: 0,
    kb: 1,
    kib: 1,
    mb: 2,
    mib: 2,
    gb: 3,
    gib: 3,
    tb: 4,
    tib: 4,
  };
  return Math.round(value * 1024 ** (powers[unit] ?? 0));
}

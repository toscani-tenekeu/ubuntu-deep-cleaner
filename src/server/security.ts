import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export class RequestSecurity {
  readonly csrfToken = randomBytes(32).toString('base64url');
  private readonly allowedHosts: Set<string>;

  constructor(port: number) {
    this.allowedHosts = new Set([
      `127.0.0.1:${port}`,
      `localhost:${port}`,
      `[::1]:${port}`,
      '127.0.0.1',
      'localhost',
      '[::1]',
    ]);
  }

  validate(request: IncomingMessage, mutating: boolean): { ok: true } | { ok: false; reason: string } {
    const host = request.headers.host ?? '';
    if (!this.allowedHosts.has(host)) return { ok: false, reason: 'Host is not allowed' };
    const fetchSite = request.headers['sec-fetch-site'];
    if (fetchSite && !['same-origin', 'none'].includes(String(fetchSite))) {
      return { ok: false, reason: 'Cross-site requests are not allowed' };
    }
    const origin = request.headers.origin;
    if (origin) {
      try {
        const parsed = new URL(origin);
        if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
          return { ok: false, reason: 'Origin is not allowed' };
        }
      } catch {
        return { ok: false, reason: 'Origin is invalid' };
      }
    }
    if (!mutating) return { ok: true };
    if (!(request.headers['content-type'] ?? '').startsWith('application/json')) {
      return { ok: false, reason: 'Mutating requests must use application/json' };
    }
    const supplied = request.headers['x-csrf-token'];
    if (typeof supplied !== 'string') return { ok: false, reason: 'CSRF token is missing' };
    const expected = Buffer.from(this.csrfToken);
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return { ok: false, reason: 'CSRF token is invalid' };
    }
    return { ok: true };
  }
}

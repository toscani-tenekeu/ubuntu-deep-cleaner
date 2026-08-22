import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { RequestSecurity } from '../src/server/security.js';

function request(headers: Record<string, string>): IncomingMessage {
  return { headers } as IncomingMessage;
}

describe('localhost request security', () => {
  it('accepts a local read request', () => {
    const security = new RequestSecurity(8787);
    expect(security.validate(request({ host: '127.0.0.1:8787' }), false)).toEqual({ ok: true });
  });

  it('rejects DNS rebinding and cross-site requests', () => {
    const security = new RequestSecurity(8787);
    expect(security.validate(request({ host: 'attacker.example' }), false)).toMatchObject({ ok: false });
    expect(
      security.validate(request({ host: 'localhost:8787', 'sec-fetch-site': 'cross-site' }), false),
    ).toMatchObject({ ok: false });
  });

  it('requires JSON and the exact CSRF token for mutations', () => {
    const security = new RequestSecurity(8787);
    expect(
      security.validate(request({ host: 'localhost:8787', 'content-type': 'text/plain' }), true),
    ).toMatchObject({ ok: false });
    expect(
      security.validate(
        request({
          host: 'localhost:8787',
          'content-type': 'application/json',
          'x-csrf-token': security.csrfToken,
        }),
        true,
      ),
    ).toEqual({ ok: true });
  });
});

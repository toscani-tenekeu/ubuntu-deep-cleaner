import http from 'node:http';

export class AgentClient {
  constructor(private readonly socketPath: string) {}

  async connected(): Promise<boolean> {
    try {
      await this.request('/health', 'GET');
      return true;
    } catch {
      return false;
    }
  }

  async request<T>(requestPath: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const request = http.request(
        {
          socketPath: this.socketPath,
          path: requestPath,
          method,
          headers: payload
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
            : undefined,
          timeout: 10 * 60 * 1000,
        },
        (response) => {
          let data = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => (data += chunk));
          response.on('end', () => {
            let parsed: any;
            try {
              parsed = JSON.parse(data || '{}');
            } catch {
              reject(new Error('Agent returned invalid JSON'));
              return;
            }
            if ((response.statusCode ?? 500) >= 400) reject(new Error(parsed.error ?? 'Agent request failed'));
            else resolve(parsed as T);
          });
        },
      );
      request.on('timeout', () => request.destroy(new Error('Agent request timed out')));
      request.on('error', reject);
      if (payload) request.write(payload);
      request.end();
    });
  }
}

import type {
  BootstrapResponse,
  CleanupPlan,
  Job,
  QuarantineEntry,
  ScanDepth,
  ScanResult,
} from '../shared/contracts.js';

export class ApiClient {
  private csrfToken = '';

  async bootstrap(): Promise<BootstrapResponse> {
    const result = await this.request<BootstrapResponse>('/api/v1/bootstrap');
    this.csrfToken = result.csrfToken;
    return result;
  }

  scan(depth: ScanDepth): Promise<Job<ScanResult>> {
    return this.request('/api/v1/scans', { method: 'POST', body: JSON.stringify({ depth }) });
  }

  getScan(id: string): Promise<ScanResult> {
    return this.request(`/api/v1/scans/${id}`);
  }

  createPlan(scanId: string, findingIds: string[]): Promise<CleanupPlan> {
    return this.request('/api/v1/plans', { method: 'POST', body: JSON.stringify({ scanId, findingIds }) });
  }

  executePlan(plan: CleanupPlan, confirmationPhrase: string): Promise<Job> {
    return this.request(`/api/v1/plans/${plan.id}/execute`, {
      method: 'POST',
      body: JSON.stringify({ confirmationPhrase, hash: plan.hash }),
    });
  }

  history(): Promise<Job[]> {
    return this.request('/api/v1/history');
  }

  quarantine(): Promise<QuarantineEntry[]> {
    return this.request('/api/v1/quarantine');
  }

  restore(id: string): Promise<QuarantineEntry> {
    return this.request(`/api/v1/quarantine/${id}/restore`, { method: 'POST', body: '{}' });
  }

  jobEvents<T>(id: string, onJob: (job: Job<T>) => void, onError: () => void): EventSource {
    const source = new EventSource(`/api/v1/jobs/${id}/events`);
    source.addEventListener('job', (event) => onJob(JSON.parse((event as MessageEvent).data) as Job<T>));
    source.onerror = () => {
      source.close();
      onError();
    };
    return source;
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (init.method && init.method !== 'GET') {
      headers.set('content-type', 'application/json');
      headers.set('x-csrf-token', this.csrfToken);
    }
    const response = await fetch(url, { ...init, headers, credentials: 'same-origin' });
    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? `Request failed with ${response.status}`);
    return payload;
  }
}

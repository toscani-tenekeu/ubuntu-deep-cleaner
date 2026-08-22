import { LitElement, html, nothing, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import Archive20 from '@carbon/icons/es/archive/20.js';
import Dashboard20 from '@carbon/icons/es/dashboard/20.js';
import Help20 from '@carbon/icons/es/help/20.js';
import List20 from '@carbon/icons/es/list/20.js';
import Menu20 from '@carbon/icons/es/menu/20.js';
import Search20 from '@carbon/icons/es/search/20.js';
import Settings20 from '@carbon/icons/es/settings/20.js';
import Time20 from '@carbon/icons/es/time/20.js';
import '@carbon/web-components/es/components/button/button.js';
import '@carbon/web-components/es/components/data-table/index.js';
import '@carbon/web-components/es/components/icon/icon.js';
import '@carbon/web-components/es/components/modal/index.js';
import '@carbon/web-components/es/components/notification/inline-notification.js';
import '@carbon/web-components/es/components/progress-bar/progress-bar.js';
import '@carbon/web-components/es/components/search/search.js';
import '@carbon/web-components/es/components/tag/tag.js';
import '@carbon/web-components/es/components/text-input/text-input.js';
import type {
  BootstrapResponse,
  CleanupPlan,
  CleanupResult,
  Finding,
  Job,
  QuarantineEntry,
  ScanResult,
  SystemSummary,
} from '../shared/contracts.js';
import { formatBytes } from '../shared/format.js';
import { ApiClient } from './api.js';
import { appStyles } from './styles.js';

type View = 'overview' | 'scan' | 'findings' | 'quarantine' | 'history';

interface IconDescriptor {
  elem: string;
  attrs: Record<string, unknown>;
  content: unknown[];
}

const NAV_ITEMS: Array<{ id: View; label: string; icon: IconDescriptor }> = [
  { id: 'overview', label: 'Overview', icon: Dashboard20 as IconDescriptor },
  { id: 'scan', label: 'Scan', icon: Search20 as IconDescriptor },
  { id: 'findings', label: 'Findings', icon: List20 as IconDescriptor },
  { id: 'quarantine', label: 'Quarantine', icon: Archive20 as IconDescriptor },
  { id: 'history', label: 'History', icon: Time20 as IconDescriptor },
];

@customElement('udc-app')
export class UbuntuDeepCleanerApp extends LitElement {
  static styles = appStyles;
  private readonly api = new ApiClient();

  @state() private bootstrapData: BootstrapResponse | undefined = undefined;
  @state() private currentScan: ScanResult | undefined = undefined;
  @state() private activeJob: Job | undefined = undefined;
  @state() private currentPlan: CleanupPlan | undefined = undefined;
  @state() private selected = new Set<string>();
  @state() private view: View = 'overview';
  @state() private query = '';
  @state() private risk = 'all';
  @state() private category = 'all';
  @state() private loading = true;
  @state() private error = '';
  @state() private notice = '';
  @state() private navOpen = false;
  @state() private confirmation = '';
  @state() private historyItems: Job[] = [];
  @state() private quarantineItems: QuarantineEntry[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    this.loading = true;
    try {
      this.bootstrapData = await this.api.bootstrap();
      this.currentScan = this.bootstrapData.latestScan;
      this.notice = this.bootstrapData.demoMode
        ? 'Demo mode is active. Cleanup actions do not modify this host.'
        : this.bootstrapData.agentConnected
          ? 'The privileged agent is connected. No item is selected automatically.'
          : 'The privileged agent is offline. Start it before running a scan.';
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to load the application.';
    } finally {
      this.loading = false;
    }
  }

  private async runScan(): Promise<void> {
    this.error = '';
    this.notice = '';
    this.selected = new Set();
    try {
      const job = await this.api.scan('deep');
      this.activeJob = job;
      this.view = 'overview';
      this.watchJob<ScanResult>(job.id, async (completed) => {
        if (completed.result) {
          this.currentScan = completed.result;
          if (this.bootstrapData) {
            this.bootstrapData = { ...this.bootstrapData, summary: completed.result.summary, latestScan: completed.result };
          }
          this.notice = `Deep scan completed with ${completed.result.findings.length} findings.`;
        }
      });
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to start the scan.';
    }
  }

  private watchJob<T>(id: string, complete: (job: Job<T>) => void): void {
    let finished = false;
    const source = this.api.jobEvents<T>(
      id,
      (job) => {
        this.activeJob = job;
        if (['completed', 'failed', 'cancelled'].includes(job.status)) {
          finished = true;
          source.close();
          if (job.status === 'completed') complete(job);
          else this.error = job.error ?? `${job.type} failed.`;
        }
      },
      () => {
        if (!finished) this.error = 'The live job connection was interrupted.';
      },
    );
  }

  private tableSelectionChanged(event: CustomEvent): void {
    const rows = (event.detail?.selectedRows ?? []) as HTMLElement[];
    this.selected = new Set(rows.map((row) => row.getAttribute('selection-name')).filter(Boolean) as string[]);
  }

  private async reviewPlan(): Promise<void> {
    if (!this.currentScan || this.selected.size === 0) return;
    this.error = '';
    try {
      this.currentPlan = await this.api.createPlan(this.currentScan.scanId, [...this.selected]);
      this.confirmation = '';
      const modal = this.renderRoot.querySelector('#cleanup-modal') as HTMLElement & { open: boolean };
      modal.open = true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to create the cleanup plan.';
    }
  }

  private async executePlan(): Promise<void> {
    if (!this.currentPlan || this.confirmation !== this.currentPlan.confirmationPhrase) return;
    const modal = this.renderRoot.querySelector('#cleanup-modal') as HTMLElement & { open: boolean };
    modal.open = false;
    this.error = '';
    try {
      const job = await this.api.executePlan(this.currentPlan, this.confirmation);
      this.activeJob = job;
      this.watchJob<CleanupResult>(job.id, (completed) => {
        const result = completed.result;
        const failures = result?.results.filter((item) => !item.ok).length ?? 0;
        this.notice = failures
          ? `Cleanup completed with ${failures} failed action${failures === 1 ? '' : 's'}.`
          : `Cleanup completed. ${formatBytes(Math.max(0, (result?.afterFreeBytes ?? 0) - (result?.beforeFreeBytes ?? 0)))} recovered.`;
        this.selected = new Set();
        this.currentPlan = undefined;
        void this.runScan();
      });
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to execute the cleanup plan.';
    }
  }

  private async switchView(view: View): Promise<void> {
    this.view = view;
    this.navOpen = false;
    this.error = '';
    if (view === 'history') this.historyItems = await this.api.history().catch(() => []);
    if (view === 'quarantine') this.quarantineItems = await this.api.quarantine().catch(() => []);
  }

  private async restore(entry: QuarantineEntry): Promise<void> {
    try {
      await this.api.restore(entry.id);
      this.notice = `Restored ${entry.originalPath}.`;
      this.quarantineItems = await this.api.quarantine();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Restore failed.';
    }
  }

  private get summary(): SystemSummary | undefined {
    return this.currentScan?.summary ?? this.bootstrapData?.summary;
  }

  private get filteredFindings(): Finding[] {
    const findings = this.currentScan?.findings ?? [];
    const query = this.query.trim().toLowerCase();
    return findings.filter((item) => {
      const matchesQuery = !query || `${item.title} ${item.category} ${item.evidence}`.toLowerCase().includes(query);
      return matchesQuery && (this.risk === 'all' || item.risk === this.risk) && (this.category === 'all' || item.category === this.category);
    });
  }

  private renderIcon(icon: IconDescriptor, label?: string): TemplateResult {
    return html`<cds-icon .icon=${icon} .size=${20} aria-label=${label ?? nothing}></cds-icon>`;
  }

  private renderHeader(): TemplateResult {
    return html`
      <header class="topbar">
        <button class="menu-toggle" aria-label="Toggle navigation" @click=${() => (this.navOpen = !this.navOpen)}>
          ${this.renderIcon(Menu20 as IconDescriptor)}
        </button>
        <div class="brand">Ubuntu Deep Cleaner</div>
        <div class="connection">
          <span class="connection-dot ${this.bootstrapData?.agentConnected ? '' : 'offline'}"></span>
          <span>${this.bootstrapData?.demoMode ? 'Demo' : this.bootstrapData?.agentConnected ? 'Localhost' : 'Agent offline'}</span>
        </div>
      </header>
      <nav class="side-nav ${this.navOpen ? 'open' : ''}" aria-label="Primary navigation">
        <ul class="nav-list">
          ${NAV_ITEMS.map(
            (item) => html`<li>
              <button
                class="nav-link ${this.view === item.id ? 'active' : ''}"
                aria-current=${this.view === item.id ? 'page' : nothing}
                @click=${() => this.switchView(item.id)}>
                ${this.renderIcon(item.icon)}<span>${item.label}</span>
              </button>
            </li>`,
          )}
        </ul>
        <div class="nav-spacer"></div>
        <button class="nav-link" @click=${() => (this.notice = 'Settings are managed in /etc/ubuntu-deep-cleaner/config.json.')}>
          ${this.renderIcon(Settings20 as IconDescriptor)}<span>Settings</span>
        </button>
        <button class="nav-link" @click=${() => (this.notice = 'Open README.md for installation, security and recovery guidance.')}>
          ${this.renderIcon(Help20 as IconDescriptor)}<span>Help</span>
        </button>
      </nav>
    `;
  }

  private renderPageHeader(title = 'System overview', description = 'Review disk usage, identify reclaimable space, and clean safely.') {
    return html`<div class="page-header">
      <div class="page-heading"><h1>${title}</h1><p class="lede">${description}</p></div>
      ${this.view === 'overview' || this.view === 'scan'
        ? html`<cds-button ?disabled=${this.activeJob?.status === 'running'} @click=${this.runScan}>Run deep scan</cds-button>`
        : nothing}
    </div>`;
  }

  private renderProgress(): TemplateResult | typeof nothing {
    if (!this.activeJob || !['queued', 'running'].includes(this.activeJob.status)) return nothing;
    return html`<section class="scan-progress" aria-live="polite" aria-busy="true">
      <div><div class="scan-stage">${this.activeJob.type === 'scan' ? 'Scanning filesystem' : 'Cleaning system'}</div><div class="scan-helper">${this.activeJob.stage}</div></div>
      <cds-progress-bar
        label=${this.activeJob.stage}
        helper-text=${this.activeJob.progress === undefined ? 'Working…' : `${this.activeJob.progress}%`}
        .value=${this.activeJob.progress}
        max="100"
        size="small"></cds-progress-bar>
      <span class="scan-helper">Job ${this.activeJob.id.slice(0, 8)}</span>
    </section>`;
  }

  private renderMetrics(): TemplateResult {
    const summary = this.summary;
    if (!summary) return html`<div class="metrics">${[1, 2, 3, 4].map(() => html`<div class="metric"><div class="skeleton-line"></div></div>`)}</div>`;
    return html`<section class="metrics" aria-label="System metrics">
      <article class="metric">
        <div class="metric-label">Disk used</div>
        <div class="metric-value">${formatBytes(summary.disk.usedBytes)} / ${formatBytes(summary.disk.totalBytes)}</div>
        <div class="disk-track" role="progressbar" aria-label="Disk usage" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${summary.disk.usedPercent}>
          <div class="disk-fill" style=${`width:${summary.disk.usedPercent}%`}></div>
        </div>
        <div class="metric-helper">${summary.disk.usedPercent}% used</div>
      </article>
      <article class="metric"><div class="metric-label">Free space</div><div class="metric-value">${formatBytes(summary.disk.freeBytes)}</div><div class="metric-helper">Available on the root filesystem</div></article>
      <article class="metric"><div class="metric-label">Potential savings</div><div class="metric-value">${formatBytes(summary.potentialSavingsBytes)}</div><div class="metric-helper">Based on the latest scan</div></article>
      <article class="metric"><div class="metric-label">System health</div><div class="metric-value">${summary.health === 'healthy' ? 'Healthy' : 'Attention'}</div><div class="metric-helper">${summary.failedServices === 0 ? 'All monitored services operational' : `${summary.failedServices} failed services detected`}</div></article>
    </section>`;
  }

  private renderNotifications(): TemplateResult | typeof nothing {
    if (!this.error && !this.notice) return nothing;
    return html`<div class="notification-row" aria-live="polite">
      <cds-inline-notification
        kind=${this.error ? 'error' : 'info'}
        title=${this.error ? 'Action required' : 'System status'}
        subtitle=${this.error || this.notice}
        low-contrast
        @cds-notification-closed=${() => {
          this.error = '';
          this.notice = '';
        }}></cds-inline-notification>
    </div>`;
  }

  private renderFindings(): TemplateResult {
    const categories = [...new Set((this.currentScan?.findings ?? []).map((item) => item.category))].sort();
    const selectedFindings = (this.currentScan?.findings ?? []).filter((item) => this.selected.has(item.id));
    const estimated = selectedFindings.reduce((sum, item) => sum + item.reclaimableBytes, 0);
    return html`<section class="workspace">
      <div class="findings">
        <div class="findings-heading"><h2>Cleanup findings</h2></div>
        <div class="toolbar">
          <cds-search
            label-text="Search findings"
            placeholder="Search findings"
            .value=${this.query}
            @cds-search-input=${(event: CustomEvent) => (this.query = event.detail.value ?? '')}></cds-search>
          <div class="native-filter"><label for="risk-filter">Risk</label><select id="risk-filter" .value=${this.risk} @change=${(event: Event) => (this.risk = (event.target as HTMLSelectElement).value)}><option value="all">All risks</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
          <div class="native-filter"><label for="category-filter">Category</label><select id="category-filter" .value=${this.category} @change=${(event: Event) => (this.category = (event.target as HTMLSelectElement).value)}><option value="all">All categories</option>${categories.map((value) => html`<option value=${value}>${value}</option>`)}</select></div>
          <span class="result-count">${this.filteredFindings.length} items</span>
        </div>
        ${this.loading
          ? html`<cds-table-skeleton row-count="6" column-count="6"></cds-table-skeleton>`
          : this.filteredFindings.length === 0
            ? html`<div class="empty-state"><div><h2>No findings</h2><p>Run a deep scan or adjust the current filters.</p></div></div>`
            : html`<div class="table-scroll">
                <cds-table
                  is-selectable
                  size="sm"
                  @cds-table-row-selected=${this.tableSelectionChanged}>
                  <cds-table-head><cds-table-header-row selection-name="header"><cds-table-header-cell>Item</cds-table-header-cell><cds-table-header-cell>Category</cds-table-header-cell><cds-table-header-cell>Risk</cds-table-header-cell><cds-table-header-cell>Reclaimable</cds-table-header-cell><cds-table-header-cell>Recovery</cds-table-header-cell><cds-table-header-cell>Status</cds-table-header-cell></cds-table-header-row></cds-table-head>
                  <cds-table-body>
                    ${this.filteredFindings.map(
                      (item) => html`<cds-table-row selection-name=${item.id} ?disabled=${!item.action} ?selected=${this.selected.has(item.id)}>
                        <cds-table-cell><div class="item-title">${item.title}</div><div class="item-evidence" title=${item.evidence}>${item.evidence}</div></cds-table-cell>
                        <cds-table-cell>${item.category}</cds-table-cell>
                        <cds-table-cell><span class="risk risk-${item.risk}">${item.risk}</span></cds-table-cell>
                        <cds-table-cell>${formatBytes(item.reclaimableBytes)}</cds-table-cell>
                        <cds-table-cell>${item.recovery}</cds-table-cell>
                        <cds-table-cell><span class="status">${item.status}</span></cds-table-cell>
                      </cds-table-row>`,
                    )}
                  </cds-table-body>
                </cds-table>
              </div>`}
      </div>
      <aside class="plan" aria-label="Cleanup plan">
        <h2>Cleanup plan</h2>
        <div class="plan-block"><div class="plan-label">Selected items</div><div class="plan-value">${this.selected.size}</div><div class="plan-helper">of ${this.currentScan?.findings.length ?? 0} findings</div></div>
        <div class="plan-block"><div class="plan-label">Estimated recovery</div><div class="plan-value">${formatBytes(estimated)}</div><div class="plan-helper">Revalidated immediately before cleanup</div></div>
        <div class="plan-block"><div class="plan-label">Quarantine policy</div><h3>Keep files for 7 days</h3><div class="plan-helper">Compatible files can be restored from Quarantine.</div></div>
        <div class="plan-action"><cds-button style="width:100%" ?disabled=${this.selected.size === 0} @click=${this.reviewPlan}>Review and clean</cds-button><div class="plan-helper">Select one or more actionable findings.</div></div>
      </aside>
    </section>`;
  }

  private renderOverview(): TemplateResult {
    return html`${this.renderPageHeader()}${this.renderProgress()}${this.renderMetrics()}${this.renderNotifications()}${this.renderFindings()}`;
  }

  private renderScanPage(): TemplateResult {
    return html`${this.renderPageHeader('Deep scan', 'Inspect packages, services, containers, logs, configuration and large files without modifying the host.')}${this.renderProgress()}${this.renderNotifications()}<div class="empty-state"><div><h2>${this.currentScan ? 'Latest scan is ready' : 'No scan has run yet'}</h2><p>${this.currentScan ? `${this.currentScan.findings.length} findings were recorded at ${new Date(this.currentScan.completedAt).toLocaleString()}. Open Findings to review them.` : 'Run a deep scan to build an evidence-based cleanup plan.'}</p></div></div>`;
  }

  private renderFindingsPage(): TemplateResult {
    return html`${this.renderPageHeader('Findings', 'Filter, inspect and select evidence-backed cleanup candidates.')}${this.renderProgress()}${this.renderNotifications()}${this.renderFindings()}`;
  }

  private renderQuarantinePage(): TemplateResult {
    return html`${this.renderPageHeader('Quarantine', 'Restore ordinary files for seven days before they are permanently purged.')}${this.renderNotifications()}<div class="history-list">
      ${this.quarantineItems.length === 0
        ? html`<div class="empty-state"><div><h2>Quarantine is empty</h2><p>Files moved by compatible cleanup actions will appear here.</p></div></div>`
        : this.quarantineItems.map((entry) => html`<div class="history-row"><strong>${formatBytes(entry.sizeBytes)}</strong><span>${entry.originalPath}</span><span>${new Date(entry.expiresAt).toLocaleDateString()}</span><cds-button kind="ghost" size="sm" @click=${() => this.restore(entry)}>Restore</cds-button></div>`)}
    </div>`;
  }

  private renderHistoryPage(): TemplateResult {
    return html`${this.renderPageHeader('History', 'Review scan and cleanup jobs recorded in the local audit database.')}${this.renderNotifications()}<div class="history-list">
      ${this.historyItems.length === 0
        ? html`<div class="empty-state"><div><h2>No recorded jobs</h2><p>Completed scans and cleanup operations will appear here.</p></div></div>`
        : this.historyItems.map((job) => html`<div class="history-row"><strong>${job.type}</strong><span>${job.stage}</span><span class="status">${job.status}</span><time>${new Date(job.createdAt).toLocaleString()}</time></div>`)}
    </div>`;
  }

  private renderModal(): TemplateResult {
    const plan = this.currentPlan;
    return html`<cds-modal id="cleanup-modal" size="sm" prevent-close-on-click-outside>
      <cds-modal-header><cds-modal-close-button></cds-modal-close-button><cds-modal-label>Destructive operation</cds-modal-label><cds-modal-heading>Review cleanup plan</cds-modal-heading></cds-modal-header>
      <cds-modal-body><cds-modal-body-content>
        <p class="modal-copy">The agent will revalidate every selected action before execution. Package and container operations use their native tools; eligible files move to quarantine.</p>
        <div class="modal-summary"><span>Estimated recovery</span><strong>${formatBytes(plan?.estimatedBytes ?? 0)}</strong><span>${plan?.findings.length ?? 0} selected actions</span></div>
        <p class="confirmation-help">Type <strong>${plan?.confirmationPhrase ?? ''}</strong> to confirm.</p>
        <cds-text-input label="Confirmation phrase" .value=${this.confirmation} @input=${(event: Event) => (this.confirmation = (event.target as HTMLInputElement & { value: string }).value)}></cds-text-input>
      </cds-modal-body-content></cds-modal-body>
      <cds-modal-footer><cds-modal-footer-button kind="secondary" data-modal-close>Cancel</cds-modal-footer-button><cds-modal-footer-button kind="danger" ?disabled=${!plan || this.confirmation !== plan.confirmationPhrase} @click=${this.executePlan}>Clean selected items</cds-modal-footer-button></cds-modal-footer>
    </cds-modal>`;
  }

  render(): TemplateResult {
    const page = {
      overview: () => this.renderOverview(),
      scan: () => this.renderScanPage(),
      findings: () => this.renderFindingsPage(),
      quarantine: () => this.renderQuarantinePage(),
      history: () => this.renderHistoryPage(),
    }[this.view]();
    return html`${this.renderHeader()}<main id="main-content" tabindex="-1"><div class="content">${page}</div></main>${this.renderModal()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'udc-app': UbuntuDeepCleanerApp;
  }
}

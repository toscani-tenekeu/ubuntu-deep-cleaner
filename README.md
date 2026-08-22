# Ubuntu Deep Cleaner

A localhost-only analysis and cleanup console for Ubuntu 22.04 and 24.04. It inventories reclaimable disk space, explains the evidence, and executes only actions explicitly selected and confirmed by the operator.

The interface is built with standards-based [Carbon Web Components](https://github.com/carbon-design-system/carbon-web-components). The backend is Node.js with no application framework and uses the built-in SQLite module for a local audit trail.

## Safety model

- The web console listens only on `127.0.0.1:8787`.
- A non-root API process talks to a separate root agent through a Unix socket.
- The root agent accepts a fixed action enum; it never accepts commands or arbitrary paths from the browser.
- Nothing is preselected. Cleanup requires a generated plan, its SHA-256 hash, a modal review, and an exact confirmation phrase.
- Ordinary files and Nginx configurations are quarantined for seven days before expiry.
- Active Docker containers and volumes are excluded. Large files, failed services, certificates, PM2 logs and broken links are review-only.
- Mutating HTTP requests require same-origin metadata, JSON, an allowlisted Host and a CSRF token.

This tool reduces operational mistakes; it cannot prove that every unused-looking artifact is safe to remove. Read the evidence before selecting any action.

## What it analyzes

| Area | Analysis | Cleanup behavior |
| --- | --- | --- |
| APT | archive cache, simulated autoremove | `apt-get clean` or confirmed autoremove |
| systemd | failed units | review only |
| Journal | usage beyond a 100 MB target | `journalctl --vacuum-size=100M` |
| Docker | unused images and build cache | containers and volumes excluded |
| Snap | disabled revisions | removes exact disabled revisions |
| Logs | rotated logs older than seven days | quarantine |
| Nginx | files in `sites-available` without enabled links | high-risk quarantine |
| Certbot | renewal lineages not referenced by Nginx | review only |
| PM2 | log footprint above 50 MB | review only |
| Filesystem | broken config links and files larger than 500 MB | review only |

Deep scans can take several minutes on large servers. Scans are read-only.

## Requirements

- Ubuntu 22.04 or 24.04
- Node.js 22 or newer
- npm
- systemd for the packaged installation

Docker, Snap, Nginx, Certbot and PM2 are optional; their analyzers simply return no finding when absent.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
UDC_DEMO_MODE=1 UDC_STATE_DIR=/tmp/ubuntu-deep-cleaner-demo npm start
```

Open `http://127.0.0.1:8787`. Demo mode simulates scans and cleanup and never invokes the privileged agent.

## Install on Ubuntu

Build from a trusted checkout or unpack a release artifact, verify its adjacent SHA-256 file, then run:

```bash
npm ci
npm run build
sudo ./scripts/install.sh
```

The installer creates:

- `/opt/ubuntu-deep-cleaner/releases/<version>` and a `current` symlink;
- the locked service account `ubuntu-deep-cleaner`;
- `/var/lib/ubuntu-deep-cleaner` for SQLite audit data and quarantine;
- two services and a daily quarantine expiry timer.

Check health:

```bash
systemctl status ubuntu-deep-cleaner ubuntu-deep-cleaner-agent
curl http://127.0.0.1:8787/api/v1/bootstrap
```

From another machine, use an SSH tunnel rather than exposing the port:

```bash
ssh -L 8787:127.0.0.1:8787 user@server
```

Then browse to `http://127.0.0.1:8787` locally.

## Quarantine and rollback

Quarantined files retain their original absolute path in the local audit database. Restore an entry from the Quarantine page before its seven-day expiry. The daily timer permanently deletes only expired quarantine payloads.

To uninstall services while retaining releases and audit data:

```bash
sudo ./scripts/uninstall.sh
```

After manual review, remove all application data too:

```bash
sudo ./scripts/uninstall.sh --purge
```

## Release process

Release Please maintains versions and changelog entries from Conventional Commits. The initial public release is `v0.1.0`; later releases increment semantically as `x.x.x`. The release workflow builds a tarball and SHA-256 checksum and attaches both to the GitHub release.

## License

Apache-2.0. See [LICENSE](LICENSE).

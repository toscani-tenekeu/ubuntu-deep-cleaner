<div align="center">

# Ubuntu Deep Cleaner

**A local web console for analyzing and safely cleaning Ubuntu servers.**

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=nodedotjs&logoColor=white)
![Lit](https://img.shields.io/badge/Lit-3-324FFF?logo=lit&logoColor=white)
![Carbon](https://img.shields.io/badge/Carbon-Web%20Components-161616)
![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)
![Ubuntu](https://img.shields.io/badge/Ubuntu-22.04%20%7C%2024.04-E95420?logo=ubuntu&logoColor=white)
![CI](https://github.com/toscani-tenekeu/ubuntu-deep-cleaner/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/License-Apache--2.0-blue)

</div>

### What is Ubuntu Deep Cleaner?

> Ubuntu Deep Cleaner scans packages, logs, containers, services and server configuration to identify reclaimable disk space.
>
> Nothing is selected automatically. Cleanup requires an explicit selection and confirmation. Sensitive files are quarantined for seven days when supported.

### Requirements

- Ubuntu 22.04 or 24.04
- Node.js 22 or newer
- npm and Git
- root access for installation

### Install

```bash
git clone --depth 1 https://github.com/toscani-tenekeu/ubuntu-deep-cleaner.git
cd ubuntu-deep-cleaner
npm ci
npm run build
sudo ./scripts/install.sh
```

The installer creates two services:

- `ubuntu-deep-cleaner.service`: non-root local web console;
- `ubuntu-deep-cleaner-agent.service`: privileged cleanup agent over a Unix socket.

The application listens only on `127.0.0.1:8787`.

### Connect from your computer

```bash
ssh -N -o ExitOnForwardFailure=yes -L 8787:127.0.0.1:8787 root@SERVER_IP
```

Keep the SSH command running, then open:

```text
http://127.0.0.1:8787
```

## Useful commands

```bash
sudo systemctl status ubuntu-deep-cleaner.service ubuntu-deep-cleaner-agent.service --no-pager
sudo systemctl restart ubuntu-deep-cleaner-agent.service ubuntu-deep-cleaner.service
sudo journalctl -u ubuntu-deep-cleaner.service -u ubuntu-deep-cleaner-agent.service -f
sudo systemctl list-timers ubuntu-deep-cleaner-quarantine.timer
```

Uninstall services while preserving quarantine and audit data:

```bash
sudo ./scripts/uninstall.sh
```

Permanently remove the application and its data:

```bash
sudo ./scripts/uninstall.sh --purge
```

> [!WARNING]
> Ubuntu Deep Cleaner can remove packages, logs, Docker images and server configuration selected by the administrator.
>
> Keep the application bound to localhost, review every finding and maintain backups of important server data.

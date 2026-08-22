# Contributing

> [!NOTE]
> Keep changes small, secure and focused on safe Ubuntu analysis and cleanup.

## Development

```bash
git clone https://github.com/toscani-tenekeu/ubuntu-deep-cleaner.git
cd ubuntu-deep-cleaner
npm ci
npm run build
UDC_DEMO_MODE=1 UDC_STATE_DIR=/tmp/ubuntu-deep-cleaner-demo npm start
```

Open `http://127.0.0.1:8787`. Demo mode never executes privileged cleanup commands.

## Before a pull request

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add a read-only analyzer
fix: validate a cleanup action
docs: clarify installation
```

> [!WARNING]
> Never accept arbitrary commands or paths from the browser, preselect cleanup findings, weaken localhost restrictions, or commit secrets and production data.
>
> Report vulnerabilities privately through [SECURITY.md](./SECURITY.md).

# Contributing

Use Node.js 22 or newer and Conventional Commits (`feat:`, `fix:`, `docs:`, and similar).

Before opening a pull request, run:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

New cleanup actions must be a closed enum in the shared contract, implemented in the privileged agent, rediscovered server-side at execution time, and covered by tests. Never accept a shell command or arbitrary cleanup path from an HTTP request. Do not preselect findings.

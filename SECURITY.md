# Security

> [!WARNING]
> Ubuntu Deep Cleaner includes a privileged agent. Access to the web console should be treated as server-level access.

## Supported version

Only the latest stable release is supported. Install security updates promptly.

## Safe deployment

- Keep the console bound to `127.0.0.1`.
- Connect through an SSH tunnel.
- Do not publish port `8787` directly on the Internet.
- Review cleanup plans and keep backups of important data.
- Verify release checksums before installation.

## Report a vulnerability

Use GitHub's private vulnerability reporting or email:

```text
support@kmerhosting.com
```

Include the application version, Ubuntu version, impact and minimal reproduction steps. Do not open a public issue or send passwords, private keys, customer files or production databases.

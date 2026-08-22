# Security policy

## Supported versions

Security fixes are applied to the latest published release.

## Reporting

Do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting for this repository. Include the affected version, reproduction steps, impact and any suggested mitigation.

## Deployment constraints

Keep the console bound to localhost and access it through SSH forwarding. Do not add a public reverse proxy without authentication, TLS, strict network controls and a separate security review. Install only release artifacts whose SHA-256 checksum you verified.

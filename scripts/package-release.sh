#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
VERSION=$(node -p "require('${ROOT}/package.json').version")
ARTIFACT_DIR="${ROOT}/artifacts"
STAGE="${ARTIFACT_DIR}/ubuntu-deep-cleaner-${VERSION}"

find "${ARTIFACT_DIR}" -mindepth 1 -maxdepth 1 -depth -delete 2>/dev/null || true
install -d "${STAGE}"
cp -a "${ROOT}/dist" "${ROOT}/systemd" "${ROOT}/scripts" "${STAGE}/"
install -m 0644 "${ROOT}/package.json" "${ROOT}/README.md" "${ROOT}/LICENSE" "${ROOT}/CHANGELOG.md" "${STAGE}/"
tar -C "${ARTIFACT_DIR}" -czf "${ARTIFACT_DIR}/ubuntu-deep-cleaner-v${VERSION}.tar.gz" "ubuntu-deep-cleaner-${VERSION}"
sha256sum "${ARTIFACT_DIR}/ubuntu-deep-cleaner-v${VERSION}.tar.gz" > "${ARTIFACT_DIR}/ubuntu-deep-cleaner-v${VERSION}.tar.gz.sha256"

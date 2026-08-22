#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "This installer must run as root." >&2
  exit 1
fi

SOURCE_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
VERSION=$(node -p "require('${SOURCE_ROOT}/package.json').version")
RELEASE_ROOT="/opt/ubuntu-deep-cleaner/releases/${VERSION}"

if [[ ! -f "${SOURCE_ROOT}/dist/server/index.js" || ! -f "${SOURCE_ROOT}/dist/agent/index.js" || ! -f "${SOURCE_ROOT}/dist/web/index.html" ]]; then
  echo "Build artifacts are missing. Run npm ci && npm run build first." >&2
  exit 1
fi

getent group ubuntu-deep-cleaner >/dev/null || groupadd --system ubuntu-deep-cleaner
id ubuntu-deep-cleaner >/dev/null 2>&1 || useradd --system --gid ubuntu-deep-cleaner --home-dir /var/lib/ubuntu-deep-cleaner --shell /usr/sbin/nologin ubuntu-deep-cleaner

install -d -o root -g root -m 0755 /opt/ubuntu-deep-cleaner/releases
install -d -o root -g root -m 0755 "${RELEASE_ROOT}"
cp -a "${SOURCE_ROOT}/dist" "${RELEASE_ROOT}/"
install -o root -g root -m 0644 "${SOURCE_ROOT}/package.json" "${RELEASE_ROOT}/package.json"
install -d -o ubuntu-deep-cleaner -g ubuntu-deep-cleaner -m 0770 /var/lib/ubuntu-deep-cleaner
install -d -o root -g ubuntu-deep-cleaner -m 0750 /etc/ubuntu-deep-cleaner
ln -sfn "${RELEASE_ROOT}" /opt/ubuntu-deep-cleaner/current

for unit in ubuntu-deep-cleaner-agent.service ubuntu-deep-cleaner.service ubuntu-deep-cleaner-quarantine.service ubuntu-deep-cleaner-quarantine.timer; do
  install -o root -g root -m 0644 "${SOURCE_ROOT}/systemd/${unit}" "/etc/systemd/system/${unit}"
done

systemctl daemon-reload
systemctl enable --now ubuntu-deep-cleaner-agent.service ubuntu-deep-cleaner.service ubuntu-deep-cleaner-quarantine.timer
systemctl --no-pager --full status ubuntu-deep-cleaner-agent.service ubuntu-deep-cleaner.service | sed -n '1,30p'
echo "Installed Ubuntu Deep Cleaner ${VERSION} on http://127.0.0.1:8787"

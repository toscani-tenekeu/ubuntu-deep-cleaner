#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "This uninstaller must run as root." >&2
  exit 1
fi

systemctl disable --now ubuntu-deep-cleaner.service ubuntu-deep-cleaner-agent.service ubuntu-deep-cleaner-quarantine.timer 2>/dev/null || true
for unit in ubuntu-deep-cleaner-agent.service ubuntu-deep-cleaner.service ubuntu-deep-cleaner-quarantine.service ubuntu-deep-cleaner-quarantine.timer; do
  [[ -e "/etc/systemd/system/${unit}" ]] && unlink "/etc/systemd/system/${unit}"
done
systemctl daemon-reload

echo "Services and unit files removed. Application releases and quarantine data were preserved."
if [[ ${1:-} == "--purge" ]]; then
  find /opt/ubuntu-deep-cleaner -depth -delete 2>/dev/null || true
  find /var/lib/ubuntu-deep-cleaner -depth -delete 2>/dev/null || true
  find /etc/ubuntu-deep-cleaner -depth -delete 2>/dev/null || true
  userdel ubuntu-deep-cleaner 2>/dev/null || true
  groupdel ubuntu-deep-cleaner 2>/dev/null || true
  echo "Purged application releases, audit database, quarantine data, service account and configuration."
else
  echo "Run this script with --purge only after manually reviewing /var/lib/ubuntu-deep-cleaner."
fi

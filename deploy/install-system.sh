#!/usr/bin/env bash
# Optional native Node install. Docker users use install-debian.sh instead.
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
service_user="${SUDO_USER:-$(id -un)}"
node_bin="$(command -v node)"
test "$(id -u)" -eq 0 || { echo 'Run with sudo after installing Node 24.'; exit 1; }
test "$service_user" != root || { echo 'Run via sudo from your normal user account.'; exit 1; }
"$node_bin" -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)'
test -f "$project_dir/.env"
install -d -o "$service_user" -g "$(id -gn "$service_user")" -m700 "$project_dir/data"
case "$project_dir$node_bin" in *$'\n'*|*' '*) echo 'Use paths without spaces for the system service.';exit 1;; esac
sed -e "s|User=webcaller|User=$service_user|" -e "s|/opt/webcaller/.runtime/node/bin/node|$node_bin|g" -e "s|/opt/webcaller|$project_dir|g" "$project_dir/deploy/webcaller.service" > /etc/systemd/system/webcaller.service
systemctl daemon-reload
systemctl enable --now webcaller.service
echo 'WebCaller installed as webcaller.service. Configure HTTPS and TURN using the documentation.'

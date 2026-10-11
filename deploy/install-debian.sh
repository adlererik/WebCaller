#!/usr/bin/env bash
# Run on a fresh Debian server after reviewing docs/INSTALL.md.
set -euo pipefail
cd "$(dirname "$0")/.."
if test "${1:-}" = --check;then
 python3 -m py_compile deploy/configure.py deploy/turn-container.py scripts/phone-setup-qr.py
 test -f Dockerfile;test -f compose.yaml;test -f .env.example
 echo 'Installer files and Python syntax verified. No system change made.';exit 0
fi
test "$(id -u)" -eq 0 || { echo 'Run: sudo bash deploy/install-debian.sh';exit 1; }
. /etc/os-release
test "$ID" = debian && { test "$VERSION_ID" = 12 || test "$VERSION_ID" = 13; } || { echo 'This installer supports Debian 12/13. Use manual Docker installation on other systems.';exit 1; }
if ! command -v docker >/dev/null;then
 for conflict in docker.io docker-compose docker-doc docker-buildx podman-docker containerd runc;do
  if dpkg-query -W -f='${Status}' "$conflict" 2>/dev/null | grep -q 'install ok installed';then
   echo "Existing $conflict needs review. Follow Docker's official Debian guide; this installer will not remove it.";exit 1
  fi
 done
 apt-get update
 apt-get install -y ca-certificates curl python3 python3-venv
 install -d -m0755 /etc/apt/keyrings
 curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
 chmod a+r /etc/apt/keyrings/docker.asc
 cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $VERSION_CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
 apt-get update
 apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
 apt-get update
 apt-get install -y python3 python3-venv
fi
systemctl enable --now docker
docker compose version >/dev/null || { echo 'Install the Docker Compose plugin using the official Docker guide.';exit 1; }
python3 deploy/configure.py
mkdir -p certs .runtime
chmod 700 certs .runtime
read -r -a profile_names < .runtime/compose-profiles || true
compose_profiles=()
for profile in "${profile_names[@]}";do
 case "$profile" in https|turn) compose_profiles+=(--profile "$profile");; *) echo 'Unexpected profile configuration';exit 1;; esac
done
app_port="$(sed -n 's/^APP_PORT=//p' .env)"
app_port="${app_port:-8080}"
[[ "$app_port" =~ ^[0-9]+$ ]] || { echo 'APP_PORT must be a number';exit 1; }
((10#$app_port >= 1 && 10#$app_port <= 65535)) || { echo 'APP_PORT must be between 1 and 65535';exit 1; }
if command -v ss >/dev/null;then
 if ss -lntH | awk '{print $4}' | grep -Eq ":${app_port}$";then echo "Port $app_port is occupied. Set APP_PORT in .env to a free local port before retrying.";exit 1;fi
 for profile in "${profile_names[@]}";do
  if test "$profile" = https && ss -lntH | awk '{print $4}' | grep -Eq ':(80|443)$';then echo 'Ports 80/443 are occupied. Preserve that website and use proxy/Tunnel mode; see docs/INSTALL.md.';exit 1;fi
  if test "$profile" = turn && ss -lnutH | awk '{print $5}' | grep -Eq ':3478$';then echo 'A relay already occupies port 3478. Configure the existing relay instead.';exit 1;fi
 done
fi
docker compose build webcaller
docker compose run --rm --no-deps --user 0:0 -v "$PWD/.env:/app/.env" webcaller node scripts/setup.mjs
docker compose "${compose_profiles[@]}" up -d --build
python3 -m venv .runtime/qr-venv
.runtime/qr-venv/bin/python -m pip install --quiet --disable-pip-version-check qrcode==8.2
printf '\nWebCaller is starting. Allow HTTPS certificate issuance a minute.\n'
printf 'Check status: sudo docker compose ps\n'
printf 'Read the first-phone QR instructions in docs/INSTALL.md.\n'
printf 'To display a private QR in this terminal:\n'
printf 'sudo .runtime/qr-venv/bin/python scripts/phone-setup-qr.py --env .env --terminal\n'

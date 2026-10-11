#!/usr/bin/env bash
# Optional native-runtime recipe for short-lived IP certificates.
set -euo pipefail
cd "$(dirname "$0")/.."
public_ip="${1:?Supply the public router IPv4}"
lan_ip="${2:?Supply your server LAN IPv4}"
tls_port="${3:-5349}"
case "$tls_port" in 5349|8443) ;; *) echo 'Choose TLS port 5349 or 8443';exit 1;; esac
python3 scripts/router-turn.py --apply --server "$lan_ip" --tls-port "$tls_port"
for stage in staging production; do
  stage_args=();acme_dir=.runtime/acme
  if test "$stage" = staging;then stage_args=(--staging);acme_dir=.runtime/acme-staging;fi
  .runtime/certbot/bin/certbot certonly "${stage_args[@]}" --standalone --http-01-port 8085 --http-01-address "$lan_ip" --preferred-profile shortlived --ip-address "$public_ip" --cert-name webcaller-turn --config-dir "$acme_dir/config" --work-dir "$acme_dir/work" --logs-dir "$acme_dir/logs" --non-interactive --agree-tos --register-unsafely-without-email
done
.runtime/node/bin/node scripts/configure-local-turn.mjs "$public_ip" "$lan_ip" --enable --tls-port "$tls_port"
echo 'TLS configured. Reload your phone and coturn services to activate.'

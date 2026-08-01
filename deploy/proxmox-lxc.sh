#!/usr/bin/env bash
# Create an nginx LXC on a Proxmox VE host and serve House Status from it.
#
# Run this ON THE PROXMOX HOST as root. It is idempotent enough to re-run:
# it skips the container if the id already exists, so you can use it to
# redeploy a new build over an existing container.
#
#   ./proxmox-lxc.sh 120 house-status.tgz
#
# Build the tarball first, on your workstation, and copy it to the host:
#   npm run build
#   tar -czf house-status.tgz -C dist .
#   scp house-status.tgz deploy/proxmox-lxc.sh root@pve:/tmp/
set -euo pipefail

CTID="${1:-120}"
TARBALL="${2:-/tmp/house-status.tgz}"

# Adjust these for your host: storage names and bridge vary per install.
STORAGE="${STORAGE:-local-lvm}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
BRIDGE="${BRIDGE:-vmbr0}"
HOSTNAME="${HOSTNAME_:-house-status}"
DISK_GB="${DISK_GB:-2}"
MEMORY_MB="${MEMORY_MB:-512}"
CORES="${CORES:-1}"
# Static ip like 192.168.1.50/24 plus GATEWAY, or leave as dhcp.
IPCONFIG="${IPCONFIG:-dhcp}"
GATEWAY="${GATEWAY:-}"

[[ -f "$TARBALL" ]] || { echo "No build tarball at $TARBALL" >&2; exit 1; }

if ! pct status "$CTID" >/dev/null 2>&1; then
  echo "==> Creating container $CTID"
  pveam update
  # Newest Debian 12 template available in the appliance index.
  TEMPLATE=$(pveam available --section system | awk '{print $2}' | grep '^debian-12-standard' | sort -V | tail -1)
  [[ -n "$TEMPLATE" ]] || { echo "No debian-12-standard template found" >&2; exit 1; }
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE" || true

  NET="name=eth0,bridge=${BRIDGE},ip=${IPCONFIG}"
  [[ -n "$GATEWAY" ]] && NET="${NET},gw=${GATEWAY}"

  pct create "$CTID" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
    --hostname "$HOSTNAME" \
    --cores "$CORES" --memory "$MEMORY_MB" --swap 256 \
    --rootfs "${STORAGE}:${DISK_GB}" \
    --net0 "$NET" \
    --unprivileged 1 \
    --onboot 1 \
    --description "House Status - static PWA served by nginx"

  pct start "$CTID"
  echo "==> Waiting for network"
  for _ in $(seq 30); do
    pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 && break
    sleep 2
  done

  echo "==> Installing nginx"
  pct exec "$CTID" -- bash -c "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx >/dev/null"
else
  echo "==> Container $CTID exists, redeploying into it"
  pct status "$CTID" | grep -q running || pct start "$CTID"
fi

echo "==> Publishing build"
pct exec "$CTID" -- rm -rf /var/www/house-status
pct exec "$CTID" -- mkdir -p /var/www/house-status
pct push "$CTID" "$TARBALL" /tmp/house-status.tgz
pct exec "$CTID" -- tar -xzf /tmp/house-status.tgz -C /var/www/house-status
pct exec "$CTID" -- rm -f /tmp/house-status.tgz

if [[ -f "$(dirname "$0")/nginx-site.conf" ]]; then
  pct push "$CTID" "$(dirname "$0")/nginx-site.conf" /etc/nginx/sites-available/house-status
  pct exec "$CTID" -- ln -sf /etc/nginx/sites-available/house-status /etc/nginx/sites-enabled/house-status
  pct exec "$CTID" -- rm -f /etc/nginx/sites-enabled/default
  pct exec "$CTID" -- nginx -t
  pct exec "$CTID" -- systemctl reload nginx
fi

IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')
echo "==> House Status is live at http://${IP:-<container-ip>}/"

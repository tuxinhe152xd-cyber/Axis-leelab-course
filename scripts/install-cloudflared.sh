#!/usr/bin/env bash
# Installs cloudflared for the optional webhook tunnel. Failure must not break Codespace creation.
set -u
command -v cloudflared >/dev/null 2>&1 && exit 0
arch=$(dpkg --print-architecture 2>/dev/null || echo amd64)
tmp=$(mktemp -d)
if curl -fsSL -o "$tmp/cloudflared.deb" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$arch.deb" && sudo dpkg -i "$tmp/cloudflared.deb" >/dev/null; then
  echo "cloudflared installed: $(cloudflared --version)"
else
  echo "cloudflared install skipped (optional)"
fi
rm -rf "$tmp"
exit 0

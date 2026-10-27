#!/usr/bin/env bash
# Run ONCE on a fresh Debian 12 (bookworm) server, as root, to install everything
# SimpleFood needs: PHP 8.4 + extensions, Composer, Node.js, uv (for the Cronometer
# bridge scripts), Caddy (reverse proxy + automatic HTTPS), ufw, and fail2ban.
#
# Usage: sudo DOMAIN=pantry.example.com bash provision.sh
#
# Safe to re-run — every step checks whether it's already done first.
set -euo pipefail

: "${DOMAIN:?Set DOMAIN, e.g. DOMAIN=pantry.example.com sudo -E bash provision.sh}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this as root (sudo)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> Base packages"
apt-get update -qq
apt-get install -y -qq curl git unzip ca-certificates gnupg lsb-release sqlite3 ufw fail2ban rsync

echo "==> PHP 8.4 (via deb.sury.org — Debian 12's own repo only has PHP 8.2)"
if ! php -v 2>/dev/null | grep -q "PHP 8.4"; then
  curl -fsSL https://packages.sury.org/php/apt.gpg -o /etc/apt/trusted.gpg.d/php.gpg
  echo "deb https://packages.sury.org/php/ $(lsb_release -sc) main" > /etc/apt/sources.list.d/php.list
  apt-get update -qq
  apt-get install -y -qq php8.4-fpm php8.4-cli php8.4-sqlite3 php8.4-mbstring \
    php8.4-xml php8.4-curl php8.4-bcmath php8.4-zip php8.4-intl
fi

echo "==> php-fpm: make sure worker processes can find node/uvx on PATH"
# php-fpm pools clear almost all inherited env vars by default (clear_env), which
# breaks the Cronometer bridge scripts' `node ...` and `uvx ...` subprocess calls
# even though PATH looks fine from a plain shell. Whitelist it explicitly.
FPM_POOL=/etc/php/8.4/fpm/pool.d/www.conf
if ! grep -q '^env\[PATH\]' "$FPM_POOL"; then
  echo 'env[PATH] = /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' >> "$FPM_POOL"
fi

echo "==> Composer"
if ! command -v composer >/dev/null; then
  EXPECTED_SIG="$(curl -fsSL https://composer.github.io/installer.sig)"
  curl -fsSL https://getcomposer.org/installer -o /tmp/composer-setup.php
  ACTUAL_SIG="$(php -r "echo hash_file('sha384', '/tmp/composer-setup.php');")"
  if [ "$EXPECTED_SIG" != "$ACTUAL_SIG" ]; then
    echo "Composer installer signature mismatch — aborting." >&2
    exit 1
  fi
  php /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer --quiet
  rm /tmp/composer-setup.php
fi

echo "==> Node.js LTS (via NodeSource)"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi

echo "==> uv (for the Cronometer MCP bridge scripts) — installed to /usr/local/bin, not tied to any one user's home"
if [ ! -x /usr/local/bin/uv ]; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh
fi

echo "==> Caddy"
if ! command -v caddy >/dev/null; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o /etc/apt/trusted.gpg.d/caddy.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi

echo "==> Let Caddy reach php-fpm's socket"
usermod -aG www-data caddy

echo "==> App directory"
mkdir -p /var/www/simplefood
chown www-data:www-data /var/www/simplefood

echo "==> Caddyfile"
TEMPLATE="$(dirname "$0")/Caddyfile.template"
if [ -f "$TEMPLATE" ]; then
  sed "s/{{DOMAIN}}/$DOMAIN/g" "$TEMPLATE" > /etc/caddy/Caddyfile
else
  echo "  (deploy/Caddyfile.template not found next to this script — skipping;"
  echo "   make sure the project was synced to the server before running this.)"
fi

echo "==> Firewall: allow SSH + HTTP/HTTPS only, then enable"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> fail2ban: default sshd jail"
systemctl enable --now fail2ban

systemctl enable --now php8.4-fpm caddy
systemctl reload caddy 2>/dev/null || true
systemctl restart php8.4-fpm # picks up the env[PATH] pool config change

echo
echo "Done. Point DNS for $DOMAIN at this server's IP if you haven't already, then run"
echo "./deploy/deploy.sh from your local machine to sync and build the app."

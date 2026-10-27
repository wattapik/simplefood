#!/usr/bin/env bash
# Runs ON the server (invoked by ../deploy.sh over ssh, after code has been rsynced
# up). Builds and (re)starts everything. Safe to re-run for every update — never
# touches an existing .env or regenerates APP_KEY (that would break decryption of
# already-stored Cronometer credentials), and only seeds the database if it's empty.
set -euo pipefail

: "${REMOTE_PATH:?REMOTE_PATH must be set}"
: "${DOMAIN:?DOMAIN must be set}"

cd "$REMOTE_PATH/backend"

echo "==> composer install"
composer install --no-dev --optimize-autoloader --no-interaction --quiet

if [ ! -f .env ]; then
  echo "==> First run: creating backend/.env"
  cp .env.example .env
  sed -i "s#^APP_URL=.*#APP_URL=https://$DOMAIN#" .env
  sed -i "s#^APP_ENV=.*#APP_ENV=production#" .env
  sed -i "s#^APP_DEBUG=.*#APP_DEBUG=false#" .env
  echo
  echo "Created backend/.env on the server with placeholder login credentials."
  echo "Edit $REMOTE_PATH/backend/.env now — at minimum set APP_USER_EMAIL and"
  echo "APP_USER_PASSWORD to what you actually want to log in with — then re-run"
  echo "./deploy/deploy.sh to finish."
  exit 0
fi

if grep -q '^APP_KEY=$' .env; then
  echo "==> Generating APP_KEY (first run only — this is never regenerated after,"
  echo "    since it would break decryption of any already-stored Cronometer credentials)"
  php artisan key:generate --force --no-interaction
fi

touch database/database.sqlite

echo "==> Running migrations"
php artisan migrate --force --no-interaction

USER_COUNT="$(php artisan tinker --execute='echo \App\Models\User::count();' 2>/dev/null | tail -n1)"
if [ "$USER_COUNT" = "0" ]; then
  echo "==> No users yet — seeding the initial account from .env"
  php artisan db:seed --force --no-interaction
fi

echo "==> Caching config/routes"
php artisan config:cache
php artisan route:cache

echo "==> Fixing storage/db permissions"
chown -R www-data:www-data storage bootstrap/cache database
chmod -R ug+rwX storage bootstrap/cache database

echo "==> Building pantry-mcp bridge scripts"
cd "$REMOTE_PATH/pantry-mcp"
npm ci --quiet
npm run build

echo "==> Building the web app"
cd "$REMOTE_PATH/app"
npm ci --quiet
npx expo export --platform web

echo "==> Reloading services"
systemctl reload php8.4-fpm
systemctl reload caddy

echo "==> Done"

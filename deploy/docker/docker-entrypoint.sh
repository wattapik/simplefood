#!/bin/sh
# Runs every time the backend container starts. Idempotent: safe on every restart,
# only seeds the database if it's completely empty. Never generates or touches
# APP_KEY itself — backend/.env is bind-mounted read-only on purpose, since
# regenerating the key would break decryption of any already-stored Cronometer
# credentials. Set it once yourself before first boot (see deploy/README-docker.md).
set -e

if ! grep -q '^APP_KEY=base64:' /app/.env; then
  echo "APP_KEY is not set in backend/.env. Generate one and add it before starting:" >&2
  echo "  docker compose run --rm backend php artisan key:generate --show" >&2
  echo "then paste the result as APP_KEY=... in backend/.env and restart." >&2
  exit 1
fi

# database/ and storage/ are bind-mounted from the host, which overrides whatever
# ownership the image set at build time — chown them for www-data (php-fpm's worker
# user) on every boot, since a fresh bind mount from the host is usually owned by
# whatever user created it there, not www-data's uid inside the container.
mkdir -p /app/database
touch /app/database/database.sqlite
chown -R www-data:www-data /app/database /app/storage

php artisan migrate --force --no-interaction

USER_COUNT="$(php artisan tinker --execute='echo \App\Models\User::count();' 2>/dev/null | tail -n1)"
if [ "$USER_COUNT" = "0" ]; then
  echo "No users yet — seeding the initial account from APP_USER_EMAIL/APP_USER_PASSWORD."
  php artisan db:seed --force --no-interaction
fi

php artisan config:cache
php artisan route:cache

exec "$@"

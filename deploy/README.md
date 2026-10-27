# Deploying to a Debian server

Sets up SimpleFood on a fresh **Debian 12 (bookworm)** server, reachable over HTTPS
at your own domain, for both the web app and the React Native app.

What it installs: PHP 8.4 + extensions, Composer, Node.js, `uv` (for the Cronometer
bridge scripts the backend shells out to), Caddy (reverse proxy with automatic
Let's Encrypt HTTPS), `ufw` (firewall), and `fail2ban`.

## Before you start

- A domain (or subdomain) with an A/AAAA record already pointing at the server's IP.
  Caddy requests a real certificate on first request — that fails if DNS isn't live yet.
- SSH access to the server as a user with passwordless `sudo` (needed once, for
  `provision.sh`'s `apt`/`systemctl`/`ufw` calls).
- `rsync` and `ssh` on your local machine.

## One-time setup

1. Copy the config template and fill in your values:

   ```sh
   cp deploy/config.sh.example deploy/config.sh
   $EDITOR deploy/config.sh   # REMOTE, REMOTE_PATH, DOMAIN
   ```

2. Sync the code up (this will run, but the remote build step will fail — expected,
   the server isn't provisioned yet):

   ```sh
   ./deploy/deploy.sh
   ```

3. SSH in and provision the server (installs everything, one-time):

   ```sh
   ssh <your-server>
   sudo DOMAIN=pantry.example.com bash /var/www/simplefood/deploy/provision.sh
   ```

4. From your local machine, deploy again — this time it creates `backend/.env` and
   stops, asking you to set your login credentials:

   ```sh
   ./deploy/deploy.sh
   ```

   SSH in and edit `/var/www/simplefood/backend/.env` — at minimum set
   `APP_USER_EMAIL` and `APP_USER_PASSWORD` to what you actually want to log in
   with (this is the hardcoded value used only to seed the *first* account; you can
   change your email/password from the app's Settings screen afterward). While
   you're in there, `CRONOMETER_BRIDGE_PATH`/`CRONOMETER_UVX_PATH` shouldn't need
   touching — `provision.sh` installs `uv` to `/usr/local/bin`, which
   `CronometerService` already checks by default.

5. Deploy once more to actually build and start everything:

   ```sh
   ./deploy/deploy.sh
   ```

   `https://your-domain` should now serve the web app, with the API at
   `https://your-domain/api`.

## Every update after that

```sh
./deploy/deploy.sh
```

That's it — syncs the code, `composer install`, runs new migrations, rebuilds the
pantry-mcp bridge scripts and the web app, reloads php-fpm and Caddy. It never
touches `.env`, never regenerates `APP_KEY` (that would break decryption of any
already-stored Cronometer credentials), and only seeds the database if it's
completely empty.

## Connecting the mobile app

The deploy script only sets up the *server* side — building and installing the
actual React Native app on a phone is a separate step via Expo (`npx expo run:ios`,
or `eas build` for a real installable binary; see
https://docs.expo.dev/build/introduction/). Whichever way you build it, on first
launch enter `https://your-domain/api` as the **Server URL** on the login screen —
same as the web app, just a different origin. No extra server-side config needed:
Bearer-token auth means there's no cookie/CORS complication between a browser
origin and a native app.

## Notes

- **Single Caddy site, path-split.** `/api/*` (and `/up`, Laravel's health check)
  goes to PHP-FPM; everything else serves the Expo web export as a single-page app
  (`try_files` falling back to `index.html`, since React Navigation handles routing
  client-side once loaded). One domain, one certificate.
- **Why Sury's PHP repo:** Debian 12 ships PHP 8.2 by default; this app needs 8.3+.
- **Why an explicit `env[PATH]` in the php-fpm pool config:** php-fpm clears almost
  all inherited environment variables by default, which silently breaks the
  Cronometer bridge scripts' `node`/`uvx` subprocess calls even though the same
  code works fine under `php artisan serve` locally (a CLI context, not FPM).
  `provision.sh` adds this automatically.
- **Security posture:** this assumes the server is reachable from the public
  internet (per your setup) — hence `ufw` (SSH + 80/443 only), `fail2ban` (SSH
  brute-force protection), `APP_DEBUG=false` in production, and rate-limiting on
  `/api/login` (`throttle:6,1`, already in `routes/api.php`). There's still no
  public registration endpoint — new accounts are created by an admin (currently
  via `php artisan tinker` on the server; see "Notes" in the main README).
- **Backups:** the SQLite database lives at `backend/database/database.sqlite` on
  the server. It's excluded from `deploy.sh`'s rsync (so redeploys never overwrite
  it) — back it up yourself (e.g. a cron'd copy to somewhere off-server).

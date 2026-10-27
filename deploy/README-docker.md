# Deploying with Docker

Two containers, one domain: **Caddy** (reverse proxy + automatic HTTPS + serves the
built web app) and **backend** (PHP-FPM running Laravel, with Node.js + `uv` baked in
so it can shell out to the Cronometer bridge scripts). Tested end-to-end locally
(build, boot, login, SPA routing, restart-persistence) before writing this.

This is the recommended path for a public domain — see
`deploy/README.md` instead if you'd rather run it bare-metal on a Debian VM without
Docker.

## Before you start

- Docker + the Compose plugin on the server (`docker compose version` should work).
- An A/AAAA record for `your-domain.example` already pointing at the
  server's IP — Caddy requests a real Let's Encrypt certificate on first request,
  which fails if DNS isn't live yet.
- Ports 80 and 443 free on the host (nothing else bound to them).

## First-time setup

Run these **on the server**, from the project root (get the code there however you
like — `git clone` if you push this to a remote, or `rsync`/`scp` the directory
over; there's no build-the-code-locally step like the bare-metal deploy, everything
builds inside Docker).

1. **Compose config** — controls the domain:

   ```sh
   cp .env.docker.example .env
   # set DOMAIN= to your domain
   ```

2. **Backend `.env`** — same file the bare-metal setup uses:

   ```sh
   cp backend/.env.example backend/.env
   $EDITOR backend/.env
   ```

   Set at least:
   - `APP_URL=https://your-domain.example`
   - `APP_ENV=production`, `APP_DEBUG=false`
   - `APP_USER_EMAIL` / `APP_USER_PASSWORD` — the login for the *first* account
     (change it later from the app's Settings screen)

   Leave `APP_KEY` blank for now — the entrypoint refuses to start without one
   (deliberately: it won't generate one itself, since backend/.env is bind-mounted
   **read-only** into the container specifically so nothing at runtime can ever
   regenerate it and silently break decryption of stored Cronometer credentials).

3. **Build the backend image, then generate the key using it** (needs the built
   image so `artisan` actually runs; this doesn't start the app, just prints a key):

   ```sh
   docker compose build backend
   docker compose run --rm backend php artisan key:generate --show
   ```

   Paste the output into `backend/.env` as `APP_KEY=base64:...`.

4. **Bring everything up:**

   ```sh
   docker compose up -d --build
   ```

   First boot runs migrations and seeds the one account from `backend/.env`. Watch
   it happen with `docker compose logs -f backend`.

`https://your-domain.example` should now serve the web app, with the API at
`https://your-domain.example/api`. First request for a brand new domain can
take a few seconds while Caddy finishes its ACME handshake.

## Every update after that

```sh
docker compose up -d --build
```

Rebuilds both images from the current code and restarts. The entrypoint re-runs
migrations (no-op if there's nothing new), never re-seeds once a user exists, and
never touches `APP_KEY`.

## Connecting the mobile app

Same as the bare-metal setup: building an installable native app is a separate Expo
step (`eas build`, or `expo run:ios`; see
https://docs.expo.dev/build/introduction/). Enter
`https://your-domain.example/api` as the **Server URL** on first launch.

## Notes

- **Data persistence.** `backend/database/` and `backend/storage/` are bind-mounted
  from the host (not baked into the image, not Docker-managed volumes) — so your
  SQLite database and logs live at predictable host paths, survive
  `docker compose up --build`, and are trivial to back up (`backend/database/database.sqlite`
  is the whole database). Caddy's TLS certificates live in the `caddy_data` Docker
  volume — back that up too if you don't want to re-request a cert on migration.
- **Why the backend image includes Node + `uv`:** the Laravel backend shells out to
  `pantry-mcp`'s bridge scripts locally (`Process::run(['node', ...])`) for the
  Diary tab and Pantry Stats — same architecture as bare-metal, just inside the
  container. `pantry-mcp/` is built into the image as a sibling directory (`/pantry-mcp`
  next to `/app`), matching the default `base_path('../pantry-mcp/dist/...')` config
  so nothing needs overriding.
- **Bind-mount ownership.** Every boot, the entrypoint `chown -R www-data:www-data`
  the bind-mounted `database/` and `storage/` directories — a fresh bind mount from
  the host is owned by whatever created it there, not automatically by www-data
  (php-fpm's worker user) inside the container, and that ownership isn't set until
  the container actually runs (build-time `chown` in the Dockerfile doesn't survive
  a bind mount covering the same path at runtime).
- **One Caddy site, path-split**, same as bare-metal: `/api/*` (and `/up`) proxy to
  the backend over FastCGI; everything else serves the Expo web export as a
  single-page app (`try_files` → `index.html`, React Navigation handles routing
  client-side from there).
- **No public registration.** Same posture as bare-metal — add another account via
  `docker compose exec backend php artisan tinker --execute '...'` (see the main
  README's "Account & multiple users" section for the exact command).

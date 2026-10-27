# SimpleFood

A pantry tracker, built single-user-first but with per-user data isolation
throughout, so it's ready for more accounts later without a rewrite. Three parts:

- **`backend/`** — Laravel API. Stores pantry items (name, quantity, unit, category,
  location, added-at, expiration date, opened-tracking) and Cronometer credentials,
  each scoped to the owning account (`user_id` + route-model-binding scoping — one
  account can never read, edit, or delete another's data, even by guessing an id).
  Token-auth (Sanctum).
- **`app/`** — Expo (React Native + web) app. Browse/add/edit pantry items with
  sort/filter by nutrition density, a Diary tab with today's Cronometer
  calories/macros/foods, a Pantry Stats panel, and a Settings screen to edit your
  account (name/email/password), store Cronometer credentials, and generate an MCP
  config.
- **`pantry-mcp/`** — A standalone MCP server that talks to the Laravel API. Point
  Claude Desktop or Claude Code at it (alongside `cronometer-api-mcp`) so you can chat
  things like "100g oats for dinner" and have Claude deduct it from your pantry *and*
  log it in Cronometer — using your normal Claude subscription, not the billed API.
- **`deploy/`** — deploys this to a Debian server with HTTPS, reachable from both the
  web app and a real React Native build on your phone. Two ways to run it:
  **Docker** (recommended — [`deploy/README-docker.md`](deploy/README-docker.md),
  `docker-compose.yml` at the project root) or **bare-metal**
  ([`deploy/README.md`](deploy/README.md), `deploy/provision.sh` +
  `deploy/deploy.sh`). Set your domain in
  `.env` (Docker) or `deploy/config.sh` (bare-metal).

## First-time setup

### 1. Backend

```sh
cd backend
composer install
cp .env.example .env   # already done if you're reading this from a fresh clone
# edit APP_USER_EMAIL / APP_USER_PASSWORD in .env to your own login
php artisan migrate --seed
composer run dev        # runs the server + queue + logs concurrently
```

The API listens on `http://localhost:8000/api` (adjust `APP_URL` in `.env` if you
change the port). `composer run dev` also works, or plain `php artisan serve`.

### 2. Pantry MCP server

```sh
cd pantry-mcp
npm install
npm run build
```

This produces `pantry-mcp/dist/index.js`, which is what your MCP client will launch.
It's configured entirely through env vars (`PANTRY_API_URL`, `PANTRY_API_TOKEN`) — you
don't run it standalone; your MCP client (Claude Desktop/Code) launches it on demand.

The same build also produces `dist/cronometer-bridge.js`, a one-shot script the
**backend** shells out to (via `uv`/`uvx`, same as the cronometer MCP) to power the
app's Diary tab — see "Diary tab" below. `uv` needs to be installed and on `PATH` for
whichever machine runs the Laravel backend, not just wherever you run Claude:

```sh
curl -LsSf https://astral.sh/uv/install.sh | sh   # installs to ~/.local/bin, no sudo
```

### 3. Mobile/web app

```sh
cd app
npm install
npm run web      # or `npx expo start` for iOS via Expo Go / a dev build
```

On first launch you'll be asked for a **Server URL** (defaults to
`http://localhost:8000/api`), then your email/password from the backend's `.env`.

## Connecting Claude

1. In the app, go to **Settings** and save your Cronometer username/password (and TOTP
   secret if you use 2FA).
2. Tap **Generate MCP config**. This returns a ready-to-paste `mcpServers` block for
   both `pantry` (this app) and `cronometer` (`cronometer-api-mcp`), with your
   Cronometer credentials and a freshly-issued pantry API token filled in.
3. Paste it into your MCP client's config (e.g. `claude_desktop_config.json`, or
   Claude Code's MCP settings), replacing the `pantry` server's `args` path with the
   absolute path to `pantry-mcp/dist/index.js` on that machine.
4. `cronometer-api-mcp` is run via `uvx`, so you'll need `uv` installed
   (https://github.com/rwestergren/cronometer-api-mcp for details).
5. Chat with Claude: "I had 100g of oats and a coffee for breakfast" — it can search
   Cronometer for matching foods, log them to your diary, and deduct matching amounts
   from your pantry via the tools in `pantry-mcp/src/index.ts` (`list_pantry_items`,
   `add_pantry_item`, `consume_pantry_item`, `update_pantry_item`,
   `mark_pantry_item_opened`, `remove_pantry_item`, `get_expiring_soon`). Say "I opened
   the milk" and Claude will mark it opened via the real `opened_at` field — not by
   writing a note — so the app's opened-tracking (see below) actually picks it up.

Regenerating the MCP config rotates the pantry API token, so old copies of the config
stop working once you paste a new one in.

## Chat tab (Claude API fallback)

"Connecting Claude" above uses your Claude Pro/Max **subscription** through an
external client (Claude Desktop, Claude Code) — no extra cost, but only available
while you have subscription usage left. The **Chat** tab is a fallback for when that
runs out: an in-app chat that talks to the same MCP tools, but through the billed
**Anthropic API** instead, paid per-token rather than included in a subscription.

1. Get an API key from [console.anthropic.com](https://console.anthropic.com) and save
   it in Settings → **Claude API (fallback chat)** (optionally overriding the model,
   which defaults to `claude-haiku-4-5-20251001`). The key is stored encrypted and never sent
   back to the browser.
2. Use the **Chat** tab like you would talk to Claude Desktop — "I ate 100g of oats",
   "what's expiring soon?", "add 500g of rice to the pantry". **New chat** in the
   header clears the conversation and starts fresh.

Under the hood, each message runs `pantry-mcp/dist/chat-agent-bridge.js`, a small
agentic loop (`ChatAgentService` → `Process::run`) that spawns the *same* two MCP
servers as the external-client setup — `pantry-mcp` itself and, if Cronometer
credentials are configured, `cronometer-api-mcp` — connects to them as an MCP client,
and drives Anthropic's Messages API through up to 8 rounds of tool use per turn. The
pantry server is authenticated with a short-lived `chat-agent-turn` API token, created
fresh for each message and deleted immediately after, rather than reusing the
long-lived token from "Generate MCP config". Conversation history (as raw
Anthropic-format messages, so tool calls replay correctly on the next turn) is kept
per-user in the database; the UI only ever shows the plain-text parts, hiding tool
calls and their results. Since this hits a billed API, every message costs money —
skip this tab entirely and stick to the subscription-based external client if that's
not something you want to pay for.

The system prompt restricts the model to pantry/food/nutrition/Cronometer topics —
anything else gets a brief decline instead of an answer. This is prompt-level, not a
hard technical guarantee (nothing that talks to an LLM can fully promise that), but
it's held up against direct off-topic asks and "ignore your instructions"-style
attempts in testing.

## Diary tab

Once Cronometer credentials are saved in Settings, the app's **Diary** tab shows
today's calories (consumed/target/remaining), protein/carbs/fat/fiber, and the list of
foods logged so far. Tap **Refresh** in the header to force a reload (pull-to-refresh
doesn't work on the web build — `RefreshControl` is a no-op in `react-native-web` — so
this button is the only reliable way to refetch there). It calls `GET
/api/cronometer/today` on the backend, which runs `pantry-mcp/dist/cronometer-bridge.js`
(a small MCP *client* that talks to `cronometer-api-mcp` over stdio) and caches the
result for 2 minutes; Refresh bypasses that cache. A **View Cronometer** button opens
cronometer.com for anything beyond that basic overview.

Each food row can be edited without leaving the app:

- **✕** removes that entry from today's diary (with a confirmation prompt).
- **Tapping a row** opens an inline editor for the amount (grams) — **Save** applies
  it, **Cancel** backs out. There's no direct "edit amount" call in Cronometer's API,
  so this removes the old entry and re-adds it with the same food/measure but the new
  amount (`CronometerService::updateDiaryEntry()`), which is also why the entry's
  logged time shifts to "now" after an edit.

Both call `PUT`/`DELETE /api/cronometer/diary/{entryId}`, invalidate the 2-minute
cache, and return the refreshed overview in the same response — no separate reload
needed. **Show all tracked nutrients** expands a per-category breakdown (Vitamins,
Minerals, Lipids, etc.) of every nutrient Cronometer has a target set for that day —
not just the four headline macros shown above the fold.

A green pill under the calorie bar shows Cronometer's own "N% of daily nutrition
targets reached" score. This is the only target-adherence figure the Cronometer API
actually exposes — there's no per-nutrient personalized target available to compute
individual percentages against (checked directly: the per-nutrient `confidence` value
that looked like it might be one is actually a data-quality indicator, unrelated to
how close that nutrient is to its target), so this single aggregate is what's shown
rather than a fabricated per-nutrient number.

## Pantry stats

Tap **Stats** in the Pantry tab's header for calories/protein/carbs/fat/fiber summed
across the whole pantry, and broken down per location (fridge/freezer/pantry). This is
computed from each item's `quantity` and the nutrition-per-100g of its linked Cronometer
food (`GET /api/pantry/stats`, backed by `pantry-mcp/dist/food-nutrition-bridge.js`, the
same MCP-client pattern as the Diary tab — cached for 30 days per food, since a food's
nutrition doesn't change). Items tracked in `ml`/`l` are included using an approximation — 1ml ≈ 1g (water
density), reasonable for milk/juice/broth, less so for oil or syrup — and listed under
"Estimated" on the screen so that's visible rather than silent. (Cronometer's own
per-food serving data isn't a reliable alternative here: at least one real product
returned an implausible ~100g/ml, evidently bad data in that community-contributed food
entry, not an actual density — so a uniform estimate beats trusting that blindly.)

Two kinds of pantry items are left out of the totals entirely, listed under "Not
counted" so the numbers stay honest instead of silently undercounting:

- items never linked to a Cronometer food (no `cronometer_food_id` — see "Connecting
  Claude" above for how `add_pantry_item` links this automatically when Claude adds
  something)
- items tracked in `pcs` — there's no reasonable default weight for a count unit at all

## Sorting, filtering, and highlighting in the Pantry tab

Tap **Sort/filter** in the Pantry tab's header to:

- **Sort** by calorific density or protein/carbs/fat/fiber (density = nutrition per
  100g of the linked Cronometer food, independent of how much you have — tap a chip
  again to flip ascending/descending). Sorting by anything other than Location switches
  from the location-grouped view to a flat list (with each item's location shown
  inline) so you can compare across the whole pantry.
- **Filter** by a minimum threshold per nutrient (also per-100g). Items with no linked
  Cronometer food can't be evaluated against a filter, so they're hidden while any
  filter is active — the panel says how many.

Density data comes from the same source as Pantry Stats (`GET /api/pantry/stats`'s
`items` map), fetched alongside the item list; if Cronometer isn't configured, sort/
filter-by-nutrient is just unavailable rather than erroring the whole list.

Expiry is highlighted two ways: a badge showing the date (or "expired"), and the row
background itself tinted amber (expiring within 4 days) or red (expired) — using
whichever is sooner of the item's expiration date and its opened-estimate, see next.

## Marking items as opened

On an item's edit screen, **Mark opened** records `opened_at` (now) and, if you give
one, `opened_expiration_date` — your own estimate of how long it's good for once
opened. The same thing works from chat via the pantry MCP's `mark_pantry_item_opened`
tool ("I just opened the soy milk"); its instructions explicitly tell Claude not to
invent a shelf-life estimate, only use one you actually gave it — the app doesn't guess
this either, there's no reliable per-food shelf-life data to draw on, and a wrong guess
here is a food-safety question, not a cosmetic one. You set it, and can edit or clear it
(**Save**) or fully unmark the item (**Mark as unopened**) at any time. Once set, the
pantry list — including the row highlighting and the "N days left" it shows for opened
items instead of a bare date — uses whichever is sooner: the original expiration date,
or `opened_at + your estimate` (`effective_expiration_date`, computed server-side in
`PantryItem::effectiveExpirationDate()`).

## Attention tab

The "fridge invisibility" problem: food that's physically there but easy to forget
about, since nothing prompts you to notice it. The **Attention** tab (`GET
/api/pantry/attention`, `PantryAttentionService`) surfaces two plain lists, without
scrolling or sorting/filtering the full Pantry tab:

- **Use these soon** — items whose effective expiration date (same logic as opened
  tracking above) falls within 7 days, soonest first. A wider window than the Pantry
  list's 4-day highlight, since this is meant as a proactive heads-up rather than an
  urgent warning.
- **Sitting unused** — unopened items added 21+ days ago, oldest first. This is the
  actual "invisibility" case: nothing about these is expiring soon (or they'd already
  be in the list above), they're just easy to forget you have. An item can appear in
  both lists at once.

Both thresholds (7 and 21 days) are fixed constants on `PantryAttentionService`, not
configurable per-item — consistent with the app's existing stance of not inventing
per-food shelf-life data. Tapping a row opens that item's normal edit screen. Recipe
suggestions and nutrient-gap cross-referencing (e.g. "you're short on protein today,
here's what in your pantry could help") are deliberately out of scope here — noted as
a separate, more speculative idea for later.

## Recipes tab

A cooking journal, not a static cookbook: the same dish name can have many entries
over time, since what actually goes into it drifts (someone might add 50g more
carrots to their vegetable soup next time) — each time counts as its own record
rather than an edit to one canonical version.

1. Tell Claude about something you made in the **Chat** tab — "I made vegetable soup
   with 200g carrots, 150g onion, 100g celery" — and it calls the pantry MCP's
   `record_recipe` tool with every ingredient listed, dated today by default. It may
   also link individual ingredients to a matching Cronometer food (best-effort, via
   `search_foods`) so the recipe's nutrition can be computed later — this is optional
   per ingredient, never required.
2. **Search** the Recipes tab by name to pull up what went into a dish, including
   past versions — the same thing Claude does via `list_recipes` when you ask "what
   did I put in my vegetable soup?" in chat.
3. **Use it up** at the top of the tab surfaces recipes you've made before whose
   ingredients match something currently expiring in the pantry (same idea as the
   Attention tab, applied to recipe history) — matching is word-based (e.g. "kidney
   beans" matches a pantry item named "Beans, Kidney, Red, Mature Seeds, Raw"), not
   an exact string match. Each match shows the recipe's own computed nutrition, when
   ingredients are linked, alongside today's Cronometer totals — Cronometer's API
   doesn't expose a per-nutrient target to compute a real "you're short on protein"
   gap against (see the Diary tab's nutrition score for the same constraint), so this
   shows real numbers on both sides for you to judge, rather than a fabricated
   recommendation.

4. **Edit** on a recipe (in the tab, or ask Claude to fix one via `update_recipe`) lets
   you correct an already-recorded entry in place — adjust an ingredient's weight, add
   one you forgot, or remove one — rather than creating a new dated entry. This is a
   deliberately different action from "I made it again" (point 1 above): editing fixes
   *this* occasion's record, it doesn't log a new one. Editing replaces the whole
   ingredient list at once (the UI's Save sends everything currently shown, not a
   diff), so removing the last ingredient isn't allowed — delete the recipe entry
   instead if it shouldn't exist at all.

`GET/POST /api/recipes`, `PUT/DELETE /api/recipes/{id}`, and `GET
/api/recipes/recommendations` back this; `RecipeRecommendationService` does the
matching and nutrition math.

## Account & multiple users

Settings → Account lets you change your own name/email/password (`PUT /api/profile`
— changing the password requires the current one). The one account created by
`php artisan migrate --seed` from `APP_USER_EMAIL`/`APP_USER_PASSWORD` in `.env` is
just the *first* one — every pantry item and Cronometer credential row is scoped to
a `user_id`, and `PantryItem::resolveRouteBinding()` means one account can't view,
edit, or delete another's items even by guessing an id.

There's no public registration endpoint by design — this is meant for you (and
anyone you personally add), not an open sign-up app, especially once it's reachable
on the public internet (see `deploy/`). To add another account, on the server:

```sh
php artisan tinker --execute '\App\Models\User::create(["name" => "Someone", "email" => "someone@example.com", "password" => bcrypt("a-temporary-password")]);'
```

They can change that password from Settings → Account once logged in. Each account
gets entirely separate pantry data and Cronometer credentials — and its own
`Generate MCP config` output, so each person's Claude client only ever sees their
own pantry.

## Notes

- The pantry API auto-converts g↔kg and ml↔l when deducting consumed amounts, so "100g
  oats" can be deducted from an item tracked in kg. Other unit mismatches are rejected
  rather than guessed at.
- Consuming an item down to zero deletes it from the pantry.
- Backend tests: `cd backend && php artisan test`.

# Family Lists

A small, self-hosted web app for a household to share named lists, such as groceries, trip gear or chores, from their phones. An AI assistant can manage the same lists through a token-protected JSON API.

- **Web UI**: Hebrew, right-to-left, mobile-first. You sign in with one shared 4-digit PIN or a one-tap access link.
- **JSON API**: bearer-token protected. The assistant uses it to read, create and delete lists and to add, update, mark bought, restore and delete items.
- **One source of truth**: the UI and the API go through the same data layer, so changes from either side show up in both. The UI refreshes when the app regains focus and every 30 seconds.

Built with Next.js (App Router) and Postgres. It's designed for Vercel with a free Neon Postgres database.

---

## Contents

- [Features](#features)
- [Quick start (local)](#quick-start-local)
- [Environment variables](#environment-variables)
- [Generating the secrets](#generating-the-secrets)
- [Deploying to Vercel](#deploying-to-vercel)
- [Access links](#access-links)
- [API contract](#api-contract)
- [Security notes](#security-notes)
- [Adding passkeys later](#adding-passkeys-later)
- [Development](#development)
- [License](#license)

## Features

- Create, rename, delete and switch between any number of free-text named lists. Deleting a list deletes its items.
- Each item has a name, a free-text quantity ("2", "חצי קילו", "3 חבילות"), a free-text category and optional notes.
- Open items are grouped by category. Categories are free strings, not a fixed set.
- Mark items as bought from the UI or the API. Bought items move to a **recently bought** section (last 7 days), where they can be restored to the same list with the same item id.
- Item and list status in the API is always `"open"` or `"bought"`, whatever the list is used for.

## Quick start (local)

Requirements: Node.js 20.12+ (Node 22+ recommended).

```bash
npm install
cp .env.example .env.local
# Fill in .env.local (see "Generating the secrets"). Leave DATABASE_URL empty
# to use the built-in local database (PGlite, stored in ./.data).
npm run dev
```

Open http://localhost:3000 and sign in with your PIN.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes (production) | Postgres connection string. On Vercel, adding a Neon database sets it automatically. If it's empty in local development, an embedded PGlite database in `./.data/pglite` is used. |
| `API_TOKEN` | yes | Bearer token for the JSON API. Use a long random value. |
| `PIN_HASH` | yes | scrypt hash of the 4-digit web PIN. The PIN itself is never stored. |
| `SESSION_SECRET` | yes | Signs the web session cookie. 32+ characters. Changing it signs everyone out. |
| `ACCESS_LINK_SECRET` | yes, for access links | Signs access links. 32+ characters. Changing it revokes every link and every session opened from one. |
| `APP_URL` | no | Public base URL used in generated access links, e.g. `https://your-app.vercel.app`. Defaults to the origin of the request. |

`API_TOKEN`, `SESSION_SECRET` and `ACCESS_LINK_SECRET` must all be **different** values. The PIN, the API token and access links are separate credentials: none of them can be used in place of another.

The database tables are created automatically on first use. There is no migration step.

## Generating the secrets

```bash
# PIN hash (replace 1234 with your PIN)
npm run hash-pin -- 1234
# → scrypt:16384:8:1:<salt>:<hash>   → PIN_HASH

# Long random secrets: run once per variable, use a different value for each
npm run gen-secret   # → API_TOKEN
npm run gen-secret   # → SESSION_SECRET
npm run gen-secret   # → ACCESS_LINK_SECRET
```

Keep `API_TOKEN` somewhere safe: it's what you give to your AI assistant.

## Deploying to Vercel

1. Push this repository to your own GitHub account.
2. In Vercel, click **Add New → Project** and import the repository. The framework is detected as Next.js; keep the default build settings.
3. In the project, open **Storage → Create Database → Neon** (free tier) and connect it to the project. This sets `DATABASE_URL`. Any other Postgres also works; set `DATABASE_URL` yourself.
4. Open **Settings → Environment Variables** and add `API_TOKEN`, `PIN_HASH`, `SESSION_SECRET` and `ACCESS_LINK_SECRET`, generated as described above. Optionally add `APP_URL`.
5. **Deploy** (or redeploy, so that the new variables are picked up).
6. Open the deployment URL, enter your PIN, and create your first list.

To check the API:

```bash
curl -H "Authorization: Bearer $API_TOKEN" https://your-app.vercel.app/api/lists
# → {"lists":[...]}
```

## Access links

An access link opens the web UI without typing the PIN, so it can be sent to a family member and opened with one tap:

```
https://your-app.vercel.app/?key=<token>
```

- The token is signed with `ACCESS_LINK_SECRET` and **expires 24 hours after it is generated**.
- When the link is opened, the token is exchanged for a normal session cookie. The browser is then redirected to the same page **without** the token, so it doesn't stay in the address bar, history or referrers.
- An expired, wrong or missing token simply shows the PIN screen. The PIN keeps working as usual.
- The link gives access to the **web UI only**. It never exposes the API token and doesn't work against the API.
- Failed tokens are rate-limited per client.

### Generating a link (no redeploy needed)

From anywhere, using the API token (this is how an assistant can send a fresh link):

```bash
curl -X POST -H "Authorization: Bearer $API_TOKEN" https://your-app.vercel.app/api/access-link
# 201 {"url":"https://your-app.vercel.app/?key=...","expires_at":"2026-10-10T06:00:00.000Z"}
```

Or locally, with `ACCESS_LINK_SECRET` in your environment or `.env.local`:

```bash
npm run access-link -- https://your-app.vercel.app
```

### Sharing

Send the `url` through any private channel. Anyone holding the link can open the UI until it expires, so treat it like a temporary password.

### Rotating / revoking

Set `ACCESS_LINK_SECRET` to a new value (`npm run gen-secret`) in Vercel and redeploy. Every previously generated link stops working immediately, and so does every session that was opened from a link. Generate a new link afterwards.

## API contract

All requests and responses are JSON (except `204`, which has an empty body). Every request needs `Authorization: Bearer <API_TOKEN>`. Responses are never cached (`Cache-Control: no-store`).

### Objects

**List** (always exactly these 4 fields):

```json
{"id": "…", "name": "ציוד לטיול", "created_at": "2026-10-09T06:00:00.000Z", "updated_at": "2026-10-09T06:00:00.000Z"}
```

**Item** (always exactly these 10 fields):

```json
{"id": "…", "list_id": "…", "name": "חלב", "quantity": "2", "category": "מוצרי חלב", "notes": null, "status": "open", "added_by": "instinct", "created_at": "2026-10-09T06:00:00.000Z", "updated_at": "2026-10-09T06:00:00.000Z"}
```

- `id`s are UUIDs and are never reused.
- Timestamps are ISO 8601 UTC. `updated_at` changes on every update.
- `quantity`, `category` and `notes` are free text. `notes` is a string or `null`.
- `status` is `"open"` or `"bought"`.
- Text is returned exactly as stored. The only normalisation is trimming leading and trailing whitespace.

### Endpoints

| Method & path | Body | Success |
| --- | --- | --- |
| `GET /api/lists` | – | `200 {"lists": [<list>, …]}` |
| `POST /api/lists` | `name` (required) | `201 <list>` |
| `DELETE /api/lists/:listId` | – | `204` (also deletes the list's items) |
| `GET /api/lists/:listId/items` | – | `200 {"items": [<item>, …]}`: **open** items only, flat, sorted by category then name |
| `POST /api/lists/:listId/items` | `name` (required), `quantity` (default `"1"`), `category` (default `"כללי"`), `notes` (string or null, default `null`), `added_by` (default `"instinct"`) | `201 <item>` |
| `PATCH /api/items/:id` | any non-empty subset of `name`, `quantity`, `category`, `notes`, `status` | `200 <item>` |
| `DELETE /api/items/:id` | – | `204` |
| `POST /api/access-link` | – | `201 {"url": "…", "expires_at": "…"}` (see [Access links](#access-links)) |

Behaviour details:

- Posting the same name twice creates two items. There is no dedupe.
- Mark an item bought with `PATCH /api/items/:id {"status": "bought"}`. Restore it (same id, same list) with `{"status": "open"}`.
- Clear notes with `PATCH /api/items/:id {"notes": null}`.
- Sorting uses byte order of category, then name, so it is deterministic.
- `added_by` and `list_id` cannot be changed by `PATCH`. Unknown fields are ignored, but at least one patchable field must be present.
- Length limits after trimming: list name 80, item name 120, quantity 40, category 60, notes 1000, added_by 40.

### Errors

| Status | Body | When |
| --- | --- | --- |
| `400` | `{"error":"validation","message":"<reason>"}` | Missing or empty name, wrong types, `notes` not string/null, `status` not `open`/`bought`, empty PATCH, over-length fields, malformed JSON |
| `401` | `{"error":"unauthorized"}` | Missing, malformed or wrong bearer token |
| `404` | `{"error":"not_found"}` | Unknown list or item id |
| `500` | `{"error":"server_error"}` | Unexpected errors (details are only logged server-side) |

### Example

```bash
BASE=https://your-app.vercel.app
AUTH="Authorization: Bearer $API_TOKEN"

LIST=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"קניות"}' $BASE/api/lists | jq -r .id)

ITEM=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"חלב","quantity":"2","category":"מוצרי חלב"}' $BASE/api/lists/$LIST/items | jq -r .id)

curl -s -X PATCH -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status":"bought"}' $BASE/api/items/$ITEM
```

## Security notes

- **PIN**: stored only as a scrypt hash. Failed attempts are rate-limited: 5 per client per 15 minutes, plus 30 in total per hour across all clients (the PIN space is only 10,000). Failures are tracked in the database, so the limit holds across serverless instances. Client IPs are stored only as salted hashes.
- **Sessions**: an HMAC-signed, `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production) that lasts 30 days. A session records how it was created. Changing `PIN_HASH` signs out PIN sessions, changing `ACCESS_LINK_SECRET` signs out link sessions, and changing `SESSION_SECRET` signs out everyone.
- **API token**: compared in constant time, only accepted as a bearer header, and never sent to the browser. Web sessions and access links are rejected by the API.
- Responses carry `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`.

## Adding passkeys later

Authentication is split by login method (`lib/auth/`). The session format (`lib/auth/session.ts`) already records the method used (`"pin"` or `"link"`). To add passkeys/WebAuthn:

1. Add a `"passkey"` method in `lib/auth/session.ts`, with the credential it should be bound to.
2. Add a `credentials` table to `lib/schema.ts` and registration/login routes, for example with `@simplewebauthn/server`.
3. On successful verification, call `createSessionValue("passkey")` and set the cookie, the same way `app/login/actions.ts` does.

The rest of the app only checks "is there a valid session", so it doesn't need to change.

## Development

```bash
npm run dev         # local dev server (PGlite if DATABASE_URL is empty)
npm test            # unit + API contract tests (Vitest, in-memory database)
npm run test:e2e    # browser tests at 390px (Playwright; first run: npx playwright install chromium)
npm run lint
npm run typecheck
npm run build
```

Project layout:

```
app/
  api/                    JSON API route handlers (bearer token)
  auth/link/route.ts      access-link → session exchange
  login/                  PIN screen and login/logout actions
  lists/[listId]/         main list screen (server component + client UI)
  actions.ts              Server Actions used by the UI
lib/
  repo.ts                 data access shared by the API and UI
  validation.ts           input validation and limits
  api.ts                  API auth, JSON parsing, error mapping
  db.ts, schema.ts        Postgres / PGlite connection and schema
  auth/                   PIN, sessions, access links, rate limiting
proxy.ts                  redirects signed-out visitors to the PIN screen
scripts/                  hash-pin, gen-secret, access-link
tests/                    unit (Vitest) and e2e (Playwright) tests
```

## License

[MIT](LICENSE)

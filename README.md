# Turbo Soccer Values

A public item catalogue and trade calculator with a private, allowlisted admin panel. The existing workspace is preserved; the app lives in this directory.

## Architecture

- **Frontend:** React + TypeScript + Vite, deployable to Cloudflare Pages. `/functions` contains same-origin Pages Functions for username login, OWNER account management, first-password changes, and presence.
- **Database/auth/images:** Supabase Postgres, Supabase Auth, and Supabase Storage.
- The browser contains only the Supabase URL and public anon/publishable key. Row Level Security (RLS) authorizes every write. Never add a service-role key to this app or to `VITE_*` variables.
- Values are stored as non-negative whole-number `bigint` values (or `NULL` while unknown), not floating-point values.
- The first 1,000 catalogue rows are loaded and filtered/paginated by the app. The trade calculator uses the same loaded set. Increase that bound with server-side paging if the catalogue grows beyond 1,000 rows.
- The public list refreshes on focus and every 30 seconds, so edits become visible without a redeploy.
- `Logo.png` and `Coin.png` from the supplied folder are copied to `public/brand/`. The five screenshots are cropped into 70 individual WEBP tiles under `public/catalog/crops/`; originals in Downloads are never edited. `scripts/crop_catalog.py` regenerates them and the image picker manifest. Install `requirements-images.txt` before regenerating for Pillow and cursor cleanup. No item names or coin values are inferred from the cropped pictures.
- Values are labeled in coins. Admin categories and rarity choices match the supplied filter image in English. Item detail pages use `/item/<database-id>` and are shared with a copy-link button.

## Local development

Requirements: Node.js 20 or newer and npm.

```powershell
cd turbo-soccer-values
npm install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# Fill in the existing project's public Supabase URL and publishable/anon key.
npm run dev
```

The app can be built without Supabase credentials. In that case it renders an explicit setup notice and does not substitute local mock data.

## Supabase admin system

The current app uses Supabase Auth for both account types. The existing OWNER continues to sign in with the same Supabase email and password. Regular admins have Supabase Auth users with random UUID `.invalid` email aliases, but they only enter a username in the website. The alias is private so a caller cannot target an ADMIN through the public Auth password endpoint using the public username. Passwords are handled and hashed by Supabase Auth; the app does not store password hashes. Public sign-ups should remain disabled.

### Migrations

The existing catalogue schema is `supabase/migrations/202610260001_initial_schema.sql`. Production already has the account, runtime, and security migrations. The OWNER account-removal migration, five-star demand column, and shared image-library table/catalogue entries have now also been applied to the connected production project and recorded in Supabase. **Do not paste those migrations into SQL Editor again.** Their source files are `20261027032212_admin_account_removal.sql`, `20261027032224_item_demand_stars.sql`, and `20261027032238_seed_game_item_catalogue.sql`. For a fresh project, apply the initial schema and account/security migrations in order first, then these three. Never rerun the initial schema against an existing production database.

Migration 002 verifies that the configured UUID exists in `auth.users`, refuses to replace a different OWNER, preserves existing allowlist rows, and protects the OWNER identity/role from deletion or demotion. It does not update the OWNER Auth email or password. Migration 002's temporary catalogue guard already checks the live Auth session and first-password flag; migration 003 adds the token timestamp check, hard ADMIN session revocation, and server authorization functions. Migration 004 bounds rate-limit bucket growth, adds cleanup of expired presence and rate-limit rows, and sanitizes conflicting ADMIN titles. Migration 005 prepares regular ADMIN removal, revokes their sessions, and leaves photo-owning accounts suspended until their files are moved or removed. Apply 002, 003, 004, and 005 in order before deploying the new app. The migrations do not truncate or drop catalogue rows. If an exception occurs, stop and inspect the migration state before retrying.

### Provision the ten initial admin accounts

The existing project already has its OWNER and regular admin accounts; do not run the initial-account provisioning script for this site. The OWNER can create accounts from **Admin → Admin management**. The app generates a random temporary password and shows it once; share it privately, and the new admin must change it at first sign-in. Password resets also show a one-time password. Suspension, reset, and explicit session revocation invalidate the target's Supabase sessions and application access. Audit history is retained after admin deletion.

### Cloudflare Pages settings

The Vite browser build uses the existing public variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Pages Functions use server-side bindings, which must not have a `VITE_` prefix:

| Binding | Type | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Variable | Existing Supabase project URL |
| `SUPABASE_ANON_KEY` | Variable | Existing Supabase anon/publishable key, used to validate user JWTs |
| `SUPABASE_SECRET_API_KEY` | **Encrypted secret** | New server-only `sb_secret_` key used for password sign-in with verified client-IP forwarding |
| `SUPABASE_SERVICE_ROLE_KEY` | **Encrypted secret** | Server-only account provisioning and protected RPC access |
| `TURBO_RATE_LIMIT_SALT` | **Encrypted secret** | Random salt for short-lived hashed login/presence rate-limit keys |

Keep all three secrets in Cloudflare Pages **Settings → Variables and Secrets**; never add them to Vite variables, source files, or Git. In Supabase Auth settings, disable public sign-ups, enable IP address forwarding, set the Auth token-endpoint limit to 30 requests per five minutes or stricter after testing, and require a minimum 12-character password with uppercase, lowercase, number, and symbol. IP forwarding requires a modern `sb_secret_` key; the legacy `anon` and `service_role` keys are not accepted for that purpose. These are hosted-project settings and are not changed by this repository. The local `.dev.vars.example` is only a template: copy it to `.dev.vars`, enter local values there, and keep `.dev.vars` untracked. The existing `.env` is not overwritten by this project.

### Local development and verification

`npm run dev` serves the Vite UI, but it does not emulate Cloudflare Pages Functions. After configuring `.dev.vars`, use Wrangler Pages local development (for example `npx wrangler pages dev dist`) to test the `/api/admin/*` endpoints. Use a separate Supabase test project for integration tests; do not provision test users in production just to verify the flows.

## Image handling

The admin image picker includes bundled game artwork as well as images already assigned to catalogue items. Selecting a bundled image stores its static path in `items.image_path`. New image uploads go to the public `item-images` Supabase Storage bucket and store a public URL in `image_path`. The bucket rejects files over 5 MiB and accepts WEBP, PNG, JPEG, or GIF. Storage RLS permits uploads, replacement, and deletion only for allowlisted admins; visitors can view images. The X on an uploaded thumbnail deletes the storage file; the X on bundled artwork hides it from the shared picker. Both actions clear references from items but keep the item records. The image hide control is created by migration `20261027032238_seed_game_item_catalogue.sql`.

Community demand is an optional one-to-five rating set by an admin or OWNER in the item editor. Click a star, then **Add item** or **Save changes**; clicking **Clear** removes the rating. The public item card shows the saved rating.

## Deploy on Cloudflare Pages

The app is compatible with the Pages free tier; Cloudflare account authorization is required to update the published project. `public/_redirects` sends deep item links and `/admin` to the SPA entrypoint.

1. Push this project to the Git provider connected to Cloudflare Pages and make sure the Pages **Root directory** is this project folder.
2. Use build command `npm run build` and output directory `dist`. Keep `public/_routes.json` in the output so only `/api/admin/*` invokes Functions; `_redirects` continues to serve the SPA pages.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as public build variables. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for Functions, then add `SUPABASE_SECRET_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `TURBO_RATE_LIMIT_SALT` as encrypted secrets in Pages Settings. Use the existing Supabase project. Never prefix server secrets with `VITE_`.
4. For this existing production project, the migration work is already complete. After a later code change is merged and deployed, check that production variables/secrets remain configured and sign in at `/admin`. Don't run the same migrations again in SQL Editor. These migrations add the optional one-to-five demand rating, shared image-library removal, and editable Turbo Soccer catalogue entries with no prices filled in. Use a separate test project for destructive admin tests.

The SPA uses the standard Supabase JavaScript browser session storage so the existing email/password sign-in continues to work without an SSR rewrite. Supabase manages access-token refresh; Pages Functions and RLS verify the user and session. Tokens are therefore available to same-origin browser JavaScript (they are not HttpOnly cookies), so preventing XSS remains important. Do not add third-party scripts to the admin page without review.

The Cloudflare Pages deployment remains online when the personal computer is off. Supabase Free currently has a 500 MB database, 1 GB file storage, 5 GB uncached + 5 GB cached egress, 50,000 monthly active users, two active free projects, and may pause projects after a week of inactivity. Free quotas can change; check the linked official pricing docs before deployment. A paused Supabase project will interrupt the database and auth until resumed. The goal is €0/month while within free allowances and without paid add-ons; it is not an uptime guarantee.

## Migrations, backup, and export

- Schema/security migrations: `supabase/migrations/202610260001_initial_schema.sql`, `supabase/migrations/202610260002_admin_accounts.sql`, `supabase/migrations/202610260003_admin_runtime.sql`, `supabase/migrations/202610260004_admin_security_hardening.sql`, `supabase/migrations/20261027032212_admin_account_removal.sql`, `supabase/migrations/20261027032224_item_demand_stars.sql`, and `supabase/migrations/20261027032238_seed_game_item_catalogue.sql`.
- Apply this migration to a fresh Supabase project in SQL Editor as above. For later migrations, add a new timestamped SQL file; do not edit production tables manually without recording the change here.
- Export the catalogue from the signed-in admin panel with **Export CSV**. It includes names, values, image paths, metadata, and timestamps.
- For a full recovery backup, use Supabase Dashboard database backups if available on the selected plan, or run `supabase db dump --db-url "<connection-string>" -f backup.sql` from a trusted machine. Keep the database password/connection string private and store backups securely. Restore to an empty compatible project with `psql "<connection-string>" -f backup.sql`; test restores before relying on them. Supabase Free does not include managed daily backups, so schedule/export your own backup.
- Keep the `public/catalog/` images in Git. Download the `item-images` bucket separately for a complete image backup; CSV contains storage paths, not image binaries.

## Verification

Run `npm test` for local password-policy and temporary-password checks, then `npm run build` to type-check and build the static bundle. With Supabase CLI and Docker installed, run `supabase start` then `supabase test db` to execute `supabase/tests/security.test.sql`. A fresh local database needs a synthetic Auth user with the configured OWNER UUID before migration 002; never use a production Auth identity as the test fixture. Database authorization cannot be integration-tested until the local stack starts. After setup, verify direct `/auth/v1/token` and username-login rate limits, anonymous reads, unauthorized writes, valid ADMIN catalogue writes, session revocation, and OWNER controls.

## Monthly cost

No services were activated from this workspace. The intended configuration is Cloudflare Pages Free ($0) + Supabase Free ($0); no paid domain is required. Keep within quotas and check the current provider dashboards. Cloudflare Pages limits, Supabase quotas, and inactivity behavior are documented by their providers and can change.

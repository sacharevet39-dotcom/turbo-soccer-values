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

The current app uses Supabase Auth for both account types. The existing OWNER continues to sign in with the same Supabase email and password. Regular admins have Supabase Auth users with generated `.invalid` internal email aliases, but they only enter a username in the website. Passwords are handled and hashed by Supabase Auth; the app does not store password hashes. Public sign-ups should remain disabled.

### Migrations

The existing catalogue schema is `supabase/migrations/202610260001_initial_schema.sql`. For an already working site, back up the Supabase database first, verify that the OWNER UUID embedded in `202610260002_admin_accounts.sql` matches the current Auth user, and then run migrations `202610260002_admin_accounts.sql`, `202610260003_admin_runtime.sql`, and `202610260004_admin_security_hardening.sql` in that order in the existing project's SQL Editor. Migration 004 is required: migration 003's timestamp cutoff alone does not revoke a refreshable Auth session, while 004 deletes the affected Auth session records and completes the related hardening. Do not rerun the initial migration against an existing production project unless its current schema has been reviewed.

Migration 002 verifies that the configured UUID exists in `auth.users`, refuses to replace a different OWNER, preserves existing allowlist rows, and protects the OWNER identity/role from deletion or demotion. It does not update the Auth email or password. Migration 003 adds runtime authorization, password-change enforcement, account management RPCs, presence, password/item audit triggers, and session checks. Migration 004 adds hard session revocation, title sanitization, and cleanup of only expired presence and rate-limit rows. The migrations are additive; they do not truncate or drop the catalogue. If an exception occurs, stop and inspect the migration state before retrying.

### Provision the ten initial admin accounts

After all three migrations are applied and verified, run `scripts/provision-admins.ps1` from this project directory in PowerShell. It prompts for the existing Supabase URL, the server-only Supabase key, and the ten temporary passwords without echoing them. Enter the initial credentials from the supplied admin list when prompted. The script creates only missing accounts, leaves an existing mapped account and password untouched, and marks newly linked accounts for a required first-login password change. Its output never includes passwords. The key and password values remain process-only and are removed after the script exits.

The OWNER can also create accounts from **Admin → Admin management**. The app generates a random temporary password and shows it once; the new admin must change it before item-management requests are authorized. OWNER password resets have the same one-time display behavior. Suspension, reset, and explicit session revocation invalidate the target's Supabase sessions and application access. Audit history is retained after admin deletion.

### Cloudflare Pages settings

The Vite browser build uses the existing public variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Pages Functions use server-side bindings, which must not have a `VITE_` prefix:

| Binding | Type | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Variable | Existing Supabase project URL |
| `SUPABASE_ANON_KEY` | Variable | Existing Supabase anon/publishable key, used for Auth endpoints |
| `SUPABASE_SERVICE_ROLE_KEY` | **Encrypted secret** | Server-only account provisioning and protected RPC access |
| `TURBO_RATE_LIMIT_SALT` | **Encrypted secret** | Random salt for short-lived hashed login/presence rate-limit keys |

Set the service key and rate-limit salt under Cloudflare Pages **Settings → Variables and Secrets**, for both Production and Preview as appropriate. Never add these secrets to the Vite variables, source files, or Git. The local `.dev.vars.example` is only a template: copy it to `.dev.vars`, enter local values there, and keep `.dev.vars` untracked. The existing `.env` is not overwritten by this project.

### Local development and verification

`npm run dev` serves the Vite UI, but it does not emulate Cloudflare Pages Functions. After configuring `.dev.vars`, use Wrangler Pages local development (for example `npx wrangler pages dev dist`) to test the `/api/admin/*` endpoints. Use a separate Supabase test project for integration tests; do not provision test users in production just to verify the flows.

## Image handling

The admin image picker includes the 70 cropped source tiles as well as images already assigned to catalogue items. Selecting a crop stores its static path in `items.image_path`. New image uploads go to the public `item-images` Supabase Storage bucket and store a public URL in `image_path`. The bucket rejects files over 5 MiB and accepts WEBP, PNG, JPEG, or GIF. Storage RLS permits uploads, replacement, and deletion only for allowlisted admins; visitors can view images. Item deletion does not automatically delete a cloud image, which avoids deleting a file still referenced by another record.

## Deploy on Cloudflare Pages

The app is compatible with the Pages free tier; Cloudflare account authorization is required to update the published project. `public/_redirects` sends deep item links and `/admin` to the SPA entrypoint.

1. Push this project to the Git provider connected to Cloudflare Pages and make sure the Pages **Root directory** is this project folder.
2. Use build command `npm run build` and output directory `dist`. Keep `public/_routes.json` in the output so only `/api/admin/*` invokes Functions; `_redirects` continues to serve the SPA pages.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as public build variables. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for Functions, then add `SUPABASE_SERVICE_ROLE_KEY` and `TURBO_RATE_LIMIT_SALT` as encrypted secrets in Pages Settings. Use the existing Supabase project. Never prefix server secrets with `VITE_`.
4. Apply/verify migrations 002, 003, and 004 in order, provision accounts, and then deploy. Verify OWNER email login, admin username login, forced password change, regular-admin item writes, OWNER account controls, session revocation, audit visibility, and online presence with test accounts. Use a test database for destructive admin tests.

The SPA uses the standard Supabase JavaScript browser session storage so the existing email/password sign-in continues to work without an SSR rewrite. Supabase manages access-token refresh; Pages Functions and RLS verify the user and session. Tokens are therefore available to same-origin browser JavaScript (they are not HttpOnly cookies), so preventing XSS remains important. Do not add third-party scripts to the admin page without review.

The Cloudflare Pages deployment remains online when the personal computer is off. Supabase Free currently has a 500 MB database, 1 GB file storage, 5 GB uncached + 5 GB cached egress, 50,000 monthly active users, two active free projects, and may pause projects after a week of inactivity. Free quotas can change; check the linked official pricing docs before deployment. A paused Supabase project will interrupt the database and auth until resumed. The goal is €0/month while within free allowances and without paid add-ons; it is not an uptime guarantee.

## Migrations, backup, and export

- Schema/security migrations: `supabase/migrations/202610260001_initial_schema.sql`, `supabase/migrations/202610260002_admin_accounts.sql`, `supabase/migrations/202610260003_admin_runtime.sql`, and `supabase/migrations/202610260004_admin_security_hardening.sql`.
- Apply this migration to a fresh Supabase project in SQL Editor as above. For later migrations, add a new timestamped SQL file; do not edit production tables manually without recording the change here.
- Export the catalogue from the signed-in admin panel with **Export CSV**. It includes names, values, image paths, metadata, and timestamps.
- For a full recovery backup, use Supabase Dashboard database backups if available on the selected plan, or run `supabase db dump --db-url "<connection-string>" -f backup.sql` from a trusted machine. Keep the database password/connection string private and store backups securely. Restore to an empty compatible project with `psql "<connection-string>" -f backup.sql`; test restores before relying on them. Supabase Free does not include managed daily backups, so schedule/export your own backup.
- Keep the `public/catalog/` images in Git. Download the `item-images` bucket separately for a complete image backup; CSV contains storage paths, not image binaries.

## Verification

Run `npm run build` to type-check and build the production static bundle. With Supabase CLI and Docker installed, run `supabase start` then `supabase test db` to execute `supabase/tests/security.test.sql`. Database authorization cannot be integration-tested until a Supabase project exists. After setup, verify anonymous reads work, anonymous inserts fail, a signed-in non-allowlisted user cannot write, and the allowlisted user can create/edit/delete and upload images. RLS policies in the migration apply to Postgres and Storage APIs, not just UI controls.

## Monthly cost

No services were activated from this workspace. The intended configuration is Cloudflare Pages Free ($0) + Supabase Free ($0); no paid domain is required. Keep within quotas and check the current provider dashboards. Cloudflare Pages limits, Supabase quotas, and inactivity behavior are documented by their providers and can change.

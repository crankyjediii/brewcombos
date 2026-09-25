# Accounts and moderated community

The code supports email sign-in, saved drinks across devices, and a community review queue. It does not create a Supabase project or send email until credentials are configured. Without them, the account dialog explains that sign-in is unavailable and device saves continue to work.

Provisioning status, September 25, 2026: project [`brewcombos`](https://supabase.com/dashboard/project/ixxraxtnalldhgrnvapa) (`ixxraxtnalldhgrnvapa`) is active in AI Workspace, US East (Ohio). The owner approved Supabase's $0/month quote. The `community` migration has been applied, and `.env.local` contains the project URL and public publishable key. No existing project was changed. Auth redirects, production SMTP, the review administrator, and production Vercel environment values still need configuration.

## Connect the service

1. Create or choose a Supabase project. Apply `supabase/migrations/202609250001_community.sql` in its SQL editor, or through your existing Supabase migration workflow. This creates `saved_drinks`, `community_drinks`, `community_admins`, and a separate `brew_private` helper schema.
2. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the Vercel environment and your local development environment. Use the project URL and its public publishable key (or legacy `anon` key). Both values are intentionally returned to the browser. Do not put a service-role or secret key in this variable; the server rejects those key types. The application does not need a service-role key.
3. In Supabase Authentication settings, enable email sign-in and email confirmation. Keep anonymous sign-ins disabled. Configure the Site URL as `https://brewcombos.com` and allow `https://brewcombos.com/#account` as a redirect. Add the exact local or preview origin with `/#account` when testing there. Keep the default confirmation-link behavior in the Magic Link and Confirm Signup email templates. See [Supabase redirect settings](https://supabase.com/docs/guides/auth/redirect-urls).
4. Configure a production SMTP sender. Supabase's default sender only delivers to project team members, so a successful test with the owner's email does not prove public sign-in works. See [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).
5. Redeploy after setting the environment. Open the account dialog, request a link, and open it in the same browser. The PKCE verifier is saved in that browser; links opened in a different browser show an explanation and require a fresh request. This follows [Supabase's PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

The `brew_private` schema should stay out of the exposed Data API schemas. Keep the default exposed `public` schema. Supabase Auth applies its own email request limits. The custom browser client currently has no CAPTCHA UI; enabling CAPTCHA in Auth requires adding that widget and passing its token to the sign-in request.

## Give the owner review access

Sign in once using the email that will review submissions. In Supabase Authentication → Users, copy that account's user UUID. In the dashboard Table Editor, add a row to `public.community_admins` with that UUID in `user_id`. Its timestamp has a default. Reload the website; the account now has review access.

Only privileged database administration can change this table. Website users cannot assign themselves a role through account metadata or API payloads. Delete the membership row in the dashboard to revoke review access.

Each submission starts pending. The author can see its status; public visitors only see approved drinks. The review queue lets an administrator approve or reject a pending drink. Published submissions cannot be edited by their authors. Reviews store the administrator's UUID and review time. Saved drinks and submissions are deleted when their owning Auth account is deleted.

## Data and API behavior

The browser module is `assets/account.js`. `initAccount()` is safe to call repeatedly. `getAccount()` returns `{ configured, loading, user, isAdmin, error }`; `onAccount(fn)` subscribes to later state changes and returns an unsubscribe function. `openAccount()` opens the email dialog, and elements with `data-account` open it automatically.

The module exports these service functions:

| Function | Result |
| --- | --- |
| `listSaved()` | Up to 500 saved records, newest change first |
| `saveDrink({name, combo, status, rating})` | The stored record; status is `saved` or `tried`, rating is null or 1–5 |
| `deleteSaved(id)` | Removes that user's record |
| `listCommunity()` | Latest 100 approved submissions |
| `listCommunity({mine: true})` | The user's latest 100 submissions, including pending and rejected |
| `listCommunity({moderation: true})` | Latest 100 pending submissions, administrator only |
| `submitDrink({name, description, author_name, combo})` | New pending submission |
| `moderateDrink(id, 'approved' or 'rejected')` | Reviewed submission |
| `sendSignInLink(email)` / `signOut()` | Sends an email link / ends the current session |

Records use `id`, `name`, and the shared menu's normalized `combo`. Saved IDs are canonical combo query strings with sorted flavors and extras, so renaming a drink or choosing flavors in a different order does not create another copy. Saves also include `status`, `rating`, `created_at`, and `updated_at`. Submissions include `description`, `author_name`, `status`, `created_at`, and `reviewed_at`. Public responses omit owner and reviewer IDs.

The server uses `/api/community?action=...`; reads use GET, saves/submissions/reviews use POST, and removal uses DELETE. JSON bodies are limited to 8 KB. Bearer tokens are validated by Supabase Auth before private operations. Database row policies enforce ownership and approval rules even when somebody calls Supabase directly. Database checks also reject invalid drinks and enforce five submissions per user per hour and 500 saved drinks per account. Process-local request limits are an additional speed bump, not a distributed rate limiter.

The browser stores access and refresh tokens under `bc_account_session_v1`, refreshes expired sessions, and clears them on sign-out. Tokens are never included in drink links or logged. This client-side session model depends on continuing to escape user text and keeping third-party scripts limited. Account events tell the library when to load or clear its synced data; local-to-account merging belongs to the library module.

## Validation before launch

Run `node --test test/community.test.js` for mocked endpoint and browser-auth coverage. These tests exercise verified ownership, public-only queries, server validation, approval permission checks, conflicting reviews, PKCE email callbacks, session refresh, and sign-out. That focused test file does not execute the SQL migration or send real email. The full `npm test` suite also executes the migration locally, as described below.

With a configured test project, verify the full path using two ordinary accounts, an administrator, and a signed-out browser:

- Save and rate a drink in one browser, then sign in to the same account in another browser and confirm it appears. The other ordinary account must not see or alter it.
- Submit a drink. Its owner should see pending status; another account and the signed-out browser should not see it in the public list.
- Approve it as the administrator, refresh the public list, and confirm the order is visible. Reject another submission and confirm it stays private to its owner and administrators.
- Attempt a direct Supabase write from an ordinary user's session that sets `status` to `approved`, changes another user's saved drink, edits a published submission, or inserts an admin membership. Each attempt must be denied by grants or row policies.
- Confirm the sixth submission within an hour is rejected by the database, and check email delivery with an address outside the Supabase project team.

The migration has been applied to the hosted project. Live anonymous REST checks confirmed that the approved public feed is readable while saved drinks, admin membership, and submission owner IDs are protected. No email was sent, no Auth user was created, and production sign-in has not been tested.

## Local verification

The full SQL migration is executed by `test/database.test.js` using PGlite, a local PostgreSQL engine, with the Supabase auth primitives stubbed. It verifies ownership, cross-account isolation, approval controls, public field restrictions, immutability after review, and the hourly submission limit. This does not verify hosted Auth, SMTP delivery, redirects, or PostgREST deployment.

Approved recipes have server-rendered pages at `/community/<id>`, a public index at `/community`, and `/community-sitemap.xml`. Pending and rejected recipes are never selected by these routes. The public feed currently returns the latest 100 approved recipes. Add pagination before exceeding that volume.

Device saves are stored separately for each signed-in account. Guest saves migrate once at sign-in. Signing out switches to the guest library, while account-specific data remains isolated on the device. Pending local edits and deletion records are retried at the next sign-in/page load. Use the same browser for requesting and opening an email sign-in link.

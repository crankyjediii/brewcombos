# Overhaul verification

Checked locally on September 25, 2026. Production has not been changed.

`npm test`: 96 passing tests, 0 failures. `git diff --check` is clean. The generator produces the 66 drink pages, six collection pages, catalog index and sitemap; tests confirm the generated files, internal links and recipe order sentences match the source.

The final brand pass adds an SVG favicon, a 16/32/48px ICO fallback, home-screen icons, a manifest, and a matching 1200×630 social preview. Icon dimensions and ICO entries were checked; all icon and manifest URLs return HTTP 200 with the correct content type in the local preview. `npm run brand` reproduces these assets. The home page and shared page shell reference the new icons, and all generated pages were rebuilt.

The suite covers the existing AI parser/fallbacks and shared image endpoints, plus combined catalog filters, account callbacks and refresh, recipe validation, user ownership, moderation, public community pages, account-specific local storage and cloud deletion reconciliation. The real SQL migration runs in PGlite with Supabase auth primitives supplied by the test. Anonymous users cannot read pending recipes; ordinary accounts cannot publish recipes, read another account's saves, or make themselves administrators.

Browser checks on the local app:

- Search by flavor; combine coffee, iced, vanilla and excluded caramel filters; recover from no results.
- Search the generated recipe index and open a matching detail page.
- Save and unsave a recipe, rate it, and confirm the rating and tried status survive a reload.
- Build an order with a custom Honey flavor, sugar-free syrup requests and half sweetness; preserve that exact order across reload and in order mode.
- Copy an order successfully and open the existing share dialog from a recipe page.
- Carry the builder recipe into the community submission form.
- Run without OpenRouter settings and receive clearly labeled catalog suggestions instead of an empty result.
- Verify the mixer and builder fit a 320px viewport, the recipe and builder flows fit a 390px viewport, the builder fits 768px, and discovery fits 1280px without horizontal page overflow. Light and dark appearances were inspected.

The browser console showed no captured application errors during the checked recipe and builder flows. The hosted Supabase project is now active, its community migration is applied, and all three public tables have row-level security enabled. Live anonymous REST checks returned an empty approved feed and denied access to saved drinks, admin membership, and submission owner IDs. The local environment now uses the project's public publishable key. Supabase's security advisor reported no findings.

Email redirects, SMTP delivery, owner review access, cloud synchronization across physical devices, and live moderation remain launch checks. No Auth users were created and no sign-in email was sent during provisioning. Production Vercel settings and deployment are unchanged.

The performance advisor flagged an [unindexed reviewer foreign key](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) and [multiple permissive read policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies). The read policies intentionally permit approved recipes, a user's own submissions, or administrator review access. It also reported [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), which are expected in this new, empty database. These are performance follow-ups, not security findings.

The public community feed and sitemap currently cover the latest 100 approved recipes; pagination should be added before the collection grows beyond that. Existing analytics are retained, but this work did not measure search traffic, retention, or conversion changes.

# Brew Combos

Live at https://brewcombos.com

Turn a vibe into a 7 Brew drink, or pick flavors and get the exact words to order it.

```
index.html        discovery, mixer, builder, saved drinks, community screens
assets/home.js    discovery filters, route views, recipe cards and community UI
assets/builder.js custom builder, draft persistence, AI mixing and catalog fallback
assets/library.js device/account-scoped saved drinks, ratings and sync
assets/account.js PKCE email sign-in and authenticated community API client
assets/overhaul.css  new shared responsive design
api/community.js   account-backed saves, submissions and moderation
api/community-page.js  public approved recipes and community sitemap
assets/site.css   styles for every page
lib/menu.js       drinks, flavors, extras, order wording, AI prompt (shared by page + API)
lib/cup.js        the cup drawing, shared by the app and the drink pages
lib/drinks.js     named combos that get their own page
lib/daily.js      drink of the day (holidays, season, day of the week)
assets/share.js   share panel (platform links, story image via the phone's share menu)
assets/settings.js  settings panel (theme, motion, usual size/milk/sugar-free), saved in localStorage
scripts/build-pages.js   generates drinks/*, the collection pages and sitemap.xml
api/mix.js        serverless function that calls OpenRouter with your key
api/share.js      /s?drink=...  page for a shared drink
api/card.js       /card.png?drink=...  preview image for a shared drink; &format=story for a 1080x1920 story image
test/             unit tests (no network needed)
```

## Settings

The server reads these environment variables. In production they live in **Vercel > brewcombos > Settings > Environment Variables**; locally they go in `.env.local` (git ignores it).

| Variable | Required | What it does |
|---|---|---|
| `OPENROUTER_API_KEY` | yes | Your OpenRouter key |
| `OPENROUTER_MODEL` | yes | Model id to try first, e.g. `nvidia/nemotron-3-super-120b-a12b` |
| `OPENROUTER_FALLBACK_MODELS` | no | Comma-separated models to try if the first one fails or is busy |
| `RATE_LIMIT_PER_MIN` | no | Requests per minute per visitor (default 6) |
| `SITE_URL` | no | Sent to OpenRouter for attribution, e.g. `https://brewcombos.com` |

Change a variable in Vercel, then redeploy for it to take effect.

## Deploy

Pushing to `main` on GitHub deploys to https://brewcombos.com automatically. There is no build step.

## Run locally

Create `.env.local` with at least the two required variables above:

```
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=nvidia/nemotron-3-super-120b-a12b
```

Then:

```
npm install
npm run dev
```

Local preview is served at `http://127.0.0.1:4173`. Discovery, the builder, and device saves work without API credentials. Without OpenRouter, the mixer falls back to catalog suggestions.

The key is stored as a sensitive variable in Vercel, so `vercel env pull` won't fill it in; copy it from OpenRouter instead.

Opening `index.html` straight from disk won't work: the page loads `lib/menu.js` as a module and needs `/api/mix`.

## Tests

```
npm test            # menu logic, order wording, AI reply parsing, API fallbacks (mocked, no key needed)
npm run test:live   # sends real vibes through the API with the key in .env.local
```

The API turns off model "reasoning" on purpose. Reasoning models otherwise think for 20 to 30 seconds before answering and hit the timeout; with it off, a reply takes about 5 seconds.

## Drink pages

`/drinks/<slug>` pages, the `/drinks` index, the collection pages (energy, coffee, sugar-free, ...) and `sitemap.xml` are generated from `lib/drinks.js`. After editing that file, or anything that changes order wording:

```
npm run pages
```

Commit the generated files; Vercel serves them as plain HTML. `npm test` fails if they are out of date.

The vector favicon lives in `assets/favicon.svg`. Run `npm run brand` after editing it to regenerate the ICO fallback, home-screen icons, web manifest, and 1200×630 social preview. The social preview uses the same bundled fonts and cup renderer as the website.

## Editing the menu

Everything lives in `lib/menu.js`. Add a flavor to `FLAVORS` with a family and a hex color and it shows up in the picker, the cup, and the AI's allowed list.

## September 2026 overhaul

[Research and decisions](docs/research-and-overhaul.md) documents the code audit, official menu checks, competitor observations, and product priorities. There is no traffic or conversion evidence in this repository; the audit does not claim measured user outcomes.

The new site has combined discovery filters, searchable collection pages, a device-saved drink library with tried status and ratings, persistent builder drafts, a large-text order view, and graceful AI fallback. The 66 recipe URLs and six collection URLs are preserved. Shared URLs now preserve custom flavors, and sugar-free syrup requests are separate from sweetness.

Accounts use Supabase email links. Saved drinks sync per account; community submissions stay pending until an administrator approves them. Follow [community setup](docs/community-setup.md) to configure a project, migration, redirect URLs, email delivery, and the admin account. These features show a clear unavailable state until configured. No service-role key is sent to the browser or needed by the API.

Supabase project `brewcombos` (`ixxraxtnalldhgrnvapa`) was created in AI Workspace, US East (Ohio), on September 25, 2026 at the approved $0/month quote. The community migration is applied and local configuration is connected. Auth redirects, production SMTP, an administrator account, and Vercel environment configuration remain launch steps. [Open the project](https://supabase.com/dashboard/project/ixxraxtnalldhgrnvapa).

`npm test` also exercises account flows, the real SQL migration in a local PostgreSQL engine, library account isolation and deletion sync, and public recipe pages. The GitHub Actions workflow runs this suite on pushes and pull requests. Hosted email and database integration still need a deployment smoke test after setup.

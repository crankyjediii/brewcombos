# Brew Combos

Live at https://brewcombos.com

Turn a vibe into a 7 Brew drink, or pick flavors and get the exact words to order it.

```
index.html        the app (vibe mixer + builder)
assets/site.css   styles for every page
lib/menu.js       drinks, flavors, extras, order wording, AI prompt (shared by page + API)
lib/cup.js        the cup drawing, shared by the app and the drink pages
lib/drinks.js     named combos that get their own page
scripts/build-pages.js   generates drinks/*, the collection pages and sitemap.xml
api/mix.js        serverless function that calls OpenRouter with your key
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
npm i -g vercel
vercel dev
```

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

## Editing the menu

Everything lives in `lib/menu.js`. Add a flavor to `FLAVORS` with a family and a hex color and it shows up in the picker, the cup, and the AI's allowed list.

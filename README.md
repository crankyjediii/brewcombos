# Brew Combos

Live at https://brewcombos.com

Turn a vibe into a 7 Brew drink, or pick flavors and get the exact words to order it.

```
index.html      the whole front end
lib/menu.js     drinks, flavors, extras, order wording, AI prompt (shared by page + API)
api/mix.js      serverless function that calls OpenRouter with your key
test/           unit tests for the menu logic and the API (no network needed)
```

## Deploy on Vercel

1. Push this folder to a GitHub repo and import it in Vercel (framework preset: **Other**, no build command).
2. In **Project > Settings > Environment Variables**, add:
   - `OPENROUTER_API_KEY` = your key
   - `OPENROUTER_MODEL` = the model id, e.g. `meta-llama/llama-3.3-70b-instruct:free`
   - optional: `OPENROUTER_FALLBACK_MODELS` (comma-separated), `RATE_LIMIT_PER_MIN`, `SITE_URL`
3. Redeploy so the variables take effect.

## Run locally

```
npm i -g vercel
cp .env.example .env.local   # fill in your key + model
vercel dev
```

Opening `index.html` straight from disk won't work anymore: the page loads `lib/menu.js` as a module and needs `/api/mix`.

## Tests

```
npm test            # menu logic, order wording, AI reply parsing, API fallbacks (mocked, no key needed)
npm run test:live   # sends real vibes through the API with the key in .env.local
```

The API turns off model "reasoning" on purpose. Reasoning models otherwise think for 20 to 30 seconds before answering and hit the timeout; with it off, a reply takes about 5 seconds.

## Editing the menu

Everything lives in `lib/menu.js`. Add a flavor to `FLAVORS` with a family and a hex color and it shows up in the picker, the cup, and the AI's allowed list.

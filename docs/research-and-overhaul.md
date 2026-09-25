# Brew Combos research and overhaul brief

Research date: September 25, 2026. This records the starting application and the rationale for the overhaul. Implementation status belongs in the project README and release notes.

The owner selected search traffic and community as the priorities, requested a full redesign, and chose email accounts, synced saves, and submissions reviewed by an administrator. The recommended product is a searchable drink library with a useful order builder and a personal collection. Community recipes can add firsthand detail to the library once they pass review.

## What the existing app does well

The app turns a combination into a complete sentence someone can read at the drive-through. The same recipe can be edited, shared, or opened on its own page. Those are concrete visitor tasks, and the existing code already connects them.

`lib/menu.js` is shared by the browser and the AI endpoint. It centralizes bases, flavors, allowed temperatures, milk choices, and order wording. `lib/drinks.js` holds the curated catalog. `scripts/build-pages.js` produces HTML drink and category pages plus a sitemap; `test/pages.test.js` checks that generated files are current. Keeping those pages and URLs gives the redesign an existing catalog to build on.

`lib/cup.js` provides a recognizable drink illustration without needing a photograph for every custom recipe. `assets/share.js` supports links and share images. `assets/settings.js` remembers size, milk, theme, and motion preferences. The builder can work without an AI response, and the API already tries configured fallback models.

These are findings from source inspection. No analytics, Search Console data, conversion records, or user interviews were available to establish which features people use or which pages attract traffic.

## Gaps found in the starting code

| Area | Evidence | Consequence |
| --- | --- | --- |
| Finding a known ingredient | The generated `/drinks` index lists recipes and category links without catalog search. | A visitor looking for peach or avoiding coconut must scan recipes. |
| Returning to an order | Settings use localStorage, but there is no personal drink collection or account system. | Shared links and memory carry the burden of remembering orders. |
| Community | Recipes live in a source file with no submission or moderation flow. | A visitor cannot contribute a tested combination through the site. |
| AI availability | The home page begins with the vibe input. `index.html` shows an error after an unsuccessful API request. | Someone who started with a vibe can reach a dead end despite the existing catalog. |
| Sugar-free wording | `fixCombo` resets sweetness when `sf` is true; `orderLine` labels non-energy flavors sugar-free without per-flavor evidence and omits that request for energy syrups. | Sugar preference and sweetness become coupled, and order sentences can imply availability that was not established. |
| Published claims | The sugar-free collection says every listed combo works with SF syrups. The FAQ says most flavors have SF versions and that three flavors is the usual limit. | The available official sources do not support those blanket claims. |
| Caffeine labels | `orderFacts` derives a yes/no answer entirely from the base category. The no-caffeine collection also calls every included drink suitable for kids and late nights. | Those statements exceed what the base classification establishes for a customized drink. |
| Topping terminology | The FAQ and menu comment call “soft top” an official 7 Brew topping. | Current official sources checked for this audit name cold foam and cream; “soft top” needs confirmation or revised wording. |
| Recipe descriptions | Some blurbs describe a drink as lower sugar or say a syrup adds little sugar without a matching nutrition calculation. | Taste descriptions can be mistaken for nutrition facts. |
| Shared custom recipes | The original query parser accepts only flavors already known in that browser. | A custom flavor can disappear when another visitor opens the link. |
| Daily-drink sharing | The original home page applies saved preferences to the displayed daily drink but shares its standard recipe URL. | The recipient may see a different size, milk, or SF request from the sender. |

The starting suite had 58 passing tests. That establishes a useful regression baseline, not coverage of the gaps above. The source audit also found a large inline home-page script, no CI workflow alongside automatic deployment from main, and an API rate limiter stored in an in-memory Map. Splitting new features into shared modules and running the existing suite before deployment should reduce change risk. A per-instance limiter cannot be treated as a durable account-level quota.

## External evidence

7 Brew's [official menu](https://7brew.com/menu) already includes a Find My Drink quiz. Its customization section lists extra shots, flavors, quarter/half/regular/extra sweetness, oat/coconut/almond milk, cream/whipped cream/cold foam, and white chocolate/dark chocolate/caramel drizzles. The [official menu PDF](https://7brew.com/7-brew-menu.pdf) shows those choices too. This supports explicit controls in the builder; it does not establish every flavor's availability at every stand.

The [official 7 Energy page](https://7brew.com/menu/energy/) distinguishes original and sugar-free bases. The [June 2026 nutrition guide](https://7brew.com/nutrition) warns that sugar-free flavor options do not necessarily make the entire beverage sugar-free. It also lists different tea bases. Therefore the product should distinguish an SF request from a nutrition guarantee and should not calculate custom nutrition from the drink category alone.

The [official support page](https://7brew.com/support) says customers can combine flavors and ask a Brewista about the secret menu. It says each stand has an allergen chart. It also says nutrition is unavailable online, which conflicts with the live PDF; the PDF is the more direct source for its listed recipes. A complete current official list of individual SF syrups was not verified in this audit. A 2023 official menu was found but is too old to establish current availability by itself.

The independent [7brewdrinks.com directory](https://www.7brewdrinks.com/) displays taste-category filters, a sugar-free toggle, recipe links, 102 flavor combinations, and a Surprise me control. [7brewsecrets.com](https://7brewsecrets.com/) displays a searchable secret-menu directory and a submission link. These are observations of competing interfaces. Their claimed barista verification, accuracy, and dietary labels were not independently verified and should not be copied as evidence.

Two public discussions illustrate possible visitor tasks: a [first-time visitor asks how to say an order](https://www.reddit.com/r/7Brew/comments/1l6gmnv/energy_drink_recommendations/), and a [visitor cannot locate the individual flavor list](https://www.reddit.com/r/7Brew/comments/1vj14nn/where_is_the_flavor_list/). These are anecdotes, not a representative study of demand.

## Priorities and intended behavior

**1. Discovery that leads to an order.** Put catalog search and browse categories near the top of the home page. Allow combined filters for base, temperature, taste, and ingredients to exclude. Search names, flavors, and bases, including unaccented spellings of words such as crème brûlée. Show the ingredients before a visitor opens the detail page. Every result should lead to its recipe, the builder, or an order card.

Taste labels are editorial inferences from ingredients. “Tropical” and “creamy” help browse; they are not nutrition classifications. Excluding coconut is a recipe preference, not an allergy guarantee.

**2. Saves that survive a return visit.** Let guests save an order immediately. Email sign-in should add account-backed synchronization without making browsing dependent on sign-in. Make saved and unsynced states distinguishable. Preserve guest saves when the visitor signs in, and store each user's collection with ownership enforced by the backend. A local-only implementation must say that saves remain in this browser.

**3. Reviewed community contributions.** Collect the recipe ingredients, order details, a name, and a short note about the contributor's experience. Submissions should begin as pending and become public only after an administrator approves them. Keep review status, reviewer identity, and timestamps. Show whether a recipe is a Brew Combos creation or a community submission; “approved” should describe editorial review, not imply official 7 Brew endorsement or taste testing.

**4. Accurate, maintainable menu content.** Keep sweetness separate from requests for SF flavors. Ask for an SF energy base and SF flavors explicitly when both are wanted. Replace blanket dietary claims with wording that describes the requested ingredients. Add source and checked-date fields when a claim is verified; avoid dates that merely suggest freshness. Seasonal flavors should be labeled accordingly, with stand availability left to confirmation.

**5. Useful pages for search visitors.** Preserve existing recipe URLs and their crawlable HTML. Each public recipe should answer what is in the drink, how to order it, and how to customize it. Link relevant recipes and categories using normal anchors. Google's [link guidance](https://developers.google.com/search/docs/crawling-indexing/links-crawlable) explains how those links support discovery by crawlers. Useful original recipe notes and transparent authorship fit Google's [helpful-content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content); neither guarantees rankings.

Community publishing needs controls because it also introduces spam and low-quality pages. Google's [guidance on user-generated spam](https://developers.google.com/search/docs/monitor-debug/prevent-abuse) supports active moderation. The product recommendation is to keep pending submissions out of public discovery, publish only reviewed recipes, and avoid creating indexable pages for every arbitrary search or AI output.

**6. Graceful AI failure.** Keep the vibe generator as an optional discovery route. When it is unavailable, show clearly labeled recommendations from the existing catalog. Deterministic matching should honor the selected category and excluded ingredients; it should not imply that it understood every nuance of free text.

## Validation and limits

Test search combinations, saved-order round trips, guest-to-account behavior, user ownership, and pending-to-approved submission transitions. Check the complete order flow on mobile, keyboard access, visible focus, empty results, signed-out states, and failed network requests. Generated page checks should continue to protect existing URLs and recipe wording.

After release, use actual measurements to decide the next iteration: search queries with no results, recipe opens that lead to copying an order, saves, return use of saved drinks, and submission completion. Search Console can establish indexing and organic query performance. Do not describe a recipe as trending, popular, or highly rated until real activity supports the label.

This audit does not establish stand-specific inventory, exact nutrition for custom orders, allergy safety, competitor traffic, current search rankings, or expected growth. Backend deployment, email delivery, and account synchronization need live configuration and validation in addition to local tests.

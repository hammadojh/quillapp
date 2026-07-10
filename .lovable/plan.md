## What we're building

Three linked upgrades to the writing flow:

1. **Personal style profile** — captured once, applied to every future article.
2. **Depth score + warning** — cheap articles get flagged before generation.
3. **Inline research cards** — live web results surface during the interview so writers can react to related work.

---

## 1. Style profile (5–6 Q onboarding)

**When it fires:** the first time a user finishes generating an article. On the "Ready" screen we add a small "Set your writing style (1 min)" card that opens a modal. Also reachable anytime from Dashboard → "Writing style".

**Questions (adaptive to their answers, mostly free text/voice):**
1. Which 2–3 writers/thinkers do you sound like — or wish you did?
2. Pick your voice: authoritative · warm · punchy · playful · reflective (multi-select).
3. Sentence rhythm: short & punchy · flowing · mixed.
4. What do you never do in your writing? (banned words, clichés, hedging…)
5. Favorite structural move: story-first · thesis-first · contrarian-hook · numbered breakdown.
6. Paste 2–3 sentences you're proud of writing (optional, boosts the profile a lot).

Answers get summarized by the model into a compact `style_card` (voice, do's, don'ts, structural preference, ~150 words) stored on `profiles.style_profile jsonb`. That card is injected into the article-generation system prompt on every future post.

## 2. Depth score + warning gate

**How it's scored (one AI call, cheap Gemini flash-lite):** transcript in → `{ score: 0–10, specificity, contrarianism, examples_count, gaps: [strings] }` out.

**Threshold:** score < 6 → the "Generate now" tap opens a warning modal:
- "Your draft feels a bit thin. Here's what a reader might miss: {gaps}. Add more, or generate anyway?"
- Buttons: **Keep interviewing** (default) · **Generate anyway**.

Score ≥ 6 skips the modal. Score gets stored on the post so we can show a small quality badge on the dashboard later.

## 3. Inline research cards (Firecrawl web search)

**Trigger:** after every 2nd user turn (throttled), and when the user taps a new "Inspire me" chip in the composer.

**What runs:** a server fn extracts the current topic + key claim from the last 3 turns, calls Firecrawl search (top 3 results), returns `[{ title, url, snippet, angle }]` where `angle` is a one-liner the model writes about how it relates ("this challenges your take", "backs up your example", "someone made the opposite argument").

**UI:** a horizontal scroller of small cards below the newest assistant message. Tapping a card:
- Expands the snippet.
- Adds a chip below the composer: "Respond to: {title}" — pre-fills the interviewer's next probe ("How does your view differ from X's argument that…?").

Cards are ephemeral (not stored). Firecrawl connector needs to be linked.

---

## Technical section

**DB migration:**
- `profiles.style_profile jsonb` (nullable), `profiles.style_completed_at timestamptz`.
- `posts.depth_score int` (nullable), `posts.depth_gaps jsonb`.

**Connector:** link Firecrawl via `standard_connectors--connect` (connector_id `firecrawl`).

**New/edited files:**
- `src/lib/style.functions.ts` — `getStyleProfile`, `saveStyleProfile` (takes raw answers + optional samples, calls Gemini to distill, stores).
- `src/lib/depth.functions.ts` — `scoreDepth({ postId })` → runs AI scoring, persists.
- `src/lib/research.functions.ts` — `getResearchForTurn({ postId })` → topic extract + Firecrawl search + relevance blurbs.
- `src/lib/posts.functions.ts` — `generateBlogPost` reads `profiles.style_profile` and adds it to the system prompt.
- `src/routes/_authenticated/post.$postId.tsx` — depth-check before `generate()` runs; research cards under latest assistant message; Firecrawl "Inspire me" chip.
- `src/routes/_authenticated/style.tsx` — new onboarding/edit modal-page.
- `src/routes/_authenticated/dashboard.tsx` — first-article completion → nudge card linking to `/style`; depth badge on post rows.
- `src/lib/i18n.tsx` — new strings (AR/EN) for the modal, warning, research chip, style Qs.

**Cost/perf notes:**
- Depth score: 1 flash-lite call (~$0 in credits).
- Research: throttled to every 2nd turn + on-demand; caches the last 3 result sets in memory.
- Style distillation: one flash call per profile save.
- Firecrawl: ~1 search per triggered turn; scopes to `formats: []` (metadata only, no scrape) to keep credits low.

**Fallbacks:** if Firecrawl connector isn't linked, the "Inspire me" chip shows a friendly "Connect research to enable" tooltip and inline cards silently no-op. Depth scoring failure = no gate. Missing style profile = old prompt.

---

## Rollout order in one turn

1. Link Firecrawl connector.
2. DB migration.
3. Server fns (style, depth, research) + prompt update.
4. Style onboarding route + dashboard nudge.
5. Interview UI: research cards + depth warning.
6. i18n strings.

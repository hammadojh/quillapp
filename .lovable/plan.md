## Goal
Give every shared article its own PNG preview card (title + author) instead of the single static `og-default.png`.

## Approach
Skip on-the-fly WASM PNG rendering (blocked on Cloudflare Workers — that's why the last attempt failed). Instead: generate the thumbnail once, store the finished PNG in Lovable Cloud Storage, and point `og:image` at the stable public URL.

Two options for how the PNG is produced — pick one:

**Option A — AI-generated editorial card (recommended)**
Use the AI Gateway image endpoint (`openai/gpt-image-2`, `quality: "low"`, 1536x1024 → resized/cropped to 1200x630) with a prompt that bakes in the article title, author name, and a magazine-cover art direction (serif type, warm paper background, subtle accent). Feels personalized and on-brand; no font/RTL headaches because the model renders the text itself. Cost: ~1 low-quality image per published post.

**Option B — Templated card via HTML → screenshot**
Not viable in this stack (no headless browser on Workers). Skipping.

Going with **Option A**.

## Trigger
Generate the thumbnail the first time a post is made public (and re-generate when the title changes on an already-public post). No generation for private posts — saves credits.

## Storage
- New public Storage bucket `post-thumbnails`.
- Object key: `${post.id}.png`.
- Public read via bucket policy; writes only via server (service role).
- Add `thumbnail_url TEXT` column on `posts` so the frontend/OG tags read a single field.

## Server flow
1. New server fn `ensurePostThumbnail({ postId })`:
   - Loads post (title, author display name, share_id, is_public, thumbnail_url, updated_at).
   - If not public → no-op.
   - Builds prompt: editorial magazine cover, title text verbatim, small "by {author}" line, deterministic accent color from share_id, RTL-aware wording ("Arabic title, right-aligned" vs "English title, left-aligned") based on Unicode range of the title.
   - Calls AI Gateway `/v1/images/generations` non-streaming (server-side, we just want the final bytes).
   - Uploads base64 PNG to `post-thumbnails/${postId}.png` via `supabaseAdmin` storage.
   - Writes public URL to `posts.thumbnail_url`.
2. Hook into `setPostVisibility` (when flipping to public) and into `updatePost` (when title changes on a currently-public post) — call `ensurePostThumbnail` fire-and-forget so the UI stays snappy. Errors log but don't block.
3. `p.$shareId.tsx` loader already fetches the post — extend it to return `thumbnail_url`. In `head()`, use `thumbnail_url` when present, fall back to `/og-default.png`.

## Fallback
If image generation fails or the post has no thumbnail yet, `og:image` stays on the static `og-default.png` — no broken previews.

## Cache-busting
Append `?v={updated_at timestamp}` to the `og:image` URL so LinkedIn/X pick up the new card after a title edit (their own caches still apply — user must use the platform debuggers for already-shared links, same caveat as before).

## Files touched
- New migration: add `thumbnail_url` column to `posts`; create `post-thumbnails` bucket + policies.
- New: `src/lib/thumbnails.server.ts` (prompt + AI Gateway call + storage upload).
- Edit: `src/lib/social.functions.ts` — call `ensurePostThumbnail` in `setPostVisibility`; return `thumbnail_url` from `getPublicPostByShareId`.
- Edit: `src/lib/posts.functions.ts` — call `ensurePostThumbnail` from `updatePost` when title changed and post is public.
- Edit: `src/routes/p.$shareId.tsx` — use `thumbnail_url` in `og:image` / `twitter:image` with cache-bust param.

## Notes for the user
- Only public posts get a custom card (saves credits and matches the sharing surface).
- First share of a post may show the default card for a few seconds while generation completes; refresh once and the personalized card appears.
- Already-tweeted links stay cached on X/LinkedIn until refreshed in their debuggers.

## Home page redesign + social features

Big shift from a private drafting tool into a **public, social writing platform**. Here is what I'll build, in order.

### 1. Database changes (one migration)

- `posts` — add `is_public boolean default false`, `slug text unique`, `share_id text unique` (short id for `/p/<id>`), `likes_count int default 0`, `comments_count int default 0`.
- `profiles` — `user_id uuid pk → auth.users`, `username text unique`, `display_name text`, `bio text`, `avatar_url text`. Auto-created on signup via trigger.
- `post_likes` — `(post_id, user_id)` unique, with triggers to keep `posts.likes_count` in sync.
- `post_comments` — `id, post_id, user_id, content, created_at`, with triggers for `comments_count`.
- RLS:
  - Public can `SELECT` posts where `is_public = true`, all profiles, all comments, all likes.
  - Authenticated users manage their own posts/profile/likes/comments.
- Sample data: mark the 6 best existing Arabic posts as public so the landing page has real content immediately.

### 2. Landing page redesign (`/`)

- **Hero with a textbox at the top** like ChatGPT/Claude — "ما الذي تريد الكتابة عنه؟" / "What do you want to write about?" with a Start button.
  - Typing + clicking Start drops the topic into `sessionStorage` and routes to `/auth` (or `/dashboard → new post` if already signed in). The new-post flow picks it up and uses it as the first interview message.
- Section: **"اقرأ ما كتبه الخبراء"** — grid of 6 sample public posts (title, author, excerpt, like count). Each links to `/p/<share_id>`.
- Keep the "how it works" 3-step strip, simplified.
- Mobile-first, RTL-correct, same paper/ink theme.

### 3. Public post page (`/p/$shareId`)

- SSR-friendly, no auth required.
- Renders the article as Markdown, shows author (links to profile), like button, share buttons, comments list + composer.
- Unauthenticated users see "Sign in to like / comment" CTAs instead of disabled buttons.
- Proper `<head>` meta (title, description, og:title, og:description) from post content.

### 4. Public profile page (`/u/$username`)

- Avatar, display name, bio.
- Grid of that user's public posts.
- "Edit profile" button only when viewing own profile.

### 5. Post workspace updates (`/_authenticated/post/$postId`)

- New **Privacy toggle**: Private / Public. When made public, generate `share_id` + show the share link with copy button.
- **Share link** card with copy button + existing X/LinkedIn share buttons now point at `/p/<share_id>`.
- Small "View public page" link when public.

### 6. Dashboard updates

- Each post row shows a Public/Private badge.
- Add a top link to the user's own public profile.

### 7. Auth flow change

- After signup/signin, if `sessionStorage` has a pending topic from the landing hero, auto-create a new post with that topic as the first user message and route straight into the interview.
- New users without a username are prompted once for a username (modal on dashboard).

### Technical notes

- All new server logic via `createServerFn` in `src/lib/*.functions.ts` (posts, profiles, likes, comments).
- Public reads use a publishable-key server client + `TO anon` SELECT policies — no admin client for normal reads.
- New routes: `src/routes/p.$shareId.tsx`, `src/routes/u.$username.tsx`, `src/routes/_authenticated/profile.tsx`.
- i18n: add Arabic + English strings for every new label.
- Likes/comments counts maintained by SQL triggers, not client logic.

### Out of scope (will not do unless you ask)

- Follows / notifications / feeds.
- Rich-text comments (plain text only).
- Image uploads for avatars (initials placeholder for now).
- Search / discovery beyond the landing samples.

Shall I proceed?
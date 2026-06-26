# BlogSmith — AI Blog Post Generator for Experts

An adaptive AI interview app that helps experts turn their knowledge into a polished long-form blog post they can share. Each expert signs in, the AI asks targeted follow-up questions about their topic, then generates a full article they can edit, copy, and save to their account.

## Core Flow

1. **Sign in** (email/password) — posts are tied to the user's account.
2. **Dashboard** — list of past posts (drafts + generated), button to start a new one.
3. **Interview** — chat-style adaptive interview. AI opens with "What do you want to write about?" then asks ~5–8 smart follow-ups based on answers (target audience, key insight, supporting examples/stories, takeaways, tone, CTA). AI decides when it has enough and offers a "Generate post" button.
4. **Generated post** — full markdown article rendered with title, intro, headed sections, conclusion. User can:
   - Edit the title and body inline
   - Regenerate with a tweak ("make it punchier", "shorter")
   - Copy to clipboard / copy as markdown
   - Save (auto-saves on generation)
5. **Post detail page** at `/post/$postId` — view/edit any saved post.

## Pages / Routes

- `/` — landing page (public): hero, how it works, CTA → sign in
- `/auth` — sign in / sign up (public)
- `/_authenticated/dashboard` — list of user's posts + "New post" button
- `/_authenticated/new` — adaptive interview chat → generated post view
- `/_authenticated/post/$postId` — view / edit / regenerate a saved post

## Backend (Lovable Cloud)

**Tables**
- `posts` — `id uuid pk`, `user_id uuid → auth.users`, `title text`, `content text` (markdown), `status text` ('interviewing' | 'generated'), `interview_messages jsonb` (UIMessage[]), `created_at`, `updated_at`. RLS: users see/modify only their own.

**Server functions (`createServerFn`, authenticated)**
- `listPosts` — user's posts ordered by updated_at desc
- `getPost(id)` — single post
- `createPost` — new draft, returns id (navigated to)
- `updatePost(id, { title?, content?, interview_messages?, status? })`
- `deletePost(id)`
- `generateBlogPost(id)` — reads interview transcript, calls Lovable AI to produce final markdown article, saves to post

**Streaming chat server route** at `/api/chat` — adaptive interview. System prompt instructs Gemini to act as an editorial interviewer: ask one focused question at a time, dig into the expert's unique insight, stop when it has enough material (topic, audience, key insight, 2–3 supporting points, tone, CTA), then tell the user to click "Generate post". Per-message persistence handled via `updatePost` from the client.

## AI

- Lovable AI Gateway via AI SDK, model `google/gemini-3-flash-preview`.
- Interview uses `streamText` + `useChat` with AI Elements (`Conversation`, `Message`, `MessageResponse`, `PromptInput`, `Shimmer`).
- Generation uses `generateText` in a server function with a prompt that turns the transcript into a 700–1100 word blog post in markdown: compelling title, 1-sentence hook, 3–5 H2 sections, conclusion, optional 1-line social share blurb at the end.

## UI / Design

Editorial, writerly feel — not a generic chatbot. Warm off-white background, serif display font for titles (Fraunces), clean sans (Inter) for UI/body. One accent color (deep ink blue). Generous line height. Markdown rendered with `react-markdown` + Tailwind typography classes for the generated post.

AI Elements drive the interview surface. Assistant messages render with no bubble; user messages get a subtle filled bubble. Custom domain-specific empty state ("Tell me what you want to teach the world today.") instead of a generic Sparkles icon.

## Technical Notes

- TanStack Start file-based routing, `_authenticated` layout already managed by integration.
- AI Gateway wired through `src/lib/ai-gateway.server.ts` helper per Lovable AI Gateway pattern.
- Chat transport: `DefaultChatTransport({ api: "/api/chat" })`, chat `id` = `postId`, messages persisted to `posts.interview_messages` on assistant finish via `onFinish` in the route's `toUIMessageStreamResponse`.
- Markdown rendering: `react-markdown` + `@tailwindcss/typography` already-available `prose` classes.
- No thread list/sidebar — each post IS a conversation; the dashboard is the list.

## Out of Scope (this build)

- Social-platform-specific reformatting (LinkedIn/Twitter variants) — long-form blog only, per your choice.
- Image generation, scheduled publishing, team workspaces, comments.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicSupabase } from "./public-client.server";

type PostSummary = {
  id: string;
  share_id: string | null;
  title: string;
  content: string;
  likes_count: number;
  comments_count: number;
  views_count: number;
  shares_count: number;
  updated_at: string;
  user_id: string;
  author?: { username: string; display_name: string | null } | null;
};

const sb = (c: any) => c.from("posts") as any;
const sbp = (c: any) => c.from("profiles") as any;
const sbl = (c: any) => c.from("post_likes") as any;
const sbc = (c: any) => c.from("post_comments") as any;

function excerpt(content: string, n = 180): string {
  const stripped = content
    .replace(/^#\s+.*$/m, "")
    .replace(/^>.*$/gm, "")
    .replace(/[#*_`>]/g, "")
    .trim();
  const flat = stripped.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n).trim() + "…" : flat;
}

async function attachAuthors(rows: any[]): Promise<PostSummary[]> {
  if (!rows.length) return [];
  const ids = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profs } = await sbp(publicSupabase())
    .select("user_id, username, display_name")
    .in("user_id", ids);
  const map = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
  return rows.map((r) => ({ ...r, author: map.get(r.user_id) ?? null }));
}

export const listLandingPosts = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await sb(publicSupabase())
    .select("id, share_id, title, content, likes_count, comments_count, views_count, updated_at, user_id, thumbnail_url")
    .eq("is_public", true)
    .eq("in_feed", true)
    .order("updated_at", { ascending: false })
    .limit(9);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((r: any) => ({ ...r, content: excerpt(r.content, 200) }));
  return attachAuthors(rows);
});

export const getPublicPostByShareId = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ shareId: z.string().min(4) }).parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await sb(publicSupabase())
      .select("id, share_id, title, content, likes_count, comments_count, views_count, shares_count, updated_at, user_id, is_public, thumbnail_url")
      .eq("share_id", data.shareId)
      .eq("is_public", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const [withAuthor] = await attachAuthors([row]);
    return withAuthor;
  });

export const incrementPostView = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).rpc("increment_post_views", { _post_id: data.postId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getProfileByUsername = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ username: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { data: prof, error } = await sbp(publicSupabase())
      .select("user_id, username, display_name, bio, avatar_url, created_at")
      .eq("username", data.username.toLowerCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!prof) return null;
    const { data: posts } = await sb(publicSupabase())
      .select("id, share_id, title, content, likes_count, comments_count, views_count, updated_at, user_id, thumbnail_url")
      .eq("user_id", prof.user_id)
      .eq("is_public", true)
      .eq("in_feed", true)
      .order("updated_at", { ascending: false });
    const summarized = (posts ?? []).map((r: any) => ({ ...r, content: excerpt(r.content, 160) }));
    return { profile: prof, posts: summarized as PostSummary[] };
  });

export const listComments = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: rows, error } = await sbc(publicSupabase())
      .select("id, post_id, user_id, content, created_at")
      .eq("post_id", data.postId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    if (!rows?.length) return [];
    const ids = Array.from(new Set(rows.map((r: any) => r.user_id)));
    const { data: profs } = await sbp(publicSupabase())
      .select("user_id, username, display_name")
      .in("user_id", ids);
    const map = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
    return rows.map((r: any) => ({ ...r, author: map.get(r.user_id) ?? null }));
  });

export const getLikeState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await sbl(context.supabase)
      .select("post_id")
      .eq("post_id", data.postId)
      .eq("user_id", context.userId)
      .maybeSingle();
    return { liked: !!row };
  });

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await sbl(context.supabase)
      .select("post_id")
      .eq("post_id", data.postId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) {
      const { error } = await sbl(context.supabase)
        .delete()
        .eq("post_id", data.postId)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { liked: false };
    }
    const { error } = await sbl(context.supabase)
      .insert({ post_id: data.postId, user_id: context.userId });
    if (error) throw new Error(error.message);
    return { liked: true };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ postId: z.string().uuid(), content: z.string().trim().min(1).max(1000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error, data: row } = await sbc(context.supabase)
      .insert({ post_id: data.postId, user_id: context.userId, content: data.content })
      .select("id, post_id, user_id, content, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await sbc(context.supabase).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function suggestUsername(seed: string): string {
  const base = seed.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) || "writer";
  const padded = base.length >= 3 ? base : (base + "user").slice(0, 8);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${padded}_${suffix}`.slice(0, 30);
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await sbp(context.supabase)
      .select("user_id, username, display_name, bio, avatar_url")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;

    // Auto-create profile on first access
    const email = (context.claims?.email as string | undefined) ?? "";
    const local = email.split("@")[0] ?? "writer";
    let username = suggestUsername(local);
    for (let i = 0; i < 5; i++) {
      const { error: insErr, data: inserted } = await sbp(context.supabase)
        .insert({ user_id: context.userId, username, display_name: local || null })
        .select("user_id, username, display_name, bio, avatar_url")
        .single();
      if (!insErr) return inserted;
      if (insErr.code === "23505") {
        username = suggestUsername(local);
        continue;
      }
      throw new Error(insErr.message);
    }
    throw new Error("Could not allocate username");
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        username: z.string().regex(/^[a-z0-9_]{3,30}$/).optional(),
        display_name: z.string().trim().max(80).nullable().optional(),
        bio: z.string().trim().max(400).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.username !== undefined) patch.username = data.username;
    if (data.display_name !== undefined) patch.display_name = data.display_name;
    if (data.bio !== undefined) patch.bio = data.bio;
    const { error, data: row } = await sbp(context.supabase)
      .update(patch)
      .eq("user_id", context.userId)
      .select("user_id, username, display_name, bio, avatar_url")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setPostVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), is_public: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // When flipping back to private, also remove from the public feed.
    const patch: Record<string, unknown> = { is_public: data.is_public };
    if (!data.is_public) patch.in_feed = false;
    const { error } = await sb(context.supabase)
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.is_public) {
      const { ensurePostThumbnailBackground } = await import("./thumbnails.server");
      ensurePostThumbnailBackground(data.id);
    }
    return { ok: true };
  });

export const setPostFeedInclusion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), in_feed: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Only publicly shareable posts may appear on the feed.
    const { data: row, error: readErr } = await sb(context.supabase)
      .select("is_public")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Post not found");
    if (data.in_feed && !row.is_public) {
      throw new Error("Make the post public via link before adding it to the feed.");
    }
    const { error } = await sb(context.supabase)
      .update({ in_feed: data.in_feed })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
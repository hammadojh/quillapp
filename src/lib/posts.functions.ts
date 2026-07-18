import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateText } from "ai";

// posts table types are not in generated types yet; use loose typing locally.
import type { Json } from "@/integrations/supabase/types";
type PostRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  status: "interviewing" | "generated";
  interview_messages: Json;
  created_at: string;
  updated_at: string;
};
const tbl = (sb: any) => sb.from("posts") as any;

export const listPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await tbl(context.supabase)
      .select("id, title, status, updated_at, created_at, is_public, in_feed, share_id, likes_count, comments_count, thumbnail_url")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<
      Pick<PostRow, "id" | "title" | "status" | "updated_at" | "created_at"> & {
        is_public: boolean;
        share_id: string | null;
        likes_count: number;
        comments_count: number;
        thumbnail_url: string | null;
      }
    >;
  });

export const getPost = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: post, error } = await tbl(context.supabase)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!post) throw new Error("Post not found");
    return post as PostRow;
  });

export const createPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await tbl(context.supabase)
      .insert({ user_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data as { id: string };
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  title: z.string().optional(),
  content: z.string().optional(),
  interview_messages: z.array(z.any()).optional(),
  status: z.enum(["interviewing", "generated"]).optional(),
});

export const updatePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await tbl(context.supabase)
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
    // Regenerate the shareable thumbnail if the title changed on a public post.
    if (typeof patch.title === "string") {
      const { ensurePostThumbnailBackground } = await import("./thumbnails.server");
      ensurePostThumbnailBackground(id);
    }
    return { ok: true };
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await tbl(context.supabase).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const regenerateThumbnail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Verify ownership via RLS-scoped read before running the privileged generator.
    const { data: row, error } = await tbl(context.supabase)
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Post not found");
    const { ensurePostThumbnail } = await import("./thumbnails.server");
    await ensurePostThumbnail(data.id);
    const { data: fresh } = await tbl(context.supabase)
      .select("thumbnail_url")
      .eq("id", data.id)
      .maybeSingle();
    return { thumbnail_url: (fresh?.thumbnail_url ?? null) as string | null };
  });

const GEN_SYSTEM = `You are an accomplished editorial writer who turns expert interview transcripts into compelling long-form blog posts.

Rules:
- Output ONLY the article in clean Markdown, no preamble, no commentary.
- Language: write the entire article in the language the expert chose near the end of the interview (Arabic or English). If unclear, follow the DEFAULT_LANGUAGE noted in the prompt. Headings, body, and share blurb must all be in that one language.
- Length: honor the length the expert chose near the end of the interview. Map short → 250–400 words & 2–3 H2 sections; medium → 500–750 words & 3–4 H2; long → 900–1200 words & 4–6 H2. If the expert did not state a preference, default to short. The TARGET_LENGTH header (if present) overrides.
- Start with a # Title that is specific and intriguing (not generic).
- Open with a 1–2 sentence hook that grabs the reader.
- Use ## H2 sections with concrete substance from the interview.
- Include specific examples, stories, numbers, or analogies the expert mentioned.
- Voice: confident, warm, first-person from the expert, no fluffy filler.
- End with a brief conclusion + a one-line social share blurb prefixed exactly with: > **Share blurb:**
- Be concise — never pad to hit the upper bound of the chosen length.`;

const LENGTH_RANGES: Record<"short" | "medium" | "long", { words: string; sections: string }> = {
  short: { words: "250–400 words", sections: "2–3 short H2 sections" },
  medium: { words: "500–750 words", sections: "3–4 H2 sections" },
  long: { words: "900–1200 words", sections: "4–6 H2 sections" },
};

export const generateBlogPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        tweak: z.string().optional(),
        language: z.enum(["ar", "en"]).optional(),
        length: z.enum(["short", "medium", "long"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: post, error } = await tbl(context.supabase)
      .select("interview_messages, content")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!post) throw new Error("Post not found");

    // Load the writer's style profile (if they completed the wizard) so the
    // final article echoes their voice.
    const { data: prof } = await (context.supabase.from("profiles") as any)
      .select("style_profile")
      .eq("user_id", context.userId)
      .maybeSingle();
    const styleSummary: string | undefined = prof?.style_profile?.summary;

    const transcript = (post.interview_messages as Array<{ role: string; parts?: Array<{ type: string; text?: string }> }> | null ?? [])
      .map((m) => {
        const text = (m.parts ?? [])
          .filter((p) => p.type === "text" && p.text)
          .map((p) => p.text)
          .join("");
        return `${m.role === "user" ? "EXPERT" : "INTERVIEWER"}: ${text}`;
      })
      .join("\n\n");

    const defaultLang = data.language === "en" ? "English" : "Arabic";
    const lengthOverride = data.length ? LENGTH_RANGES[data.length] : null;
    const header =
      `DEFAULT_LANGUAGE: ${defaultLang} (use this only if the expert never stated a preference in the interview)\n` +
      (lengthOverride ? `TARGET_LENGTH: ${lengthOverride.words}, ${lengthOverride.sections}.\n` : "") +
      (styleSummary ? `\nWRITER_STYLE_GUIDE (mimic this voice closely — vocabulary, rhythm, structural habits):\n${styleSummary}\n` : "") +
      `\n`;
    const prompt = data.tweak
      ? `${header}Rewrite this existing blog post applying this feedback: "${data.tweak}". Keep the same language as the original unless the feedback explicitly requests a different one.\n\nORIGINAL POST:\n${post.content}\n\nORIGINAL INTERVIEW:\n${transcript}`
      : `${header}Write the blog post based on this interview transcript:\n\n${transcript}`;

    const gateway = createLovableAiGatewayProvider(key);
    const result = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: GEN_SYSTEM,
      prompt,
    });

    const md = result.text.trim();
    const titleMatch = md.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim().slice(0, 200) : "Untitled draft";

    const { error: updateError } = await tbl(context.supabase)
      .update({ content: md, title, status: "generated" })
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);

    // Thumbnail generation is triggered separately by the client (via
    // `regenerateThumbnail`) so the UI can show a staged progress modal
    // instead of blocking on the whole pipeline in one call.
    return { content: md, title };
  });
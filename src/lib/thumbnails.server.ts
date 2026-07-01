// Server-only helper — generates a personalized OG thumbnail per post
// via AI Gateway image generation and stores the PNG in the private
// `post-thumbnails` bucket. Served publicly through /api/thumb/$postId.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "post-thumbnails";

function isRTL(text: string): boolean {
  // Arabic + Hebrew Unicode ranges
  return /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}

function accentForShareId(shareId: string): string {
  const palette = [
    "deep navy blue",
    "burnt sienna orange",
    "forest green",
    "burgundy red",
    "warm ochre yellow",
    "dusty rose",
    "muted teal",
    "plum purple",
  ];
  let h = 0;
  for (const ch of shareId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

function buildPrompt(opts: { title: string; author: string | null; accent: string }): string {
  const { title, author, accent } = opts;
  const rtl = isRTL(title);
  const alignment = rtl ? "right-aligned, written in Arabic script" : "left-aligned, written in English";
  const byline = author ? `Small byline text underneath reading exactly: "by ${author}".` : "";
  return [
    `A refined editorial magazine cover thumbnail, 1200x630 wide-format landscape.`,
    `Warm off-white paper background with subtle grain texture.`,
    `A slim ${accent} accent bar or geometric flourish on one edge.`,
    `Large elegant serif typography, ${alignment}, showing this exact title verbatim with no changes, no extra words, no translation: "${title}".`,
    byline,
    `Minimal, sophisticated, no photos, no people, no logos, no icons, no watermarks.`,
    `Editorial layout with generous whitespace. Typography must be perfectly legible and correctly spelled.`,
  ].filter(Boolean).join(" ");
}

async function generatePngBytes(prompt: string): Promise<Uint8Array> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Image gen failed ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image gen returned no b64_json");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function ensurePostThumbnail(postId: string): Promise<void> {
  const { data: post, error } = await (supabaseAdmin.from("posts") as any)
    .select("id, title, share_id, is_public, user_id")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!post || !post.is_public) return;

  const { data: prof } = await (supabaseAdmin.from("profiles") as any)
    .select("display_name, username")
    .eq("user_id", post.user_id)
    .maybeSingle();
  const author = prof?.display_name || prof?.username || null;

  const accent = accentForShareId(post.share_id ?? post.id);
  const prompt = buildPrompt({ title: post.title, author, accent });
  const bytes = await generatePngBytes(prompt);

  const path = `${post.id}.png`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });
  if (upErr) throw new Error(upErr.message);

  const stamp = new Date().toISOString();
  await (supabaseAdmin.from("posts") as any).update({ thumbnail_url: stamp }).eq("id", post.id);
}

// Fire-and-forget wrapper. Never throws — logs and swallows errors so callers
// aren't blocked when thumbnail generation temporarily fails.
export function ensurePostThumbnailBackground(postId: string): void {
  ensurePostThumbnail(postId).catch((e) => {
    console.error("[thumbnails] failed for", postId, e);
  });
}
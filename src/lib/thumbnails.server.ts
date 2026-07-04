// Server-only helper — generates a personalized OG thumbnail per post
// via AI Gateway image generation and stores the PNG in the private
// `post-thumbnails` bucket. Served publicly through /api/thumb/$postId.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "post-thumbnails";

function styleForShareId(shareId: string): { artist: string; description: string } {
  const styles = [
    { artist: "Vincent van Gogh", description: "swirling, expressive post-impressionist brushstrokes with thick impasto, vibrant yellows, deep cobalt blues and cypress greens, dreamlike starry atmosphere" },
    { artist: "Claude Monet", description: "soft impressionist brushwork, dappled light, pastel lavenders, pinks and water-lily greens, hazy plein-air atmosphere" },
    { artist: "Katsushika Hokusai", description: "Japanese ukiyo-e woodblock print, bold flat outlines, indigo prussian blue waves, cream negative space, Edo-period elegance" },
    { artist: "Wassily Kandinsky", description: "abstract geometric composition, circles, triangles and musical lines, bold primary colors dancing on warm cream" },
    { artist: "Gustav Klimt", description: "art nouveau with luminous gold leaf patterns, ornate mosaic motifs, deep jewel tones, byzantine decorative richness" },
    { artist: "Henri Matisse", description: "bold Fauvist cut-paper shapes, joyful organic forms, saturated coral, viridian and ultramarine on off-white" },
    { artist: "Georgia O'Keeffe", description: "large-scale close-up organic abstraction, soft desert palette of bone white, dusty rose and sun-baked ochre, sensual curved forms" },
    { artist: "Salvador Dalí", description: "surrealist dreamscape, melting symbolic forms on a vast horizon, warm burnt sienna sky, meticulous painterly realism with impossible geometry" },
    { artist: "Paul Klee", description: "playful modernist grid of muted watercolor squares, childlike symbolic shapes, chalky pastel palette on textured paper" },
    { artist: "Hilma af Klint", description: "spiritual geometric abstraction, concentric circles and botanical diagrams, soft pastel palette with esoteric symbolism" },
    { artist: "J.M.W. Turner", description: "romantic atmospheric seascape, luminous golden mist dissolving into stormy blues, sublime painterly light" },
    { artist: "Hieronymus Bosch", description: "intricate medieval symbolic tableau, tiny surreal creatures and dreamlike landscapes, muted earthy palette" },
  ];
  let h = 0;
  for (const ch of shareId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return styles[h % styles.length];
}

function buildPrompt(opts: { title: string; author: string | null; style: { artist: string; description: string } }): string {
  const { title, style } = opts;
  return [
    `A metaphorical fine-art painting, 1200x630 wide-format landscape, rendered in the unmistakable style of ${style.artist}: ${style.description}.`,
    `The painting should visually evoke, as a poetic metaphor, the essence of an article titled: "${title}". Interpret the title symbolically through imagery, mood, and composition — do NOT render any text, letters, words, captions, titles, signatures or watermarks anywhere in the image.`,
    `Gallery-quality, richly textured brushwork, evocative and emotionally resonant, painterly composition with clear focal point.`,
    `Absolutely no typography, no writing, no logos, no borders — pure painted image only.`,
  ].join(" ");
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
  if (!post) return;

  const { data: prof } = await (supabaseAdmin.from("profiles") as any)
    .select("display_name, username")
    .eq("user_id", post.user_id)
    .maybeSingle();
  const author = prof?.display_name || prof?.username || null;

  const style = styleForShareId(post.share_id ?? post.id);
  const prompt = buildPrompt({ title: post.title, author, style });
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
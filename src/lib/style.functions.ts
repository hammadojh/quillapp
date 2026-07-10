import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, Output } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

export type StyleProfile = {
  voice: string;
  rhythm: string;
  dos: string[];
  donts: string[];
  structural_move: string;
  card: string; // ~150 word prose card injected into gen prompt
};

export const getStyleProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("profiles")
      .select("style_profile, style_completed_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      profile: (data?.style_profile ?? null) as StyleProfile | null,
      completed_at: (data?.style_completed_at ?? null) as string | null,
    };
  });

const SaveInput = z.object({
  writers: z.string().optional().default(""),
  voices: z.array(z.string()).optional().default([]),
  rhythm: z.string().optional().default(""),
  donts: z.string().optional().default(""),
  structural_move: z.string().optional().default(""),
  samples: z.string().optional().default(""),
});

const SYSTEM = `You distill a writer's raw self-description into a compact STYLE CARD used to guide future article drafts.

Rules:
- Output JSON only, matching the given schema.
- \`card\` is a single paragraph, ~120-160 words, second-person imperative addressed to a future writer-assistant ("Write in a warm, punchy voice. Favor short sentences… Avoid corporate hedging… Open with a story before the thesis.").
- Make it specific to the answers; do not invent traits that weren't mentioned.
- Language of \`card\` matches the language of the user's answers (Arabic or English).
- Keep dos/donts to 3-5 short bullets each.`;

export const saveStyleProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const prompt = `Writer's raw answers:

Writers they sound like / admire: ${data.writers || "(unspecified)"}
Voice descriptors they picked: ${data.voices.join(", ") || "(unspecified)"}
Sentence rhythm: ${data.rhythm || "(unspecified)"}
Things they never do: ${data.donts || "(unspecified)"}
Favorite structural move: ${data.structural_move || "(unspecified)"}
Sample sentences they're proud of:
${data.samples || "(none provided)"}

Distill this into a STYLE CARD.`;

    const gateway = createLovableAiGatewayProvider(key);
    let profile: StyleProfile;
    try {
      const { experimental_output } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system: SYSTEM,
        prompt,
        experimental_output: Output.object({
          schema: z.object({
            voice: z.string(),
            rhythm: z.string(),
            dos: z.array(z.string()),
            donts: z.array(z.string()),
            structural_move: z.string(),
            card: z.string(),
          }),
        }),
      });
      profile = experimental_output as StyleProfile;
    } catch {
      // Fallback: build a minimal card from the raw answers.
      profile = {
        voice: data.voices.join(", "),
        rhythm: data.rhythm,
        dos: [],
        donts: data.donts ? [data.donts] : [],
        structural_move: data.structural_move,
        card: `Voice: ${data.voices.join(", ") || "natural"}. Rhythm: ${data.rhythm || "mixed"}. Avoid: ${data.donts || "clichés"}. Prefer: ${data.structural_move || "clear structure"}.`,
      };
    }

    const { error } = await (context.supabase as any)
      .from("profiles")
      .update({ style_profile: profile, style_completed_at: new Date().toISOString() })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, profile };
  });
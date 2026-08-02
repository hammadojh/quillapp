import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateText } from "ai";

const sbp = (c: any) => c.from("user_styles") as any;

export const getMyStyle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await sbp(context.supabase)
      .select("style_profile, style_completed_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      style_profile: (data?.style_profile ?? null) as null | {
        summary: string;
        answers?: Record<string, string>;
        has_samples?: boolean;
      },
      style_completed_at: (data?.style_completed_at ?? null) as string | null,
    };
  });

const SaveInput = z.object({
  answers: z
    .object({
      tone: z.string().max(200).optional().default(""),
      audience: z.string().max(300).optional().default(""),
      quirks: z.string().max(400).optional().default(""),
      avoid: z.string().max(300).optional().default(""),
      formality: z.enum(["casual", "balanced", "formal"]).optional(),
    })
    .default({}),
  samples: z
    .array(z.object({ kind: z.enum(["text", "voice"]), content: z.string().min(20).max(20000) }))
    .max(6)
    .optional()
    .default([]),
  language: z.enum(["ar", "en"]).optional().default("ar"),
});

export const saveMyStyle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const answers = data.answers ?? {};
    const samples = data.samples ?? [];
    const langLabel = data.language === "en" ? "English" : "Arabic";

    const sampleText = samples
      .map((s, i) => `--- Sample ${i + 1} (${s.kind}) ---\n${s.content}`)
      .join("\n\n");

    const gateway = createLovableAiGatewayProvider(key);
    const prompt = `You are analyzing a writer's style to help future articles mimic their voice.

Return a concise STYLE GUIDE (max 220 words) written in ${langLabel}, covering:
- Voice & tone (1–2 lines)
- Sentence rhythm and paragraph length
- Vocabulary quirks, favorite phrases, or metaphors
- What they avoid (jargon, filler, clichés, etc.)
- Structural habits (how they open, use lists, close pieces)

Be specific and imitable. No preamble, no bullet titles in another language — output the guide only.

WRITER'S SELF-DESCRIPTION:
- Tone: ${answers.tone || "(not provided)"}
- Audience: ${answers.audience || "(not provided)"}
- Signature moves / quirks: ${answers.quirks || "(not provided)"}
- Avoids: ${answers.avoid || "(not provided)"}
- Formality: ${answers.formality || "(not provided)"}

WRITING SAMPLES:
${sampleText || "(none provided — infer from self-description only)"}`;

    let summary = "";
    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        prompt,
      });
      summary = text.trim().slice(0, 2000);
    } catch (e) {
      // Fall back to the raw answers if AI is unavailable
      summary =
        `Tone: ${answers.tone}\nAudience: ${answers.audience}\nQuirks: ${answers.quirks}\nAvoids: ${answers.avoid}\nFormality: ${answers.formality ?? ""}`.trim();
    }

    const style_profile = {
      summary,
      answers,
      has_samples: samples.length > 0,
      updated_at: new Date().toISOString(),
    };

    const { error } = await sbp(context.supabase)
      .upsert({ user_id: context.userId, style_profile, style_completed_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true, summary };
  });

export const dismissStyleWizard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Mark as "seen" without saving a style so the popup does not reappear.
    const { error } = await sbp(context.supabase)
      .upsert({ user_id: context.userId, style_completed_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearMyStyle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await sbp(context.supabase)
      .upsert({ user_id: context.userId, style_profile: null }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

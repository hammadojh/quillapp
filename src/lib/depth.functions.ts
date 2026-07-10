import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

export type DepthResult = {
  score: number; // 0-10
  gaps: string[]; // short bullets: what a critical reader would still ask
};

const SYSTEM = `You judge whether an interview transcript contains enough substance for a compelling long-form article.

Score 0-10:
- 0-3: mostly vague opinions, no examples, generic advice.
- 4-5: an idea and some framing, but few specifics.
- 6-7: a clear thesis with concrete examples/numbers/stories.
- 8-10: a contrarian or original take, backed by specifics and stakes.

"gaps" is a list of 2-4 short bullets (in the SAME language as the transcript) — the questions a critical reader would still want answered before believing the piece.
Respond in JSON only.`;

export const scoreDepth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DepthResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: post, error } = await (context.supabase as any)
      .from("posts")
      .select("interview_messages")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!post) throw new Error("Post not found");

    const transcript = ((post.interview_messages ?? []) as Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>)
      .map((m) => {
        const t = (m.parts ?? []).filter((p) => p.type === "text" && p.text).map((p) => p.text).join("");
        return `${m.role === "user" ? "EXPERT" : "INTERVIEWER"}: ${t}`;
      })
      .join("\n\n");

    if (!transcript.trim()) return { score: 0, gaps: [] };

    const gateway = createLovableAiGatewayProvider(key);
    let result: DepthResult = { score: 5, gaps: [] };
    try {
      const { experimental_output } = await generateText({
        model: gateway("google/gemini-3.1-flash-lite"),
        system: SYSTEM,
        prompt: `Transcript:\n\n${transcript}`,
        experimental_output: Output.object({
          schema: z.object({
            score: z.number(),
            gaps: z.array(z.string()),
          }),
        }),
      });
      result = experimental_output as DepthResult;
      result.score = Math.max(0, Math.min(10, Math.round(result.score)));
      result.gaps = result.gaps.slice(0, 4);
    } catch (e) {
      if (!NoObjectGeneratedError.isInstance(e)) throw e;
    }

    await (context.supabase as any)
      .from("posts")
      .update({ depth_score: result.score, depth_gaps: result.gaps })
      .eq("id", data.id);

    return result;
  });
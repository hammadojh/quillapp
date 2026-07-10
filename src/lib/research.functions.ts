import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

export type ResearchCard = {
  title: string;
  url: string;
  snippet: string;
  angle: string; // one-liner on how this relates to what the writer said
};

const QUERY_SYSTEM = `From an ongoing interview about a writer's topic, extract a single web-search query (5-10 words) that would surface related expert takes, prior art, or contrarian views. Return JSON: { "query": "...", "topic_language": "en" | "ar" }.`;

const ANGLE_SYSTEM = `Given a writer's latest thoughts and one web result, write ONE short sentence (max 18 words) in the writer's language describing how this source relates: "backs up your point about X", "counterpoint: someone argues Y", "an example you could steal", etc. Return JSON: { "angle": "..." }.`;

export const getResearchForTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ cards: ResearchCard[] }> => {
    const key = process.env.LOVABLE_API_KEY;
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!key || !firecrawlKey) return { cards: [] };

    const { data: post, error } = await (context.supabase as any)
      .from("posts")
      .select("interview_messages")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !post) return { cards: [] };

    const msgs = ((post.interview_messages ?? []) as Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>);
    const recent = msgs.slice(-6)
      .map((m) => {
        const t = (m.parts ?? []).filter((p) => p.type === "text" && p.text).map((p) => p.text).join("");
        return `${m.role === "user" ? "EXPERT" : "INTERVIEWER"}: ${t}`;
      })
      .join("\n");
    if (!recent.trim()) return { cards: [] };

    const gateway = createLovableAiGatewayProvider(key);

    // 1) query extraction
    let query = "";
    try {
      const { experimental_output } = await generateText({
        model: gateway("google/gemini-3.1-flash-lite"),
        system: QUERY_SYSTEM,
        prompt: recent,
        experimental_output: Output.object({
          schema: z.object({ query: z.string(), topic_language: z.string() }),
        }),
      });
      query = (experimental_output as { query: string }).query.trim();
    } catch (e) {
      if (!NoObjectGeneratedError.isInstance(e)) return { cards: [] };
    }
    if (!query) return { cards: [] };

    // 2) Firecrawl search (metadata only, no scrape)
    let results: Array<{ title?: string; url?: string; description?: string }> = [];
    try {
      const r = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firecrawlKey}`,
        },
        body: JSON.stringify({ query, limit: 3 }),
      });
      if (!r.ok) return { cards: [] };
      const body = (await r.json()) as { data?: { web?: Array<{ title?: string; url?: string; description?: string }> } | Array<{ title?: string; url?: string; description?: string }> };
      const raw = body.data;
      results = Array.isArray(raw)
        ? raw
        : (raw?.web ?? []);
    } catch {
      return { cards: [] };
    }
    if (results.length === 0) return { cards: [] };

    // 3) angles per result (fire in parallel, fall back to snippet if angle gen fails)
    const cards = await Promise.all(
      results.slice(0, 3).map(async (r): Promise<ResearchCard | null> => {
        if (!r.url || !r.title) return null;
        const snippet = (r.description ?? "").slice(0, 240);
        let angle = "";
        try {
          const { experimental_output } = await generateText({
            model: gateway("google/gemini-3.1-flash-lite"),
            system: ANGLE_SYSTEM,
            prompt: `Writer's recent thoughts:\n${recent}\n\nWeb result:\nTitle: ${r.title}\nSnippet: ${snippet}`,
            experimental_output: Output.object({ schema: z.object({ angle: z.string() }) }),
          });
          angle = (experimental_output as { angle: string }).angle;
        } catch { /* leave blank */ }
        return { title: r.title, url: r.url, snippet, angle };
      }),
    );
    return { cards: cards.filter((c): c is ResearchCard => c !== null) };
  });
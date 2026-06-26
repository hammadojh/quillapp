import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/speak")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { text, lang } = (await request.json()) as { text?: string; lang?: "ar" | "en" };
        const input = (text ?? "").trim();
        if (!input) return new Response("Missing text", { status: 400 });
        const trimmed = input.slice(0, 4000);

        const isArabic = lang === "ar" || /[\u0600-\u06FF]/.test(trimmed);
        const instructions = isArabic
          ? "Speak in clear, natural Modern Standard Arabic. Warm, conversational, like an editor interviewing a guest. Moderate pace."
          : "Speak in a warm, natural, conversational tone — like an editor interviewing a guest. Moderate pace, clear diction.";

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input: trimmed,
            voice: "alloy",
            response_format: "mp3",
            instructions,
          }),
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          return new Response(msg || "TTS failed", { status: res.status });
        }
        return new Response(res.body, {
          headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
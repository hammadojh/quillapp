import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const inForm = await request.formData();
        const file = inForm.get("file");
        if (!(file instanceof File) || file.size < 1024) {
          return new Response("Empty or missing audio", { status: 400 });
        }

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        const nameExt = (file.name.split(".").pop() ?? "").toLowerCase();
        const allowed = ["wav", "mp3", "m4a", "mp4", "webm", "ogg", "flac", "mpeg", "mpga"];
        const typeExt = file.type.includes("wav")
          ? "wav"
          : file.type.includes("mpeg") || file.type.includes("mp3")
            ? "mp3"
            : file.type.includes("m4a") || file.type.includes("aac") || file.type.includes("mp4")
              ? "m4a"
              : file.type.includes("ogg")
                ? "ogg"
                : file.type.includes("flac")
                  ? "flac"
                  : "webm";
        const ext = allowed.includes(nameExt) ? nameExt : typeExt;
        upstream.append("file", file, `recording.${ext}`);

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: upstream,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return new Response(text || "Transcription failed", { status: res.status });
        }
        const data = (await res.json()) as { text?: string };
        return Response.json({ text: data.text ?? "" });
      },
    },
  },
});
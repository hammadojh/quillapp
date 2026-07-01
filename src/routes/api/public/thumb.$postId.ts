import { createFileRoute } from "@tanstack/react-router";

async function serveDefaultPng(): Promise<Response> {
  try {
    // Read the bundled default from the public/ assets served by the same origin.
    const res = await fetch("https://quillapp.lovable.app/og-default.png", {
      cf: { cacheTtl: 3600 } as any,
    });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          // Short cache so a real thumb can replace it soon after generation.
          "Cache-Control": "public, max-age=300",
        },
      });
    }
  } catch { /* noop */ }
  return new Response("Not found", { status: 404 });
}

export const Route = createFileRoute("/api/public/thumb/$postId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = params.postId ?? "";
        // Accept "<uuid>" or "<uuid>.png"
        const postId = raw.replace(/\.png$/i, "");
        const uuid = /^[0-9a-f-]{36}$/i;
        if (!uuid.test(postId)) {
          return serveDefaultPng();
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.storage
            .from("post-thumbnails")
            .download(`${postId}.png`);
          if (error || !data) {
            // Kick off generation in the background so the next request serves the real thumbnail.
            try {
              const { ensurePostThumbnailBackground } = await import("@/lib/thumbnails.server");
              ensurePostThumbnailBackground(postId);
            } catch { /* noop */ }
            return serveDefaultPng();
          }
          const buf = await data.arrayBuffer();
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        } catch {
          return serveDefaultPng();
        }
      },
    },
  },
});
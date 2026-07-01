import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/thumb/$postId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = params.postId ?? "";
        // Accept "<uuid>" or "<uuid>.png"
        const postId = raw.replace(/\.png$/i, "");
        const uuid = /^[0-9a-f-]{36}$/i;
        if (!uuid.test(postId)) {
          return Response.redirect("https://quillapp.lovable.app/og-default.png", 302);
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
            return Response.redirect("https://quillapp.lovable.app/og-default.png", 302);
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
          return Response.redirect("https://quillapp.lovable.app/og-default.png", 302);
        }
      },
    },
  },
});
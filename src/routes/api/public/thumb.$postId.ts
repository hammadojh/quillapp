import { createFileRoute } from "@tanstack/react-router";

async function serveDefaultImage(): Promise<Response> {
  try {
    const res = await fetch("https://quillapp.lovable.app/og-default.png");
    if (res.ok) {
      const buf = await res.arrayBuffer();
      try {
        const { pngBytesToSocialJpeg, SOCIAL_IMAGE_HEADERS, toResponseArrayBuffer } = await import("@/lib/share-image.server");
        const jpg = pngBytesToSocialJpeg(buf, 82);
        return new Response(toResponseArrayBuffer(jpg), {
          status: 200,
          headers: {
            ...SOCIAL_IMAGE_HEADERS,
            "Content-Length": String(jpg.byteLength),
            "Cache-Control": "public, max-age=300",
          },
        });
      } catch (e) {
        console.error("[thumb] jpeg convert failed (default):", e);
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Content-Length": String(buf.byteLength),
            "Cache-Control": "public, max-age=300",
          },
        });
      }
    }
  } catch { /* noop */ }
  return new Response("Not found", { status: 404 });
}

export const Route = createFileRoute("/api/public/thumb/$postId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = params.postId ?? "";
        // Accept "<uuid>", "<uuid>.jpg", or the old "<uuid>.png" URLs.
        const postId = raw.replace(/\.(?:png|jpe?g)$/i, "");
        const uuid = /^[0-9a-f-]{36}$/i;
        if (!uuid.test(postId)) {
          return serveDefaultImage();
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
            return serveDefaultImage();
          }
          const buf = await data.arrayBuffer();
          try {
            const { pngBytesToSocialJpeg, SOCIAL_IMAGE_HEADERS, toResponseArrayBuffer } = await import("@/lib/share-image.server");
            const jpg = pngBytesToSocialJpeg(buf, 82);
            return new Response(toResponseArrayBuffer(jpg), {
              status: 200,
              headers: {
                ...SOCIAL_IMAGE_HEADERS,
                "Content-Length": String(jpg.byteLength),
                "Cache-Control": "public, max-age=31536000, immutable",
              },
            });
          } catch (e) {
            console.error("[thumb] jpeg convert failed:", e);
            return new Response(buf, {
              status: 200,
              headers: {
                "Content-Type": "image/png",
                "Content-Length": String(buf.byteLength),
                "Cache-Control": "public, max-age=31536000, immutable",
              },
            });
          }
        } catch (e) {
          console.error("[thumb] fetch failed:", e);
          return serveDefaultImage();
        }
      },
    },
  },
});
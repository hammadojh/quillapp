import { createFileRoute } from "@tanstack/react-router";
import { publicSupabase } from "@/lib/public-client.server";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
// Vite emits the wasm asset and gives us a URL; we fetch it once per worker isolate.
import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const res = await fetch(resvgWasmUrl);
      if (!res.ok) throw new Error(`wasm fetch ${res.status}`);
      await initWasm(res);
    })();
  }
  return wasmReady;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Crude wrap by character budget; works for both LTR and RTL.
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const tentative = cur ? cur + " " + w : w;
    if (tentative.length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    } else {
      cur = tentative;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (last.length > maxChars - 1) lines[maxLines - 1] = last.slice(0, maxChars - 1) + "…";
  }
  return lines;
}

// Deterministic accent color derived from author/title so each card feels unique.
function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return "Q";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function renderSvg(opts: { title: string; author: string; hue: number; isRtl: boolean }): string {
  const { title, author, hue, isRtl } = opts;
  const W = 1200;
  const H = 630;
  const titleLines = wrap(title, 28, 4);
  const lineHeight = 86;
  const titleStartY = 230;
  const accent = `hsl(${hue}, 45%, 38%)`;
  const accentSoft = `hsl(${hue}, 60%, 92%)`;
  const ink = "#1a1a1a";
  const paper = "#faf7f1";
  const anchor = isRtl ? "end" : "start";
  const x = isRtl ? W - 80 : 80;
  const monoInitials = initials(author || "Quill");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${paper}"/>
      <stop offset="100%" stop-color="${accentSoft}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="8" fill="${accent}"/>

  <g font-family="Georgia, 'Times New Roman', serif" fill="${ink}">
    <text x="${x}" y="120" font-size="28" font-weight="400" fill="${accent}" text-anchor="${anchor}" letter-spacing="6">
      QUILL
    </text>
    ${titleLines
      .map(
        (line, i) =>
          `<text x="${x}" y="${titleStartY + i * lineHeight}" font-size="72" font-weight="600" text-anchor="${anchor}">${esc(line)}</text>`,
      )
      .join("\n    ")}
  </g>

  <g transform="translate(${isRtl ? W - 80 - 60 : 80}, ${H - 100})">
    <circle cx="30" cy="0" r="30" fill="${accent}"/>
    <text x="30" y="10" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="600" fill="#ffffff" text-anchor="middle">${esc(monoInitials)}</text>
  </g>
  <text x="${isRtl ? W - 80 - 80 : 160}" y="${H - 92}" font-family="Inter, system-ui, sans-serif" font-size="26" font-weight="600" fill="${ink}" text-anchor="${anchor}">${esc(author || "Quill writer")}</text>
  <text x="${isRtl ? W - 80 - 80 : 160}" y="${H - 60}" font-family="Inter, system-ui, sans-serif" font-size="20" fill="${ink}" opacity="0.6" text-anchor="${anchor}">quillapp.lovable.app</text>
</svg>`;
}

export const Route = createFileRoute("/api/og/$shareId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { data: post } = await publicSupabase()
          .from("posts" as any)
          .select("title, user_id")
          .eq("share_id", params.shareId)
          .eq("is_public", true)
          .maybeSingle();

        let title = "An article worth sharing";
        let author = "";
        if (post) {
          title = (post as any).title || title;
          const { data: prof } = await publicSupabase()
            .from("profiles" as any)
            .select("display_name, username")
            .eq("user_id", (post as any).user_id)
            .maybeSingle();
          author = (prof as any)?.display_name || (prof as any)?.username || "";
        }

        // Detect RTL by presence of Arabic / Hebrew code points in title.
        const isRtl = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/.test(title);
        const hue = hashHue((author || "") + "|" + title);
        const svg = renderSvg({ title, author, hue, isRtl });

        try {
          await ensureWasm();
          const png = new Resvg(svg, {
            fitTo: { mode: "width", value: 1200 },
            font: { loadSystemFonts: false },
          })
            .render()
            .asPng();
          return new Response(png, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=300, s-maxage=3600",
            },
          });
        } catch {
          // Fallback to SVG so the route never 500s.
          return new Response(svg, {
            headers: {
              "Content-Type": "image/svg+xml; charset=utf-8",
              "Cache-Control": "public, max-age=60",
            },
          });
        }
      },
    },
  },
});
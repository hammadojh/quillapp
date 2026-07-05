import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAnon } from "../supabase";

export default defineTool({
  name: "list_public_feed",
  title: "List public feed",
  description:
    "Browse recently published articles from the public Quill feed. Does not require authentication for content but the MCP server requires a signed-in session.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Max posts (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ limit }) => {
    const sb = supabaseAnon();
    const { data, error } = await sb
      .from("posts")
      .select("id, share_id, title, likes_count, comments_count, updated_at, user_id")
      .eq("is_public", true)
      .eq("in_feed", true)
      .order("updated_at", { ascending: false })
      .limit(limit ?? 20);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { posts: data ?? [] },
    };
  },
});
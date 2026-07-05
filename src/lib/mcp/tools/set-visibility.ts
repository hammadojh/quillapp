import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "set_post_visibility",
  title: "Publish or unpublish post",
  description:
    "Publish (make public) or unpublish one of the signed-in user's posts. Unpublishing also removes it from the public feed.",
  inputSchema: {
    id: z.string().uuid().describe("The post's UUID."),
    is_public: z.boolean().describe("true to publish, false to unpublish."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ id, is_public }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const patch: Record<string, unknown> = { is_public };
    if (!is_public) patch.in_feed = false;
    const sb = supabaseForUser(ctx);
    const { error } = await sb.from("posts").update(patch).eq("id", id);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: is_public ? "Post is now public" : "Post is now private" }],
      structuredContent: { ok: true },
    };
  },
});
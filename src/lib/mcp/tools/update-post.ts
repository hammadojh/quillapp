import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_post",
  title: "Update post",
  description:
    "Update the title and/or markdown content of one of the signed-in user's posts.",
  inputSchema: {
    id: z.string().uuid().describe("The post's UUID."),
    title: z.string().optional().describe("New title."),
    content: z.string().optional().describe("New markdown body."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ id, title, content }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    if (title === undefined && content === undefined) {
      return { content: [{ type: "text", text: "Provide title and/or content" }], isError: true };
    }
    const patch: Record<string, unknown> = {};
    if (title !== undefined) patch.title = title;
    if (content !== undefined) patch.content = content;
    const sb = supabaseForUser(ctx);
    const { error } = await sb.from("posts").update(patch).eq("id", id);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: "Post updated" }], structuredContent: { ok: true } };
  },
});
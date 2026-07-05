import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMyPostsTool from "./tools/list-my-posts";
import getPostTool from "./tools/get-post";
import createDraftTool from "./tools/create-draft";
import updatePostTool from "./tools/update-post";
import setVisibilityTool from "./tools/set-visibility";
import listPublicFeedTool from "./tools/list-public-feed";

// See app-mcp-server-authoring: use the direct Supabase host as the OAuth
// issuer. Read the project ref from VITE_SUPABASE_PROJECT_ID (inlined by Vite).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "quill-mcp",
  title: "Quill",
  version: "0.1.0",
  instructions:
    "Tools for Quill — a blog-post writing app. Read and manage the signed-in user's drafts, publish or unpublish posts, and browse the public feed.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listMyPostsTool,
    getPostTool,
    createDraftTool,
    updatePostTool,
    setVisibilityTool,
    listPublicFeedTool,
  ],
});
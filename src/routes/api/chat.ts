import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

const SYSTEM = `You are an editorial interviewer helping a domain expert turn their knowledge into a great long-form blog post.

Your job: ask thoughtful, focused questions ONE AT A TIME until you have enough to write a strong 700–1100 word article.

Cover these in any natural order based on their answers:
1. The specific topic or idea they want to teach
2. Who the reader is and what they currently get wrong about it
3. Their unique insight or contrarian take (the thing only they would say)
4. 2–3 concrete examples, stories, numbers, or analogies
5. The single takeaway / call to action
6. Tone (authoritative, friendly, punchy, etc.)

Rules:
- Open with a warm one-sentence greeting and ask what they want to write about.
- Ask ONE question per turn. Keep questions short (≤2 sentences).
- Probe for specifics: "Can you give me a real example?" beats "Tell me more."
- Acknowledge briefly before each new question ("Love that — ...").
- When you have enough (usually 5–8 exchanges), say exactly: "I have what I need. Click **Generate post** above whenever you're ready." Then stop asking questions.
- Never write the article yourself. Your job is only the interview.`;

type ChatRequestBody = { messages?: unknown };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: SYSTEM,
          messages: await convertToModelMessages(messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
        });
      },
    },
  },
});
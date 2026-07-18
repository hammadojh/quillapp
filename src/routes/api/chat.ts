import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

function buildSystem(uiLang: "ar" | "en", styleSummary?: string) {
  const isAr = uiLang === "ar";
  const langLine = isAr
    ? "Default conversation language: Arabic. Conduct the entire interview in clear, natural Modern Standard Arabic unless the expert switches to English."
    : "Default conversation language: English. Conduct the interview in English unless the expert switches to Arabic.";
  const finalAsk = isAr
    ? 'When you have enough material, ask ONE question (in the conversation language): "هل تريد المقال بالعربية أم بالإنجليزية؟" Wait for the answer. Then ask: "وما الطول المفضّل؟ قصير (~300 كلمة)، متوسط (~600 كلمة)، أم طويل (~1000 كلمة)؟" Wait. Then ask: "هل تريد توليد المقال الآن، أم لديك المزيد لإضافته؟" Wait.'
    : 'When you have enough material, ask ONE question: "Do you want the final article in Arabic or English?" Wait for the answer. Then ask: "And what length — short (~300 words), medium (~600 words), or long (~1000 words)?" Wait. Then ask: "Want me to generate the article now, or do you have more to add?" Wait.';
  const doneLine = isAr
    ? 'If they want more, continue interviewing. If they confirm they are ready to generate, reply with EXACTLY this single line and nothing else: [[GENERATE]]'
    : 'If they want to add more, continue interviewing. If they confirm they are ready to generate, reply with EXACTLY this single line and nothing else: [[GENERATE]]';

  const styleBlock = styleSummary
    ? `\n\nWRITER_STYLE_GUIDE (the expert's own voice — mirror this in how you phrase questions and reflect their words back; the future article will be written in this voice):\n${styleSummary}\n`
    : "";
  return `You are an editorial interviewer helping a domain expert turn their knowledge into a great long-form blog post.

${langLine}${styleBlock}

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
- Probe for specifics rather than vague follow-ups.
- Acknowledge briefly before each new question.
- After ~5–7 substantive exchanges, ${finalAsk}
- ${doneLine}
- Never write the article yourself. Your job is only the interview.`;
}

type ChatRequestBody = { messages?: unknown; language?: unknown; style?: unknown };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, language, style } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const uiLang = language === "en" ? "en" : "ar";
        const styleSummary =
          typeof style === "string" && style.trim().length > 0 ? style.slice(0, 2000) : undefined;
        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: buildSystem(uiLang, styleSummary),
          messages: await convertToModelMessages(messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
        });
      },
    },
  },
});
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getPost, updatePost, generateBlogPost, deletePost } from "@/lib/posts.functions";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Sparkles, Copy, RefreshCw, Trash2, Send } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/post/$postId")({
  head: () => ({ meta: [{ title: "Post — Quill" }] }),
  component: PostPage,
});

function PostPage() {
  const { postId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getPost);
  const updateFn = useServerFn(updatePost);
  const generateFn = useServerFn(generateBlogPost);
  const deleteFn = useServerFn(deletePost);

  const { data: post, isLoading } = useQuery({
    queryKey: ["post", postId],
    queryFn: () => getFn({ data: { id: postId } }),
  });

  if (isLoading || !post) {
    return (
      <div className="min-h-screen bg-paper p-10 text-ink/50">Loading…</div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-ink/10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm text-ink/60 hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Your posts
          </Link>
          <button
            onClick={async () => {
              if (!confirm("Delete this post?")) return;
              await deleteFn({ data: { id: postId } });
              qc.invalidateQueries({ queryKey: ["posts"] });
              navigate({ to: "/dashboard" });
            }}
            className="flex items-center gap-2 text-sm text-ink/50 hover:text-ink"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </header>

      {post.status === "generated" ? (
        <GeneratedView
          post={post}
          onUpdated={() => qc.invalidateQueries({ queryKey: ["post", postId] })}
          updateFn={updateFn}
          generateFn={generateFn}
        />
      ) : (
        <InterviewView
          postId={postId}
          initialMessages={(post.interview_messages as UIMessage[]) ?? []}
          updateFn={updateFn}
          generateFn={generateFn}
          onGenerated={() => qc.invalidateQueries({ queryKey: ["post", postId] })}
        />
      )}
    </div>
  );
}

function InterviewView({
  postId,
  initialMessages,
  updateFn,
  generateFn,
  onGenerated,
}: {
  postId: string;
  initialMessages: UIMessage[];
  updateFn: ReturnType<typeof useServerFn<typeof updatePost>>;
  generateFn: ReturnType<typeof useServerFn<typeof generateBlogPost>>;
  onGenerated: () => void;
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: async (input, init) => {
          const { data } = await supabase.auth.getSession();
          const headers = new Headers(init?.headers);
          if (data.session?.access_token) {
            headers.set("Authorization", `Bearer ${data.session.access_token}`);
          }
          return fetch(input, { ...init, headers });
        },
      }),
    [],
  );

  const { messages, sendMessage, status } = useChat({
    id: postId,
    messages: initialMessages,
    transport,
    onFinish: () => {
      // persisted via effect below
    },
    onError: (e) => toast.error(e.message || "Chat error"),
  });

  // Seed an opening question if empty
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (messages.length === 0 && status === "ready") {
      seededRef.current = true;
      sendMessage({ text: "Let's begin." });
    }
  }, [messages.length, status, sendMessage]);

  // Persist messages whenever they change after a turn
  useEffect(() => {
    if (status !== "ready" || messages.length === 0) return;
    updateFn({
      data: { id: postId, interview_messages: messages as unknown as Array<unknown> },
    }).catch(() => {});
  }, [messages, status, postId, updateFn]);

  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || status === "submitted" || status === "streaming") return;
    setInput("");
    await sendMessage({ text });
  };

  const generate = async () => {
    setGenerating(true);
    try {
      await generateFn({ data: { id: postId } });
      toast.success("Your post is ready");
      onGenerated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate");
    } finally {
      setGenerating(false);
    }
  };

  const exchangeCount = messages.filter((m) => m.role === "user").length;
  const canGenerate = exchangeCount >= 3;

  return (
    <div className="mx-auto flex h-[calc(100vh-65px)] max-w-3xl flex-col px-6">
      <div className="flex items-center justify-between border-b border-ink/10 py-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-ink/40">Interview</p>
          <h1 className="font-serif text-2xl">Tell me about your topic</h1>
        </div>
        <button
          onClick={generate}
          disabled={!canGenerate || generating}
          className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          <Sparkles className="h-4 w-4" />
          {generating ? "Writing…" : "Generate post"}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto py-6">
        {messages.length === 0 && (
          <p className="text-center font-serif text-xl italic text-ink/40">
            Tell me what you want to teach the world today.
          </p>
        )}
        {messages.map((m) => {
          const text = m.parts
            .map((p) => (p.type === "text" ? p.text : ""))
            .join("");
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-4 py-3 text-paper">
                  {text}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="max-w-[90%]">
              <div className="text-xs uppercase tracking-widest text-accent/80">Quill</div>
              <div className="mt-1 whitespace-pre-wrap font-serif text-lg leading-relaxed">{text}</div>
            </div>
          );
        })}
        {(status === "submitted" || status === "streaming") && messages.at(-1)?.role === "user" && (
          <div className="font-serif italic text-ink/40">Thinking…</div>
        )}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-ink/10 py-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(e as unknown as React.FormEvent);
            }
          }}
          rows={2}
          placeholder="Type your answer…"
          className="flex-1 resize-none rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink placeholder-ink/40 focus:border-accent focus:outline-none"
          autoFocus
        />
        <button
          type="submit"
          disabled={!input.trim() || status === "submitted" || status === "streaming"}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function GeneratedView({
  post,
  onUpdated,
  updateFn,
  generateFn,
}: {
  post: { id: string; title: string; content: string };
  onUpdated: () => void;
  updateFn: ReturnType<typeof useServerFn<typeof updatePost>>;
  generateFn: ReturnType<typeof useServerFn<typeof generateBlogPost>>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [tweak, setTweak] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTitle(post.title);
    setContent(post.content);
  }, [post.title, post.content]);

  const save = async () => {
    setBusy(true);
    try {
      await updateFn({ data: { id: post.id, title, content } });
      toast.success("Saved");
      setEditing(false);
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(`# ${title}\n\n${content.replace(/^#\s+.+\n+/, "")}`);
    toast.success("Copied as markdown");
  };

  const regenerate = async () => {
    if (!tweak.trim()) return;
    setBusy(true);
    try {
      await generateFn({ data: { id: post.id, tweak } });
      toast.success("Rewritten");
      setTweak("");
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not regenerate");
    } finally {
      setBusy(false);
    }
  };

  // strip the leading "# Title" since we render title separately
  const body = content.replace(/^#\s+.+\n+/, "");

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button onClick={copy} className="flex items-center gap-2 rounded-full border border-ink/20 px-4 py-2 text-sm hover:bg-ink/5">
          <Copy className="h-4 w-4" /> Copy markdown
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-full border border-ink/20 px-4 py-2 text-sm hover:bg-ink/5"
        >
          {editing ? "Preview" : "Edit"}
        </button>
        {editing && (
          <button
            onClick={save}
            disabled={busy}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50"
          >
            Save changes
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border-0 border-b border-ink/10 bg-transparent pb-3 font-serif text-4xl tracking-tight focus:outline-none focus:ring-0"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={28}
            className="w-full resize-y rounded-lg border border-ink/15 bg-white p-4 font-mono text-sm leading-relaxed focus:border-accent focus:outline-none"
          />
        </div>
      ) : (
        <article className="prose prose-quill max-w-none">
          <h1 className="!font-serif !text-5xl !leading-tight">{title}</h1>
          <ReactMarkdown>{body}</ReactMarkdown>
        </article>
      )}

      <div className="mt-12 rounded-2xl border border-ink/10 bg-white p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <RefreshCw className="h-4 w-4 text-accent" /> Tweak the draft
        </div>
        <p className="mt-1 text-sm text-ink/60">e.g. "make it punchier", "add a stronger intro", "cut to 500 words".</p>
        <div className="mt-3 flex gap-2">
          <input
            value={tweak}
            onChange={(e) => setTweak(e.target.value)}
            placeholder="Your feedback…"
            className="flex-1 rounded-md border border-ink/15 bg-paper px-3 py-2 focus:border-accent focus:outline-none"
          />
          <button
            onClick={regenerate}
            disabled={!tweak.trim() || busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Rewriting…" : "Rewrite"}
          </button>
        </div>
      </div>
    </main>
  );
}
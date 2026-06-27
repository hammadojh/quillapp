import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Heart, MessageCircle, Twitter, Linkedin, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getPublicPostByShareId,
  listComments,
  toggleLike,
  addComment,
  getLikeState,
  deleteComment,
} from "@/lib/social.functions";
import { supabase } from "@/integrations/supabase/client";
import { useT, LangToggle } from "@/lib/i18n";

function buildExcerpt(content: string, n = 180): string {
  const stripped = (content ?? "")
    .replace(/^#\s+.*$/m, "")
    .replace(/^>.*$/gm, "")
    .replace(/[#*_`>]/g, "")
    .trim();
  const flat = stripped.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n).trim() + "…" : flat;
}

export const Route = createFileRoute("/p/$shareId")({
  loader: async ({ params }) => {
    const post = await getPublicPostByShareId({ data: { shareId: params.shareId } });
    if (!post) return { post: null as null };
    return {
      post: {
        title: post.title,
        excerpt: buildExcerpt(post.content),
        author:
          post.author?.display_name || post.author?.username || null,
      },
    };
  },
  head: ({ params, loaderData }) => {
    const url = `https://quillapp.lovable.app/p/${params.shareId}`;
    if (!loaderData?.post) {
      return {
        meta: [{ title: "Read — Quill" }],
        links: [{ rel: "canonical", href: url }],
      };
    }
    const { title, excerpt, author } = loaderData.post;
    const fullTitle = author ? `${title} — ${author}` : title;
    return {
      meta: [
        { title: fullTitle },
        { name: "description", content: excerpt },
        { property: "og:title", content: fullTitle },
        { property: "og:description", content: excerpt },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: fullTitle },
        { name: "twitter:description", content: excerpt },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: PublicPostPage,
});

function PublicPostPage() {
  const { t, lang } = useT();
  const { shareId } = Route.useParams();
  const getFn = useServerFn(getPublicPostByShareId);
  const { data: post, isLoading } = useQuery({
    queryKey: ["public-post", shareId],
    queryFn: () => getFn({ data: { shareId } }),
  });

  if (isLoading) return <div className="min-h-screen bg-paper p-10 text-ink/50">…</div>;
  if (!post) {
    return (
      <div className="min-h-screen bg-paper">
        <Topbar />
        <main className="mx-auto max-w-2xl px-4 py-20 text-center">
          <p className="font-serif text-2xl text-ink">{t("public.notfound")}</p>
          <Link to="/" className="mt-6 inline-block rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper">
            {t("brand")}
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Topbar />
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 sm:px-6">
        <div className="mb-6 text-sm text-ink/60">
          {t("public.by")}{" "}
          {post.author?.username ? (
            <Link
              to="/u/$username"
              params={{ username: post.author.username }}
              className="font-medium text-brand hover:underline"
            >
              {post.author.display_name || post.author.username}
            </Link>
          ) : (
            <span>—</span>
          )}
        </div>

        <article className="prose-quill">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
        </article>

        <ShareRow shareId={shareId} title={post.title} />
        <LikeRow postId={post.id} initialCount={post.likes_count} />
        <Comments postId={post.id} initialCount={post.comments_count} />
        <JoinCTA />
      </main>
    </div>
  );
}

function Topbar() {
  const { t } = useT();
  return (
    <header className="border-b border-ink/10">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-serif text-xl font-semibold">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("brand")}
        </Link>
        <LangToggle />
      </div>
    </header>
  );
}

function JoinCTA() {
  const { t } = useT();
  return (
    <section className="mt-16 rounded-2xl border border-ink/10 bg-white p-6 text-center sm:p-10">
      <h3 className="font-serif text-2xl text-ink sm:text-3xl">{t("public.cta.title")}</h3>
      <p className="mx-auto mt-3 max-w-md text-sm text-ink/70 sm:text-base">{t("public.cta.body")}</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-full bg-brand px-6 py-3 text-sm font-medium text-white hover:opacity-90"
      >
        {t("public.cta.button")}
      </Link>
    </section>
  );
}

function TopbarOld() {
  return null;
}

function ShareRow({ shareId, title }: { shareId: string; title: string }) {
  const { t } = useT();
  const url = typeof window !== "undefined" ? `${window.location.origin}/p/${shareId}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("post.share.copied"));
    } catch { /* noop */ }
  };
  const x = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
  const li = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  return (
    <div className="mt-10 flex flex-wrap items-center gap-2 rounded-xl border border-ink/10 bg-white p-3">
      <button onClick={copy} className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-90">
        {t("post.share.copy")}
      </button>
      <a href={x} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-2 text-xs text-ink/80 hover:bg-ink/5">
        <Twitter className="h-4 w-4" /> X
      </a>
      <a href={li} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-2 text-xs text-ink/80 hover:bg-ink/5">
        <Linkedin className="h-4 w-4" /> LinkedIn
      </a>
    </div>
  );
}

function useAuthed() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => setAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return authed;
}

function LikeRow({ postId, initialCount }: { postId: string; initialCount: number }) {
  const { t } = useT();
  const authed = useAuthed();
  const navigate = useNavigate();
  const getLikeFn = useServerFn(getLikeState);
  const toggleFn = useServerFn(toggleLike);
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (!authed) { setLiked(false); return; }
    getLikeFn({ data: { postId } }).then((r) => setLiked(r.liked)).catch(() => {});
  }, [authed, postId, getLikeFn]);

  const onClick = async () => {
    if (!authed) {
      sessionStorage.setItem("quill.afterAuth", window.location.pathname);
      navigate({ to: "/auth" });
      return;
    }
    const prevLiked = liked;
    setLiked(!prevLiked);
    setCount((c) => c + (prevLiked ? -1 : 1));
    try {
      const r = await toggleFn({ data: { postId } });
      setLiked(r.liked);
    } catch {
      setLiked(prevLiked);
      setCount((c) => c + (prevLiked ? 1 : -1));
    }
  };

  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        onClick={onClick}
        className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
          liked
            ? "border-brand bg-brand text-white"
            : "border-ink/20 bg-white text-ink hover:bg-ink/5"
        }`}
      >
        <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} /> {count}
      </button>
      {!authed && <span className="text-xs text-ink/50">{t("public.signin.like")}</span>}
    </div>
  );
}

function Comments({ postId }: { postId: string; initialCount: number }) {
  const { t, lang } = useT();
  const authed = useAuthed();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listComments);
  const addFn = useServerFn(addComment);
  const delFn = useServerFn(deleteComment);
  const [text, setText] = useState("");
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMe(data.session?.user.id ?? null));
  }, []);

  const { data: comments } = useQuery({
    queryKey: ["comments", postId],
    queryFn: () => listFn({ data: { postId } }),
  });

  const add = useMutation({
    mutationFn: (content: string) => addFn({ data: { postId, content } }),
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: ["comments", postId] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", postId] }),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    if (!authed) {
      sessionStorage.setItem("quill.afterAuth", window.location.pathname);
      sessionStorage.setItem("quill.pendingComment", JSON.stringify({ postId, content: clean }));
      navigate({ to: "/auth" });
      return;
    }
    add.mutate(clean);
  };

  return (
    <section className="mt-12">
      <h2 className="font-serif text-xl">{t("public.comments.title")}</h2>
      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 rounded-xl border border-ink/15 bg-white p-3 focus-within:border-brand/50">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={authed ? t("public.comments.placeholder") : t("public.signin.comment")}
          rows={2}
          className="w-full resize-none bg-transparent px-2 py-1 text-sm focus:outline-none"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!text.trim() || add.isPending}
            className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
          >
            {t("public.comments.post")}
          </button>
        </div>
      </form>

      <ul className="mt-6 space-y-4">
        {(comments ?? []).length === 0 && (
          <li className="text-sm text-ink/50">{t("public.comments.empty")}</li>
        )}
        {(comments ?? []).map((c: any) => (
          <li key={c.id} className="rounded-lg border border-ink/10 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs text-ink/60">
                {c.author?.username ? (
                  <Link to="/u/$username" params={{ username: c.author.username }} className="font-medium text-brand hover:underline">
                    {c.author.display_name || c.author.username}
                  </Link>
                ) : "—"}
                <span className="mx-2">·</span>
                <span>{new Date(c.created_at).toLocaleDateString(lang === "ar" ? "ar" : "en")}</span>
              </div>
              {me === c.user_id && (
                <button onClick={() => remove.mutate(c.id)} className="text-xs text-ink/40 hover:text-destructive">
                  ×
                </button>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink/90">{c.content}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
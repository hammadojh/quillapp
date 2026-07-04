import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Heart, MessageCircle, Eye, Share2, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getPublicPostByShareId,
  listComments,
  toggleLike,
  addComment,
  getLikeState,
  deleteComment,
  incrementPostView,
} from "@/lib/social.functions";
import { supabase } from "@/integrations/supabase/client";
import { useT, LangToggle } from "@/lib/i18n";
import { thumbUrl } from "@/lib/thumb-url";

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
        id: post.id,
        title: post.title,
        excerpt: buildExcerpt(post.content),
        author:
          post.author?.display_name || post.author?.username || null,
        thumbStamp: (post as any).thumbnail_url ?? null,
        updatedAt: post.updated_at,
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
    const { id, title, excerpt, author, thumbStamp, updatedAt } = loaderData.post;
    const imageStamp = thumbStamp || updatedAt;
    const ogImage = `https://quillapp.lovable.app/api/public/thumb/${id}.jpg?v=${encodeURIComponent(imageStamp)}`;
    const fullTitle = author ? `${title} — ${author}` : title;
    return {
      meta: [
        { title: fullTitle },
        { name: "description", content: excerpt },
        { property: "og:title", content: fullTitle },
        { property: "og:description", content: excerpt },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { property: "og:image", content: ogImage },
        { property: "og:image:type", content: "image/jpeg" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: fullTitle },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: ogImage },
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
  const bumpFn = useServerFn(incrementPostView);
  const { data: post, isLoading } = useQuery({
    queryKey: ["public-post", shareId],
    queryFn: () => getFn({ data: { shareId } }),
  });

  useEffect(() => {
    if (!post?.id) return;
    bumpFn({ data: { postId: post.id } }).catch(() => {});
  }, [post?.id, bumpFn]);

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
        {(post as any).thumbnail_url && (
          <img
            src={thumbUrl(post.id, (post as any).thumbnail_url)}
            alt=""
            className="mb-8 aspect-[1200/630] w-full rounded-xl object-cover ring-1 ring-ink/10"
          />
        )}
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

        <p className="mt-10 text-center text-xs text-ink/40 italic">
          {t("public.disclaimer")}
        </p>
        <EngagementBar
          shareId={shareId}
          title={post.title}
          postId={post.id}
          initialLikes={post.likes_count}
          viewsCount={(post as any).views_count ?? 0}
          commentsCount={post.comments_count}
        />
        <Comments postId={post.id} initialCount={post.comments_count} />
        <JoinCTA />
      </main>
      <FloatingActions
        shareId={shareId}
        title={post.title}
        postId={post.id}
        initialLikes={post.likes_count}
        commentsCount={post.comments_count}
      />
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

function EngagementBar({
  shareId,
  title,
  postId,
  initialLikes,
  viewsCount,
  commentsCount,
}: {
  shareId: string;
  title: string;
  postId: string;
  initialLikes: number;
  viewsCount: number;
  commentsCount: number;
}) {
  const { t } = useT();
  const authed = useAuthed();
  const navigate = useNavigate();
  const getLikeFn = useServerFn(getLikeState);
  const toggleFn = useServerFn(toggleLike);
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (!authed) { setLiked(false); return; }
    getLikeFn({ data: { postId } }).then((r) => setLiked(r.liked)).catch(() => {});
  }, [authed, postId, getLikeFn]);

  const url = typeof window !== "undefined" ? `${window.location.origin}/p/${shareId}` : "";
  const onShare = async () => {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, url });
        return;
      } catch { /* user cancelled */ return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("post.share.copied"));
    } catch { /* noop */ }
  };

  const onLike = async () => {
    if (!authed) {
      sessionStorage.setItem("quill.afterAuth", window.location.pathname);
      navigate({ to: "/auth" });
      return;
    }
    const prev = liked;
    setLiked(!prev);
    setLikes((c) => c + (prev ? -1 : 1));
    try {
      const r = await toggleFn({ data: { postId } });
      setLiked(r.liked);
    } catch {
      setLiked(prev);
      setLikes((c) => c + (prev ? 1 : -1));
    }
  };

  const onComment = () => {
    const el = document.getElementById("comments");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    const ta = document.getElementById("comment-input") as HTMLTextAreaElement | null;
    setTimeout(() => ta?.focus(), 350);
  };

  return (
    <div id="engagement-bar" className="mt-10">
      <button
        onClick={onShare}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper hover:opacity-90"
      >
        <Share2 className="h-4 w-4" />
        {t("public.share")}
      </button>

      <div className="mt-5 flex items-center justify-around">
        <button
          onClick={onLike}
          className={`flex flex-col items-center gap-1 text-xs transition ${liked ? "text-brand" : "text-ink/60 hover:text-ink"}`}
          aria-label="Like"
        >
          <Heart className={`h-6 w-6 ${liked ? "fill-current" : ""}`} />
          <span className="tabular-nums">{likes}</span>
        </button>
        <button
          onClick={onComment}
          className="flex flex-col items-center gap-1 text-xs text-ink/60 transition hover:text-ink"
          aria-label="Comment"
        >
          <MessageCircle className="h-6 w-6" />
          <span className="tabular-nums">{commentsCount}</span>
        </button>
        <div className="flex flex-col items-center gap-1 text-xs text-ink/60">
          <Eye className="h-6 w-6" />
          <span className="tabular-nums">{viewsCount}</span>
        </div>
      </div>
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
    <section id="comments" className="mt-12 scroll-mt-6">
      <h2 className="font-serif text-xl">{t("public.comments.title")}</h2>
      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 rounded-xl border border-ink/15 bg-white p-3 focus-within:border-brand/50">
        <textarea
          id="comment-input"
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
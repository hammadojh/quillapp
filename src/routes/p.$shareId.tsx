import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Heart, MessageCircle, Eye, Share2, ArrowLeft, Loader2, Mic } from "lucide-react";
import { X, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  getPublicPostByShareId,
  listComments,
  toggleLike,
  addComment,
  getLikeState,
  deleteComment,
  incrementPostView,
  incrementPostShare,
  listLandingPosts,
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
  const [discussStep, setDiscussStep] = useState<null | "choose" | "comment">(null);
  const openDiscuss = () => setDiscussStep("choose");

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
          initialShares={(post as any).shares_count ?? 0}
          onDiscuss={openDiscuss}
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
        initialShares={(post as any).shares_count ?? 0}
        onDiscuss={openDiscuss}
      />
      {discussStep && (
        <DiscussModal
          step={discussStep}
          setStep={setDiscussStep}
          postId={post.id}
        />
      )}
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
  const listFn = useServerFn(listLandingPosts);
  const { data: posts } = useQuery({
    queryKey: ["landing-posts-cta"],
    queryFn: () => listFn(),
    staleTime: 5 * 60 * 1000,
  });

  const withThumbs = (posts ?? []).filter((p: any) => p.thumbnail_url);
  const pool = withThumbs.length > 0 ? withThumbs : [];
  // Split into two rows
  const rowA = pool.filter((_, i) => i % 2 === 0).slice(0, 6);
  const rowB = pool.filter((_, i) => i % 2 === 1).slice(0, 6);
  // Fallback padding if too few
  const pad = (arr: any[]) => (arr.length >= 3 ? arr : [...arr, ...pool].slice(0, Math.max(4, arr.length)));
  const a = pad(rowA);
  const b = pad(rowB);

  return (
    <section className="relative mt-16 overflow-hidden rounded-3xl border border-ink/10 bg-gradient-to-br from-ink via-ink to-[#0f1c2b] text-paper shadow-xl shadow-ink/20">
      {/* soft glow */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[120%] -translate-x-1/2 rounded-full bg-brand/30 blur-3xl" aria-hidden />

      {pool.length > 0 && (
        <div className="relative pt-10">
          <div className="-mx-24 flex w-[calc(100%+12rem)] translate-x-24 gap-3 overflow-hidden">
            <StaticRow items={a} />
          </div>
          <div className="-mx-24 mt-3 flex w-[calc(100%+12rem)] -translate-x-6 gap-3 overflow-hidden">
            <StaticRow items={b} />
          </div>
        </div>
      )}

      <div className="relative px-6 pb-10 pt-8 text-center sm:px-10 sm:pt-10">
        <p className="mb-3 text-[11px] uppercase tracking-[0.25em] text-paper/50">
          {t("public.cta.eyebrow")}
        </p>
        <h3 className="font-serif text-3xl leading-tight sm:text-4xl">
          {t("public.cta.title")}
        </h3>
        <p className="mx-auto mt-4 max-w-md text-sm text-paper/70 sm:text-base">
          {t("public.cta.body")}
        </p>
        <Link
          to="/"
          className="mt-7 inline-block rounded-full bg-brand px-7 py-3 text-sm font-medium text-white shadow-lg shadow-brand/30 transition hover:opacity-90"
        >
          {t("public.cta.button")}
        </Link>
      </div>
    </section>
  );
}

function StaticRow({ items }: { items: any[] }) {
  if (items.length === 0) return null;
  const repeats = Math.max(1, Math.ceil(10 / items.length));
  const filled = Array.from({ length: repeats }, () => items).flat();
  return (
    <div className="flex gap-3">
      {filled.map((p, i) => (
        <div
          key={`${p.id}-${i}`}
          className="relative h-24 w-40 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10 sm:h-28 sm:w-48"
        >
          <img
            src={thumbUrl(p.id, p.thumbnail_url)}
            alt=""
            loading="eager"
            className="h-full w-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent" />
          <div className="absolute inset-x-2 bottom-1.5 truncate font-serif text-[11px] text-paper/90">
            {p.title}
          </div>
        </div>
      ))}
    </div>
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
  initialShares,
  onDiscuss,
}: {
  shareId: string;
  title: string;
  postId: string;
  initialLikes: number;
  viewsCount: number;
  commentsCount: number;
  initialShares: number;
  onDiscuss: () => void;
}) {
  const { t } = useT();
  const authed = useAuthed();
  const navigate = useNavigate();
  const getLikeFn = useServerFn(getLikeState);
  const toggleFn = useServerFn(toggleLike);
  const shareFn = useServerFn(incrementPostShare);
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [shares, setShares] = useState(initialShares);

  useEffect(() => {
    if (!authed) { setLiked(false); return; }
    getLikeFn({ data: { postId } }).then((r) => setLiked(r.liked)).catch(() => {});
  }, [authed, postId, getLikeFn]);

  const url = typeof window !== "undefined" ? `${window.location.origin}/p/${shareId}` : "";
  const onShare = async () => {
    setShares((c) => c + 1);
    shareFn({ data: { postId } }).catch(() => {});
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

  return (
    <div id="engagement-bar" className="mt-10">
      <button
        onClick={onDiscuss}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3.5 text-sm font-semibold text-paper shadow-lg shadow-brand/25 hover:opacity-90"
      >
        <Mic className="h-4 w-4" />
        {t("public.discuss")}
      </button>

      <div className="mt-5 flex items-center justify-around">
        <button
          onClick={onShare}
          className="flex flex-col items-center gap-1 text-xs text-ink/60 transition hover:text-ink"
          aria-label={t("public.share")}
        >
          <Share2 className="h-6 w-6" />
          <span className="tabular-nums">{shares}</span>
        </button>
        <button
          onClick={onLike}
          className={`flex flex-col items-center gap-1 text-xs transition ${liked ? "text-brand" : "text-ink/60 hover:text-ink"}`}
          aria-label="Like"
        >
          <Heart className={`h-6 w-6 ${liked ? "fill-current" : ""}`} />
          <span className="tabular-nums">{likes}</span>
        </button>
        <div className="flex flex-col items-center gap-1 text-xs text-ink/60">
          <MessageCircle className="h-6 w-6" />
          <span className="tabular-nums">{commentsCount}</span>
        </div>
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

function FloatingActions({
  shareId,
  title,
  postId,
  initialLikes,
  commentsCount,
  initialShares,
  onDiscuss,
}: {
  shareId: string;
  title: string;
  postId: string;
  initialLikes: number;
  commentsCount: number;
  initialShares: number;
  onDiscuss: () => void;
}) {
  const { t } = useT();
  const authed = useAuthed();
  const navigate = useNavigate();
  const getLikeFn = useServerFn(getLikeState);
  const toggleFn = useServerFn(toggleLike);
  const shareFn = useServerFn(incrementPostShare);
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [shares, setShares] = useState(initialShares);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!authed) { setLiked(false); return; }
    getLikeFn({ data: { postId } }).then((r) => setLiked(r.liked)).catch(() => {});
  }, [authed, postId, getLikeFn]);

  useEffect(() => {
    const target = document.getElementById("engagement-bar");
    if (!target) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { rootMargin: "0px 0px -80px 0px", threshold: 0 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, []);

  const url = typeof window !== "undefined" ? `${window.location.origin}/p/${shareId}` : "";
  const onShare = async () => {
    setShares((c) => c + 1);
    shareFn({ data: { postId } }).catch(() => {});
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try { await (navigator as any).share({ title, url }); return; } catch { return; }
    }
    try { await navigator.clipboard.writeText(url); toast.success(t("post.share.copied")); } catch {}
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

  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none fixed inset-x-0 bottom-4 z-40 flex items-end justify-between px-4 transition-all duration-300 sm:hidden ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
    >
      <button
        onClick={onDiscuss}
        aria-label={t("public.discuss")}
        className="pointer-events-auto flex h-14 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-paper shadow-xl shadow-brand/40 ring-1 ring-white/10 transition active:scale-95"
      >
        <Mic className="h-5 w-5" />
        <span>{t("public.discuss")}</span>
      </button>

      <div className="pointer-events-auto flex h-14 items-center gap-1 rounded-full bg-white/55 px-2 shadow-md shadow-ink/10 ring-1 ring-ink/10 backdrop-blur-xl backdrop-saturate-150">
        <button
          onClick={onShare}
          aria-label={t("public.share")}
          className="flex h-full items-center gap-1.5 rounded-full px-3 text-xs font-medium text-ink/70 transition hover:text-ink"
        >
          <Share2 className="h-4 w-4" />
          <span className="tabular-nums">{shares}</span>
        </button>
        <span className="h-5 w-px bg-ink/10" aria-hidden />
        <button
          onClick={onLike}
          aria-label="Like"
          className={`flex h-full items-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${
            liked ? "text-brand" : "text-ink/70 hover:text-ink"
          }`}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
          <span className="tabular-nums">{likes}</span>
        </button>
      </div>
    </div>
  );
}

function Comments({ postId }: { postId: string; initialCount: number }) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(listComments);
  const delFn = useServerFn(deleteComment);
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMe(data.session?.user.id ?? null));
  }, []);

  const { data: comments } = useQuery({
    queryKey: ["comments", postId],
    queryFn: () => listFn({ data: { postId } }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", postId] }),
  });

  return (
    <section id="comments" className="mt-12 scroll-mt-6">
      <h2 className="font-serif text-xl">{t("public.comments.title")}</h2>
      <ul className="mt-4 space-y-4">
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
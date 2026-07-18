import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listPosts, createPost, deletePost } from "@/lib/posts.functions";
import { getMyProfile } from "@/lib/social.functions";
import { supabase } from "@/integrations/supabase/client";
import { Plus, FileText, LogOut, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useT, LangToggle } from "@/lib/i18n";
import { ar as arLocale } from "date-fns/locale";
import { useEffect, useRef } from "react";
import { thumbUrl } from "@/lib/thumb-url";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Your posts — Quill" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listPosts);
  const createFn = useServerFn(createPost);
  const deleteFn = useServerFn(deletePost);
  const profileFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({ queryKey: ["my-profile"], queryFn: () => profileFn() });

  const { data: posts, isLoading } = useQuery({
    queryKey: ["posts"],
    queryFn: () => listFn(),
  });

  const create = useMutation({
    mutationFn: () => createFn(),
    onSuccess: ({ id }) => navigate({ to: "/post/$postId", params: { postId: id } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create post"),
  });

  // Consume any pending topic from the landing page hero.
  const consumedRef = useRef(false);
  useEffect(() => {
    if (consumedRef.current) return;
    if (typeof window === "undefined") return;
    const topic =
      sessionStorage.getItem("quill.pendingTopic") ||
      localStorage.getItem("quill.pendingTopic");
    if (!topic) return;
    consumedRef.current = true;
    sessionStorage.removeItem("quill.pendingTopic");
    try { localStorage.removeItem("quill.pendingTopic"); } catch {}
    createFn().then(({ id }) => {
      sessionStorage.setItem(`quill.seed.${id}`, topic);
      navigate({ to: "/post/$postId", params: { postId: id } });
    }).catch((e) => toast.error(e instanceof Error ? e.message : "Could not create post"));
  }, [createFn, navigate]);

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["posts"] }),
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-6 sm:px-10 sm:py-8">
        <div className="flex items-center gap-2">
          {profile?.username && (
            <Link
              to="/u/$username"
              params={{ username: profile.username }}
              className="flex items-center gap-2 rounded-full border border-brand/20 px-3 py-1.5 text-xs font-medium text-brand/70 hover:bg-brand/5"
            >
              <User className="h-4 w-4" /> <span className="hidden sm:inline">{t("profile.view")}</span>
            </Link>
          )}
          <LangToggle />
          <button onClick={signOut} className="flex items-center gap-2 rounded-full border border-brand/20 px-3 py-1.5 text-xs font-medium text-brand/70 hover:bg-brand/5">
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">{t("nav.signout")}</span>
          </button>
        </div>
        <Link to="/dashboard" className="font-serif text-2xl font-bold tracking-tight text-brand sm:text-3xl">{t("brand")}</Link>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24 pt-4 sm:px-10">
        <span className="mb-4 block text-[10px] uppercase tracking-[0.2em] text-brand/60 sm:text-xs">
          {t("dash.title")}
        </span>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-4xl font-bold leading-[1.1] tracking-tight text-brand sm:text-5xl">{t("dash.title")}</h1>
            <p className="mt-3 text-brand/70">{t("dash.subtitle")}</p>
          </div>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-50 sm:w-auto"
          >
            <Plus className="h-4 w-4" /> {t("dash.new")}
          </button>
        </div>

        <div className="relative mt-12 border-t border-brand/10">
          <span className="absolute left-1/2 -top-2.5 -translate-x-1/2 bg-paper px-4 text-[10px] uppercase tracking-[0.25em] text-brand/40 sm:text-xs">
            {t("brand")}
          </span>
        </div>

        <div className="mt-10">
          {isLoading ? (
            <p className="text-brand/50">Loading…</p>
          ) : posts && posts.length > 0 ? (
            <ul className="divide-y divide-brand/10 border-b border-brand/10">
              {posts.map((p) => (
                <li key={p.id} className="group flex items-center justify-between gap-3 py-5">
                  <Link
                    to="/post/$postId"
                    params={{ postId: p.id }}
                    className="flex min-w-0 flex-1 items-start gap-4"
                  >
                    {(p as any).thumbnail_url ? (
                      <img
                        src={thumbUrl(p.id, (p as any).thumbnail_url)}
                        alt=""
                        loading="lazy"
                        className="h-14 w-24 shrink-0 rounded-md object-cover ring-1 ring-ink/10 sm:h-16 sm:w-28"
                      />
                    ) : (
                      <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md bg-ink/5 ring-1 ring-ink/10 sm:h-16 sm:w-28">
                        <FileText className="h-5 w-5 text-ink/40" strokeWidth={1.5} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-serif text-xl">{p.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/50">
                        <span className={p.status === "generated" ? "text-brand" : ""}>
                          {p.status === "generated" ? t("dash.status.generated") : t("dash.status.progress")}
                        </span>
                        <span>·</span>
                        <span className={
                          p.is_public
                            ? "rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand"
                            : "rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-medium text-ink/60"
                        }>
                          {p.is_public ? t("dash.badge.public") : t("dash.badge.private")}
                        </span>
                        <span>·</span>
                        <span>
                          {t("dash.updated", {
                            time: formatDistanceToNow(new Date(p.updated_at), {
                              addSuffix: true,
                              locale: lang === "ar" ? arLocale : undefined,
                            }),
                          })}
                        </span>
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm(t("post.delete.confirm"))) remove.mutate(p.id);
                    }}
                    className="shrink-0 rounded-md p-2 text-ink/40 transition hover:bg-ink/5 hover:text-ink sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label={t("post.delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-ink/20 px-8 py-16 text-center">
              <p className="font-serif text-2xl">{t("dash.empty.title")}</p>
              <p className="mt-2 text-ink/60">{t("dash.empty.body")}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
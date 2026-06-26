import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listPosts, createPost, deletePost } from "@/lib/posts.functions";
import { supabase } from "@/integrations/supabase/client";
import { Plus, FileText, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useT, LangToggle } from "@/lib/i18n";
import { ar as arLocale } from "date-fns/locale";

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

  const { data: posts, isLoading } = useQuery({
    queryKey: ["posts"],
    queryFn: () => listFn(),
  });

  const create = useMutation({
    mutationFn: () => createFn(),
    onSuccess: ({ id }) => navigate({ to: "/post/$postId", params: { postId: id } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create post"),
  });

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
      <header className="border-b border-ink/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
          <Link to="/dashboard" className="font-serif text-2xl font-semibold tracking-tight">{t("brand")}</Link>
          <div className="flex items-center gap-2">
            <LangToggle />
            <button onClick={signOut} className="flex items-center gap-2 rounded-full border border-ink/20 px-3 py-1.5 text-xs font-medium text-ink/70 hover:bg-ink/5">
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">{t("nav.signout")}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">{t("dash.title")}</h1>
            <p className="mt-2 text-ink/60">{t("dash.subtitle")}</p>
          </div>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-50 sm:w-auto"
          >
            <Plus className="h-4 w-4" /> {t("dash.new")}
          </button>
        </div>

        <div className="mt-10">
          {isLoading ? (
            <p className="text-ink/50">Loading…</p>
          ) : posts && posts.length > 0 ? (
            <ul className="divide-y divide-ink/10 border-y border-ink/10">
              {posts.map((p) => (
                <li key={p.id} className="group flex items-center justify-between gap-3 py-5">
                  <Link
                    to="/post/$postId"
                    params={{ postId: p.id }}
                    className="flex min-w-0 flex-1 items-start gap-4"
                  >
                    <FileText className="mt-1 h-5 w-5 shrink-0 text-ink/40" strokeWidth={1.5} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-serif text-xl">{p.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/50">
                        <span className={p.status === "generated" ? "text-brand" : ""}>
                          {p.status === "generated" ? t("dash.status.generated") : t("dash.status.progress")}
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
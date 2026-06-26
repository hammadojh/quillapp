import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listPosts, createPost, deletePost } from "@/lib/posts.functions";
import { supabase } from "@/integrations/supabase/client";
import { Plus, FileText, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Your posts — Quill" }] }),
  component: Dashboard,
});

function Dashboard() {
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
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link to="/dashboard" className="font-serif text-2xl font-semibold tracking-tight">Quill</Link>
          <button onClick={signOut} className="flex items-center gap-2 text-sm text-ink/60 hover:text-ink">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-serif text-4xl tracking-tight">Your posts</h1>
            <p className="mt-2 text-ink/60">Drafts, interviews-in-progress, and finished pieces.</p>
          </div>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> New post
          </button>
        </div>

        <div className="mt-10">
          {isLoading ? (
            <p className="text-ink/50">Loading…</p>
          ) : posts && posts.length > 0 ? (
            <ul className="divide-y divide-ink/10 border-y border-ink/10">
              {posts.map((p) => (
                <li key={p.id} className="group flex items-center justify-between gap-4 py-5">
                  <Link
                    to="/post/$postId"
                    params={{ postId: p.id }}
                    className="flex flex-1 items-start gap-4"
                  >
                    <FileText className="mt-1 h-5 w-5 shrink-0 text-ink/40" strokeWidth={1.5} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-serif text-xl">{p.title}</div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-ink/50">
                        <span className={p.status === "generated" ? "text-accent" : ""}>
                          {p.status === "generated" ? "Generated" : "Interview in progress"}
                        </span>
                        <span>·</span>
                        <span>Updated {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm("Delete this post?")) remove.mutate(p.id);
                    }}
                    className="rounded-md p-2 text-ink/30 opacity-0 transition hover:bg-ink/5 hover:text-ink group-hover:opacity-100"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-ink/20 px-8 py-16 text-center">
              <p className="font-serif text-2xl">Tell the world what you know.</p>
              <p className="mt-2 text-ink/60">Click <span className="font-medium">New post</span> to start an interview.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
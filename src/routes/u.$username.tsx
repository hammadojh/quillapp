import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { getProfileByUsername, getMyProfile, updateMyProfile } from "@/lib/social.functions";
import { getMyStyle } from "@/lib/style.functions";
import { StyleWizard } from "@/components/StyleWizard";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT, LangToggle } from "@/lib/i18n";
import { thumbUrl } from "@/lib/thumb-url";

export const Route = createFileRoute("/u/$username")({
  head: () => ({ meta: [{ title: "Profile — Quill" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { t } = useT();
  const { username } = Route.useParams();
  const fn = useServerFn(getProfileByUsername);
  const myFn = useServerFn(getMyProfile);
  const { data, isLoading } = useQuery({
    queryKey: ["profile", username],
    queryFn: () => fn({ data: { username } }),
  });

  const [myUserId, setMyUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMyUserId(data.session?.user.id ?? null));
  }, []);

  if (isLoading) return <div className="min-h-screen bg-paper p-10 text-ink/50">…</div>;
  if (!data) {
    return (
      <div className="min-h-screen bg-paper">
        <Topbar />
        <main className="mx-auto max-w-2xl px-4 py-20 text-center text-ink/70">
          <p className="font-serif text-2xl">404</p>
        </main>
      </div>
    );
  }

  const isOwn = myUserId === data.profile.user_id;
  const initials = (data.profile.display_name || data.profile.username).slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Topbar />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
        <div className="flex items-start gap-4 sm:gap-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand text-xl font-medium text-white sm:h-20 sm:w-20 sm:text-2xl">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-2xl sm:text-3xl">{data.profile.display_name || data.profile.username}</h1>
            <p className="mt-1 text-sm text-ink/55">@{data.profile.username}</p>
            {data.profile.bio && <p className="mt-3 text-ink/80">{data.profile.bio}</p>}
          </div>
          {isOwn && (
            <div className="flex shrink-0 flex-col gap-2">
              <EditButton initialFn={myFn} />
              <EditStyleButton />
            </div>
          )}
        </div>

        <h2 className="mt-12 font-serif text-xl">{t("profile.posts")}</h2>
        {data.posts.length === 0 ? (
          <p className="mt-4 text-sm text-ink/50">{t("profile.noposts")}</p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {data.posts.map((p) => (
              <li key={p.id}>
                <Link
                  to="/p/$shareId"
                  params={{ shareId: p.share_id ?? "" }}
                  className="group block overflow-hidden rounded-xl border border-ink/10 bg-white transition hover:border-ink/30"
                >
                  <img
                    src={thumbUrl(p.id, (p as any).thumbnail_url ?? p.updated_at)}
                    alt=""
                    loading="lazy"
                    className="aspect-[1200/630] w-full object-cover"
                  />
                  <div className="p-5">
                  <h3 className="font-serif text-lg leading-snug group-hover:text-brand">{p.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-ink/65">{p.content}</p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-ink/50">
                    <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {(p as any).views_count ?? 0}</span>
                  </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function Topbar() {
  const { t } = useT();
  return (
    <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-6 sm:px-10 sm:py-8">
      <LangToggle />
      <Link to="/" className="flex items-center gap-2 font-serif text-2xl font-bold tracking-tight text-brand sm:text-3xl">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("brand")}
      </Link>
    </header>
  );
}

function EditButton({ initialFn }: { initialFn: any }) {
  const { t } = useT();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateMyProfile);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ username: string; display_name: string; bio: string } | null>(null);

  const openEdit = async () => {
    const me = await initialFn();
    setForm({
      username: me.username,
      display_name: me.display_name || "",
      bio: me.bio || "",
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          username: form!.username,
          display_name: form!.display_name || null,
          bio: form!.bio || null,
        },
      }),
    onSuccess: (r: any) => {
      toast.success(t("toast.saved"));
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["profile"] });
      // navigate to potentially new username route
      if (r?.username) window.location.assign(`/u/${r.username}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <button onClick={openEdit} className="flex shrink-0 items-center gap-2 rounded-full border border-ink/20 px-3 py-2 text-xs hover:bg-ink/5">
        <Pencil className="h-3.5 w-3.5" /> {t("profile.edit")}
      </button>
      {open && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-xl">{t("profile.edit")}</h3>
            <div className="mt-4 space-y-3">
              <label className="block text-xs text-ink/60">{t("profile.username")}
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
                  pattern="[a-z0-9_]{3,30}"
                  className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </label>
              <label className="block text-xs text-ink/60">{t("profile.display")}
                <input
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </label>
              <label className="block text-xs text-ink/60">{t("profile.bio")}
                <textarea
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-full border border-ink/20 px-4 py-2 text-xs hover:bg-ink/5">×</button>
              <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper disabled:opacity-50">
                {t("profile.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EditStyleButton() {
  const { t } = useT();
  const styleFn = useServerFn(getMyStyle);
  const { data } = useQuery({ queryKey: ["my-style"], queryFn: () => styleFn() });
  const [open, setOpen] = useState(false);
  const hasStyle = !!data?.style_profile;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-2 rounded-full border border-ink/20 px-3 py-2 text-xs hover:bg-ink/5"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {hasStyle ? t("profile.style.edit") : t("profile.style.set")}
      </button>
      {open && <StyleWizard onClose={() => setOpen(false)} />}
    </>
  );
}
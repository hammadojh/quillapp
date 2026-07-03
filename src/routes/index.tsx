import { createFileRoute } from "@tanstack/react-router";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PenLine, Sparkle, Share2, ArrowRight, Heart, MessageCircle, Eye } from "lucide-react";
import { useT, LangToggle } from "@/lib/i18n";
import { listLandingPosts } from "@/lib/social.functions";
import { supabase } from "@/integrations/supabase/client";
import { thumbUrl } from "@/lib/thumb-url";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quill — Turn your expertise into a blog post" },
      { name: "description", content: "Quill interviews you about what you know, then writes a polished long-form blog post you can share." },
      { property: "og:title", content: "Quill — Turn your expertise into a blog post" },
      { property: "og:description", content: "Answer a few smart questions. Walk away with a ready-to-share article." },
    ],
  }),
  component: Index,
});

function Index() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [authed, setAuthed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listFn = useServerFn(listLandingPosts);
  const { data: samples } = useQuery({ queryKey: ["landing-posts"], queryFn: () => listFn() });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
  }, []);

  const start = () => {
    const clean = topic.trim();
    if (clean) {
      try { localStorage.setItem("quill.pendingTopic", clean); } catch {}
      try { sessionStorage.setItem("quill.pendingTopic", clean); } catch {}
    }
    navigate({ to: authed ? "/dashboard" : "/auth" });
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-5 sm:px-6 sm:py-6">
        <Link to="/" className="font-serif text-2xl font-semibold tracking-tight">{t("brand")}</Link>
        <div className="flex items-center gap-2">
          <LangToggle />
          <Link
            to={authed ? "/dashboard" : "/auth"}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90 sm:px-5"
          >
            {authed ? t("dash.title") : t("nav.signin")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-16">
        <p className="mb-4 text-xs uppercase tracking-[0.2em] text-ink/60 sm:text-sm">{t("landing.tag")}</p>
        <h1 className="font-serif text-4xl leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
          {t("landing.title.1")}<br />
          <span className="italic text-brand">{t("landing.title.2")}</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink/75 sm:text-lg">
          {t("landing.subtitle")}
        </p>

        {/* Hero textbox */}
        <form
          onSubmit={(e) => { e.preventDefault(); start(); }}
          className="mt-7 rounded-2xl border border-ink/15 bg-white p-2 shadow-sm focus-within:border-brand/60 focus-within:shadow-md"
        >
          <textarea
            ref={inputRef}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); start(); }
            }}
            placeholder={t("landing.hero.placeholder")}
            rows={2}
            className="w-full resize-none rounded-xl bg-transparent px-3 py-3 text-base text-ink placeholder-ink/40 focus:outline-none sm:text-lg"
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-1">
            <span className="text-xs text-ink/40">{lang === "ar" ? "اضغط Enter للبدء" : "Press Enter to start"}</span>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:opacity-90"
            >
              {t("landing.hero.start")} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </button>
          </div>
        </form>

        <p className="mt-3 text-xs text-ink/50">
          {lang === "ar"
            ? "مجاني — تحتاج إلى حساب فقط عند الحفظ أو المشاركة."
            : "Free to try — you only need an account to save or share."}
        </p>

        {/* Sample posts */}
        <section className="mt-16 sm:mt-20">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl tracking-tight sm:text-3xl">{t("landing.samples.title")}</h2>
              <p className="mt-1 text-sm text-ink/60">{t("landing.samples.sub")}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(samples ?? []).map((p) => (
              <Link
                key={p.id}
                to="/p/$shareId"
                params={{ shareId: p.share_id ?? "" }}
                className="group flex flex-col overflow-hidden rounded-xl border border-ink/10 bg-white transition hover:border-ink/30 hover:shadow-sm"
              >
                <img
                  src={thumbUrl(p.id, (p as any).thumbnail_url ?? p.updated_at)}
                  alt=""
                  loading="lazy"
                  className="aspect-[1200/630] w-full object-cover"
                />
                <div className="flex flex-1 flex-col p-5">
                <h3 className="font-serif text-lg leading-snug text-ink group-hover:text-brand sm:text-xl">
                  {p.title}
                </h3>
                <p className="mt-2 line-clamp-3 text-sm text-ink/65">{p.content}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-ink/50">
                  <span className="truncate">
                    {t("landing.samples.by")}{" "}
                    <span className="text-ink/80">{p.author?.display_name || p.author?.username || "—"}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {p.likes_count}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {p.comments_count}</span>
                    <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {(p as any).views_count ?? 0}</span>
                  </span>
                </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section id="how" className="mt-20 grid gap-10 sm:mt-24 md:grid-cols-3">
          {[
            { icon: PenLine, title: t("landing.step1.title"), body: t("landing.step1.body") },
            { icon: Sparkle, title: t("landing.step2.title"), body: t("landing.step2.body") },
            { icon: Share2, title: t("landing.step3.title"), body: t("landing.step3.body") },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <Icon className="h-6 w-6 text-brand" strokeWidth={1.5} />
              <h3 className="mt-4 font-serif text-2xl">{title}</h3>
              <p className="mt-2 text-ink/70">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-ink/10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-ink/60 sm:px-6">
          <span>© {t("brand")}</span>
          <span className="font-serif italic">{t("landing.footer.tag")}</span>
        </div>
      </footer>
    </div>
  );
}

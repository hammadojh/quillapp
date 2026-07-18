import { createFileRoute } from "@tanstack/react-router";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PenLine, Sparkle, Share2, ArrowRight, Eye } from "lucide-react";
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

  const fmtViews = (n: number) => (lang === "ar" ? n.toLocaleString("ar-EG") : n.toLocaleString("en-US"));

  return (
    <div className="min-h-screen bg-paper text-ink selection:bg-brand/10">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-6 sm:px-10 sm:py-8">
        <Link to="/" className="font-serif text-2xl font-bold tracking-tight text-brand sm:text-3xl">{t("brand")}</Link>
        <div className="flex items-center gap-2">
          <LangToggle />
          <Link
            to={authed ? "/dashboard" : "/auth"}
            className="rounded-full bg-brand px-4 py-1.5 text-xs font-medium text-paper shadow-sm transition hover:opacity-90 sm:px-5"
          >
            {authed ? t("dash.title") : t("nav.signin")}
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col items-center px-5 pb-24 pt-6 text-center sm:px-6 md:pt-16">
        <span className="mb-5 text-[10px] uppercase tracking-[0.2em] text-brand/60 sm:mb-6 sm:text-xs">
          {t("landing.tag")}
        </span>

        <h1 className="font-serif text-5xl font-bold leading-[1.1] tracking-tight text-brand sm:text-6xl md:text-7xl">
          {t("landing.title.1")}{" "}
          <span className="italic underline decoration-1 underline-offset-8">{t("landing.title.2").replace(/[.。．]$/, "")}</span>
          <span className="not-italic">.</span>
        </h1>

        <p className="mt-7 max-w-2xl text-base leading-relaxed text-brand/80 sm:text-lg md:text-xl">
          {t("landing.subtitle")}
        </p>

        {/* Hero input */}
        <form
          onSubmit={(e) => { e.preventDefault(); start(); }}
          className="mt-10 w-full rounded-2xl border border-brand/20 bg-white/40 p-5 shadow-[0_20px_50px_rgba(43,77,111,0.05)] backdrop-blur-sm transition hover:border-brand/40 sm:p-7"
        >
          <textarea
            ref={inputRef}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); start(); }
            }}
            placeholder={t("landing.hero.placeholder")}
            rows={3}
            className="min-h-[120px] w-full resize-none bg-transparent text-lg leading-relaxed text-brand placeholder:text-brand/30 focus:outline-none sm:text-xl"
          />
          <div className="mt-3 flex flex-col items-center justify-between gap-3 sm:mt-4 sm:flex-row-reverse">
            <button
              type="submit"
              className="group flex w-full items-center justify-center gap-3 rounded-full bg-brand px-7 py-3 text-sm font-medium text-paper transition hover:bg-brand/90 sm:w-auto sm:px-8"
            >
              {t("landing.hero.start")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5" />
            </button>
            <span className="text-xs text-brand/40">
              {lang === "ar" ? "اضغط Enter للبدء" : "Press Enter to start"}
            </span>
          </div>
        </form>

        <p className="mt-5 text-[11px] text-brand/40 sm:text-xs">
          {lang === "ar"
            ? "مجاني — تحتاج إلى حساب فقط عند الحفظ أو المشاركة."
            : "Free to try — you only need an account to save or share."}
        </p>
      </main>

      {/* Divider */}
      <div className="mx-auto mt-8 w-full max-w-6xl px-5 sm:mt-16 sm:px-10">
        <div className="relative border-t border-brand/10">
          <span className="absolute left-1/2 -top-2.5 -translate-x-1/2 bg-paper px-4 text-[10px] uppercase tracking-[0.25em] text-brand/40 sm:text-xs">
            {lang === "ar" ? "مختارات من الجريدة" : "Selected reading"}
          </span>
        </div>
      </div>

      {/* Samples */}
      <section className="mx-auto w-full max-w-6xl px-5 pb-24 pt-16 sm:px-10">
        <div className="mb-10 flex flex-col items-baseline justify-between gap-3 sm:mb-12 md:flex-row">
          <h2 className="font-serif text-3xl font-bold tracking-tight text-brand sm:text-4xl">
            {t("landing.samples.title")}
          </h2>
          <p className="text-sm text-brand/50">{t("landing.samples.sub")}</p>
        </div>

        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-12 lg:grid-cols-3">
          {(samples ?? []).map((p) => (
            <Link
              key={p.id}
              to="/p/$shareId"
              params={{ shareId: p.share_id ?? "" }}
              className="group flex flex-col"
            >
              <div className="relative mb-5 aspect-[4/3] w-full overflow-hidden rounded-sm bg-[#e8e4db] sm:mb-6">
                <img
                  src={thumbUrl(p.id, (p as any).thumbnail_url ?? p.updated_at)}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover opacity-90 mix-blend-multiply transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-brand/5 transition-colors group-hover:bg-transparent" />
              </div>
              <h3 className="mb-3 font-serif text-xl font-bold leading-snug text-brand transition-colors group-hover:text-brand/70 sm:text-2xl">
                {p.title}
              </h3>
              <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-brand/70">
                {p.content}
              </p>
              <div className="mt-auto flex items-center justify-between border-t border-brand/10 pt-4 text-[10px] font-semibold uppercase tracking-wider text-brand/50">
                <span className="truncate">
                  {p.author?.display_name || p.author?.username || "—"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Eye className="h-3 w-3" />
                  {fmtViews((p as any).views_count ?? 0)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works — kept, refined */}
      <section id="how" className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-10">
        <div className="relative mb-12 border-t border-brand/10">
          <span className="absolute left-1/2 -top-2.5 -translate-x-1/2 bg-paper px-4 text-[10px] uppercase tracking-[0.25em] text-brand/40 sm:text-xs">
            {lang === "ar" ? "كيف يعمل" : "How it works"}
          </span>
        </div>
        <div className="grid gap-10 md:grid-cols-3">
          {[
            { icon: PenLine, title: t("landing.step1.title"), body: t("landing.step1.body") },
            { icon: Sparkle, title: t("landing.step2.title"), body: t("landing.step2.body") },
            { icon: Share2, title: t("landing.step3.title"), body: t("landing.step3.body") },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <Icon className="h-6 w-6 text-brand" strokeWidth={1.5} />
              <h3 className="mt-4 font-serif text-2xl text-brand">{title}</h3>
              <p className="mt-2 text-brand/70">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-brand/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-sm text-brand/60 sm:px-10">
          <span>© {t("brand")}</span>
          <span className="font-serif italic">{t("landing.footer.tag")}</span>
        </div>
      </footer>
    </div>
  );
}

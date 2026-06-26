import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { PenLine, Sparkle, Share2 } from "lucide-react";
import { useT, LangToggle } from "@/lib/i18n";

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
  const { t } = useT();
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-5 sm:px-6 sm:py-6">
        <Link to="/" className="font-serif text-2xl font-semibold tracking-tight">{t("brand")}</Link>
        <div className="flex items-center gap-2">
          <LangToggle />
          <Link
            to="/auth"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90 sm:px-5"
          >
            {t("nav.signin")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6 md:pt-24">
        <p className="mb-4 text-xs uppercase tracking-[0.2em] text-ink/60 sm:text-sm">{t("landing.tag")}</p>
        <h1 className="font-serif text-4xl leading-[1.1] tracking-tight sm:text-5xl md:text-7xl">
          {t("landing.title.1")}<br />
          <span className="italic text-brand">{t("landing.title.2")}</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-ink/75 sm:text-lg">
          {t("landing.subtitle")}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap">
          <Link
            to="/auth"
            className="rounded-full bg-ink px-6 py-3 text-center text-base font-medium text-paper transition hover:opacity-90 sm:px-7"
          >
            {t("landing.cta.start")}
          </Link>
          <a
            href="#how"
            className="rounded-full border border-ink/20 px-6 py-3 text-center text-base font-medium text-ink transition hover:bg-ink/5 sm:px-7"
          >
            {t("landing.cta.how")}
          </a>
        </div>

        <section id="how" className="mt-20 grid gap-10 sm:mt-28 md:grid-cols-3">
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

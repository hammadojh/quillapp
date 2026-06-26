import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { PenLine, Sparkle, Share2 } from "lucide-react";

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
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link to="/" className="font-serif text-2xl font-semibold tracking-tight">Quill</Link>
        <Link
          to="/auth"
          className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition hover:opacity-90"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-12 md:pt-24">
        <p className="mb-4 text-sm uppercase tracking-[0.2em] text-ink/60">For experts who don't have time to write</p>
        <h1 className="font-serif text-5xl leading-[1.05] tracking-tight md:text-7xl">
          Your expertise,<br />
          <span className="italic text-accent">written down.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/75">
          Quill interviews you about what you know — then writes a polished long-form blog post you can publish or share on social media. Same voice. None of the staring at a blank page.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            to="/auth"
            className="rounded-full bg-ink px-7 py-3 text-base font-medium text-paper transition hover:opacity-90"
          >
            Start writing free
          </Link>
          <a
            href="#how"
            className="rounded-full border border-ink/20 px-7 py-3 text-base font-medium text-ink transition hover:bg-ink/5"
          >
            How it works
          </a>
        </div>

        <section id="how" className="mt-28 grid gap-10 md:grid-cols-3">
          {[
            { icon: PenLine, title: "Tell us what you know", body: "Quill asks you focused questions about your topic, your audience, and the one insight only you would share." },
            { icon: Sparkle, title: "We draft the article", body: "A 700–1,100 word post in your voice, with your examples, in clean markdown — ready to edit." },
            { icon: Share2, title: "Share it anywhere", body: "Copy to your blog, LinkedIn, or newsletter. We even include a one-line social blurb." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <Icon className="h-6 w-6 text-accent" strokeWidth={1.5} />
              <h3 className="mt-4 font-serif text-2xl">{title}</h3>
              <p className="mt-2 text-ink/70">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-ink/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-sm text-ink/60">
          <span>© Quill</span>
          <span className="font-serif italic">Write more of what you know.</span>
        </div>
      </footer>
    </div>
  );
}

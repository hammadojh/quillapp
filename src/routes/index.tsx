import { createFileRoute } from "@tanstack/react-router";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PenLine, Sparkle, Share2, ArrowRight, Eye, Mic, Square, Paperclip, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { startWavRecording, transcribeBlob, type WavRecorder } from "@/lib/wav-recorder";
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
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<WavRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
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

  const appendText = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setTopic((prev) => (prev.trim() ? `${prev.trim()}\n\n${clean}` : clean));
  };

  const toggleRecording = async () => {
    if (recording) {
      const rec = recorderRef.current;
      recorderRef.current = null;
      setRecording(false);
      if (!rec) return;
      setBusy(true);
      try {
        const blob = await rec.stop();
        if (blob.size < 2048) throw new Error(lang === "ar" ? "التسجيل فارغ، حاول مرة أخرى." : "That recording was empty — try again.");
        appendText(await transcribeBlob(blob));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Recording failed");
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      recorderRef.current = await startWavRecording();
      setRecording(true);
    } catch {
      toast.error(lang === "ar" ? "تعذّر الوصول إلى الميكروفون." : "Microphone access is needed to record.");
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const isAudio = file.type.startsWith("audio/") || /\.(wav|mp3|m4a|webm|mp4)$/i.test(file.name);
        const isText = file.type.startsWith("text/") || /\.(txt|md|markdown|csv|json)$/i.test(file.name);
        if (isAudio) {
          appendText(await transcribeBlob(file, file.name));
        } else if (isText) {
          appendText((await file.text()).slice(0, 8000));
        } else {
          toast.error(
            lang === "ar"
              ? `«${file.name}» غير مدعوم — أرفق ملف نصي أو تسجيل صوتي.`
              : `"${file.name}" isn't supported — attach a text file or a voice note.`,
          );
          continue;
        }
        setAttachments((prev) => [...prev, file.name]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read attachment");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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
          {attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachments.map((name, i) => (
                <span key={`${name}-${i}`} className="flex items-center gap-1.5 rounded-full border border-brand/20 px-3 py-1 text-[11px] text-brand/70">
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[140px] truncate">{name}</span>
                  <button type="button" onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))} aria-label="remove">
                    <X className="h-3 w-3 opacity-60 hover:opacity-100" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-col items-center justify-between gap-3 sm:mt-4 sm:flex-row-reverse">
            <button
              type="submit"
              className="group flex w-full items-center justify-center gap-3 rounded-full bg-brand px-7 py-3 text-sm font-medium text-paper transition hover:bg-brand/90 sm:w-auto sm:px-8"
            >
              {t("landing.hero.start")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5" />
            </button>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <button
                type="button"
                onClick={toggleRecording}
                disabled={busy}
                aria-label={lang === "ar" ? "سجّل فكرتك صوتياً" : "Record your idea"}
                className={`flex h-10 w-10 items-center justify-center rounded-full border transition disabled:opacity-50 ${
                  recording
                    ? "animate-pulse border-transparent bg-brand text-paper"
                    : "border-brand/20 text-brand hover:border-brand/50"
                }`}
              >
                {busy && !recording ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : recording ? (
                  <Square className="h-3.5 w-3.5 fill-current" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                aria-label={lang === "ar" ? "أرفق ملفاً أو تسجيلاً" : "Attach a document or voice note"}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-brand/20 text-brand transition hover:border-brand/50 disabled:opacity-50"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="audio/*,video/mp4,.m4a,.mp3,.wav,.aac,.caf,.aiff,.aif,.mp4,.mov,.webm,.ogg,.flac,.txt,.md,.markdown,.csv,.json"
                className="hidden"
                onChange={(e) => void onFiles(e.target.files)}
              />
              <span className="text-xs text-brand/40">
                {recording
                  ? lang === "ar" ? "جارٍ التسجيل…" : "Recording…"
                  : busy
                    ? lang === "ar" ? "جارٍ المعالجة…" : "Processing…"
                    : lang === "ar" ? "تحدّث أو أرفق ملفاً" : "Speak or attach a file"}
              </span>
            </div>
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

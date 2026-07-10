import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { getStyleProfile, saveStyleProfile } from "@/lib/style.functions";
import { useT, LangToggle } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/style")({
  head: () => ({ meta: [{ title: "Your writing style — Quill" }] }),
  component: StylePage,
});

const VOICE_OPTIONS: Array<{ key: string; en: string; ar: string }> = [
  { key: "authoritative", en: "Authoritative", ar: "موثوق" },
  { key: "warm", en: "Warm", ar: "دافئ" },
  { key: "punchy", en: "Punchy", ar: "حاد" },
  { key: "playful", en: "Playful", ar: "مرح" },
  { key: "reflective", en: "Reflective", ar: "تأملي" },
  { key: "contrarian", en: "Contrarian", ar: "معاكس" },
];

const RHYTHM_OPTIONS = ["short", "flowing", "mixed"] as const;
const STRUCT_OPTIONS = ["story", "thesis", "contrarian", "numbered"] as const;

function StylePage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const getFn = useServerFn(getStyleProfile);
  const saveFn = useServerFn(saveStyleProfile);
  const { data } = useQuery({ queryKey: ["style"], queryFn: () => getFn() });

  const [writers, setWriters] = useState("");
  const [voices, setVoices] = useState<string[]>([]);
  const [rhythm, setRhythm] = useState<string>("");
  const [donts, setDonts] = useState("");
  const [structural, setStructural] = useState<string>("");
  const [samples, setSamples] = useState("");
  const [busy, setBusy] = useState(false);

  const toggleVoice = (v: string) =>
    setVoices((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  const submit = async () => {
    setBusy(true);
    try {
      await saveFn({ data: { writers, voices, rhythm, donts, structural_move: structural, samples } });
      toast.success(t("style.saved"));
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const label = (en: string, ar: string) => (lang === "ar" ? ar : en);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-ink/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm text-ink/70 hover:text-ink">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("post.back")}
          </Link>
          <LangToggle />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-xs uppercase tracking-widest text-brand">{t("style.eyebrow")}</p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight sm:text-4xl">{t("style.title")}</h1>
        <p className="mt-2 text-ink/60">{t("style.sub")}</p>

        {data?.profile && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-brand/30 bg-brand/5 p-4 text-sm text-ink/80">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <div>
              <div className="font-medium">{t("style.existing")}</div>
              <p className="mt-1 whitespace-pre-wrap text-ink/70">{data.profile.card}</p>
            </div>
          </div>
        )}

        <div className="mt-8 space-y-8">
          <Field label={t("style.q.writers")} hint={t("style.q.writers.hint")}>
            <textarea
              value={writers}
              onChange={(e) => setWriters(e.target.value)}
              rows={2}
              placeholder={t("style.q.writers.ph")}
              className="w-full resize-none rounded-xl border border-ink/15 bg-white px-4 py-3 focus:border-brand focus:outline-none"
            />
          </Field>

          <Field label={t("style.q.voice")}>
            <div className="flex flex-wrap gap-2">
              {VOICE_OPTIONS.map((v) => {
                const on = voices.includes(v.key);
                return (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => toggleVoice(v.key)}
                    className={`rounded-full border px-4 py-1.5 text-sm transition ${on ? "border-brand bg-brand text-paper" : "border-ink/20 bg-white text-ink hover:bg-ink/5"}`}
                  >
                    {label(v.en, v.ar)}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={t("style.q.rhythm")}>
            <div className="flex flex-wrap gap-2">
              {RHYTHM_OPTIONS.map((r) => {
                const on = rhythm === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRhythm(r)}
                    className={`rounded-full border px-4 py-1.5 text-sm transition ${on ? "border-brand bg-brand text-paper" : "border-ink/20 bg-white text-ink hover:bg-ink/5"}`}
                  >
                    {t(`style.rhythm.${r}`)}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={t("style.q.donts")} hint={t("style.q.donts.hint")}>
            <textarea
              value={donts}
              onChange={(e) => setDonts(e.target.value)}
              rows={2}
              placeholder={t("style.q.donts.ph")}
              className="w-full resize-none rounded-xl border border-ink/15 bg-white px-4 py-3 focus:border-brand focus:outline-none"
            />
          </Field>

          <Field label={t("style.q.struct")}>
            <div className="flex flex-wrap gap-2">
              {STRUCT_OPTIONS.map((s) => {
                const on = structural === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStructural(s)}
                    className={`rounded-full border px-4 py-1.5 text-sm transition ${on ? "border-brand bg-brand text-paper" : "border-ink/20 bg-white text-ink hover:bg-ink/5"}`}
                  >
                    {t(`style.struct.${s}`)}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={t("style.q.samples")} hint={t("style.q.samples.hint")}>
            <textarea
              value={samples}
              onChange={(e) => setSamples(e.target.value)}
              rows={4}
              placeholder={t("style.q.samples.ph")}
              className="w-full resize-none rounded-xl border border-ink/15 bg-white px-4 py-3 focus:border-brand focus:outline-none"
            />
          </Field>
        </div>

        <button
          onClick={submit}
          disabled={busy}
          className="mt-10 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("style.save")}
        </button>
      </main>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-serif text-lg">{label}</div>
      {hint && <p className="mt-1 text-sm text-ink/55">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}
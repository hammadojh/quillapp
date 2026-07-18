import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveMyStyle, dismissStyleWizard } from "@/lib/style.functions";
import { X, Mic, Square, FileText, ChevronLeft, ChevronRight, Check, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

type Sample = { kind: "text" | "voice"; content: string };
type Answers = {
  tone: string;
  audience: string;
  quirks: string;
  avoid: string;
  formality: "casual" | "balanced" | "formal" | "";
};

export function StyleWizard({ onClose, mandatory = false }: { onClose: () => void; mandatory?: boolean }) {
  const { t, lang, dir } = useT();
  const qc = useQueryClient();
  const saveFn = useServerFn(saveMyStyle);
  const dismissFn = useServerFn(dismissStyleWizard);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    tone: "",
    audience: "",
    quirks: "",
    avoid: "",
    formality: "",
  });
  const [samples, setSamples] = useState<Sample[]>([]);
  const [draftText, setDraftText] = useState("");

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          answers: {
            ...answers,
            formality: answers.formality || undefined,
          },
          samples,
          language: lang,
        },
      }),
    onSuccess: () => {
      toast.success(t("style.saved"));
      qc.invalidateQueries({ queryKey: ["my-style"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const dismiss = useMutation({
    mutationFn: () => dismissFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-style"] });
      onClose();
    },
  });

  const addTextSample = () => {
    const c = draftText.trim();
    if (c.length < 20) {
      toast.error(t("style.samples.tooShort"));
      return;
    }
    setSamples((s) => [...s, { kind: "text", content: c }]);
    setDraftText("");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const f of Array.from(files)) {
      if (samples.length >= 6) break;
      const text = await f.text();
      const trimmed = text.trim().slice(0, 20000);
      if (trimmed.length >= 20) setSamples((s) => [...s, { kind: "text", content: trimmed }]);
    }
    e.target.value = "";
  };

  // Voice recording -> transcribe
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size < 1024) return;
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("file", blob, "sample.webm");
          const { data } = await supabase.auth.getSession();
          const r = await fetch("/api/transcribe", {
            method: "POST",
            body: fd,
            headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : undefined,
          });
          if (!r.ok) throw new Error(await r.text());
          const { text } = (await r.json()) as { text: string };
          const trimmed = (text || "").trim();
          if (trimmed.length >= 20) {
            setSamples((s) => [...s, { kind: "voice", content: trimmed }]);
            toast.success(t("style.voice.added"));
          } else {
            toast.error(t("style.voice.tooShort"));
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      toast.error(t("style.voice.unavailable"));
    }
  };
  const stopRec = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };
  useEffect(() => () => mediaRef.current?.stop(), []);

  const totalSteps = 3;

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (mandatory) return;
        if (e.target === e.currentTarget) dismiss.mutate();
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-2xl">
        {!mandatory && (
          <button
            onClick={() => dismiss.mutate()}
            className="absolute end-4 top-4 rounded-full p-2 text-ink/50 transition hover:bg-ink/5 hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="px-6 pt-8 sm:px-10">
          <span className="text-[10px] uppercase tracking-[0.25em] text-brand/60">
            {t("style.eyebrow")}
          </span>
          <h2 className="mt-2 font-serif text-3xl font-bold leading-tight tracking-tight text-brand sm:text-4xl">
            {t("style.title")}
          </h2>
          <p className="mt-2 text-sm text-brand/70">{t("style.subtitle")}</p>

          {/* Progress */}
          <div className="mt-6 flex items-center gap-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition ${
                  i <= step ? "bg-brand" : "bg-ink/10"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-4 pt-6 sm:px-10">
          {step === 0 && (
            <div className="space-y-5">
              <Field label={t("style.q.tone")} hint={t("style.q.tone.hint")}>
                <input
                  value={answers.tone}
                  onChange={(e) => setAnswers({ ...answers, tone: e.target.value })}
                  placeholder={t("style.q.tone.ph")}
                  className="w-full rounded-lg border border-ink/15 bg-white/50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </Field>
              <Field label={t("style.q.audience")}>
                <input
                  value={answers.audience}
                  onChange={(e) => setAnswers({ ...answers, audience: e.target.value })}
                  placeholder={t("style.q.audience.ph")}
                  className="w-full rounded-lg border border-ink/15 bg-white/50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </Field>
              <Field label={t("style.q.formality")}>
                <div className="grid grid-cols-3 gap-2">
                  {(["casual", "balanced", "formal"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setAnswers({ ...answers, formality: f })}
                      className={`rounded-lg border px-3 py-2.5 text-xs font-medium transition ${
                        answers.formality === f
                          ? "border-brand bg-brand text-paper"
                          : "border-ink/15 text-ink/70 hover:border-ink/30"
                      }`}
                    >
                      {t(`style.formality.${f}`)}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <Field label={t("style.q.quirks")} hint={t("style.q.quirks.hint")}>
                <textarea
                  value={answers.quirks}
                  onChange={(e) => setAnswers({ ...answers, quirks: e.target.value })}
                  placeholder={t("style.q.quirks.ph")}
                  rows={4}
                  className="w-full resize-none rounded-lg border border-ink/15 bg-white/50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </Field>
              <Field label={t("style.q.avoid")}>
                <textarea
                  value={answers.avoid}
                  onChange={(e) => setAnswers({ ...answers, avoid: e.target.value })}
                  placeholder={t("style.q.avoid.ph")}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-ink/15 bg-white/50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <p className="rounded-lg bg-ink/5 px-4 py-3 text-xs text-ink/70">{t("style.samples.hint")}</p>

              <Field label={t("style.samples.text")}>
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder={t("style.samples.text.ph")}
                  rows={5}
                  className="w-full resize-none rounded-lg border border-ink/15 bg-white/50 px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={addTextSample}
                    disabled={draftText.trim().length < 20}
                    className="rounded-full bg-brand px-4 py-1.5 text-xs font-medium text-paper transition hover:opacity-90 disabled:opacity-40"
                  >
                    {t("style.samples.add")}
                  </button>
                  <label className="cursor-pointer rounded-full border border-ink/20 px-4 py-1.5 text-xs font-medium text-ink/70 hover:bg-ink/5">
                    <span className="inline-flex items-center gap-1.5">
                      <Upload className="h-3.5 w-3.5" /> {t("style.samples.upload")}
                    </span>
                    <input
                      type="file"
                      multiple
                      accept=".txt,.md,.markdown,text/plain,text/markdown"
                      onChange={handleUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </Field>

              <Field label={t("style.samples.voice")} hint={t("style.samples.voice.hint")}>
                <div className="flex flex-wrap items-center gap-3">
                  {!recording ? (
                    <button
                      onClick={startRec}
                      disabled={transcribing}
                      className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-4 py-2 text-xs font-medium text-ink/80 hover:bg-ink/5 disabled:opacity-50"
                    >
                      <Mic className="h-3.5 w-3.5" /> {t("style.samples.voice.start")}
                    </button>
                  ) : (
                    <button
                      onClick={stopRec}
                      className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-xs font-medium text-white animate-pulse"
                    >
                      <Square className="h-3.5 w-3.5" /> {t("style.samples.voice.stop")}
                    </button>
                  )}
                  {transcribing && (
                    <span className="inline-flex items-center gap-2 text-xs text-ink/60">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("style.samples.voice.working")}
                    </span>
                  )}
                </div>
              </Field>

              {samples.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/50">
                    {t("style.samples.added")} · {samples.length}
                  </div>
                  <ul className="space-y-2">
                    {samples.map((s, i) => (
                      <li
                        key={i}
                        className="flex items-start justify-between gap-3 rounded-lg border border-ink/10 bg-white/40 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-ink/50">
                            {s.kind === "voice" ? <Mic className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                            {t(s.kind === "voice" ? "style.samples.tag.voice" : "style.samples.tag.text")}
                          </div>
                          <p className="line-clamp-2 text-xs text-ink/70">{s.content}</p>
                        </div>
                        <button
                          onClick={() => setSamples(samples.filter((_, j) => j !== i))}
                          className="rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink"
                          aria-label="Remove"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink/10 bg-white/30 px-6 py-4 sm:px-10">
          {mandatory ? (
            <span className="text-xs text-ink/60">{t("style.required")}</span>
          ) : (
            <button
              onClick={() => dismiss.mutate()}
              className="text-xs text-ink/50 underline-offset-4 hover:text-ink hover:underline"
            >
              {t("style.skip")}
            </button>
          )}
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="inline-flex items-center gap-1 rounded-full border border-ink/20 px-4 py-2 text-xs font-medium text-ink/70 hover:bg-ink/5"
              >
                {lang === "ar" ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                {t("style.back")}
              </button>
            )}
            {step < totalSteps - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="inline-flex items-center gap-1 rounded-full bg-brand px-5 py-2 text-xs font-medium text-paper hover:opacity-90"
              >
                {t("style.next")}
                {lang === "ar" ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
              >
                {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {t("style.finish")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block font-serif text-lg text-brand">{label}</label>
      {hint && <p className="mb-2 text-xs text-ink/50">{hint}</p>}
      {children}
    </div>
  );
}

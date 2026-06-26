import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getPost, updatePost, generateBlogPost, deletePost } from "@/lib/posts.functions";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Copy, RefreshCw, Trash2, Send, Mic, Square, Volume2, Play, Pause, Share2, Linkedin, Twitter, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT, LangToggle, type Lang } from "@/lib/i18n";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/post/$postId")({
  head: () => ({ meta: [{ title: "Post — Quill" }] }),
  component: PostPage,
});

const GEN_SENTINEL = "[[GENERATE]]";

function PostPage() {
  const { t } = useT();
  const { postId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getPost);
  const updateFn = useServerFn(updatePost);
  const generateFn = useServerFn(generateBlogPost);
  const deleteFn = useServerFn(deletePost);

  const { data: post, isLoading } = useQuery({
    queryKey: ["post", postId],
    queryFn: () => getFn({ data: { id: postId } }),
  });

  if (isLoading || !post) {
    return (
      <div className="min-h-screen bg-paper p-10 text-ink/50">…</div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-ink/10">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm text-ink/70 hover:text-ink">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> <span className="truncate">{t("post.back")}</span>
          </Link>
          <div className="flex items-center gap-2">
            <LangToggle />
            <button
              onClick={async () => {
                if (!confirm(t("post.delete.confirm"))) return;
                await deleteFn({ data: { id: postId } });
                qc.invalidateQueries({ queryKey: ["posts"] });
                navigate({ to: "/dashboard" });
              }}
              className="flex items-center gap-2 rounded-full border border-ink/20 px-3 py-1.5 text-xs font-medium text-ink/70 hover:bg-ink/5"
              aria-label={t("post.delete")}
            >
              <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">{t("post.delete")}</span>
            </button>
          </div>
        </div>
      </header>

      {post.status === "generated" ? (
        <GeneratedView
          post={post}
          onUpdated={() => qc.invalidateQueries({ queryKey: ["post", postId] })}
          updateFn={updateFn}
          generateFn={generateFn}
        />
      ) : (
        <InterviewView
          postId={postId}
          initialMessages={(post.interview_messages as unknown as UIMessage[]) ?? []}
          updateFn={updateFn}
          generateFn={generateFn}
          onGenerated={() => qc.invalidateQueries({ queryKey: ["post", postId] })}
        />
      )}
    </div>
  );
}

function InterviewView({
  postId,
  initialMessages,
  updateFn,
  generateFn,
  onGenerated,
}: {
  postId: string;
  initialMessages: UIMessage[];
  updateFn: ReturnType<typeof useServerFn<typeof updatePost>>;
  generateFn: ReturnType<typeof useServerFn<typeof generateBlogPost>>;
  onGenerated: () => void;
}) {
  const { t, lang } = useT();
  const langRef = useRef<Lang>(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ language: langRef.current }),
        fetch: async (input, init) => {
          const { data } = await supabase.auth.getSession();
          const headers = new Headers(init?.headers);
          if (data.session?.access_token) {
            headers.set("Authorization", `Bearer ${data.session.access_token}`);
          }
          return fetch(input, { ...init, headers });
        },
      }),
    [],
  );

  const { messages, sendMessage, status } = useChat({
    id: postId,
    messages: initialMessages,
    transport,
    onFinish: () => {
      // persisted via effect below
    },
    onError: (e) => toast.error(e.message || "Chat error"),
  });

  // ---- Voice mode ----
  const [voiceMode, setVoiceMode] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const speakAbortRef = useRef<AbortController | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const playedIdsRef = useRef<Set<string>>(new Set());

  const stopSpeaking = () => {
    speakAbortRef.current?.abort();
    speakAbortRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setPlayingId(null);
    setLoadingId(null);
  };

  const playMessage = (id: string, text: string) => {
    if (typeof window === "undefined") return;
    if (!text.trim()) return;
    stopSpeaking();
    setLoadingId(id);
    const ac = new AbortController();
    speakAbortRef.current = ac;
    (async () => {
      const AC: typeof AudioContext =
        (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC({ sampleRate: 24000 });
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      let playhead = 0;
      let pending = new Uint8Array(0);
      let started = false;
      const playChunk = (incoming: Uint8Array) => {
        const bytes = new Uint8Array(pending.length + incoming.length);
        bytes.set(pending);
        bytes.set(incoming, pending.length);
        const usable = bytes.length - (bytes.length % 2);
        pending = bytes.slice(usable);
        if (usable === 0) return;
        const samples = new Int16Array(bytes.buffer, 0, usable / 2);
        const floats = Float32Array.from(samples, (s) => s / 32768);
        const buffer = ctx.createBuffer(1, floats.length, 24000);
        buffer.copyToChannel(floats, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        if (playhead === 0) playhead = ctx.currentTime + 0.05;
        else playhead = Math.max(playhead, ctx.currentTime);
        source.start(playhead);
        playhead += buffer.duration;
        if (!started) {
          started = true;
          setLoadingId(null);
          setPlayingId(id);
        }
      };
      try {
        const r = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, lang }),
          signal: ac.signal,
        });
        if (!r.ok || !r.body) throw new Error("TTS failed");
        const { createParser } = await import("eventsource-parser");
        const parser = createParser({
          onEvent(event) {
            let payload: { type: string; audio?: string };
            try { payload = JSON.parse(event.data); } catch { return; }
            if (payload.type !== "speech.audio.delta" || !payload.audio) return;
            const binary = atob(payload.audio);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            playChunk(bytes);
          },
        });
        const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.feed(value);
        }
        const remaining = Math.max(0, (playhead - ctx.currentTime) * 1000);
        setTimeout(() => {
          if (ac.signal.aborted) return;
          playedIdsRef.current.add(id);
          setPlayingId((curr) => (curr === id ? null : curr));
        }, remaining + 100);
      } catch {
        if (!ac.signal.aborted) {
          setLoadingId(null);
          setPlayingId(null);
        }
      }
    })();
  };

  useEffect(() => {
    return () => {
      stopSpeaking();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = async () => {
    try {
      stopSpeaking();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 2048) {
          toast.error(lang === "ar" ? "التسجيل فارغ — حاول مرة أخرى." : "That recording was empty — try again.");
          return;
        }
        setTranscribing(true);
        try {
          const fd = new FormData();
          const ext = blob.type.includes("mp4") ? "mp4" : "webm";
          fd.append("file", blob, `recording.${ext}`);
          const r = await fetch("/api/transcribe", { method: "POST", body: fd });
          if (!r.ok) throw new Error(await r.text());
          const { text } = (await r.json()) as { text: string };
          const clean = text.trim();
          if (!clean) {
            toast.error(lang === "ar" ? "لم أسمع شيئاً — حاول مرة أخرى." : "Didn't catch that — try again.");
            return;
          }
          await sendMessage({ text: clean });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : (lang === "ar" ? "فشل النسخ" : "Transcription failed"));
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      toast.error(lang === "ar" ? "تم رفض الوصول إلى المايكروفون" : "Microphone access denied");
    }
  };

  const stopRecording = () => {
    setRecording(false);
    recorderRef.current?.stop();
    recorderRef.current = null;
  };

  const toggleVoiceMode = () => {
    setVoiceMode((v) => {
      const next = !v;
      if (!next) stopSpeaking();
      if (!next && recording) stopRecording();
      return next;
    });
  };

  // Seed an opening question if empty
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (messages.length === 0 && status === "ready") {
      seededRef.current = true;
      sendMessage({ text: lang === "ar" ? "لنبدأ." : "Let's begin." });
    }
  }, [messages.length, status, sendMessage, lang]);

  // Persist messages whenever they change after a turn
  useEffect(() => {
    if (status !== "ready" || messages.length === 0) return;
    updateFn({
      data: { id: postId, interview_messages: messages as unknown as Array<unknown> },
    }).catch(() => {});
  }, [messages, status, postId, updateFn]);

  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [length, setLength] = useState<"short" | "medium" | "long">("short");
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || status === "submitted" || status === "streaming") return;
    setInput("");
    await sendMessage({ text });
  };

  const generate = async () => {
    setGenerating(true);
    try {
      await generateFn({ data: { id: postId, language: lang, length } });
      toast.success(t("toast.ready"));
      onGenerated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate");
    } finally {
      setGenerating(false);
    }
  };

  const exchangeCount = messages.filter((m) => m.role === "user").length;
  const canGenerate = exchangeCount >= 3;

  return (
    <div className="mx-auto flex h-[calc(100vh-65px)] max-w-3xl flex-col px-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 py-3 sm:py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-ink/40 sm:text-xs">{t("post.interview.label")}</p>
          <h1 className="truncate font-serif text-xl sm:text-2xl">{t("post.interview.title")}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LengthSelect value={length} onChange={setLength} />
          <button
            onClick={toggleVoiceMode}
            className={`flex h-10 w-10 items-center justify-center rounded-full border transition sm:h-auto sm:w-auto sm:px-3 sm:py-2 ${voiceMode ? "border-brand bg-brand text-white" : "border-ink/20 text-ink/70 hover:bg-ink/5"}`}
            aria-pressed={voiceMode}
            title={t("post.voice")}
          >
            {voiceMode ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            <span className="hidden sm:ms-2 sm:inline sm:text-xs sm:font-medium">{t("post.voice")}</span>
          </button>
          <button
            onClick={generate}
            disabled={!canGenerate || generating}
            className="flex items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40 sm:px-5"
          >
            <Sparkles className="h-4 w-4" />
            <span>{generating ? t("post.generating") : t("post.generate")}</span>
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto py-6">
        {messages.length === 0 && (
          <p className="text-center font-serif text-xl italic text-ink/40">
            {t("post.intro")}
          </p>
        )}
        {messages.map((m) => {
          const text = m.parts
            .map((p) => (p.type === "text" ? p.text : ""))
            .join("");
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-4 py-3 text-paper rtl:rounded-bl-sm rtl:rounded-br-2xl">
                  {text}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="max-w-[90%]">
              <div className="text-xs uppercase tracking-widest text-brand/80">{t("brand")}</div>
              <div className="mt-1 whitespace-pre-wrap font-serif text-lg leading-relaxed">{text}</div>
            </div>
          );
        })}
        {(status === "submitted" || status === "streaming") && messages.at(-1)?.role === "user" && (
          <div className="font-serif italic text-ink/40">{t("post.thinking")}</div>
        )}
      </div>

      {voiceMode ? (
        <div className="flex flex-col items-center gap-3 border-t border-ink/10 py-6">
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={transcribing || status === "submitted" || status === "streaming"}
            className={`flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition disabled:opacity-40 ${recording ? "bg-red-600 animate-pulse" : "bg-brand hover:opacity-90"}`}
            aria-label={recording ? t("post.voice.listening") : t("post.voice.idle")}
          >
            {recording ? <Square className="h-7 w-7" /> : <Mic className="h-8 w-8" />}
          </button>
          <p className="text-sm text-ink/60">
            {transcribing
              ? t("post.voice.transcribing")
              : recording
                ? t("post.voice.listening")
                : status === "streaming" || status === "submitted"
                  ? t("post.voice.thinking")
                  : loadingVoice
                    ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-ink/20 border-t-brand" />
                          {lang === "ar" ? "جارٍ تجهيز الصوت…" : "Preparing voice…"}
                        </span>
                      )
                    : speaking
                      ? (lang === "ar" ? "يتحدث…" : "Speaking…")
                      : t("post.voice.idle")}
          </p>
        </div>
      ) : (
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-ink/10 py-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(e as unknown as React.FormEvent);
            }
          }}
          rows={2}
          placeholder={t("post.placeholder")}
          className="flex-1 resize-none rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink placeholder-ink/40 focus:border-brand focus:outline-none"
          autoFocus
        />
        <button
          type="submit"
          disabled={!input.trim() || status === "submitted" || status === "streaming"}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-40"
          aria-label={t("post.send")}
        >
          <Send className="h-4 w-4 rtl:rotate-180" />
        </button>
      </form>
      )}
    </div>
  );
}

function GeneratedView({
  post,
  onUpdated,
  updateFn,
  generateFn,
}: {
  post: { id: string; title: string; content: string };
  onUpdated: () => void;
  updateFn: ReturnType<typeof useServerFn<typeof updatePost>>;
  generateFn: ReturnType<typeof useServerFn<typeof generateBlogPost>>;
}) {
  const { t, lang } = useT();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [tweak, setTweak] = useState("");
  const [busy, setBusy] = useState(false);
  const [length, setLength] = useState<"short" | "medium" | "long">("short");

  useEffect(() => {
    setTitle(post.title);
    setContent(post.content);
  }, [post.title, post.content]);

  const save = async () => {
    setBusy(true);
    try {
      await updateFn({ data: { id: post.id, title, content } });
      toast.success(t("toast.saved"));
      setEditing(false);
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(`# ${title}\n\n${content.replace(/^#\s+.+\n+/, "")}`);
    toast.success(t("toast.copied.md"));
  };

  const regenerate = async () => {
    if (!tweak.trim()) return;
    setBusy(true);
    try {
      await generateFn({ data: { id: post.id, tweak, language: lang, length } });
      toast.success(t("toast.rewritten"));
      setTweak("");
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not regenerate");
    } finally {
      setBusy(false);
    }
  };

  // strip the leading "# Title" since we render title separately
  const body = content.replace(/^#\s+.+\n+/, "");

  // Build a punchy social blurb from the first non-heading paragraph.
  const blurb = useMemo(() => {
    const first = body
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .find((p) => p && !p.startsWith("#") && !p.startsWith(">")) ?? "";
    const plain = first.replace(/[*_`#>\[\]()]/g, "").trim();
    return plain.length > 220 ? plain.slice(0, 217).trimEnd() + "…" : plain;
  }, [body]);

  const tweetText = `${title}\n\n${blurb}`.slice(0, 270);
  const tagline = lang === "ar" ? "— كُتب باستخدام كويل" : "— Written with Quill";
  const linkedinText = `${title}\n\n${blurb}\n\n${tagline}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
  const liUrl = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(linkedinText)}`;

  const copyForLinkedin = async () => {
    await navigator.clipboard.writeText(linkedinText);
    toast.success(t("share.copied"));
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button onClick={copy} className="flex items-center gap-2 rounded-full border border-ink/20 px-4 py-2 text-sm hover:bg-ink/5">
          <Copy className="h-4 w-4" /> {t("post.copy.md")}
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-full border border-ink/20 px-4 py-2 text-sm hover:bg-ink/5"
        >
          {editing ? t("post.preview") : t("post.edit")}
        </button>
        {editing && (
          <button
            onClick={save}
            disabled={busy}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50"
          >
            {t("post.save")}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border-0 border-b border-ink/10 bg-transparent pb-3 font-serif text-3xl tracking-tight focus:outline-none focus:ring-0 sm:text-4xl"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={28}
            className="w-full resize-y rounded-lg border border-ink/15 bg-white p-4 font-mono text-sm leading-relaxed focus:border-brand focus:outline-none"
          />
        </div>
      ) : (
        <article className="prose prose-quill max-w-none">
          <h1 className="!font-serif !text-3xl !leading-tight sm:!text-5xl">{title}</h1>
          <ReactMarkdown>{body}</ReactMarkdown>
        </article>
      )}

      <div className="mt-12 rounded-2xl border border-ink/10 bg-white p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <RefreshCw className="h-4 w-4 text-brand" /> {t("post.tweak.title")}
        </div>
        <p className="mt-1 text-sm text-ink/60">{t("post.tweak.hint")}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={tweak}
            onChange={(e) => setTweak(e.target.value)}
            placeholder={t("post.tweak.placeholder")}
            className="flex-1 rounded-md border border-ink/15 bg-paper px-3 py-2 focus:border-brand focus:outline-none"
          />
          <LengthSelect value={length} onChange={setLength} />
          <button
            onClick={regenerate}
            disabled={!tweak.trim() || busy}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? t("post.tweak.rewriting") : t("post.tweak.rewrite")}
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-brand/20 bg-brand/5">
        <div className="flex items-start gap-3 p-5">
          <Share2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div className="flex-1">
            <h3 className="font-serif text-xl text-ink">{t("share.title")}</h3>
            <p className="mt-1 text-sm text-ink/70">{t("share.body")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={xUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
              >
                <Twitter className="h-4 w-4" /> {t("share.x")}
              </a>
              <a
                href={liUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <Linkedin className="h-4 w-4" /> {t("share.li")}
              </a>
              <button
                onClick={copyForLinkedin}
                className="flex items-center gap-2 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5"
              >
                <Copy className="h-4 w-4" /> {t("share.copy")}
              </button>
            </div>
            {blurb && (
              <p className="mt-4 rounded-md border border-ink/10 bg-white/70 p-3 text-sm italic text-ink/70">
                "{blurb}"
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
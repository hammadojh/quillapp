import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getPost, updatePost, generateBlogPost, deletePost, regenerateThumbnail } from "@/lib/posts.functions";
import { thumbUrl } from "@/lib/thumb-url";
import { setPostVisibility, setPostFeedInclusion } from "@/lib/social.functions";
import { getMyStyle } from "@/lib/style.functions";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Copy, RefreshCw, Trash2, Send, Mic, Square, Volume2, Play, Pause, Share2, Linkedin, Twitter, Loader2, Globe, Lock, Link as LinkIcon, ExternalLink, Rss } from "lucide-react";
import { toast } from "sonner";
import { useT, LangToggle, type Lang } from "@/lib/i18n";
import { Switch } from "@/components/ui/switch";
import { StyleWizard } from "@/components/StyleWizard";

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
  const thumbFn = useServerFn(regenerateThumbnail);
  const deleteFn = useServerFn(deletePost);

  const { data: post, isLoading } = useQuery({
    queryKey: ["post", postId],
    queryFn: () => getFn({ data: { id: postId } }),
  });

  const [justGenerated, setJustGenerated] = useState(false);

  if (isLoading || !post) {
    return (
      <div className="min-h-screen bg-paper p-10 text-ink/50">…</div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-5 sm:px-10 sm:py-6">
        <div className="flex items-center gap-2">
          <LangToggle />
          <button
            onClick={async () => {
              if (!confirm(t("post.delete.confirm"))) return;
              await deleteFn({ data: { id: postId } });
              qc.invalidateQueries({ queryKey: ["posts"] });
              navigate({ to: "/dashboard" });
            }}
            className="flex items-center gap-2 rounded-full border border-brand/20 px-3 py-1.5 text-xs font-medium text-brand/70 hover:bg-brand/5"
            aria-label={t("post.delete")}
          >
            <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">{t("post.delete")}</span>
          </button>
        </div>
        <Link to="/dashboard" className="flex items-center gap-2 font-serif text-2xl font-bold tracking-tight text-brand sm:text-3xl">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> <span className="truncate">{t("brand")}</span>
        </Link>
      </header>

      {post.status === "generated" && justGenerated ? (
        <ReadyView post={post as any} onRead={() => setJustGenerated(false)} />
      ) : post.status === "generated" ? (
        <GeneratedView
          post={post as any}
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
          thumbFn={thumbFn}
          onGenerated={() => {
            setJustGenerated(true);
            qc.invalidateQueries({ queryKey: ["post", postId] });
          }}
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
  thumbFn,
  onGenerated,
}: {
  postId: string;
  initialMessages: UIMessage[];
  updateFn: ReturnType<typeof useServerFn<typeof updatePost>>;
  generateFn: ReturnType<typeof useServerFn<typeof generateBlogPost>>;
  thumbFn: ReturnType<typeof useServerFn<typeof regenerateThumbnail>>;
  onGenerated: () => void;
}) {
  const { t, lang } = useT();
  const langRef = useRef<Lang>(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  const styleFn = useServerFn(getMyStyle);
  const { data: myStyle } = useQuery({ queryKey: ["my-style"], queryFn: () => styleFn() });
  const styleRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    styleRef.current = myStyle?.style_profile?.summary || undefined;
  }, [myStyle]);
  const [styleGateOpen, setStyleGateOpen] = useState(false);
  const [pendingGenerate, setPendingGenerate] = useState(false);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ language: langRef.current, style: styleRef.current }),
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
      let seed: string | null = null;
      if (typeof window !== "undefined") {
        seed = sessionStorage.getItem(`quill.seed.${postId}`);
        if (seed) sessionStorage.removeItem(`quill.seed.${postId}`);
      }
      sendMessage({
        text: seed && seed.trim()
          ? seed.trim()
          : (lang === "ar" ? "لنبدأ." : "Let's begin."),
      });
    }
  }, [messages.length, status, sendMessage, lang, postId]);

  // Persist messages whenever they change after a turn
  useEffect(() => {
    if (status !== "ready" || messages.length === 0) return;
    updateFn({
      data: { id: postId, interview_messages: messages as unknown as Array<unknown> },
    }).catch(() => {});
  }, [messages, status, postId, updateFn]);

  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  // Staged progress: rotating phrase during article gen, then title+brief card
  // during image gen so the wait feels alive.
  const [genStage, setGenStage] = useState<"writing" | "image">("writing");
  const [writingPhraseIdx, setWritingPhraseIdx] = useState(0);
  const [genPreview, setGenPreview] = useState<{ title: string; brief: string } | null>(null);
  const writingPhrases = [t("post.gen.style"), t("post.gen.writing"), t("post.gen.finalizing")];
  useEffect(() => {
    if (!generating || genStage !== "writing") return;
    const id = window.setInterval(() => {
      setWritingPhraseIdx((i) => (i + 1) % writingPhrases.length);
    }, 3500);
    return () => window.clearInterval(id);
  }, [generating, genStage, writingPhrases.length]);
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
    // Mandatory style gate: cannot publish without a defined style.
    if (!styleRef.current) {
      setStyleGateOpen(true);
      setPendingGenerate(true);
      toast.info(t("style.gate.required"));
      return;
    }
    setGenerating(true);
    setGenStage("writing");
    setWritingPhraseIdx(0);
    setGenPreview(null);
    try {
      const res = await generateFn({ data: { id: postId, language: lang } });
      // Extract a short brief: first non-heading paragraph, ~180 chars.
      const brief = (res.content ?? "")
        .split(/\n+/)
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("#") && !l.startsWith(">")) ?? "";
      setGenPreview({ title: res.title, brief: brief.slice(0, 180) });
      setGenStage("image");
      try {
        await thumbFn({ data: { id: postId } });
      } catch (e) {
        console.error("thumbnail failed", e);
      }
      toast.success(t("toast.ready"));
      onGenerated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate");
    } finally {
      setGenerating(false);
      setGenPreview(null);
    }
  };

  // Auto-trigger generation when AI emits the sentinel.
  const triggeredRef = useRef(false);
  useEffect(() => {
    if (triggeredRef.current || generating || status !== "ready") return;
    const last = messages.at(-1);
    if (!last || last.role !== "assistant") return;
    const text = last.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    if (text.includes(GEN_SENTINEL)) {
      triggeredRef.current = true;
      stopSpeaking();
      generate();
    }
  }, [messages, status, generating]);

  // Auto-play next unplayed assistant message when autoPlay is on.
  useEffect(() => {
    if (!voiceMode || !autoPlay) return;
    if (status !== "ready") return;
    if (playingId || loadingId) return;
    if (recording || transcribing) return;
    const next = messages.find((m) => {
      if (m.role !== "assistant") return false;
      if (playedIdsRef.current.has(m.id)) return false;
      const t = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
      if (!t || t.includes(GEN_SENTINEL)) return false;
      return true;
    });
    if (next) {
      const text = next.parts.map((p) => (p.type === "text" ? p.text : "")).join("").replace(GEN_SENTINEL, "").trim();
      playMessage(next.id, text);
    }
  }, [messages, status, autoPlay, voiceMode, playingId, loadingId, recording, transcribing]);

  const onPlayClick = (id: string, text: string) => {
    if (playingId === id || loadingId === id) {
      stopSpeaking();
      setAutoPlay(false);
      return;
    }
    // Mark all prior assistant messages as played so autoplay continues from this one.
    const idx = messages.findIndex((m) => m.id === id);
    messages.slice(0, idx).forEach((m) => {
      if (m.role === "assistant") playedIdsRef.current.add(m.id);
    });
    setAutoPlay(true);
    playMessage(id, text);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-65px)] max-w-3xl flex-col px-4 sm:px-6">
      {styleGateOpen && (
        <StyleWizard
          mandatory
          onClose={() => {
            setStyleGateOpen(false);
          }}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 py-3 sm:py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-ink/40 sm:text-xs">{t("post.interview.label")}</p>
          <h1 className="truncate font-serif text-xl sm:text-2xl">{t("post.interview.title")}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-ink/20 px-3 py-1.5 text-xs text-ink/70">
            <Volume2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t("post.voice")}</span>
            <Switch
              dir="ltr"
              className="h-6 w-11"
              thumbClassName="h-5 w-5 data-[state=checked]:translate-x-5"
              checked={voiceMode}
              onCheckedChange={(v) => {
                setVoiceMode(v);
                if (!v) {
                  stopSpeaking();
                  setAutoPlay(false);
                  if (recording) stopRecording();
                }
              }}
              aria-label={t("post.voice")}
            />
          </div>
        </div>
      </div>

      {generating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-paper p-6 text-center shadow-2xl sm:p-8">
            {genStage === "writing" || !genPreview ? (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/10">
                  <Loader2 className="h-7 w-7 animate-spin text-brand" />
                </div>
                <h2 key={writingPhraseIdx} className="mt-5 font-serif text-2xl text-ink transition-opacity duration-500">
                  {writingPhrases[writingPhraseIdx]}
                </h2>
                <p className="mt-2 text-sm text-ink/60">{t("post.generating.sub")}</p>
              </>
            ) : (
              <>
                <p className="text-[10px] uppercase tracking-widest text-brand">
                  {t("post.gen.draftLabel")}
                </p>
                <h2 className="mt-2 font-serif text-2xl leading-snug text-ink">
                  {genPreview.title}
                </h2>
                {genPreview.brief && (
                  <p className="mt-3 text-sm leading-relaxed text-ink/70 line-clamp-3">
                    {genPreview.brief}
                  </p>
                )}
                <div className="mt-6 flex items-center justify-center gap-2 text-sm text-ink/60">
                  <Loader2 className="h-4 w-4 animate-spin text-brand" />
                  {t("post.gen.image")}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto py-6">
        {messages.length === 0 && (
          <p className="text-center font-serif text-xl italic text-ink/40">
            {t("post.intro")}
          </p>
        )}
        {messages.map((m) => {
          const rawText = m.parts
            .map((p) => (p.type === "text" ? p.text : ""))
            .join("");
          const text = rawText.replace(GEN_SENTINEL, "").trim();
          if (m.role === "assistant" && !text) return null;
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-4 py-3 text-paper rtl:rounded-bl-sm rtl:rounded-br-2xl">
                  {text}
                </div>
              </div>
            );
          }
          const isPlaying = playingId === m.id;
          const isLoadingThis = loadingId === m.id;
          return (
            <div key={m.id} className="max-w-[90%]">
              <div className="text-xs uppercase tracking-widest text-brand/80">{t("brand")}</div>
              <div className="mt-1 whitespace-pre-wrap font-serif text-lg leading-relaxed">{text}</div>
              {voiceMode && (
                <button
                  type="button"
                  onClick={() => onPlayClick(m.id, text)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1 text-xs text-ink/70 hover:bg-ink/5"
                  aria-label={isPlaying ? t("post.pause") : t("post.play")}
                >
                  {isLoadingThis ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t("post.loading.voice")}
                    </>
                  ) : isPlaying ? (
                    <>
                      <Pause className="h-3.5 w-3.5" />
                      {t("post.pause")}
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      {t("post.play")}
                    </>
                  )}
                </button>
              )}
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

function ReadyView({ post, onRead }: { post: { id: string; title: string; share_id: string | null; is_public: boolean; thumbnail_url?: string | null }; onRead: () => void }) {
  const { t } = useT();
  const visibilityFn = useServerFn(setPostVisibility);
  const [sharing, setSharing] = useState(false);
  const thumbStamp = (post as any).thumbnail_url as string | null;

  const doShare = async () => {
    setSharing(true);
    try {
      let shareId = post.share_id;
      if (!post.is_public) {
        await visibilityFn({ data: { id: post.id, is_public: true } });
      }
      if (!shareId) shareId = post.share_id;
      const url = shareId
        ? `${window.location.origin}/p/${shareId}`
        : window.location.href;
      const shareData: ShareData = { title: post.title, url };
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try { await navigator.share(shareData); } catch (e) {
          if ((e as { name?: string })?.name !== "AbortError") throw e;
        }
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(t("post.share.copied"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSharing(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-brand">{t("toast.ready")}</p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight sm:text-4xl">{t("post.ready.title")}</h1>
        <p className="mt-2 text-ink/60">{t("post.ready.sub")}</p>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <div className="aspect-[1200/630] w-full bg-ink/5">
          {thumbStamp ? (
            <img src={thumbUrl(post.id, thumbStamp)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink/30">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>
        <div className="p-5">
          <h2 className="font-serif text-2xl leading-snug text-ink">{post.title}</h2>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onRead}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper hover:opacity-90"
        >
          {t("post.ready.read")}
        </button>
        <button
          onClick={doShare}
          disabled={sharing}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-3 text-sm font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
        >
          {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          {t("post.ready.share")}
        </button>
      </div>
    </main>
  );
}

function GeneratedView({
  post,
  onUpdated,
  updateFn,
  generateFn,
}: {
  post: { id: string; title: string; content: string; is_public: boolean; in_feed?: boolean; share_id: string | null };
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
      await generateFn({ data: { id: post.id, tweak, language: lang } });
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
  const publicUrl = post.share_id && typeof window !== "undefined"
    ? `${window.location.origin}/p/${post.share_id}`
    : "";
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}${publicUrl ? `&url=${encodeURIComponent(publicUrl)}` : ""}`;
  const liUrl = post.is_public && publicUrl
    ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicUrl)}`
    : `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(linkedinText)}`;

  const copyForLinkedin = async () => {
    await navigator.clipboard.writeText(linkedinText);
    toast.success(t("share.copied"));
  };

  const visibilityFn = useServerFn(setPostVisibility);
  const [isPublic, setIsPublic] = useState(post.is_public);
  useEffect(() => setIsPublic(post.is_public), [post.is_public]);
  const feedFn = useServerFn(setPostFeedInclusion);
  const [inFeed, setInFeed] = useState(!!post.in_feed);
  useEffect(() => setInFeed(!!post.in_feed), [post.in_feed]);
  const regenThumbFn = useServerFn(regenerateThumbnail);
  const [thumbBusy, setThumbBusy] = useState(false);
  const thumbStamp = (post as any).thumbnail_url as string | null;
  const regenThumb = async () => {
    setThumbBusy(true);
    try {
      await regenThumbFn({ data: { id: post.id } });
      toast.success(t("post.thumb.done"));
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not regenerate");
    } finally {
      setThumbBusy(false);
    }
  };
  const togglePublic = async (next: boolean) => {
    setIsPublic(next);
    if (!next) setInFeed(false);
    try {
      await visibilityFn({ data: { id: post.id, is_public: next } });
      toast.success(next ? t("post.privacy.public") : t("post.privacy.private"));
      onUpdated();
    } catch (e) {
      setIsPublic(!next);
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const toggleFeed = async (next: boolean) => {
    setInFeed(next);
    try {
      await feedFn({ data: { id: post.id, in_feed: next } });
      toast.success(next ? t("post.feed.on") : t("post.feed.off"));
      onUpdated();
    } catch (e) {
      setInFeed(!next);
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const copyLink = async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    toast.success(t("post.share.copied"));
  };

  const nativeShare = async () => {
    try {
      let pub = isPublic;
      if (!pub) {
        await togglePublic(true);
        pub = true;
      }
      const url = post.share_id
        ? `${window.location.origin}/p/${post.share_id}`
        : (typeof window !== "undefined" ? window.location.href : "");
      const shareData: ShareData = { title, text: blurb, url };
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share(shareData);
      } else if (url) {
        await navigator.clipboard.writeText(url);
        toast.success(t("post.share.copied"));
      }
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      toast.error(e instanceof Error ? e.message : "Failed");
    }
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

      {/* Privacy & share link */}
      <div className="mb-6 rounded-2xl border border-ink/10 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {isPublic ? <Globe className="h-5 w-5 text-brand" /> : <Lock className="h-5 w-5 text-ink/50" />}
            <div>
              <div className="text-sm font-medium">
                {isPublic ? t("post.privacy.public") : t("post.privacy.private")}
              </div>
              <div className="text-xs text-ink/55">
                {isPublic ? t("post.privacy.publicHint") : t("post.privacy.privateHint")}
              </div>
            </div>
          </div>
          <Switch
            dir="ltr"
            className="h-6 w-11"
            thumbClassName="h-5 w-5 data-[state=checked]:translate-x-5"
            checked={isPublic}
            onCheckedChange={togglePublic}
            aria-label={t("post.privacy.label")}
          />
        </div>
        {isPublic && publicUrl && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-md border border-ink/15 bg-paper px-3 py-2 text-xs text-ink/70">
              <LinkIcon className="h-3.5 w-3.5 shrink-0" />
              <span dir="ltr" className="truncate">{publicUrl}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={copyLink} className="rounded-md bg-ink px-3 py-2 text-xs font-medium text-paper hover:opacity-90">
                {t("post.share.copy")}
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-md border border-ink/15 px-3 py-2 text-xs hover:bg-ink/5"
              >
                <ExternalLink className="h-3 w-3" /> {t("post.share.view")}
              </a>
            </div>
          </div>
        )}
        {isPublic && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink/10 bg-paper p-3">
            <div className="flex items-center gap-3">
              <Rss className={`h-5 w-5 ${inFeed ? "text-brand" : "text-ink/40"}`} />
              <div>
                <div className="text-sm font-medium">{t("post.feed.title")}</div>
                <div className="text-xs text-ink/55">
                  {inFeed ? t("post.feed.onHint") : t("post.feed.offHint")}
                </div>
              </div>
            </div>
            <Switch
              dir="ltr"
              className="h-6 w-11"
              thumbClassName="h-5 w-5 data-[state=checked]:translate-x-5"
              checked={inFeed}
              onCheckedChange={toggleFeed}
              aria-label={t("post.feed.title")}
            />
          </div>
        )}
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-ink/10 bg-paper p-3 sm:flex-row sm:items-center">
            <div className="h-20 w-36 shrink-0 overflow-hidden rounded-md border border-ink/10 bg-white">
              {thumbStamp ? (
                <img
                  src={thumbUrl(post.id, thumbStamp)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-ink/40">
                  {t("post.thumb.none")}
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">{t("post.thumb.title")}</div>
              <div className="text-xs text-ink/55">{t("post.thumb.hint")}</div>
            </div>
            <button
              onClick={regenThumb}
              disabled={thumbBusy}
              className="flex items-center justify-center gap-1.5 rounded-md border border-ink/15 px-3 py-2 text-xs hover:bg-ink/5 disabled:opacity-60"
            >
              {thumbBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {thumbBusy ? t("post.thumb.working") : t("post.thumb.regen")}
            </button>
          </div>
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
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

      <div className="mt-8 mb-4">
        <button
          onClick={nativeShare}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-4 text-base font-semibold text-white shadow-sm hover:opacity-90"
        >
          <Share2 className="h-5 w-5" /> {t("share.native")}
        </button>
      </div>
    </main>
  );
}
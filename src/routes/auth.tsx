import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { useT, LangToggle } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Quill" },
      { name: "description", content: "Sign in to Quill to draft and save your blog posts." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/dashboard" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. You're in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign in failed");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-5 sm:px-6 sm:py-6">
        <Link to="/" className="font-serif text-2xl font-semibold tracking-tight">{t("brand")}</Link>
        <LangToggle />
      </header>
      <main className="mx-auto flex max-w-md flex-col px-4 pt-8 sm:px-6 sm:pt-10">
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
          {mode === "signin" ? t("auth.welcome.signin") : t("auth.welcome.signup")}
        </h1>
        <p className="mt-3 text-ink/70">
          {mode === "signin" ? t("auth.sub.signin") : t("auth.sub.signup")}
        </p>

        <button
          onClick={onGoogle}
          disabled={busy}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-md border border-ink/20 bg-white px-4 py-3 text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {t("auth.google")}
        </button>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-ink/40">
          <div className="h-px flex-1 bg-ink/10" /> {t("auth.or")} <div className="h-px flex-1 bg-ink/10" />
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder={t("auth.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-ink/20 bg-white px-4 py-3 text-ink placeholder-ink/40 focus:border-brand focus:outline-none"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder={t("auth.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-ink/20 bg-white px-4 py-3 text-ink placeholder-ink/40 focus:border-brand focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-ink px-4 py-3 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
          >
            {mode === "signin" ? t("auth.signin") : t("auth.create")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink/60">
          {mode === "signin" ? t("auth.new") : t("auth.have")}{" "}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="font-medium text-brand underline-offset-4 hover:underline"
          >
            {mode === "signin" ? t("auth.create") : t("auth.signin")}
          </button>
        </p>
      </main>
    </div>
  );
}
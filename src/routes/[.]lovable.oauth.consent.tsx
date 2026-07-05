import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AuthDetails = {
  client?: { name?: string; client_uri?: string } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
  scopes?: string[] | null;
} | null;

// The Supabase JS `auth.oauth` namespace is beta and not always in the shipped
// typings. Wrap the three methods we need so consumers stay type-safe.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthDetails; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthDetails; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthDetails; error: { message: string } | null }>;
};
const oauthApi = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      // Preserve the consent URL so the auth flow returns here after sign-in.
      const next = location.pathname + location.searchStr;
      if (typeof window !== "undefined") {
        sessionStorage.setItem("quill.afterAuth", next);
      }
      throw redirect({ to: "/auth" });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md px-6 py-16 text-ink">
      <h1 className="font-serif text-2xl">Authorization error</h1>
      <p className="mt-3 text-ink/70">{String((error as Error)?.message ?? error)}</p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData() as AuthDetails;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "an app";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauthApi().approveAuthorization(authorization_id)
      : await oauthApi().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16 text-ink">
      <h1 className="font-serif text-3xl tracking-tight">Connect {clientName} to Quill</h1>
      <p className="mt-3 text-ink/70">
        This will let {clientName} read and manage your Quill posts on your behalf.
      </p>
      {error ? (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="mt-8 flex flex-col gap-3">
        <button
          disabled={busy}
          onClick={() => decide(true)}
          className="w-full rounded-md bg-ink px-4 py-3 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          disabled={busy}
          onClick={() => decide(false)}
          className="w-full rounded-md border border-ink/20 bg-white px-4 py-3 text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-50"
        >
          Deny
        </button>
      </div>
    </main>
  );
}
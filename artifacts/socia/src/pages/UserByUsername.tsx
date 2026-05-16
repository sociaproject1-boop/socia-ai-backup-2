/**
 * /user/:username — resolves the username to a user-id, then redirects
 * to /profile/:id (which has the full UI). Falls back to a not-found
 * card if no user matches.
 */
import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function UserByUsername() {
  const [, params]   = useRoute("/user/:username");
  const [, navigate] = useLocation();
  const username     = params?.username ?? "";

  const [state, setState] = useState<"loading" | "notfound">("loading");

  useEffect(() => {
    if (!username) { setState("notfound"); return; }
    let cancelled = false;
    (async () => {
      const handle = username.replace(/^@/, "").trim().toLowerCase();
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .ilike("username", handle)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setState("notfound");
        return;
      }
      navigate(`/profile/${(data as any).id}`, { replace: true });
    })();
    return () => { cancelled = true; };
  }, [username, navigate]);

  if (state === "notfound") {
    return (
      <div className="app-bg flex h-full flex-col">
        <div
          className="app-header flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--s-border-a)" }}
        >
          <button
            onClick={() => (history.length > 1 ? history.back() : navigate("/"))}
            aria-label="Back"
            className="app-surface grid h-9 w-9 place-items-center rounded-full app-text"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-base font-semibold app-text">User not found</h1>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm font-semibold app-text">@{username}</p>
          <p className="text-xs app-text-muted">No user with that handle exists.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg flex h-full items-center justify-center">
      <div className="text-sm app-text-muted">Loading profile…</div>
    </div>
  );
}

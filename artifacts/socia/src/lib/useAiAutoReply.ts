/**
 * useAiAutoReply.ts — fetches and toggles the AI auto-reply feature.
 * Only functional for the admin account (is_owner = true).
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";

export type AiMode = "online" | "offline";

export interface AiAutoReplyStatus {
  enabled: boolean;
  mode:    AiMode;
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function useAiAutoReply(isOwner: boolean | undefined) {
  const [enabled, setEnabled] = useState(false);
  const [mode,    setMode]    = useState<AiMode>("offline");
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (!isOwner || fetched.current) return;
    fetched.current = true;

    (async () => {
      try {
        const token = await getToken();
        if (!token) { setLoading(false); return; }

        const res = await fetch("/api/ai-auto-reply/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as AiAutoReplyStatus;
          setEnabled(data.enabled);
          setMode(data.mode);
        }
      } catch {
        /* non-critical — default to off */
      } finally {
        setLoading(false);
      }
    })();
  }, [isOwner]);

  const toggle = useCallback(
    async (nextEnabled: boolean, nextMode?: AiMode) => {
      const newMode = nextMode ?? mode;
      setSaving(true);
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch("/api/ai-auto-reply/toggle", {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            Authorization:   `Bearer ${token}`,
          },
          body: JSON.stringify({ enabled: nextEnabled, mode: newMode }),
        });
        if (res.ok) {
          setEnabled(nextEnabled);
          setMode(newMode);
        }
      } catch {
        /* ignore */
      } finally {
        setSaving(false);
      }
    },
    [mode],
  );

  return { enabled, mode, loading, saving, toggle };
}

/**
 * VoicePreview — Real-time TTS preview for a single scene's dialogue.
 *
 * Calls POST /api/voice/preview → fal.ai Kokoro TTS.
 * Renders an inline audio player when generation completes.
 * Requires FAL_KEY on the server; shows a clear error if missing.
 */

import { useState, useRef, useCallback } from "react";
import { Mic, Play, Pause, Loader2, AlertCircle, Volume2 } from "lucide-react";

interface VoicePreviewProps {
  dialogueText:  string;
  voiceType:     string;
  emotion:       string;
  disabled?:     boolean;
}

interface PreviewResult {
  audioUrl:    string;
  durationSec: number;
  voiceId:     string;
}

async function fetchToken(): Promise<string | null> {
  try {
    const { supabase } = await import("@/lib/supabase");
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch { return null; }
}

export default function VoicePreview({
  dialogueText,
  voiceType,
  emotion,
  disabled = false,
}: VoicePreviewProps) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const generate = useCallback(async () => {
    if (!dialogueText.trim() || disabled) return;
    setState("loading");
    setResult(null);
    setErrorMsg("");

    try {
      const token = await fetchToken();
      const res   = await fetch("/api/voice/preview", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ dialogueText: dialogueText.trim(), voiceType, emotion }),
      });

      const data = await res.json() as {
        audioUrl?: string; durationSec?: number; voiceId?: string;
        error?: string; code?: string; help?: string;
      };

      if (!res.ok || !data.audioUrl) {
        const msg = data.help ? `${data.error} ${data.help}` : (data.error ?? "Generation failed");
        throw new Error(msg);
      }

      setResult({ audioUrl: data.audioUrl, durationSec: data.durationSec ?? 0, voiceId: data.voiceId ?? "" });
      setState("ready");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Voice generation failed");
      setState("error");
    }
  }, [dialogueText, voiceType, emotion, disabled]);

  const togglePlay = useCallback(() => {
    if (!result || !audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [result, playing]);

  const isEmpty = !dialogueText.trim();

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {/* Generate button */}
      <button
        onClick={generate}
        disabled={disabled || isEmpty || state === "loading"}
        className={[
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all",
          isEmpty || disabled
            ? "cursor-not-allowed opacity-30 bg-white/[0.03] text-white/25"
            : state === "loading"
            ? "bg-purple-500/15 text-purple-300 cursor-wait"
            : "bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 border border-purple-500/30",
        ].join(" ")}
      >
        {state === "loading" ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
        ) : (
          <><Mic className="h-3.5 w-3.5" /> Preview Voice</>
        )}
      </button>

      {/* Audio player */}
      {state === "ready" && result && (
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2">
          <button
            onClick={togglePlay}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-0.5" />}
          </button>
          <Volume2 className="h-3.5 w-3.5 text-white/30 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-white/60 truncate">{result.voiceId}</p>
            <p className="text-[10px] text-white/30">{result.durationSec.toFixed(1)}s</p>
          </div>
          <audio
            ref={audioRef}
            src={result.audioUrl}
            onEnded={() => setPlaying(false)}
            onPause={() => setPlaying(false)}
            preload="auto"
          />
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="flex items-start gap-1.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-red-300 leading-relaxed">{errorMsg}</p>
        </div>
      )}
    </div>
  );
}

/**
 * PulseAdmin.tsx — Admin panel for PULSE moderation.
 * Owner-only route: /pulse-admin
 */
import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Trash2, AlertTriangle, Eye, RefreshCw, ShieldCheck } from "lucide-react";
import { fetchReportedPulses, adminDeletePulse } from "@/lib/pulseClient";
import { useAppStore } from "@/lib/store";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor(diff / 60_000);
  if (h >= 1) return `${h}h ago`;
  if (m >= 1) return `${m}m ago`;
  return "just now";
}

export default function PulseAdmin() {
  const [, navigate]   = useLocation();
  const user           = useAppStore((s) => s.user);
  const [pulses, setPulses]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchReportedPulses();
      setPulses(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async (id: string) => {
    setRemoving((prev) => new Set([...prev, id]));
    try {
      await adminDeletePulse(id);
      setPulses((prev) => prev.filter((p) => p.id !== id));
    } catch { /* ignore */ }
    finally {
      setRemoving((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, []);

  if (!user?.isOwner) {
    return (
      <div className="h-full flex items-center justify-center app-text-muted text-sm">
        Admin access required.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto app-bg pb-24">
      {/* Header */}
      <div className="app-header sticky top-0 z-10 flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => navigate("/admin")}
          className="grid h-9 w-9 place-items-center rounded-full app-surface"
        >
          <ArrowLeft className="h-4 w-4 app-text" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold app-text">Pulse Moderation</h1>
          <p className="text-[11px] app-text-muted">{pulses.length} reported</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={load}
          className="grid h-9 w-9 place-items-center rounded-full app-surface"
        >
          <RefreshCw className="h-4 w-4 app-text-muted" />
        </motion.button>
      </div>

      {loading ? (
        <div className="space-y-3 px-4 pt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl app-surface p-4 space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full shimmer" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 rounded shimmer" />
                  <div className="h-2.5 w-20 rounded shimmer" />
                </div>
              </div>
              <div className="h-32 rounded-xl shimmer" />
            </div>
          ))}
        </div>
      ) : pulses.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 mt-20 px-8 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full app-surface">
            <ShieldCheck className="h-8 w-8" style={{ color: "var(--accent-primary)" }} />
          </div>
          <h3 className="text-base font-bold app-text">All clear</h3>
          <p className="text-sm app-text-muted">No reported Pulses at the moment.</p>
        </div>
      ) : (
        <div className="space-y-3 px-4 pt-4">
          {pulses.map((pulse) => {
            const isRemoving = removing.has(pulse.id);
            const author = pulse.user ?? {};
            const initials = (author.name ?? author.username ?? "?").charAt(0).toUpperCase();

            return (
              <motion.div
                key={pulse.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl overflow-hidden app-surface"
              >
                {/* Author */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="h-10 w-10 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-600 to-pink-500 grid place-items-center text-sm font-bold text-white">
                    {author.avatar_url
                      ? <img src={author.avatar_url} className="h-full w-full object-cover" alt="" />
                      : initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold app-text truncate">{author.name ?? author.username ?? "Unknown"}</p>
                    <p className="text-[11px] app-text-muted">{timeAgo(pulse.created_at)} • {pulse.type} pulse</p>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-red-400"
                    style={{ background: "rgba(239,68,68,0.12)" }}>
                    <AlertTriangle className="h-3 w-3" />
                    Reported
                  </div>
                </div>

                {/* Content preview */}
                {pulse.type === "image" && pulse.media_url && (
                  <div className="mx-4 mb-3 rounded-xl overflow-hidden" style={{ maxHeight: 200 }}>
                    <img src={pulse.media_url} className="w-full h-full object-cover" alt="Pulse media" />
                  </div>
                )}
                {pulse.type === "video" && pulse.media_url && (
                  <div className="mx-4 mb-3 rounded-xl overflow-hidden" style={{ maxHeight: 200 }}>
                    {previewId === pulse.id
                      ? <video src={pulse.media_url} className="w-full" controls autoPlay />
                      : <div
                          className="h-32 flex items-center justify-center cursor-pointer app-surface rounded-xl"
                          onClick={() => setPreviewId(pulse.id)}
                        >
                          <Eye className="h-6 w-6 app-text-muted" />
                          <span className="ml-2 text-sm app-text-muted">Preview video</span>
                        </div>
                    }
                  </div>
                )}
                {pulse.type === "text" && (
                  <div
                    className="mx-4 mb-3 rounded-xl p-4 flex items-center justify-center min-h-[60px]"
                    style={{ background: pulse.text_bg ?? "#0f0f23" }}
                  >
                    <p className="text-sm font-bold text-center" style={{ color: pulse.text_color ?? "#fff" }}>
                      {pulse.text_content}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 px-4 pb-4">
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={() => handleDelete(pulse.id)}
                    disabled={isRemoving}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-red-400 disabled:opacity-50"
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}
                  >
                    <Trash2 className="h-4 w-4" />
                    {isRemoving ? "Removing…" : "Remove Pulse"}
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

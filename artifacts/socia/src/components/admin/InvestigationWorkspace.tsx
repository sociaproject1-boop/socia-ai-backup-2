/**
 * Fraud investigation workspace.
 * Split-screen: left panel (suspect), right panel (comparison or evidence).
 * Shared event timeline at the bottom.
 */
import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, RefreshCw, Copy, ExternalLink, GitCompare,
  LayoutPanelLeft, Clock, AlertTriangle, Shield, User,
  ChevronDown, ChevronUp, FileText, TrendingUp,
} from "lucide-react";
import { adminFetch } from "@/lib/adminAuth";

/* ── Types ──────────────────────────────────────────────────────────── */
interface Receipt {
  id: string; user_id: string; fraud_score: number | null;
  verification_status: string; amount: number | null;
  manual_reference: string | null; image_url: string | null;
  created_at: string; ocr_text: string | null;
  structure_score: number | null; extracted_payment_method: string | null;
}
interface UserProfile {
  id: string; email: string | null; name: string | null;
  username: string | null; avatar_url: string | null;
  created_at: string; is_frozen: boolean | null; freeze_reason: string | null;
}
interface SubjectData {
  user: UserProfile | null;
  receipts: Receipt[];
  total_receipts: number;
  max_score: number;
  blocked_count: number;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
function copy(t: string) { void navigator.clipboard.writeText(t); }

const SCORE_COLOR = (s: number) =>
  s >= 80 ? "text-red-400" : s >= 60 ? "text-orange-400" : s >= 40 ? "text-yellow-400" : "text-emerald-400";

const STATUS_COLOR: Record<string, string> = {
  blocked:   "text-red-400 bg-red-500/10 border-red-500/30",
  suspicious: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  approved:  "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  pending:   "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1_000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

/* ── Subject search ─────────────────────────────────────────────────── */
function SubjectSearch({ onSelect }: { onSelect: (userId: string) => void }) {
  const [q, setQ]           = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((query: string) => {
    clearTimeout(debounce.current ?? undefined);
    if (!query.trim()) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await adminFetch<{ users: UserProfile[] }>(`/admin/users?search=${encodeURIComponent(query)}&limit=6`);
        setResults(res.users ?? []);
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
  }, []);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
        {loading ? <RefreshCw size={14} className="animate-spin text-white/30" /> : <Search size={14} className="text-white/30" />}
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); search(e.target.value); }}
          placeholder="Search user by name, email, or UUID…"
          className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
        />
        {q && (
          <button onClick={() => { setQ(""); setResults([]); }} className="text-white/30 hover:text-white/60">✕</button>
        )}
      </div>
      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-[#0b1220] border border-white/10 rounded-lg overflow-hidden shadow-2xl">
          {results.map((u) => (
            <button key={u.id}
              onClick={() => { onSelect(u.id); setResults([]); setQ(u.name ?? u.email ?? u.id); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-left">
              <div className="h-7 w-7 rounded-full bg-indigo-500/30 flex items-center justify-center flex-shrink-0">
                <User size={13} className="text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{u.name ?? u.username ?? "(no name)"}</div>
                <div className="text-[10px] text-white/40 truncate">{u.email ?? u.id}</div>
              </div>
              {u.is_frozen && <span className="text-[10px] text-red-400 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">Frozen</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Profile card ────────────────────────────────────────────────────── */
function ProfileCard({ data, label }: { data: SubjectData; label: "A" | "B" }) {
  const colors: Record<"A"|"B", string> = { A: "indigo", B: "violet" };
  const c = colors[label];
  const u = data.user;

  return (
    <div className={`rounded-xl border border-${c}-500/20 bg-${c}-500/5 p-4 space-y-4`}>
      {/* User header */}
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-full bg-${c}-500/20 flex items-center justify-center flex-shrink-0`}>
          <span className={`text-sm font-bold text-${c}-400`}>{label}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white truncate">
              {u?.name ?? u?.username ?? "(unknown)"}
            </span>
            {u?.is_frozen && <span className="text-[10px] text-red-400 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">Frozen</span>}
          </div>
          <div className="text-[10px] text-white/40 truncate mt-0.5">{u?.email ?? "—"}</div>
          <div className="text-[10px] font-mono text-white/30 truncate">{u?.id}</div>
        </div>
        <button onClick={() => u && copy(u.id)} className="text-white/20 hover:text-white/50"><Copy size={11} /></button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Total",   val: data.total_receipts,                 color: "text-white" },
          { label: "Blocked", val: data.blocked_count,                  color: "text-red-400" },
          { label: "Max",     val: data.max_score,                      color: SCORE_COLOR(data.max_score) },
        ].map((s) => (
          <div key={s.label} className="rounded bg-white/5 p-2 text-center">
            <div className={`text-lg font-bold ${s.color}`}>{s.val}</div>
            <div className="text-[9px] text-white/40">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Receipt list */}
      <div className="space-y-1.5 max-h-52 overflow-y-auto scrollbar-thin">
        {data.receipts.slice(0, 10).map((r) => (
          <div key={r.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/5 border border-white/5">
            <span className={`text-xs font-bold ${SCORE_COLOR(r.fraud_score ?? 0)}`}>
              {r.fraud_score ?? "?"}
            </span>
            <span className={`text-[9px] px-1 py-0.5 rounded border ${STATUS_COLOR[r.verification_status] ?? STATUS_COLOR.pending}`}>
              {r.verification_status}
            </span>
            <span className="text-[10px] text-white/40 flex-1 truncate">{r.manual_reference ?? "—"}</span>
            <span className="text-[9px] text-white/30">{timeAgo(r.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Diff compare ────────────────────────────────────────────────────── */
function CompareRow({ label, a, b }: { label: string; a: string | number; b: string | number }) {
  const diff = a !== b;
  return (
    <div className={`flex items-center gap-0 rounded-lg overflow-hidden border ${diff ? "border-yellow-500/20" : "border-white/5"}`}>
      <div className="w-28 px-2 py-1.5 bg-white/5 text-[10px] text-white/50 flex-shrink-0">{label}</div>
      <div className={`flex-1 px-2 py-1.5 text-xs ${diff ? "text-indigo-300" : "text-white/60"}`}>{a}</div>
      <div className={`w-px self-stretch ${diff ? "bg-yellow-500/30" : "bg-white/5"}`} />
      <div className={`flex-1 px-2 py-1.5 text-xs ${diff ? "text-violet-300" : "text-white/60"}`}>{b}</div>
    </div>
  );
}

function DiffPanel({ a, b }: { a: SubjectData; b: SubjectData }) {
  if (!a.user || !b.user) return null;
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Side-by-Side Comparison</h3>
      <div className="flex items-center gap-0 rounded-lg overflow-hidden border border-white/5 mb-1">
        <div className="w-28 px-2 py-1 bg-white/8 text-[9px] text-white/30 flex-shrink-0">Field</div>
        <div className="flex-1 px-2 py-1 text-[9px] font-bold text-indigo-400 bg-indigo-500/5">Account A</div>
        <div className="w-px self-stretch bg-white/5" />
        <div className="flex-1 px-2 py-1 text-[9px] font-bold text-violet-400 bg-violet-500/5">Account B</div>
      </div>
      <CompareRow label="Total receipts" a={a.total_receipts} b={b.total_receipts} />
      <CompareRow label="Blocked"        a={a.blocked_count}   b={b.blocked_count} />
      <CompareRow label="Max score"      a={a.max_score}       b={b.max_score} />
      <CompareRow label="Frozen"         a={a.user.is_frozen ? "Yes" : "No"} b={b.user.is_frozen ? "Yes" : "No"} />
      <CompareRow label="Joined"         a={new Date(a.user.created_at).toLocaleDateString()} b={new Date(b.user.created_at).toLocaleDateString()} />
    </div>
  );
}

/* ── Timeline ────────────────────────────────────────────────────────── */
interface TimelineEntry { time: string; userId: string; label: "A"|"B"; action: string; score: number | null; status: string }

function MergedTimeline({ subjectA, subjectB }: { subjectA: SubjectData; subjectB: SubjectData | null }) {
  const entries: TimelineEntry[] = [
    ...subjectA.receipts.map((r) => ({
      time: r.created_at, userId: r.user_id, label: "A" as const,
      action: `Receipt ${r.verification_status}`, score: r.fraud_score, status: r.verification_status,
    })),
    ...(subjectB?.receipts ?? []).map((r) => ({
      time: r.created_at, userId: r.user_id, label: "B" as const,
      action: `Receipt ${r.verification_status}`, score: r.fraud_score, status: r.verification_status,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  if (!entries.length)
    return <p className="text-center text-white/30 py-8 text-sm">No events to display</p>;

  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-0 bottom-0 w-px bg-white/5" />
      <div className="space-y-2">
        {entries.slice(0, 40).map((e, i) => (
          <div key={i} className="relative flex items-start gap-3">
            <div className={`absolute -left-4 top-1.5 h-2 w-2 rounded-full flex-shrink-0 ${
              e.label === "A" ? "bg-indigo-500" : "bg-violet-500"
            }`} />
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${
              e.label === "A" ? "bg-indigo-500/20 text-indigo-400" : "bg-violet-500/20 text-violet-400"
            }`}>{e.label}</span>
            <span className="text-[10px] text-white/50 flex-shrink-0">{timeAgo(e.time)}</span>
            <span className="text-xs text-white/70 flex-1">{e.action}</span>
            {e.score !== null && (
              <span className={`text-xs font-bold flex-shrink-0 ${SCORE_COLOR(e.score)}`}>{e.score}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────── */
export default function InvestigationWorkspace() {
  const [subjectAId, setSubjectAId] = useState<string | null>(null);
  const [subjectBId, setSubjectBId] = useState<string | null>(null);
  const [dataA, setDataA]           = useState<SubjectData | null>(null);
  const [dataB, setDataB]           = useState<SubjectData | null>(null);
  const [loadingA, setLoadingA]     = useState(false);
  const [loadingB, setLoadingB]     = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);

  const loadSubject = useCallback(async (userId: string, side: "A" | "B") => {
    const setLoading = side === "A" ? setLoadingA : setLoadingB;
    const setData    = side === "A" ? setDataA    : setDataB;
    setLoading(true);
    try {
      const [userRes, recRes] = await Promise.allSettled([
        adminFetch<{ user: UserProfile }>(`/admin/users/${userId}`),
        adminFetch<{ receipts: Receipt[]; total: number }>(`/admin/receipts?user_id=${userId}&limit=30`),
      ]);
      const user      = userRes.status     === "fulfilled" ? userRes.value.user          : null;
      const receipts  = recRes.status      === "fulfilled" ? (recRes.value.receipts ?? []) : [];
      const maxScore  = receipts.reduce((m, r) => Math.max(m, r.fraud_score ?? 0), 0);
      const blocked   = receipts.filter((r) => r.verification_status === "blocked").length;
      setData({ user, receipts, total_receipts: recRes.status === "fulfilled" ? recRes.value.total : receipts.length, max_score: maxScore, blocked_count: blocked });
    } finally {
      setLoading(false);
    }
  }, []);

  const selectA = useCallback((id: string) => {
    setSubjectAId(id);
    void loadSubject(id, "A");
  }, [loadSubject]);

  const selectB = useCallback((id: string) => {
    setSubjectBId(id);
    void loadSubject(id, "B");
  }, [loadSubject]);

  const showDiff = dataA !== null && dataB !== null;

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      {/* Header */}
      <div className="flex-shrink-0">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <LayoutPanelLeft size={18} className="text-indigo-400" />
          Investigation Workspace
        </h2>
        <p className="text-xs text-white/40 mt-0.5">Split-screen account investigation with side-by-side comparison</p>
      </div>

      {/* Search row */}
      <div className="grid grid-cols-2 gap-3 flex-shrink-0">
        <div>
          <p className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider mb-1.5">Account A — Suspect</p>
          <SubjectSearch onSelect={selectA} />
        </div>
        <div>
          <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider mb-1.5">Account B — Comparison</p>
          <SubjectSearch onSelect={selectB} />
        </div>
      </div>

      {/* Panels */}
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 space-y-4">
        {/* Profile panels */}
        {(dataA ?? dataB) && (
          <div className="grid grid-cols-2 gap-3">
            {dataA
              ? <ProfileCard data={dataA} label="A" />
              : <div className="rounded-xl border border-indigo-500/10 bg-indigo-500/5 p-8 flex items-center justify-center">
                  <p className="text-sm text-white/30">Search for Account A</p>
                </div>
            }
            {dataB
              ? <ProfileCard data={dataB} label="B" />
              : <div className="rounded-xl border border-violet-500/10 bg-violet-500/5 p-8 flex items-center justify-center">
                  <p className="text-sm text-white/30">Search for Account B to compare</p>
                </div>
            }
          </div>
        )}

        {/* Loading state */}
        {(loadingA || loadingB) && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw size={18} className="animate-spin text-white/20" />
          </div>
        )}

        {/* Comparison */}
        {showDiff && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-white/8 bg-[#0d1626] p-4">
            <div className="flex items-center gap-2 mb-3">
              <GitCompare size={14} className="text-yellow-400" />
              <span className="text-sm font-semibold text-white">Account Comparison</span>
            </div>
            <DiffPanel a={dataA!} b={dataB!} />
          </motion.div>
        )}

        {/* Timeline */}
        {dataA && (
          <div className="rounded-xl border border-white/8 bg-[#0d1626]">
            <button
              onClick={() => setTimelineOpen((o) => !o)}
              className="w-full flex items-center gap-2 px-4 py-3">
              <Clock size={14} className="text-blue-400" />
              <span className="text-sm font-semibold text-white flex-1 text-left">
                Merged Event Timeline
                <span className="ml-2 text-[10px] text-white/40 font-normal">
                  ({dataA.receipts.length + (dataB?.receipts.length ?? 0)} events)
                </span>
              </span>
              {timelineOpen ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
            </button>
            <AnimatePresence>
              {timelineOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                  className="border-t border-white/5 px-4 pb-4 max-h-72 overflow-y-auto scrollbar-thin">
                  <div className="mt-3">
                    <MergedTimeline subjectA={dataA} subjectB={dataB} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Empty state */}
        {!dataA && !dataB && !loadingA && !loadingB && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <LayoutPanelLeft size={40} className="text-white/10" />
            <div>
              <p className="text-sm text-white/40">Search for an account to begin investigation</p>
              <p className="text-xs text-white/20 mt-1">Add a second account to compare side-by-side</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

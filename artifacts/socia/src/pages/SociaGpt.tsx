import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Send, Trash2, Loader2, Sparkles, Copy, Check, RotateCcw,
  X, AlertCircle, Paperclip, Image as ImageIcon, Mic, Film, Upload, Zap, Crown,
} from "lucide-react";
import {
  useSociaGptStore, streamChat,
  type ChatMessage, type ChatAttachment,
} from "@/lib/sociaGptClient";
import { uploadSociaGptFile, detectAttachmentKind } from "@/lib/sociaGptUpload";
import { MessageMarkdown } from "@/components/socia-gpt/MessageMarkdown";
import { PendingChip, BubbleAttachments, type PendingAttachment } from "@/components/socia-gpt/Attachments";
import { AIPlanBadge } from "@/components/socia-gpt/AIPlanBadge";
import { AIUpgradeModal } from "@/components/socia-gpt/AIUpgradeModal";
import { useAIPlanStore } from "@/lib/aiPlanClient";

const MODEL_LABELS: Record<string, string> = {
  "gpt-4o-mini": "GPT-4o Mini",
  "gpt-4o":      "GPT-4o",
  "o1-mini":     "o1-mini",
};

export default function SociaGpt() {
  const [, navigate]  = useLocation();
  const messages      = useSociaGptStore((s) => s.messages);
  const mode          = useSociaGptStore((s) => s.mode);
  const clear         = useSociaGptStore((s) => s.clear);
  const removeMessage = useSociaGptStore((s) => s.removeMessage);

  const { plan, refresh: refreshPlan } = useAIPlanStore();

  const [input,       setInput]       = useState("");
  const [busy,        setBusy]        = useState(false);
  const [pending,     setPending]     = useState<PendingAttachment[]>([]);
  const [dragOver,    setDragOver]    = useState(false);
  const [attachOpen,  setAttachOpen]  = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);

  const abortRef      = useRef<AbortController | null>(null);
  const scrollerRef   = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    useAIPlanStore.setState({ lastFetched: null });
    void refreshPlan();
  }, [refreshPlan]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function startCooldown(seconds: number) {
    setCooldownSec(seconds);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldownSec((s) => {
        if (s <= 1) { clearInterval(cooldownTimer.current!); cooldownTimer.current = null; return 0; }
        return s - 1;
      });
    }, 1000);
  }
  useEffect(() => () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); }, []);

  const planCode  = plan?.code ?? "free";
  const maxWords  = plan?.maxWords ?? 300;
  const wordCount = input.trim() ? input.trim().split(/\s+/).length : 0;
  const overLimit = planCode === "free" && wordCount > maxWords;
  const modelLabel = MODEL_LABELS[plan?.model ?? "gpt-4o-mini"] ?? plan?.model ?? "GPT-4o Mini";

  const addFiles = useCallback(async (files: File[]) => {
    setGlobalError(null);
    const fresh: PendingAttachment[] = [];
    for (const f of files) {
      const kind = detectAttachmentKind(f);
      if (!kind) { setGlobalError(`Unsupported file: ${f.name}`); continue; }
      if (planCode === "free" && (kind === "audio" || kind === "video")) {
        setGlobalError("Audio & video attachments require Premium AI. Tap the badge to upgrade.");
        continue;
      }
      const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      fresh.push({ id, file: f, kind, previewUrl: URL.createObjectURL(f), uploading: true });
    }
    if (fresh.length === 0) return;
    setPending((p) => [...p, ...fresh]);
    await Promise.all(fresh.map(async (att) => {
      try {
        const uploaded = await uploadSociaGptFile(att.file);
        setPending((p) => p.map((x) => x.id === att.id ? { ...x, uploaded, uploading: false } : x));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setPending((p) => p.map((x) => x.id === att.id ? { ...x, uploading: false, error: msg } : x));
      }
    }));
  }, [planCode]);

  function pickFiles(accept: string) {
    const ref = accept.startsWith("image") ? imageInputRef : accept.startsWith("audio") ? audioInputRef : videoInputRef;
    ref.current?.click();
    setAttachOpen(false);
  }

  function removePending(id: string) {
    setPending((p) => {
      const target = p.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return p.filter((x) => x.id !== id);
    });
  }

  useEffect(() => {
    function onDrag(e: DragEvent) {
      if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setDragOver(true); }
    }
    function onLeave(e: DragEvent) { if (e.relatedTarget === null) setDragOver(false); }
    function onDrop(e: DragEvent) {
      setDragOver(false);
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      void addFiles(Array.from(e.dataTransfer.files));
    }
    window.addEventListener("dragenter", onDrag);
    window.addEventListener("dragover",  onDrag);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop",      onDrop);
    return () => {
      window.removeEventListener("dragenter", onDrag);
      window.removeEventListener("dragover",  onDrag);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop",      onDrop);
    };
  }, [addFiles]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (pending.some((p) => p.uploading)) return;
    const ready = pending.filter((p) => p.uploaded && !p.error).map((p) => p.uploaded!);
    if (!trimmed && ready.length === 0) return;
    if (busy || cooldownSec > 0) return;
    if (overLimit) { setGlobalError(`Message too long. Free AI allows max ${maxWords} words.`); return; }

    setInput(""); setBusy(true); setGlobalError(null);
    pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPending([]);

    const store = useSociaGptStore.getState();
    store.addUser(trimmed || "(see attached)", ready);
    const placeholder = store.addAssistantPlaceholder();
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;

    const history = useSociaGptStore.getState().messages
      .filter((m) => !m.pending).slice(-30)
      .map((m) => ({ role: m.role, content: m.content, attachments: m.attachments }));

    try {
      await streamChat({
        history, mode,
        assistantId: placeholder.id,
        signal: ctl.signal,
        onDone: (meta) => {
          const cd = plan?.cooldownSec ?? 20;
          if (cd > 0) startCooldown(cd);
          if (meta?.used !== undefined) {
            const cur = useAIPlanStore.getState().usage;
            if (cur) useAIPlanStore.setState({ usage: { ...cur, used: meta.used } });
          }
        },
        onRateLimit: (retryAfterSec) => startCooldown(retryAfterSec),
      });
    } finally { setBusy(false); abortRef.current = null; }
  }

  function regenerate(assistantMsg: ChatMessage) {
    if (busy || cooldownSec > 0) return;
    removeMessage(assistantMsg.id);
    setBusy(true);
    const store = useSociaGptStore.getState();
    const placeholder = store.addAssistantPlaceholder();
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    const history = useSociaGptStore.getState().messages
      .filter((m) => !m.pending).slice(-30)
      .map((m) => ({ role: m.role, content: m.content, attachments: m.attachments }));
    streamChat({ history, mode, assistantId: placeholder.id, signal: ctl.signal })
      .finally(() => { setBusy(false); abortRef.current = null; });
  }

  function stop() { abortRef.current?.abort(); abortRef.current = null; }

  const canSend = !busy && cooldownSec === 0 && !overLimit && !pending.some((p) => p.uploading) &&
    (input.trim().length > 0 || pending.some((p) => p.uploaded && !p.error));

  return (
    <div className="relative flex h-full flex-col" style={{ background: "rgba(8,4,18,1)" }}>

      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(10,5,20,0.9)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => navigate("/create")}
          className="grid h-9 w-9 place-items-center rounded-full text-white/50 hover:text-white transition-colors shrink-0"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </motion.button>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px]"
            style={{
              background: "linear-gradient(135deg,#a855f7,#ec4899,#6366f1)",
              boxShadow: "0 4px 18px rgba(168,85,247,0.5)",
            }}
          >
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[15px] font-bold leading-none tracking-tight text-white">
                Socia <span className="text-gradient">GPT</span>
              </h1>
              {plan && (
                <button onClick={() => setUpgradeOpen(true)}>
                  <AIPlanBadge code={planCode} />
                </button>
              )}
            </div>
            <p className="mt-0.5 text-[10px] tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>
              {modelLabel} · multimodal
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => { if (confirm("Clear this conversation?")) { stop(); clear(); } }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/40 hover:text-white/70 transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            aria-label="Clear chat"
          >
            <Trash2 className="h-4 w-4" />
          </motion.button>
        )}
      </div>

      {/* ── Message scroller ── */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto"
        style={{ padding: "20px 16px 12px" }}
      >
        {messages.length === 0 ? (
          <EmptyState planCode={planCode} onUpgrade={() => setUpgradeOpen(true)} />
        ) : (
          <motion.div
            className="space-y-5"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
          >
            {messages.map((m) => (
              <Bubble key={m.id} m={m} onRegen={() => regenerate(m)} busy={busy} />
            ))}
          </motion.div>
        )}
      </div>

      {/* ── Cooldown strip ── */}
      <AnimatePresence>
        {cooldownSec > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="overflow-hidden"
            style={{ background: "rgba(168,85,247,0.06)" }}
          >
            <motion.div
              className="h-[2px]"
              style={{ background: "linear-gradient(90deg,#a855f7,#ec4899)" }}
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: cooldownSec, ease: "linear" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Composer ── */}
      <div
        className="px-3 pb-[max(env(safe-area-inset-bottom),14px)] pt-3"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(8,4,18,0.95)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        {pending.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="mb-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3"
          >
            {pending.map((p) => (
              <PendingChip key={p.id} att={p} onRemove={() => removePending(p.id)} />
            ))}
          </motion.div>
        )}

        <AnimatePresence>
          {globalError && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
              className="mb-2.5 flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-[12px] text-red-300"
              style={{ borderColor: "rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.07)" }}
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{globalError}</span>
              <button onClick={() => setGlobalError(null)} className="text-red-300/50 hover:text-red-200">
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2.5">
          {/* Attach button */}
          <div className="relative shrink-0 self-end pb-0.5">
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => setAttachOpen((v) => !v)}
              aria-label="Attach"
              className="grid h-11 w-11 place-items-center rounded-full transition-all"
              style={{
                background: attachOpen ? "linear-gradient(135deg,rgba(168,85,247,0.25),rgba(236,72,153,0.2))" : "rgba(255,255,255,0.06)",
                border: "1px solid " + (attachOpen ? "rgba(168,85,247,0.4)" : "rgba(255,255,255,0.09)"),
                color: attachOpen ? "rgb(216,180,254)" : "rgba(255,255,255,0.5)",
                boxShadow: attachOpen ? "0 0 20px rgba(168,85,247,0.25)" : "none",
              }}
            >
              <Paperclip className="h-4 w-4" />
            </motion.button>

            <AnimatePresence>
              {attachOpen && (
                <>
                  <motion.div className="fixed inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setAttachOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.93 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.93 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute bottom-[56px] left-0 z-50 w-52 overflow-hidden rounded-2xl"
                    style={{
                      background: "rgba(14,8,28,0.98)",
                      border: "1px solid rgba(255,255,255,0.09)",
                      boxShadow: "0 24px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(168,85,247,0.12)",
                      backdropFilter: "blur(24px)",
                    }}
                  >
                    <AttachOption icon={<ImageIcon className="h-4 w-4" />} label="Image" hint="JPG · PNG · WEBP" onClick={() => pickFiles("image/")} />
                    <AttachOption icon={<Film className="h-4 w-4" />} label="Video"
                      hint={planCode === "free" ? "Premium required" : "MP4 · MOV · WEBM"}
                      locked={planCode === "free"}
                      onClick={() => planCode === "free" ? setUpgradeOpen(true) : pickFiles("video/")}
                    />
                    <AttachOption icon={<Mic className="h-4 w-4" />} label="Audio"
                      hint={planCode === "free" ? "Premium required" : "MP3 · WAV · M4A"}
                      locked={planCode === "free"}
                      onClick={() => planCode === "free" ? setUpgradeOpen(true) : pickFiles("audio/")}
                    />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Textarea */}
          <div className="relative flex-1 self-end">
            <div
              className="relative rounded-[22px] overflow-hidden transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.055)",
                border: "1px solid " + (input.length > 0 ? "rgba(168,85,247,0.4)" : "rgba(255,255,255,0.09)"),
                boxShadow: input.length > 0 ? "0 0 0 1px rgba(168,85,247,0.2), 0 4px 20px rgba(168,85,247,0.1)" : "none",
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, planCode === "free" ? 2000 : 32000))}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                rows={1}
                placeholder={
                  cooldownSec > 0 ? `Wait ${cooldownSec}s…` :
                  pending.length ? "Ask about your file…" : "Message Socia GPT…"
                }
                disabled={cooldownSec > 0}
                className="max-h-32 min-h-[44px] w-full resize-none bg-transparent px-4 py-3 text-[14px] leading-relaxed text-white placeholder-white/25 outline-none disabled:opacity-40"
                style={{ caretColor: "#c084fc" }}
              />
              {planCode === "free" && input.length > 0 && (
                <div
                  className="absolute right-3 bottom-2 text-[9px] font-mono"
                  style={{ color: overLimit ? "rgb(248,113,113)" : "rgba(255,255,255,0.18)" }}
                >
                  {wordCount}/{maxWords}
                </div>
              )}
            </div>
          </div>

          {/* Send / Stop */}
          <div className="shrink-0 self-end pb-0.5">
            {busy ? (
              <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={stop}
                className="grid h-11 w-11 place-items-center rounded-full text-white/60"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                aria-label="Stop"
              >
                <X className="h-4 w-4" />
              </motion.button>
            ) : (
              <motion.button type="submit" whileTap={{ scale: 0.88 }} disabled={!canSend}
                className="grid h-11 w-11 place-items-center rounded-full text-white transition-all"
                style={{
                  background: canSend ? "linear-gradient(135deg,#a855f7,#ec4899)" : "rgba(255,255,255,0.06)",
                  border: canSend ? "none" : "1px solid rgba(255,255,255,0.07)",
                  boxShadow: canSend ? "0 4px 20px rgba(168,85,247,0.55)" : "none",
                  opacity: canSend ? 1 : 0.35,
                }}
                aria-label="Send"
              >
                {pending.some((p) => p.uploading)
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" style={{ transform: "translateX(1px)" }} />}
              </motion.button>
            )}
          </div>
        </form>

        <input ref={imageInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" multiple className="hidden"
          onChange={(e) => { const f = e.target.files ? Array.from(e.target.files) : []; e.target.value = ""; if (f.length) void addFiles(f); }} />
        <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska" multiple={false} className="hidden"
          onChange={(e) => { const f = e.target.files ? Array.from(e.target.files) : []; e.target.value = ""; if (f.length) void addFiles(f); }} />
        <input ref={audioInputRef} type="file" accept="audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/mp3,audio/wav" multiple={false} className="hidden"
          onChange={(e) => { const f = e.target.files ? Array.from(e.target.files) : []; e.target.value = ""; if (f.length) void addFiles(f); }} />
      </div>

      {/* Drag-over overlay */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
          >
            <motion.div
              initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }}
              className="rounded-3xl border-2 border-dashed px-8 py-10 text-center"
              style={{ borderColor: "rgba(192,38,211,0.45)", background: "rgba(168,85,247,0.07)", boxShadow: "0 0 80px rgba(236,72,153,0.15) inset" }}
            >
              <Upload className="mx-auto mb-3 h-8 w-8 text-fuchsia-300" />
              <div className="font-display text-[17px] font-bold text-white">Drop to attach</div>
              <div className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                Image{planCode !== "free" ? " · Video · Audio" : ""} · max 25 MB
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AIUpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} currentPlan={planCode} />
    </div>
  );
}

/* ── Sub-components ── */

function AttachOption({ icon, label, hint, onClick, locked }: {
  icon: React.ReactNode; label: string; hint: string; onClick: () => void; locked?: boolean;
}) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
        style={{ background: locked ? "rgba(217,119,6,0.1)" : "rgba(168,85,247,0.12)", color: locked ? "rgba(251,191,36,0.7)" : "rgba(216,180,254,0.9)" }}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold leading-none" style={{ color: "rgba(255,255,255,0.9)" }}>{label}</div>
        <div className="mt-1 text-[10.5px] leading-none" style={{ color: locked ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.35)" }}>{hint}</div>
      </span>
      {locked && <Zap className="h-3.5 w-3.5 shrink-0 text-amber-400/60" />}
    </motion.button>
  );
}

function EmptyState({ planCode, onUpgrade }: { planCode: string; onUpgrade: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center pt-14 pb-6 text-center"
    >
      <div className="relative mb-7">
        <div className="absolute inset-0 rounded-full blur-3xl opacity-50"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.5) 0%, rgba(236,72,153,0.25) 55%, transparent 80%)", transform: "scale(2)" }} />
        <motion.div
          initial={{ scale: 0.75, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative grid h-[72px] w-[72px] place-items-center rounded-[24px]"
          style={{
            background: "linear-gradient(135deg,#a855f7,#ec4899,#6366f1)",
            boxShadow: "0 20px 50px -8px rgba(168,85,247,0.65), 0 0 0 1px rgba(255,255,255,0.1) inset",
          }}
        >
          <Sparkles className="h-8 w-8 text-white" />
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
        <h2 className="font-display text-[22px] font-bold tracking-tight text-white">
          Hi, I'm <span className="text-gradient">Socia GPT</span>
        </h2>
        <p className="mx-auto mt-2 max-w-[260px] text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
          Ask me anything, attach a photo, voice note, or video. I'll help you create better content.
        </p>
      </motion.div>

      {planCode === "free" && (
        <motion.button
          whileTap={{ scale: 0.97 }} onClick={onUpgrade}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="mt-6 flex items-center gap-2 rounded-2xl px-5 py-3 text-[12.5px] font-semibold transition-all hover:brightness-110"
          style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.22)", boxShadow: "0 4px 20px rgba(168,85,247,0.12)", color: "rgba(216,180,254,0.9)" }}
        >
          <Zap className="h-3.5 w-3.5" />
          Upgrade to Premium AI — ₱299/mo
          <Crown className="h-3.5 w-3.5 text-violet-400" />
        </motion.button>
      )}
    </motion.div>
  );
}

function Bubble({ m, onRegen, busy }: { m: ChatMessage; onRegen: () => void; busy: boolean }) {
  const isUser = m.role === "user";
  const [copied, setCopied] = useState(false);

  if (isUser) {
    return (
      <motion.div
        variants={{ hidden: { opacity: 0, x: 16 }, visible: { opacity: 1, x: 0 } }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="flex justify-end"
      >
        <div
          className="max-w-[80%] rounded-[20px] rounded-br-[5px] px-4 py-3 text-[14px] leading-relaxed text-white"
          style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)", boxShadow: "0 4px 20px rgba(168,85,247,0.3)" }}
        >
          {m.attachments && m.attachments.length > 0 && <BubbleAttachments items={m.attachments} />}
          {m.content && m.content !== "(see attached)" && <p className="whitespace-pre-wrap">{m.content}</p>}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, x: -10 }, visible: { opacity: 1, x: 0 } }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="flex justify-start"
    >
      <div className="w-full max-w-[92%]">
        <div
          className="rounded-[20px] rounded-bl-[5px] px-4 py-3.5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 2px 16px rgba(0,0,0,0.25)" }}
        >
          {m.content ? (
            <MessageMarkdown source={m.content} />
          ) : m.pending ? (
            <div className="flex items-center gap-2.5 text-[13px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              <div className="flex gap-1">
                {[0, 0.18, 0.36].map((delay) => (
                  <motion.span key={delay} className="block h-1.5 w-1.5 rounded-full"
                    style={{ background: "rgba(192,38,211,0.55)" }}
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay }}
                  />
                ))}
              </div>
              Thinking…
            </div>
          ) : null}
          {m.pending && m.content && (
            <span className="ml-1 inline-block h-[14px] w-[3px] animate-pulse rounded-sm align-middle"
              style={{ background: "rgba(192,38,211,0.75)" }} />
          )}
          {m.error && (
            <div className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px] text-red-300"
              style={{ background: "rgba(239,68,68,0.07)" }}>
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{m.error}</span>
            </div>
          )}
        </div>
        {!m.pending && m.content && (
          <div className="mt-2 flex gap-3 px-1 text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
            <motion.button whileTap={{ scale: 0.9 }}
              onClick={() => { navigator.clipboard.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
              className="inline-flex items-center gap-1.5 hover:text-white/60 transition-colors"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={onRegen} disabled={busy}
              className="inline-flex items-center gap-1.5 hover:text-white/60 transition-colors disabled:opacity-25"
            >
              <RotateCcw className="h-3 w-3" />
              Regenerate
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

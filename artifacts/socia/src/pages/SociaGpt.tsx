import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Send, Trash2, Loader2, Sparkles, Copy, Check, RotateCcw,
  X, Paperclip, Image as ImageIcon, Mic, Film, Upload, Crown,
  AlertCircle, Clock, RefreshCw,
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
  const [inputFocused, setInputFocused] = useState(false);

  const abortRef      = useRef<AbortController | null>(null);
  const scrollerRef   = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);

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

  const addFiles = useCallback(async (files: File[]) => {
    setGlobalError(null);
    const fresh: PendingAttachment[] = [];
    for (const f of files) {
      const kind = detectAttachmentKind(f);
      if (!kind) { setGlobalError(`Unsupported file: ${f.name}`); continue; }
      if (planCode === "free" && (kind === "audio" || kind === "video")) {
        setUpgradeOpen(true);
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
    const ref = accept === "image" ? imageInputRef : accept === "audio" ? audioInputRef : videoInputRef;
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
    if (overLimit) { setGlobalError(`Message too long — max ${maxWords} words on your current plan.`); return; }

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
          const cd = plan?.cooldownSec ?? 15;
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
          background: "rgba(10,5,20,0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => navigate("/create")}
          className="grid h-9 w-9 place-items-center rounded-full text-white/50 transition-colors shrink-0"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </motion.button>

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
            <p className="mt-0.5 text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>
              Your intelligent creative partner
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => { if (confirm("Clear this conversation?")) { stop(); clear(); } }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/40 transition-colors"
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
          <EmptyState />
        ) : (
          <motion.div
            className="space-y-5"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
          >
            {messages.map((m) => (
              <Bubble key={m.id} m={m} onRegen={() => regenerate(m)} busy={busy}
                onUpgrade={() => setUpgradeOpen(true)} />
            ))}
          </motion.div>
        )}
      </div>

      {/* ── Cooldown progress bar ── */}
      <AnimatePresence>
        {cooldownSec > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="overflow-hidden"
            style={{ background: "rgba(168,85,247,0.05)" }}
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
          background: "rgba(8,4,18,0.97)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        {/* Pending attachments */}
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

        {/* Global error */}
        <AnimatePresence>
          {globalError && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
              className="mb-2.5 flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-[12px]"
              style={{ borderColor: "rgba(239,68,68,0.18)", background: "rgba(239,68,68,0.06)", color: "rgba(252,165,165,0.9)" }}
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="flex-1">{globalError}</span>
              <button onClick={() => setGlobalError(null)} style={{ color: "rgba(252,165,165,0.5)" }}>
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attachment menu — floats above composer */}
        <AnimatePresence>
          {attachOpen && (
            <>
              <motion.div className="fixed inset-0 z-40"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setAttachOpen(false)} />

              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.94 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-50 mb-2.5 overflow-hidden rounded-2xl"
                style={{
                  background: "rgba(12,7,24,0.98)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(168,85,247,0.1)",
                  backdropFilter: "blur(32px)",
                }}
              >
                <div className="flex items-stretch">
                  <AttachMenuItem
                    icon={<ImageIcon className="h-5 w-5" />}
                    label="Photos"
                    locked={false}
                    color="#a855f7"
                    onClick={() => pickFiles("image")}
                  />
                  <div style={{ width: "1px", background: "rgba(255,255,255,0.06)", margin: "12px 0" }} />
                  <AttachMenuItem
                    icon={<Film className="h-5 w-5" />}
                    label="Videos"
                    locked={planCode === "free"}
                    color="#ec4899"
                    onClick={() => planCode === "free" ? setUpgradeOpen(true) : pickFiles("video")}
                  />
                  <div style={{ width: "1px", background: "rgba(255,255,255,0.06)", margin: "12px 0" }} />
                  <AttachMenuItem
                    icon={<Mic className="h-5 w-5" />}
                    label="Voice"
                    locked={planCode === "free"}
                    color="#6366f1"
                    onClick={() => planCode === "free" ? setUpgradeOpen(true) : pickFiles("audio")}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Unified input pill */}
        <form onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <motion.div
            animate={{
              boxShadow: inputFocused
                ? "0 0 0 1.5px rgba(168,85,247,0.35), 0 6px 30px rgba(168,85,247,0.15)"
                : "none",
            }}
            transition={{ duration: 0.2 }}
            className="flex items-end overflow-hidden rounded-[24px]"
            style={{
              background: "rgba(255,255,255,0.055)",
              border: `1.5px solid ${inputFocused ? "rgba(168,85,247,0.45)" : attachOpen ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.09)"}`,
              transition: "border-color 0.2s",
            }}
          >
            {/* Attach button — inside pill */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => { setAttachOpen((v) => !v); textareaRef.current?.focus(); }}
              aria-label="Attach"
              className="flex h-11 w-11 shrink-0 items-center justify-center self-end transition-colors"
              style={{
                color: attachOpen ? "rgba(216,180,254,0.9)" : "rgba(255,255,255,0.38)",
              }}
            >
              <motion.div animate={{ rotate: attachOpen ? 45 : 0 }} transition={{ duration: 0.2 }}>
                <Paperclip className="h-[18px] w-[18px]" />
              </motion.div>
            </motion.button>

            {/* Divider */}
            <div className="self-stretch my-3" style={{ width: "1px", background: "rgba(255,255,255,0.07)" }} />

            {/* Textarea */}
            <div className="relative flex-1 self-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, planCode === "free" ? 2000 : 64000))}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                onFocus={() => { setInputFocused(true); }}
                onBlur={() => setInputFocused(false)}
                rows={1}
                placeholder={
                  cooldownSec > 0 ? `Ready in ${cooldownSec}s…` :
                  pending.length ? "Ask about your file…" : "Message Socia GPT…"
                }
                disabled={cooldownSec > 0}
                className="max-h-32 min-h-[44px] w-full resize-none bg-transparent px-3 py-3 text-[14px] leading-relaxed text-white placeholder-white/20 outline-none disabled:opacity-40"
                style={{ caretColor: "#c084fc" }}
              />
              {planCode === "free" && input.length > 0 && (
                <div
                  className="absolute right-2 bottom-2 text-[9px] font-mono"
                  style={{ color: overLimit ? "rgb(248,113,113)" : "rgba(255,255,255,0.15)" }}
                >
                  {wordCount}/{maxWords}
                </div>
              )}
            </div>

            {/* Send / Stop */}
            <div className="flex items-end self-end p-1.5">
              {busy ? (
                <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={stop}
                  className="grid h-9 w-9 place-items-center rounded-full text-white/60"
                  style={{ background: "rgba(255,255,255,0.07)" }}
                  aria-label="Stop"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              ) : (
                <motion.button type="submit" whileTap={{ scale: 0.88 }} disabled={!canSend}
                  className="grid h-9 w-9 place-items-center rounded-full text-white transition-all"
                  style={{
                    background: canSend ? "linear-gradient(135deg,#a855f7,#ec4899)" : "rgba(255,255,255,0.06)",
                    boxShadow: canSend ? "0 4px 16px rgba(168,85,247,0.55)" : "none",
                    opacity: canSend ? 1 : 0.3,
                  }}
                  aria-label="Send"
                >
                  {pending.some((p) => p.uploading)
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" style={{ transform: "translateX(1px)" }} />}
                </motion.button>
              )}
            </div>
          </motion.div>
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
            style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
          >
            <motion.div
              initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }}
              className="rounded-3xl border-2 border-dashed px-8 py-10 text-center"
              style={{ borderColor: "rgba(168,85,247,0.45)", background: "rgba(168,85,247,0.06)" }}
            >
              <Upload className="mx-auto mb-3 h-8 w-8 text-fuchsia-300" />
              <div className="font-display text-[17px] font-bold text-white">Drop to attach</div>
              <div className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {planCode !== "free" ? "Image · Video · Audio" : "Image"} · max 25 MB
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AIUpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} currentPlan={planCode} />
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function AttachMenuItem({
  icon, label, locked, color, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  locked: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.93 }}
      onClick={onClick}
      className="relative flex flex-1 flex-col items-center gap-1.5 px-4 py-4 transition-colors hover:bg-white/[0.03]"
    >
      <span
        className="relative grid h-10 w-10 place-items-center rounded-[14px]"
        style={{ background: `${color}18`, color: locked ? "rgba(255,255,255,0.25)" : color }}
      >
        {icon}
        {locked && (
          <span
            className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full"
            style={{ background: "rgba(234,179,8,0.9)", boxShadow: "0 2px 8px rgba(234,179,8,0.4)" }}
          >
            <Crown className="h-2.5 w-2.5 text-black" strokeWidth={2.5} />
          </span>
        )}
      </span>
      <span
        className="text-[11px] font-semibold"
        style={{ color: locked ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.75)" }}
      >
        {label}
      </span>
    </motion.button>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center pt-14 pb-6 text-center"
    >
      <div className="relative mb-7">
        <div className="absolute inset-0 rounded-full blur-3xl opacity-40"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.55) 0%, rgba(236,72,153,0.2) 55%, transparent 80%)", transform: "scale(2.2)" }} />
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
        <p className="mx-auto mt-2.5 max-w-[260px] text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.38)" }}>
          Ask me anything — attach a photo, voice note, or video and I'll help you create incredible content.
        </p>
      </motion.div>

      {/* Subtle capability hints */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
        className="mt-7 flex flex-wrap justify-center gap-2"
      >
        {["Write captions", "Fix prompts", "TikTok scripts", "Cinematic shots", "Product ads"].map((hint) => (
          <span key={hint}
            className="rounded-full px-3 py-1.5 text-[11.5px] font-medium"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
          >
            {hint}
          </span>
        ))}
      </motion.div>
    </motion.div>
  );
}

function Bubble({ m, onRegen, busy, onUpgrade }: {
  m: ChatMessage;
  onRegen: () => void;
  busy: boolean;
  onUpgrade: () => void;
}) {
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

  const errorCode = m.errorCode ?? "";

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

          {/* Premium error states */}
          {m.error && !m.pending && (
            <ErrorBubble error={m.error} code={errorCode} onUpgrade={onUpgrade} onRetry={onRegen} busy={busy} />
          )}
        </div>

        {!m.pending && m.content && !m.error && (
          <div className="mt-2 flex gap-3 px-1 text-[11px]" style={{ color: "rgba(255,255,255,0.22)" }}>
            <motion.button whileTap={{ scale: 0.9 }}
              onClick={() => { navigator.clipboard.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
              className="inline-flex items-center gap-1.5 hover:text-white/55 transition-colors"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={onRegen} disabled={busy}
              className="inline-flex items-center gap-1.5 hover:text-white/55 transition-colors disabled:opacity-20"
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

function ErrorBubble({
  error, code, onUpgrade, onRetry, busy,
}: {
  error: string;
  code: string;
  onUpgrade: () => void;
  onRetry: () => void;
  busy: boolean;
}) {
  if (code === "USAGE_LIMIT_EXCEEDED") {
    return (
      <div className="mt-3 rounded-2xl p-4 text-center"
        style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.18)" }}>
        <Clock className="mx-auto mb-2 h-5 w-5 text-purple-400 opacity-70" />
        <p className="text-[13px] font-semibold text-white/80">Daily limit reached</p>
        <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
          Your access refreshes tomorrow at midnight.
        </p>
        <button onClick={onUpgrade}
          className="mt-3 rounded-xl px-4 py-2 text-[11.5px] font-semibold transition-all"
          style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.25),rgba(236,72,153,0.18))", border: "1px solid rgba(168,85,247,0.3)", color: "rgba(216,180,254,0.95)" }}
        >
          Upgrade for more
        </button>
      </div>
    );
  }

  if (code === "SERVER_BUSY") {
    return (
      <div className="mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px]" style={{ color: "rgba(255,255,255,0.6)" }}>
            AI servers are temporarily busy. Please try again in a moment.
          </p>
          <button onClick={onRetry} disabled={busy}
            className="mt-2 text-[11px] font-medium transition-colors hover:text-white/70 disabled:opacity-30"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            Try again →
          </button>
        </div>
      </div>
    );
  }

  if (code === "ATTACHMENT_PLAN_LIMIT") {
    return (
      <div className="mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3"
        style={{ background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.15)" }}>
        <Crown className="mt-0.5 h-4 w-4 shrink-0 text-amber-400/70" />
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px]" style={{ color: "rgba(255,255,255,0.6)" }}>
            Audio and video require a Premium plan or above.
          </p>
          <button onClick={onUpgrade}
            className="mt-2 text-[11px] font-semibold transition-colors"
            style={{ color: "rgba(253,224,71,0.75)" }}
          >
            View plans →
          </button>
        </div>
      </div>
    );
  }

  // Generic error
  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px]"
      style={{ background: "rgba(239,68,68,0.06)", color: "rgba(252,165,165,0.85)" }}>
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
      <span>{error}</span>
    </div>
  );
}

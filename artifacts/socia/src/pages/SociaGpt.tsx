import { useEffect, useRef, useState, useCallback, type ComponentType } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Send, Trash2, Loader2, Sparkles, Copy, Check, RotateCcw,
  X, AlertCircle, Paperclip, Image as ImageIcon, Mic, Film, Upload,
  Zap, Crown, ChevronRight, Info,
  Wand2, Smartphone, ShoppingBag, Star, Bot, Megaphone, Video,
} from "lucide-react";
import {
  MODES, useSociaGptStore, streamChat,
  type ChatMessage, type SociaGptMode, type ChatAttachment,
} from "@/lib/sociaGptClient";
import { uploadSociaGptFile, detectAttachmentKind } from "@/lib/sociaGptUpload";
import { MessageMarkdown } from "@/components/socia-gpt/MessageMarkdown";
import { PendingChip, BubbleAttachments, type PendingAttachment } from "@/components/socia-gpt/Attachments";
import { AIPlanBadge } from "@/components/socia-gpt/AIPlanBadge";
import { AIUsageBar } from "@/components/socia-gpt/AIUsageBar";
import { AIUpgradeModal } from "@/components/socia-gpt/AIUpgradeModal";
import { useAIPlanStore } from "@/lib/aiPlanClient";

const MODEL_LABELS: Record<string, string> = {
  "gpt-4o-mini": "GPT-4o Mini",
  "gpt-4o":      "GPT-4o",
  "o1-mini":     "o1-mini",
};

const MODE_ICONS: Record<SociaGptMode, ComponentType<{ className?: string }>> = {
  "general":        Sparkles,
  "prompt-fixer":   Wand2,
  "tiktok":         Smartphone,
  "shopee":         ShoppingBag,
  "fashion":        Star,
  "cinematic":      Film,
  "ai-influencer":  Bot,
  "product-ads":    Megaphone,
  "video-director": Video,
};

export default function SociaGpt() {
  const [, navigate]  = useLocation();
  const messages      = useSociaGptStore((s) => s.messages);
  const mode          = useSociaGptStore((s) => s.mode);
  const setMode       = useSociaGptStore((s) => s.setMode);
  const clear         = useSociaGptStore((s) => s.clear);
  const removeMessage = useSociaGptStore((s) => s.removeMessage);

  const { plan, usage, refresh: refreshPlan } = useAIPlanStore();

  const [input,       setInput]       = useState("");
  const [busy,        setBusy]        = useState(false);
  const [pending,     setPending]     = useState<PendingAttachment[]>([]);
  const [dragOver,    setDragOver]    = useState(false);
  const [attachOpen,  setAttachOpen]  = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [showUsage,   setShowUsage]   = useState(false);
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
        if (s <= 1) {
          clearInterval(cooldownTimer.current!);
          cooldownTimer.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  useEffect(() => () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); }, []);

  const planCode    = plan?.code ?? "free";
  const maxWords    = plan?.maxWords ?? 300;
  const wordCount   = input.trim() ? input.trim().split(/\s+/).length : 0;
  const overLimit   = planCode === "free" && wordCount > maxWords;
  const modelLabel  = MODEL_LABELS[plan?.model ?? "gpt-4o-mini"] ?? plan?.model ?? "GPT-4o Mini";

  const addFiles = useCallback(async (files: File[]) => {
    setGlobalError(null);
    const fresh: PendingAttachment[] = [];
    for (const f of files) {
      const kind = detectAttachmentKind(f);
      if (!kind) {
        setGlobalError(`Unsupported file: ${f.name}`);
        continue;
      }
      if (planCode === "free" && (kind === "audio" || kind === "video")) {
        setGlobalError("Audio & video attachments require Premium AI or Ultra Pro. Tap the badge to upgrade.");
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
    const ref =
      accept.startsWith("image") ? imageInputRef :
      accept.startsWith("audio") ? audioInputRef :
      videoInputRef;
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
    if (overLimit) {
      setGlobalError(`Message too long. Free AI allows max ${maxWords} words. Upgrade for more.`);
      return;
    }

    setInput("");
    setBusy(true);
    setGlobalError(null);
    pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPending([]);

    const store = useSociaGptStore.getState();
    store.addUser(trimmed || "(see attached)", ready);
    const placeholder = store.addAssistantPlaceholder();
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;

    const history = useSociaGptStore.getState().messages
      .filter((m) => !m.pending)
      .slice(-30)
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
            if (cur) {
              useAIPlanStore.setState({
                usage: { ...cur, used: meta.used },
              });
            }
          }
        },
        onRateLimit: (retryAfterSec) => {
          startCooldown(retryAfterSec);
        },
      });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
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
      .filter((m) => !m.pending)
      .slice(-30)
      .map((m) => ({ role: m.role, content: m.content, attachments: m.attachments }));

    streamChat({ history, mode, assistantId: placeholder.id, signal: ctl.signal })
      .finally(() => { setBusy(false); abortRef.current = null; });
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  const canSend =
    !busy &&
    cooldownSec === 0 &&
    !overLimit &&
    !pending.some((p) => p.uploading) &&
    (input.trim().length > 0 || pending.some((p) => p.uploaded && !p.error));

  const usagePct = usage ? Math.round((usage.used / usage.limit) * 100) : 0;
  const nearLimit = usagePct >= 80;

  return (
    <div className="relative flex h-full flex-col bg-[var(--s-bg)]">

      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(10,6,20,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate("/create")}
          className="grid h-9 w-9 place-items-center rounded-full text-white/60 hover:text-white transition-colors"
          style={{ background: "rgba(255,255,255,0.05)" }}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </motion.button>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg,#a855f7,#ec4899,#6366f1)",
              boxShadow: "0 4px 16px rgba(168,85,247,0.45)",
            }}
          >
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
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
            <p className="mt-0.5 text-[10px] text-white/35 tracking-wide">
              {modelLabel} · multimodal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowUsage((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-full transition-all"
            style={{
              background: showUsage ? "rgba(192,38,211,0.2)" : "rgba(255,255,255,0.05)",
              color: showUsage ? "rgb(232,121,249)" : "rgba(255,255,255,0.5)",
            }}
            aria-label="Usage"
          >
            <Info className="h-4 w-4" />
          </motion.button>

          {messages.length > 0 && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                if (confirm("Clear this conversation?")) { stop(); clear(); }
              }}
              className="grid h-9 w-9 place-items-center rounded-full text-white/50 hover:text-white transition-colors"
              style={{ background: "rgba(255,255,255,0.05)" }}
              aria-label="Clear chat"
            >
              <Trash2 className="h-4 w-4" />
            </motion.button>
          )}
        </div>
      </div>

      {/* ── Usage panel ── */}
      <AnimatePresence>
        {showUsage && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)" }}
          >
            <div className="px-4 py-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-white/40 tracking-widest uppercase">AI Usage</span>
                <button
                  onClick={() => navigate("/socia-gpt/billing")}
                  className="flex items-center gap-1 text-[11px] text-fuchsia-400 hover:text-fuchsia-300"
                >
                  Manage plan <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              {usage ? (
                <AIUsageBar code={planCode} usage={usage} onUpgrade={() => setUpgradeOpen(true)} />
              ) : (
                <div className="text-[11px] text-white/25">Loading usage…</div>
              )}
              {planCode === "free" && (
                <div className="flex gap-2 text-[10.5px] text-white/35">
                  <span>Cooldown {plan?.cooldownSec ?? 20}s</span>
                  <span>·</span>
                  <span>Max {maxWords} words/msg</span>
                  <span>·</span>
                  <button onClick={() => setUpgradeOpen(true)} className="text-fuchsia-400 hover:text-fuchsia-300">
                    Upgrade →
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Near-limit banner ── */}
      <AnimatePresence>
        {nearLimit && !showUsage && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
            style={{ borderBottom: "1px solid rgba(245,158,11,0.12)", background: "rgba(245,158,11,0.04)" }}
          >
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-[11px] text-amber-300/70">
                {planCode === "free"
                  ? `${usage ? usage.limit - usage.used : "?"} messages left today`
                  : `${usage ? usage.limit - usage.used : "?"} messages left this month`}
              </span>
              <button
                onClick={() => planCode === "free" ? setUpgradeOpen(true) : navigate("/socia-gpt/billing")}
                className="flex items-center gap-1 text-[11px] font-semibold text-amber-300 hover:text-amber-200"
              >
                {planCode === "free" ? "Upgrade" : "Manage"} <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mode chips ── */}
      <div
        className="overflow-x-auto px-4 py-2.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="flex gap-2 whitespace-nowrap">
          {MODES.map((m) => {
            const active = m.id === mode;
            const Icon = MODE_ICONS[m.id];
            return (
              <motion.button
                key={m.id}
                whileTap={{ scale: 0.94 }}
                onClick={() => setMode(m.id as SociaGptMode)}
                className="shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold tracking-wide transition-all"
                style={
                  active
                    ? {
                        background: "linear-gradient(135deg,#a855f7,#ec4899)",
                        color: "#fff",
                        boxShadow: "0 2px 12px rgba(168,85,247,0.4)",
                      }
                    : {
                        background: "rgba(255,255,255,0.05)",
                        color: "rgba(255,255,255,0.5)",
                      }
                }
              >
                <Icon className="h-3 w-3 shrink-0" />
                {m.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Message scroller ── */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto"
        style={{ padding: "20px 16px 8px" }}
      >
        {messages.length === 0 ? (
          <Empty planCode={planCode} onUpgrade={() => setUpgradeOpen(true)} />
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

      {/* ── Cooldown bar ── */}
      <AnimatePresence>
        {cooldownSec > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="px-4 py-2"
            style={{ borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.01)" }}
          >
            <div className="flex items-center justify-between text-[10.5px] text-white/35 mb-1.5">
              <span className="tracking-wider uppercase">Cooldown</span>
              <span className="font-mono">{cooldownSec}s</span>
            </div>
            <div className="h-[2px] w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg,#a855f7,#ec4899)" }}
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: cooldownSec, ease: "linear" }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Composer ── */}
      <div
        className="px-3 pb-[max(env(safe-area-inset-bottom),14px)] pt-3"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(10,6,20,0.9)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        {/* Pending attachments */}
        {pending.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3"
          >
            {pending.map((p) => (
              <PendingChip key={p.id} att={p} onRemove={() => removePending(p.id)} />
            ))}
          </motion.div>
        )}

        {/* Error banner */}
        <AnimatePresence>
          {globalError && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mb-2.5 flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-[12px] text-red-300"
              style={{ borderColor: "rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)" }}
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{globalError}</span>
              <button onClick={() => setGlobalError(null)} className="text-red-300/60 hover:text-red-200">
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input row */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex items-end gap-2.5"
        >
          {/* Circular attach button */}
          <div className="relative shrink-0 self-end pb-0.5">
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => setAttachOpen((v) => !v)}
              aria-label="Attach"
              className="grid h-11 w-11 place-items-center rounded-full transition-all"
              style={{
                background: attachOpen
                  ? "linear-gradient(135deg,rgba(168,85,247,0.3),rgba(236,72,153,0.3))"
                  : "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: attachOpen ? "rgb(232,121,249)" : "rgba(255,255,255,0.6)",
                boxShadow: attachOpen ? "0 0 16px rgba(168,85,247,0.3)" : "none",
              }}
            >
              <Paperclip className="h-4 w-4" />
            </motion.button>

            <AnimatePresence>
              {attachOpen && (
                <>
                  <motion.div
                    className="fixed inset-0 z-40"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setAttachOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.94 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute bottom-[56px] left-0 z-50 w-52 overflow-hidden rounded-2xl"
                    style={{
                      background: "rgba(18,10,32,0.97)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      boxShadow: "0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(168,85,247,0.1)",
                      backdropFilter: "blur(24px)",
                    }}
                  >
                    <AttachOption icon={<ImageIcon className="h-4 w-4" />} label="Image" hint="JPG · PNG · WEBP" onClick={() => pickFiles("image/")} />
                    <AttachOption
                      icon={<Film className="h-4 w-4" />}
                      label="Video"
                      hint={planCode === "free" ? "Premium required" : "MP4 · MOV · WEBM"}
                      locked={planCode === "free"}
                      onClick={() => planCode === "free" ? setUpgradeOpen(true) : pickFiles("video/")}
                    />
                    <AttachOption
                      icon={<Mic className="h-4 w-4" />}
                      label="Audio"
                      hint={planCode === "free" ? "Premium required" : "MP3 · WAV · M4A"}
                      locked={planCode === "free"}
                      onClick={() => planCode === "free" ? setUpgradeOpen(true) : pickFiles("audio/")}
                    />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Floating textarea */}
          <div className="relative flex-1 self-end">
            <div
              className="relative rounded-[22px] overflow-hidden transition-all"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: input.length > 0
                  ? "0 0 0 1.5px rgba(168,85,247,0.35), 0 4px 20px rgba(168,85,247,0.12)"
                  : "none",
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, planCode === "free" ? 2000 : 32000))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
                }}
                rows={1}
                placeholder={
                  cooldownSec > 0
                    ? `Cooldown — ${cooldownSec}s…`
                    : pending.length ? "Add a question about your file…" : "Message Socia GPT…"
                }
                disabled={cooldownSec > 0}
                className="max-h-32 min-h-[44px] w-full resize-none bg-transparent px-4 py-3 text-[14px] leading-relaxed text-white placeholder-white/30 outline-none disabled:opacity-40"
                style={{ caretColor: "#c084fc" }}
              />
              {planCode === "free" && input.length > 0 && (
                <div
                  className="absolute right-3 bottom-2 text-[9px] font-mono"
                  style={{ color: overLimit ? "rgb(248,113,113)" : "rgba(255,255,255,0.2)" }}
                >
                  {wordCount}/{maxWords}
                </div>
              )}
            </div>
          </div>

          {/* Floating send / stop button */}
          <div className="shrink-0 self-end pb-0.5">
            {busy ? (
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={stop}
                className="grid h-11 w-11 place-items-center rounded-full transition-all"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.8)",
                }}
                aria-label="Stop"
              >
                <X className="h-4 w-4" />
              </motion.button>
            ) : (
              <motion.button
                type="submit"
                whileTap={{ scale: 0.88 }}
                disabled={!canSend}
                className="grid h-11 w-11 place-items-center rounded-full text-white transition-all"
                style={{
                  background: canSend
                    ? "linear-gradient(135deg,#a855f7,#ec4899)"
                    : "rgba(255,255,255,0.07)",
                  border: canSend ? "none" : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: canSend ? "0 4px 18px rgba(168,85,247,0.5)" : "none",
                  opacity: canSend ? 1 : 0.4,
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

        {/* Hidden file inputs */}
        <input ref={imageInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" multiple className="hidden"
          onChange={(e) => { const f = e.target.files ? Array.from(e.target.files) : []; e.target.value = ""; if (f.length) void addFiles(f); }} />
        <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska" multiple={false} className="hidden"
          onChange={(e) => { const f = e.target.files ? Array.from(e.target.files) : []; e.target.value = ""; if (f.length) void addFiles(f); }} />
        <input ref={audioInputRef} type="file" accept="audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/mp3,audio/wav" multiple={false} className="hidden"
          onChange={(e) => { const f = e.target.files ? Array.from(e.target.files) : []; e.target.value = ""; if (f.length) void addFiles(f); }} />
      </div>

      {/* ── Drag-and-drop overlay ── */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          >
            <motion.div
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.92 }}
              className="rounded-3xl border-2 border-dashed px-8 py-10 text-center"
              style={{
                borderColor: "rgba(192,38,211,0.5)",
                background: "rgba(168,85,247,0.08)",
                boxShadow: "0 0 80px rgba(236,72,153,0.2) inset",
              }}
            >
              <Upload className="mx-auto mb-3 h-8 w-8 text-fuchsia-300" />
              <div className="font-display text-[17px] font-bold text-white">Drop to attach</div>
              <div className="mt-1 text-[12px] text-white/50">
                Image{planCode !== "free" ? " · Video · Audio" : ""} · max 25 MB
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── AI Upgrade Modal ── */}
      <AIUpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        currentPlan={planCode}
      />
    </div>
  );
}

/* ────────────────────────── Sub-components ────────────────────────── */

function AttachOption({
  icon, label, hint, onClick, locked,
}: {
  icon: React.ReactNode; label: string; hint: string; onClick: () => void; locked?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.05]"
    >
      <span
        className="grid h-8 w-8 place-items-center rounded-xl shrink-0"
        style={{
          background: locked ? "rgba(217,119,6,0.12)" : "rgba(168,85,247,0.12)",
          color: locked ? "rgba(251,191,36,0.7)" : "rgba(216,180,254,0.9)",
        }}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-white/90 leading-none">{label}</div>
        <div
          className="mt-1 text-[10.5px] leading-none"
          style={{ color: locked ? "rgba(251,191,36,0.55)" : "rgba(255,255,255,0.4)" }}
        >
          {hint}
        </div>
      </span>
      {locked && <Zap className="h-3.5 w-3.5 shrink-0 text-amber-400/60" />}
    </motion.button>
  );
}

function Empty({ planCode, onUpgrade }: {
  planCode: string;
  onUpgrade: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center pt-12 pb-6 text-center"
    >
      {/* Glow orb behind icon */}
      <div className="relative mb-6">
        <div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{
            background: "radial-gradient(circle, rgba(168,85,247,0.4) 0%, rgba(236,72,153,0.2) 60%, transparent 80%)",
            transform: "scale(1.8)",
          }}
        />
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative grid h-20 w-20 place-items-center rounded-[28px]"
          style={{
            background: "linear-gradient(135deg,#a855f7,#ec4899,#6366f1)",
            boxShadow: "0 16px 48px -8px rgba(168,85,247,0.6), 0 0 0 1px rgba(255,255,255,0.12) inset",
          }}
        >
          <Sparkles className="h-9 w-9 text-white" />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="font-display text-[22px] font-bold text-white tracking-tight">
          Hi, I'm <span className="text-gradient">Socia GPT</span>
        </h2>
        <p className="mx-auto mt-2 max-w-[260px] text-[13px] leading-relaxed text-white/45">
          Ask me anything, attach a photo, voice note, or video — I'll help you create better content.
        </p>
      </motion.div>

      {planCode === "free" && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onUpgrade}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 flex items-center gap-2 rounded-2xl px-5 py-3 text-[12.5px] font-semibold text-fuchsia-200 transition-all hover:brightness-110"
          style={{
            background: "rgba(168,85,247,0.12)",
            border: "1px solid rgba(168,85,247,0.25)",
            boxShadow: "0 4px 20px rgba(168,85,247,0.15)",
          }}
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
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="flex justify-end"
      >
        <div
          className="max-w-[80%] rounded-[20px] rounded-br-[6px] px-4 py-3 text-[14px] leading-relaxed text-white"
          style={{
            background: "linear-gradient(135deg,#a855f7,#ec4899)",
            boxShadow: "0 4px 20px rgba(168,85,247,0.35)",
          }}
        >
          {m.attachments && m.attachments.length > 0 && <BubbleAttachments items={m.attachments} />}
          {m.content && m.content !== "(see attached)" && (
            <p className="whitespace-pre-wrap">{m.content}</p>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, x: -12 }, visible: { opacity: 1, x: 0 } }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex justify-start"
    >
      <div className="w-full max-w-[92%]">
        <div
          className="rounded-[20px] rounded-bl-[6px] px-4 py-3.5"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
          }}
        >
          {m.content ? (
            <MessageMarkdown source={m.content} />
          ) : m.pending ? (
            <div className="flex items-center gap-2.5 text-[13px] text-white/40">
              <div className="flex gap-1">
                {[0, 0.2, 0.4].map((delay) => (
                  <motion.span
                    key={delay}
                    className="block h-1.5 w-1.5 rounded-full"
                    style={{ background: "rgba(192,38,211,0.6)" }}
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay }}
                  />
                ))}
              </div>
              Thinking…
            </div>
          ) : null}
          {m.pending && m.content && (
            <span
              className="ml-1 inline-block h-[14px] w-[3px] animate-pulse rounded-sm align-middle"
              style={{ background: "rgba(192,38,211,0.8)" }}
            />
          )}
          {m.error && (
            <div
              className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px] text-red-300"
              style={{ background: "rgba(239,68,68,0.08)" }}
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{m.error}</span>
            </div>
          )}
        </div>
        {!m.pending && m.content && (
          <div className="mt-2 flex gap-3 px-1 text-[11px] text-white/30">
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => { navigator.clipboard.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
              className="inline-flex items-center gap-1.5 hover:text-white/70 transition-colors"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={onRegen}
              disabled={busy}
              className="inline-flex items-center gap-1.5 hover:text-white/70 transition-colors disabled:opacity-30"
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

import {
  useEffect, useRef, useState, useCallback, memo,
} from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Send, Trash2, Loader2, Sparkles, Copy,
  Check, RotateCcw, X, Mic, Plus, Image as ImageIcon,
  Film, Upload, Crown, AlertCircle, Clock, RefreshCw,
  Camera, Folder,
} from "lucide-react";
import {
  useSociaGptStore, streamChat,
  type ChatMessage, type ChatAttachment,
} from "@/lib/sociaGptClient";
import { uploadSociaGptFile, detectAttachmentKind } from "@/lib/sociaGptUpload";
import { MessageMarkdown } from "@/components/socia-gpt/MessageMarkdown";
import {
  PendingChip, BubbleAttachments, type PendingAttachment,
} from "@/components/socia-gpt/Attachments";
import { AIPlanBadge } from "@/components/socia-gpt/AIPlanBadge";
import { AIUpgradeModal } from "@/components/socia-gpt/AIUpgradeModal";
import { useAIPlanStore } from "@/lib/aiPlanClient";

/* ─── Spring configs ─────────────────────────────────────────────────── */
const SPRING_FAST  = { type: "spring" as const, stiffness: 520, damping: 32 };
const SPRING_SNAPPY = { type: "spring" as const, stiffness: 400, damping: 28 };

/* ─── Main page ──────────────────────────────────────────────────────── */
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
  const [focused,     setFocused]     = useState(false);

  const abortRef      = useRef<AbortController | null>(null);
  const scrollerRef   = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);

  /* ── textarea auto-resize ── */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "42px";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  /* plan shortcuts */
  const planCode = plan?.code ?? "free";
  const maxWords = plan?.maxWords ?? 300;
  const wordCount = input.trim() ? input.trim().split(/\s+/).length : 0;
  const overLimit = planCode === "free" && wordCount > maxWords;
  const hasInput  = input.trim().length > 0 || pending.some((p) => p.uploaded && !p.error);

  /* ── init ── */
  useEffect(() => {
    useAIPlanStore.setState({ lastFetched: null });
    void refreshPlan();
  }, [refreshPlan]);

  /* ── auto-scroll ── */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  /* ── cooldown ── */
  const startCooldown = useCallback((seconds: number) => {
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
  }, []);
  useEffect(() => () => {
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
  }, []);

  /* ── file handling ── */
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
    if (!fresh.length) return;
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

  const pickFiles = useCallback((type: "image" | "audio" | "video" | "file") => {
    const map = { image: imageInputRef, audio: audioInputRef, video: videoInputRef, file: fileInputRef };
    map[type].current?.click();
    setAttachOpen(false);
  }, []);

  const removePending = useCallback((id: string) => {
    setPending((p) => {
      const t = p.find((x) => x.id === id);
      if (t) URL.revokeObjectURL(t.previewUrl);
      return p.filter((x) => x.id !== id);
    });
  }, []);

  /* ── drag & drop ── */
  useEffect(() => {
    const onDrag  = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setDragOver(true); }
    };
    const onLeave = (e: DragEvent) => { if (!e.relatedTarget) setDragOver(false); };
    const onDrop  = (e: DragEvent) => {
      setDragOver(false);
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      void addFiles(Array.from(e.dataTransfer.files));
    };
    window.addEventListener("dragenter", onDrag, { passive: false });
    window.addEventListener("dragover",  onDrag, { passive: false });
    window.addEventListener("dragleave", onLeave, { passive: true });
    window.addEventListener("drop",      onDrop,  { passive: false });
    return () => {
      window.removeEventListener("dragenter", onDrag);
      window.removeEventListener("dragover",  onDrag);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop",      onDrop);
    };
  }, [addFiles]);

  /* ── send ── */
  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (pending.some((p) => p.uploading)) return;
    const ready = pending.filter((p) => p.uploaded && !p.error).map((p) => p.uploaded!);
    if (!trimmed && !ready.length) return;
    if (busy || cooldownSec > 0) return;
    if (overLimit) { setGlobalError(`Message exceeds ${maxWords}-word limit.`); return; }

    setInput(""); setBusy(true); setGlobalError(null);
    setAttachOpen(false);
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
        onRateLimit: startCooldown,
      });
    } finally { setBusy(false); abortRef.current = null; }
  }, [pending, busy, cooldownSec, overLimit, maxWords, mode, plan, startCooldown]);

  /* ── regenerate ── */
  const regenerate = useCallback((assistantMsg: ChatMessage) => {
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
  }, [busy, cooldownSec, removeMessage, mode]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const openUpgrade = useCallback(() => setUpgradeOpen(true), []);

  /* ── separator on focus ── */
  const separated = focused || attachOpen;

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      style={{ background: "#000000" }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: "#000000",
        }}
      >
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => navigate("/create")}
          className="grid h-9 w-9 place-items-center rounded-full shrink-0"
          style={{
            background: "#0a0a0a",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.5)",
          }}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </motion.button>

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <motion.div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px]"
            animate={busy ? { outline: ["2px solid rgba(139,92,246,0.35)", "2px solid rgba(139,92,246,0.6)", "2px solid rgba(139,92,246,0.35)"] } : { outline: "2px solid transparent" }}
            transition={busy ? { duration: 2.0, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
            style={{ background: "linear-gradient(145deg, #a78bfa, #8b5cf6, #6366f1)" }}
          >
            <motion.div
              animate={busy ? { rotate: [0, 6, -4, 0] } : { rotate: 0 }}
              transition={busy ? { duration: 3.0, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
            >
              <Sparkles className="h-4 w-4 text-white" strokeWidth={1.5} />
            </motion.div>
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[15px] font-semibold leading-none tracking-[-0.02em] text-white">
                Socia <span className="text-gradient">GPT</span>
              </h1>
              {plan && (
                <button onClick={openUpgrade}>
                  <AIPlanBadge code={planCode} />
                </button>
              )}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={busy ? "thinking" : "idle"}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.18 }}
                className="mt-0.5 text-[10px]"
                style={{ color: "rgba(255,255,255,0.26)" }}
              >
                {busy ? "Generating…" : "Your intelligent creative partner"}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        {messages.length > 0 && (
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => {
              if (confirm("Clear this conversation?")) { stop(); clear(); }
            }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{
              background: "#0a0a0a",
              border: "1px solid rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.35)",
            }}
            aria-label="Clear chat"
          >
            <Trash2 className="h-4 w-4" />
          </motion.button>
        )}
      </div>

      {/* ── Message list ── */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{
          padding: "20px 16px 72px",
          WebkitOverflowScrolling: "touch",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 82%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, black 0%, black 82%, transparent 100%)",
        }}
        onClick={() => { if (attachOpen) setAttachOpen(false); }}
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-5">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <Bubble
                  key={m.id}
                  m={m}
                  onRegen={() => regenerate(m)}
                  busy={busy}
                  onUpgrade={openUpgrade}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Cooldown bar ── */}
      <AnimatePresence>
        {cooldownSec > 0 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="shrink-0 overflow-hidden"
            style={{ background: "rgba(168,85,247,0.04)" }}
          >
            <motion.div
              className="h-[2px]"
              style={{ background: "linear-gradient(90deg,#a855f7,#ec4899)" }}
              initial={{ scaleX: 1, originX: 0 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: cooldownSec, ease: "linear" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Composer ── */}
      <div
  className="shrink-0 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),12px)]"
  style={{
    background: "transparent",
    borderTop: "none",
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
  }}
>
        {/* Pending attachments */}
        <AnimatePresence>
          {pending.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={SPRING_FAST}
              className="mb-2 grid grid-cols-2 gap-1.5 overflow-hidden sm:grid-cols-3"
            >
              {pending.map((p) => (
                <PendingChip key={p.id} att={p} onRemove={() => removePending(p.id)} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error banner */}
        <AnimatePresence>
          {globalError && (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              transition={SPRING_FAST}
              className="mb-2 flex items-start gap-2 rounded-2xl px-3 py-2.5 text-[12px]"
              style={{
                background: "rgba(239,68,68,0.07)",
                border: "1px solid rgba(239,68,68,0.15)",
                color: "rgba(252,165,165,0.9)",
              }}
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="flex-1">{globalError}</span>
              <button
                onClick={() => setGlobalError(null)}
                style={{ color: "rgba(252,165,165,0.4)" }}
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Attachment glass panel ── */}
        <AnimatePresence>
          {attachOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={SPRING_FAST}
              className="mb-3 overflow-hidden"
              style={{
                borderRadius: 20,
                background: "#0a0a0a",
                border: "1px solid rgba(255,255,255,0.04)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.8)",
                width: "fit-content",
                minWidth: 210,
              }}
            >
              {([
                { Icon: Camera,    label: "Camera", type: "image" as const, locked: false },
                { Icon: ImageIcon, label: "Photos", type: "image" as const, locked: false },
                { Icon: Film,      label: "Videos", type: "video" as const, locked: planCode === "free" },
                { Icon: Folder,    label: "Files",  type: "file"  as const, locked: false },
                { Icon: Mic,       label: "Voice",  type: "audio" as const, locked: planCode === "free" },
              ] as const).map(({ Icon, label, type, locked }, i) => (
                <motion.button
                  key={label}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => locked ? openUpgrade() : pickFiles(type)}
                  className="flex w-full items-center gap-3.5 px-4 py-3.5"
                  style={{
                    borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    willChange: "transform",
                  }}
                >
                  <Icon
                    className="h-[16px] w-[16px] shrink-0"
                    style={{ color: locked ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.5)" }}
                  />
                  <span
                    className="flex-1 text-left text-[13.5px] font-medium tracking-[-0.01em]"
                    style={{ color: locked ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.78)" }}
                  >
                    {label}
                  </span>
                  {locked && (
                    <Crown
                      className="h-3 w-3 shrink-0"
                      style={{ color: "rgba(234,179,8,0.45)" }}
                    />
                  )}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Input row: [+] [gap] [pill with textarea + mic/send] ── */}
        <form
          onSubmit={(e) => { e.preventDefault(); void send(input); }}
          className="flex items-end"
          style={{ gap: 0 }}
        >
          {/* + button — scales on focus, stays in layout flow */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.80 }}
            animate={{ scale: separated ? 0.90 : 1 }}
            transition={SPRING_SNAPPY}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setAttachOpen((v) => !v);
              textareaRef.current?.focus();
            }}
            aria-label="Attach"
            className="grid shrink-0 self-end place-items-center"
            style={{
              width: 42,
              height: 42,
              marginBottom: 1,
              borderRadius: "50%",
              background: attachOpen
                ? "rgba(168,85,247,0.12)"
                : "#0a0a0a",
              border: attachOpen
                ? "1.5px solid rgba(168,85,247,0.38)"
                : "1.5px solid rgba(255,255,255,0.07)",
              boxShadow: "none",
              color: attachOpen
                ? "rgba(216,180,254,1)"
                : "rgba(255,255,255,0.55)",
              willChange: "transform",
              transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s",
            }}
          >
            <motion.div
              animate={{ rotate: attachOpen ? 45 : 0 }}
              transition={SPRING_FAST}
            >
              <Plus className="h-[18px] w-[18px]" strokeWidth={2.5} />
            </motion.div>
          </motion.button>

          {/* Animated gap spacer — grows when focused/open */}
          <motion.div
            initial={{ width: 6 }}
            animate={{ width: separated ? 10 : 6 }}
            transition={SPRING_SNAPPY}
            className="shrink-0"
            style={{ height: 1 }}
          />

          {/* Input pill — flex-1, no motion animation on layout props */}
          <div
            className="relative min-w-0 flex-1"
            style={{
              borderRadius: 24,
              background: "#0a0a0a",
              border: `1.5px solid ${focused ? "rgba(168,85,247,0.45)" : attachOpen ? "rgba(168,85,247,0.18)" : "rgba(255,255,255,0.06)"}`,
              boxShadow: focused ? "0 0 0 2px rgba(168,85,247,0.08)" : "none",
              transition: "border-color 0.15s, box-shadow 0.2s",
              overflow: "visible",
            }}
          >
            <div className="flex items-end">
              {/* Textarea */}
              <div className="relative flex-1 min-w-0">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value.slice(0, planCode === "free" ? 2000 : 64000));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  rows={1}
                  placeholder={
                    cooldownSec > 0 ? `Ready in ${cooldownSec}s…`
                    : pending.length  ? "Ask about your file…"
                    : "Message Socia GPT…"
                  }
                  disabled={cooldownSec > 0}
                  className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-white placeholder-white/20 outline-none disabled:opacity-40 [&::-webkit-scrollbar]:hidden"
                  style={{
                    caretColor: "#c084fc",
                    padding: "11px 4px 11px 14px",
                    maxHeight: 120,
                    minHeight: 42,
                    overflowY: "auto",
                    scrollbarWidth: "none",
                    WebkitOverflowScrolling: "touch",
                  }}
                />
                {planCode === "free" && input.length > 0 && (
                  <div
                    className="absolute right-1 bottom-2 text-[9px] font-mono"
                    style={{ color: overLimit ? "rgb(248,113,113)" : "rgba(255,255,255,0.15)" }}
                  >
                    {wordCount}/{maxWords}
                  </div>
                )}
              </div>

              {/* Mic → Send morph (right side of pill) */}
              <div className="absolute right-2 bottom-2 flex shrink-0 items-center justify-center">
                <AnimatePresence mode="popLayout" initial={false}>
                  {busy ? (
                    <motion.button
                      key="stop"
                      type="button"
                      whileTap={{ scale: 0.82 }}
                      onClick={stop}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={SPRING_FAST}
                      className="grid place-items-center"
                      style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: "rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.7)",
                        willChange: "transform",
                      }}
                      aria-label="Stop"
                    >
                      <X className="h-4 w-4" />
                    </motion.button>
                  ) : hasInput ? (
                    <motion.button
                      key="send"
                      type="submit"
                      whileTap={{ scale: 0.82 }}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={SPRING_FAST}
                      className="grid place-items-center text-white"
                      style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: "linear-gradient(135deg,#a855f7,#ec4899)",
                        boxShadow: "0 4px 16px rgba(168,85,247,0.6)",
                        willChange: "transform",
                      }}
                      aria-label="Send"
                    >
                      {pending.some((p) => p.uploading)
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Send className="h-4 w-4" style={{ transform: "translateX(1px)" }} />
                      }
                    </motion.button>
                  ) : (
                    <motion.button
                      key="mic"
                      type="button"
                      whileTap={{ scale: 0.82 }}
                      onClick={() => planCode === "free" ? openUpgrade() : pickFiles("audio")}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={SPRING_FAST}
                      className="grid place-items-center"
                      style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: "rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.45)",
                        willChange: "transform",
                      }}
                      aria-label="Voice"
                    >
                      <Mic className="h-4 w-4" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </form>

        {/* Hidden file inputs */}
        <input ref={imageInputRef} type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
          multiple className="hidden"
          onChange={(e) => {
            const f = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (f.length) void addFiles(f);
          }} />
        <input ref={videoInputRef} type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (f.length) void addFiles(f);
          }} />
        <input ref={audioInputRef} type="file"
          accept="audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/mp3,audio/wav"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (f.length) void addFiles(f);
          }} />
        <input ref={fileInputRef} type="file"
          accept="image/*,application/pdf,.txt,.md"
          multiple className="hidden"
          onChange={(e) => {
            const f = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (f.length) void addFiles(f);
          }} />
      </div>

      {/* ── Drag-over overlay ── */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
            style={{ background: "rgba(0,0,0,0.92)" }}
          >
            <motion.div
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              transition={SPRING_FAST}
              className="rounded-3xl border-2 border-dashed px-8 py-10 text-center"
              style={{
                borderColor: "rgba(168,85,247,0.5)",
                background: "rgba(168,85,247,0.06)",
              }}
            >
              <Upload className="mx-auto mb-3 h-8 w-8 text-fuchsia-300" />
              <div className="font-display text-[17px] font-bold text-white">Drop to attach</div>
              <div className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.38)" }}>
                {planCode !== "free" ? "Image · Video · Audio" : "Image"} · max 25 MB
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AIUpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        currentPlan={planCode}
      />
    </div>
  );
}


/* ─── Empty state ────────────────────────────────────────────────────── */
const EmptyState = memo(function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="flex min-h-[58vh] flex-col items-center justify-center pb-6 text-center"
    >
      {/* Orb */}
      <div className="relative mb-9">
        <motion.div
          initial={{ scale: 0.75, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative grid h-[78px] w-[78px] place-items-center rounded-[26px]"
          style={{
            background: "linear-gradient(145deg, #a78bfa 0%, #8b5cf6 45%, #6366f1 100%)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.08) inset",
          }}
        >
          <Sparkles className="h-8 w-8 text-white" strokeWidth={1.5} />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4, ease: "easeOut" }}
        className="space-y-3"
      >
        <h2
          className="font-display text-[23px] font-semibold tracking-[-0.02em] text-white"
        >
          Hi, I'm <span className="text-gradient">Socia GPT</span>
        </h2>
        <p
          className="mx-auto max-w-[220px] text-[13px] leading-[1.65]"
          style={{ color: "rgba(255,255,255,0.28)" }}
        >
          Your intelligent creative partner.
        </p>
      </motion.div>
    </motion.div>
  );
});

/* ─── Bubble ─────────────────────────────────────────────────────────── */
const Bubble = memo(function Bubble({ m, onRegen, busy, onUpgrade }: {
  m: ChatMessage;
  onRegen: () => void;
  busy: boolean;
  onUpgrade: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (m.role === "user") {
    return (
      <motion.div
        layout="position"
        initial={{ opacity: 0, y: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="flex justify-end"
      >
        <div
          className="max-w-[82%] rounded-[22px] rounded-br-[6px] px-4 py-3.5 text-[14px] leading-relaxed text-white"
          style={{
            background: "linear-gradient(145deg, rgba(168,85,247,0.92), rgba(236,72,153,0.82))",
            boxShadow: "none",
          }}
        >
          {m.attachments && m.attachments.length > 0 && (
            <BubbleAttachments items={m.attachments} />
          )}
          {m.content && m.content !== "(see attached)" && (
            <p className="whitespace-pre-wrap">{m.content}</p>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="flex justify-start"
    >
      <div className="w-full max-w-[92%]">
        <div
          className="rounded-[22px] rounded-bl-[6px] px-4 py-4"
          style={{
            background: "#0d0d0d",
            border: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          {m.content ? (
            <MessageMarkdown source={m.content} />
          ) : m.pending ? (
            <TypingDots />
          ) : null}

          {m.pending && m.content && (
            <span
              className="ml-1 inline-block h-[14px] w-[3px] animate-pulse rounded-sm align-middle"
              style={{ background: "rgba(192,38,211,0.7)" }}
            />
          )}

          {m.error && !m.pending && (
            <ErrorBubble
              error={m.error}
              code={m.errorCode ?? ""}
              onUpgrade={onUpgrade}
              onRetry={onRegen}
              busy={busy}
            />
          )}
        </div>

        {!m.pending && m.content && !m.error && (
          <div
            className="mt-1.5 flex gap-3 px-1 text-[11px]"
            style={{ color: "rgba(255,255,255,0.2)" }}
          >
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => {
                navigator.clipboard.writeText(m.content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-white/50"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={onRegen}
              disabled={busy}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-white/50 disabled:opacity-20"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  );
});

/* ─── Typing dots ────────────────────────────────────────────────────── */
function TypingDots() {
  return (
    <div className="flex items-center gap-[5px] py-0.5">
      {[0, 0.2, 0.42].map((delay) => (
        <motion.span
          key={delay}
          className="block h-[6px] w-[6px] rounded-full"
          style={{ background: "rgba(255,255,255,0.3)" }}
          animate={{ opacity: [0.2, 0.65, 0.2], scale: [0.85, 1.1, 0.85] }}
          transition={{ duration: 1.3, repeat: Infinity, delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/* ─── Error bubble ───────────────────────────────────────────────────── */
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
      <div
        className="mt-3 rounded-2xl p-4 text-center"
        style={{
          background: "rgba(168,85,247,0.06)",
          border: "1px solid rgba(168,85,247,0.18)",
        }}
      >
        <Clock className="mx-auto mb-2 h-5 w-5 text-purple-400 opacity-70" />
        <p className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>
          Daily limit reached
        </p>
        <p
          className="mt-1 text-[11.5px] leading-relaxed"
          style={{ color: "rgba(255,255,255,0.38)" }}
        >
          Your access refreshes tomorrow at midnight.
        </p>
        <button
          onClick={onUpgrade}
          className="mt-3 rounded-xl px-4 py-2 text-[11.5px] font-semibold"
          style={{
            background: "linear-gradient(135deg,rgba(168,85,247,0.2),rgba(236,72,153,0.14))",
            border: "1px solid rgba(168,85,247,0.3)",
            color: "rgba(216,180,254,0.95)",
          }}
        >
          Upgrade for more
        </button>
      </div>
    );
  }

  if (code === "ATTACHMENT_PLAN_LIMIT") {
    return (
      <div
        className="mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3"
        style={{
          background: "rgba(234,179,8,0.06)",
          border: "1px solid rgba(234,179,8,0.15)",
        }}
      >
        <Crown className="mt-0.5 h-4 w-4 shrink-0 text-amber-400/70" />
        <div className="flex-1">
          <p className="text-[12.5px]" style={{ color: "rgba(255,255,255,0.6)" }}>
            Audio and video require a Premium plan or above.
          </p>
          <button
            onClick={onUpgrade}
            className="mt-1.5 text-[11px] font-semibold"
            style={{ color: "rgba(253,224,71,0.7)" }}
          >
            View plans →
          </button>
        </div>
      </div>
    );
  }

  if (code === "SERVER_BUSY" || code === "NETWORK_ERROR") {
    return (
      <div
        className="mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,0.28)" }} />
        <div className="flex-1">
          <p className="text-[12.5px]" style={{ color: "rgba(255,255,255,0.55)" }}>
            {error}
          </p>
          <button
            onClick={onRetry}
            disabled={busy}
            className="mt-1.5 text-[11px] font-medium transition-colors hover:text-white/60 disabled:opacity-25"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Try again →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px]"
      style={{ background: "rgba(239,68,68,0.06)", color: "rgba(252,165,165,0.82)" }}
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
      <span>{error}</span>
    </div>
  );
}

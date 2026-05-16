/**
 * Payment Control Center — enterprise fintech payment method management.
 * Preserves all backend logic from the original PaymentMethodsTab.
 * Pure UI/UX upgrade: glassmorphism, premium inputs, drag-drop QR, sticky save bar.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Smartphone, Building2, CreditCard, Copy, Eye, EyeOff, Upload,
  X, CheckCircle2, Loader2, AlertCircle, Activity, Wifi, Clock,
  Save, RotateCcw, ImageIcon, ZoomIn, PlugZap, WifiOff,
} from "lucide-react";
import {
  adminGetPaymentSettings, adminSavePaymentSettings,
  type PaymentSettings,
} from "@/lib/adminAuth";

/* ── Cloudinary upload ───────────────────────────────────────────────── */
const CLD_CLOUD  = "devyx5yyk";
const CLD_PRESET = "socia_upload";

async function uploadToCloudinary(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLD_CLOUD}/image/upload`, {
    method: "POST", body: fd,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const json = await res.json() as { secure_url: string };
  return json.secure_url;
}

/* ── Constants ───────────────────────────────────────────────────────── */
const PM_DEFAULTS: PaymentSettings = {
  gcash_enabled: true,  gcash_name: "",  gcash_number: "",  gcash_qr_url: "",
  maya_enabled:  true,  maya_name:  "",  maya_number:  "",  maya_qr_url:  "",
  bank_enabled:  true,  bank_name:  "",  bank_account_name: "", bank_account_no: "", bank_qr_url: "",
  notes: "",
};

type MethodKey = "gcash" | "maya" | "bank";

interface MethodConfig {
  key:          MethodKey;
  label:        string;
  subtitle:     string;
  icon:         React.ReactNode;
  gradient:     string;
  glowColor:    string;
  borderGlow:   string;
  accentClass:  string;
  enabledField: keyof PaymentSettings;
  nameField:    keyof PaymentSettings;
  numField:     keyof PaymentSettings;
  numLabel:     string;
  numMono:      boolean;
  qrField:      keyof PaymentSettings;
  extraFields?: { field: keyof PaymentSettings; label: string; mono?: boolean }[];
}

const METHODS: MethodConfig[] = [
  {
    key: "gcash", label: "GCash", subtitle: "Mobile wallet · Philippines",
    icon: <Smartphone size={18} />,
    gradient: "from-emerald-500 via-teal-500 to-cyan-500",
    glowColor: "rgba(16,185,129,0.15)",
    borderGlow: "rgba(16,185,129,0.4)",
    accentClass: "bg-emerald-500",
    enabledField: "gcash_enabled", nameField: "gcash_name",
    numField: "gcash_number", numLabel: "GCash number", numMono: true,
    qrField: "gcash_qr_url",
  },
  {
    key: "maya", label: "Maya", subtitle: "Digital bank · PayMaya",
    icon: <CreditCard size={18} />,
    gradient: "from-blue-500 via-indigo-500 to-violet-500",
    glowColor: "rgba(99,102,241,0.15)",
    borderGlow: "rgba(99,102,241,0.4)",
    accentClass: "bg-blue-500",
    enabledField: "maya_enabled", nameField: "maya_name",
    numField: "maya_number", numLabel: "Maya number", numMono: true,
    qrField: "maya_qr_url",
  },
  {
    key: "bank", label: "Bank Transfer", subtitle: "Instapay / PESONet · Visa",
    icon: <Building2 size={18} />,
    gradient: "from-amber-500 via-orange-500 to-rose-500",
    glowColor: "rgba(245,158,11,0.15)",
    borderGlow: "rgba(245,158,11,0.4)",
    accentClass: "bg-amber-500",
    enabledField: "bank_enabled", nameField: "bank_name",
    numField: "bank_account_no", numLabel: "Account number", numMono: true,
    qrField: "bank_qr_url",
    extraFields: [{ field: "bank_account_name", label: "Account holder name", mono: false }],
  },
];

/* ── Premium toggle ──────────────────────────────────────────────────── */
function PremiumToggle({
  enabled, onChange, accentClass, borderGlow,
}: { enabled: boolean; onChange: () => void; accentClass: string; borderGlow: string }) {
  return (
    <motion.button
      type="button"
      onClick={onChange}
      className="relative h-7 w-13 flex-shrink-0 rounded-full"
      style={{
        width: 52,
        background: enabled ? undefined : "rgba(255,255,255,0.08)",
        boxShadow: enabled ? `0 0 12px ${borderGlow}, 0 0 4px ${borderGlow}` : "none",
      }}
      animate={enabled ? {} : {}}>
      <motion.div
        className={`absolute inset-0 rounded-full ${enabled ? accentClass : ""}`}
        initial={false}
        animate={{ opacity: enabled ? 1 : 0 }}
        transition={{ duration: 0.25 }}
      />
      <motion.div
        className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-lg"
        initial={false}
        animate={{ x: enabled ? 26 : 3 }}
        transition={{ type: "spring", stiffness: 700, damping: 30 }}
      />
    </motion.button>
  );
}

/* ── Floating label input ────────────────────────────────────────────── */
function GlassInput({
  label, value, onChange, mono = false, placeholder, accentClass,
  type = "text", copyable = false, toggleable = false,
}: {
  label:       string;
  value:       string;
  onChange:    (v: string) => void;
  mono?:       boolean;
  placeholder?: string;
  accentClass: string;
  type?:       string;
  copyable?:   boolean;
  toggleable?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible]  = useState(false);
  const [copied, setCopied]    = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  const inputType = toggleable ? (visible ? "text" : "password") : type;
  const hasValue  = value.length > 0;
  const isFloat   = focused || hasValue;

  return (
    <div className="relative group">
      {/* Glass input container */}
      <div
        className="relative rounded-xl overflow-hidden transition-all duration-200"
        style={{
          background: focused ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
          border: focused
            ? `1px solid rgba(255,255,255,0.2)`
            : `1px solid rgba(255,255,255,0.07)`,
          boxShadow: focused ? `0 0 0 3px rgba(99,102,241,0.12)` : "none",
        }}>
        {/* Floating label */}
        <motion.label
          className="pointer-events-none absolute left-3 font-medium select-none"
          initial={false}
          animate={{
            top:      isFloat ? 6  : "50%",
            y:        isFloat ? 0  : "-50%",
            fontSize: isFloat ? 10 : 13,
            opacity:  isFloat ? 0.5 : 0.4,
          }}
          transition={{ duration: 0.15 }}
          style={{ color: focused ? "white" : undefined }}>
          {label}
        </motion.label>

        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={isFloat ? placeholder : ""}
          className={`w-full bg-transparent px-3 pb-2.5 pt-5 text-sm text-white placeholder-white/20 focus:outline-none ${
            mono ? "font-mono tracking-wide" : ""
          } ${(copyable || toggleable) ? "pr-16" : "pr-3"}`}
        />

        {/* Right controls */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {toggleable && (
            <button type="button" onClick={() => setVisible((v) => !v)}
              className="p-1 rounded text-white/30 hover:text-white/60 transition-colors">
              {visible ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          )}
          {copyable && value && (
            <button type="button" onClick={handleCopy}
              className="p-1 rounded text-white/30 hover:text-white/60 transition-colors">
              <AnimatePresence mode="wait">
                {copied
                  ? <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                      <CheckCircle2 size={13} className="text-emerald-400" />
                    </motion.span>
                  : <motion.span key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                      <Copy size={13} />
                    </motion.span>
                }
              </AnimatePresence>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── QR Upload Zone ──────────────────────────────────────────────────── */
function QRUploadZone({
  url, uploading, onFile, onClear, accentClass, borderGlow,
}: {
  url:       string;
  uploading: boolean;
  onFile:    (f: File) => void;
  onClear:   () => void;
  accentClass: string;
  borderGlow:  string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging]   = useState(false);
  const [hovering, setHovering]   = useState(false);
  const [zoomed, setZoomed]       = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) onFile(file);
  }, [onFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = "";
  }, [onFile]);

  if (url) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">QR Code</p>
        {/* QR Preview */}
        <div
          className="relative rounded-2xl overflow-hidden cursor-pointer group"
          style={{
            boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)`,
          }}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}>
          <motion.img
            src={url} alt="QR Code"
            className="h-32 w-32 object-contain bg-white rounded-2xl p-1.5"
            animate={{ scale: hovering ? 1.04 : 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
          {/* Hover overlay */}
          <AnimatePresence>
            {hovering && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl"
                style={{ background: "rgba(0,0,0,0.88)" }}>
                <button type="button" onClick={() => setZoomed(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white transition-colors">
                  <ZoomIn size={12} /> Preview
                </button>
                <button type="button" onClick={() => inputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white transition-colors">
                  <Upload size={12} /> Replace
                </button>
                <button type="button" onClick={onClear}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs text-red-300 transition-colors">
                  <X size={12} /> Remove
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom quick actions */}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-white/50 hover:text-white/80 transition-all border border-white/5">
            <Upload size={11} /> Replace
          </button>
          <button type="button" onClick={onClear}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/5 hover:bg-red-500/10 text-[11px] text-red-400/60 hover:text-red-400 transition-all border border-red-500/10">
            <X size={11} /> Remove
          </button>
        </div>

        {/* Zoom modal */}
        <AnimatePresence>
          {zoomed && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-8"
              style={{ background: "rgba(0,0,0,0.92)" }}
              onClick={() => setZoomed(false)}>
              <motion.img
                src={url} alt="QR Code"
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="max-h-80 max-w-80 rounded-3xl bg-white p-4 shadow-2xl object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">QR Code</p>
      <motion.button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        animate={{
          borderColor: dragging ? borderGlow : "rgba(255,255,255,0.1)",
          backgroundColor: dragging ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
          boxShadow: dragging ? `0 0 20px ${borderGlow}` : "none",
        }}
        transition={{ duration: 0.15 }}
        className="flex h-32 w-32 flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed disabled:opacity-50 transition-colors">
        <AnimatePresence mode="wait">
          {uploading
            ? <motion.div key="loading" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <Loader2 size={22} className="animate-spin text-white/40" />
              </motion.div>
            : dragging
              ? <motion.div key="drag" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                  <Upload size={22} className="text-white/70" />
                </motion.div>
              : <motion.div key="idle" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                  className="flex flex-col items-center gap-1.5">
                  <ImageIcon size={20} className="text-white/25" />
                  <span className="text-[9px] text-white/25 text-center leading-tight px-2">
                    {uploading ? "Uploading…" : "Drop QR or click"}
                  </span>
                </motion.div>
          }
        </AnimatePresence>
      </motion.button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
    </div>
  );
}

/* ── Status chip ─────────────────────────────────────────────────────── */
function StatusChip({ enabled, borderGlow, accentClass }: { enabled: boolean; borderGlow: string; accentClass: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest border transition-all ${
      enabled
        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
        : "text-white/30 bg-white/5 border-white/8"
    }`}>
      {enabled && (
        <span className="relative flex h-1.5 w-1.5">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${accentClass}`} />
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${accentClass}`} />
        </span>
      )}
      {enabled ? "Live" : "Offline"}
    </div>
  );
}

/* ── Method card ─────────────────────────────────────────────────────── */
function MethodCard({
  method, settings, onPatch, onQR, uploading,
}: {
  method:   MethodConfig;
  settings: PaymentSettings;
  onPatch:  <K extends keyof PaymentSettings>(k: K, v: PaymentSettings[K]) => void;
  onQR:     (field: keyof PaymentSettings, file: File) => void;
  uploading: string | null;
}) {
  const enabled = Boolean(settings[method.enabledField]);

  const s = (f: keyof PaymentSettings) => (settings[f] as string) ?? "";

  return (
    <motion.div
      layout
      whileHover={{ y: -2, boxShadow: enabled ? `0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08), 0 0 40px ${method.glowColor}` : "0 16px 48px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06)" }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="relative rounded-3xl overflow-hidden"
      style={{
        background: enabled
          ? `linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)`
          : "rgba(255,255,255,0.02)",
        border: `1px solid ${enabled ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)"}`,
        boxShadow: enabled ? `0 16px 48px rgba(0,0,0,0.3), 0 0 24px ${method.glowColor}` : "0 8px 24px rgba(0,0,0,0.2)",
        opacity: enabled ? 1 : 0.65,
      }}>

      {/* Gradient top accent bar */}
      <div className={`h-0.5 w-full bg-gradient-to-r ${method.gradient} ${enabled ? "opacity-100" : "opacity-25"}`} />

      {/* Card header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          {/* Icon badge */}
          <div className={`relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${method.gradient} shadow-lg flex-shrink-0`}>
            <span className="text-white">{method.icon}</span>
            {enabled && (
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2"
                style={{ borderColor: "#060a10", backgroundColor: "#10b981" }} />
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">{method.label}</h3>
            <p className="text-[10px] text-white/40 mt-0.5">{method.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip enabled={enabled} borderGlow={method.borderGlow} accentClass={method.accentClass} />
          <PremiumToggle
            enabled={enabled}
            onChange={() => onPatch(method.enabledField, !enabled as PaymentSettings[typeof method.enabledField])}
            accentClass={method.accentClass}
            borderGlow={method.borderGlow}
          />
        </div>
      </div>

      {/* Fields + QR */}
      <AnimatePresence>
        {enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}>
            <div className="px-5 pb-5 space-y-4">
              {/* Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

              {/* Input fields */}
              <div className="space-y-3">
                <GlassInput
                  label="Display name"
                  value={s(method.nameField)}
                  onChange={(v) => onPatch(method.nameField, v as PaymentSettings[typeof method.nameField])}
                  placeholder="e.g. Socia Payments"
                  accentClass={method.accentClass}
                />
                {method.extraFields?.map(({ field, label, mono }) => (
                  <GlassInput
                    key={field as string}
                    label={label}
                    value={s(field)}
                    onChange={(v) => onPatch(field, v as PaymentSettings[typeof field])}
                    mono={mono}
                    accentClass={method.accentClass}
                    copyable
                  />
                ))}
                <GlassInput
                  label={method.numLabel}
                  value={s(method.numField)}
                  onChange={(v) => onPatch(method.numField, v as PaymentSettings[typeof method.numField])}
                  mono={method.numMono}
                  accentClass={method.accentClass}
                  copyable
                  toggleable
                />
              </div>

              {/* QR section */}
              <div className="rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <QRUploadZone
                  url={s(method.qrField)}
                  uploading={uploading === (method.qrField as string)}
                  onFile={(f) => onQR(method.qrField, f)}
                  onClear={() => onPatch(method.qrField, "" as PaymentSettings[typeof method.qrField])}
                  accentClass={method.accentClass}
                  borderGlow={method.borderGlow}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Disabled state message */}
      {!enabled && (
        <div className="px-5 pb-4">
          <p className="text-[11px] text-white/25 italic">This payment method is hidden from customers at checkout.</p>
        </div>
      )}
    </motion.div>
  );
}

/* ── Header ─────────────────────────────────────────────────────────── */
function ControlCenterHeader({ lastSaved, isDirty }: { lastSaved: string | null; isDirty: boolean }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const syncAgo = lastSaved
    ? (() => {
        const s = Math.floor((now.getTime() - new Date(lastSaved).getTime()) / 1_000);
        if (s < 60) return "Just now";
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        return new Date(lastSaved).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      })()
    : null;

  return (
    <div className="relative mb-8 overflow-hidden rounded-3xl p-6 sm:p-8"
      style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.06) 50%, rgba(59,130,246,0.05) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
      {/* Background glow */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)" }} />
      <div className="pointer-events-none absolute -right-10 -bottom-10 h-48 w-48 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)" }} />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: title */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-5 w-5 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
              <CreditCard size={11} className="text-white" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400/70">Payment Control Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Payment Methods
          </h1>
          <p className="mt-1 text-sm text-white/40">
            Manage checkout destinations and realtime payment availability
          </p>
        </div>

        {/* Right: status chips */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Connection status */}
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold"
            style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-emerald-400">Connected</span>
          </div>

          {/* Dirty state */}
          {isDirty && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold"
              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}>
              <Activity size={10} className="text-amber-400" />
              <span className="text-amber-400">Unsaved changes</span>
            </motion.div>
          )}

          {/* Last synced */}
          {syncAgo && !isDirty && (
            <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <Clock size={10} className="text-white/40" />
              <span className="text-white/40">Synced {syncAgo}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Notes card ──────────────────────────────────────────────────────── */
function NotesCard({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="rounded-3xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
        border: `1px solid ${focused ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)"}`,
        boxShadow: focused ? "0 0 0 3px rgba(99,102,241,0.1)" : "none",
        transition: "all 0.2s",
      }}>
      {/* Top bar */}
      <div className="h-0.5 bg-gradient-to-r from-indigo-500/50 via-purple-500/50 to-pink-500/50" />
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-6 w-6 rounded-lg flex items-center justify-center bg-white/5">
            <Activity size={12} className="text-white/40" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Payment Instructions</h4>
            <p className="text-[10px] text-white/30">Shown to customers on the checkout screen</p>
          </div>
        </div>
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="e.g. Send payment to the number above, then upload your receipt for verification within 24 hours."
          className="w-full resize-none rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none transition-all"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        />
      </div>
    </div>
  );
}

/* ── Sticky action bar ───────────────────────────────────────────────── */
type SaveState = "idle" | "dirty" | "saving" | "saved";

function StickyActionBar({
  saveState, onSave, onReset, uploading,
}: {
  saveState: SaveState;
  onSave:    () => void;
  onReset:   () => void;
  uploading: boolean;
}) {
  if (saveState === "idle") return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="sticky bottom-0 z-20 mt-6 -mx-1">
      <div className="rounded-2xl p-3 flex items-center justify-between gap-3"
        style={{
          background: "#0a0a0a",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 -4px 40px rgba(0,0,0,0.5)",
        }}>
        {/* Status */}
        <div className="flex items-center gap-2">
          <AnimatePresence mode="wait">
            {saveState === "saved"
              ? <motion.div key="saved" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                  className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 size={14} />
                  All changes saved
                </motion.div>
              : saveState === "saving"
                ? <motion.div key="saving" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                    className="flex items-center gap-1.5 text-xs text-white/50">
                    <Loader2 size={14} className="animate-spin" />
                    Saving changes…
                  </motion.div>
                : <motion.div key="dirty" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                    className="flex items-center gap-1.5 text-xs text-amber-400">
                    <Activity size={14} />
                    You have unsaved changes
                  </motion.div>
            }
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2">
          {saveState === "dirty" && (
            <button type="button" onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-white/50 hover:text-white/80 transition-all">
              <RotateCcw size={13} />
              Discard
            </button>
          )}
          <motion.button
            type="button"
            onClick={onSave}
            disabled={saveState === "saving" || uploading || saveState === "saved"}
            whileTap={{ scale: 0.96 }}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-opacity"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899)" }}>
            <AnimatePresence mode="wait">
              {saveState === "saving"
                ? <motion.span key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Saving…
                  </motion.span>
                : saveState === "saved"
                  ? <motion.span key="d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                      <CheckCircle2 size={14} /> Saved
                    </motion.span>
                  : <motion.span key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                      <Save size={14} /> Save Changes
                    </motion.span>
              }
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */
export default function PaymentControlCenter() {
  const [settings,  setSettings]  = useState<PaymentSettings | null>(null);
  const [original,  setOriginal]  = useState<PaymentSettings | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  /* Load */
  useEffect(() => {
    adminGetPaymentSettings()
      .then((data) => {
        const merged = { ...PM_DEFAULTS, ...(data ?? {}) };
        setSettings(merged);
        setOriginal(merged);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  /* Dirty detection */
  const isDirty = useMemo(() => {
    if (!settings || !original) return false;
    return JSON.stringify(settings) !== JSON.stringify(original);
  }, [settings, original]);

  /* Update save state from dirty */
  useEffect(() => {
    if (saveState === "idle" && isDirty) setSaveState("dirty");
    if (saveState === "dirty" && !isDirty) setSaveState("idle");
  }, [isDirty, saveState]);

  const patch = useCallback(<K extends keyof PaymentSettings>(k: K, v: PaymentSettings[K]) => {
    setSettings((prev) => prev ? { ...prev, [k]: v } : prev);
  }, []);

  const handleQR = useCallback(async (field: keyof PaymentSettings, file: File) => {
    setUploading(field as string);
    setError(null);
    try {
      const url = await uploadToCloudinary(file);
      patch(field, url as PaymentSettings[typeof field]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
    }
  }, [patch]);

  const save = useCallback(async () => {
    if (!settings) return;
    setSaveState("saving");
    setError(null);
    try {
      await adminSavePaymentSettings(settings);
      setOriginal({ ...settings });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 3_500);
    } catch (e) {
      setError((e as Error).message);
      setSaveState("dirty");
    }
  }, [settings]);

  const reset = useCallback(() => {
    if (!original) return;
    setSettings({ ...original });
    setSaveState("idle");
  }, [original]);

  /* Loading / error */
  if (!settings) {
    if (error) {
      return (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {/* Header skeleton */}
        <div className="h-32 rounded-3xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
        {/* Card skeletons */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-3xl animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-32">
      {/* Header */}
      <ControlCenterHeader
        lastSaved={(settings as PaymentSettings & { updated_at?: string }).updated_at ?? null}
        isDirty={isDirty}
      />

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-300 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400/50 hover:text-red-400">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment method cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {METHODS.map((method) => (
          <MethodCard
            key={method.key}
            method={method}
            settings={settings}
            onPatch={patch}
            onQR={handleQR}
            uploading={uploading}
          />
        ))}
      </div>

      {/* Notes */}
      <NotesCard
        value={settings.notes ?? ""}
        onChange={(v) => patch("notes", v)}
      />

      {/* Sticky save bar */}
      <AnimatePresence>
        {saveState !== "idle" && (
          <StickyActionBar
            saveState={saveState}
            onSave={() => void save()}
            onReset={reset}
            uploading={!!uploading}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

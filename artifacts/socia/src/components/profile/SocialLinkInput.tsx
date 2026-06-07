/**
 * SocialLinkInput.tsx — Real-time URL validation per social platform.
 *
 * States:
 *   empty   → neutral border, no icon
 *   valid   → green border + green checkmark
 *   invalid → red border + red alert + error message
 *
 * Empty is always allowed. Invalid blocks Save (parent responsibility).
 */
import { useCallback } from "react";
import { Check, AlertCircle } from "lucide-react";

/* ── Supported platforms ─────────────────────────────────────────── */
export type SocialPlatform =
  | "website"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "x"
  | "youtube"
  | "linkedin";

/* ── Per-platform validators ─────────────────────────────────────── */
const VALIDATORS: Record<SocialPlatform, RegExp> = {
  website:   /^https?:\/\/.{2,}\..{2,}/i,
  facebook:  /^https?:\/\/(www\.)?facebook\.com\/.+/i,
  instagram: /^https?:\/\/(www\.)?instagram\.com\/.+/i,
  tiktok:    /^https?:\/\/(www\.)?tiktok\.com\/.+/i,
  x:         /^https?:\/\/(www\.)?(x\.com|twitter\.com)\/.+/i,
  youtube:   /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/i,
  linkedin:  /^https?:\/\/(www\.)?linkedin\.com\/.+/i,
};

/* ── Example placeholder per platform ───────────────────────────── */
const PLACEHOLDERS: Record<SocialPlatform, string> = {
  website:   "https://yoursite.com",
  facebook:  "https://facebook.com/yourprofile",
  instagram: "https://instagram.com/yourhandle",
  tiktok:    "https://tiktok.com/@yourhandle",
  x:         "https://x.com/yourhandle",
  youtube:   "https://youtube.com/@yourchannel",
  linkedin:  "https://linkedin.com/in/yourname",
};

const ERROR_HINTS: Record<SocialPlatform, string> = {
  website:   "Enter a full URL starting with https://",
  facebook:  "Must be a facebook.com URL (e.g. https://facebook.com/yourprofile)",
  instagram: "Must be an instagram.com URL (e.g. https://instagram.com/yourhandle)",
  tiktok:    "Must be a tiktok.com URL (e.g. https://tiktok.com/@yourhandle)",
  x:         "Must be an x.com or twitter.com URL",
  youtube:   "Must be a youtube.com or youtu.be URL",
  linkedin:  "Must be a linkedin.com URL (e.g. https://linkedin.com/in/yourname)",
};

/* ── Exported validator (used by parent for initialisation) ─────── */
export function validateSocialUrl(platform: SocialPlatform, url: string): boolean | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  return VALIDATORS[platform].test(trimmed);
}

/* ── Props ───────────────────────────────────────────────────────── */
interface Props {
  platform:      SocialPlatform;
  icon:          React.ReactNode;
  label:         string;
  value:         string;
  onChange:      (v: string) => void;
  onValidChange: (platform: SocialPlatform, valid: boolean | null) => void;
}

/* ── Component ───────────────────────────────────────────────────── */
export function SocialLinkInput({ platform, icon, label, value, onChange, onValidChange }: Props) {
  const valid = validateSocialUrl(platform, value);
  const state = value.trim() === "" ? "empty" : valid ? "valid" : "invalid";

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    onValidChange(platform, validateSocialUrl(platform, v));
  }, [platform, onChange, onValidChange]);

  /* ── Visual tokens ─────────────────────────────────────────────── */
  const borderColor =
    state === "valid"   ? "rgba(34,197,94,0.5)"  :
    state === "invalid" ? "rgba(239,68,68,0.5)"  :
    "rgba(255,255,255,0.08)";

  const iconColor =
    state === "valid"   ? "#22c55e" :
    state === "invalid" ? "#ef4444" :
    "rgba(255,255,255,0.30)";

  return (
    <div className="space-y-1">
      <label
        className="block text-[10.5px] font-semibold uppercase tracking-wide"
        style={{ color: "rgba(255,255,255,0.38)" }}
      >
        {label}
      </label>

      <div
        className="flex items-center rounded-[12px] overflow-hidden"
        style={{
          background:  "rgba(255,255,255,0.04)",
          border:      `1px solid ${borderColor}`,
          transition:  "border-color 0.15s ease",
        }}
      >
        {/* Platform icon */}
        <span
          className="pl-3.5 flex-shrink-0 transition-colors"
          style={{ color: iconColor, transition: "color 0.15s ease" }}
        >
          {icon}
        </span>

        {/* URL input */}
        <input
          type="url"
          value={value}
          onChange={handleChange}
          placeholder={PLACEHOLDERS[platform]}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 bg-transparent px-3 py-2.5 text-[13px] focus:outline-none min-w-0"
          style={{ color: "hsl(var(--foreground))" }}
        />

        {/* Status icon */}
        {state === "valid" && (
          <Check style={{ width: 13, height: 13, color: "#22c55e", marginRight: 12, flexShrink: 0 }} />
        )}
        {state === "invalid" && (
          <AlertCircle style={{ width: 13, height: 13, color: "#ef4444", marginRight: 12, flexShrink: 0 }} />
        )}
      </div>

      {/* Error message */}
      {state === "invalid" && (
        <p className="text-[10.5px] font-medium pl-0.5" style={{ color: "#ef4444" }}>
          {ERROR_HINTS[platform]}
        </p>
      )}
    </div>
  );
}

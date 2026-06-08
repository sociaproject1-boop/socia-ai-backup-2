/**
 * SocialLinkInput.tsx — Social platform URL / handle input with live validation.
 *
 * Accepts:
 *   - Full URLs: https://tiktok.com/@username
 *   - Handles:   @username  →  auto-converted to full URL
 *   - Usernames: username   →  auto-converted to full URL
 *
 * States:
 *   empty   → neutral border, no icon
 *   valid   → green border + green checkmark
 *   invalid → red border + red alert + error message
 *
 * Platforms: website · facebook · instagram · tiktok · x · youtube · linkedin · threads
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
  | "linkedin"
  | "threads";

/* ── Base URLs for handle → URL auto-conversion ──────────────────── */
const BASE_URLS: Record<SocialPlatform, string | null> = {
  website:   null,
  facebook:  "https://facebook.com/",
  instagram: "https://instagram.com/",
  tiktok:    "https://tiktok.com/@",
  x:         "https://x.com/",
  youtube:   "https://youtube.com/@",
  linkedin:  "https://linkedin.com/in/",
  threads:   "https://www.threads.net/@",
};

/* ── Per-platform validators ─────────────────────────────────────── */
const VALIDATORS: Record<SocialPlatform, RegExp> = {
  website:   /^https?:\/\/.{2,}\..{2,}/i,
  facebook:  /^https?:\/\/(www\.)?facebook\.com\/.+/i,
  instagram: /^https?:\/\/(www\.)?instagram\.com\/.+/i,
  tiktok:    /^https?:\/\/(www\.)?tiktok\.com\/.+/i,
  x:         /^https?:\/\/(www\.)?(x\.com|twitter\.com)\/.+/i,
  youtube:   /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/i,
  linkedin:  /^https?:\/\/(www\.)?linkedin\.com\/.+/i,
  threads:   /^https?:\/\/(www\.)?threads\.net\/.+/i,
};

/* ── Placeholders ────────────────────────────────────────────────── */
const PLACEHOLDERS: Record<SocialPlatform, string> = {
  website:   "https://yoursite.com",
  facebook:  "https://facebook.com/yourprofile  or  @yourhandle",
  instagram: "https://instagram.com/yourhandle  or  @yourhandle",
  tiktok:    "https://tiktok.com/@yourhandle  or  @yourhandle",
  x:         "https://x.com/yourhandle  or  @yourhandle",
  youtube:   "https://youtube.com/@yourchannel  or  @yourchannel",
  linkedin:  "https://linkedin.com/in/yourname  or  yourname",
  threads:   "https://threads.net/@yourhandle  or  @yourhandle",
};

/* ── Error hints ─────────────────────────────────────────────────── */
const ERROR_HINTS: Record<SocialPlatform, string> = {
  website:   "Enter a full URL starting with https://",
  facebook:  "Must be a facebook.com URL or @handle",
  instagram: "Must be an instagram.com URL or @handle",
  tiktok:    "Must be a tiktok.com URL or @handle",
  x:         "Must be an x.com / twitter.com URL or @handle",
  youtube:   "Must be a youtube.com URL or @channel",
  linkedin:  "Must be a linkedin.com/in/… URL or your name",
  threads:   "Must be a threads.net URL or @handle",
};

/* ── Auto-convert handle → full URL ─────────────────────────────── */
function autoConvert(platform: SocialPlatform, raw: string): string {
  const base = BASE_URLS[platform];
  if (!base) return raw; // website — no conversion
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  /* Already a full URL */
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  /* @handle or plain handle */
  const handle = trimmed.replace(/^@/, "").replace(/\s+/g, "");
  if (!handle) return trimmed;
  return base + handle;
}

/* ── Exported validator ─────────────────────────────────────────── */
export function validateSocialUrl(platform: SocialPlatform, url: string): boolean | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  /* Try auto-converting first */
  const converted = autoConvert(platform, trimmed);
  return VALIDATORS[platform].test(converted);
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
    const raw = e.target.value;
    onChange(raw); /* store raw while typing */
    onValidChange(platform, validateSocialUrl(platform, raw));
  }, [platform, onChange, onValidChange]);

  /* Auto-convert on blur: @handle → full URL */
  const handleBlur = useCallback(() => {
    const converted = autoConvert(platform, value);
    if (converted !== value) {
      onChange(converted);
      onValidChange(platform, validateSocialUrl(platform, converted));
    }
  }, [platform, value, onChange, onValidChange]);

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
      <label className="block text-[10.5px] font-semibold uppercase tracking-wide"
        style={{ color: "rgba(255,255,255,0.38)" }}>
        {label}
      </label>

      <div
        className="flex items-center rounded-[12px]"
        style={{
          background: "rgba(255,255,255,0.04)",
          border:     `1px solid ${borderColor}`,
          transition: "border-color 0.15s ease",
          overflow:   "hidden",
        }}
      >
        <span className="pl-3.5 flex-shrink-0 transition-colors"
          style={{ color: iconColor, transition: "color 0.15s ease" }}>
          {icon}
        </span>

        <input
          type="text"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={PLACEHOLDERS[platform]}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 bg-transparent px-3 py-2.5 text-[13px] focus:outline-none min-w-0"
          style={{ color: "hsl(var(--foreground))" }}
        />

        {state === "valid" && (
          <Check style={{ width: 13, height: 13, color: "#22c55e", marginRight: 12, flexShrink: 0 }} />
        )}
        {state === "invalid" && (
          <AlertCircle style={{ width: 13, height: 13, color: "#ef4444", marginRight: 12, flexShrink: 0 }} />
        )}
      </div>

      {state === "invalid" && (
        <p className="text-[10.5px] font-medium pl-0.5" style={{ color: "#ef4444" }}>
          {ERROR_HINTS[platform]}
        </p>
      )}
    </div>
  );
}

/**
 * EmailInput.tsx — Smart email validator with domain correction suggestions.
 *
 * States:  empty → neutral  |  valid → green  |  invalid → red
 * Features:
 *   - Missing @ detection
 *   - Missing domain detection
 *   - Invalid character detection
 *   - Domain typo suggestions  (gmai.com → gmail.com)
 *   - Green success state
 *   - Red error state with inline message
 *   - Suggestion tap-to-apply
 */
import { useState, useCallback, useId } from "react";
import { Mail, Check, AlertCircle, Lightbulb } from "lucide-react";

/* ── Domain typo map ──────────────────────────────────────────────── */
const DOMAIN_FIX: Record<string, string> = {
  "gmai.com":    "gmail.com",
  "gmial.com":   "gmail.com",
  "gmal.com":    "gmail.com",
  "gmail.co":    "gmail.com",
  "gmail.cm":    "gmail.com",
  "gamil.com":   "gmail.com",
  "gmailcom":    "gmail.com",
  "gnail.com":   "gmail.com",
  "yahooo.com":  "yahoo.com",
  "yaho.com":    "yahoo.com",
  "yahoo.co":    "yahoo.com",
  "ymail.co":    "yahoo.com",
  "hotmai.com":  "hotmail.com",
  "hotmal.com":  "hotmail.com",
  "hotmial.com": "hotmail.com",
  "outloo.com":  "outlook.com",
  "outlok.com":  "outlook.com",
  "outlookcom":  "outlook.com",
  "icloud.co":   "icloud.com",
};

/* ── Validation ───────────────────────────────────────────────────── */
function validateEmail(email: string): { valid: boolean; error: string; suggestion?: string } {
  const v = email.trim();
  if (!v) return { valid: false, error: "" };
  if (v.includes(" ")) return { valid: false, error: "Email address cannot contain spaces" };
  if (!v.includes("@")) return { valid: false, error: "Missing @ — must include @ symbol" };
  const [local, domain] = v.split("@");
  if (!local) return { valid: false, error: "Missing username before @" };
  if (!domain) return { valid: false, error: "Missing domain after @" };
  if (!domain.includes(".")) return { valid: false, error: "Missing domain extension (e.g. .com)" };
  const domainLower = domain.toLowerCase();
  if (DOMAIN_FIX[domainLower]) {
    return { valid: false, error: `Did you mean ${local}@${DOMAIN_FIX[domainLower]}?`, suggestion: `${local}@${DOMAIN_FIX[domainLower]}` };
  }
  /* Final RFC-lite check */
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && !/[<>()[\]\\,;:]/.test(v);
  if (!ok) return { valid: false, error: "Invalid email format" };
  return { valid: true, error: "" };
}

/* ── Props ────────────────────────────────────────────────────────── */
interface Props {
  value:    string;
  onChange: (v: string) => void;
  onValid?: (v: boolean) => void;
  label?:   string;
  placeholder?: string;
  shake?: boolean;
}

/* ── Component ────────────────────────────────────────────────────── */
export function EmailInput({ value, onChange, onValid, label = "Public Email", placeholder = "hello@yourdomain.com", shake = false }: Props) {
  const [touched, setTouched] = useState(false);
  const id = useId();
  const { valid, error, suggestion } = validateEmail(value);
  const isEmpty = value.trim() === "";
  const showState = touched || value.length > 0;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    const res = validateEmail(v);
    onValid?.(res.valid || v.trim() === "");
  }, [onChange, onValid]);

  const handleBlur = useCallback(() => setTouched(true), []);

  const applySuggestion = useCallback(() => {
    if (!suggestion) return;
    onChange(suggestion);
    onValid?.(true);
  }, [suggestion, onChange, onValid]);

  const state = isEmpty ? "empty" : (showState && !valid) ? "invalid" : valid ? "valid" : "empty";

  const border =
    state === "valid"   ? "1px solid rgba(34,197,94,0.5)"  :
    state === "invalid" ? "1px solid rgba(239,68,68,0.5)"  :
    "1px solid rgba(255,255,255,0.08)";

  const iconColor =
    state === "valid"   ? "#22c55e" :
    state === "invalid" ? "#ef4444" :
    "rgba(255,255,255,0.30)";

  return (
    <div
      className="space-y-1"
      style={shake && state === "invalid" ? { animation: "fieldShake 0.4s ease" } : undefined}
    >
      <label htmlFor={id} className="block text-[10.5px] font-semibold uppercase tracking-wide"
        style={{ color: "rgba(255,255,255,0.38)" }}>
        {label}
      </label>

      <div className="flex items-center rounded-[12px] overflow-hidden transition-all"
        style={{ background: "rgba(255,255,255,0.04)", border, transition: "border-color 0.15s ease" }}>
        <span className="pl-3.5 flex-shrink-0" style={{ color: iconColor, transition: "color 0.15s ease" }}>
          <Mail style={{ width: 14, height: 14 }} />
        </span>
        <input
          id={id}
          type="email"
          inputMode="email"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none"
          style={{ color: "hsl(var(--foreground))" }}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={state === "invalid"}
        />
        {state === "valid" && (
          <Check style={{ width: 14, height: 14, color: "#22c55e", marginRight: 12, flexShrink: 0 }} />
        )}
        {state === "invalid" && (
          <AlertCircle style={{ width: 14, height: 14, color: "#ef4444", marginRight: 12, flexShrink: 0 }} />
        )}
      </div>

      {state === "invalid" && error && (
        <div id={`${id}-error`} className="flex items-start gap-1.5 pl-0.5">
          {suggestion ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="flex items-center gap-1 text-[10.5px] font-medium" style={{ color: "#fbbf24" }}>
                <Lightbulb style={{ width: 10, height: 10 }} />
                {error}
              </span>
              <button type="button" onClick={applySuggestion}
                className="text-[10.5px] font-bold rounded-full px-2 py-0.5 transition-all active:scale-95"
                style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
                Apply fix
              </button>
            </div>
          ) : (
            <p className="text-[10.5px] font-medium" style={{ color: "#f87171" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export { validateEmail };

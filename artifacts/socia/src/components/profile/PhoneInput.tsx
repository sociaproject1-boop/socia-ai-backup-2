/**
 * PhoneInput.tsx — Smart phone input with country selector, flag, and auto-format.
 *
 * Uses createPortal for the dropdown so it is NEVER clipped by parent overflow.
 *
 * Features:
 *   - Philippine numbers auto-formatted: 09171234567 → +63 917 123 4567
 *   - International support with country code selector
 *   - Real-time validation
 *   - Green valid / red invalid state
 *   - Country flag dropdown (portal-rendered)
 */
import { useState, useCallback, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { Check, AlertCircle, ChevronDown, Search } from "lucide-react";

/* ── Country data ─────────────────────────────────────────────────── */
interface Country { code: string; name: string; flag: string }

const COUNTRIES: Country[] = [
  { code: "+63",  name: "Philippines",    flag: "🇵🇭" },
  { code: "+1",   name: "United States",  flag: "🇺🇸" },
  { code: "+1",   name: "Canada",         flag: "🇨🇦" },
  { code: "+44",  name: "United Kingdom", flag: "🇬🇧" },
  { code: "+61",  name: "Australia",      flag: "🇦🇺" },
  { code: "+81",  name: "Japan",          flag: "🇯🇵" },
  { code: "+82",  name: "South Korea",    flag: "🇰🇷" },
  { code: "+65",  name: "Singapore",      flag: "🇸🇬" },
  { code: "+60",  name: "Malaysia",       flag: "🇲🇾" },
  { code: "+62",  name: "Indonesia",      flag: "🇮🇩" },
  { code: "+86",  name: "China",          flag: "🇨🇳" },
  { code: "+852", name: "Hong Kong",      flag: "🇭🇰" },
  { code: "+91",  name: "India",          flag: "🇮🇳" },
  { code: "+971", name: "UAE",            flag: "🇦🇪" },
  { code: "+966", name: "Saudi Arabia",   flag: "🇸🇦" },
  { code: "+49",  name: "Germany",        flag: "🇩🇪" },
  { code: "+33",  name: "France",         flag: "🇫🇷" },
  { code: "+55",  name: "Brazil",         flag: "🇧🇷" },
  { code: "+52",  name: "Mexico",         flag: "🇲🇽" },
  { code: "+27",  name: "South Africa",   flag: "🇿🇦" },
  { code: "+64",  name: "New Zealand",    flag: "🇳🇿" },
];

/* ── Formatters / validators ──────────────────────────────────────── */
function formatPH(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const local = d.startsWith("0") ? d.slice(1) : d.startsWith("63") ? d.slice(2) : d;
  if (!local) return raw;
  if (local.length <= 3)  return `+63 ${local}`;
  if (local.length <= 6)  return `+63 ${local.slice(0,3)} ${local.slice(3)}`;
  return `+63 ${local.slice(0,3)} ${local.slice(3,6)} ${local.slice(6,10)}`;
}

function validatePhone(countryCode: string, raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return false;
  if (countryCode === "+63") {
    const local = digits.startsWith("63") ? digits.slice(2) : digits.startsWith("0") ? digits.slice(1) : digits;
    return /^9\d{9}$/.test(local);
  }
  return digits.length >= 7 && digits.length <= 15;
}

/* ── Props ────────────────────────────────────────────────────────── */
interface Props {
  value:    string;
  onChange: (v: string) => void;
  onValid?: (v: boolean) => void;
  label?:   string;
  shake?:   boolean;
}

/* ── Component ────────────────────────────────────────────────────── */
export function PhoneInput({ value, onChange, onValid, label = "Public Phone", shake = false }: Props) {
  const id = useId();
  const [countryCode, setCountryCode] = useState("+63");
  const [showDropdown, setShowDropdown] = useState(false);
  const [touched, setTouched]           = useState(false);
  const [searchQ, setSearchQ]           = useState("");
  const [dropPos, setDropPos]           = useState({ top: 0, left: 0, width: 200 });

  const triggerRef = useRef<HTMLButtonElement>(null);

  const isEmpty   = value.trim() === "";
  const isValid   = isEmpty ? null : validatePhone(countryCode, value);
  const showState = touched || value.length > 0;
  const showError = showState && !isEmpty && isValid === false;

  /* Position the portal dropdown below the trigger button */
  const openDropdown = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropPos({ top: rect.bottom + 4, left: rect.left, width: 230 });
    setShowDropdown(true);
  }, []);

  /* Close on outside click */
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target)) {
        setShowDropdown(false);
        setSearchQ("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    let formatted = raw;
    if (countryCode === "+63") {
      const digits = raw.replace(/\D/g, "");
      if (digits.startsWith("0") || digits.startsWith("63") || digits.startsWith("9")) {
        formatted = formatPH(raw);
      }
    }
    onChange(formatted);
    onValid?.(validatePhone(countryCode, formatted) || formatted.trim() === "");
  }, [countryCode, onChange, onValid]);

  const border =
    showState && !isEmpty && isValid === true  ? "1px solid rgba(34,197,94,0.5)"  :
    showError                                  ? "1px solid rgba(239,68,68,0.5)"  :
    "1px solid rgba(255,255,255,0.08)";

  const selectedCountry = COUNTRIES.find((c) => c.code === countryCode) ?? COUNTRIES[0];
  const filtered = searchQ.trim()
    ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(searchQ.toLowerCase()) || c.code.includes(searchQ))
    : COUNTRIES;

  const dropdown = showDropdown
    ? createPortal(
        <div
          style={{
            position: "fixed",
            top:      dropPos.top,
            left:     dropPos.left,
            width:    dropPos.width,
            zIndex:   99999,
            background: "#111118",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 14,
            boxShadow: "0 16px 40px rgba(0,0,0,0.75)",
            maxHeight: 280,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div className="p-2 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2 rounded-[10px] px-2.5"
              style={{ background: "rgba(255,255,255,0.07)", height: 32 }}>
              <Search style={{ width: 12, height: 12, color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
              <input
                autoFocus
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search country…"
                className="flex-1 bg-transparent text-[12px] focus:outline-none"
                style={{ color: "hsl(var(--foreground))" }}
              />
            </div>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.map((c, i) => (
              <button
                key={`${c.code}-${c.name}-${i}`}
                type="button"
                onClick={() => { setCountryCode(c.code); setShowDropdown(false); setSearchQ(""); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
                style={{ background: c.code === countryCode && c.name === selectedCountry.name ? "rgba(168,85,247,0.12)" : "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = c.code === countryCode ? "rgba(168,85,247,0.12)" : "transparent"; }}
              >
                <span className="text-base">{c.flag}</span>
                <span className="flex-1 text-[12px] truncate" style={{ color: "hsl(var(--foreground))" }}>{c.name}</span>
                <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>{c.code}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div
      className="space-y-1"
      style={shake && showError ? { animation: "fieldShake 0.4s ease" } : undefined}
    >
      <label htmlFor={id} className="block text-[10.5px] font-semibold uppercase tracking-wide"
        style={{ color: "rgba(255,255,255,0.38)" }}>
        {label}
      </label>

      <div className="flex items-center rounded-[12px] overflow-visible"
        style={{ background: "rgba(255,255,255,0.04)", border, transition: "border-color 0.15s ease" }}>

        {/* Country trigger */}
        <button
          ref={triggerRef}
          type="button"
          onClick={openDropdown}
          className="flex items-center gap-1.5 pl-3.5 pr-2.5 py-2.5 flex-shrink-0 transition-opacity active:opacity-70"
          style={{ borderRight: "1px solid rgba(255,255,255,0.07)" }}
        >
          <span className="text-base leading-none">{selectedCountry.flag}</span>
          <span className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>
            {selectedCountry.code}
          </span>
          <ChevronDown style={{ width: 11, height: 11, color: "rgba(255,255,255,0.3)" }} />
        </button>

        <input
          id={id}
          type="tel"
          inputMode="tel"
          value={value}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          placeholder={countryCode === "+63" ? "09XX XXX XXXX" : "Phone number"}
          className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none min-w-0"
          style={{ color: "hsl(var(--foreground))" }}
        />

        {showState && !isEmpty && isValid === true && (
          <Check style={{ width: 14, height: 14, color: "#22c55e", marginRight: 12, flexShrink: 0 }} />
        )}
        {showError && (
          <AlertCircle style={{ width: 14, height: 14, color: "#ef4444", marginRight: 12, flexShrink: 0 }} />
        )}
      </div>

      {showError && (
        <p className="text-[10.5px] font-medium pl-0.5" style={{ color: "#f87171" }}>
          {countryCode === "+63"
            ? "Enter a valid PH number (e.g. 09171234567)"
            : "Enter a valid phone number for the selected country"}
        </p>
      )}

      {dropdown}
    </div>
  );
}

export { validatePhone };

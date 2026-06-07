/**
 * LocationSearch.tsx — Facebook-style location autocomplete.
 *
 * Uses OpenStreetMap Nominatim (free, no API key).
 * Debounced at 350ms, min 2 chars.
 * Keyboard navigation: Arrow keys, Enter to select, Escape to close.
 * Saves: displayName, city, province, country, lat, lng.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { MapPin, X, Loader2, Search, Check } from "lucide-react";

/* ── Types ───────────────────────────────────────────────────────── */
export interface LocationData {
  displayName: string;
  city:        string;
  province:    string;
  country:     string;
  lat:         number | null;
  lng:         number | null;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?:         string;
    town?:         string;
    municipality?: string;
    village?:      string;
    county?:       string;
    state?:        string;
    province?:     string;
    region?:       string;
    country?:      string;
  };
}

interface Props {
  value:    LocationData;
  onChange: (v: LocationData) => void;
}

/* ── Helpers ─────────────────────────────────────────────────────── */
function extractCity(addr?: NominatimResult["address"]): string {
  return addr?.city || addr?.town || addr?.municipality || addr?.village || addr?.county || "";
}
function extractProvince(addr?: NominatimResult["address"]): string {
  return addr?.state || addr?.province || addr?.region || "";
}

/* ── Component ───────────────────────────────────────────────────── */
export function LocationSearch({ value, onChange }: Props) {
  const [query,     setQuery]     = useState(value.displayName || "");
  const [results,   setResults]   = useState<NominatimResult[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [open,      setOpen]      = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [locked,    setLocked]    = useState(!!value.city);

  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Search ──────────────────────────────────────────────────── */
  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=8&addressdetails=1`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      if (!res.ok) throw new Error("network error");
      const data: NominatimResult[] = await res.json();
      setResults(data);
      setOpen(data.length > 0);
      setActiveIdx(-1);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Input handler ───────────────────────────────────────────── */
  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    setLocked(false);
    onChange({ displayName: "", city: "", province: "", country: "", lat: null, lng: null });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(v), 350);
  }, [search, onChange]);

  /* ── Select ──────────────────────────────────────────────────── */
  const handleSelect = useCallback((r: NominatimResult) => {
    const city     = extractCity(r.address);
    const province = extractProvince(r.address);
    const country  = r.address?.country ?? "";
    const parts    = [city, province, country].filter(Boolean);
    const short    = parts.length > 0 ? parts.join(", ") : r.display_name.split(",")[0].trim();

    setQuery(short);
    setLocked(true);
    setOpen(false);
    setResults([]);
    onChange({
      displayName: short,
      city,
      province,
      country,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    });
  }, [onChange]);

  /* ── Clear ───────────────────────────────────────────────────── */
  const handleClear = useCallback(() => {
    setQuery("");
    setLocked(false);
    setOpen(false);
    setResults([]);
    onChange({ displayName: "", city: "", province: "", country: "", lat: null, lng: null });
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [onChange]);

  /* ── Keyboard ────────────────────────────────────────────────── */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)); }
    if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); handleSelect(results[activeIdx]); }
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
  }, [open, results, activeIdx, handleSelect]);

  /* ── Outside click ───────────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── Sync external value changes ─────────────────────────────── */
  useEffect(() => {
    if (value.displayName && value.displayName !== query) {
      setQuery(value.displayName);
      setLocked(!!value.city);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.displayName]);

  const borderColor = locked
    ? "rgba(168,85,247,0.45)"
    : query.length > 0 ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)";

  return (
    <div ref={containerRef} className="relative" style={{ isolation: "isolate" }}>
      {/* ── Input row ── */}
      <div
        className="flex items-center rounded-[13px] gap-0"
        style={{
          background:   "rgba(255,255,255,0.04)",
          border:       `1px solid ${borderColor}`,
          borderRadius: open && results.length > 0 ? "13px 13px 0 0" : "13px",
          transition:   "border-color 0.15s ease",
        }}
      >
        <span className="pl-3.5 flex-shrink-0" style={{ color: locked ? "#a855f7" : "rgba(255,255,255,0.32)" }}>
          <MapPin style={{ width: 15, height: 15 }} />
        </span>

        <input
          ref={inputRef}
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (!locked && results.length > 0) setOpen(true); }}
          placeholder="Search city, province, country…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 bg-transparent px-3 py-3 text-[13.5px] focus:outline-none min-w-0"
          style={{ color: "hsl(var(--foreground))" }}
          aria-label="Location search"
          aria-autocomplete="list"
          aria-expanded={open}
        />

        {loading && (
          <Loader2 style={{ width: 14, height: 14, color: "rgba(255,255,255,0.28)", marginRight: 12, flexShrink: 0 }} className="animate-spin" />
        )}
        {!loading && locked && (
          <Check style={{ width: 14, height: 14, color: "#22c55e", marginRight: 12, flexShrink: 0 }} />
        )}
        {!loading && !locked && !query && (
          <Search style={{ width: 14, height: 14, color: "rgba(255,255,255,0.18)", marginRight: 12, flexShrink: 0 }} />
        )}
        {!loading && query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear location"
            className="mr-2.5 flex-shrink-0 grid place-items-center rounded-full"
            style={{ width: 18, height: 18, background: "rgba(255,255,255,0.12)" }}
          >
            <X style={{ width: 10, height: 10, color: "rgba(255,255,255,0.55)" }} />
          </button>
        )}
      </div>

      {/* ── Dropdown ── */}
      {open && results.length > 0 && (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-[200] overflow-y-auto"
          style={{
            background:    "#111118",
            border:        "1px solid rgba(255,255,255,0.09)",
            borderTop:     "none",
            borderRadius:  "0 0 13px 13px",
            boxShadow:     "0 12px 32px rgba(0,0,0,0.55)",
            maxHeight:     240,
          }}
        >
          {results.map((r, i) => {
            const city     = extractCity(r.address);
            const province = extractProvince(r.address);
            const country  = r.address?.country ?? "";
            const parts    = [city, province, country].filter(Boolean);
            const label    = parts.length > 0 ? parts.join(", ") : r.display_name.split(",")[0].trim();
            const sublabel = r.display_name.split(",").slice(parts.length > 0 ? 1 : 0).join(",").trim();

            return (
              <button
                type="button"
                key={r.place_id}
                role="option"
                aria-selected={i === activeIdx}
                onClick={() => handleSelect(r)}
                className="w-full text-left px-4 py-2.5 flex items-start gap-2.5 transition-colors"
                style={{
                  background:   i === activeIdx ? "rgba(168,85,247,0.10)" : "transparent",
                  borderBottom: i < results.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}
              >
                <MapPin style={{ width: 13, height: 13, flexShrink: 0, marginTop: 3, color: "#a855f7" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate" style={{ color: "hsl(var(--foreground))" }}>
                    {label}
                  </p>
                  {sublabel && (
                    <p className="text-[11px] truncate mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                      {sublabel.length > 60 ? sublabel.slice(0, 60) + "…" : sublabel}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Selected badges ── */}
      {locked && (value.city || value.province || value.country) && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {value.city && (
            <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold"
              style={{ background: "rgba(168,85,247,0.12)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.22)" }}>
              {value.city}
            </span>
          )}
          {value.province && (
            <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold"
              style={{ background: "rgba(59,130,246,0.10)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" }}>
              {value.province}
            </span>
          )}
          {value.country && (
            <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold"
              style={{ background: "rgba(6,214,160,0.09)", color: "#06d6a0", border: "1px solid rgba(6,214,160,0.18)" }}>
              {value.country}
            </span>
          )}
        </div>
      )}

      {/* Hint when typing but not selected */}
      {!locked && query.length >= 2 && !loading && results.length === 0 && (
        <p className="mt-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.30)" }}>
          No results found. Try a different search.
        </p>
      )}
      {!locked && query.length > 0 && query.length < 2 && (
        <p className="mt-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
          Type at least 2 characters to search.
        </p>
      )}
    </div>
  );
}

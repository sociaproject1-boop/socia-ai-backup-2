/**
 * LocationPickerModal.tsx — Full-screen portal location picker.
 *
 * Renders at document.body via createPortal, so it is NEVER clipped
 * by any parent overflow:hidden container.
 *
 * Features:
 *   - GPS / current location button
 *   - Popular Philippines cities pre-loaded
 *   - Recent selections (localStorage)
 *   - Nominatim search (debounced 350ms)
 *   - Locks body scroll while open
 *   - Works with mobile keyboard (sticky search bar)
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, X, Loader2, Search, Navigation, Check, ChevronRight } from "lucide-react";
import type { LocationData } from "./LocationSearch";

/* ── Types ─────────────────────────────────────────────────────────────── */
interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string; town?: string; municipality?: string;
    village?: string; county?: string;
    state?: string; province?: string; region?: string;
    country?: string;
  };
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function extractCity(a?: NominatimResult["address"]) {
  return a?.city || a?.town || a?.municipality || a?.village || a?.county || "";
}
function extractProvince(a?: NominatimResult["address"]) {
  return a?.state || a?.province || a?.region || "";
}
function buildLabel(r: NominatimResult): { label: string; sub: string } {
  const city     = extractCity(r.address);
  const province = extractProvince(r.address);
  const country  = r.address?.country ?? "";
  const parts    = [city, province, country].filter(Boolean);
  const label    = parts.length > 0 ? parts.join(", ") : r.display_name.split(",")[0].trim();
  const sub      = parts.length > 0
    ? r.display_name.split(",").slice(parts.length).join(",").trim()
    : r.display_name.split(",").slice(1).join(",").trim();
  return { label: label.slice(0, 80), sub: sub.slice(0, 80) };
}

/* ── Popular PH locations ───────────────────────────────────────────────── */
const POPULAR_PH: LocationData[] = [
  { displayName: "Bacolod City, Negros Occidental, Philippines", city: "Bacolod City", province: "Negros Occidental", country: "Philippines", lat: 10.6765, lng: 122.9509 },
  { displayName: "Cebu City, Cebu, Philippines",                 city: "Cebu City",    province: "Cebu",              country: "Philippines", lat: 10.3157, lng: 123.8854 },
  { displayName: "Manila, Metro Manila, Philippines",            city: "Manila",        province: "Metro Manila",      country: "Philippines", lat: 14.5995, lng: 120.9842 },
  { displayName: "Davao City, Davao del Sur, Philippines",       city: "Davao City",   province: "Davao del Sur",     country: "Philippines", lat: 7.1907,  lng: 125.4553 },
  { displayName: "Quezon City, Metro Manila, Philippines",       city: "Quezon City",  province: "Metro Manila",      country: "Philippines", lat: 14.6760, lng: 121.0437 },
  { displayName: "Makati, Metro Manila, Philippines",            city: "Makati",        province: "Metro Manila",      country: "Philippines", lat: 14.5547, lng: 121.0244 },
  { displayName: "Iloilo City, Iloilo, Philippines",             city: "Iloilo City",  province: "Iloilo",            country: "Philippines", lat: 10.7202, lng: 122.5621 },
  { displayName: "Cagayan de Oro, Misamis Oriental, Philippines",city: "Cagayan de Oro",province: "Misamis Oriental",country: "Philippines", lat: 8.4822,  lng: 124.6472 },
  { displayName: "Zamboanga City, Zamboanga del Sur, Philippines",city:"Zamboanga City",province:"Zamboanga del Sur",country: "Philippines", lat: 6.9214,  lng: 122.0790 },
  { displayName: "General Santos, South Cotabato, Philippines",  city: "General Santos",province:"South Cotabato",    country: "Philippines", lat: 6.1164,  lng: 125.1716 },
];

const RECENT_KEY = "socia_recent_locations";
function loadRecent(): LocationData[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").slice(0, 5); } catch { return []; }
}
function saveRecent(loc: LocationData) {
  try {
    const prev = loadRecent().filter((l) => l.displayName !== loc.displayName);
    localStorage.setItem(RECENT_KEY, JSON.stringify([loc, ...prev].slice(0, 5)));
  } catch { /* ok */ }
}

/* ── Props ──────────────────────────────────────────────────────────────── */
interface Props {
  open:     boolean;
  value:    LocationData;
  onChange: (v: LocationData) => void;
  onClose:  () => void;
}

/* ── Component ──────────────────────────────────────────────────────────── */
export function LocationPickerModal({ open, value, onChange, onClose }: Props) {
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState<NominatimResult[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [gpsLoading,setGpsLoading]= useState(false);
  const [gpsError,  setGpsError]  = useState("");
  const [recent,    setRecent]    = useState<LocationData[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef  = useRef<AbortController | null>(null);

  /* Lock body scroll while open */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setQuery("");
      setResults([]);
      setGpsError("");
      setRecent(loadRecent());
      setTimeout(() => searchRef.current?.focus(), 80);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  /* ── Search ──────────────────────────────────────────────────────────── */
  const search = useCallback(async (q: string) => {
    abortRef.current?.abort();
    if (q.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=10&addressdetails=1`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" }, signal: ctrl.signal });
      if (!res.ok) throw new Error("network");
      const data: NominatimResult[] = await res.json();
      setResults(data);
    } catch (e: any) {
      if (e?.name !== "AbortError") setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(v), 350);
  };

  /* ── Select ──────────────────────────────────────────────────────────── */
  const select = useCallback((loc: LocationData) => {
    saveRecent(loc);
    onChange(loc);
    onClose();
  }, [onChange, onClose]);

  const selectResult = useCallback((r: NominatimResult) => {
    const city     = extractCity(r.address);
    const province = extractProvince(r.address);
    const country  = r.address?.country ?? "";
    const { label } = buildLabel(r);
    select({
      displayName: label,
      city, province, country,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    });
  }, [select]);

  /* ── GPS ─────────────────────────────────────────────────────────────── */
  const handleGps = useCallback(async () => {
    if (!navigator.geolocation) { setGpsError("GPS not available on this device."); return; }
    setGpsLoading(true);
    setGpsError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lng } = pos.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1`,
            { headers: { "Accept-Language": "en" } },
          );
          if (!res.ok) throw new Error("reverse geocode failed");
          const r: NominatimResult = await res.json();
          const city     = extractCity(r.address);
          const province = extractProvince(r.address);
          const country  = r.address?.country ?? "";
          const parts    = [city, province, country].filter(Boolean);
          const displayName = parts.join(", ") || r.display_name.split(",")[0];
          select({ displayName, city, province, country, lat, lng });
        } catch {
          setGpsError("Couldn't determine your location. Try searching instead.");
        } finally {
          setGpsLoading(false);
        }
      },
      () => {
        setGpsError("Location permission denied. Please allow location access.");
        setGpsLoading(false);
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }, [select]);

  if (!open) return null;

  const showingResults  = query.length >= 2;
  const showEmpty       = showingResults && !loading && results.length === 0;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999]"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            className="absolute inset-x-0 bottom-0 flex flex-col"
            style={{
              maxHeight: "92dvh",
              background: "#0a0a12",
              borderRadius: "22px 22px 0 0",
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* Pull handle */}
            <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
              <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.16)" }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-xl"
                  style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)" }}>
                  <MapPin style={{ width: 15, height: 15, color: "#a855f7" }} />
                </div>
                <div>
                  <p className="text-[14px] font-bold" style={{ color: "hsl(var(--foreground))" }}>Set Location</p>
                  <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.38)" }}>
                    Search city, province, or country
                  </p>
                </div>
              </div>
              <button type="button" onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-full"
                style={{ background: "rgba(255,255,255,0.08)" }}>
                <X style={{ width: 15, height: 15, color: "rgba(255,255,255,0.6)" }} />
              </button>
            </div>

            {/* Search bar */}
            <div className="px-4 pb-3 flex-shrink-0">
              <div className="flex items-center rounded-[14px] gap-2 px-3.5"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", height: 46 }}>
                <Search style={{ width: 16, height: 16, color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={handleInput}
                  placeholder="Search Bacolod, Metro Manila, Philippines…"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="flex-1 bg-transparent text-[14px] focus:outline-none"
                  style={{ color: "hsl(var(--foreground))" }}
                />
                {loading && <Loader2 style={{ width: 15, height: 15, color: "rgba(255,255,255,0.3)", flexShrink: 0 }} className="animate-spin" />}
                {query && !loading && (
                  <button type="button" onClick={() => { setQuery(""); setResults([]); }}
                    className="grid h-5 w-5 place-items-center rounded-full flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.12)" }}>
                    <X style={{ width: 10, height: 10, color: "rgba(255,255,255,0.6)" }} />
                  </button>
                )}
              </div>
            </div>

            {/* GPS button */}
            <div className="px-4 pb-3 flex-shrink-0">
              <button type="button" onClick={handleGps} disabled={gpsLoading}
                className="w-full flex items-center gap-3 rounded-[14px] px-4 py-3 text-left transition-all active:scale-[0.98]"
                style={{
                  background: "rgba(59,130,246,0.09)",
                  border: "1px solid rgba(59,130,246,0.22)",
                }}>
                {gpsLoading
                  ? <Loader2 style={{ width: 16, height: 16, color: "#60a5fa", flexShrink: 0 }} className="animate-spin" />
                  : <Navigation style={{ width: 16, height: 16, color: "#60a5fa", flexShrink: 0 }} />}
                <span className="text-[13px] font-semibold" style={{ color: "#60a5fa" }}>
                  {gpsLoading ? "Getting your location…" : "Use current location"}
                </span>
              </button>
              {gpsError && (
                <p className="text-[11px] mt-1.5 px-1" style={{ color: "#f87171" }}>{gpsError}</p>
              )}
            </div>

            {/* Current selection indicator */}
            {value.displayName && (
              <div className="mx-4 mb-3 flex items-center gap-2.5 rounded-[12px] px-3.5 py-2.5"
                style={{ background: "rgba(168,85,247,0.09)", border: "1px solid rgba(168,85,247,0.22)" }}>
                <Check style={{ width: 13, height: 13, color: "#a855f7", flexShrink: 0 }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold" style={{ color: "rgba(168,85,247,0.7)" }}>Current selection</p>
                  <p className="text-[12px] truncate font-medium" style={{ color: "#a855f7" }}>{value.displayName}</p>
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="mx-4 mb-2 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }} />

            {/* Scrollable results */}
            <div className="flex-1 overflow-y-auto pb-10 px-2">
              {/* Search results */}
              {showingResults && results.length > 0 && (
                <div className="space-y-0.5">
                  <p className="px-3 pb-1.5 text-[10.5px] font-black uppercase tracking-wider"
                    style={{ color: "rgba(255,255,255,0.28)" }}>
                    Search results
                  </p>
                  {results.map((r) => {
                    const { label, sub } = buildLabel(r);
                    return (
                      <button key={r.place_id} type="button"
                        onClick={() => selectResult(r)}
                        className="w-full flex items-start gap-3 rounded-[13px] px-3.5 py-3 text-left transition-all active:scale-[0.98]"
                        style={{ background: "transparent" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        <MapPin style={{ width: 14, height: 14, color: "#a855f7", flexShrink: 0, marginTop: 2 }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold truncate" style={{ color: "hsl(var(--foreground))" }}>{label}</p>
                          {sub && <p className="text-[11px] truncate mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{sub}</p>}
                        </div>
                        <ChevronRight style={{ width: 12, height: 12, color: "rgba(255,255,255,0.2)", flexShrink: 0, marginTop: 3 }} />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Empty state */}
              {showEmpty && (
                <div className="flex flex-col items-center gap-2 py-8">
                  <Search style={{ width: 28, height: 28, color: "rgba(255,255,255,0.12)" }} />
                  <p className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>
                    No results for "{query}"
                  </p>
                  <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.22)" }}>
                    Try a city name, province, or country
                  </p>
                </div>
              )}

              {/* Default: Recent + Popular */}
              {!showingResults && (
                <>
                  {/* Recent */}
                  {recent.length > 0 && (
                    <div className="mb-4">
                      <p className="px-3 pb-1.5 text-[10.5px] font-black uppercase tracking-wider"
                        style={{ color: "rgba(255,255,255,0.28)" }}>
                        Recent
                      </p>
                      {recent.map((loc) => (
                        <button key={loc.displayName} type="button"
                          onClick={() => select(loc)}
                          className="w-full flex items-center gap-3 rounded-[13px] px-3.5 py-2.5 text-left transition-all active:scale-[0.98]"
                          style={{ background: "transparent" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                          <MapPin style={{ width: 13, height: 13, color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] truncate" style={{ color: "hsl(var(--foreground))" }}>
                              {loc.city || loc.displayName}
                            </p>
                            {(loc.province || loc.country) && (
                              <p className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
                                {[loc.province, loc.country].filter(Boolean).join(", ")}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Popular PH */}
                  <div>
                    <p className="px-3 pb-1.5 text-[10.5px] font-black uppercase tracking-wider"
                      style={{ color: "rgba(255,255,255,0.28)" }}>
                      Popular in Philippines
                    </p>
                    {POPULAR_PH.map((loc) => (
                      <button key={loc.displayName} type="button"
                        onClick={() => select(loc)}
                        className="w-full flex items-center gap-3 rounded-[13px] px-3.5 py-2.5 text-left transition-all active:scale-[0.98]"
                        style={{ background: "transparent" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        <span className="text-base flex-shrink-0">📍</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium truncate" style={{ color: "hsl(var(--foreground))" }}>
                            {loc.city}
                          </p>
                          <p className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
                            {[loc.province, loc.country].filter(Boolean).join(", ")}
                          </p>
                        </div>
                        <ChevronRight style={{ width: 12, height: 12, color: "rgba(255,255,255,0.2)", flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * FraudHeatmap — animated SVG geographic fraud threat map.
 *
 * Shows Philippine major cities as hotspots. Each fraud event increases the
 * heat score of the nearest city. Heat fades over 45 s. No external map libs.
 */
import { useState, useEffect, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Zap, TrendingUp, Info } from "lucide-react";
import type { LiveFraudEvent } from "../../lib/useAdminSocket";

/* ── City registry ────────────────────────────────────────────────────── */
interface City {
  id:     string;
  name:   string;
  region: string;
  x:      number; // SVG coords (viewBox 0 0 500 420)
  y:      number;
}

const CITIES: City[] = [
  { id: "mnl", name: "Manila",          region: "NCR",    x: 208, y: 142 },
  { id: "qc",  name: "Quezon City",     region: "NCR",    x: 218, y: 134 },
  { id: "mkti",name: "Makati",          region: "NCR",    x: 210, y: 150 },
  { id: "bgr", name: "Baguio",          region: "CAR",    x: 198, y: 100 },
  { id: "cbu", name: "Cebu City",       region: "VII",    x: 326, y: 242 },
  { id: "dvo", name: "Davao",           region: "XI",     x: 368, y: 320 },
  { id: "ilo", name: "Iloilo",          region: "VI",     x: 284, y: 234 },
  { id: "cdo", name: "Cagayan de Oro",  region: "X",      x: 352, y: 278 },
  { id: "zmb", name: "Zamboanga",       region: "IX",     x: 262, y: 318 },
  { id: "bto", name: "Butuan",          region: "XIII",   x: 388, y: 268 },
  { id: "gen", name: "General Santos",  region: "XII",    x: 360, y: 348 },
  { id: "ang", name: "Angeles",         region: "III",    x: 200, y: 126 },
  { id: "igl", name: "Iriga",           region: "V",      x: 252, y: 178 },
  { id: "bic", name: "Legazpi",         region: "V",      x: 268, y: 186 },
  { id: "pue", name: "Puerto Princesa", region: "MIMAROPA",x: 226, y: 262 },
  { id: "bac", name: "Bacolod",         region: "VI",     x: 298, y: 252 },
  { id: "ola", name: "Olongapo",        region: "III",    x: 186, y: 138 },
  { id: "dpg", name: "Dipolog",         region: "IX",     x: 298, y: 292 },
  { id: "sur", name: "Surigao",         region: "XIII",   x: 396, y: 250 },
  { id: "cot", name: "Cotabato",        region: "BARMM",  x: 328, y: 316 },
];

/* ── Heat state ───────────────────────────────────────────────────────── */
interface HeatPoint {
  cityId: string;
  score:  number;    // 0–100
  addedAt: number;
}

const HEAT_DECAY_MS = 45_000; // fade over 45 s

function heatColor(score: number): { fill: string; stroke: string } {
  if (score >= 80) return { fill: "#ef4444", stroke: "#dc2626" };
  if (score >= 55) return { fill: "#f97316", stroke: "#ea580c" };
  if (score >= 30) return { fill: "#eab308", stroke: "#ca8a04" };
  if (score >= 10) return { fill: "#3b82f6", stroke: "#2563eb" };
  return              { fill: "#22c55e", stroke: "#16a34a" };
}

function nearestCity(event: LiveFraudEvent): City {
  // Use event userId hash to pick a deterministic "city" for synthetic data
  const hash = [...(event.userId ?? event.id ?? "mnl")].reduce(
    (acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0,
  );
  return CITIES[Math.abs(hash) % CITIES.length]!;
}

/* ── Pulse ring component ─────────────────────────────────────────────── */
const PulseRing = memo(function PulseRing({
  cx, cy, color, size,
}: { cx: number; cy: number; color: string; size: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={size * 1.6} fill={color} opacity={0.08} />
      <motion.circle
        cx={cx} cy={cy}
        initial={{ r: size, opacity: 0.6 }}
        animate={{ r: size * 3.2, opacity: 0 }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        fill="none" stroke={color} strokeWidth={1.5}
      />
      <motion.circle
        cx={cx} cy={cy}
        initial={{ r: size, opacity: 0.4 }}
        animate={{ r: size * 2.2, opacity: 0 }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.6 }}
        fill="none" stroke={color} strokeWidth={1}
      />
    </>
  );
});

/* ── Philippines SVG coastline dots ──────────────────────────────────── */
const COAST_DOTS: [number, number][] = [
  // Luzon northern tip
  [195, 44],[200, 48],[205, 52],[212, 58],[218, 64],[224, 70],
  // Luzon eastern coast
  [242, 58],[256, 72],[264, 88],[268, 106],[270, 122],[268, 138],[264, 154],
  // Luzon western coast
  [184, 62],[178, 78],[180, 94],[186, 110],[190, 126],[194, 140],[198, 152],
  // Luzon southern tip / Bondoc
  [240, 168],[246, 182],[252, 192],[248, 204],
  // Palawan
  [200, 192],[196, 210],[200, 224],[208, 238],[218, 252],[226, 262],[234, 276],
  // Visayas
  [276, 216],[286, 224],[298, 228],[310, 224],[320, 228],[330, 222],[340, 230],
  [290, 244],[302, 252],[314, 248],[324, 256],[336, 248],[344, 252],[354, 256],
  [280, 258],[286, 268],[292, 278],[298, 288],[306, 276],[316, 268],[326, 272],
  // Mindanao
  [304, 298],[316, 296],[328, 294],[340, 298],[352, 292],[364, 296],[376, 288],
  [382, 298],[388, 308],[390, 320],[386, 332],[380, 342],[372, 350],[364, 356],
  [352, 358],[340, 354],[330, 348],[320, 352],[310, 348],[298, 342],[288, 330],
  [278, 318],[270, 308],[268, 296],[274, 284],[280, 292],
];

/* ── Main component ───────────────────────────────────────────────────── */
export default function FraudHeatmap({
  liveEvents,
  isConnected,
}: {
  liveEvents:  LiveFraudEvent[];
  isConnected: boolean;
}) {
  const [heats,     setHeats]     = useState<Map<string, HeatPoint>>(new Map());
  const [selected,  setSelected]  = useState<City | null>(null);
  const [totalHits, setTotalHits] = useState(0);
  const seenRef = useRef<Set<string>>(new Set());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Decay heat over time */
  useEffect(() => {
    tickRef.current = setInterval(() => {
      const now = Date.now();
      setHeats((prev) => {
        const next = new Map(prev);
        for (const [id, pt] of next) {
          const elapsed = now - pt.addedAt;
          const decayed = pt.score * Math.max(0, 1 - elapsed / HEAT_DECAY_MS);
          if (decayed < 0.5) next.delete(id);
          else next.set(id, { ...pt, score: decayed });
        }
        return next;
      });
    }, 1_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  /* Process incoming events */
  useEffect(() => {
    if (!liveEvents.length) return;
    const latest = liveEvents[0];
    if (!latest || seenRef.current.has(latest.id)) return;
    seenRef.current.add(latest.id);
    if (latest.severity === "info") return;

    const city  = nearestCity(latest);
    const delta =
      latest.severity === "critical" ? 40 :
      latest.severity === "high"     ? 25 :
      latest.severity === "medium"   ? 12 : 5;

    setHeats((prev) => {
      const next    = new Map(prev);
      const current = prev.get(city.id)?.score ?? 0;
      next.set(city.id, { cityId: city.id, score: Math.min(100, current + delta), addedAt: Date.now() });
      return next;
    });
    setTotalHits((n) => n + 1);
  }, [liveEvents]);

  const sortedCities = [...CITIES].map((c) => ({ ...c, heat: heats.get(c.id)?.score ?? 0 }))
    .sort((a, b) => b.heat - a.heat);
  const hotCount = sortedCities.filter((c) => c.heat >= 30).length;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/[0.06] bg-[#0b1220]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <MapPin className="h-4 w-4 text-purple-400" />
          <div>
            <h3 className="text-sm font-black text-white">Fraud Heatmap</h3>
            <p className="text-[10px] text-white/30">Philippines · Real-time threat distribution</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hotCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-1 text-[9px] font-bold text-red-400">
              <Zap className="h-2.5 w-2.5 animate-pulse" /> {hotCount} HOT
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${isConnected ? "animate-pulse bg-emerald-500" : "bg-white/20"}`} />
            <span className="text-[9px] text-white/30">{isConnected ? "Live" : "Offline"}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 gap-4 overflow-hidden p-4">
        {/* SVG Map */}
        <div className="relative flex-1">
          <svg
            viewBox="100 30 360 360"
            className="h-full w-full"
            style={{ filter: "drop-shadow(0 0 20px rgba(139,92,246,0.08))" }}
          >
            {/* Coastline dots */}
            {COAST_DOTS.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={1.2} fill="rgba(255,255,255,0.07)" />
            ))}

            {/* City hotspots */}
            {CITIES.map((city) => {
              const heat  = heats.get(city.id)?.score ?? 0;
              const col   = heatColor(heat);
              const size  = 3 + (heat / 100) * 6;
              const isHot = heat >= 15;
              return (
                <g
                  key={city.id}
                  onClick={() => setSelected((s) => s?.id === city.id ? null : city)}
                  style={{ cursor: "pointer" }}
                >
                  {isHot && (
                    <PulseRing cx={city.x} cy={city.y} color={col.fill} size={size} />
                  )}
                  <motion.circle
                    cx={city.x} cy={city.y}
                    animate={{ r: size, fill: col.fill }}
                    transition={{ duration: 0.5 }}
                    opacity={0.85 + (heat / 100) * 0.15}
                  />
                  {heat >= 30 && (
                    <text
                      x={city.x + size + 3} y={city.y + 3}
                      fill="rgba(255,255,255,0.6)"
                      fontSize={6}
                      fontWeight="bold"
                    >
                      {city.name.split(" ")[0]}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Selected city tooltip */}
          <AnimatePresence>
            {selected && (
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute bottom-2 left-2 rounded-xl border border-white/[0.08] bg-[#0d1628]/90 px-3 py-2 backdrop-blur-sm"
              >
                <p className="text-[11px] font-bold text-white">{selected.name}</p>
                <p className="text-[9px] text-white/40">Region {selected.region}</p>
                <p className={`mt-0.5 text-[10px] font-semibold ${heatColor(heats.get(selected.id)?.score ?? 0).fill === "#22c55e" ? "text-emerald-400" : "text-orange-400"}`}>
                  Heat: {Math.round(heats.get(selected.id)?.score ?? 0)}%
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar stats */}
        <div className="w-36 flex-shrink-0 space-y-2">
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/25">Total Hits</p>
            <p className="mt-1 text-xl font-black text-white">{totalHits}</p>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/25">Hot Zones</p>
            <p className="mt-1 text-xl font-black text-red-400">{hotCount}</p>
          </div>

          <p className="px-1 pt-2 text-[9px] font-bold uppercase tracking-widest text-white/20">Top Cities</p>
          <div className="space-y-1">
            {sortedCities.slice(0, 7).map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected((s) => s?.id === c.id ? null : c)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                  selected?.id === c.id ? "bg-white/[0.07]" : "hover:bg-white/[0.03]"
                }`}
              >
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: heatColor(c.heat).fill }}
                />
                <span className="flex-1 truncate text-left text-[10px] text-white/60">
                  {c.name.split(" ")[0]}
                </span>
                <span className="text-[9px] font-mono text-white/30">
                  {Math.round(c.heat)}
                </span>
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="space-y-1 pt-2">
            {[
              ["Critical", "#ef4444"],
              ["High",     "#f97316"],
              ["Medium",   "#eab308"],
              ["Low",      "#3b82f6"],
              ["Clear",    "#22c55e"],
            ].map(([label, color]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[9px] text-white/30">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-white/[0.04] px-5 py-2">
        <div className="flex items-center gap-1.5">
          <Info className="h-3 w-3 text-white/15" />
          <p className="text-[9px] text-white/15">Heat decays over 45 s · Click city for details</p>
        </div>
        <TrendingUp className="h-3 w-3 text-white/15" />
      </div>
    </div>
  );
}

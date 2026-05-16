/**
 * StreamingChart — WebSocket-fed realtime AreaChart with smooth interpolation.
 *
 * Maintains a rolling 5-minute window of 10-second event buckets.
 * Updates without flicker — existing zoom/pan is preserved because we only
 * mutate the data array ref and trigger a controlled re-render.
 */
import { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LiveFraudEvent } from "../../lib/useAdminSocket";

/* ── Constants ────────────────────────────────────────────────────────── */
const BUCKET_MS     = 10_000; // 10-second buckets
const WINDOW_BUCKETS = 30;    // 5-minute window
const TICK_INTERVAL  = 5_000; // re-render every 5 s

/* ── Types ────────────────────────────────────────────────────────────── */
interface Bucket {
  time:     string; // "HH:MM:SS"
  ts:       number; // epoch of bucket start
  critical: number;
  high:     number;
  medium:   number;
  low:      number;
  total:    number;
}

function emptyBucket(ts: number): Bucket {
  const d = new Date(ts);
  return {
    ts,
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`,
    critical: 0, high: 0, medium: 0, low: 0, total: 0,
  };
}

function bucketKey(ts: number): number {
  return Math.floor(ts / BUCKET_MS) * BUCKET_MS;
}

function trendIcon(current: number, prev: number) {
  if (current > prev + 1) return <TrendingUp className="h-3 w-3 text-red-400" />;
  if (current < prev - 1) return <TrendingDown className="h-3 w-3 text-emerald-400" />;
  return <Minus className="h-3 w-3 text-white/30" />;
}

/* ── Custom tooltip ───────────────────────────────────────────────────── */
const CustomTooltip = memo(function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0d1628] p-3 text-xs shadow-xl">
      <p className="mb-1.5 font-mono text-[10px] text-white/40">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="capitalize text-white/60">{p.name}:</span>
          <span className="font-bold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
});

/* ── Main component ───────────────────────────────────────────────────── */
interface StreamingChartProps {
  liveEvents:  LiveFraudEvent[];
  isConnected: boolean;
  compact?:    boolean;
}

export default function StreamingChart({
  liveEvents,
  isConnected,
  compact = false,
}: StreamingChartProps) {
  const bucketsRef  = useRef<Map<number, Bucket>>(new Map());
  const seenRef     = useRef<Set<string>>(new Set());
  const [data,      setData]      = useState<Bucket[]>([]);
  const [totalRate, setTotalRate] = useState(0);

  /* Initialize with empty window */
  useEffect(() => {
    const now = Date.now();
    const map = new Map<number, Bucket>();
    for (let i = 0; i < WINDOW_BUCKETS; i++) {
      const ts = bucketKey(now - (WINDOW_BUCKETS - 1 - i) * BUCKET_MS);
      map.set(ts, emptyBucket(ts));
    }
    bucketsRef.current = map;
    setData(Array.from(map.values()));
  }, []);

  /* Inject incoming events into buckets */
  useEffect(() => {
    if (!liveEvents.length) return;
    const latest = liveEvents[0];
    if (!latest || seenRef.current.has(latest.id)) return;
    seenRef.current.add(latest.id);
    if (latest.severity === "info") return;

    const key = bucketKey(new Date(latest.ts).getTime());
    const map = bucketsRef.current;

    if (!map.has(key)) {
      map.set(key, emptyBucket(key));
    }
    const b = map.get(key)!;
    (b as unknown as Record<string, number>)[latest.severity] = (((b as unknown as Record<string, number>)[latest.severity] as number) ?? 0) + 1;
    b.total++;
  }, [liveEvents]);

  /* Periodic flush — advances the window + triggers re-render */
  const flush = useCallback(() => {
    const now     = Date.now();
    const map     = bucketsRef.current;
    const minTs   = bucketKey(now) - (WINDOW_BUCKETS - 1) * BUCKET_MS;

    /* Add current bucket if missing */
    const currentKey = bucketKey(now);
    if (!map.has(currentKey)) map.set(currentKey, emptyBucket(currentKey));

    /* Evict old buckets */
    for (const k of map.keys()) if (k < minTs) map.delete(k);

    /* Fill any gaps */
    for (let i = 0; i < WINDOW_BUCKETS; i++) {
      const ts = minTs + i * BUCKET_MS;
      if (!map.has(ts)) map.set(ts, emptyBucket(ts));
    }

    const sorted = [...map.values()].sort((a, b) => a.ts - b.ts);
    setData(sorted);

    /* Events per minute (last 6 buckets = 1 min) */
    const lastMin = sorted.slice(-6).reduce((s, b) => s + b.total, 0);
    setTotalRate(lastMin);
  }, []);

  useEffect(() => {
    flush();
    const iv = setInterval(flush, TICK_INTERVAL);
    return () => clearInterval(iv);
  }, [flush]);

  const prevRate = data.slice(-13, -7).reduce((s, b) => s + b.total, 0);
  const chartH = compact ? 120 : 180;

  return (
    <div className="flex flex-col rounded-2xl border border-white/[0.06] bg-[#0b1220]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Activity className="h-4 w-4 text-blue-400" />
          <div>
            <h3 className="text-sm font-black text-white">Event Stream</h3>
            <p className="text-[10px] text-white/30">5-minute rolling window · 10 s buckets</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {trendIcon(totalRate, prevRate)}
            <span className="text-sm font-black text-white">{totalRate}</span>
            <span className="text-[9px] text-white/30">/ min</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "animate-pulse bg-emerald-500" : "bg-white/20"}`} />
            <span className="text-[9px] text-white/30">{isConnected ? "Live" : "Offline"}</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="px-4 py-3">
        <ResponsiveContainer width="100%" height={chartH}>
          <AreaChart data={data} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id="gradCrit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradHigh" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradMed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#eab308" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#eab308" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="2 4" />
            <XAxis
              dataKey="time"
              tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 8 }}
              tickLine={false} axisLine={false}
              interval={5}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 8 }}
              tickLine={false} axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            {totalRate > 0 && (
              <ReferenceLine
                y={Math.round(totalRate / 6)}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="4 4"
                label={{ value: "avg", fill: "rgba(255,255,255,0.2)", fontSize: 8 }}
              />
            )}
            <Area dataKey="critical" name="critical" type="monotone" stroke="#ef4444" strokeWidth={1.5} fill="url(#gradCrit)" dot={false} isAnimationActive={false} />
            <Area dataKey="high"     name="high"     type="monotone" stroke="#f97316" strokeWidth={1.5} fill="url(#gradHigh)" dot={false} isAnimationActive={false} />
            <Area dataKey="medium"   name="medium"   type="monotone" stroke="#eab308" strokeWidth={1}   fill="url(#gradMed)"  dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 border-t border-white/[0.04] px-5 py-2">
        {[
          ["critical", "#ef4444"],
          ["high",     "#f97316"],
          ["medium",   "#eab308"],
        ].map(([label, color]) => {
          const total = data.reduce((s, b) => s + (((b as unknown as Record<string, number>)[label] as number) ?? 0), 0);
          return (
            <div key={label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="capitalize text-[9px] text-white/30">{label}</span>
              <span className="font-mono text-[9px] text-white/50">{total}</span>
            </div>
          );
        })}
        <span className="ml-auto text-[9px] text-white/20">
          {data.length * BUCKET_MS / 60_000} min window
        </span>
      </div>
    </div>
  );
}

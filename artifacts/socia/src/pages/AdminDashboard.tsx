/**
 * Protected admin dashboard — /admin/dashboard
 *
 * Guards the route: validates the admin JWT on mount and redirects to
 * /admin/login if unauthenticated. Renders the full SysAdmin panel
 * with the correct loginPath so session-expiry redirects also land on
 * /admin/login instead of /sys-admin/login.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { adminFetchSession } from "@/lib/adminAuth";
import SysAdmin from "./SysAdmin";

/* URL slug → internal AdminView id. Keeps the public URLs human-readable
 * (e.g. /admin/ai-monitor) while reusing the existing internal view names. */
const URL_ALIASES: Record<string, string> = {
  "ai-monitor":    "anomaly",
  "render-queue":  "render-health",
  "system-status": "diagnostics",
};

/* Mirrors the AdminView union in SysAdmin.tsx — any unknown slug falls back
 * to the dashboard so we never render an empty admin shell. */
const VALID_VIEWS = new Set<string>([
  "dashboard","verifications","reviews","transactions","fraud","analytics",
  "risk","ai","heatmap","device-intel","ip-intel","anomaly","correlation",
  "escalation","investigation","threat-score","session-replay","users",
  "refunds","funding","studio","render-health","security","audit","timeline",
  "diagnostics","methods","settings",
]);

function parseInitialView(path: string): string | undefined {
  const m = path.match(/^\/admin\/([^/?#]+)/);
  const slug = m?.[1];
  if (!slug || slug === "login" || slug === "dashboard") return undefined;
  const resolved = URL_ALIASES[slug] ?? slug;
  return VALID_VIEWS.has(resolved) ? resolved : undefined;
}

export default function AdminDashboard() {
  const [location, navigate] = useLocation();
  const [ready, setReady] = useState(false);
  const initialView = parseInitialView(location);

  useEffect(() => {
    let alive = true;
    (async () => {
      const me = await adminFetchSession();
      if (!alive) return;
      if (!me) {
        navigate("/admin/login");
        return;
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [navigate]);

  if (!ready) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-[#06060c]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return <SysAdmin loginPath="/admin/login" initialView={initialView} />;
}

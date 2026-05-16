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

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const [ready, setReady] = useState(false);

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

  return <SysAdmin loginPath="/admin/login" />;
}

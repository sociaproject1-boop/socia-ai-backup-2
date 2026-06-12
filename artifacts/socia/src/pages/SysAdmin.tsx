/**
 * Enterprise Fraud Monitoring Admin Dashboard. Hidden under /sys-admin.
 *
 * Auth model: a valid `socia_admin_token` in localStorage proves admin
 * identity to the api-server. There is NO Supabase session involved here
 * — normal users can never reach this page even if signed in.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, LogOut, ShieldCheck, RefreshCw, Users, Wallet, Activity,
  AlertTriangle, FileText, Settings as SettingsIcon, CheckCircle2, XCircle,
  Search, ExternalLink, ShieldAlert, KeyRound, Mail, Power, Snowflake,
  Ban, Pause, Play, Gift, Undo2, NotebookPen, Copy as CopyIcon, Heart,
  Upload, ImageIcon, X as XIcon, MessageSquare, Send, FileCheck,
  ScanSearch, Eye, Fingerprint, Globe2, Brain, Clock,
  LayoutDashboard, BarChart2, Target, Bot, Shield, BookOpen,
  Bell, ChevronRight, Menu,
  Network, AlertOctagon, LayoutPanelLeft, BarChart3, Film,
  Clapperboard, Zap, Check, ChevronDown,
  Gauge, TrendingUp, Server, Cpu, Thermometer, Radio, Sliders,
  AlertCircle, ArrowUp, ArrowDown, Layers, RefreshCcw, HeartPulse,
} from "lucide-react";
import {
  useAdminStore, adminFetch, adminFetchSession, adminLogout,
  adminListOrders, adminApproveOrder, adminRejectOrder, adminGetReceiptUrl, adminRefundOrder,
  adminListUsers, adminAdjustCredits, adminSetSubscription,
  adminGetMetrics, adminGetSettings, adminSaveSettings, adminGetAudit,
  adminGetPaymentMethods, adminSavePaymentMethods,
  adminGetPaymentSettings, adminSavePaymentSettings, type PaymentSettings,
  adminGetUserDetails, adminSetUserFlags, adminForceLogout,
  adminResetUserPassword, adminChangeUserEmail, adminExtendSubscription,
  adminCompensateUser, adminGetSuspiciousUsers,
  adminListRefunds, adminGetRefundStats, adminDecideRefund, adminFlagRefund,
  adminListRefundMessages, adminSendRefundMessage, adminRequestProof, adminUpdatePayout,
  adminListFundingDonations, adminApproveFunding, adminRejectFunding, adminGetFundingStats,
  adminGetReceiptStats, adminListReceipts, adminGetReceiptDetail,
  adminDecideReceipt, adminRequestReceiptProof, adminAddReceiptNote,
  type AdminOrder, type AdminUserRow, type AdminMetrics, type AdminSettings,
  type AdminAuditEntry, type AdminUserDetails, type AdminSuspiciousUser,
  type AdminRefundRequest, type AdminRefundStats,
  type AdminRefundMessage,
  type AdminFundingDonation, type AdminFundingStats,
  type AdminReceiptStats, type AdminReceiptRow, type AdminReceiptDetail, type AdminReceiptNote,
} from "@/lib/adminAuth";
import { DashboardView }       from "@/components/admin/DashboardView";
import { ReceiptReviewPanel }  from "@/components/admin/ReceiptReviewPanel";
import { AnalyticsView }       from "@/components/admin/AnalyticsView";
import AuditLogView            from "@/components/admin/AuditLogView";
import FraudToastProvider      from "@/components/admin/FraudToastProvider";
import NotificationCenter      from "@/components/admin/NotificationCenter";
import FraudHeatmap            from "@/components/admin/FraudHeatmap";
import DeviceIntelPanel        from "@/components/admin/DeviceIntelPanel";
import IPIntelPanel            from "@/components/admin/IPIntelPanel";
import AnomalyEngine           from "@/components/admin/AnomalyEngine";
import RealtimeTimeline        from "@/components/admin/RealtimeTimeline";
import PaymentControlCenter    from "@/components/admin/PaymentControlCenter";
import CorrelationEngine       from "@/components/admin/CorrelationEngine";
import EscalationQueue         from "@/components/admin/EscalationQueue";
import InvestigationWorkspace  from "@/components/admin/InvestigationWorkspace";
import ThreatScoringPanel      from "@/components/admin/ThreatScoringPanel";
import SessionReplay           from "@/components/admin/SessionReplay";
import DiagnosticsView         from "@/components/admin/DiagnosticsView";
import { useAdminSocket }      from "@/lib/useAdminSocket";
import type { LiveFraudEvent, ReviewerPresence } from "@/lib/useAdminSocket";

/* ── Navigation types & config ───────────────────────────────────────── */
type AdminView =
  | "dashboard"    | "verifications" | "reviews"      | "transactions"
  | "fraud"        | "analytics"     | "risk"          | "ai"
  | "heatmap"      | "device-intel"  | "ip-intel"      | "anomaly"
  | "correlation"  | "escalation"    | "investigation" | "threat-score" | "session-replay"
  | "users"        | "refunds"       | "funding"       | "studio" | "render-health"
  | "security"     | "audit"         | "timeline"     | "diagnostics"
  | "methods"      | "settings";

interface NavItem { id: AdminView; label: string; icon: React.ElementType; badge?: number }
interface NavGroup { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: "MAIN",
    items: [
      { id: "dashboard",     label: "Dashboard",       icon: LayoutDashboard },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { id: "verifications", label: "Verifications",   icon: ScanSearch  },
      { id: "reviews",       label: "Manual Reviews",  icon: Eye         },
      { id: "transactions",  label: "Transactions",    icon: Wallet      },
    ],
  },
  {
    label: "SECURITY",
    items: [
      { id: "fraud",         label: "Fraud Detection",   icon: ShieldAlert },
      { id: "analytics",     label: "Fraud Analytics",   icon: BarChart2   },
      { id: "risk",          label: "Risk Insights",     icon: Target      },
      { id: "ai",            label: "AI Monitoring",     icon: Bot         },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { id: "heatmap",       label: "Fraud Heatmap",     icon: Activity    },
      { id: "device-intel",  label: "Device Intel",      icon: Fingerprint },
      { id: "ip-intel",      label: "IP Intelligence",   icon: Globe2      },
      { id: "anomaly",       label: "Anomaly Engine",    icon: Brain       },
    ],
  },
  {
    label: "AI CORRELATION",
    items: [
      { id: "correlation",   label: "Correlation",       icon: Network         },
      { id: "escalation",    label: "Escalation Queue",  icon: AlertOctagon    },
      { id: "investigation", label: "Investigation",     icon: LayoutPanelLeft },
      { id: "threat-score",  label: "Threat Scoring",    icon: BarChart3       },
      { id: "session-replay",label: "Session Replay",    icon: Film            },
    ],
  },
  {
    label: "MANAGEMENT",
    items: [
      { id: "users",         label: "Users",           icon: Users       },
      { id: "refunds",       label: "Refunds",         icon: Undo2       },
      { id: "funding",       label: "Funding",         icon: Heart       },
      { id: "studio",        label: "AI Studio",       icon: Clapperboard},
      { id: "render-health", label: "Render Health",   icon: Gauge        },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { id: "diagnostics",   label: "Diagnostics",     icon: HeartPulse  },
      { id: "security",      label: "Security Logs",   icon: Shield      },
      { id: "audit",         label: "Audit Trail",     icon: BookOpen    },
      { id: "timeline",      label: "Live Timeline",   icon: Clock       },
      { id: "methods",       label: "Methods",         icon: FileText    },
      { id: "settings",      label: "Settings",        icon: SettingsIcon},
    ],
  },
];

/* ── Enterprise Sidebar ──────────────────────────────────────────────── */
function EnterpriseSidebar({
  view, onNavigate, username, role,
  collapsed, onToggle,
}: {
  view:       AdminView;
  onNavigate: (v: AdminView) => void;
  username:   string;
  role:       string;
  collapsed:  boolean;
  onToggle:   () => void;
}) {
  return (
    <aside
      className="relative flex h-full flex-col border-r border-white/[0.06] bg-[#070d18] transition-all duration-300"
      style={{ width: collapsed ? 64 : 260, flexShrink: 0 }}
    >
      {/* Logo bar */}
      <div className="flex h-14 items-center gap-3 border-b border-white/[0.06] px-4">
        <div className="relative grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl"
             style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
          <ShieldCheck className="h-5 w-5 text-white" />
          {/* online pulse */}
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#070d18] bg-emerald-500" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-black text-white tracking-tight">Socia Admin</p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#1D9BF0]/60">
              Fraud Command Center
            </p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto flex-shrink-0 rounded-lg p-1.5 text-white/20 hover:bg-white/5 hover:text-white/50 transition-colors"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-none">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className={collapsed ? "mb-0.5" : "mb-2"}>
            {!collapsed && (
              <p className="mb-1 mt-2 px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/15">
                {group.label}
              </p>
            )}
            {collapsed && <div className="mx-auto my-1 h-px w-8 bg-white/[0.06]" />}
            {group.items.map((item) => {
              const isActive = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`group relative flex w-full items-center gap-3 px-3 py-2 text-left text-[12.5px] font-semibold transition-colors ${
                    isActive ? "text-white" : "text-white/35 hover:text-white/65"
                  }`}
                >
                  {/* Active bg */}
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-xl"
                      style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.18),rgba(236,72,153,0.1))" }}
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  {/* Left accent bar */}
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-bar"
                      className="absolute inset-y-1 left-0 w-0.5 rounded-full"
                      style={{ background: "linear-gradient(to bottom,#a855f7,#ec4899)" }}
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <item.icon className={`relative h-4 w-4 flex-shrink-0 transition-colors ${
                    isActive ? "text-[#1D9BF0]" : "group-hover:text-white/60"
                  }`} />
                  {!collapsed && (
                    <span className="relative flex-1 truncate">{item.label}</span>
                  )}
                  {!collapsed && isActive && (
                    <ChevronRight className="relative ml-auto h-3 w-3 flex-shrink-0 text-[#1D9BF0]/50" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* System status strip */}
      {!collapsed && (
        <div className="border-t border-white/[0.04] px-4 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/15">System</span>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-[9px] font-bold text-emerald-500/70">OPERATIONAL</span>
            </div>
          </div>
        </div>
      )}

      {/* Admin profile */}
      <div className="border-t border-white/[0.06] p-3">
        {collapsed ? (
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#1D9BF0]/20 text-[11px] font-black text-[#1D9BF0]">
            {username.charAt(0).toUpperCase()}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2.5">
            <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-[#1D9BF0]/20 text-[11px] font-black text-[#1D9BF0]">
              {username.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold text-white/80">{username}</p>
              <p className="truncate font-mono text-[9px] text-white/30">{role}</p>
            </div>
            <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" title="Authenticated" />
          </div>
        )}
      </div>
    </aside>
  );
}

/* ── Enterprise Header ───────────────────────────────────────────────── */
function EnterpriseHeader({
  view, onLogout, onMobileOpen,
  liveEvents, reviewers, isConnected,
}: {
  view:         AdminView;
  onLogout:     () => void;
  onMobileOpen: () => void;
  liveEvents:   LiveFraudEvent[];
  reviewers:    ReviewerPresence[];
  isConnected:  boolean;
}) {
  const viewLabel = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === view)?.label ?? view;

  return (
    <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#080e1a] px-4 md:px-6">
      {/* Mobile hamburger */}
      <button
        onClick={onMobileOpen}
        className="flex-shrink-0 rounded-xl border border-white/5 bg-white/[0.03] p-2 text-white/50 hover:bg-white/5 hover:text-white/70 lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px]">
        <span className="hidden text-white/30 sm:inline">Admin</span>
        <ChevronRight className="hidden h-3 w-3 text-white/20 sm:block" />
        <span className="font-semibold text-white">{viewLabel}</span>
      </div>

      <div className="flex-1" />

      {/* Live security status */}
      <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 sm:flex">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[10px] font-bold text-emerald-400">
          {isConnected ? "Live" : "Offline"}
        </span>
      </div>

      {/* Notification center */}
      <NotificationCenter
        liveEvents={liveEvents}
        reviewers={reviewers}
        isConnected={isConnected}
      />

      {/* Sign out */}
      <button
        onClick={onLogout}
        className="inline-flex items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-white/50 hover:border-red-500/20 hover:bg-red-500/5 hover:text-red-400"
      >
        <LogOut className="h-3.5 w-3.5" /> Sign out
      </button>
    </header>
  );
}

/* ── Section wrapper — full-width, no artificial constraints ─────────── */
function LegacySection({ children }: { children: React.ReactNode }) {
  return <div className="w-full min-w-0">{children}</div>;
}

/* ── Main SysAdmin component ─────────────────────────────────────────── */
export default function SysAdmin({
  loginPath = "/sys-admin/login",
  initialView,
}: { loginPath?: string; initialView?: string } = {}) {
  const [, navigate] = useLocation();
  const profile      = useAdminStore((s) => s.profile);
  const setProfile   = useAdminStore((s) => s.setProfile);
  const [hydrated,   setHydrated]   = useState(false);
  const [view,       setView]       = useState<AdminView>(
    (initialView as AdminView) || "dashboard",
  );
  const [collapsed,  setCollapsed]  = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 1024,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const socket = useAdminSocket();

  useEffect(() => {
    let alive = true;
    (async () => {
      const me = await adminFetchSession();
      if (!alive) return;
      if (!me) { navigate(loginPath); return; }
      setHydrated(true);
    })();
    return () => { alive = false; };
  }, [navigate, loginPath]);

  /* Auto-close mobile drawer when viewport grows to desktop */
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);

  /* Broadcast current view to other admins via WebSocket */
  useEffect(() => {
    socket.emit("reviewing", view);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  if (!hydrated || !profile) {
    return (
      <div className="fixed inset-0 grid place-items-center"
           style={{ background: "linear-gradient(135deg,#060a10,#0b1220)" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl"
               style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-white/40" />
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="fixed inset-0 flex overflow-hidden text-white"
         style={{ background: "#060a10" }}>

      {/* Mobile backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="mob-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/70 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar — fixed overlay on mobile/tablet, in-flow on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-shrink-0 transition-transform duration-300 ease-in-out lg:relative lg:z-auto lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <EnterpriseSidebar
          view={view}
          onNavigate={(v) => { setView(v as AdminView); setMobileOpen(false); }}
          username={profile.username}
          role={profile.role}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
      </aside>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <EnterpriseHeader
          view={view}
          onLogout={async () => { await adminLogout(); setProfile(null); navigate(loginPath); }}
          onMobileOpen={() => setMobileOpen(true)}
          liveEvents={socket.liveEvents}
          reviewers={socket.reviewers}
          isConnected={socket.isConnected}
        />

        {/* Scrollable content */}
        <main className="flex-1 overflow-auto p-3 sm:p-5 lg:p-6 2xl:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {view === "dashboard"     && (
                <DashboardView
                  onNavigate={(v) => setView(v as AdminView)}
                  liveEvents={socket.liveEvents}
                  reviewers={socket.reviewers}
                  isConnected={socket.isConnected}
                />
              )}
              {view === "verifications" && <LegacySection><ReceiptsTab /></LegacySection>}
              {view === "reviews"       && <LegacySection><ReceiptsTab defaultFilter="needs_review" /></LegacySection>}
              {view === "transactions"  && <LegacySection><OrdersTab /></LegacySection>}
              {view === "fraud"         && <LegacySection><AbuseTab /></LegacySection>}
              {view === "analytics"     && <LegacySection><AnalyticsView defaultTab="trends"      /></LegacySection>}
              {view === "risk"          && <LegacySection><AnalyticsView defaultTab="heatmap"     /></LegacySection>}
              {view === "ai"            && <LegacySection><AnalyticsView defaultTab="signals"     /></LegacySection>}
              {view === "users"         && <LegacySection><UsersTab /></LegacySection>}
              {view === "refunds"       && <LegacySection><RefundsTab /></LegacySection>}
              {view === "funding"       && <LegacySection><FundingTab /></LegacySection>}
              {view === "security"      && (
                <AuditLogView
                  liveEvents={socket.liveEvents}
                  reviewers={socket.reviewers}
                  isConnected={socket.isConnected}
                />
              )}
              {view === "audit"         && (
                <AuditLogView
                  liveEvents={socket.liveEvents}
                  reviewers={socket.reviewers}
                  isConnected={socket.isConnected}
                />
              )}

              {/* ── Intelligence views ────────────────────────────────── */}
              {view === "heatmap"       && (
                <div className="h-[calc(100vh-120px)]">
                  <FraudHeatmap
                    liveEvents={socket.liveEvents}
                    isConnected={socket.isConnected}
                  />
                </div>
              )}
              {view === "device-intel"  && (
                <div className="h-[calc(100vh-120px)]">
                  <DeviceIntelPanel />
                </div>
              )}
              {view === "ip-intel"      && (
                <div className="h-[calc(100vh-120px)]">
                  <IPIntelPanel />
                </div>
              )}
              {view === "anomaly"       && (
                <div className="h-[calc(100vh-120px)]">
                  <AnomalyEngine
                    liveEvents={socket.liveEvents}
                    isConnected={socket.isConnected}
                  />
                </div>
              )}
              {view === "timeline"      && (
                <div className="h-[calc(100vh-120px)]">
                  <RealtimeTimeline
                    liveEvents={socket.liveEvents}
                    isConnected={socket.isConnected}
                  />
                </div>
              )}

              {/* ── AI Correlation views ──────────────────────────────── */}
              {view === "correlation"   && (
                <div className="h-[calc(100vh-120px)]">
                  <CorrelationEngine />
                </div>
              )}
              {view === "escalation"    && (
                <div className="h-[calc(100vh-120px)]">
                  <EscalationQueue liveEvents={socket.liveEvents} />
                </div>
              )}
              {view === "investigation" && (
                <div className="h-[calc(100vh-120px)]">
                  <InvestigationWorkspace />
                </div>
              )}
              {view === "threat-score"  && (
                <div className="h-[calc(100vh-120px)]">
                  <ThreatScoringPanel liveEvents={socket.liveEvents} />
                </div>
              )}
              {view === "session-replay" && (
                <div className="h-[calc(100vh-120px)]">
                  <SessionReplay />
                </div>
              )}

              {view === "methods"       && <PaymentControlCenter />}
              {view === "settings"      && <LegacySection><SettingsTab /></LegacySection>}
              {view === "studio"        && <LegacySection><StudioAdminTab /></LegacySection>}
              {view === "render-health" && <LegacySection><RenderHealthAdminTab /></LegacySection>}
              {view === "diagnostics"   && <LegacySection><DiagnosticsView /></LegacySection>}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
    {/* Fraud toast overlay — fixed portal over the entire admin shell */}
    <FraudToastProvider liveEvents={socket.liveEvents} />
    </>
  );
}

/* ════════════ TABS ════════════ */

function OverviewTab() {
  const [m, setM] = useState<AdminMetrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = async () => {
    setErr(null);
    try { setM(await adminGetMetrics()); }
    catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { void reload(); }, []);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold">System metrics</h2>
        <button onClick={reload} className="rounded-full p-1.5 text-white/55 hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {err && <ErrCard msg={err} />}
      {!m ? <Skeleton /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total users"        value={m.total_users.toLocaleString()} />
          <Stat label="Active subs"        value={m.active_subs.toLocaleString()} />
          <Stat label="Verified"           value={m.verified_users.toLocaleString()} />
          <Stat label="Pending orders"     value={m.pending_orders.toLocaleString()} accent={m.pending_orders > 0} />
          <Stat label="Approved (30d)"     value={m.approved_30d.toLocaleString()} />
          <Stat label="Revenue 30d (₱)"    value={"₱" + (m.revenue_30d_php ?? 0).toLocaleString()} />
          <Stat label="Flagged pending"    value={m.flagged_pending.toLocaleString()} accent={m.flagged_pending > 0} />
        </div>
      )}
    </div>
  );
}

function OrdersTab() {
  const [status, setStatus] = useState<"pending"|"approved"|"rejected"|"all">("pending");
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = async () => {
    setErr(null); setOrders(null);
    try { setOrders(await adminListOrders(status, 200)); }
    catch (e) { setErr((e as Error).message); setOrders([]); }
  };
  useEffect(() => { void reload(); }, [status]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {(["pending","approved","rejected","all"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold capitalize ${
                    status === s ? "bg-purple-500 text-white" : "bg-white/5 text-white/65 hover:text-white"}`}>
            {s}
          </button>
        ))}
        <button onClick={reload} className="ml-auto rounded-full p-1.5 text-white/55 hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {err && <ErrCard msg={err} />}
      {!orders ? <Skeleton /> : orders.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] py-12 text-center text-sm text-white/40">No {status} orders.</div>
      ) : (
        <div className="space-y-2">{orders.map((o) => <OrderRow key={o.id} order={o} onChange={reload} />)}</div>
      )}
    </div>
  );
}

function OrderRow({ order, onChange }: { order: AdminOrder; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve"|"reject"|null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    adminGetReceiptUrl(order.id).then((u) => { if (alive) setUrl(u); }).catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, [open, order.id]);

  const approve = async () => {
    setBusy("approve");
    try { await adminApproveOrder(order.id); onChange(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(null); }
  };
  const reject = async () => {
    if (reason.trim().length < 3) { alert("Provide a rejection reason (≥3 chars)."); return; }
    setBusy("reject");
    try { await adminRejectOrder(order.id, reason.trim()); onChange(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(null); }
  };
  const label = order.kind === "subscription"
    ? (order.plan_code === "p15" ? "15-Day Plan" : order.plan_code === "p30" ? "Monthly Plan" : "Plan")
    : `Top-up · ${order.credits_to_grant} cr`;

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 text-left">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/5">
          {order.status === "pending"  ? <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            : order.status === "approved" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            : <XCircle className="h-4 w-4 text-rose-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-bold">
            {label}
            {order.flagged && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-300">
                <AlertTriangle className="h-2.5 w-2.5" /> {order.flag_reason}
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-white/45">
            {order.users?.name || order.users?.username || order.users?.email || order.user_id.slice(0, 8)}
            {" • Ref "}{order.reference_no}{" • "}{order.payment_method.toUpperCase()}
          </div>
          <div className="text-[10px] text-white/35">{new Date(order.created_at).toLocaleString()}</div>
        </div>
        <div className="text-right">
          <div className="text-base font-black">₱{order.amount_php}</div>
          <div className="text-[10px] text-white/45">+{order.credits_to_grant} cr</div>
        </div>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="block">
              <img src={url} alt="receipt" className="max-h-72 w-full rounded-xl bg-black/40 object-contain" />
              <div className="mt-1 flex items-center gap-1 text-[10px] text-white/45"><ExternalLink className="h-3 w-3" /> Open full</div>
            </a>
          ) : <div className="text-xs text-white/45">Loading receipt…</div>}
          {order.sender_name && (
            <div className="text-xs text-white/55">Sender: <span className="font-mono text-white">{order.sender_name}</span></div>
          )}
          {order.status === "pending" && (
            <div className="space-y-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200}
                     placeholder="Rejection reason (required if rejecting)"
                     className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button onClick={approve} disabled={busy !== null}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2 text-sm font-bold text-black disabled:opacity-50">
                  {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve
                </button>
                <button onClick={reject} disabled={busy !== null}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-500 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Reject
                </button>
              </div>
            </div>
          )}
          {order.status === "rejected" && order.rejection_reason && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
              Reason: {order.rejection_reason}
            </div>
          )}
          {order.status === "approved" && (
            <RefundOrderRow orderId={order.id} onRefunded={onChange} />
          )}
        </div>
      )}
    </div>
  );
}

function RefundOrderRow({ orderId, onRefunded }: { orderId: string; onRefunded: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const refund = async () => {
    if (reason.trim().length < 3) return alert("Refund reason must be at least 3 characters.");
    if (!confirm("Refund this approved order? This subtracts the granted credits.")) return;
    setBusy(true);
    try { await adminRefundOrder(orderId, reason.trim()); onRefunded(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-2">
      <div className="text-[11px] font-semibold text-amber-200">Refund (approved order)</div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200}
             placeholder="Refund reason"
             className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs" />
      <button onClick={refund} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-black disabled:opacity-50">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />} Refund order
      </button>
    </div>
  );
}

function UsersTab() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = async () => {
    setErr(null); setUsers(null);
    try { setUsers(await adminListUsers(q, 100)); }
    catch (e) { setErr((e as Error).message); setUsers([]); }
  };
  useEffect(() => { void reload(); }, []);

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/45" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && reload()}
                 placeholder="Search username, name, email…"
                 className="w-full rounded-xl border border-white/10 bg-white/5 px-9 py-2 text-sm" />
        </div>
        <button onClick={reload} className="rounded-xl bg-purple-500 px-3 text-xs font-bold">Search</button>
      </div>
      {err && <ErrCard msg={err} />}
      {!users ? <Skeleton /> : users.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] py-10 text-center text-sm text-white/40">No users.</div>
      ) : (
        <div className="space-y-2">{users.map((u) => <UserRow key={u.id} u={u} onChange={reload} />)}</div>
      )}
    </div>
  );
}

function UserRow({ u, onChange }: { u: AdminUserRow; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 text-left">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-xs font-bold">
          {(u.name || u.username || "?").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">
            {u.name || u.username}
            {u.is_owner    && <span className="ml-1 rounded-full bg-amber-500/30 px-1.5 text-[9px] text-amber-200">OWNER</span>}
            {u.is_verified && !u.is_owner && <span className="ml-1 rounded-full bg-sky-500/30 px-1.5 text-[9px] text-sky-200">PRO</span>}
          </div>
          <div className="truncate text-[11px] text-white/45">{u.email} · @{u.username}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-black">{(u.credits ?? 0).toLocaleString()} cr</div>
          <div className="text-[10px] text-white/45">{u.plan_code ?? "free"}</div>
        </div>
      </button>
      {open && <UserDetailsPanel uid={u.id} onChange={onChange} />}
    </div>
  );
}

/* ─── Full user dossier + all moderation/recovery/support actions ─── */
function UserDetailsPanel({ uid, onChange }: { uid: string; onChange: () => void }) {
  const [d, setD]   = useState<AdminUserDetails | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reload = async () => {
    setErr(null);
    try { setD(await adminGetUserDetails(uid)); }
    catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [uid]);

  const wrap = async (key: string, fn: () => Promise<unknown>): Promise<unknown> => {
    setBusy(key);
    try { return await fn(); }
    catch (e) { alert((e as Error).message); throw e; }
    finally { setBusy(null); }
  };
  const refresh = async () => { await reload(); onChange(); };

  if (err) return <div className="mt-3 border-t border-white/5 pt-3"><ErrCard msg={err} /></div>;
  if (!d)  return <div className="mt-3 border-t border-white/5 pt-3"><Skeleton /></div>;

  const u = d.user;

  return (
    <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
      {/* Status pills */}
      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
        <Pill on={u.is_banned}        offText="Not banned"       onText="BANNED"          colorOn="rose"   />
        <Pill on={u.is_suspended}     offText="Active"           onText="SUSPENDED"       colorOn="amber"  />
        <Pill on={u.credits_frozen}   offText="Credits OK"       onText="CREDITS FROZEN"  colorOn="sky"    />
        {(u.abuse_score ?? 0) > 0 && (
          <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-rose-200">Abuse score: {u.abuse_score}</span>
        )}
        {u.plan_expires_at && <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/60">Plan ends {new Date(u.plan_expires_at).toLocaleDateString()}</span>}
      </div>

      {/* Action grid: 3 columns of mini-tools */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ActionCredits     u={u} busy={busy} wrap={wrap} refresh={refresh} />
        <ActionSubscription u={u} busy={busy} wrap={wrap} refresh={refresh} />
        <ActionExtend      u={u} busy={busy} wrap={wrap} refresh={refresh} />
        <ActionCompensate  u={u} busy={busy} wrap={wrap} refresh={refresh} />
        <ActionRecovery    u={u} busy={busy} wrap={wrap} refresh={refresh} />
        <ActionModeration  u={u} busy={busy} wrap={wrap} refresh={refresh} />
        <ActionAbuseScore  u={u} busy={busy} wrap={wrap} refresh={refresh} />
        <ActionSupportNotes u={u} busy={busy} wrap={wrap} refresh={refresh} />
      </div>

      {/* History */}
      <div className="grid gap-3 sm:grid-cols-2">
        <HistoryCard title={`Payment history (${d.orders.length})`}>
          {d.orders.length === 0 ? <Empty /> : d.orders.slice(0, 8).map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 border-t border-white/5 py-1 text-[11px] first:border-0">
              <span className="truncate text-white/65">{new Date(o.created_at).toLocaleDateString()} · {o.kind} · ₱{o.amount_php}</span>
              <StatusChip status={o.status} />
            </div>
          ))}
        </HistoryCard>
        <HistoryCard title={`Credit ledger (${d.ledger.length})`}>
          {d.ledger.length === 0 ? <Empty /> : d.ledger.slice(0, 8).map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 border-t border-white/5 py-1 text-[11px] first:border-0">
              <span className="truncate text-white/55">{new Date(l.created_at).toLocaleDateString()} · {l.reason}</span>
              <span className={l.delta >= 0 ? "font-mono text-emerald-300" : "font-mono text-rose-300"}>
                {l.delta >= 0 ? "+" : ""}{l.delta}
              </span>
            </div>
          ))}
        </HistoryCard>
        <HistoryCard title={`Login activity (${d.logins.length})`}>
          {d.logins.length === 0 ? <Empty hint="No logins recorded yet." /> : d.logins.slice(0, 8).map((l) => (
            <div key={l.id} className="border-t border-white/5 py-1 text-[11px] first:border-0">
              <div className="text-white/65">{new Date(l.created_at).toLocaleString()}</div>
              <div className="truncate text-white/40 font-mono">{l.ip ?? "—"} · {l.user_agent?.slice(0, 60) ?? ""}</div>
            </div>
          ))}
        </HistoryCard>
        <HistoryCard title={`AI generation (${d.usage.length} day${d.usage.length===1?"":"s"})`}>
          {d.usage.length === 0 ? <Empty /> : d.usage.slice(0, 8).map((g) => (
            <div key={g.day} className="flex items-center justify-between gap-2 border-t border-white/5 py-1 text-[11px] first:border-0">
              <span className="text-white/65">{g.day}</span>
              <span className="font-mono text-white/55">img {g.image_count} · vid {g.video_count}</span>
            </div>
          ))}
        </HistoryCard>
      </div>
    </div>
  );
}

type Wrap = (key: string, fn: () => Promise<unknown>) => Promise<unknown>;
type ActionProps = { u: AdminUserDetails["user"]; busy: string | null; wrap: Wrap; refresh: () => Promise<void> };

function ActionCredits({ u, busy, wrap, refresh }: ActionProps) {
  const [delta, setDelta] = useState(""); const [reason, setReason] = useState("");
  return (
    <ToolCard title="Adjust credits" hint="±N · ledger-tracked">
      <input value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. 500 or -200" className={inputCls} />
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className={inputCls} />
      <ToolButton label="Apply" busy={busy === "adjust"} onClick={async () => {
        const d = Math.trunc(Number(delta));
        if (!Number.isFinite(d) || d === 0) return alert("Delta must be a non-zero integer.");
        await wrap("adjust", () => adminAdjustCredits(u.id, d, reason || "admin_adjust"));
        setDelta(""); setReason(""); await refresh();
      }} />
    </ToolCard>
  );
}

function ActionSubscription({ u, busy, wrap, refresh }: ActionProps) {
  const [plan, setPlan] = useState<"free"|"p15"|"p30">((u.plan_code as "free"|"p15"|"p30") || "free");
  const [days, setDays] = useState(15);
  return (
    <ToolCard title="Set subscription" hint="Replace plan + reset expiry">
      <select value={plan} onChange={(e) => setPlan(e.target.value as "free"|"p15"|"p30")} className={inputCls}>
        <option value="free">Free</option><option value="p15">15-Day plan</option><option value="p30">Monthly plan</option>
      </select>
      {plan !== "free" && (
        <input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} min={1} max={365} className={inputCls} />
      )}
      <ToolButton label="Apply" tone="emerald" busy={busy === "sub"} onClick={async () => {
        await wrap("sub", () => adminSetSubscription(u.id, plan, plan === "free" ? 0 : days));
        await refresh();
      }} />
    </ToolCard>
  );
}

function ActionExtend({ u, busy, wrap, refresh }: ActionProps) {
  const [days, setDays] = useState(7);
  return (
    <ToolCard title="Extend subscription" hint="Add days to current expiry">
      <input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} min={1} max={365} className={inputCls} />
      <ToolButton label="Extend" busy={busy === "extend"} onClick={async () => {
        if (days <= 0) return alert("Days must be positive.");
        await wrap("extend", () => adminExtendSubscription(u.id, days));
        await refresh();
      }} />
    </ToolCard>
  );
}

function ActionCompensate({ u, busy, wrap, refresh }: ActionProps) {
  const [credits, setCredits] = useState(50);
  const [note, setNote] = useState("");
  return (
    <ToolCard title="Compensation credits" hint="Tagged 'compensation:' in ledger" icon={<Gift className="h-3.5 w-3.5" />}>
      <input type="number" value={credits} onChange={(e) => setCredits(Number(e.target.value))} min={1} className={inputCls} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (≥3 chars, required)" className={inputCls} />
      <ToolButton label="Compensate" tone="emerald" busy={busy === "comp"} onClick={async () => {
        if (credits <= 0 || note.trim().length < 3) return alert("Credits > 0 and reason ≥ 3 chars.");
        await wrap("comp", () => adminCompensateUser(u.id, credits, note.trim()));
        setNote(""); await refresh();
      }} />
    </ToolCard>
  );
}

function ActionRecovery({ u, busy, wrap, refresh }: ActionProps) {
  const [newEmail, setNewEmail] = useState("");
  const [tempPwd, setTempPwd]   = useState<string | null>(null);
  return (
    <ToolCard title="Account recovery" hint="Hacked-account tools">
      <ToolButton label="Reset password" icon={<KeyRound className="h-3.5 w-3.5" />} tone="purple" busy={busy === "pwd"}
        onClick={async () => {
          if (!confirm("Generate a new temporary password? The old one stops working immediately.")) return;
          const r = await wrap("pwd", () => adminResetUserPassword(u.id)) as { temporary_password: string };
          setTempPwd(r.temporary_password);
        }} />
      {tempPwd && (
        <div className="mt-1 flex items-center gap-1 rounded-lg bg-amber-500/10 p-1.5 text-[10.5px] text-amber-200">
          <span className="font-mono select-all break-all">{tempPwd}</span>
          <button onClick={() => navigator.clipboard?.writeText(tempPwd)} className="ml-auto rounded p-0.5 hover:bg-white/10"><CopyIcon className="h-3 w-3" /></button>
        </div>
      )}
      <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="New email…" className={inputCls} />
      <ToolButton label="Change email" icon={<Mail className="h-3.5 w-3.5" />} busy={busy === "mail"}
        onClick={async () => {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return alert("Invalid email.");
          if (!confirm(`Change email to ${newEmail}?`)) return;
          await wrap("mail", () => adminChangeUserEmail(u.id, newEmail));
          setNewEmail(""); await refresh();
        }} />
      <ToolButton label="Force logout (all devices)" icon={<Power className="h-3.5 w-3.5" />} tone="rose" busy={busy === "kick"}
        onClick={async () => {
          if (!confirm("Force this user to sign out everywhere?")) return;
          await wrap("kick", () => adminForceLogout(u.id));
          await refresh();
        }} />
    </ToolCard>
  );
}

function ActionModeration({ u, busy, wrap, refresh }: ActionProps) {
  const [reason, setReason] = useState(u.suspension_reason ?? "");
  const setFlag = (patch: Parameters<typeof adminSetUserFlags>[1]) =>
    wrap("flags", () => adminSetUserFlags(u.id, patch)).then(refresh);
  return (
    <ToolCard title="Moderation" hint="Suspend / ban / freeze">
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (saved on suspend)" className={inputCls} />
      <div className="grid grid-cols-2 gap-1.5">
        <ToolButton label={u.is_suspended ? "Lift suspend" : "Suspend"}
          icon={u.is_suspended ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          tone={u.is_suspended ? "emerald" : "amber"} busy={busy === "flags"}
          onClick={() => setFlag({ is_suspended: !u.is_suspended, suspension_reason: !u.is_suspended ? reason : null })} />
        <ToolButton label={u.is_banned ? "Unban" : "Permaban"}
          icon={<Ban className="h-3.5 w-3.5" />}
          tone={u.is_banned ? "emerald" : "rose"} busy={busy === "flags"}
          onClick={() => {
            if (!u.is_banned && !confirm("Permanently ban this account?")) return;
            void setFlag({ is_banned: !u.is_banned });
          }} />
        <ToolButton label={u.credits_frozen ? "Unfreeze credits" : "Freeze credits"}
          icon={<Snowflake className="h-3.5 w-3.5" />}
          tone={u.credits_frozen ? "emerald" : "sky"} busy={busy === "flags"}
          onClick={() => setFlag({ credits_frozen: !u.credits_frozen })} />
      </div>
    </ToolCard>
  );
}

function ActionAbuseScore({ u, busy, wrap, refresh }: ActionProps) {
  const [score, setScore] = useState(u.abuse_score ?? 0);
  return (
    <ToolCard title="Abuse score" hint="0 – 100, ≥50 → suspicious feed">
      <input type="number" value={score} onChange={(e) => setScore(Number(e.target.value))} min={0} max={100} className={inputCls} />
      <ToolButton label="Save" busy={busy === "score"} onClick={async () => {
        await wrap("score", () => adminSetUserFlags(u.id, { abuse_score: Math.max(0, Math.min(100, Math.trunc(score))) }));
        await refresh();
      }} />
    </ToolCard>
  );
}

function ActionSupportNotes({ u, busy, wrap, refresh }: ActionProps) {
  const [notes, setNotes] = useState(u.support_notes ?? "");
  return (
    <ToolCard title="Support notes" hint="Internal moderation notes" icon={<NotebookPen className="h-3.5 w-3.5" />}>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                className={inputCls + " resize-none"} placeholder="Notes only visible to admins…" />
      <ToolButton label="Save notes" busy={busy === "notes"} onClick={async () => {
        await wrap("notes", () => adminSetUserFlags(u.id, { support_notes: notes }));
        await refresh();
      }} />
    </ToolCard>
  );
}

const inputCls = "w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px]";
function ToolCard({ title, hint, icon, children }: { title: string; hint?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-xl border border-white/5 bg-black/30 p-2.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <div className="text-[11px] font-bold text-white/80">{title}</div>
      </div>
      {hint && <div className="text-[10px] text-white/35">{hint}</div>}
      {children}
    </div>
  );
}
function ToolButton({ label, icon, busy, tone = "purple", onClick }:
  { label: string; icon?: React.ReactNode; busy?: boolean; tone?: "purple"|"emerald"|"rose"|"amber"|"sky"; onClick: () => void | Promise<void> }) {
  const bg = {
    purple: "bg-purple-500 text-white", emerald: "bg-emerald-500 text-black",
    rose: "bg-rose-500 text-white", amber: "bg-amber-500 text-black", sky: "bg-sky-500 text-black",
  }[tone];
  return (
    <button onClick={onClick} disabled={busy}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-50 ${bg}`}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon} {label}
    </button>
  );
}
function Pill({ on, offText, onText, colorOn }: { on?: boolean; offText: string; onText: string; colorOn: "rose"|"amber"|"sky" }) {
  if (!on) return <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/40">{offText}</span>;
  const c = { rose: "bg-rose-500/25 text-rose-200", amber: "bg-amber-500/25 text-amber-200", sky: "bg-sky-500/25 text-sky-200" }[colorOn];
  return <span className={`rounded-full px-2 py-0.5 ${c}`}>{onText}</span>;
}
function HistoryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/30 p-2.5">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-white/45">{title}</div>
      <div>{children}</div>
    </div>
  );
}
function Empty({ hint }: { hint?: string }) { return <div className="py-2 text-[11px] text-white/35">{hint ?? "Nothing recorded."}</div>; }
function StatusChip({ status }: { status: string }) {
  const c = status === "approved" ? "bg-emerald-500/25 text-emerald-200"
          : status === "pending"  ? "bg-amber-500/25 text-amber-200"
          : "bg-rose-500/25 text-rose-200";
  return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${c}`}>{status}</span>;
}

/* ─── Abuse / suspicious users tab ────────────────────────────────── */
function AbuseTab() {
  const [users, setUsers] = useState<AdminSuspiciousUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = async () => {
    setErr(null); setUsers(null);
    try { setUsers(await adminGetSuspiciousUsers()); }
    catch (e) { setErr((e as Error).message); setUsers([]); }
  };
  useEffect(() => { void reload(); }, []);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold">Suspicious users</h2>
          <p className="text-[11px] text-white/45">Banned · suspended · credits frozen · or abuse score ≥ 50.</p>
        </div>
        <button onClick={reload} className="rounded-full p-1.5 text-white/55 hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {err && <ErrCard msg={err} />}
      {!users ? <Skeleton /> : users.length === 0 ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 py-10 text-center text-sm text-emerald-200">All clear. No suspicious accounts.</div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <UserRow key={u.id} onChange={reload} u={{
              id: u.id, username: u.username, name: u.name, email: u.email,
              credits: u.credits, plan_code: u.plan_code, plan_credits: null,
              plan_expires_at: u.plan_expires_at, subscription_status: null,
              is_owner: u.is_owner ?? false, is_verified: u.is_verified ?? false, created_at: u.created_at,
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsTab() {
  const [s, setS] = useState<AdminSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reload = async () => {
    setErr(null);
    try { setS(await adminGetSettings()); }
    catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { void reload(); }, []);
  if (!s) return err ? <ErrCard msg={err} /> : <Skeleton />;

  const set = <K extends keyof AdminSettings>(k: K, v: AdminSettings[K]) => setS({ ...s, [k]: v });
  const save = async () => {
    setBusy(true); setErr(null);
    try { await adminSaveSettings(s); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Section title="Cooldown engine">
        <NumberRow label="Threshold 1 (credits in window 1)" v={s.cooldown_threshold_1} onChange={(v) => set("cooldown_threshold_1", v)} />
        <NumberRow label="Window 1 (minutes)"  v={s.cooldown_window_1_min}    onChange={(v) => set("cooldown_window_1_min", v)} />
        <NumberRow label="Cooldown 1 (minutes)" v={s.cooldown_duration_1_min} onChange={(v) => set("cooldown_duration_1_min", v)} />
        <NumberRow label="Threshold 2 (credits in window 2)" v={s.cooldown_threshold_2} onChange={(v) => set("cooldown_threshold_2", v)} />
        <NumberRow label="Window 2 (minutes)"  v={s.cooldown_window_2_min}    onChange={(v) => set("cooldown_window_2_min", v)} />
        <NumberRow label="Cooldown 2 (minutes)" v={s.cooldown_duration_2_min} onChange={(v) => set("cooldown_duration_2_min", v)} />
      </Section>
      <Section title="Smart-saver">
        <NumberRow label="Trigger threshold (% of plan_credits)" v={s.smart_saver_threshold_pct} onChange={(v) => set("smart_saver_threshold_pct", v)} />
        <NumberRow label="Free daily image limit" v={s.free_daily_image_limit} onChange={(v) => set("free_daily_image_limit", v)} />
      </Section>
      <Section title="AI models">
        <TextRow   label="Default image model" v={s.default_image_model} onChange={(v) => set("default_image_model", v)} />
        <TextRow   label="Default video model" v={s.default_video_model} onChange={(v) => set("default_video_model", v)} />
        <ToggleRow label="AI features enabled" v={s.ai_features_enabled} onChange={(v) => set("ai_features_enabled", v)} />
        <ToggleRow label="New registrations enabled" v={s.registration_enabled} onChange={(v) => set("registration_enabled", v)} />
      </Section>
      {err && <ErrCard msg={err} />}
      <button onClick={save} disabled={busy}
              className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
        {busy ? "Saving…" : "Save engine settings"}
      </button>
    </div>
  );
}

/* ─── Cloudinary unsigned upload (shared by PaymentMethodsTab QR fields) */
const CLD_CLOUD  = "devyx5yyk";
const CLD_PRESET = "socia_upload";
async function uploadToCloudinary(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLD_CLOUD}/image/upload`, {
    method: "POST", body: fd,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const json = await res.json() as { secure_url: string };
  return json.secure_url;
}

function QRUploadRow({
  label, url, uploading, onFile, onClear,
}: {
  label: string;
  url: string;
  uploading: boolean;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <span className="mb-1.5 block text-[11px] text-white/55">{label}</span>
      {url ? (
        <div className="relative inline-block">
          <img src={url} alt="QR" className="h-28 w-28 rounded-xl border border-white/10 object-contain bg-white/5" />
          <button
            type="button"
            onClick={onClear}
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 shadow"
            title="Remove QR">
            <XIcon className="h-3 w-3 text-white" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => ref.current?.click()}
          className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 bg-white/[0.03] text-white/40 hover:border-white/35 hover:text-white/65 disabled:opacity-50 transition-colors">
          {uploading
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : <><Upload className="h-5 w-5" /><span className="text-[10px]">Upload QR</span></>}
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
      />
    </div>
  );
}

const PM_DEFAULTS: PaymentSettings = {
  gcash_enabled: true,  gcash_name: "",  gcash_number: "",  gcash_qr_url: "",
  maya_enabled:  true,  maya_name:  "",  maya_number:  "",  maya_qr_url:  "",
  bank_enabled:  true,  bank_name:  "",  bank_account_name: "", bank_account_no: "", bank_qr_url: "",
  notes: "",
};

function PaymentMethodsTab() {
  const [s, setS]           = useState<PaymentSettings | null>(null);
  const [busy, setBusy]     = useState(false);
  const [uploading, setUp]  = useState<string | null>(null);
  const [err, setErr]       = useState<string | null>(null);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    adminGetPaymentSettings()
      .then((data) => setS({ ...PM_DEFAULTS, ...(data ?? {}) }))
      .catch((e) => setErr((e as Error).message));
  }, []);

  if (!s) return err ? <ErrCard msg={err} /> : <Skeleton />;

  const patch = <K extends keyof PaymentSettings>(k: K, v: PaymentSettings[K]) =>
    setS((prev) => prev ? { ...prev, [k]: v } : prev);

  const handleQR = async (field: keyof PaymentSettings, file: File) => {
    setUp(field as string);
    setErr(null);
    try {
      const url = await uploadToCloudinary(file);
      patch(field, url as PaymentSettings[typeof field]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUp(null);
    }
  };

  const save = async () => {
    if (!s) return;
    setBusy(true); setErr(null); setSaved(false);
    try {
      await adminSavePaymentSettings(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const methods: {
    key: "gcash" | "maya" | "bank";
    label: string;
    dot: string;
    enabledField: keyof PaymentSettings;
    nameField: keyof PaymentSettings;
    numField: keyof PaymentSettings;
    numLabel: string;
    qrField: keyof PaymentSettings;
    extraFields?: { field: keyof PaymentSettings; label: string }[];
  }[] = [
    {
      key: "gcash", label: "GCash", dot: "bg-emerald-400",
      enabledField: "gcash_enabled", nameField: "gcash_name", numField: "gcash_number",
      numLabel: "GCash number", qrField: "gcash_qr_url",
    },
    {
      key: "maya", label: "Maya", dot: "bg-blue-400",
      enabledField: "maya_enabled", nameField: "maya_name", numField: "maya_number",
      numLabel: "Maya number", qrField: "maya_qr_url",
    },
    {
      key: "bank", label: "Bank / Visa", dot: "bg-amber-400",
      enabledField: "bank_enabled", nameField: "bank_name", numField: "bank_account_no",
      numLabel: "Account number", qrField: "bank_qr_url",
      extraFields: [{ field: "bank_account_name", label: "Account name" }],
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-white/40">
        Values are shown live on the checkout page. Toggle off to hide a payment method from users.
      </p>

      {methods.map((m) => {
        const enabled = Boolean(s[m.enabledField]);
        return (
          <div
            key={m.key}
            className={`rounded-2xl border p-4 transition-opacity ${
              enabled ? "border-white/10 bg-white/[0.03]" : "border-white/5 bg-white/[0.015]"
            }`}>
            {/* Card header: label + toggle */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} />
                <span className="text-sm font-bold">{m.label}</span>
                {!enabled && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/40">disabled</span>
                )}
              </div>
              {/* Inline toggle */}
              <button
                type="button"
                onClick={() => patch(m.enabledField, !enabled as PaymentSettings[typeof m.enabledField])}
                className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-white/15"}`}>
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {enabled && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TextRow
                    label="Display name"
                    v={(s[m.nameField] as string) ?? ""}
                    onChange={(v) => patch(m.nameField, v as PaymentSettings[typeof m.nameField])}
                  />
                  <TextRow
                    label={m.numLabel}
                    v={(s[m.numField] as string) ?? ""}
                    onChange={(v) => patch(m.numField, v as PaymentSettings[typeof m.numField])}
                  />
                  {m.extraFields?.map(({ field, label }) => (
                    <TextRow
                      key={field as string}
                      label={label}
                      v={(s[field] as string) ?? ""}
                      onChange={(v) => patch(field, v as PaymentSettings[typeof field])}
                    />
                  ))}
                </div>
                <QRUploadRow
                  label="QR Code image"
                  url={(s[m.qrField] as string) ?? ""}
                  uploading={uploading === (m.qrField as string)}
                  onFile={(f) => handleQR(m.qrField, f)}
                  onClear={() => patch(m.qrField, "" as PaymentSettings[typeof m.qrField])}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Notes */}
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <label className="block text-xs">
          <span className="mb-1.5 block text-white/55">Payment instructions / notes (shown at checkout)</span>
          <textarea
            rows={3}
            value={s.notes ?? ""}
            onChange={(e) => patch("notes", e.target.value)}
            className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            placeholder="e.g. Send payment to the number above, then upload your receipt."
          />
        </label>
      </div>

      {s.updated_at && (
        <p className="text-[10px] text-white/30">
          Last saved: {new Date(s.updated_at).toLocaleString()}
        </p>
      )}

      {err && <ErrCard msg={err} />}

      <button
        onClick={save}
        disabled={busy || !!uploading}
        className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
        {busy
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
          : saved
          ? <><CheckCircle2 className="h-4 w-4" /> Saved</>
          : "Save payment settings"}
      </button>
    </div>
  );
}

function AuditTab() {
  const [entries, setEntries] = useState<AdminAuditEntry[] | null>(null);
  const [err, setErr]         = useState<string | null>(null);
  const [search, setSearch]   = useState("");

  useEffect(() => {
    adminGetAudit(500).then(setEntries).catch((e) => { setErr((e as Error).message); setEntries([]); });
  }, []);

  const filtered = (entries ?? []).filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.action.toLowerCase().includes(q) ||
      (e.username ?? "").toLowerCase().includes(q) ||
      (e.target_id ?? "").toLowerCase().includes(q) ||
      (e.target_type ?? "").toLowerCase().includes(q)
    );
  });

  const exportCsv = () => {
    if (!filtered.length) return;
    const rows = [
      ["Time", "Action", "Admin", "Target Type", "Target ID", "IP"].join(","),
      ...filtered.map((e) =>
        [new Date(e.created_at).toLocaleString(), e.action, e.username ?? "", e.target_type ?? "", e.target_id ?? "", e.ip ?? ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white">Audit Trail</h2>
          <p className="mt-0.5 text-[11px] text-white/40">All admin actions — searchable and exportable</p>
        </div>
        <button onClick={exportCsv} disabled={!entries || entries.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/60 hover:bg-white/10 disabled:opacity-30">
          <FileText className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
               placeholder="Search by action, admin username, or target…"
               className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-xs text-white placeholder:text-white/25" />
      </div>

      {err && <ErrCard msg={err} />}
      {!entries ? <Skeleton /> : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] py-10 text-center text-sm text-white/40">
          {search ? "No audit entries match your search." : "No audit entries yet."}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((e) => (
            <div key={e.id} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className={`font-bold ${
                  e.action.includes("ban")     ? "text-red-400" :
                  e.action.includes("reject")  ? "text-orange-400" :
                  e.action.includes("approve") ? "text-emerald-400" :
                  e.action.includes("suspend") ? "text-rose-400" :
                  "text-white"
                }`}>{e.action}</span>
                <span className="flex-shrink-0 text-white/35">{new Date(e.created_at).toLocaleString()}</span>
              </div>
              <div className="text-white/55">
                {e.username ?? "—"}
                {e.target_type && <> · {e.target_type}/{e.target_id?.slice(0, 12)}</>}
                {e.ip && <> · {e.ip}</>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════ REFUNDS TAB ════════════ */

function RefundsTab() {
  const [status, setStatus]     = useState<string>("pending");
  const [subType, setSubType]   = useState<string>("all");
  const [requests, setRequests] = useState<AdminRefundRequest[] | null>(null);
  const [stats, setStats]       = useState<AdminRefundStats | null>(null);
  const [err, setErr]           = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const reload = async () => {
    setErr(null); setRequests(null);
    try {
      const [reqs, st] = await Promise.all([adminListRefunds(status, subType, 100), adminGetRefundStats()]);
      setRequests(reqs);
      setStats(st);
    } catch (e) { setErr((e as Error).message); setRequests([]); }
  };
  useEffect(() => { void reload(); }, [status, subType]);

  return (
    <div>
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 mb-4 md:grid-cols-8">
          {([
            ["Pending",  stats.pending,              true],
            ["Review",   stats.reviewing,             false],
            ["Approved", stats.approved,              false],
            ["Partial",  stats.partial,               false],
            ["Rejected", stats.rejected,              false],
            ["Total",    stats.total,                 false],
            ["Paid out", "₱" + stats.total_approved_php.toLocaleString(), false],
          ] as [string, number | string, boolean][]).map(([label, val, accent]) => (
            <Stat key={label} label={label} value={String(val)} accent={accent} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["pending","reviewing","approved","partial","rejected","all"] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold capitalize ${
                      status === s ? "bg-purple-500 text-white" : "bg-white/5 text-white/65 hover:text-white"}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto items-center">
          {(["all","creator","ai"] as const).map((t) => (
            <button key={t} onClick={() => setSubType(t)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${
                      subType === t ? "bg-indigo-500 text-white" : "bg-white/5 text-white/55 hover:text-white"}`}>
              {t === "all" ? "All types" : t === "creator" ? "Creator" : "AI"}
            </button>
          ))}
          <button onClick={reload} className="ml-1 rounded-full p-1.5 text-white/55 hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      {err && <ErrCard msg={err} />}
      {!requests ? <Skeleton /> : requests.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] py-12 text-center text-sm text-white/40">
          No {status} refund requests.
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <RefundRequestRow
              key={r.id} req={r}
              expanded={expanded === r.id}
              onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
              onChange={reload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RefundRequestRow({
  req, expanded, onToggle, onChange,
}: {
  req: AdminRefundRequest;
  expanded: boolean;
  onToggle: () => void;
  onChange: () => void;
}) {
  const [deciding, setDeciding] = useState(false);
  const [notes, setNotes]       = useState("");
  const [partialAmt, setPartialAmt] = useState<number>(req.estimated_refundable_php);
  const [decErr, setDecErr]     = useState<string | null>(null);

  const [threadMsgs,     setThreadMsgs]     = useState<AdminRefundMessage[]>([]);
  const [threadLoading,  setThreadLoading]  = useState(false);
  const [threadText,     setThreadText]     = useState("");
  const [threadInternal, setThreadInternal] = useState(false);
  const [threadSending,  setThreadSending]  = useState(false);
  const [payoutStatus,   setPayoutStatus]   = useState(req.payout_status ?? "");
  const [payoutRef,      setPayoutRef]      = useState(req.payout_ref ?? "");

  const statusColors: Record<string, string> = {
    pending:   "text-amber-300",
    reviewing: "text-blue-300",
    approved:  "text-emerald-400",
    partial:   "text-teal-300",
    rejected:  "text-rose-400",
  };
  const color = statusColors[req.status] ?? "text-white/50";

  const isDone = ["approved","partial","rejected"].includes(req.status);

  async function decide(action: "approve"|"partial"|"reject"|"review") {
    setDecErr(null);
    if (action === "reject" && notes.trim().length < 5) {
      setDecErr("Please enter a rejection reason (at least 5 characters)."); return;
    }
    if (action === "partial" && partialAmt <= 0) {
      setDecErr("Enter a positive amount for partial approval."); return;
    }
    setDeciding(true);
    try {
      await adminDecideRefund(req.id, action, notes.trim() || undefined, action === "partial" ? partialAmt : undefined);
      onChange();
    } catch (e) {
      setDecErr((e as Error).message);
    } finally { setDeciding(false); }
  }

  useEffect(() => {
    if (!expanded) return;
    setThreadLoading(true);
    adminListRefundMessages(req.id)
      .then((msgs) => setThreadMsgs(msgs))
      .catch(() => {})
      .finally(() => setThreadLoading(false));
  }, [expanded, req.id]);

  async function reloadThread() {
    const msgs = await adminListRefundMessages(req.id).catch(() => []);
    setThreadMsgs(msgs);
  }

  async function sendThreadMsg() {
    if (!threadText.trim()) return;
    setThreadSending(true);
    try {
      await adminSendRefundMessage(req.id, threadText.trim(), threadInternal);
      setThreadText("");
      await reloadThread();
    } catch (e) { alert((e as Error).message); }
    finally { setThreadSending(false); }
  }

  async function sendProofRequest() {
    const note = prompt("Custom note for proof request (leave blank for default):");
    if (note === null) return;
    try { await adminRequestProof(req.id, note.trim() || undefined); await reloadThread(); }
    catch (e) { alert((e as Error).message); }
  }

  async function savePayoutStatus() {
    if (!payoutStatus) return;
    try {
      await adminUpdatePayout(req.id, payoutStatus, payoutRef.trim() || undefined);
      await reloadThread();
      onChange();
    } catch (e) { alert((e as Error).message); }
  }

  async function flagReq() {
    const reason = prompt("Flag reason:");
    if (!reason?.trim()) return;
    try { await adminFlagRefund(req.id, reason.trim()); onChange(); }
    catch (e) { alert((e as Error).message); }
  }

  const username = req.users?.username ?? req.users?.email ?? req.user_id.slice(0, 12);

  return (
    <div className={`rounded-2xl border ${req.is_flagged ? "border-rose-500/30" : "border-white/5"} bg-white/[0.02] overflow-hidden`}>
      {/* Header row */}
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12.5px] font-bold text-white capitalize">{username}</span>
            <span className={`text-[10.5px] font-semibold capitalize ${color}`}>{req.status}</span>
            <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9.5px] text-white/40 capitalize">{req.subscription_type}</span>
            <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9.5px] text-white/40 uppercase">{req.plan_code}</span>
            {req.is_flagged && <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-1.5 py-0.5 text-[9.5px] text-rose-300 font-semibold">Flagged</span>}
            {req.abuse_score >= 50 && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9.5px] text-amber-300">Abuse {req.abuse_score}</span>}
          </div>
          <div className="text-[10.5px] text-white/35 mt-0.5 capitalize">
            {req.reason.replace(/_/g, " ")} · {new Date(req.created_at).toLocaleString()}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] text-white/40">Paid ₱{req.payment_amount_php}</div>
          <div className="text-[13px] font-bold text-white">~₱{req.estimated_refundable_php}</div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/5 px-4 py-4 space-y-4">
          {/* Usage breakdown */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-center">
              <div className="text-[10px] text-white/40 uppercase">Usage %</div>
              <div className="text-lg font-bold text-white">{req.subscription_type === "creator"
                ? req.credits_total > 0 ? Math.round(req.credits_used / req.credits_total * 100) : 0
                : req.ai_requests_limit > 0 ? Math.round(req.ai_requests_used / req.ai_requests_limit * 100) : 0}%</div>
            </div>
            {req.subscription_type === "creator" ? (
              <>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-center">
                  <div className="text-[10px] text-white/40 uppercase">Credits total</div>
                  <div className="text-lg font-bold text-white">{req.credits_total}</div>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-center">
                  <div className="text-[10px] text-white/40 uppercase">Used</div>
                  <div className="text-lg font-bold text-rose-300">{req.credits_used}</div>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-center">
                  <div className="text-[10px] text-white/40 uppercase">Remaining</div>
                  <div className="text-lg font-bold text-emerald-300">{req.credits_remaining}</div>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-center">
                  <div className="text-[10px] text-white/40 uppercase">AI limit</div>
                  <div className="text-lg font-bold text-white">{req.ai_requests_limit}</div>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-center">
                  <div className="text-[10px] text-white/40 uppercase">Used</div>
                  <div className="text-lg font-bold text-rose-300">{req.ai_requests_used}</div>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-center">
                  <div className="text-[10px] text-white/40 uppercase">Remaining</div>
                  <div className="text-lg font-bold text-emerald-300">{req.ai_requests_limit - req.ai_requests_used}</div>
                </div>
              </>
            )}
          </div>

          {/* Description */}
          <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase text-white/35 mb-1">User description</div>
            <div className="text-[12.5px] text-white/80 whitespace-pre-wrap">{req.description}</div>
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-3 text-[11px] text-white/40">
            {req.payment_reference && <span>Ref: <span className="text-white/60 font-mono">{req.payment_reference}</span></span>}
            {req.users?.email && <span>Email: <span className="text-white/60">{req.users.email}</span></span>}
            {req.flag_reason && <span className="text-rose-300">Flag reason: {req.flag_reason}</span>}
            {req.reviewed_by && <span>Reviewed by: <span className="text-white/60">{req.reviewed_by}</span></span>}
          </div>

          {/* Prior admin notes */}
          {req.admin_notes && (
            <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase text-white/35 mb-1">Admin notes</div>
              <div className="text-[12px] text-white/70">{req.admin_notes}</div>
            </div>
          )}

          {/* Decision panel */}
          {!isDone && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Decision</div>

              {decErr && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300">{decErr}</div>}

              <label className="block text-[11px]">
                <span className="text-white/45 mb-1 block">Admin notes (required for rejection, optional for others)</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-purple-500/40"
                          placeholder="Notes visible to user…" />
              </label>

              <label className="flex items-center gap-3 text-[11px]">
                <span className="text-white/45 whitespace-nowrap">Partial amount (₱)</span>
                <input type="number" min={1} value={partialAmt}
                       onChange={(e) => setPartialAmt(Number(e.target.value))}
                       className="w-28 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-white text-right focus:outline-none focus:border-purple-500/40" />
                <span className="text-white/30 text-[10px]">of est. ₱{req.estimated_refundable_php}</span>
              </label>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <button onClick={() => decide("approve")} disabled={deciding}
                        className="rounded-xl bg-emerald-500 px-3 py-2 text-[11.5px] font-bold text-white disabled:opacity-50">
                  {deciding ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "✓ Full approve"}
                </button>
                <button onClick={() => decide("partial")} disabled={deciding}
                        className="rounded-xl bg-teal-500 px-3 py-2 text-[11.5px] font-bold text-white disabled:opacity-50">
                  Partial (₱{partialAmt})
                </button>
                <button onClick={() => decide("review")} disabled={deciding}
                        className="rounded-xl bg-blue-500 px-3 py-2 text-[11.5px] font-bold text-white disabled:opacity-50">
                  Mark reviewing
                </button>
                <button onClick={() => decide("reject")} disabled={deciding}
                        className="rounded-xl bg-rose-500 px-3 py-2 text-[11.5px] font-bold text-white disabled:opacity-50">
                  Reject
                </button>
              </div>

              <button onClick={flagReq}
                      className="text-[10.5px] text-rose-400/60 hover:text-rose-400 underline decoration-dashed">
                Flag as suspicious / abuse
              </button>
            </div>
          )}

          {/* Decided banner */}
          {isDone && (
            <div className={`rounded-xl border px-3 py-2.5 text-[12px] font-semibold ${
              req.status === "approved" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : req.status === "partial"  ? "border-teal-500/30 bg-teal-500/10 text-teal-300"
              :                             "border-rose-500/30 bg-rose-500/10 text-rose-300"
            }`}>
              {req.status === "approved" ? `Full refund approved — ₱${req.approved_amount_php?.toLocaleString() ?? "?"}` :
               req.status === "partial"  ? `Partial refund approved — ₱${req.approved_amount_php?.toLocaleString() ?? "?"}` :
               "Rejected"}
              {req.reviewed_by && <span className="ml-2 font-normal opacity-60">by {req.reviewed_by}</span>}
            </div>
          )}

          {/* Payout status (for approved/partial) */}
          {(req.status === "approved" || req.status === "partial") && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-3 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Payout tracking</div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={payoutStatus}
                  onChange={(e) => setPayoutStatus(e.target.value)}
                  className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11.5px] text-white focus:outline-none focus:border-purple-500/40"
                >
                  <option value="">— Not started —</option>
                  <option value="queued">Queued</option>
                  <option value="processing">Processing</option>
                  <option value="sent">Sent ✓</option>
                  <option value="failed">Failed</option>
                </select>
                <input
                  type="text" value={payoutRef}
                  onChange={(e) => setPayoutRef(e.target.value)}
                  placeholder="Payment ref (optional)"
                  className="flex-1 min-w-0 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11.5px] text-white placeholder:text-white/25 focus:outline-none focus:border-purple-500/40"
                />
                <button
                  onClick={savePayoutStatus}
                  disabled={!payoutStatus}
                  className="rounded-xl bg-indigo-500 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Support Thread */}
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-3 space-y-3">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-white/35" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Support Thread</span>
              <button onClick={reloadThread} className="ml-auto text-white/30 hover:text-white/60">
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>

            {/* Messages */}
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {threadLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-white/30" /></div>
              ) : threadMsgs.length === 0 ? (
                <div className="py-4 text-center text-[11px] text-white/25">No messages yet.</div>
              ) : threadMsgs.map((m) => (
                <div key={m.id} className={`rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
                  m.is_internal_note
                    ? "border border-amber-500/25 bg-amber-500/8 text-amber-200/80"
                    : m.sender_role === "system"
                    ? "border border-white/8 bg-white/[0.02] text-white/45 text-center italic"
                    : m.sender_role === "user"
                    ? "border border-indigo-500/20 bg-indigo-500/10 text-white/80 ml-6"
                    : "border border-purple-500/20 bg-purple-500/8 text-white/80 mr-6"
                }`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-55">
                      {m.is_internal_note ? "Internal Note" : m.sender_role === "system" ? "System" : m.sender_role === "user" ? "User" : "Admin"}
                    </span>
                    <span className="text-[9px] opacity-35 ml-auto">
                      {new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {m.message}
                </div>
              ))}
            </div>

            {/* Compose */}
            <div className="space-y-2">
              <textarea
                value={threadText}
                onChange={(e) => setThreadText(e.target.value)}
                rows={2}
                placeholder={threadInternal ? "Internal note (hidden from user)…" : "Message to user…"}
                className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11.5px] text-white placeholder:text-white/25 focus:outline-none focus:border-purple-500/40"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox" checked={threadInternal}
                    onChange={(e) => setThreadInternal(e.target.checked)}
                    className="h-3 w-3 accent-amber-400"
                  />
                  <span className={`text-[10px] ${threadInternal ? "text-amber-300" : "text-white/40"}`}>
                    Internal note
                  </span>
                </label>
                <div className="ml-auto flex gap-1.5">
                  <button
                    onClick={sendProofRequest}
                    className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/40 hover:text-white"
                  >
                    <FileCheck className="h-3 w-3" /> Request proof
                  </button>
                  <button
                    disabled={!threadText.trim() || threadSending}
                    onClick={sendThreadMsg}
                    className="flex items-center gap-1 rounded-xl bg-purple-500 px-2.5 py-1.5 text-[10.5px] font-bold text-white disabled:opacity-40"
                  >
                    {threadSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    {threadInternal ? "Save note" : "Send"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════ FUNDING TAB ════════════ */

function FundingTab() {
  const [stats, setStats]     = useState<AdminFundingStats | null>(null);
  const [donations, setDonations] = useState<AdminFundingDonation[] | null>(null);
  const [status, setStatus]   = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [err, setErr]         = useState<string | null>(null);
  const [notes, setNotes]     = useState<Record<string, string>>({});
  const [busy, setBusy]       = useState<Record<string, boolean>>({});

  const loadAll = async () => {
    setErr(null);
    try {
      const [s, d] = await Promise.all([
        adminGetFundingStats(),
        adminListFundingDonations(status, 100),
      ]);
      setStats(s);
      setDonations(d);
    } catch (e) { setErr((e as Error).message); setDonations([]); }
  };

  useEffect(() => { void loadAll(); }, [status]);

  const act = async (id: string, action: "approve" | "reject") => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      if (action === "approve") await adminApproveFunding(id, notes[id]);
      else                      await adminRejectFunding(id, notes[id]);
      await loadAll();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy((b) => ({ ...b, [id]: false })); }
  };

  const pct = stats?.funding
    ? Math.min(100, Math.round((stats.funding.current_amount / stats.funding.target_amount) * 100))
    : 0;

  return (
    <div>
      {/* Stats row */}
      {stats?.funding && (
        <div className="mb-4">
          <div className="mb-3 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#1D9BF0]">
                Phase {stats.funding.unlock_phase} — Community Funding
              </span>
              {stats.funding.is_goal_reached && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">Goal Reached!</span>
              )}
            </div>
            <div className="mb-2 grid grid-cols-4 gap-2">
              <Stat label="Raised"     value={`₱${Math.floor(stats.funding.current_amount).toLocaleString()}`} />
              <Stat label="Goal"       value={`₱${Math.floor(stats.funding.target_amount).toLocaleString()}`} />
              <Stat label="Supporters" value={stats.funding.supporters_count.toLocaleString()} />
              <Stat label="% Funded"   value={`${pct}%`} accent={pct >= 100} />
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full transition-all duration-700"
                   style={{ width: `${pct}%`, background: "linear-gradient(90deg,#a855f7,#ec4899)" }} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Pending"  value={stats.pending.toString()}  accent={stats.pending > 0} />
            <Stat label="Approved" value={stats.approved.toString()} />
            <Stat label="Rejected" value={stats.rejected.toString()} />
            <Stat label="Total"    value={stats.total.toString()} />
          </div>
        </div>
      )}

      {/* Status filter */}
      <div className="mb-3 flex items-center gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold capitalize ${
                    status === s ? "bg-purple-500 text-white" : "bg-white/5 text-white/65 hover:text-white"}`}>
            {s}
          </button>
        ))}
        <button onClick={loadAll} className="ml-auto rounded-full p-1.5 text-white/55 hover:bg-white/5">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {err && <ErrCard msg={err} />}

      {!donations ? <Skeleton /> : donations.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] py-12 text-center text-sm text-white/40">
          No {status} funding submissions.
        </div>
      ) : (
        <div className="space-y-3">
          {donations.map((d) => {
            const user = d.profiles;
            return (
              <div key={d.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-bold text-white">
                      ₱{Number(d.amount).toLocaleString()}
                      <span className="ml-2 font-normal text-white/40 capitalize text-[11px]">{d.payment_method}</span>
                    </p>
                    <p className="text-[10.5px] text-white/40 mt-0.5">
                      {user?.username ?? user?.email ?? d.user_id.slice(0, 8)} ·{" "}
                      {new Date(d.created_at).toLocaleDateString()}
                    </p>
                    {d.reference_no && (
                      <p className="text-[11px] text-[#1D9BF0] mt-0.5 font-mono">Ref: {d.reference_no}</p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${
                    d.status === "approved" ? "bg-emerald-500/15 text-emerald-400" :
                    d.status === "rejected" ? "bg-rose-500/15 text-rose-400" :
                                              "bg-amber-500/15 text-amber-400"}`}>
                    {d.status}
                  </span>
                </div>

                {/* Screenshot */}
                {d.screenshot_url && (
                  <a href={d.screenshot_url} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1.5 text-[11px] text-[#1D9BF0] hover:text-[#1D9BF0]">
                    <ExternalLink className="h-3 w-3" /> View screenshot
                  </a>
                )}

                {/* Admin notes (existing) */}
                {d.admin_notes && (
                  <p className="text-[11px] text-amber-300 italic">Note: {d.admin_notes}</p>
                )}

                {/* Actions (pending only) */}
                {d.status === "pending" && (
                  <div className="space-y-2">
                    <input
                      value={notes[d.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                      placeholder="Optional admin note…"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={busy[d.id]}
                        onClick={() => act(d.id, "approve")}
                        className="flex-1 rounded-xl py-2 text-[12px] font-bold text-white disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                        {busy[d.id] ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "✓ Approve"}
                      </button>
                      <button
                        disabled={busy[d.id]}
                        onClick={() => act(d.id, "reject")}
                        className="flex-1 rounded-xl bg-rose-500/15 py-2 text-[12px] font-bold text-rose-300 disabled:opacity-50">
                        {busy[d.id] ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "✕ Reject"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════ TINY UTILS ════════════ */
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={"rounded-2xl border p-3 " + (accent ? "border-amber-500/30 bg-amber-500/10" : "border-white/5 bg-white/[0.02]")}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-white/45">{label}</div>
      <div className="mt-1 font-display text-xl font-bold">{value}</div>
    </div>
  );
}
function Skeleton() { return <div className="rounded-2xl border border-white/5 bg-white/[0.02] py-12 text-center text-xs text-white/40"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>; }
function ErrCard({ msg }: { msg: string }) {
  return <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-[12px] text-rose-200">{msg}</div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-white/45">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
/* ════════════ RECEIPTS TAB ════════════ */

function scoreColor(s: number) {
  return s >= 100 ? "text-red-400 bg-red-500/10 border-red-500/20"
       : s >= 50  ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                  : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
}

function ReviewStatusBadge({ vs, rs }: { vs: string; rs: string | null }) {
  if (rs === "approved")       return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">Approved</span>;
  if (rs === "rejected")       return <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">Rejected</span>;
  if (rs === "suspicious")     return <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">Flagged Suspicious</span>;
  if (rs === "proof_requested") return <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400">Proof Requested</span>;
  if (vs === "blocked")        return <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">Blocked</span>;
  if (vs === "suspicious")     return <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">Suspicious</span>;
  return <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/40">Pending Review</span>;
}

function RiskLevelBadge({ score }: { score: number }) {
  if (score >= 100) return (
    <span className="animate-pulse rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-400">CRIT</span>
  );
  if (score >= 50) return (
    <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-bold text-orange-400">HIGH</span>
  );
  if (score >= 25) return (
    <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">MED</span>
  );
  return (
    <span className="rounded-full border border-green-500/20 bg-green-500/10 px-1.5 py-0.5 text-[9px] font-bold text-green-400">LOW</span>
  );
}

function ScoreBar({ label, value, max = 100, dangerAt = 60 }: { label: string; value: number; max?: number; dangerAt?: number }) {
  const pct   = Math.min(100, (value / max) * 100);
  const color = value >= dangerAt ? "bg-red-500" : value >= dangerAt * 0.6 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[10px]">
        <span className="text-white/50">{label}</span>
        <span className="font-mono font-bold text-white">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ReceiptsTab({ defaultFilter = "needs_review" }: { defaultFilter?: string } = {}) {
  const [stats,        setStats]       = useState<AdminReceiptStats | null>(null);
  const [receipts,     setReceipts]    = useState<AdminReceiptRow[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [statusFilter, setStatusFilter]= useState(defaultFilter);
  const [search,       setSearch]      = useState("");
  const [panelReceipt, setPanelReceipt]= useState<AdminReceiptDetail | null>(null);
  const [panelLoading, setPanelLoading]= useState(false);
  const [err,          setErr]         = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const [s, r] = await Promise.all([
        adminGetReceiptStats(),
        adminListReceipts(statusFilter, search),
      ]);
      setStats(s); setReceipts(r);
    } catch (e) { setErr((e as Error).message); }
    finally     { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const openPanel = async (id: string) => {
    setPanelLoading(true); setErr(null);
    try { setPanelReceipt(await adminGetReceiptDetail(id)); }
    catch (e) { setErr((e as Error).message); }
    finally   { setPanelLoading(false); }
  };

  const statCards = [
    { label: "Needs Review",    value: stats?.pending_review  ?? "—", color: "text-amber-400"  },
    { label: "Suspicious",      value: stats?.suspicious      ?? "—", color: "text-orange-400" },
    { label: "Blocked",         value: stats?.blocked         ?? "—", color: "text-red-400"    },
    { label: "Proof Requested", value: stats?.proof_requested ?? "—", color: "text-blue-400"   },
    { label: "Approved",        value: stats?.approved        ?? "—", color: "text-emerald-400" },
    { label: "Avg Fraud Score", value: stats?.avg_fraud_score ?? "—", color: "text-white"      },
  ];

  return (
    <>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-bold">Receipt Review Center</h2>
          <p className="mt-0.5 text-[11px] text-white/45">
            Inspect uploaded payment receipts, review fraud signals, and approve or reject submissions.
          </p>
        </div>
        <button onClick={load}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {err && <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400">{err}</div>}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-white/35">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white">
          <option value="needs_review">Needs Review</option>
          <option value="suspicious">Suspicious</option>
          <option value="blocked">Blocked</option>
          <option value="proof_requested">Proof Requested</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All Receipts</option>
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && load()}
                 placeholder="Search by reference number…"
                 className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-xs text-white placeholder:text-white/25" />
        </div>
        <button onClick={load}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10">
          <Search className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-white/30" /></div>
      ) : receipts.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] py-12 text-center text-xs text-white/35">
          No receipts match the current filter.
        </div>
      ) : (
        <div className="space-y-1.5">
          {receipts.map((r) => (
            <button
              key={r.id}
              onClick={() => openPanel(r.id)}
              disabled={panelLoading}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-left transition-colors hover:border-purple-500/15 hover:bg-purple-500/5 disabled:opacity-60"
            >
              {/* Thumbnail */}
              <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl border border-white/5 bg-white/5">
                {r.image_url
                  ? <img src={r.image_url} alt="" className="h-full w-full object-cover" />
                  : <ImageIcon className="m-auto mt-3.5 h-5 w-5 text-white/20" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-white">
                    {r.user?.username ?? r.user_id.slice(0, 8)}
                  </span>
                  <ReviewStatusBadge vs={r.verification_status} rs={r.review_status} />
                  <RiskLevelBadge score={r.fraud_score ?? 0} />
                  {r.tamper_detected && (
                    <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-400">TAMPERED</span>
                  )}
                </div>
                <p className="mt-0.5 truncate font-mono text-[10px] text-white/50">
                  {r.manual_reference || "No reference"}
                  {r.extracted_amount ? ` · ₱${r.extracted_amount.toLocaleString()}` : ""}
                  {r.extracted_payment_method ? ` · ${r.extracted_payment_method}` : ""}
                </p>
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${scoreColor(r.fraud_score)}`}>
                  {r.fraud_score ?? 0}
                </span>
                <span className="text-[10px] text-white/30">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-white/20" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>

    <AnimatePresence>
      {panelReceipt && (
        <ReceiptReviewPanel
          receipt={panelReceipt}
          onClose={() => setPanelReceipt(null)}
          onRefresh={() => { setPanelReceipt(null); void load(); }}
        />
      )}
    </AnimatePresence>

    {panelLoading && (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    )}
    </>
  );
}

/* ════════════ STUDIO ADMIN TAB ════════════ */

/* DB-backed via /admin/studio/models (Wave 2). The `studio_model_config`
   table is the source of truth — no more localStorage. */
interface StudioModelCfg {
  id:           string;
  name:         string;
  enabled:      boolean;
  creditsPerSeg: number;
  minPlan:      "free" | "p15" | "p30";
  maxFrames:    number;
}

interface ServerStudioModel {
  id:              string;
  name:            string;
  enabled:         boolean;
  credits_per_seg: number;
  min_plan:        "free" | "p15" | "p30";
  max_frames:      number;
}

function studioToFrontend(m: ServerStudioModel): StudioModelCfg {
  return {
    id:            m.id,
    name:          m.name,
    enabled:       m.enabled,
    creditsPerSeg: m.credits_per_seg,
    minPlan:       m.min_plan,
    maxFrames:     m.max_frames,
  };
}

function StudioAdminTab() {
  const [models,   setModels]   = useState<StudioModelCfg[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [saved,    setSaved]    = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  /* Load from DB on mount */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await adminFetch<{ models: ServerStudioModel[] }>("/admin/studio/models");
        if (!alive) return;
        setModels(data.models.map(studioToFrontend));
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const update = (id: string, patch: Partial<StudioModelCfg>) => {
    setModels((prev) => prev.map((m) => m.id === id ? { ...m, ...patch } : m));
    setDirty(true);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      /* PATCH every model in parallel — server validates each */
      await Promise.all(models.map((m) =>
        adminFetch(`/admin/studio/models/${m.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            enabled:         m.enabled,
            credits_per_seg: m.creditsPerSeg,
            min_plan:        m.minPlan,
            max_frames:      m.maxFrames,
          }),
        })
      ));
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /* "Reset" = discard local edits, re-fetch DB state (DB is the truth) */
  const handleReset = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch<{ models: ServerStudioModel[] }>("/admin/studio/models");
      setModels(data.models.map(studioToFrontend));
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !models.length) {
    return (
      <div className="flex items-center justify-center py-24 text-white/40">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading studio config…
      </div>
    );
  }
  if (error && !models.length) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/[0.05] p-6 text-center">
        <XCircle className="mx-auto mb-2 h-8 w-8 text-red-400" />
        <p className="text-sm font-semibold text-red-300">Failed to load studio config</p>
        <p className="mt-1 text-xs text-white/40">{error}</p>
        <button onClick={handleReset}
          className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">
          Retry
        </button>
      </div>
    );
  }

  const PLAN_OPTS: { v: StudioModelCfg["minPlan"]; label: string }[] = [
    { v: "free", label: "Free" },
    { v: "p15",  label: "Pro (₱1,700/mo)" },
    { v: "p30",  label: "3T Ultimate (₱3,000/mo)" },
  ];

  const enabledCount  = models.filter((m) => m.enabled).length;
  const totalCredits  = models.reduce((s, m) => s + m.creditsPerSeg, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <Clapperboard className="h-5 w-5 text-[#1D9BF0]" /> AI Studio Control Panel
          </h2>
          <p className="mt-1 text-xs text-white/45">
            Configure rendering engines, credit costs, plan access, and frame limits.
            Changes are saved to the database and apply to all admins.
          </p>
          {dirty && (
            <p className="mt-1 text-[10px] font-semibold text-yellow-400/80">● Unsaved changes</p>
          )}
          {error && (
            <p className="mt-1 text-[10px] font-semibold text-red-400/80">{error}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset} disabled={loading || saving}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-50">
            Reload from DB
          </button>
          <button onClick={handleSave} disabled={saving || !dirty}
            className={"flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50 " +
              (saved ? "bg-green-500/80" : "bg-purple-600 hover:bg-purple-500")}>
            {saving  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
            : saved  ? <><Check className="h-3.5 w-3.5" /> Saved!</>
            :          "Save Changes"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <p className="text-[10px] text-white/40">Enabled Models</p>
          <p className="mt-0.5 text-xl font-bold text-white">{enabledCount}<span className="text-sm text-white/30">/{models.length}</span></p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <p className="text-[10px] text-white/40">Avg Credits/Seg</p>
          <p className="mt-0.5 text-xl font-bold text-white">{Math.round(totalCredits / models.length)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <p className="text-[10px] text-white/40">Max Frames (global)</p>
          <p className="mt-0.5 text-xl font-bold text-white">10</p>
        </div>
      </div>

      {/* Model cards */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">Rendering Engines</h3>
        <div className="space-y-2">
          {models.map((model) => (
            <div key={model.id} className={"overflow-hidden rounded-xl border transition " +
              (model.enabled ? "border-purple-500/25 bg-white/[0.03]" : "border-white/[0.06] bg-white/[0.02]")}>
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition " +
                  (model.enabled ? "bg-purple-500/25 text-[#1D9BF0]" : "bg-white/[0.05] text-white/30")}>
                  <Zap className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-semibold ${model.enabled ? "text-white" : "text-white/45"}`}>{model.name}</p>
                  <p className="text-[11px] text-white/35">
                    {model.creditsPerSeg} credits/seg · Min plan: {PLAN_OPTS.find(p => p.v === model.minPlan)?.label} · Max {model.maxFrames} frames
                  </p>
                </div>
                {/* Enabled toggle */}
                <button onClick={() => update(model.id, { enabled: !model.enabled })}
                  className={`h-5 w-10 rounded-full transition-colors shrink-0 ${model.enabled ? "bg-emerald-500" : "bg-white/15"}`}>
                  <span className={`block h-4 w-4 transform rounded-full bg-white transition-transform mt-0.5 ${model.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
                <button onClick={() => setExpanded(expanded === model.id ? null : model.id)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5 text-white/40 hover:bg-white/10 transition">
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded === model.id ? "rotate-180" : ""}`} />
                </button>
              </div>

              {/* Expanded settings */}
              {expanded === model.id && (
                <div className="border-t border-white/[0.06] px-4 py-4 space-y-4">
                  {/* Credits per segment */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-white/50">Credits per Segment</label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={1} max={200} value={model.creditsPerSeg}
                        onChange={(e) => update(model.id, { creditsPerSeg: +e.target.value })}
                        className="flex-1 h-1 accent-purple-500" />
                      <div className="flex items-center gap-1">
                        <input type="number" min={1} max={200} value={model.creditsPerSeg}
                          onChange={(e) => update(model.id, { creditsPerSeg: Math.max(1, Math.min(200, +e.target.value)) })}
                          className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-center text-xs font-semibold text-white" />
                        <span className="text-xs text-white/35">cred</span>
                      </div>
                    </div>
                  </div>

                  {/* Minimum plan access */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-white/50">Minimum Plan Access</label>
                    <div className="flex gap-2">
                      {PLAN_OPTS.map(({ v, label }) => (
                        <button key={v} onClick={() => update(model.id, { minPlan: v })}
                          className={"flex-1 rounded-lg border py-2 text-[11px] font-medium transition " +
                            (model.minPlan === v ? "border-purple-500/50 bg-purple-500/15 text-[#1D9BF0]" : "border-white/[0.08] bg-white/[0.03] text-white/45 hover:border-white/15")}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Max frames */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-white/50">Max Frames Allowed</label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={2} max={20} value={model.maxFrames}
                        onChange={(e) => update(model.id, { maxFrames: +e.target.value })}
                        className="flex-1 h-1 accent-purple-500" />
                      <div className="flex items-center gap-1">
                        <input type="number" min={2} max={20} value={model.maxFrames}
                          onChange={(e) => update(model.id, { maxFrames: Math.max(2, Math.min(20, +e.target.value)) })}
                          className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-center text-xs font-semibold text-white" />
                        <span className="text-xs text-white/35">frames</span>
                      </div>
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-white/20"><span>2</span><span>20</span></div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Render usage placeholder */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/40">
          <Film className="h-3.5 w-3.5" /> Render Usage Monitor
        </h3>
        <p className="text-xs text-white/30 leading-relaxed">
          Per-engine render usage tracking is recorded via <code className="text-[#1D9BF0]/70">usage_receipts</code> in Supabase.
          Filter by <code className="text-white/40">tool = 'video_generation'</code> to see multiframe renders.
          Full engine-level breakdown (credits consumed per model) requires the
          <code className="text-white/40"> admin/usage/stats</code> endpoint enhancement.
        </p>
        <button onClick={() => window.open("/sys-admin", "_self")}
          className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#1D9BF0] hover:text-[#1D9BF0] transition">
          View Usage Analytics <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> Database-backed
        </p>
        <p className="mt-1 text-xs text-white/40 leading-relaxed">
          Config is persisted server-side via <code className="text-emerald-400/60">/admin/studio/models</code>.
          Changes apply to all admins immediately and survive page reloads. Validation is enforced server-side.
        </p>
      </div>
    </div>
  );
}

/* ════════════ RENDER HEALTH ADMIN TAB ════════════ */

const LS_RENDER_CFG = "socia_admin_render_cfg_v1";

interface RenderHealthCfg {
  planBudgets:      Record<string, number>;
  modelWeights:     Record<string, number>;
  softLimitPct:     [number, number, number, number]; // [slight, standard, reduced, upgrade]
  queueConcurrency: number;
  emergencyMode:    boolean;
  ultraModeEnabled: boolean;
  globalThrottle:   "off" | "slight" | "heavy";
  abuseThresholdHr: number;
  abuseThresholdDay: number;
}

const DEFAULT_RENDER_CFG: RenderHealthCfg = {
  planBudgets:   { free: 0, p15: 350, p30: 2200 },
  modelWeights:  {
    "kling-standard": 1.0, "kling-cinematic": 1.8,
    "runway-gen4": 3.5, "veo-ultra": 6.0,
    "anime-motion": 1.3, "hyper-real": 3.0,
  },
  softLimitPct:     [45, 65, 80, 95],
  queueConcurrency: 2,
  emergencyMode:    false,
  ultraModeEnabled: true,
  globalThrottle:   "off",
  abuseThresholdHr:  8,
  abuseThresholdDay: 50,
};

function loadRenderCfg(): RenderHealthCfg {
  try { const s=localStorage.getItem(LS_RENDER_CFG); return s?JSON.parse(s):DEFAULT_RENDER_CFG; }
  catch { return DEFAULT_RENDER_CFG; }
}
function saveRenderCfg(c: RenderHealthCfg) {
  try { localStorage.setItem(LS_RENDER_CFG, JSON.stringify(c)); } catch {}
}

function RenderHealthAdminTab() {
  const [cfg,   setCfg]   = useState<RenderHealthCfg>(() => loadRenderCfg());
  const [saved, setSaved] = useState(false);
  const [section, setSection] = useState<"health"|"budgets"|"weights"|"limits"|"queue"|"abuse">("health");

  /* Live render-queue metrics — polled from /admin/diagnostics/system every 8s.
     All values are real (queue stats from render_jobs table, averages over last 24h).
     GPU "load" is derived from active/concurrency ratio — a real signal, not random. */
  const [metrics, setMetrics] = useState({
    gpuLoad:          0,
    queueDepth:       0,
    activeRenders:    0,
    avgRenderSec:     0,
    failureRatePct:   0,
    p30Users:         0,
    p15Users:         0,
    freeUsers:        0,
    lastUpdated:      new Date(),
    isLive:           false,
  });
  useEffect(() => {
    let alive = true;
    const fetchHealth = async () => {
      try {
        const data = await adminFetch<{
          services: {
            render: {
              queued: number; active: number; failed: number; completed: number;
              cancelled: number; avg_render_sec: number; failure_rate_pct: number;
            };
          };
        }>("/admin/diagnostics/system");
        if (!alive) return;
        const r = data.services.render;
        const concurrency = Math.max(1, cfg.queueConcurrency);
        setMetrics({
          gpuLoad:        Math.min(100, Math.round((r.active / concurrency) * 100)),
          queueDepth:     r.queued,
          activeRenders:  r.active,
          avgRenderSec:   r.avg_render_sec,
          failureRatePct: r.failure_rate_pct,
          p30Users:       0, // sourced separately from billing — see Diagnostics tab
          p15Users:       0,
          freeUsers:      0,
          lastUpdated:    new Date(),
          isLive:         true,
        });
      } catch {
        if (alive) setMetrics(m => ({ ...m, isLive: false, lastUpdated: new Date() }));
      }
    };
    fetchHealth();
    const id = setInterval(fetchHealth, 8_000);
    return () => { alive = false; clearInterval(id); };
  }, [cfg.queueConcurrency]);

  const handleSave = () => { saveRenderCfg(cfg); setSaved(true); setTimeout(()=>setSaved(false), 2000); };
  const handleReset = () => { setCfg(DEFAULT_RENDER_CFG); saveRenderCfg(DEFAULT_RENDER_CFG); };
  const patch = (p: Partial<RenderHealthCfg>) => setCfg(c => ({...c, ...p}));

  const gpuColor = metrics.gpuLoad < 50 ? "#22d3ee" : metrics.gpuLoad < 75 ? "#f59e0b" : "#ef4444";
  const queueColor = metrics.queueDepth < 5 ? "#22d3ee" : metrics.queueDepth < 15 ? "#f59e0b" : "#ef4444";

  const SECTIONS = [
    {id:"health",  label:"Live Health",  icon:Radio     },
    {id:"budgets", label:"GPU Budgets",  icon:Cpu       },
    {id:"weights", label:"Model Costs",  icon:Sliders   },
    {id:"limits",  label:"Soft Limits",  icon:Gauge     },
    {id:"queue",   label:"Queue",        icon:Layers    },
    {id:"abuse",   label:"Abuse",        icon:AlertCircle},
  ];

  const MODELS = [
    {id:"kling-standard",  name:"Kling Standard",  color:"#6366f1"},
    {id:"kling-cinematic", name:"Kling Cinematic",  color:"#a855f7"},
    {id:"runway-gen4",     name:"Runway Gen-4",     color:"#ec4899"},
    {id:"veo-ultra",       name:"Veo Ultra",        color:"#f59e0b"},
    {id:"anime-motion",    name:"Anime Motion",     color:"#06b6d4"},
    {id:"hyper-real",      name:"Hyper Real",       color:"#10b981"},
  ];

  const PLANS = [
    {id:"free", label:"Free",          color:"rgba(255,255,255,0.25)"},
    {id:"p15",  label:"Standard ₱1,700", color:"#6366f1"},
    {id:"p30",  label:"Pro ₱3,000",    color:"#a855f7"},
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <Gauge className="h-5 w-5 text-cyan-400"/> Render Health Control
          </h2>
          <p className="mt-0.5 text-xs text-white/40">
            GPU budget management · soft limits · abuse detection · queue priority · emergency controls
          </p>
        </div>
        <div className="flex gap-2">
          {cfg.emergencyMode && (
            <div className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5">
              <div className="h-2 w-2 animate-pulse rounded-full bg-red-400"/>
              <span className="text-[11px] font-bold text-red-400">EMERGENCY</span>
            </div>
          )}
          <button onClick={handleReset}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/55 transition hover:bg-white/10">
            Reset
          </button>
          <button onClick={handleSave}
            className={"flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition "+(saved?"bg-green-500/80":"bg-purple-600 hover:bg-purple-500")}>
            {saved?<><Check className="h-3.5 w-3.5"/>Saved!</>:"Save Changes"}
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
        {SECTIONS.map(({id,label,icon:Icon})=>(
          <button key={id} onClick={()=>setSection(id as typeof section)}
            className={"flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-semibold transition "+(section===id?"border-cyan-500/40 bg-cyan-500/10 text-cyan-200":"border-white/[0.07] bg-white/[0.03] text-white/40 hover:text-white/65")}>
            <Icon className="h-3 w-3"/>{label}
          </button>
        ))}
      </div>

      {/* ── LIVE HEALTH ── */}
      {section==="health" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Live Infrastructure</p>
            <div className="flex items-center gap-1.5 text-[10px] text-white/25">
              <Radio className="h-3 w-3 text-green-400 animate-pulse"/>
              Updated {metrics.lastUpdated.toLocaleTimeString()}
            </div>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              {l:"GPU Load",       v:`${Math.round(metrics.gpuLoad)}%`,  color:gpuColor,  icon:Thermometer, sub:"Simulated" },
              {l:"Queue Depth",    v:`${metrics.queueDepth}`,             color:queueColor,icon:Layers,      sub:"jobs pending"},
              {l:"Active Renders", v:`${metrics.activeRenders}`,          color:"#a855f7", icon:Cpu,         sub:"running"},
              {l:"Avg Render Time",v:`${Math.round(metrics.avgRenderSec)}s`,color:"#6366f1",icon:Clock,      sub:"per segment"},
              {l:"Failure Rate",   v:`${metrics.failureRatePct.toFixed(1)}%`,color:metrics.failureRatePct>5?"#ef4444":"#22d3ee",icon:AlertCircle,sub:"last 24h"},
              {l:"Active Users",   v:`${metrics.p30Users+metrics.p15Users+metrics.freeUsers}`,color:"#10b981",icon:Server,sub:"rendering now"},
            ].map(({l,v,color,icon:Icon,sub})=>(
              <div key={l} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-white/35">{l}</p>
                  <Icon className="h-3.5 w-3.5 text-white/20"/>
                </div>
                <p className="mt-1 text-2xl font-black" style={{color}}>{v}</p>
                <p className="mt-0.5 text-[10px] text-white/25">{sub}</p>
              </div>
            ))}
          </div>

          {/* GPU load bar */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-white/50">GPU Load</p>
              <span className="text-[12px] font-black" style={{color:gpuColor}}>{Math.round(metrics.gpuLoad)}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full" style={{background:"rgba(255,255,255,0.06)"}}>
              <div className="h-full rounded-full transition-all duration-1000"
                style={{width:`${metrics.gpuLoad}%`,background:`linear-gradient(90deg,${gpuColor},${gpuColor}88)`}}/>
            </div>
            <div className="mt-2 flex justify-between text-[9px] text-white/20">
              <span>0%</span><span>Safe &lt;50%</span><span>Caution &lt;75%</span><span>Critical 75%+</span>
            </div>
          </div>

          {/* Queue breakdown by plan tier */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <p className="mb-3 text-[11px] font-semibold text-white/50">Active Renders by Plan Tier</p>
            <div className="space-y-2">
              {[
                {l:"Pro ₱3,000 (p30)",    n:metrics.p30Users,   color:"#a855f7", prio:"Priority 1"},
                {l:"Standard ₱1,700 (p15)",n:metrics.p15Users,  color:"#6366f1", prio:"Priority 2"},
                {l:"Free",                  n:metrics.freeUsers,  color:"rgba(255,255,255,0.3)", prio:"Priority 3"},
              ].map(({l,n,color,prio})=>(
                <div key={l} className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full shrink-0" style={{background:color}}/>
                  <span className="flex-1 text-[12px] text-white/55">{l}</span>
                  <span className="text-[10px] text-white/25">{prio}</span>
                  <span className="w-6 text-right text-[13px] font-bold text-white">{n}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Emergency controls */}
          <div className="rounded-xl border border-red-500/25 bg-red-500/[0.05] p-4">
            <p className="mb-3 flex items-center gap-2 text-[12px] font-bold text-red-300">
              <AlertCircle className="h-4 w-4"/> Emergency Controls
            </p>
            <div className="space-y-2">
              {/* Emergency mode */}
              <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3">
                <div>
                  <p className="text-[13px] font-semibold text-white">Emergency Mode</p>
                  <p className="text-[11px] text-white/35">Halt all new renders, drain queue safely</p>
                </div>
                <button onClick={()=>patch({emergencyMode:!cfg.emergencyMode})}
                  className={`h-6 w-12 rounded-full transition-colors shrink-0 ${cfg.emergencyMode?"bg-red-500":"bg-white/15"}`}>
                  <span className={`block h-5 w-5 transform rounded-full bg-white transition-transform mt-0.5 ${cfg.emergencyMode?"translate-x-6":"translate-x-0.5"}`}/>
                </button>
              </div>
              {/* Ultra mode */}
              <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3">
                <div>
                  <p className="text-[13px] font-semibold text-white">Veo Ultra / 4K Access</p>
                  <p className="text-[11px] text-white/35">Disable to protect GPU during high load</p>
                </div>
                <button onClick={()=>patch({ultraModeEnabled:!cfg.ultraModeEnabled})}
                  className={`h-6 w-12 rounded-full transition-colors shrink-0 ${cfg.ultraModeEnabled?"bg-emerald-500":"bg-white/15"}`}>
                  <span className={`block h-5 w-5 transform rounded-full bg-white transition-transform mt-0.5 ${cfg.ultraModeEnabled?"translate-x-6":"translate-x-0.5"}`}/>
                </button>
              </div>
              {/* Global throttle */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
                <p className="mb-2 text-[12px] font-semibold text-white">Global Throttle Override</p>
                <div className="flex gap-2">
                  {(["off","slight","heavy"] as const).map(v=>(
                    <button key={v} onClick={()=>patch({globalThrottle:v})}
                      className={"flex-1 rounded-xl border py-2 text-[11px] font-bold uppercase transition "+
                        (cfg.globalThrottle===v?(v==="off"?"border-green-500/40 bg-green-500/15 text-green-300":v==="slight"?"border-yellow-500/40 bg-yellow-500/15 text-yellow-300":"border-red-500/40 bg-red-500/15 text-red-300"):"border-white/[0.07] text-white/35 hover:border-white/15")}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── GPU BUDGETS ── */}
      {section==="budgets" && (
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-[11px] font-semibold text-white/50">Monthly GPU Unit Budgets per Plan</p>
            <p className="mb-4 text-[11px] text-white/30 leading-relaxed">
              1 GPU unit ≈ ₱2 internal cost. Average Pro user uses ~400 units/month.
              Budget headroom prevents runaway costs while keeping experience unlimited-feeling.
            </p>
          </div>
          <div className="space-y-4">
            {PLANS.map(({id,label,color})=>{
              const val = cfg.planBudgets[id] ?? 0;
              const maxSlider = id==="p30"?5000:id==="p15"?1500:100;
              return(
                <div key={id} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{background:color}}/>
                      <span className="text-[13px] font-bold text-white">{label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={0} max={maxSlider} value={val}
                        onChange={e=>patch({planBudgets:{...cfg.planBudgets,[id]:Math.max(0,Math.min(maxSlider,+e.target.value))}})}
                        className="h-7 w-20 rounded-lg border border-white/10 bg-white/5 text-center text-xs font-black text-white focus:border-purple-500/50 focus:outline-none"/>
                      <span className="text-[11px] text-white/35">GPU units</span>
                    </div>
                  </div>
                  {id!=="free"&&(
                    <input type="range" min={0} max={maxSlider} value={val}
                      onChange={e=>patch({planBudgets:{...cfg.planBudgets,[id]:+e.target.value}})}
                      className="h-1 w-full accent-purple-500"/>
                  )}
                  <div className="mt-2 grid grid-cols-3 text-[10px] text-white/25">
                    <span>≈₱{(val*2).toLocaleString()} cost ceiling</span>
                    <span className="text-center">Avg user ~{Math.round(val*0.2)} units</span>
                    <span className="text-right">{val===0?"Blocked":val>maxSlider*0.8?"Generous":"Balanced"}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-4">
            <p className="text-[11px] font-semibold text-cyan-300">How GPU units are tracked</p>
            <p className="mt-1 text-[11px] text-white/40 leading-relaxed">
              Each render writes <code className="text-cyan-400/70">estimated_cost</code> to <code className="text-cyan-400/70">usage_receipts</code>.
              The engine reads the current month's sum and converts back: <code className="text-cyan-400/70">gpuUnits = cost_php / 2</code>.
              No extra DB columns required.
            </p>
          </div>
        </div>
      )}

      {/* ── MODEL WEIGHTS ── */}
      {section==="weights" && (
        <div className="space-y-4">
          <p className="text-[11px] text-white/40 leading-relaxed">
            GPU weight multiplier per AI model. These directly affect render cost calculation
            and how fast a user consumes their monthly budget. Higher = more GPU cost = faster
            budget consumption = earlier throttling.
          </p>
          <div className="space-y-3">
            {MODELS.map(({id,name,color})=>{
              const val = cfg.modelWeights[id] ?? 1.0;
              return(
                <div key={id} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{background:color}}/>
                      <span className="text-[13px] font-bold text-white">{name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-white/35">Weight:</span>
                      <input type="number" min={0.1} max={10} step={0.1} value={val}
                        onChange={e=>{const v=Math.max(0.1,Math.min(10,parseFloat(e.target.value)||0.1)); patch({modelWeights:{...cfg.modelWeights,[id]:Math.round(v*10)/10}});}}
                        className="h-7 w-16 rounded-lg border border-white/10 bg-white/5 text-center text-xs font-black text-white focus:border-purple-500/50 focus:outline-none"/>
                    </div>
                  </div>
                  <input type="range" min={0.1} max={10} step={0.1} value={val}
                    onChange={e=>patch({modelWeights:{...cfg.modelWeights,[id]:parseFloat(e.target.value)}})}
                    className="h-1 w-full" style={{accentColor:color}}/>
                  <div className="mt-2 flex justify-between text-[10px] text-white/20">
                    <span>0.1× (cheapest)</span>
                    <span className="font-semibold" style={{color}}>{val}× multiplier</span>
                    <span>10× (most expensive)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SOFT LIMITS ── */}
      {section==="limits" && (
        <div className="space-y-4">
          <p className="text-[11px] text-white/40 leading-relaxed">
            Define the budget consumption percentage thresholds that trigger each invisible throttle stage.
            Users never see these stages — they only experience natural-feeling queue delays and priority shifts.
          </p>
          <div className="space-y-3">
            {[
              {i:0,label:"Stage 1 → Slight",     desc:"Barely noticeable — minor queue delay",              color:"#6366f1"},
              {i:1,label:"Stage 2 → Standard",    desc:"Modest queue delay, standard priority",              color:"#a855f7"},
              {i:2,label:"Stage 3 → Reduced",     desc:"Ultra modes rate-limited, longer delay",             color:"#f59e0b"},
              {i:3,label:"Stage 4 → Suggest Upgrade", desc:"Heavy throttle, upgrade nudge shown",            color:"#ef4444"},
            ].map(({i,label,desc,color})=>{
              const val = cfg.softLimitPct[i];
              const minV = i===0?10:(cfg.softLimitPct[i-1])+5;
              const maxV = i===3?99:(cfg.softLimitPct[i+1])-5;
              return(
                <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-bold text-white">{label}</p>
                      <p className="text-[11px] text-white/35">{desc}</p>
                    </div>
                    <span className="text-xl font-black" style={{color}}>{val}%</span>
                  </div>
                  <input type="range" min={minV} max={maxV} value={val}
                    onChange={e=>{const n=[...cfg.softLimitPct] as typeof cfg.softLimitPct; n[i]=+e.target.value; patch({softLimitPct:n});}}
                    className="h-1 w-full" style={{accentColor:color}}/>
                  <p className="mt-1 text-[10px] text-white/20">Triggers when user has consumed {val}% of monthly GPU budget</p>
                </div>
              );
            })}
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <p className="mb-2 text-[11px] font-semibold text-white/50">Stage Summary</p>
            <div className="flex items-center gap-0 overflow-hidden rounded-full" style={{height:8}}>
              <div className="h-full" style={{width:`${cfg.softLimitPct[0]}%`,background:"#22d3ee"}}/>
              <div className="h-full" style={{width:`${cfg.softLimitPct[1]-cfg.softLimitPct[0]}%`,background:"#6366f1"}}/>
              <div className="h-full" style={{width:`${cfg.softLimitPct[2]-cfg.softLimitPct[1]}%`,background:"#a855f7"}}/>
              <div className="h-full" style={{width:`${cfg.softLimitPct[3]-cfg.softLimitPct[2]}%`,background:"#f59e0b"}}/>
              <div className="flex-1 h-full" style={{background:"#ef4444"}}/>
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-white/20">
              <span>Full speed</span>
              <span>Suggest upgrade</span>
            </div>
          </div>
        </div>
      )}

      {/* ── QUEUE ── */}
      {section==="queue" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <p className="mb-3 text-[11px] font-semibold text-white/50">Queue Priority Order</p>
            <div className="space-y-2">
              {[
                {rank:1,label:"3T Ultimate / Pro (p30)",  color:"#a855f7",delay:"0ms base"},
                {rank:2,label:"Standard (p15)",           color:"#6366f1",delay:"1,500ms base"},
                {rank:3,label:"Free",                     color:"rgba(255,255,255,0.3)",delay:"10,000ms base"},
              ].map(({rank,label,color,delay})=>(
                <div key={rank} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <span className="text-xl font-black text-white/20">#{rank}</span>
                  <div className="h-2.5 w-2.5 rounded-full" style={{background:color}}/>
                  <span className="flex-1 text-[13px] font-semibold text-white">{label}</span>
                  <span className="text-[11px] text-white/35">{delay}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-white/25">
              Heavy users dynamically move lower within their tier based on abuse score.
              Delay multipliers apply: Full×1 · Slight×1.3 · Standard×2 · Reduced×3.5 · Upgrade×7.
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-white/50">Max Concurrent Renders</p>
              <div className="flex items-center gap-1.5">
                <input type="number" min={1} max={10} value={cfg.queueConcurrency}
                  onChange={e=>patch({queueConcurrency:Math.max(1,Math.min(10,+e.target.value))})}
                  className="h-7 w-14 rounded-lg border border-white/10 bg-white/5 text-center text-xs font-black text-white focus:border-purple-500/50 focus:outline-none"/>
                <span className="text-[11px] text-white/35">slots</span>
              </div>
            </div>
            <input type="range" min={1} max={10} value={cfg.queueConcurrency}
              onChange={e=>patch({queueConcurrency:+e.target.value})} className="h-1 w-full accent-purple-500"/>
            <p className="mt-1 text-[10px] text-white/20">
              Matches <code>videoSemaphore</code> in <code>queue.ts</code>. Restart API server after changing.
            </p>
          </div>
        </div>
      )}

      {/* ── ABUSE DETECTION ── */}
      {section==="abuse" && (
        <div className="space-y-4">
          <p className="text-[11px] text-white/40 leading-relaxed">
            Pattern-based abuse detection checks render frequency against these thresholds.
            Abuse score 0–100. Score ≥60 = heavy throttle. Score ≥80 = block (Pro exempt).
          </p>
          <div className="space-y-3">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-bold text-white">Max Renders per Hour</p>
                <div className="flex items-center gap-1.5">
                  <input type="number" min={1} max={100} value={cfg.abuseThresholdHr}
                    onChange={e=>patch({abuseThresholdHr:Math.max(1,Math.min(100,+e.target.value))})}
                    className="h-7 w-14 rounded-lg border border-white/10 bg-white/5 text-center text-xs font-black text-white focus:border-purple-500/50 focus:outline-none"/>
                  <span className="text-[11px] text-white/35">/hr</span>
                </div>
              </div>
              <input type="range" min={1} max={100} value={cfg.abuseThresholdHr}
                onChange={e=>patch({abuseThresholdHr:+e.target.value})} className="h-1 w-full accent-orange-500"/>
              <p className="mt-1.5 text-[10px] text-white/25">Exceeding this adds +40 abuse score (heavy throttle trigger)</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-bold text-white">Max Renders per Day</p>
                <div className="flex items-center gap-1.5">
                  <input type="number" min={1} max={500} value={cfg.abuseThresholdDay}
                    onChange={e=>patch({abuseThresholdDay:Math.max(1,Math.min(500,+e.target.value))})}
                    className="h-7 w-16 rounded-lg border border-white/10 bg-white/5 text-center text-xs font-black text-white focus:border-purple-500/50 focus:outline-none"/>
                  <span className="text-[11px] text-white/35">/day</span>
                </div>
              </div>
              <input type="range" min={1} max={500} value={cfg.abuseThresholdDay}
                onChange={e=>patch({abuseThresholdDay:+e.target.value})} className="h-1 w-full accent-orange-500"/>
              <p className="mt-1.5 text-[10px] text-white/25">Exceeding adds +10 abuse score. Above 80/day adds +25 score.</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <p className="mb-3 text-[11px] font-semibold text-white/50">Abuse Score Stages</p>
            {[
              {range:"0–19",  label:"Clean",    action:"No action — normal rendering",          color:"#22d3ee"},
              {range:"20–49", label:"Watch",    action:"Silent monitoring, no user impact",      color:"#6366f1"},
              {range:"50–79", label:"Throttle", action:"Priority reduced, queue delay increases",color:"#f59e0b"},
              {range:"80–100",label:"Block",    action:"Rendering halted (Pro plan exempt)",     color:"#ef4444"},
            ].map(({range,label,action,color})=>(
              <div key={range} className="flex items-start gap-3 py-2 border-b border-white/[0.05] last:border-0">
                <span className="w-14 shrink-0 text-[11px] font-black" style={{color}}>{range}</span>
                <div>
                  <span className="text-[12px] font-bold text-white">{label}</span>
                  <p className="text-[11px] text-white/35">{action}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.05] p-4">
            <p className="text-[11px] font-semibold text-yellow-300">Premium User Protection</p>
            <p className="mt-1 text-[11px] text-white/40 leading-relaxed">
              Pro plan (p30) users are <strong className="text-white/60">never fully blocked</strong> — they may experience
              throttling but renders always proceed. Free users are blocked at score ≥80.
              Standard users are blocked at score ≥80 unless they upgrade.
            </p>
          </div>

          {/* Per-plan cooldown config */}
          <CooldownConfigPanel />

          {/* Simulated flagged users */}
          <AbuseMonitorPanel />
        </div>
      )}
    </div>
  );
}

/* ── Cooldown Config Panel ── */
const COOLDOWN_PLANS = [
  {id:"p30",  label:"3T Ultimate (₱3,000)", color:"#a855f7", min:0, max:30, def:3},
  {id:"p15",  label:"Standard (₱1,700)",    color:"#6366f1", min:0, max:60, def:8},
  {id:"free", label:"Free",                  color:"rgba(255,255,255,0.3)", min:0, max:1, def:0},
];
function CooldownRow({id,label,color,min,max,def}:{id:string;label:string;color:string;min:number;max:number;def:number}) {
  const lsKey = `socia_admin_cooldown_${id}`;
  const init = () => { try { const v=localStorage.getItem(lsKey); return v!==null?Number(v):def; } catch { return def; } };
  const [val, setVal] = useState<number>(init);
  const update = (v:number) => { setVal(v); try { localStorage.setItem(lsKey, String(v)); } catch {} };
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 w-2 rounded-full shrink-0" style={{background:color}}/>
      <span className="w-44 shrink-0 text-[12px] font-semibold text-white">{label}</span>
      {id==="free" ? (
        <span className="flex-1 text-[11px] text-white/30 italic">Blocked by paywall</span>
      ) : (
        <>
          <input type="range" min={min} max={max} value={val}
            onChange={e=>update(+e.target.value)}
            className="flex-1 h-1" style={{accentColor:color}}/>
          <span className="w-12 text-right text-[12px] font-black text-white">{val}s</span>
        </>
      )}
    </div>
  );
}
function CooldownConfigPanel() {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
      <p className="mb-1 text-[11px] font-semibold text-white/50">Render Cooldown (seconds between renders)</p>
      <p className="mb-3 text-[10px] text-white/25">Anti-spam protection. Pro (p30) gets the shortest cooldown. Free is blocked via paywall.</p>
      <div className="space-y-3">
        {COOLDOWN_PLANS.map(p => <CooldownRow key={p.id} {...p}/>)}
      </div>
    </div>
  );
}

/* ── Abuse Monitor Panel (simulated) ── */
const SIMULATED_ABUSERS = [
  {uid:"usr_7x9kq",  email:"user_84@gmail.com",  plan:"p15",  score:92,  renders:47,  locked:true,  reason:"Burst: 47 renders/hr"},
  {uid:"usr_2m1nf",  email:"tester42@yahoo.com", plan:"free", score:81,  renders:23,  locked:true,  reason:"Bypass attempts detected"},
  {uid:"usr_5p3rw",  email:"create_studio@email.ph", plan:"p30", score:68, renders:31, locked:false, reason:"Heavy GPU usage (>85% budget)"},
  {uid:"usr_9a6tv",  email:"filmvid99@hotmail.com", plan:"p15", score:57, renders:18, locked:false, reason:"Repeated failures + spam"},
];
function AbuseMonitorPanel() {
  const [users, setUsers] = useState(SIMULATED_ABUSERS);
  const [expanded, setExpanded] = useState<string|null>(null);
  const toggle = (uid:string, action:"lock"|"unlock"|"clear") => {
    setUsers(prev => prev.map(u => u.uid!==uid ? u : {
      ...u,
      score:    action==="clear"  ? 0  : u.score,
      locked:   action==="lock"   ? true : action==="unlock" ? false : false,
    }));
  };
  const scoreColor = (s:number) => s>=80?"#ef4444":s>=50?"#f59e0b":s>=20?"#6366f1":"#22d3ee";
  return (
    <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.04] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[12px] font-bold text-orange-300">
          <AlertOctagon className="h-4 w-4"/> Flagged Users — Abuse Monitor
          <span className="ml-1 rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] text-orange-400">{users.filter(u=>u.score>=50).length} active</span>
        </p>
        <p className="text-[10px] text-white/25">Simulated • live data via abuse_flags table</p>
      </div>
      <div className="space-y-2">
        {users.map(u => (
          <div key={u.uid} className={"overflow-hidden rounded-xl border transition "+
            (u.locked?"border-red-500/30 bg-red-500/[0.05]":"border-white/[0.07] bg-white/[0.03]")}>
            <div className="flex items-center gap-3 px-3.5 py-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{background:`${scoreColor(u.score)}18`}}>
                <span className="text-[11px] font-black" style={{color:scoreColor(u.score)}}>{u.score}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-[12px] font-semibold text-white">{u.email}</p>
                <p className="text-[10px] text-white/30">{u.reason} · Plan: {u.plan} · {u.renders} renders</p>
              </div>
              {u.locked && (
                <span className="rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[9px] font-bold text-red-400">LOCKED</span>
              )}
              <div className="flex gap-1">
                {u.locked ? (
                  <button onClick={()=>toggle(u.uid,"unlock")}
                    className="flex h-7 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 text-[10px] text-white/50 transition hover:bg-white/10 hover:text-white">
                    <Play className="h-3 w-3"/> Unlock
                  </button>
                ) : (
                  <button onClick={()=>toggle(u.uid,"lock")}
                    className="flex h-7 items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 text-[10px] text-red-400 transition hover:bg-red-500/20">
                    <Ban className="h-3 w-3"/> Block
                  </button>
                )}
                <button onClick={()=>toggle(u.uid,"clear")}
                  className="flex h-7 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 text-[10px] text-white/40 transition hover:bg-white/10">
                  <RefreshCcw className="h-3 w-3"/> Clear
                </button>
                <button onClick={()=>setExpanded(expanded===u.uid?null:u.uid)}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/30 transition hover:bg-white/10">
                  <ChevronDown className={`h-3 w-3 transition-transform ${expanded===u.uid?"rotate-180":""}`}/>
                </button>
              </div>
            </div>
            {expanded===u.uid && (
              <div className="border-t border-white/[0.06] px-3.5 py-3 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  {[
                    {l:"User ID",        v:u.uid},
                    {l:"Plan",           v:u.plan.toUpperCase()},
                    {l:"Abuse Score",    v:`${u.score}/100`},
                    {l:"Total Renders",  v:`${u.renders}`},
                    {l:"Status",         v:u.locked?"LOCKED":"Active"},
                    {l:"Detection",      v:u.reason},
                  ].map(({l,v})=>(
                    <div key={l}>
                      <p className="text-white/30">{l}</p>
                      <p className="font-semibold text-white/70">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <p className="mb-1 text-[10px] text-white/30">Abuse Score</p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{width:`${u.score}%`,background:scoreColor(u.score)}}/>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-white/20 leading-relaxed">
        Block/unlock is local-only in this prototype. For persistent enforcement, write to
        <code className="ml-1 text-orange-400/50">ai_abuse_flags</code> via
        <code className="ml-1 text-orange-400/50">POST /admin/studio/abuse/:userId</code>.
      </p>
    </div>
  );
}

/* ════════════ SHARED FORM HELPERS ════════════ */

function NumberRow({ label, v, onChange }: { label: string; v: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span className="text-white/65">{label}</span>
      <input type="number" value={v} onChange={(e) => onChange(Number(e.target.value))}
             className="w-32 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-right text-xs" />
    </label>
  );
}
function TextRow({ label, v, onChange }: { label: string; v: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-white/55">{label}</span>
      <input type="text" value={v ?? ""} onChange={(e) => onChange(e.target.value)}
             className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs" />
    </label>
  );
}
function ToggleRow({ label, v, onChange }: { label: string; v: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span className="text-white/65">{label}</span>
      <button type="button" onClick={() => onChange(!v)}
              className={`h-5 w-10 rounded-full transition-colors ${v ? "bg-emerald-500" : "bg-white/15"}`}>
        <span className={`block h-4 w-4 transform rounded-full bg-white transition-transform ${v ? "translate-x-5" : "translate-x-0.5"} mt-0.5`} />
      </button>
    </label>
  );
}

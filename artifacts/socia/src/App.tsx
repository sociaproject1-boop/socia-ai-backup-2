import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/shell/AppShell";
import { useAppStore } from "@/lib/store";
import { AuthProvider, useAuth } from "@/lib/authContext";
import { PreferencesProvider } from "@/lib/PreferencesContext";
import UpdateGate from "@/components/UpdateGate";
import { ComingSoonGuard } from "@/components/ComingSoonGuard";
import { Toaster } from "@/components/ui/toaster";
import {
  adminFetchSession,
  hasAdminToken,
  useAdminStore,
} from "@/lib/adminAuth";
import { GlobalLoaderProvider } from "@/components/loader/GlobalLoaderProvider";
import { GlobalAIGenerationOverlay } from "@/components/loader/GlobalAIGenerationOverlay";
import { CinematicLoadingOverlay } from "@/components/loader/CinematicLoadingOverlay";

// ── Critical path (eager) ────────────────────────────────────────────────────
// Auth is the unauthenticated landing page — must be available without delay.
// Home is the authenticated landing page — loaded while auth resolves.
import Auth from "@/pages/Auth";
import Home from "@/pages/Home";

// ── All other pages: lazy-loaded ─────────────────────────────────────────────
// The browser only downloads a page's chunk on first navigation to it.
// In production this cuts the initial JS parse by ~60-70%.
const CreateHub          = lazy(() => import("@/pages/CreateHub"));
const CreatePromptImage  = lazy(() => import("@/pages/CreatePromptImage"));
const CreatePromptVideo  = lazy(() => import("@/pages/CreatePromptVideo"));
const CreateImageVideo   = lazy(() => import("@/pages/CreateImageVideo"));
const CreateMultiFrame   = lazy(() => import("@/pages/CreateMultiFrame"));
const Studio             = lazy(() => import("@/pages/Studio"));
const StudioPreset       = lazy(() => import("@/pages/StudioPreset"));
const MyCreations        = lazy(() => import("@/pages/MyCreations"));
const SociaGpt           = lazy(() => import("@/pages/SociaGpt"));
const SociaGptBilling    = lazy(() => import("@/pages/SociaGptBilling"));
const RefundThread       = lazy(() => import("@/pages/RefundThread"));
const Messages           = lazy(() => import("@/pages/Messages"));
const ChatThread         = lazy(() => import("@/pages/ChatThread"));
const Profile            = lazy(() => import("@/pages/Profile"));
const UserProfile        = lazy(() => import("@/pages/UserProfile"));
const Settings           = lazy(() => import("@/pages/Settings"));
const ResetPassword      = lazy(() => import("@/pages/ResetPassword"));
const PostDetail         = lazy(() => import("@/pages/PostDetail"));
const LegalPage          = lazy(() => import("@/pages/LegalPage"));
const FollowList         = lazy(() => import("@/pages/Followers"));
const Subscribe          = lazy(() => import("@/pages/Subscribe"));
const Billing            = lazy(() => import("@/pages/Billing"));
const BillingUpgrade     = lazy(() => import("@/pages/BillingUpgrade"));
const BillingSuccess     = lazy(() => import("@/pages/BillingSuccess"));
const BillingCancelled   = lazy(() => import("@/pages/BillingCancelled"));
const SupportSuccess     = lazy(() => import("@/pages/SupportSuccess"));
const SupportCancelled   = lazy(() => import("@/pages/SupportCancelled"));
const AuthCallback       = lazy(() => import("@/pages/AuthCallback"));
const SysAdminLogin      = lazy(() => import("@/pages/SysAdminLogin"));
const SysAdmin           = lazy(() => import("@/pages/SysAdmin"));
const AdminLogin         = lazy(() => import("@/pages/AdminLogin"));
const AdminDashboard     = lazy(() => import("@/pages/AdminDashboard"));
const UserByUsername     = lazy(() => import("@/pages/UserByUsername"));
const NotFound           = lazy(() => import("@/pages/not-found"));
const CreatorMonetization = lazy(() => import("@/pages/CreatorMonetization"));
const AffiliateProgram   = lazy(() => import("@/pages/AffiliateProgram"));
const SellerCenter       = lazy(() => import("@/pages/SellerCenter"));
const CreatorStars       = lazy(() => import("@/pages/CreatorStars"));
const SystemStatusCenter = lazy(() => import("@/pages/SystemStatusCenter"));
const AICommandCenter    = lazy(() => import("@/pages/AICommandCenter"));

// Stable wrapper components defined outside Router to avoid remounts on re-render.
// They reference lazy components which are resolved by the nearest Suspense boundary.
const TermsPage       = () => <LegalPage kind="terms" />;
const PrivacyPage     = () => <LegalPage kind="privacy" />;
const LicensesPage    = () => <LegalPage kind="licenses" />;
const DeveloperPage   = () => <LegalPage kind="developer" />;
const FollowersPage   = () => <FollowList mode="followers" />;
const FollowingPage   = () => <FollowList mode="following" />;
// Stable wrapper so wouter's injected `params` prop doesn't conflict with
// SysAdmin's typed props.
const SysAdminPage    = () => <SysAdmin />;

// Shown inside AppShell (nav stays visible) while a lazy chunk is downloading.
// Uses the same shimmer utility class used elsewhere in the app.
function PageSkeleton() {
  return (
    <div className="h-full overflow-y-auto app-bg px-4 pt-5 space-y-3">
      <div className="h-6 w-2/3 rounded-2xl shimmer" />
      <div className="h-44 w-full rounded-3xl shimmer" />
      <div className="h-4 w-full rounded-xl shimmer" />
      <div className="h-4 w-5/6 rounded-xl shimmer" />
      <div className="h-36 w-full rounded-3xl shimmer" />
      <div className="h-36 w-full rounded-3xl shimmer" />
    </div>
  );
}

const queryClient = new QueryClient();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const { loading } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;
    /* Public routes: signed-in users can also reach /reset-password (they  *
     * land here from the recovery email with a valid session).             */
    const isPublic = location === "/auth"
      || location === "/auth/callback"   // OAuth return — must be public before session exists
      || location === "/forgot-password"
      || location === "/reset-password"
      || location.startsWith("/legal/")
      || location.startsWith("/sys-admin")
      || location.startsWith("/admin")
      || location.startsWith("/creator/");
    if (!isAuthenticated && !isPublic) navigate("/auth");
    if (isAuthenticated && location === "/auth") navigate("/");
  }, [isAuthenticated, loading, location, navigate]);

  if (loading) {
    /* Auth bootstrap blocks the tree, so the GlobalLoaderProvider isn't
       mounted yet — render the cinematic overlay directly so the splash
       still uses the unified loading visual. */
    return (
      <div className="app-bg" style={{ position: "fixed", inset: 0 }}>
        <CinematicLoadingOverlay open message="Loading Socia…" subtitle="Preparing your studio" />
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * OwnerGuard — gates the owner-only monitoring dashboards (/owner/*).
 * AuthGuard already ensures a session exists; this additionally requires the
 * signed-in user to be the platform owner. Non-owners are redirected home so
 * the dashboards never mount (no owner-only sockets/fetches leak).
 */
function OwnerGuard({ children }: { children: React.ReactNode }) {
  const isOwner = useAppStore((s) => s.user?.isOwner === true);
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isOwner) navigate("/");
  }, [isOwner, navigate]);

  if (!isOwner) return null;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/auth"                  component={Auth} />
      <Route path="/auth/callback"         component={AuthCallback} />
      <Route path="/forgot-password"       component={ResetPassword} />
      <Route path="/reset-password"        component={ResetPassword} />
      <Route path="/"                      component={Home} />
      <Route path="/create"               component={CreateHub} />
      <Route path="/create/prompt-image"  component={CreatePromptImage} />
      <Route path="/create/prompt-video"  component={CreatePromptVideo} />
      <Route path="/create/image-video"   component={CreateImageVideo} />
      {/* AI Cinematic Studio + AI Preset Studio are locked behind an
          admin check until their backend models/API keys are wired up.
          ComingSoonGuard prevents the heavy page from mounting for
          non-admins, so no API calls / sockets leak from these routes. */}
      <Route path="/create/multi-frame">
        <ComingSoonGuard title="AI Cinematic Studio">
          <CreateMultiFrame />
        </ComingSoonGuard>
      </Route>
      <Route path="/studio">
        <ComingSoonGuard title="AI Preset Studio">
          <Studio />
        </ComingSoonGuard>
      </Route>
      <Route path="/studio/creations"     component={MyCreations} />
      <Route path="/studio/:presetId"     component={StudioPreset} />
      <Route path="/socia-gpt"             component={SociaGpt} />
      <Route path="/socia-gpt/billing"    component={SociaGptBilling} />
      <Route path="/messages"             component={Messages} />
      <Route path="/messages/:id"         component={ChatThread} />
      <Route path="/profile"              component={Profile} />
      <Route path="/profile/settings"     component={Settings} />
      <Route path="/profile/:id"          component={UserProfile} />
      <Route path="/post/:id"             component={PostDetail} />
      <Route path="/followers/:id"        component={FollowersPage} />
      <Route path="/following/:id"        component={FollowingPage} />
      <Route path="/user/:username"       component={UserByUsername} />
      <Route path="/subscribe"            component={Subscribe} />
      <Route path="/billing"              component={Billing} />
      <Route path="/billing/refund/:id"   component={RefundThread} />
      <Route path="/billing/upgrade"      component={BillingUpgrade} />
      <Route path="/billing/success"      component={BillingSuccess} />
      <Route path="/billing/cancelled"    component={BillingCancelled} />
      <Route path="/support/success"      component={SupportSuccess} />
      <Route path="/support/cancelled"    component={SupportCancelled} />
      <Route path="/subscription"         component={BillingUpgrade} />
      <Route path="/creator/monetization"  component={CreatorMonetization} />
      <Route path="/creator/affiliate"    component={AffiliateProgram} />
      <Route path="/creator/seller"       component={SellerCenter} />
      <Route path="/creator/stars"        component={CreatorStars} />
      <Route path="/sys-admin/login"      component={SysAdminLogin} />
      <Route path="/sys-admin"            component={SysAdminPage} />
      <Route path="/sys-admin/:rest*"     component={SysAdminPage} />
      <Route path="/owner/payments">
        <OwnerGuard><SystemStatusCenter /></OwnerGuard>
      </Route>
      <Route path="/owner/ai">
        <OwnerGuard><AICommandCenter /></OwnerGuard>
      </Route>
      <Route path="/admin/login"          component={AdminLogin} />
      <Route path="/admin/dashboard"      component={AdminDashboard} />
      <Route path="/admin"                component={AdminDashboard} />
      <Route path="/admin/:rest*"         component={AdminDashboard} />
      <Route path="/legal/terms"          component={TermsPage} />
      <Route path="/legal/privacy"        component={PrivacyPage} />
      <Route path="/legal/licenses"       component={LicensesPage} />
      <Route path="/legal/developer"      component={DeveloperPage} />
      <Route                              component={NotFound} />
    </Switch>
  );
}

/**
 * Bootstraps the super-admin session once at app startup. If a token
 * exists in localStorage we round-trip `adminFetchSession()` to
 * rehydrate the profile into `useAdminStore`; either way we flip
 * `hydrated` so gated routes (`ComingSoonGuard`) know admin status
 * has been resolved and stop holding the screen blank. Runs in a
 * `useEffect` so it never blocks first paint.
 */
function AdminSessionBootstrap() {
  useEffect(() => {
    const setHydrated = useAdminStore.getState().setHydrated;
    let cancelled = false;
    (async () => {
      if (hasAdminToken()) {
        try { await adminFetchSession(); } catch { /* invalid token already cleared */ }
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}

function App() {
  return (
    /* UpdateGate is the OUTERMOST wrapper so the force-update screen renders
     * before any provider, route, or auth check — even if the rest of the
     * app would crash, the gate still blocks outdated installs. */
    <UpdateGate>
      <PreferencesProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthProvider>
              {/* GlobalLoaderProvider mounts ONE cinematic loading overlay
                  at the app root so every page can call useGlobalLoader()
                  for a unified, on-brand loading experience. */}
              <GlobalLoaderProvider>
                <AdminSessionBootstrap />
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <AuthGuard>
                    <AppShell>
                      {/* Suspense catches lazy-page loading. Fallback renders
                          inside AppShell so the top bar and bottom nav stay
                          visible while the chunk downloads. */}
                      <Suspense fallback={<PageSkeleton />}>
                        <Router />
                      </Suspense>
                    </AppShell>
                  </AuthGuard>
                </WouterRouter>
                {/* Single Toaster mounted at the root so any page (e.g.
                    CreateHub's coming-soon locked taps) can dispatch
                    toasts through `useToast()`. */}
                <Toaster />
                {/* Global AI Generation loading screen — shown ONLY during
                    AI generation tasks (image / video / cinematic). Driven by
                    the isolated useAIGeneration store; fully additive. */}
                <GlobalAIGenerationOverlay />
              </GlobalLoaderProvider>
            </AuthProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </PreferencesProvider>
    </UpdateGate>
  );
}

export default App;

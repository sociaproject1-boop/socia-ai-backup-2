/**
 * GlobalLoaderProvider — the single source of truth for ALL cinematic
 * loading states in the Socia app.
 *
 * Architecture:
 *   • Provider mounts ONE `CinematicLoadingOverlay` at the app root.
 *   • `useGlobalLoader()` returns { showLoader, hideLoader, isLoading }.
 *   • Reference-counted: multiple concurrent callers can show the loader
 *     and the overlay only hides when EVERY caller has called hideLoader.
 *     This prevents race conditions when an outer flow (e.g. render) and
 *     an inner step (e.g. credits check) both want to show progress.
 *   • The most recently pushed message/subtitle wins, so the user always
 *     sees the freshest in-flight description.
 *
 * Usage:
 *   const { showLoader, hideLoader } = useGlobalLoader();
 *   const handle = showLoader("Creating image…", "Usually 15–30 seconds");
 *   try { await api.generate(); } finally { hideLoader(handle); }
 *
 * Or with the convenience helper:
 *   await withLoader("Rendering cinematic video…", () => api.render());
 */

import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { CinematicLoadingOverlay } from "./CinematicLoadingOverlay";

/* The api object is split into two contexts so consumers that only need the
   actions (show/hide/withLoader) don't re-render on every loader state flip.
   Only components that actually read `isLoading` subscribe to that context. */

/** Opaque handle returned from showLoader — pass it back to hideLoader. */
export type LoaderHandle = number;

interface LoaderState {
  message: string;
  subtitle?: string;
}

interface GlobalLoaderActions {
  /** Open the loader. Returns a handle that MUST be passed to hideLoader. */
  showLoader: (message: string, subtitle?: string) => LoaderHandle;
  /** Close the loader for a specific handle. Safe to call multiple times. */
  hideLoader: (handle: LoaderHandle) => void;
  /** Update the message/subtitle for an existing handle without churning the overlay. */
  updateLoader: (handle: LoaderHandle, message: string, subtitle?: string) => void;
  /** Wrap an async function — auto show/hide around it (even on throw). */
  withLoader: <T>(
    message: string,
    fn: () => Promise<T>,
    subtitle?: string,
  ) => Promise<T>;
}

interface GlobalLoaderApi extends GlobalLoaderActions {
  /** True iff at least one caller currently has the loader open. */
  isLoading: boolean;
}

/* Stable actions — identity never changes once the provider mounts. Most
   consumers only need this, so they never re-render when the loader opens. */
const GlobalLoaderActionsContext = createContext<GlobalLoaderActions | null>(null);
/* Lightweight isLoading-only context for the few components that need to
   reflect loading state in their own UI. */
const GlobalLoaderStateContext = createContext<boolean>(false);

export function GlobalLoaderProvider({ children }: { children: ReactNode }) {
  /* Stack of open handles → state. Most recent push wins for the visible
     message. Stored in a ref so concurrent show/hide pairs don't race on
     stale state during the same React render. */
  const stackRef = useRef<Map<LoaderHandle, LoaderState>>(new Map());
  const nextHandleRef = useRef<LoaderHandle>(1);
  const [visible, setVisible] = useState<LoaderState | null>(null);

  /* Recompute what should be visible from the stack and commit to state. */
  const sync = useCallback(() => {
    const stack = stackRef.current;
    if (stack.size === 0) {
      setVisible(null);
      return;
    }
    /* Take the last inserted entry — Map preserves insertion order. */
    let top: LoaderState | null = null;
    for (const v of stack.values()) top = v;
    setVisible(top);
  }, []);

  const showLoader = useCallback((message: string, subtitle?: string): LoaderHandle => {
    const handle = nextHandleRef.current++;
    stackRef.current.set(handle, { message, subtitle });
    sync();
    return handle;
  }, [sync]);

  const hideLoader = useCallback((handle: LoaderHandle) => {
    if (!stackRef.current.delete(handle)) return;
    sync();
  }, [sync]);

  const updateLoader = useCallback(
    (handle: LoaderHandle, message: string, subtitle?: string) => {
      if (!stackRef.current.has(handle)) return;
      stackRef.current.set(handle, { message, subtitle });
      sync();
    },
    [sync],
  );

  const withLoader = useCallback(
    async <T,>(message: string, fn: () => Promise<T>, subtitle?: string): Promise<T> => {
      const handle = showLoader(message, subtitle);
      try {
        return await fn();
      } finally {
        hideLoader(handle);
      }
    },
    [showLoader, hideLoader],
  );

  /* Actions identity is fully stable — every method is wrapped in useCallback
     and the object only ever rebuilds if one of those identities changes,
     which they never do under normal use. */
  const actions = useMemo<GlobalLoaderActions>(() => ({
    showLoader,
    hideLoader,
    updateLoader,
    withLoader,
  }), [showLoader, hideLoader, updateLoader, withLoader]);

  const isLoading = visible !== null;

  return (
    <GlobalLoaderActionsContext.Provider value={actions}>
      <GlobalLoaderStateContext.Provider value={isLoading}>
        {children}
        <CinematicLoadingOverlay
          open={isLoading}
          message={visible?.message}
          subtitle={visible?.subtitle}
        />
      </GlobalLoaderStateContext.Provider>
    </GlobalLoaderActionsContext.Provider>
  );
}

/** Hook — returns both actions and isLoading. Most callers should prefer
    `useGlobalLoaderActions()` to avoid re-rendering when the loader toggles. */
export function useGlobalLoader(): GlobalLoaderApi {
  const actions = useContext(GlobalLoaderActionsContext);
  const isLoading = useContext(GlobalLoaderStateContext);
  if (!actions) {
    throw new Error(
      "useGlobalLoader() must be used inside <GlobalLoaderProvider>. " +
      "Mount the provider once at the App root.",
    );
  }
  return { ...actions, isLoading };
}

/** Re-render-free hook — returns only the stable action methods. */
export function useGlobalLoaderActions(): GlobalLoaderActions {
  const actions = useContext(GlobalLoaderActionsContext);
  if (!actions) {
    throw new Error(
      "useGlobalLoaderActions() must be used inside <GlobalLoaderProvider>.",
    );
  }
  return actions;
}

/** Hook for the rare component that needs to render loading state. */
export function useIsGlobalLoading(): boolean {
  return useContext(GlobalLoaderStateContext);
}

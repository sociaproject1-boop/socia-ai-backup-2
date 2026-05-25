/**
 * useSecureView — best-effort screenshot / screen-recording deterrent
 * for sensitive document overlays (DTI certificate, future KYC docs).
 *
 * Browsers cannot truly block screenshots, so this hook layers
 * deterrents and returns a `protected` flag the caller uses to hide
 * the content when capture is likely:
 *
 *   • PrintScreen / Cmd+Shift+3/4/5 key combos        → blur immediately
 *   • Tab/window blur or `visibilitychange === hidden` → blur (covers
 *     OS screenshot UIs and app switcher previews on most platforms)
 *   • Right-click / long-press / drag on the document → blocked
 *
 * On the Capacitor Android wrapper we additionally toggle
 * `WebView.setFlagSecure` if the plugin is present, which renders the
 * window black to screen-capture APIs and the recents thumbnail. We
 * detect the plugin at runtime so the web build stays dependency-free.
 *
 * The hook is fully reversible: every listener and the FLAG_SECURE bit
 * are torn down on unmount or when `enabled` flips to false, so it's
 * safe to mount inside a modal that opens/closes repeatedly.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/* Capacitor's global lives on window when the native wrapper is loaded.
   We type it loosely so the web build doesn't need @capacitor/core. */
type CapacitorLike = {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, unknown>;
};

/** How long the privacy overlay stays up after a capture-like event. */
const PROTECT_HOLD_MS = 1600;

export interface UseSecureViewResult {
  /** True while the privacy overlay should cover the document. */
  isProtected: boolean;
  /** Manually clear the overlay (used by the "Dismiss" button). */
  clearProtection: () => void;
  /** Spread on the document element to block save/drag/select gestures. */
  documentGuardProps: {
    onContextMenu: (e: React.MouseEvent) => void;
    onDragStart:   (e: React.DragEvent) => void;
    onCopy:        (e: React.ClipboardEvent) => void;
    style:         React.CSSProperties;
  };
}

export function useSecureView(enabled: boolean): UseSecureViewResult {
  const [isProtected, setProtected] = useState(false);
  const timerRef = useRef<number | null>(null);

  const trigger = useCallback(() => {
    setProtected(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setProtected(false);
      timerRef.current = null;
    }, PROTECT_HOLD_MS);
  }, []);

  const clearProtection = useCallback(() => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    setProtected(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    /* --- Native: FLAG_SECURE on Android via Capacitor plugin -------- */
    let nativeCleanup: (() => void) | null = null;
    const cap = (window as unknown as { Capacitor?: CapacitorLike }).Capacitor;
    if (cap?.isNativePlatform?.()) {
      // Optional plugin — only call if registered. We try a few common
      // plugin names so we don't hard-bind to one author.
      const candidates = ["PrivacyScreen", "ScreenProtector", "SecureScreen"];
      for (const name of candidates) {
        const plugin = cap.Plugins?.[name] as
          | { enable?: () => Promise<void>; disable?: () => Promise<void> }
          | undefined;
        if (plugin?.enable && plugin?.disable) {
          plugin.enable().catch(() => {});
          nativeCleanup = () => { plugin.disable!().catch(() => {}); };
          break;
        }
      }
    }

    /* --- Web deterrents -------------------------------------------- */
    const onKey = (e: KeyboardEvent) => {
      // PrintScreen (Windows / many Linux DEs)
      if (e.key === "PrintScreen") { trigger(); return; }
      // macOS screenshot shortcuts: Cmd+Shift+3/4/5/6
      if (e.metaKey && e.shiftKey && ["3","4","5","6"].includes(e.key)) {
        trigger(); return;
      }
      // Windows Game Bar (Win+G) / Win+Shift+S
      if (e.shiftKey && (e.key === "S" || e.key === "s") &&
          (e.getModifierState?.("Meta") || e.getModifierState?.("OS"))) {
        trigger(); return;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Some browsers only fire PrintScreen on keyup.
      if (e.key === "PrintScreen") trigger();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") trigger();
    };
    const onBlur = () => trigger();

    window.addEventListener("keydown", onKey, { passive: true });
    window.addEventListener("keyup",   onKeyUp, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup",   onKeyUp);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
      setProtected(false);
      nativeCleanup?.();
    };
  }, [enabled, trigger]);

  /* Guard props applied to the document/image wrapper to discourage
     casual capture via the browser's own save/share affordances. */
  const documentGuardProps: UseSecureViewResult["documentGuardProps"] = {
    onContextMenu: (e) => e.preventDefault(),
    onDragStart:   (e) => e.preventDefault(),
    onCopy:        (e) => e.preventDefault(),
    style: {
      WebkitUserSelect: "none",
      userSelect: "none",
      WebkitTouchCallout: "none",        // disable iOS long-press save sheet
      WebkitUserDrag: "none",             // disable Safari image drag
    } as React.CSSProperties,
  };

  return { isProtected, clearProtection, documentGuardProps };
}

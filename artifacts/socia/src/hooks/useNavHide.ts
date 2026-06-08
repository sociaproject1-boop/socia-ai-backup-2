import { useEffect, RefObject } from "react";
import { useLocation } from "wouter";
import { useAppStore } from "@/lib/store";

/**
 * Attach to a scrollable element ref to get Instagram-style auto-hide nav.
 * Hides TopBar + BottomNav on scroll-down, restores on scroll-up.
 * Resets to visible on every route change.
 */
export function useNavHide(scrollRef: RefObject<HTMLElement | null>) {
  const setNavHidden = useAppStore((s) => s.setNavHidden);
  const [location] = useLocation();

  useEffect(() => {
    setNavHidden(false);
  }, [location, setNavHidden]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let lastY = el.scrollTop;
    let raf: number | null = null;

    const onScroll = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const y = el.scrollTop;
        const dy = y - lastY;
        lastY = y;

        if (Math.abs(dy) < 3) return;

        if (y < 72) {
          setNavHidden(false);
        } else if (dy > 0) {
          setNavHidden(true);
        } else if (dy < -3) {
          setNavHidden(false);
        }
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [scrollRef, setNavHidden]);
}

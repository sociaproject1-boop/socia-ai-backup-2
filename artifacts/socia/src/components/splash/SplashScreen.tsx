import { useEffect, useState } from "react";
import markUrl from "@assets/splash2/mark-clean.png";

/**
 * SplashScreen — minimal launch screen for SOCIA.
 *
 * Pure black background with the colorful "S" mark centered, sharp, and
 * completely unadorned: no glow/drop-shadow, no halo, no bloom, no sparkle
 * decorations, no wordmark. Mounts once at the app root, holds briefly, then
 * fades out to reveal whatever the router already shows underneath. It never
 * touches routing, auth, or business logic — it is purely a visual layer.
 *
 * `mark-clean.png` is a processed cutout of the original artwork: the same
 * logo shape and colors, with the baked-in nebula background, sparkle stars,
 * and glow bloom stripped out, leaving a crisp, transparent-background S.
 */

const HOLD_MS = 1400;
const FADE_MS = 400;
const UNMOUNT_AT = HOLD_MS + FADE_MS;

export function SplashScreen() {
  /* ?nosplash=1 skips the intro entirely (used for screenshots / testing) */
  const skipSplash = new URLSearchParams(window.location.search).get("nosplash") === "1";

  const [exiting, setExiting] = useState(skipSplash);
  const [done, setDone] = useState(skipSplash);

  useEffect(() => {
    if (skipSplash) return;
    const t1 = window.setTimeout(() => setExiting(true), HOLD_MS);
    const t2 = window.setTimeout(() => setDone(true), UNMOUNT_AT);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (done) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "#000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: exiting ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: exiting ? "none" : "auto",
      }}
    >
      <img
        src={markUrl}
        alt="SOCIA"
        draggable={false}
        style={{
          width: "min(46vw, 200px)",
          height: "auto",
          display: "block",
        }}
      />
    </div>
  );
}

export default SplashScreen;

/**
 * AiAcademyMarketplace.tsx — AI Academy Marketplace
 *
 * Each category card is a live Three.js/R3F WebGL scene:
 *   • Photo texture on an oversized background plane (never shows edges)
 *   • Two orbiting point lights → sweeping specular highlights on overlay planes
 *   • Mid-plane drifts at 0.4× camera speed  → near-field colour layer
 *   • Glass panel drifts at 1.5× camera speed → highly-reflective surface
 *   • Particle cloud drifts at 2.5× camera speed → foreground depth
 *   • Camera follows a Lissajous path → ALL planes parallax relative to camera
 *
 * This is genuine GPU-rendered 3-D parallax, not CSS transforms.
 */
import { useState, useRef, useMemo, Suspense, Component } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import {
  Box, Clapperboard, Drama, Megaphone,
  Image as ImageIcon, Video as VideoIcon,
  Paperclip, Mic, ArrowUp,
} from "lucide-react";
import { useLoginGate } from "@/lib/useLoginGate";
import sociaMark        from "@assets/splash2/mark.png";
import productImg       from "@/assets/marketplace/ai-product.jpg";
import movieImg         from "@/assets/marketplace/movie.jpg";
import animeImg         from "@/assets/marketplace/anime.jpg";
import advertisingImg   from "@/assets/marketplace/advertising.jpg";

/* ─────────────────────────────────────────────────────────────────────────
   WebGL guard — runs ONCE at module load time.

   Two-layer defence against headless / sandboxed environments that claim
   WebGL support but fail when Three.js actually binds the context:

   1. console.error filter — Three.js calls console.error (not throw) when
      context creation fails; the Vite runtime-error-modal plugin intercepts
      ALL console.error calls and shows a full-screen overlay.  We patch
      console.error here (once, idempotently) to swallow THREE.WebGLRenderer
      lines before they reach the plugin.

   2. WEBGL_OK flag — probes with the exact options our Canvas uses.  If even
      the probe fails, we skip mounting the Canvas entirely so React never
      sees an error from R3F.
   ───────────────────────────────────────────────────────────────────────── */

// 1. Filter Three.js renderer errors from console.error (idempotent)
if (typeof window !== "undefined" && !(window as Record<string, unknown>).__r3fPatch__) {
  (window as Record<string, unknown>).__r3fPatch__ = true;
  const _orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("THREE.WebGLRenderer")) return;
    _orig(...args);
  };
}

// 2. WEBGL_OK — probe with the same options React Three Fiber will use
const WEBGL_OK: boolean = (() => {
  try {
    if (typeof window === "undefined" || !window.WebGLRenderingContext) return false;
    const c = document.createElement("canvas");
    c.width = 1; c.height = 1;
    const gl =
      c.getContext("webgl",              { antialias: false, alpha: true }) ||
      c.getContext("experimental-webgl", { antialias: false, alpha: true });
    return gl !== null;
  } catch {
    return false;
  }
})();

/* ─────────────────────────────────────────────────────────────────────────
   Design tokens
   ───────────────────────────────────────────────────────────────────────── */
const BG         = "#090909";
const CARD_BG    = "#111111";
const BORDER     = "rgba(255,255,255,0.08)";
const PURPLE     = "#8A4DFF";
const GLOW       = "#A855F7";
const TEXT       = "#FFFFFF";
const TEXT_MUTED = "#A1A1AA";

/* ─────────────────────────────────────────────────────────────────────────
   Per-card 3-D scene config
   ───────────────────────────────────────────────────────────────────────── */
interface R3DConfig {
  /** Primary orbiting point light */
  primaryLight:       string;
  primaryIntensity:   number;
  primaryOrbitX:      number;   // angular velocity (rad/s)
  primaryOrbitY:      number;
  /** Fill orbiting point light */
  secondaryLight:     string;
  secondaryIntensity: number;
  secondaryOrbitX:    number;
  secondaryOrbitY:    number;
  /** Translucent mid-plane (colour + light pickup) */
  overlayColor:       string;
  overlayOpacity:     number;
  /** Floating particles */
  particleColor:      string;
  particleCount:      number;
  particleSize:       number;
  /** Camera drift */
  camAmpX:            number;
  camAmpY:            number;
  camSpeedX:          number;
  camSpeedY:          number;
}

const R3D: Record<string, R3DConfig> = {
  /** Luxury product — warm violet lighting, gold particles, slow breathing */
  product: {
    primaryLight: "#c084fc",   primaryIntensity: 16,
    primaryOrbitX: 0.22,       primaryOrbitY: 0.17,
    secondaryLight: "#f0abfc", secondaryIntensity: 8,
    secondaryOrbitX: -0.14,    secondaryOrbitY: 0.19,
    overlayColor: "#7c3aed",   overlayOpacity: 0.11,
    particleColor: "#f5d0fe",  particleCount: 30, particleSize: 0.013,
    camAmpX: 0.13, camAmpY: 0.09, camSpeedX: 0.09, camSpeedY: 0.07,
  },
  /** Cinematic — cool blue, sparse drifting particles, slow push */
  movie: {
    primaryLight: "#3b82f6",   primaryIntensity: 12,
    primaryOrbitX: 0.13,       primaryOrbitY: 0.09,
    secondaryLight: "#93c5fd", secondaryIntensity: 6,
    secondaryOrbitX: -0.10,    secondaryOrbitY: 0.12,
    overlayColor: "#1e3a8a",   overlayOpacity: 0.08,
    particleColor: "#bfdbfe",  particleCount: 16, particleSize: 0.022,
    camAmpX: 0.19, camAmpY: 0.07, camSpeedX: 0.06, camSpeedY: 0.05,
  },
  /** Anime — soft fuchsia, dense petal-like particles, gentle float */
  anime: {
    primaryLight: "#e879f9",   primaryIntensity: 11,
    primaryOrbitX: 0.18,       primaryOrbitY: 0.24,
    secondaryLight: "#c084fc", secondaryIntensity: 9,
    secondaryOrbitX: -0.21,    secondaryOrbitY: 0.16,
    overlayColor: "#86198f",   overlayOpacity: 0.12,
    particleColor: "#fae8ff",  particleCount: 42, particleSize: 0.009,
    camAmpX: 0.09, camAmpY: 0.13, camSpeedX: 0.13, camSpeedY: 0.11,
  },
  /** Advertising — hot orange/amber neon, faster rhythm */
  advertising: {
    primaryLight: "#f97316",   primaryIntensity: 14,
    primaryOrbitX: 0.21,       primaryOrbitY: 0.16,
    secondaryLight: "#fbbf24", secondaryIntensity: 8,
    secondaryOrbitX: -0.17,    secondaryOrbitY: 0.14,
    overlayColor: "#92400e",   overlayOpacity: 0.10,
    particleColor: "#fed7aa",  particleCount: 24, particleSize: 0.015,
    camAmpX: 0.15, camAmpY: 0.08, camSpeedX: 0.15, camSpeedY: 0.12,
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   R3F scene sub-components
   ───────────────────────────────────────────────────────────────────────── */

/**
 * CameraRig — drives the Lissajous camera path.
 * Everything else in the scene drifts *relative to the camera* at a
 * different multiplier, producing genuine multi-plane depth parallax.
 */
function CameraRig({ cfg }: { cfg: R3DConfig }) {
  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime;
    camera.position.x = Math.sin(t * cfg.camSpeedX) * cfg.camAmpX;
    camera.position.y = Math.cos(t * cfg.camSpeedY) * cfg.camAmpY;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/** Two point lights on independent orbits — dynamic specular sweeps */
function SceneLights({ cfg }: { cfg: R3DConfig }) {
  const l1 = useRef<THREE.PointLight>(null!);
  const l2 = useRef<THREE.PointLight>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    l1.current.position.set(
      Math.sin(t * cfg.primaryOrbitX) * 1.9,
      Math.cos(t * cfg.primaryOrbitY) * 1.5,
      1.3,
    );
    l2.current.position.set(
      Math.cos(t * cfg.secondaryOrbitX) * 1.6,
      Math.sin(t * cfg.secondaryOrbitY) * 1.1,
      1.1,
    );
  });
  return (
    <>
      <ambientLight intensity={0.22} />
      <pointLight
        ref={l1}
        color={cfg.primaryLight}
        intensity={cfg.primaryIntensity}
        distance={7}
        decay={2}
      />
      <pointLight
        ref={l2}
        color={cfg.secondaryLight}
        intensity={cfg.secondaryIntensity}
        distance={6}
        decay={2}
      />
    </>
  );
}

/**
 * Background photo — MeshBasicMaterial so the image always renders at
 * full fidelity regardless of lighting. The plane is oversized (+60% bleed
 * each side) so camera movement never exposes the card edges.
 */
function PhotoPlane({ texture }: { texture: THREE.Texture }) {
  return (
    <mesh position={[0, 0, 0]}>
      <planeGeometry args={[4.2, 3.6]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}

/**
 * Mid overlay — a semi-transparent plane that picks up the point-light
 * colours and drifts at 0.4× camera speed (closer than background → parallax).
 */
function MidPlane({ cfg }: { cfg: R3DConfig }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ camera }) => {
    ref.current.position.x = -camera.position.x * 0.4;
    ref.current.position.y = -camera.position.y * 0.4;
  });
  return (
    <mesh ref={ref} position={[0, 0, 0.22]}>
      <planeGeometry args={[3.8, 3.2]} />
      <meshStandardMaterial
        color={cfg.overlayColor}
        transparent
        opacity={cfg.overlayOpacity}
        roughness={0.22}
        metalness={0.70}
      />
    </mesh>
  );
}

/**
 * Glass specular panel — nearly invisible but highly metallic so it catches
 * hard specular highlights from the orbiting lights. Drifts at 1.5× camera.
 */
function GlassPanel({ cfg }: { cfg: R3DConfig }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ camera }) => {
    ref.current.position.x = -camera.position.x * 1.5;
    ref.current.position.y = -camera.position.y * 1.5;
  });
  return (
    <mesh ref={ref} position={[0, 0, 0.48]}>
      <planeGeometry args={[3.6, 3.0]} />
      <meshStandardMaterial
        color="#ffffff"
        transparent
        opacity={0.028}
        roughness={0.0}
        metalness={1.0}
      />
    </mesh>
  );
}

/**
 * Particle cloud — the most forward element, drifts at 2.5× camera speed.
 * The extreme parallax multiplier makes even tiny camera movement feel like
 * the particles are floating just in front of the lens.
 */
function Particles({ cfg }: { cfg: R3DConfig }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(cfg.particleCount * 3);
    for (let i = 0; i < cfg.particleCount; i++) {
      arr[i * 3]     = (Math.random() - 0.5) * 3.4;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 2.8;
      arr[i * 3 + 2] = Math.random() * 1.0 + 0.4;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return geo;
  }, [cfg.particleCount]);

  const ref = useRef<THREE.Points>(null!);
  useFrame(({ camera, clock }) => {
    ref.current.position.x = -camera.position.x * 2.5;
    ref.current.position.y = -camera.position.y * 2.5;
    ref.current.rotation.z = clock.elapsedTime * 0.013;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        color={cfg.particleColor}
        size={cfg.particleSize}
        transparent
        opacity={0.68}
        sizeAttenuation
      />
    </points>
  );
}

/** Inner scene — useTexture suspends here until the image is decoded */
function CardSceneInner({ imageUrl, cfg }: { imageUrl: string; cfg: R3DConfig }) {
  const texture = useTexture(imageUrl);
  return (
    <>
      <CameraRig cfg={cfg} />
      <SceneLights cfg={cfg} />
      <PhotoPlane texture={texture} />
      <MidPlane cfg={cfg} />
      <GlassPanel cfg={cfg} />
      <Particles cfg={cfg} />
    </>
  );
}

/**
 * CanvasErrorBoundary — catches any React-level error R3F propagates when the
 * WebGL context fails to bind (e.g. in sandboxed/headless environments).
 * On error it renders nothing; the fallback <img> behind the canvas shows through.
 */
class CanvasErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* silently suppress — Three.js already logged it */ }
  render() { return this.state.failed ? null : this.props.children; }
}

/* ─────────────────────────────────────────────────────────────────────────
   Data types
   ───────────────────────────────────────────────────────────────────────── */
interface CategoryDef {
  key: string; title: string; subtitle: string;
  image: string; icon: typeof Box; serverCategory: string;
}

const CATEGORIES: CategoryDef[] = [
  { key: "product",     title: "AI Product",   subtitle: "Generate stunning AI product visuals.",         image: productImg,     icon: Box,          serverCategory: "Luxury Product Ads" },
  { key: "movie",       title: "Movie",         subtitle: "Cinematic scenes, storyboards & more.",         image: movieImg,       icon: Clapperboard, serverCategory: "Cinematic Film"     },
  { key: "anime",       title: "Anime",          subtitle: "Characters, scenes, worlds & story prompts.",  image: animeImg,       icon: Drama,        serverCategory: "Anime Style"        },
  { key: "advertising", title: "Advertising",    subtitle: "High-converting ads, product promos & more.", image: advertisingImg, icon: Megaphone,    serverCategory: "Viral TikTok Ads"  },
];

const QUICK_ACTIONS = [
  { key: "prompt-image",    title: "Prompt to Image",  subtitle: "Describe it. We create it.",    icon: ImageIcon, path: "/create/prompt-image"  },
  { key: "video-generator", title: "Video Generator",   subtitle: "Turn your ideas into videos.", icon: VideoIcon, path: "/create/prompt-video"   },
] as const;

/* ─────────────────────────────────────────────────────────────────────────
   Shared CSS (fade-in + glow pulse only — no keyframe animations on cards)
   ───────────────────────────────────────────────────────────────────────── */
function MarketplaceStyles() {
  return (
    <style>{`
      @keyframes aam-glow-pulse {
        0%, 100% { opacity: .55; transform: scale(1);    }
        50%       { opacity: .9;  transform: scale(1.06); }
      }
      .aam-glow { animation: aam-glow-pulse 2.6s ease-in-out infinite; }
      @keyframes aam-fade-up {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0);   }
      }
      .aam-fade-up { animation: aam-fade-up .38s cubic-bezier(.22,.9,.32,1) both; }
    `}</style>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   CinemaCard — card shell wrapping the R3F Canvas
   ───────────────────────────────────────────────────────────────────────── */
function CinemaCard({
  cat, index, onTap,
}: { cat: CategoryDef; index: number; onTap: () => void }) {
  const cfg  = R3D[cat.key];
  const Icon = cat.icon;

  return (
    <motion.button
      className="aam-fade-up"
      style={{
        animationDelay: `${index * 55}ms`,
        textAlign: "left",
        display: "block",
        width: "100%",
      }}
      whileTap={{ scale: 0.955 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      onClick={onTap}
    >
      {/* Card shell — overflow:hidden clips the Canvas + overlays */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 0.87",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow:
            "0 10px 28px -10px rgba(138,77,255,0.30)," +
            "0 1px 0 rgba(255,255,255,0.04) inset",
          border: "1px solid rgba(255,255,255,0.09)",
        }}
      >
        {/* ── Fallback image — always rendered; visible when WebGL unavailable ── */}
        <img
          src={cat.image}
          alt={cat.title}
          draggable={false}
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "cover", display: "block",
          }}
        />

        {/* ── WebGL 3-D scene — guarded by capability probe + error boundary ── */}
        {WEBGL_OK && (
          <CanvasErrorBoundary>
            <Canvas
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              camera={{ position: [0, 0, 2.2], fov: 60 }}
              dpr={[1, 1.5]}
              gl={{ antialias: false, alpha: true }}
              frameloop="always"
            >
              <Suspense fallback={null}>
                <CardSceneInner imageUrl={cat.image} cfg={cfg} />
              </Suspense>
            </Canvas>
          </CanvasErrorBoundary>
        )}

        {/* ── Bottom vignette for text legibility ── */}
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background:
              "linear-gradient(180deg," +
              " rgba(0,0,0,0) 26%," +
              " rgba(0,0,0,0.75) 100%)",
          }}
        />

        {/* ── Top edge fade for depth ── */}
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background:
              "linear-gradient(180deg," +
              " rgba(0,0,0,0.25) 0%," +
              " rgba(0,0,0,0) 18%)",
          }}
        />

        {/* ── Icon badge ── */}
        <div
          style={{
            position: "absolute", top: 9, left: 9,
            width: 30, height: 30, borderRadius: "50%",
            background: "rgba(12,8,22,0.78)",
            border: "1px solid rgba(255,255,255,0.14)",
            display: "grid", placeItems: "center",
            boxShadow: "0 0 14px rgba(138,77,255,0.40)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <Icon style={{ width: 14, height: 14, color: PURPLE }} strokeWidth={2.1} />
        </div>

        {/* ── Title overlay ── */}
        <div
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            padding: "8px 11px 11px",
          }}
        >
          <h3
            style={{
              fontSize: 13, fontWeight: 700, color: "#fff",
              margin: 0, lineHeight: 1.2,
              textShadow: "0 1px 8px rgba(0,0,0,0.95)",
            }}
          >
            {cat.title}
          </h3>
        </div>
      </div>
    </motion.button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Quick action card
   ───────────────────────────────────────────────────────────────────────── */
function QuickActionCard({
  title, subtitle, icon: Icon, index, onTap,
}: {
  title: string; subtitle: string; icon: typeof ImageIcon; index: number; onTap: () => void;
}) {
  return (
    <motion.button
      className="aam-fade-up"
      style={{ animationDelay: `${(index + 4) * 55}ms`, textAlign: "left" }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      onClick={onTap}
    >
      <div
        style={{
          height: 74,
          borderRadius: 16,
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          boxShadow: "0 6px 20px -12px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            width: 30, height: 30, borderRadius: 9,
            background: `linear-gradient(135deg, ${PURPLE}, #6d28d9)`,
            display: "grid", placeItems: "center",
            boxShadow: "0 3px 12px -3px rgba(138,77,255,0.58)",
          }}
        >
          <Icon style={{ width: 15, height: 15, color: "#fff" }} strokeWidth={2} />
        </div>
        <div>
          <h3 style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, margin: 0, lineHeight: 1.2 }}>
            {title}
          </h3>
          <p style={{ marginTop: 2, fontSize: 10.5, color: TEXT_MUTED, lineHeight: 1.3 }}>
            {subtitle}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Socia GPT card
   ───────────────────────────────────────────────────────────────────────── */
function SociaGptCard({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("");
  const submit = () => { onSubmit(value.trim()); };

  return (
    <div
      className="aam-fade-up"
      style={{
        animationDelay: "380ms",
        borderRadius: 20,
        background: `linear-gradient(160deg, ${CARD_BG} 0%, #0c0710 100%)`,
        border: `1px solid ${BORDER}`,
        padding: "13px 14px",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 12px 36px -16px rgba(138,77,255,0.35)",
      }}
    >
      {/* Ambient glow blob */}
      <div
        aria-hidden
        className="aam-glow"
        style={{
          position: "absolute", left: -28, top: -28,
          width: 120, height: 120, borderRadius: "50%",
          background: `radial-gradient(circle, ${GLOW}33 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
        <div
          style={{
            position: "relative",
            width: 48, height: 48,
            flexShrink: 0,
            display: "grid", placeItems: "center",
          }}
        >
          <div
            className="aam-glow"
            style={{
              position: "absolute", inset: -5, borderRadius: "50%",
              background: `radial-gradient(circle, ${GLOW}55 0%, transparent 72%)`,
              filter: "blur(2px)",
            }}
          />
          <div
            style={{
              position: "relative",
              width: 48, height: 48, borderRadius: "50%",
              border: "1px solid rgba(168,85,247,0.4)",
              display: "grid", placeItems: "center",
              background: "rgba(20,14,32,0.6)",
            }}
          >
            <img src={sociaMark} alt="Socia" style={{ width: 27, height: 27, objectFit: "contain" }} />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: TEXT, margin: 0 }}>Socia GPT</h3>
            <span
              style={{
                fontSize: 9.5, fontWeight: 800, letterSpacing: "0.04em",
                color: "#fff", background: PURPLE,
                borderRadius: 999, padding: "2px 7px",
              }}
            >
              PRO
            </span>
          </div>
          <p style={{ marginTop: 2, fontSize: 11.5, color: TEXT_MUTED, lineHeight: 1.4 }}>
            Your all-in-one AI assistant. Ask anything. Generate anything.
          </p>
        </div>
      </div>

      {/* Input row */}
      <div
        style={{
          marginTop: 11,
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${BORDER}`,
          borderRadius: 999,
          padding: "5px 5px 5px 14px",
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Ask Socia GPT anything..."
          style={{
            flex: 1, minWidth: 0,
            background: "none", border: "none", outline: "none",
            fontSize: 13, color: TEXT, padding: "7px 0",
          }}
        />
        <button
          onClick={submit}
          aria-label="Attach file"
          style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            background: "none", border: "none", cursor: "pointer",
            display: "grid", placeItems: "center", color: TEXT_MUTED,
          }}
        >
          <Paperclip style={{ width: 15, height: 15 }} />
        </button>
        <button
          onClick={submit}
          aria-label="Voice input"
          style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            background: "none", border: "none", cursor: "pointer",
            display: "grid", placeItems: "center", color: TEXT_MUTED,
          }}
        >
          <Mic style={{ width: 15, height: 15 }} />
        </button>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={submit}
          aria-label="Send"
          style={{
            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
            background: `linear-gradient(135deg, ${PURPLE}, #6d28d9)`,
            border: "none", cursor: "pointer",
            display: "grid", placeItems: "center",
            boxShadow: "0 4px 14px -3px rgba(138,77,255,0.7)",
          }}
        >
          <ArrowUp style={{ width: 15, height: 15, color: "#fff" }} strokeWidth={2.4} />
        </motion.button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Main page
   ───────────────────────────────────────────────────────────────────────── */
export default function AiAcademyMarketplace() {
  const [, navigate]     = useLocation();
  const { requireLogin } = useLoginGate();

  const openCategory = (cat: CategoryDef) => {
    navigate(`/studio?cat=${encodeURIComponent(cat.serverCategory)}`);
  };

  const openQuickAction = (path: string, title: string) => {
    if (!requireLogin(title)) return;
    navigate(path);
  };

  const openSociaGpt = (draft: string) => {
    if (!requireLogin("Socia GPT")) return;
    navigate(draft ? `/socia-gpt?q=${encodeURIComponent(draft)}` : "/socia-gpt");
  };

  return (
    <div
      style={{
        background: BG,
        height: "100%",
        overflowY: "auto",
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
        /* Clear bottom nav only — no extra gap below last card */
        paddingBottom: "calc(60px + env(safe-area-inset-bottom))",
      }}
    >
      <MarketplaceStyles />

      {/* Title */}
      <div style={{ padding: "12px 14px 0", textAlign: "center" }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            margin: 0,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            background: `linear-gradient(135deg, ${PURPLE} 0%, #c4b5fd 55%, #93c5fd 100%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          AI Academy Marketplace
        </h1>
        <p style={{ marginTop: 4, fontSize: 12, color: TEXT_MUTED }}>
          Premium prompt packs &amp; templates for every style.
        </p>
      </div>

      {/* 2×2 R3F card grid */}
      <div
        style={{
          marginTop: 10,
          padding: "0 12px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        {CATEGORIES.map((cat, i) => (
          <CinemaCard key={cat.key} cat={cat} index={i} onTap={() => openCategory(cat)} />
        ))}
      </div>

      {/* Quick actions */}
      <div
        style={{
          marginTop: 10,
          padding: "0 12px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        {QUICK_ACTIONS.map((qa, i) => (
          <QuickActionCard
            key={qa.key}
            title={qa.title}
            subtitle={qa.subtitle}
            icon={qa.icon}
            index={i}
            onTap={() => openQuickAction(qa.path, qa.title)}
          />
        ))}
      </div>

      {/* Socia GPT */}
      <div style={{ marginTop: 10, padding: "0 12px" }}>
        <SociaGptCard onSubmit={openSociaGpt} />
      </div>
    </div>
  );
}

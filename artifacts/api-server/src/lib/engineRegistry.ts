/**
 * Single source of truth for render-engine identity, provider routing,
 * and runtime availability.
 *
 * Everything that needs to answer "which engines exist?", "which engines
 * can run RIGHT NOW given current env?", or "what does this engine ID
 * route to?" reads from here. Keeping this in one file is what enforces
 * the honesty contract — the route allow-list, the dispatch switch,
 * and the frontend engine picker all converge on these definitions.
 *
 * See `.agents/memory/provider-honesty-contract.md` for the invariants.
 */

export type EngineId =
  | "luma"
  | "kling-standard" | "kling-cinematic" | "kling-master" | "kling-3-omni"
  | "runway-gen3" | "runway-gen4"
  | "veo-ultra"
  | "pika" | "pika-2.2";

export type ProviderKind = "fal-luma" | "fal-kling" | "runway" | "veo" | "pika";

export interface EngineDescriptor {
  id:           EngineId;
  name:         string;
  provider:     ProviderKind;
  /**
   * Required environment variables for this engine to be live.
   * Outer array is AND (every group must be satisfied), inner array
   * is OR (any one env var in the group satisfies the group).
   *
   * Empty outer array = engine is fal-backed and falls under the
   * FAL_KEY gating (which has its own mock-mode behaviour in dev).
   */
  requires:     string[][];
  /** True if missing FAL_KEY in production blocks the engine. */
  falBacked:    boolean;
}

export const ENGINE_REGISTRY: EngineDescriptor[] = [
  // ── fal.ai-backed (gated by FAL_KEY) ──────────────────────────────
  { id: "luma",            name: "Luma Dream Machine",     provider: "fal-luma",  requires: [], falBacked: true },
  { id: "kling-standard",  name: "Kling Standard",         provider: "fal-kling", requires: [], falBacked: true },
  { id: "kling-cinematic", name: "Kling Cinematic",        provider: "fal-kling", requires: [], falBacked: true },
  { id: "kling-master",    name: "Kling Master",           provider: "fal-kling", requires: [], falBacked: true },
  { id: "kling-3-omni",    name: "Kling 3.0 Omni",         provider: "fal-kling", requires: [], falBacked: true },

  // ── Third-party adapters (gated by their OWN credentials) ─────────
  { id: "runway-gen3",     name: "Runway Gen-3 Alpha Turbo", provider: "runway", requires: [["RUNWAY_API_KEY"]], falBacked: false },
  { id: "runway-gen4",     name: "Runway Gen-4 Turbo",       provider: "runway", requires: [["RUNWAY_API_KEY"]], falBacked: false },

  // Veo runs on Google Vertex AI: needs the project ID + a credentials
  // source. Credentials can be a service-account file path (ADC's
  // standard `GOOGLE_APPLICATION_CREDENTIALS`) OR inline JSON via
  // `GOOGLE_VERTEX_CREDENTIALS_JSON` for env-only environments.
  // Location defaults to `us-central1` when GOOGLE_VERTEX_LOCATION
  // is unset, so it is not required.
  { id: "veo-ultra",       name: "Google Veo (Vertex AI)",
    provider: "veo",
    requires: [
      ["GOOGLE_VERTEX_PROJECT"],
      ["GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_VERTEX_CREDENTIALS_JSON"],
    ],
    falBacked: false },

  { id: "pika",            name: "Pika 2.2",               provider: "pika",      requires: [["PIKA_API_KEY"]], falBacked: false },
  { id: "pika-2.2",        name: "Pika 2.2",               provider: "pika",      requires: [["PIKA_API_KEY"]], falBacked: false },
];

const BY_ID: Map<string, EngineDescriptor> = new Map(
  ENGINE_REGISTRY.map(e => [e.id, e]),
);

export function getEngine(id: string): EngineDescriptor | undefined {
  return BY_ID.get(id);
}

/** True if `id` is a known engine in the registry. */
export function isKnownEngine(id: string): id is EngineId {
  return BY_ID.has(id);
}

/** True if `id` is fal.ai-backed (used to scope mock-mode behaviour). */
export function isFalBacked(id: string): boolean {
  return BY_ID.get(id)?.falBacked === true;
}

/**
 * True if every `requires` group has at least one env var set.
 * For fal-backed engines (empty requires) this returns true — fal-backed
 * engines are gated separately by FAL_KEY / mock-mode logic.
 */
export function isEngineConfigured(id: string): boolean {
  const e = BY_ID.get(id);
  if (!e) return false;
  return e.requires.every(group => group.some(envName =>
    Boolean((process.env[envName] || "").trim()),
  ));
}

/**
 * Detailed availability snapshot used by the /engines/availability
 * endpoint. `reason` is non-null only when `available` is false.
 */
export interface EngineAvailability {
  id:        EngineId;
  name:      string;
  provider:  ProviderKind;
  available: boolean;
  requires:  string[][];
  reason?:   string;
}

/**
 * Build the full availability list. Used by /engines/availability and
 * also by /render/submit so the same logic blocks unsupported engines.
 *
 * @param falPresent  pass `!isMockMode()` from fal.ts; we don't import
 *                    fal.ts here to keep this module dependency-free.
 */
export function buildAvailability(falPresent: boolean): EngineAvailability[] {
  return ENGINE_REGISTRY.map((e) => {
    let available = true;
    let reason: string | undefined;

    if (e.falBacked) {
      // fal-backed engine. In production, falPresent === false means we
      // would silently demo, so we report unavailable. In dev that's
      // acceptable (the engine still works in mock-mode for testing).
      if (!falPresent && process.env["NODE_ENV"] === "production") {
        available = false;
        reason = "FAL_KEY is not configured on this server.";
      }
    } else {
      // Provider-backed engine: every requires-group must be satisfied.
      const missing: string[] = [];
      for (const group of e.requires) {
        if (!group.some(env => Boolean((process.env[env] || "").trim()))) {
          missing.push(group.join(" or "));
        }
      }
      if (missing.length > 0) {
        available = false;
        reason = `Missing: ${missing.join("; ")}.`;
      }
    }

    return {
      id: e.id, name: e.name, provider: e.provider,
      available, requires: e.requires, ...(reason ? { reason } : {}),
    };
  });
}

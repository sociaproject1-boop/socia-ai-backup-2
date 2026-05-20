/**
 * Policy i18n entry point.
 *
 * Adding a new language:
 *   1. Add the locale code to `LocaleCode` union in `types.ts`.
 *   2. Create `<code>.ts` exporting a `Policy` object (TS will surface
 *      every missing field at compile time).
 *   3. Register the locale in `LOCALES` and `bundles` below.
 *
 * Detection order on first load:
 *   1. localStorage key "socia.policy.locale" (user's saved choice)
 *   2. navigator.language / navigator.languages (browser preference)
 *   3. Fallback to English
 */

import type { LocaleCode, LocaleMeta, Policy } from "./types";
import en  from "./en";
import tl  from "./tl";
import ceb from "./ceb";

/** Order-preserving registry of available locales. */
export const LOCALES: LocaleMeta[] = [
  { code: "en",  nativeLabel: "English",            englishLabel: "English",          glyph: "🇬🇧" },
  { code: "tl",  nativeLabel: "Tagalog",            englishLabel: "Tagalog/Filipino", glyph: "🇵🇭" },
  { code: "ceb", nativeLabel: "Bisaya / Sugbuanon", englishLabel: "Cebuano/Bisaya",   glyph: "🇵🇭" },
  // Future locales will appear here as they're translated.
];

const bundles: Record<LocaleCode, Policy> = { en, tl, ceb };

const STORAGE_KEY = "socia.policy.locale";

export function getPolicy(code: LocaleCode): Policy {
  return bundles[code] ?? en;
}

/** Detect the best locale for the current user. Safe in SSR (returns "en"). */
export function detectInitialLocale(): LocaleCode {
  if (typeof window === "undefined") return "en";

  // 1. Saved choice
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && isLocaleCode(saved)) return saved;
  } catch { /* localStorage unavailable — skip */ }

  // 2. Browser preference. navigator.languages is ordered most-preferred-first.
  const candidates = [
    ...(navigator.languages ?? []),
    navigator.language ?? "",
  ].map((s) => s.toLowerCase());

  for (const raw of candidates) {
    // "tl-PH", "fil-PH", "fil" → tl
    if (raw.startsWith("tl") || raw.startsWith("fil")) return "tl";
    // "ceb", "ceb-PH" → ceb
    if (raw.startsWith("ceb")) return "ceb";
    // Anything else falls through to default below.
  }

  // 3. Fallback
  return "en";
}

export function saveLocale(code: LocaleCode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch { /* localStorage unavailable — non-fatal */ }
}

// Derived from the bundles registry so adding a new locale to `LocaleCode`
// + `bundles` automatically extends the type guard. No second source of
// truth to drift out of sync.
function isLocaleCode(v: string): v is LocaleCode {
  return Object.prototype.hasOwnProperty.call(bundles, v);
}

export type { LocaleCode, LocaleMeta, Policy } from "./types";

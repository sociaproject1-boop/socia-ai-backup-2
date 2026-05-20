/**
 * Shared i18n primitives — locale registry, detection, persistence.
 * Used by both the policy modal and the community-support modal so we
 * have one source of truth for "which languages exist" and one storage
 * key for the user's saved preference.
 *
 * Adding a new language:
 *   1. Add the code to `LocaleCode` below.
 *   2. Add an entry to `LOCALES`.
 *   3. Drop the translated bundle into both i18n/policy and i18n/support
 *      (or whichever surfaces need it) and register it there.
 */

export type LocaleCode =
  | "en"
  | "tl"
  | "ceb"
  // Reserved: | "ja" | "ko" | "es" | "ar" | "hi" | "fr" | "pt"
  ;

export interface LocaleMeta {
  code:         LocaleCode;
  nativeLabel:  string;
  englishLabel: string;
  glyph?:       string;
  rtl?:         boolean;
}

export const LOCALES: LocaleMeta[] = [
  { code: "en",  nativeLabel: "English",            englishLabel: "English",          glyph: "🇬🇧" },
  { code: "tl",  nativeLabel: "Tagalog",            englishLabel: "Tagalog/Filipino", glyph: "🇵🇭" },
  { code: "ceb", nativeLabel: "Bisaya / Sugbuanon", englishLabel: "Cebuano/Bisaya",   glyph: "🇵🇭" },
];

const STORAGE_KEY = "socia.policy.locale";

const KNOWN: Set<string> = new Set(LOCALES.map((l) => l.code));

export function detectInitialLocale(): LocaleCode {
  if (typeof window === "undefined") return "en";

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && KNOWN.has(saved)) return saved as LocaleCode;
  } catch { /* localStorage unavailable */ }

  const candidates = [
    ...(navigator.languages ?? []),
    navigator.language ?? "",
  ].map((s) => s.toLowerCase());

  for (const raw of candidates) {
    if (raw.startsWith("tl") || raw.startsWith("fil")) return "tl";
    if (raw.startsWith("ceb")) return "ceb";
  }
  return "en";
}

export function saveLocale(code: LocaleCode): void {
  try { window.localStorage.setItem(STORAGE_KEY, code); }
  catch { /* localStorage unavailable */ }
}

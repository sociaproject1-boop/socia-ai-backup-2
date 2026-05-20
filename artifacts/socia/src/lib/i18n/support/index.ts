/**
 * Community-support i18n bundle. Mirrors the policy/ pattern but with its
 * own schema so the support modal can ship copy independently.
 */
import en  from "./en";
import tl  from "./tl";
import ceb from "./ceb";
import type { LocaleCode } from "../shared";
import type { SupportCopy } from "./types";

const bundles: Record<LocaleCode, SupportCopy> = { en, tl, ceb };

export function getSupportCopy(code: LocaleCode): SupportCopy {
  return bundles[code] ?? en;
}

export type { SupportCopy } from "./types";
export { LOCALES, detectInitialLocale, saveLocale } from "../shared";
export type { LocaleCode, LocaleMeta } from "../shared";

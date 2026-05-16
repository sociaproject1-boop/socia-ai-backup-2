/* ──────────────────────────────────────────────────────────────────────── *
 *  Socia — build-time configuration                                        *
 *  ────────────────────────────────────────────────────────────────────────  *
 *  Bump APP_VERSION every time you cut a new APK / web build. The value is *
 *  compared against `app_config.min_version` in Supabase at app startup —  *
 *  if this build is older, the user is shown the ForceUpdate gate and     *
 *  cannot proceed until they install a newer APK.                          *
 *  ────────────────────────────────────────────────────────────────────── */

export const APP_VERSION = "1.0.0";

/* Public download URL for the latest APK. Update this whenever a new APK
 * is published (e.g. self-hosted on a CDN, GitHub Releases, etc.). The
 * ForceUpdate screen links here as the "Update Now" call-to-action. */
export const APK_DOWNLOAD_URL = "https://YOUR_APK_LINK.apk";

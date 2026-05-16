import { APK_DOWNLOAD_URL } from "@/config";

/* ──────────────────────────────────────────────────────────────────────── *
 *  ForceUpdate                                                              *
 *  ────────────────────────────────────────────────────────────────────────  *
 *  Full-screen blocking gate shown when the installed app is older than    *
 *  the minimum version configured in Supabase (`app_config.min_version`).  *
 *  The user cannot bypass this screen — the only action is to download    *
 *  and install a fresh APK.                                                 *
 *  ────────────────────────────────────────────────────────────────────── */
export default function ForceUpdate({
  current,
  required,
}: {
  current?:  string;
  required?: string;
}) {
  return (
    <div
      className="app-bg"
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        height:         "100dvh",
        flexDirection:  "column",
        padding:        "24px",
        textAlign:      "center",
        background:     "linear-gradient(180deg, #08010f 0%, #14021c 100%)",
        color:          "#fff",
        fontFamily:     "Inter, system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          fontSize:    "56px",
          lineHeight:  1,
          marginBottom: "20px",
        }}
        aria-hidden
      >
        ✨
      </div>

      <h2
        style={{
          fontSize:   "26px",
          fontWeight: 700,
          margin:     "0 0 12px",
          letterSpacing: "-0.01em",
        }}
      >
        Update required
      </h2>

      <p
        style={{
          fontSize:  "15px",
          opacity:   0.75,
          maxWidth:  "320px",
          margin:    "0 0 28px",
          lineHeight: 1.5,
        }}
      >
        A newer version of Socia is available. Please update to continue
        using the app.
      </p>

      <a
        href={APK_DOWNLOAD_URL}
        target="_blank"
        rel="noreferrer"
        style={{
          display:        "inline-block",
          padding:        "14px 32px",
          borderRadius:   "999px",
          background:     "linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #6366f1 100%)",
          color:          "#fff",
          fontSize:       "15px",
          fontWeight:     600,
          textDecoration: "none",
          boxShadow:      "0 10px 30px rgba(168, 85, 247, 0.45)",
        }}
      >
        Update Now
      </a>

      {(current || required) && (
        <p
          style={{
            marginTop: "32px",
            fontSize:  "12px",
            opacity:   0.4,
          }}
        >
          {current && <>Installed: v{current}</>}
          {current && required && " · "}
          {required && <>Required: v{required}</>}
        </p>
      )}
    </div>
  );
}

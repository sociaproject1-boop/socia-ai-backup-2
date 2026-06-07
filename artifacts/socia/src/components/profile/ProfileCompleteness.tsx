/**
 * ProfileCompleteness.tsx — Animated progress bar shown on the self-profile.
 *
 * Calculates a weighted completeness score from filled profile fields,
 * shows missing fields as chip hints, and offers a "Complete" CTA.
 */
import { motion } from "framer-motion";
import type { User } from "@/lib/store";

interface Field {
  key:    string;
  label:  string;
  weight: number;
}

const PROFILE_FIELDS: Field[] = [
  { key: "avatar",            label: "Profile photo",    weight: 15 },
  { key: "bio",               label: "Bio",              weight: 15 },
  { key: "website",           label: "Website",          weight: 8  },
  { key: "location",          label: "Location",         weight: 8  },
  { key: "work",              label: "Occupation",       weight: 8  },
  { key: "education",         label: "Education",        weight: 8  },
  { key: "birthday",          label: "Birthday",         weight: 5  },
  { key: "social.instagram",  label: "Instagram link",   weight: 9  },
  { key: "social.tiktok",     label: "TikTok link",      weight: 7  },
  { key: "social.x",          label: "X / Twitter link", weight: 7  },
  { key: "social.youtube",    label: "YouTube link",     weight: 5  },
  { key: "social.facebook",   label: "Facebook link",    weight: 5  },
];

function getValue(user: User, key: string): unknown {
  if (key.includes(".")) {
    const [obj, prop] = key.split(".");
    return (user as any)?.[obj]?.[prop];
  }
  return (user as any)?.[key];
}

function isFilled(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === "string" && val.trim() === "") return false;
  return true;
}

interface Props {
  user:   User;
  onEdit: () => void;
}

export function ProfileCompleteness({ user, onEdit }: Props) {
  const total  = PROFILE_FIELDS.reduce((s, f) => s + f.weight, 0);
  const score  = PROFILE_FIELDS.filter((f) => isFilled(getValue(user, f.key))).reduce((s, f) => s + f.weight, 0);
  const pct    = Math.round((score / total) * 100);
  const missing = PROFILE_FIELDS.filter((f) => !isFilled(getValue(user, f.key)));

  /* Hide once profile is complete */
  if (pct >= 100) return null;

  const shownMissing = missing.slice(0, 3);
  const extraCount   = missing.length - shownMissing.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="mx-4 mt-3 rounded-[20px] p-4 space-y-3"
      style={{
        background: "rgba(168,85,247,0.055)",
        border:     "1px solid rgba(168,85,247,0.18)",
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold app-text">Profile {pct}% complete</p>
          <p className="text-[11px] app-text-muted mt-0.5 leading-snug">
            Complete your profile to attract more followers
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={onEdit}
          className="flex-shrink-0 rounded-full px-4 py-2 text-[11.5px] font-bold text-white"
          style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
        >
          Complete
        </motion.button>
      </div>

      {/* Progress bar */}
      <div
        className="h-1.5 w-full rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.07)" }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: "easeOut", delay: 0.25 }}
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg,#a855f7,#ec4899,#3b82f6)" }}
        />
      </div>

      {/* Missing field chips */}
      {shownMissing.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {shownMissing.map((f) => (
            <span
              key={f.key}
              className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
              style={{
                background: "rgba(168,85,247,0.1)",
                color:      "rgba(168,85,247,0.8)",
                border:     "1px solid rgba(168,85,247,0.2)",
              }}
            >
              + {f.label}
            </span>
          ))}
          {extraCount > 0 && (
            <span
              className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
              style={{
                background: "rgba(255,255,255,0.04)",
                color:      "rgba(255,255,255,0.3)",
              }}
            >
              +{extraCount} more
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}

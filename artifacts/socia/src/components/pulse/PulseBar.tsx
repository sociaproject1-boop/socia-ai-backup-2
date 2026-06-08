/**
 * PulseBar.tsx — Horizontal stories row for the home feed (v2).
 *
 * Changes from v1:
 *  • Owner circle always shows a "+" overlay even when stories exist
 *    (multi-story support — tap ring area to view, tap "+" to add more)
 *  • Avatar and username are independently tappable
 */
import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, Zap } from "lucide-react";
import { PulseRing } from "./PulseRing";
import { CreatePulse } from "./CreatePulse";
import { openPulseViewer } from "./PulseViewer";
import { usePulseFeed } from "@/lib/usePulse";
import { useAppStore } from "@/lib/store";
import type { PulseFeedGroup } from "@/lib/pulseClient";

/* ── Single circle ──────────────────────────────────────────────────────── */
interface PulseCircleProps {
  group:      PulseFeedGroup;
  allGroups:  PulseFeedGroup[];
  groupIdx:   number;
  isMe?:      boolean;
  onAddPulse?: () => void;
}

function PulseCircle({ group, allGroups, groupIdx, isMe, onAddPulse }: PulseCircleProps) {
  const { user, has_unviewed } = group;
  const hasAny  = group.pulses.length > 0;
  const viewed  = !has_unviewed;
  const initials = (user.name ?? user.username ?? "?").charAt(0).toUpperCase();

  /* Tap the ring/avatar area → open viewer (if stories exist) */
  const handleAvatarTap = useCallback(() => {
    if (!hasAny) { onAddPulse?.(); return; }
    const firstUnviewed = group.pulses.findIndex((p) => !p.is_viewed);
    openPulseViewer(allGroups, groupIdx, firstUnviewed >= 0 ? firstUnviewed : 0);
  }, [hasAny, group.pulses, allGroups, groupIdx, onAddPulse]);

  return (
    <motion.div
      whileTap={{ scale: 0.93 }}
      className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer"
    >
      {/* Avatar + optional add-more badge */}
      <div className="relative" onClick={handleAvatarTap}>
        {isMe && !hasAny ? (
          /* Empty state — dashed ring */
          <div
            className="h-[60px] w-[60px] rounded-full overflow-hidden flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg,rgba(131,56,236,0.25),rgba(255,0,110,0.15))",
              border: "2px dashed rgba(131,56,236,0.5)",
            }}
          >
            {user.avatar_url
              ? <img src={user.avatar_url} className="h-full w-full object-cover opacity-50" alt="" />
              : <span className="text-[22px] font-bold text-purple-400">{initials}</span>
            }
          </div>
        ) : (
          <PulseRing hasActivePulse={hasAny} size={60} viewed={viewed}>
            <div className="h-full w-full rounded-full overflow-hidden">
              {user.avatar_url
                ? <img src={user.avatar_url} className="h-full w-full object-cover" alt="" />
                : <div className="h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 flex items-center justify-center text-lg font-bold text-white">
                    {initials}
                  </div>
              }
            </div>
          </PulseRing>
        )}

        {/* "+" badge — show for own story always (add more) */}
        {isMe && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={(e) => { e.stopPropagation(); onAddPulse?.(); }}
            className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full flex items-center justify-center z-10"
            style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
            aria-label="Add story"
          >
            <Plus className="h-3 w-3 text-white" strokeWidth={2.5} />
          </motion.button>
        )}
      </div>

      {/* Label */}
      <span
        className="text-[10px] font-medium max-w-[64px] truncate"
        style={{ color: (isMe && !hasAny) || viewed ? "var(--s-text-muted)" : "hsl(var(--foreground))" }}
      >
        {isMe ? "Your Story" : (user.name ?? user.username ?? "Unknown")}
      </span>
    </motion.div>
  );
}

/* ── PulseBar ────────────────────────────────────────────────────────────── */

export function PulseBar() {
  const me = useAppStore((s) => s.user);
  const { groups, loading, refresh, markViewed } = usePulseFeed();
  const [showCreate, setShowCreate] = useState(false);

  if (loading && groups.length === 0) {
    return (
      <div className="flex gap-4 overflow-x-auto hide-scrollbar px-4 py-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <div className="h-[68px] w-[68px] rounded-full shimmer" />
            <div className="h-2 w-12 rounded shimmer" />
          </div>
        ))}
      </div>
    );
  }

  /* Ensure "my group" appears first */
  const myGroup = groups.find((g) => g.user.id === me?.id);
  const others  = groups.filter((g) => g.user.id !== me?.id);

  const orderedGroups: PulseFeedGroup[] = [];
  if (myGroup) {
    orderedGroups.push(myGroup);
  } else if (me) {
    orderedGroups.push({
      user: { id: me.id, name: me.name, username: me.handle, avatar_url: me.avatar ?? null },
      pulses: [],
      has_unviewed: false,
    });
  }
  orderedGroups.push(...others);

  if (!me || orderedGroups.length === 0) return null;

  const viewerGroups = groups;

  return (
    <>
      {/* Header label */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <Zap className="h-3.5 w-3.5" style={{ color: "var(--accent-primary)" }} fill="currentColor" />
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--accent-primary)" }}>
          Stories
        </span>
      </div>

      <div className="flex gap-4 overflow-x-auto hide-scrollbar px-4 pb-3">
        {orderedGroups.map((group, i) => {
          const isMe = group.user.id === me?.id;
          const viewerIdx = viewerGroups.findIndex((g) => g.user.id === group.user.id);
          return (
            <PulseCircle
              key={group.user.id}
              group={group}
              allGroups={viewerGroups.length > 0 ? viewerGroups : orderedGroups}
              groupIdx={viewerIdx >= 0 ? viewerIdx : i}
              isMe={isMe}
              onAddPulse={() => setShowCreate(true)}
            />
          );
        })}
      </div>

      {/* Divider */}
      <div className="h-px mx-4" style={{ background: "rgba(255,255,255,0.06)" }} />

      {showCreate && (
        <CreatePulse
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}
    </>
  );
}

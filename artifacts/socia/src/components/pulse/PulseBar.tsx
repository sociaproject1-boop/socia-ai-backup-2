/**
 * PulseBar.tsx — Facebook-style tall story cards for the home feed.
 *
 * Each card is ~88 × 148 px with:
 *  • Background: first story media (or blurred avatar, or gradient)
 *  • Avatar at top-left with gradient ring when unviewed
 *  • Username label at bottom
 *  • "Add Story" card first (animated + badge)
 */
import { useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, Zap } from "lucide-react";
import { CreatePulse } from "./CreatePulse";
import { openPulseViewer } from "./PulseViewer";
import { usePulseFeed } from "@/lib/usePulse";
import { useAppStore } from "@/lib/store";
import { useState } from "react";
import type { PulseFeedGroup } from "@/lib/pulseClient";

/* ── Dimensions ─────────────────────────────────────────────────────────── */
const CARD_W = 88;
const CARD_H = 148;

/* ── Single story card ──────────────────────────────────────────────────── */
interface StoryCardProps {
  group:     PulseFeedGroup;
  allGroups: PulseFeedGroup[];
  groupIdx:  number;
  isMe?:     boolean;
  onAddPulse?: () => void;
}

function StoryCard({ group, allGroups, groupIdx, isMe, onAddPulse }: StoryCardProps) {
  const { user, has_unviewed } = group;
  const hasAny  = group.pulses.length > 0;
  const viewed  = !has_unviewed;
  const initials = (user.name ?? user.username ?? "?").charAt(0).toUpperCase();

  const firstPulse = group.pulses[0] ?? null;
  const bgMedia    = (firstPulse?.type === "image" || firstPulse?.type === "video")
    ? (firstPulse.media_url ?? null)
    : null;
  const isVideo = firstPulse?.type === "video";

  const handleTap = useCallback(() => {
    if (!hasAny) { onAddPulse?.(); return; }
    const firstUnviewed = group.pulses.findIndex((p) => !p.is_viewed);
    openPulseViewer(allGroups, groupIdx, firstUnviewed >= 0 ? firstUnviewed : 0);
  }, [hasAny, group.pulses, allGroups, groupIdx, onAddPulse]);

  const ringGradient = hasAny && !viewed
    ? "linear-gradient(135deg,#8338ec,#ff006e)"
    : "rgba(255,255,255,0.22)";

  return (
    <motion.div
      whileTap={{ scale: 0.95 }}
      onClick={handleTap}
      className="flex-shrink-0 cursor-pointer"
      style={{ width: CARD_W, height: CARD_H }}
    >
      <div
        className="relative w-full h-full overflow-hidden"
        style={{ borderRadius: 16, background: "#1c1c1e" }}
      >
        {/* ── Background layer ── */}
        {bgMedia ? (
          isVideo ? (
            <video
              src={bgMedia}
              className="absolute inset-0 h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={bgMedia}
              className="absolute inset-0 h-full w-full object-cover"
              alt=""
              loading="lazy"
            />
          )
        ) : isMe ? (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(160deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)" }}
          />
        ) : user.avatar_url ? (
          <img
            src={user.avatar_url}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ filter: "blur(10px) brightness(0.45)", transform: "scale(1.15)" }}
            alt=""
            loading="lazy"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(160deg,rgba(131,56,236,0.35),rgba(255,0,110,0.25))" }}
          />
        )}

        {/* ── Bottom gradient scrim ── */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.72) 100%)" }}
        />

        {/* ── "Create Story" card center content ── */}
        {isMe && !hasAny && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                className="h-[50px] w-[50px] rounded-full object-cover"
                style={{ border: "2px solid rgba(255,255,255,0.25)" }}
              />
            ) : (
              <div
                className="h-[50px] w-[50px] rounded-full flex items-center justify-center text-xl font-bold text-white"
                style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
              >
                {initials}
              </div>
            )}
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full"
              style={{
                background: "linear-gradient(135deg,#8338ec,#ff006e)",
                border: "2.5px solid #0a0a0a",
                marginTop: -6,
              }}
            >
              <Plus className="h-3.5 w-3.5 text-white" strokeWidth={2.8} />
            </div>
          </div>
        )}

        {/* ── Avatar ring (top-left, for other users or self-with-stories) ── */}
        {(!isMe || hasAny) && (
          <div className="absolute top-2 left-2">
            <div
              style={{
                background: ringGradient,
                borderRadius: "50%",
                padding: 2,
                display: "inline-flex",
              }}
            >
              <div
                style={{
                  borderRadius: "50%",
                  overflow: "hidden",
                  width: 34,
                  height: 34,
                  border: "1.5px solid #0a0a0a",
                  background: "#0a0a0a",
                  flexShrink: 0,
                }}
              >
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    loading="lazy"
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "linear-gradient(135deg,#8338ec,#ff006e)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#fff",
                    }}
                  >
                    {initials}
                  </div>
                )}
              </div>
            </div>

            {/* Add-more badge for self with existing stories */}
            {isMe && hasAny && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.85 }}
                onClick={(e) => { e.stopPropagation(); onAddPulse?.(); }}
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 17,
                  height: 17,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg,#8338ec,#ff006e)",
                  border: "1.5px solid #0a0a0a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Add story"
              >
                <Plus style={{ width: 9, height: 9, color: "#fff" }} strokeWidth={3} />
              </motion.button>
            )}
          </div>
        )}

        {/* ── Bottom label ── */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{ padding: "0 7px 7px" }}
        >
          <span
            style={{
              display: "block",
              fontSize: 10.5,
              fontWeight: 600,
              color: "#fff",
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textShadow: "0 1px 4px rgba(0,0,0,0.9)",
            }}
          >
            {isMe
              ? hasAny ? "Your Story" : "Add Story"
              : (user.name ?? user.username ?? "Unknown")}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Loading skeleton ───────────────────────────────────────────────────── */
function StorySkeleton() {
  return (
    <div
      className="flex-shrink-0 shimmer"
      style={{ width: CARD_W, height: CARD_H, borderRadius: 16 }}
    />
  );
}

/* ── PulseBar ────────────────────────────────────────────────────────────── */
export function PulseBar() {
  const me = useAppStore((s) => s.user);
  const { groups, loading, refresh } = usePulseFeed();
  const [showCreate, setShowCreate] = useState(false);

  if (loading && groups.length === 0) {
    return (
      <div className="flex gap-2.5 overflow-x-auto hide-scrollbar px-4 py-3">
        {[1, 2, 3, 4].map((i) => <StorySkeleton key={i} />)}
      </div>
    );
  }

  const myGroup  = groups.find((g) => g.user.id === me?.id);
  const others   = groups.filter((g) => g.user.id !== me?.id);

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
      {/* Label row */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
        <Zap className="h-3.5 w-3.5" style={{ color: "var(--accent-primary)" }} fill="currentColor" />
        <span
          className="text-[11px] font-bold uppercase tracking-widest"
          style={{ color: "var(--accent-primary)" }}
        >
          Stories
        </span>
      </div>

      {/* Cards row */}
      <div className="flex gap-2.5 overflow-x-auto hide-scrollbar px-4 pb-3">
        {orderedGroups.map((group, i) => {
          const isMe      = group.user.id === me?.id;
          const viewerIdx = viewerGroups.findIndex((g) => g.user.id === group.user.id);
          return (
            <StoryCard
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

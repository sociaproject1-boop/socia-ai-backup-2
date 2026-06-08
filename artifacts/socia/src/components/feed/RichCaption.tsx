/**
 * RichCaption — renders a caption string with blue, clickable #hashtags
 * and @mentions, similar to TikTok / Instagram.
 *
 * Usage (inside any styled container that controls line-clamp / overflow):
 *   <p style={{ WebkitLineClamp: 3, ... }}>
 *     <RichCaption text={post.caption} />
 *   </p>
 *
 * Works with -webkit-line-clamp: the spans are inline elements that flow
 * naturally inside the parent <p>.
 */
import { memo } from "react";
import { useLocation } from "wouter";

/* ── Token types ─────────────────────────────────────────────────────────── */
type Segment =
  | { type: "text";    value:    string }
  | { type: "hashtag"; tag:      string }
  | { type: "mention"; username: string };

/* ── Tokenizer ───────────────────────────────────────────────────────────── */
/** Split a caption into plain-text / hashtag / mention segments. */
function tokenize(text: string): Segment[] {
  /* Matches #word (any Unicode letters) or @word (ASCII + dots) */
  const regex = /(\B#[\w\u0080-\uffff]+|\B@[\w.]+)/g;
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith("#")) {
      segments.push({ type: "hashtag", tag: raw.slice(1) });
    } else {
      segments.push({ type: "mention", username: raw.slice(1) });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

/* ── Link style ──────────────────────────────────────────────────────────── */
const LINK_STYLE: React.CSSProperties = {
  color:           "#60a5fa",  /* blue-400 — readable on both light & dark bg */
  cursor:          "pointer",
  textDecoration:  "none",
  fontWeight:      500,
};

/* ── Component ───────────────────────────────────────────────────────────── */
export const RichCaption = memo(function RichCaption({ text }: { text: string }) {
  const [, navigate] = useLocation();
  const segments = tokenize(text);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "hashtag") {
          return (
            <span
              key={i}
              style={LINK_STYLE}
              role="link"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/hashtag/${encodeURIComponent(seg.tag.toLowerCase())}`);
              }}
              onTouchEnd={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  navigate(`/hashtag/${encodeURIComponent(seg.tag.toLowerCase())}`);
                }
              }}
            >
              #{seg.tag}
            </span>
          );
        }

        if (seg.type === "mention") {
          return (
            <span
              key={i}
              style={LINK_STYLE}
              role="link"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/user/${encodeURIComponent(seg.username)}`);
              }}
              onTouchEnd={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  navigate(`/user/${encodeURIComponent(seg.username)}`);
                }
              }}
            >
              @{seg.username}
            </span>
          );
        }

        return <span key={i}>{seg.value}</span>;
      })}
    </>
  );
});

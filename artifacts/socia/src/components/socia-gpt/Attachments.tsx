import { useState } from "react";
import { Image as ImageIcon, Mic, Film, X, Loader2, FileWarning } from "lucide-react";
import type { ChatAttachment } from "@/lib/sociaGptClient";

/* ════════════════════════════════════════════════════════════════════════
   Composer side: small chip showing a pending attachment with a remove (x).
   Used while the user is staging files before pressing send.
   ════════════════════════════════════════════════════════════════════════ */

export interface PendingAttachment {
  id:       string;
  file:     File;
  kind:     "image" | "audio" | "video";
  /** Local object URL for the preview thumbnail (revoked on remove). */
  previewUrl: string;
  /** Set after a successful upload — populated by the parent. */
  uploaded?: ChatAttachment;
  /** Last error message (shown inline, lets the user retry). */
  error?:    string;
  /** True while the upload is in flight. */
  uploading?: boolean;
}

export function PendingChip({
  att, onRemove,
}: { att: PendingAttachment; onRemove: () => void }) {
  return (
    <div
      className="relative flex items-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] px-2 py-1.5"
      style={{ minWidth: 0 }}
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/40">
        {att.kind === "image" ? (
          <img src={att.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : att.kind === "video" ? (
          <Film className="h-4 w-4 text-white/60" />
        ) : (
          <Mic className="h-4 w-4 text-white/60" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11.5px] font-medium text-white/85">{att.file.name}</div>
        <div className="flex items-center gap-1.5 text-[10px] text-white/45">
          {att.uploading && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          {att.error && <FileWarning className="h-2.5 w-2.5 text-red-400" />}
          <span className={att.error ? "text-red-300" : ""}>
            {att.error
              ? att.error
              : att.uploading
                ? "Uploading…"
                : att.uploaded
                  ? `${(att.file.size / 1_048_576).toFixed(2)} MB`
                  : "Ready"}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove attachment"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Bubble side: render the user's saved attachments inside their chat bubble.
   ════════════════════════════════════════════════════════════════════════ */

export function BubbleAttachments({ items }: { items: ChatAttachment[] }) {
  if (!items?.length) return null;
  return (
    <div className="mb-2 flex flex-col gap-1.5">
      {items.map((a, i) => <BubbleAttachment key={`${a.url}_${i}`} att={a} />)}
    </div>
  );
}

function BubbleAttachment({ att }: { att: ChatAttachment }) {
  const [errored, setErrored] = useState(false);

  if (att.kind === "image") {
    return (
      <a href={att.url} target="_blank" rel="noreferrer" className="block">
        {errored ? (
          <FilePill att={att} icon={<ImageIcon className="h-3.5 w-3.5" />} />
        ) : (
          <img
            src={att.url}
            alt={att.name}
            loading="lazy"
            onError={() => setErrored(true)}
            className="max-h-72 w-full max-w-[260px] rounded-xl border border-white/15 object-cover"
          />
        )}
      </a>
    );
  }
  if (att.kind === "video") {
    return (
      <video
        src={att.url}
        controls
        playsInline
        preload="metadata"
        className="max-h-72 w-full max-w-[260px] rounded-xl border border-white/15 bg-black"
      />
    );
  }
  return <audio src={att.url} controls preload="metadata" className="w-full max-w-[260px]" />;
}

function FilePill({ att, icon }: { att: ChatAttachment; icon: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] text-white/85">
      {icon}
      <span className="truncate max-w-[180px]">{att.name}</span>
    </div>
  );
}

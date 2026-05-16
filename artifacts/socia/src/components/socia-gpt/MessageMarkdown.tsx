import { useState } from "react";
import { useLocation } from "wouter";
import { Copy, Check, Wand2, Image as ImageIcon, Film } from "lucide-react";
import { useAppStore } from "@/lib/store";

/**
 * Tiny safe markdown renderer for assistant replies.
 *
 * Supports a small, intentionally-narrow subset:
 *   • fenced code blocks ```lang ... ```  (the `prompt` lang gets special treatment)
 *   • inline `code`
 *   • **bold**
 *   • [link text](https://url)  — only http(s) URLs allowed
 *   • headings: lines starting with "# " or "## "
 *   • bullet lines starting with "- " or "• "
 *   • numbered lines starting with "1. ", "2. ", …
 *   • blank line = paragraph break
 *
 * Does NOT use innerHTML — every node is a real React element, so there's no
 * XSS surface even when the model decides to write something unexpected.
 */

type Block =
  | { type: "code"; lang: string; text: string }
  | { type: "p"; text: string }
  | { type: "h"; level: 1 | 2; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = /^```(\w+)?\s*$/.exec(line);
    if (fence) {
      const lang = (fence[1] || "").toLowerCase();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence (or EOF)
      blocks.push({ type: "code", lang, text: buf.join("\n") });
      continue;
    }

    // Heading
    const h = /^(#{1,2})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ type: "h", level: h[1].length as 1 | 2, text: h[2] });
      i += 1;
      continue;
    }

    // Bullet list
    if (/^[\-•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\-•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[\-•]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Numbered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Paragraph (gather until blank line or special)
    if (line.trim() === "") { i += 1; continue; }
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^[\-•]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^#{1,2}\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "p", text: buf.join("\n") });
  }
  return blocks;
}

/** Render inline `code`, **bold**, and [text](url) in a single line. */
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  /* Tokenise on `code`, **bold**, or [text](http(s)://url) in one pass. */
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
    if (m[1]) {
      const inner = m[1].slice(1, -1);
      out.push(
        <code
          key={`c${key++}`}
          className="rounded bg-white/10 px-1 py-0.5 text-[12px] text-fuchsia-200"
        >
          {inner}
        </code>,
      );
    } else if (m[2]) {
      const inner = m[2].slice(2, -2);
      out.push(
        <strong key={`b${key++}`} className="font-semibold text-white">
          {inner}
        </strong>,
      );
    } else if (m[3]) {
      /* Capture group: [label](url) */
      const linkM = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(m[3]);
      if (linkM) {
        out.push(
          <a
            key={`l${key++}`}
            href={linkM[2]}
            target="_blank"
            rel="noreferrer noopener"
            className="text-fuchsia-300 underline-offset-2 hover:underline"
          >
            {linkM[1]}
          </a>,
        );
      } else {
        out.push(m[3]);
      }
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out;
}

export function MessageMarkdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className="space-y-3 text-[14px] leading-relaxed text-white/85">
      {blocks.map((b, i) => {
        if (b.type === "code") {
          if (b.lang === "prompt") return <PromptBlock key={i} text={b.text} />;
          return <CodeBlock key={i} text={b.text} lang={b.lang} />;
        }
        if (b.type === "h") {
          const cls = b.level === 1
            ? "font-display text-[18px] font-bold text-white"
            : "font-display text-[15.5px] font-semibold text-white";
          return <div key={i} className={cls}>{inline(b.text)}</div>;
        }
        if (b.type === "ul") {
          return (
            <ul key={i} className="ml-4 list-disc space-y-1">
              {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={i} className="ml-5 list-decimal space-y-1">
              {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
            </ol>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {inline(b.text)}
          </p>
        );
      })}
    </div>
  );
}

function CodeBlock({ text, lang }: { text: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-white/40">{lang || "code"}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="inline-flex items-center gap-1 text-[11px] text-white/60 hover:text-white"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[12.5px] text-white/80">
        <code>{text}</code>
      </pre>
    </div>
  );
}

/** Special "prompt" code-block: shows Use-this-prompt action chips. */
function PromptBlock({ text }: { text: string }) {
  const [, navigate] = useLocation();
  const setActivePrompt = useAppStore((s) => s.setActivePrompt);
  const [copied, setCopied] = useState(false);
  const trimmed = text.trim();

  function useFor(target: "/create/prompt-image" | "/create/prompt-video") {
    setActivePrompt(trimmed);
    navigate(target);
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{
        borderColor: "rgba(168,85,247,0.35)",
        background:
          "linear-gradient(135deg, rgba(168,85,247,0.16) 0%, rgba(236,72,153,0.10) 100%)",
      }}
    >
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-200">
          <Wand2 className="h-3 w-3" />
          Generated Prompt
        </span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(trimmed);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="inline-flex items-center gap-1 text-[11px] text-white/70 hover:text-white"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap p-3 text-[13px] leading-relaxed text-white">
        <code>{trimmed}</code>
      </pre>
      <div className="flex gap-2 p-2">
        <button
          onClick={() => useFor("/create/prompt-image")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[12.5px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Use for Image
        </button>
        <button
          onClick={() => useFor("/create/prompt-video")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[12.5px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}
        >
          <Film className="h-3.5 w-3.5" />
          Use for Video
        </button>
      </div>
    </div>
  );
}

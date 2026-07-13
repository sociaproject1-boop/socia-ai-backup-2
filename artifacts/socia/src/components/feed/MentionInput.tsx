/**
 * MentionInput — textarea with live @mention autocomplete.
 *
 * Detects `@word` being typed, queries the user search API, and shows
 * a floating dropdown above the textarea. Selecting a suggestion inserts
 * `@username ` at the cursor position.
 *
 * Drop-in replacement for <textarea> in Upload.tsx.
 * All standard textarea props (value, onChange, placeholder, rows, …) pass through.
 */
import { useState, useRef, useEffect, useCallback } from "react";

interface MentionUser {
  id:         string;
  name:       string;
  username:   string;
  avatar_url: string | null;
}

interface MentionInputProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  value:    string;
  onChange: (value: string) => void;
}

interface MentionInputExtraProps {
  /** When true, the textarea grows to fit its content instead of scrolling (X-style composer). */
  autoGrow?: boolean;
}

export function MentionInput({ value, onChange, className, style, autoGrow, ...rest }: MentionInputProps & MentionInputExtraProps) {
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const [query,       setQuery]       = useState<string | null>(null); /* null = dropdown closed */
  const [mentionAt,   setMentionAt]   = useState<number>(0);           /* index of the @ in value */
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [loading,     setLoading]     = useState(false);
  const abortRef     = useRef<AbortController | null>(null);

  /* ── Auto-grow height to fit content (covers typing + programmatic inserts) ── */
  useEffect(() => {
    if (!autoGrow) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, autoGrow]);

  /* ── Detect @mention being typed ────────────────────────────────────── */
  const detectMention = useCallback((text: string, cursor: number) => {
    const beforeCursor = text.slice(0, cursor);
    /* Match @ that is either at start or after whitespace/newline */
    const match = beforeCursor.match(/(^|[\s\n])@([\w.]*)$/);
    if (match) {
      const atIdx = beforeCursor.lastIndexOf("@");
      setMentionAt(atIdx);
      setQuery(match[2]); /* the text typed after @ */
    } else {
      setQuery(null);
      setSuggestions([]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text   = e.target.value.slice(0, 2200);
    const cursor = e.target.selectionStart ?? text.length;
    onChange(text);
    detectMention(text, cursor);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    detectMention(el.value, el.selectionStart ?? el.value.length);
  };

  /* ── Debounced search ────────────────────────────────────────────────── */
  useEffect(() => {
    if (query === null || query.length === 0) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?type=users&q=${encodeURIComponent(query)}&limit=6`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions((data.users ?? []).slice(0, 6));
      } catch (e: any) {
        if (e?.name !== "AbortError") setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query]);

  /* ── Insert selected user ────────────────────────────────────────────── */
  const selectUser = useCallback((user: MentionUser) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursor  = textarea.selectionStart ?? value.length;
    const before  = value.slice(0, mentionAt);       /* before the @ */
    const after   = value.slice(cursor);             /* after cursor */
    const insert  = `@${user.username} `;
    const newText = before + insert + after;

    onChange(newText.slice(0, 2200));
    setQuery(null);
    setSuggestions([]);

    /* Restore focus + move cursor to end of inserted mention */
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = mentionAt + insert.length;
      textarea.setSelectionRange(pos, pos);
    });
  }, [value, mentionAt, onChange]);

  /* Close dropdown if user clicks elsewhere */
  const handleBlur = () => {
    /* Small delay so onPointerDown on a suggestion can fire first */
    setTimeout(() => {
      setQuery(null);
      setSuggestions([]);
    }, 200);
  };

  const showDropdown = query !== null && (suggestions.length > 0 || loading);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyUp={handleKeyUp}
        onBlur={handleBlur}
        className={className}
        style={style}
        {...rest}
      />

      {/* ── Mention suggestion dropdown ──────────────────────────────── */}
      {showDropdown && (
        <div
          className="absolute left-0 right-0 rounded-2xl overflow-hidden shadow-2xl"
          style={{
            bottom:         "calc(100% + 6px)",
            zIndex:         200,
            background:     "rgba(16,16,22,0.98)",
            border:         "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {loading && suggestions.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="h-4 w-4 rounded-full border border-white/20 border-t-white/60 animate-spin" />
              <span className="text-[13px] app-text-muted">Searching…</span>
            </div>
          )}

          {suggestions.map((user) => (
            <button
              key={user.id}
              /* onPointerDown + preventDefault keeps textarea focused */
              onPointerDown={(e) => { e.preventDefault(); selectUser(user); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
              style={{ transition: "background 0.1s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="h-9 w-9 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className="h-9 w-9 rounded-full flex-shrink-0 grid place-items-center text-sm font-bold text-white"
                  style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}
                >
                  {(user.name || user.username || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold app-text truncate leading-tight">{user.name}</p>
                <p className="text-[11px] app-text-muted truncate leading-tight">@{user.username}</p>
              </div>
              <span
                className="text-[11px] font-medium flex-shrink-0"
                style={{ color: "var(--accent-primary)" }}
              >
                @{user.username}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

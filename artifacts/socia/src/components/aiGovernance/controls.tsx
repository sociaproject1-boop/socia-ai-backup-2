/**
 * Shared primitives for the AI Routing Platform tabs (Routing + Connections).
 * Plain, functional controls styled to match the existing command-center shell.
 */
import { Check } from "lucide-react";

export function Toggle({
  on, onChange, disabled, labelOn = "On", labelOff = "Off",
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  labelOn?: string;
  labelOff?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition disabled:opacity-40 ${
        on ? "bg-emerald-500/80" : "bg-white/15"
      }`}
      aria-pressed={on}
      aria-label={on ? labelOn : labelOff}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          on ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold">
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-400" : "bg-rose-400"}`} />
      <span className={ok ? "text-emerald-200" : "text-rose-200"}>{label}</span>
    </span>
  );
}

export function PhpField({
  label, value, onChange, placeholder = "No cap",
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide app-text-muted">{label}</span>
      <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] px-2.5 py-1.5">
        <span className="text-xs app-text-muted">₱</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => {
            const v = e.target.value.trim();
            onChange(v === "" ? null : Math.max(0, Number(v)));
          }}
          className="w-full bg-transparent text-sm app-text outline-none placeholder:app-text-muted"
        />
      </div>
    </label>
  );
}

export function SaveBar({
  dirty, saving, savedAt, onSave, onReset, errors, error,
}: {
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;
  onSave: () => void;
  onReset: () => void;
  errors: string[];
  error: string | null;
}) {
  const showSaved = !dirty && savedAt && Date.now() - savedAt < 4000;
  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-2 border-t border-white/10 bg-[var(--app-bg,#0b0b12)]/95 px-4 py-3 backdrop-blur">
      {(errors.length > 0 || error) && (
        <div className="mb-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
          {error ? <div>{error}</div> : null}
          {errors.map((e, i) => (
            <div key={i}>• {e}</div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] app-text-muted">
          {showSaved ? (
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <Check className="h-3.5 w-3.5" /> Saved — live now
            </span>
          ) : dirty ? (
            "Unsaved changes"
          ) : (
            "All changes saved"
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={!dirty || saving}
            className="rounded-full px-3 py-1.5 text-xs font-bold app-text-muted hover:app-text disabled:opacity-30"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-black text-black transition hover:bg-emerald-400 disabled:opacity-30"
          >
            {saving ? "Saving…" : "Save & apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

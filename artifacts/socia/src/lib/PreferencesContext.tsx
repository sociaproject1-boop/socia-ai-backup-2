import { createContext, useContext, useState, ReactNode } from "react";
import { Preferences, Notifs, loadPrefs, savePrefs, applyPrefs, DEFAULTS, AccentKey, TextSizeKey } from "./preferences";

interface PrefCtx {
  prefs: Preferences;
  setAccent:   (v: AccentKey)   => void;
  setTextSize: (v: TextSizeKey) => void;
  setNotif:    (key: keyof Notifs, v: boolean) => void;
}

const Ctx = createContext<PrefCtx>({
  prefs: DEFAULTS,
  setAccent:   () => {},
  setTextSize: () => {},
  setNotif:    () => {},
});

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<Preferences>(() => {
    const p = loadPrefs();
    // apply synchronously before first paint
    applyPrefs(p);
    return p;
  });

  const commit = (next: Preferences) => {
    setState(next);
    savePrefs(next);
    applyPrefs(next);
  };

  const setAccent   = (v: AccentKey)   => commit({ ...prefs, accent: v });
  const setTextSize = (v: TextSizeKey) => commit({ ...prefs, textSize: v });
  const setNotif    = (key: keyof Notifs, v: boolean) =>
    commit({ ...prefs, notifs: { ...prefs.notifs, [key]: v } });

  return (
    <Ctx.Provider value={{ prefs, setAccent, setTextSize, setNotif }}>
      {children}
    </Ctx.Provider>
  );
}

export const usePreferences = () => useContext(Ctx);

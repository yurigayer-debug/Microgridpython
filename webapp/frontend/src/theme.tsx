import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Cores lidas dos tokens CSS (paleta validada com scripts/validate_palette.js; ver styles.css).
export interface Colors {
  fv: string; bat: string; rede: string; exp: string; gridbat: string; gerador: string; neutral: string;
  text: string; text2: string; muted: string; grid: string; surface: string; critical: string; good: string;
}

function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    fv: v("--s-fv"), bat: v("--s-bat"), rede: v("--s-rede"), exp: v("--s-export"), gridbat: v("--s-gridbat"),
    gerador: v("--s-gerador"), neutral: v("--s-neutral"), text: v("--text-primary"), text2: v("--text-secondary"),
    muted: v("--text-muted"), grid: v("--grid"), surface: v("--surface-1"), critical: v("--critical"),
    good: v("--good"),
  };
}

interface ThemeCtx { colors: Colors; toggle: () => void }
const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<Colors>(() => readColors());
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("tema"); } catch { /* sem storage */ }
    if (saved) document.documentElement.dataset.theme = saved;
    setColors(readColors());
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setColors(readColors());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const toggle = useCallback(() => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("tema", next); } catch { /* sem storage */ }
    setColors(readColors());
  }, []);
  const value = useMemo(() => ({ colors, toggle }), [colors, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("ThemeProvider ausente");
  return c;
}

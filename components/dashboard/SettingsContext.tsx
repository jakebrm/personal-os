'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// User-controlled UI preferences, persisted to localStorage:
//  • which dashboard cards are hidden
//  • which top-rail tabs are hidden
//  • which visual theme is active
//  • which background ambience is active
const CARDS_KEY = 'dashboard-hidden-cards';
const TABS_KEY  = 'dashboard-hidden-tabs';
const THEME_KEY = 'dashboard-theme';
const BG_KEY    = 'dashboard-bg';

export type Theme = 'classic' | 'modern';
export type Bg = 'midnight' | 'ocean' | 'aurora' | 'sunset' | 'cloud' | 'linen';
export const BG_IDS: Bg[] = ['midnight', 'ocean', 'aurora', 'sunset', 'cloud', 'linen'];

type Ctx = {
  hiddenCards: Set<string>;
  hiddenTabs:  Set<string>;
  theme: Theme;
  bg: Bg;
  toggleCard: (id: string) => void;
  toggleTab:  (id: string) => void;
  setTheme:   (t: Theme) => void;
  setBg:      (b: Bg) => void;
};

const SettingsCtx = createContext<Ctx | null>(null);

function loadSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const s = localStorage.getItem(key);
    return s ? new Set(JSON.parse(s) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function persist(key: string, set: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* ignore */ }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [hiddenCards, setHiddenCards] = useState<Set<string>>(new Set());
  const [hiddenTabs,  setHiddenTabs]  = useState<Set<string>>(new Set());
  const [theme, setThemeState]        = useState<Theme>('classic');
  const [bg, setBgState]              = useState<Bg>('midnight');

  // Load after mount (client-only) — matches the dashboard layout's behaviour.
  useEffect(() => {
    setHiddenCards(loadSet(CARDS_KEY));
    setHiddenTabs(loadSet(TABS_KEY));
    try {
      if (localStorage.getItem(THEME_KEY) === 'modern') setThemeState('modern');
      const b = localStorage.getItem(BG_KEY) as Bg | null;
      if (b && b !== 'midnight' && BG_IDS.includes(b)) setBgState(b);
    } catch { /* ignore */ }
  }, []);

  // dashboard.css keys its theme + background overrides off these attributes.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.bg = bg;
  }, [theme, bg]);

  const toggleCard = useCallback((id: string) => {
    setHiddenCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      persist(CARDS_KEY, next);
      return next;
    });
  }, []);

  const toggleTab = useCallback((id: string) => {
    setHiddenTabs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      persist(TABS_KEY, next);
      return next;
    });
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  }, []);

  const setBg = useCallback((b: Bg) => {
    setBgState(b);
    try { localStorage.setItem(BG_KEY, b); } catch { /* ignore */ }
  }, []);

  return (
    <SettingsCtx.Provider value={{ hiddenCards, hiddenTabs, theme, bg, toggleCard, toggleTab, setTheme, setBg }}>
      {children}
    </SettingsCtx.Provider>
  );
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

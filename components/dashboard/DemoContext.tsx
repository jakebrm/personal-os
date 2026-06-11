'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type DemoCtx = {
  isDemo:      boolean;
  setDemo:     (v: boolean) => void;
  notifyWrite: () => void;
};

const Ctx = createContext<DemoCtx>({ isDemo:false, setDemo:()=>{}, notifyWrite:()=>{} });

export function useDemo() { return useContext(Ctx); }

const LS_KEY = 'personal-os-demo-mode';

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [isDemo,  setIsDemo]  = useState(false);
  const [toast,   setToast]   = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Initialise from localStorage + URL param (client-only)
  useEffect(() => {
    const stored   = localStorage.getItem(LS_KEY) === 'true';
    const urlParam = new URLSearchParams(window.location.search).get('demo') === 'true';
    const active   = stored || urlParam;
    if (active) {
      setIsDemo(true);
      localStorage.setItem(LS_KEY, 'true');
    }
  }, []);

  const setDemo = useCallback((v: boolean) => {
    setIsDemo(v);
    localStorage.setItem(LS_KEY, String(v));
    const url = new URL(window.location.href);
    if (v) url.searchParams.set('demo', 'true');
    else   url.searchParams.delete('demo');
    window.history.replaceState({}, '', url.toString());
  }, []);

  const notifyWrite = useCallback(() => {
    setToast(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 2500);
  }, []);

  return (
    <Ctx.Provider value={{ isDemo, setDemo, notifyWrite }}>
      {children}
      {toast && (
        <div style={{
          position:'fixed', bottom:72, left:'50%', transform:'translateX(-50%)',
          background:'oklch(0.22 0.04 30)', border:'1px solid oklch(0.30 0.04 30)',
          color:'oklch(0.80 0.12 85)', fontSize:12, fontFamily:'var(--mono)',
          padding:'7px 14px', borderRadius:8, zIndex:9999,
          whiteSpace:'nowrap', pointerEvents:'none',
          letterSpacing:'0.04em',
        }}>
          Changes not saved in demo mode
        </div>
      )}
    </Ctx.Provider>
  );
}

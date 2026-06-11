'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { fetchWeather, type WeatherData } from '@/lib/weather';
import { useDemo }        from './DemoContext';
import { DEMO_WEATHER }   from '@/lib/demoData';

type WxCtx = { wx: WeatherData | null; loading: boolean };

const Ctx = createContext<WxCtx>({ wx: null, loading: true });

export function useWeather() { return useContext(Ctx); }

const REFRESH_MS = 30 * 60 * 1000;

export function WeatherProvider({ children }: { children: React.ReactNode }) {
  const { isDemo } = useDemo();
  const [wx,      setWx]      = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemo) { setWx(DEMO_WEATHER); setLoading(false); return; }

    let cancelled = false;

    const load = () => {
      fetchWeather()
        .then(data  => { if (!cancelled) { setWx(data); setLoading(false); } })
        .catch(()   => { if (!cancelled) setLoading(false); });
    };

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [isDemo]);

  return <Ctx.Provider value={{ wx, loading }}>{children}</Ctx.Provider>;
}

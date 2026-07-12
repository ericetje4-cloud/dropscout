// ===========================================================================
// Thème : light / dark / system (adaptatif ou manuel).
// Persistance dans IndexedDB (settings) + respect de prefers-color-scheme.
// ===========================================================================

import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '@/lib/db';

export type ThemeMode = 'light' | 'dark' | 'system';

const MEDIA = window.matchMedia('(prefers-color-scheme: dark)');

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (MEDIA.matches ? 'dark' : 'light') : mode;
}

function applyTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#0f172a' : '#0ea5e9');
  }
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>(
    MEDIA.matches ? 'dark' : 'light',
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getSetting('theme');
      if (cancelled) return;
      const m: ThemeMode = stored ?? 'system';
      setMode(m);
      const r = resolveTheme(m);
      setResolved(r);
      applyTheme(r);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'system') return;
    const onChange = () => {
      const r = MEDIA.matches ? 'dark' : 'light';
      setResolved(r);
      applyTheme(r);
    };
    MEDIA.addEventListener('change', onChange);
    return () => MEDIA.removeEventListener('change', onChange);
  }, [mode]);

  async function changeMode(m: ThemeMode) {
    setMode(m);
    const r = resolveTheme(m);
    setResolved(r);
    applyTheme(r);
    await setSetting('theme', m);
  }

  async function toggle() {
    await changeMode(resolved === 'dark' ? 'light' : 'dark');
  }

  return { mode, resolved, changeMode, toggle };
}

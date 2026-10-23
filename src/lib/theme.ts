import { useEffect, useState } from 'react';
import type { Appearance } from './storage';

const query = () => window.matchMedia('(prefers-color-scheme: dark)');

/** The theme actually in use: the chosen one, or the device's when set to Automatic. */
export function useResolvedTheme(appearance: Appearance): 'light' | 'dark' {
  const [systemDark, setSystemDark] = useState(() => query().matches);
  useEffect(() => {
    const mq = query();
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  if (appearance === 'system') return systemDark ? 'dark' : 'light';
  return appearance;
}

/** Apply the theme to the page and the browser chrome (status bar on iOS). */
export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#f2f2f7');
}

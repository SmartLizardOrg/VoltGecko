import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
export type TextSize = 'standard' | 'large';
export const THEME_STORAGE_KEY = 'planner.theme';
export const TEXT_SIZE_STORAGE_KEY = 'planner.textSize';
export function resolveTheme(saved: string | null, prefersDark: boolean): Theme {
  return saved === 'light' || saved === 'dark' ? saved : prefersDark ? 'dark' : 'light';
}
export function resolveTextSize(saved: string | null): TextSize { return saved === 'large' ? 'large' : 'standard'; }
function read(key: string): string | null { try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Settings still work when storage is unavailable. */ } }
const media = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let theme = resolveTheme(read(THEME_STORAGE_KEY), media?.matches ?? false);
let textSize = resolveTextSize(read(TEXT_SIZE_STORAGE_KEY));
const listeners = new Set<() => void>();
const subscribe = (callback: () => void) => { listeners.add(callback); return () => { listeners.delete(callback); }; };
export const getTheme = () => theme;
export const getTextSize = () => textSize;
function apply() {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.textSize = textSize;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111e29' : '#ffffff');
  }
  listeners.forEach(callback => callback());
}
export function setTheme(next: Theme) {
  if (next !== 'light' && next !== 'dark') return;
  theme = next; write(THEME_STORAGE_KEY, next); apply();
}
export function setTextSize(next: TextSize) {
  if (next !== 'standard' && next !== 'large') return;
  textSize = next; write(TEXT_SIZE_STORAGE_KEY, next); apply();
}
export function useAppearance() {
  return { theme: useSyncExternalStore(subscribe, getTheme, getTheme), textSize: useSyncExternalStore(subscribe, getTextSize, getTextSize), setTheme, setTextSize };
}
if (typeof window !== 'undefined') {
  apply();
  media?.addEventListener('change', event => { if (!['light', 'dark'].includes(read(THEME_STORAGE_KEY) ?? '')) { theme = resolveTheme(null, event.matches); apply(); } });
  window.addEventListener('storage', event => {
    if (event.key === THEME_STORAGE_KEY || event.key === TEXT_SIZE_STORAGE_KEY || event.key === null) {
      theme = resolveTheme(read(THEME_STORAGE_KEY), media?.matches ?? false);
      textSize = resolveTextSize(read(TEXT_SIZE_STORAGE_KEY)); apply();
    }
  });
}

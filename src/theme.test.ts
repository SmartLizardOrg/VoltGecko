import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTextSize, getTheme, resolveTextSize, resolveTheme, setTextSize, setTheme, TEXT_SIZE_STORAGE_KEY, THEME_STORAGE_KEY } from './theme';

afterEach(() => { setTheme('light'); setTextSize('standard'); vi.unstubAllGlobals(); });

describe('appearance preferences', () => {
  it('uses system theme only when there is no valid saved choice', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
    expect(resolveTheme('invalid', true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('offers a readable default and preserves the large text choice', () => {
    expect(resolveTextSize(null)).toBe('standard');
    expect(resolveTextSize('invalid')).toBe('standard');
    expect(resolveTextSize('large')).toBe('large');
    setTextSize('large'); expect(getTextSize()).toBe('large');
    setTextSize('standard'); expect(getTextSize()).toBe('standard');
    setTheme('dark'); expect(getTheme()).toBe('dark');
    setTheme('light'); expect(getTheme()).toBe('light');
  });
  it('stores theme and text size separately and works when storage rejects writes', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => values.set(key, value) });
    setTheme('dark'); setTextSize('large');
    expect(values.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(values.get(TEXT_SIZE_STORAGE_KEY)).toBe('large');
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('disabled'); } });
    expect(() => { setTheme('light'); setTextSize('standard'); }).not.toThrow();
    expect(getTheme()).toBe('light'); expect(getTextSize()).toBe('standard');
  });
});

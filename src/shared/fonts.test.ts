import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FONT_KEY,
  FONT_PRESETS,
  getFontPreset,
  resolveFontStack,
} from './fonts';

describe('fonts', () => {
  it('has a default preset and unique keys', () => {
    const keys = FONT_PRESETS.map((p) => p.key);
    expect(keys).toContain(DEFAULT_FONT_KEY);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('resolveFontStack falls back to default for unknown / empty keys', () => {
    const def = FONT_PRESETS.find((p) => p.key === DEFAULT_FONT_KEY)!;
    expect(resolveFontStack('does-not-exist')).toBe(def.stack);
    expect(resolveFontStack(undefined)).toBe(def.stack);
    expect(resolveFontStack('')).toBe(def.stack);
  });

  it('getFontPreset returns matching preset for known keys', () => {
    for (const p of FONT_PRESETS) {
      expect(getFontPreset(p.key)).toBe(p);
    }
  });

  it('every stack ends with a generic family for safe fallback', () => {
    const generics = /(sans-serif|serif|monospace|cursive|system-ui)$/;
    for (const p of FONT_PRESETS) {
      expect(p.stack.trim()).toMatch(generics);
    }
  });
});

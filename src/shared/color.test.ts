import { describe, it, expect } from 'vitest';
import { normalizeHex, isValidHex, COLOR_PRESETS } from './color';

describe('normalizeHex', () => {
  it('accepts 6-digit hex with and without hash', () => {
    expect(normalizeHex('#aabbcc')).toBe('#aabbcc');
    expect(normalizeHex('aabbcc')).toBe('#aabbcc');
  });
  it('expands 3-digit shorthand', () => {
    expect(normalizeHex('#fa0')).toBe('#ffaa00');
    expect(normalizeHex('abc')).toBe('#aabbcc');
  });
  it('lowercases input', () => {
    expect(normalizeHex('#AABBCC')).toBe('#aabbcc');
    expect(normalizeHex('#FFF')).toBe('#ffffff');
  });
  it('trims whitespace', () => {
    expect(normalizeHex('  #fff  ')).toBe('#ffffff');
  });
  it('rejects invalid input', () => {
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('#gggggg')).toBeNull();
    expect(normalizeHex('rgb(1,2,3)')).toBeNull();
  });
});

describe('isValidHex', () => {
  it('matches normalizeHex result', () => {
    expect(isValidHex('#fff')).toBe(true);
    expect(isValidHex('abc')).toBe(true);
    expect(isValidHex('nope')).toBe(false);
  });
});

describe('COLOR_PRESETS', () => {
  it('all preset values are normalized hex', () => {
    for (const p of COLOR_PRESETS) {
      expect(normalizeHex(p.value)).toBe(p.value);
    }
  });
});

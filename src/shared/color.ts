export interface ColorPreset {
  name: string;
  value: string;
}

export const COLOR_PRESETS: ColorPreset[] = [
  { name: '白', value: '#ffffff' },
  { name: '黑', value: '#000000' },
  { name: '红', value: '#ef4444' },
  { name: '橙', value: '#f97316' },
  { name: '黄', value: '#eab308' },
  { name: '绿', value: '#22c55e' },
  { name: '青', value: '#06b6d4' },
  { name: '蓝', value: '#3b82f6' },
  { name: '紫', value: '#a855f7' },
  { name: '粉', value: '#ec4899' },
];

/**
 * Normalize a user-entered color code into `#rrggbb` form.
 * Accepts: `ffffff`, `#fff`, `#FFFFFF`, etc. Returns null if invalid.
 */
export function normalizeHex(input: string): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (!s.startsWith('#')) s = '#' + s;
  if (/^#[0-9a-f]{3}$/.test(s)) {
    s =
      '#' +
      s
        .slice(1)
        .split('')
        .map((c) => c + c)
        .join('');
  }
  return /^#[0-9a-f]{6}$/.test(s) ? s : null;
}

export function isValidHex(input: string): boolean {
  return normalizeHex(input) !== null;
}

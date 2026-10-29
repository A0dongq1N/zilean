import { DEFAULT_FONT_KEY, FONT_PRESETS } from '@shared/fonts';

export interface FontField {
  element: HTMLSelectElement;
  getValue(): string;
  setValue(key: string | undefined): void;
  onChange(cb: (key: string) => void): void;
}

/**
 * A `<select>` for picking a danmaku font preset. Each `<option>` is rendered
 * in its own font stack so the dropdown itself works as a live preview.
 *
 * The select's own typeface remains the host's default font; only options adopt
 * the preset font. This keeps the closed-state label readable in all host pages.
 */
export function createFontField(initial?: string): FontField {
  const select = document.createElement('select');
  select.className = 'zl-font-field';

  for (const preset of FONT_PRESETS) {
    const opt = document.createElement('option');
    opt.value = preset.key;
    opt.textContent = preset.label;
    opt.style.fontFamily = preset.stack;
    select.appendChild(opt);
  }

  select.value = initial && FONT_PRESETS.some((p) => p.key === initial) ? initial : DEFAULT_FONT_KEY;

  let listener: ((key: string) => void) | null = null;
  select.addEventListener('change', () => {
    listener?.(select.value);
  });

  return {
    element: select,
    getValue: () => select.value,
    setValue(key) {
      select.value = key && FONT_PRESETS.some((p) => p.key === key) ? key : DEFAULT_FONT_KEY;
    },
    onChange(cb) {
      listener = cb;
    },
  };
}

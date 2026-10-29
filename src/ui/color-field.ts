import { COLOR_PRESETS, normalizeHex } from '@shared/color';

export interface ColorField {
  element: HTMLElement;
  getValue(): string;
  setValue(v: string): void;
  onChange(cb: (value: string) => void): void;
}

/**
 * A composite color input: preset swatches + native color picker + free-text hex input.
 * All three stay in sync; invalid hex text leaves the current value untouched.
 * Uses class names under `.zl-color-field` so both the content Shadow DOM and the
 * options page can style it with matching selectors.
 */
export function createColorField(initial = '#ffffff'): ColorField {
  const root = document.createElement('div');
  root.className = 'zl-color-field';

  const swatches = document.createElement('div');
  swatches.className = 'zl-color-swatches';
  for (const p of COLOR_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'zl-color-swatch';
    btn.style.background = p.value;
    btn.title = `${p.name} (${p.value})`;
    btn.dataset.color = p.value;
    swatches.appendChild(btn);
  }

  const custom = document.createElement('div');
  custom.className = 'zl-color-custom';

  const picker = document.createElement('input');
  picker.type = 'color';
  picker.className = 'zl-color-picker';

  const hex = document.createElement('input');
  hex.type = 'text';
  hex.className = 'zl-color-hex';
  hex.placeholder = '#ffffff';
  hex.spellcheck = false;
  hex.autocapitalize = 'off';
  hex.maxLength = 7;

  custom.appendChild(picker);
  custom.appendChild(hex);
  root.appendChild(swatches);
  root.appendChild(custom);

  let current = normalizeHex(initial) ?? '#ffffff';
  let listener: ((v: string) => void) | null = null;

  const refreshDom = (syncHexInput: boolean) => {
    picker.value = current;
    if (syncHexInput) hex.value = current;
    for (const el of swatches.querySelectorAll<HTMLElement>('.zl-color-swatch')) {
      el.classList.toggle('active', el.dataset.color?.toLowerCase() === current);
    }
  };

  const set = (raw: string, emit: boolean): void => {
    const n = normalizeHex(raw);
    if (!n) return;
    current = n;
    refreshDom(true);
    if (emit) listener?.(current);
  };

  swatches.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.zl-color-swatch') as HTMLElement | null;
    if (!target?.dataset.color) return;
    e.preventDefault();
    set(target.dataset.color, true);
  });

  picker.addEventListener('input', () => set(picker.value, true));

  hex.addEventListener('input', () => {
    const n = normalizeHex(hex.value);
    if (!n) return;
    current = n;
    picker.value = n;
    for (const el of swatches.querySelectorAll<HTMLElement>('.zl-color-swatch')) {
      el.classList.toggle('active', el.dataset.color?.toLowerCase() === current);
    }
    listener?.(current);
  });
  hex.addEventListener('blur', () => {
    hex.value = current;
  });

  refreshDom(true);

  return {
    element: root,
    getValue: () => current,
    setValue: (v: string) => set(v, false),
    onChange(cb) {
      listener = cb;
    },
  };
}

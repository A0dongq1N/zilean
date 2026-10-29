import { createId, upsertMemo } from '@shared/storage';
import { suggestPatternForUrl } from '@shared/match';
import type { MatchMode, Memo } from '@shared/types';
import { createColorField, type ColorField } from '@ui/color-field';
import { createFontField, type FontField } from '@ui/font-field';
import { createVoiceField, type VoiceField } from '@ui/voice-field';

export interface QuickAddHost {
  root: ShadowRoot;
  onSaved: () => void;
}

export class QuickAddPanel {
  private el: HTMLElement;
  private patternInput!: HTMLInputElement;
  private modeSelect!: HTMLSelectElement;
  private textInput!: HTMLTextAreaElement;
  private colorField!: ColorField;
  private fontField!: FontField;
  private voice!: VoiceField;
  private sizeInput!: HTMLInputElement;
  private host: QuickAddHost;

  constructor(host: QuickAddHost) {
    this.host = host;
    this.el = document.createElement('div');
    this.el.className = 'zl-quick-add';
    this.el.innerHTML = `
      <h3>添加备忘</h3>
      <label>
        备忘内容
        <div class="zl-voice-wrap">
          <textarea data-field="text" placeholder="比如：这里有个 bug，记得修"></textarea>
        </div>
      </label>
      <div class="zl-quick-add-row">
        <label>
          匹配模式
          <select data-field="mode">
            <option value="exact">精确 URL</option>
            <option value="prefix">路径前缀</option>
            <option value="domain">域名</option>
            <option value="regex">正则</option>
          </select>
        </label>
        <label>
          URL / 模式
          <input data-field="pattern" type="text" />
        </label>
      </div>
      <label>
        颜色
        <div data-field="color-mount"></div>
      </label>
      <div class="zl-quick-add-row">
        <label>
          字体
          <div data-field="font-mount"></div>
        </label>
        <label>
          字号(px)
          <input data-field="size" type="number" min="10" max="72" />
        </label>
      </div>
      <div class="zl-quick-add-actions">
        <button class="zl-btn secondary" data-action="cancel">取消</button>
        <button class="zl-btn primary" data-action="save">保存</button>
      </div>
    `;
    this.textInput = this.el.querySelector('[data-field="text"]') as HTMLTextAreaElement;
    this.voice = createVoiceField(this.textInput);
    this.textInput.parentElement?.appendChild(this.voice.button);
    this.modeSelect = this.el.querySelector('[data-field="mode"]') as HTMLSelectElement;
    this.patternInput = this.el.querySelector('[data-field="pattern"]') as HTMLInputElement;
    this.sizeInput = this.el.querySelector('[data-field="size"]') as HTMLInputElement;

    this.colorField = createColorField('#ffffff');
    const colorMount = this.el.querySelector('[data-field="color-mount"]') as HTMLElement;
    colorMount.appendChild(this.colorField.element);

    this.fontField = createFontField();
    const fontMount = this.el.querySelector('[data-field="font-mount"]') as HTMLElement;
    fontMount.appendChild(this.fontField.element);

    this.modeSelect.addEventListener('change', () => {
      this.patternInput.value = suggestPatternForUrl(
        location.href,
        this.modeSelect.value as MatchMode,
      );
    });

    this.el.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      this.close();
    });
    this.el.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      this.save();
    });
  }

  get element(): HTMLElement {
    return this.el;
  }

  open(defaults?: Partial<Memo>): void {
    this.textInput.value = defaults?.text ?? '';
    const mode: MatchMode = defaults?.matchMode ?? 'exact';
    this.modeSelect.value = mode;
    this.patternInput.value = defaults?.pattern ?? suggestPatternForUrl(location.href, mode);
    this.colorField.setValue(defaults?.color ?? '#ffffff');
    this.fontField.setValue(defaults?.fontFamily);
    this.sizeInput.value = String(defaults?.fontSize ?? '');
    this.el.classList.add('open');
    this.textInput.focus();
  }

  close(): void {
    this.voice.stop();
    this.el.classList.remove('open');
  }

  private async save(): Promise<void> {
    const text = this.textInput.value.trim();
    if (!text) {
      this.textInput.focus();
      return;
    }
    const pattern = this.patternInput.value.trim();
    if (!pattern) {
      this.patternInput.focus();
      return;
    }
    const now = Date.now();
    const memo: Memo = {
      id: createId(),
      pattern,
      matchMode: this.modeSelect.value as MatchMode,
      text,
      color: this.colorField.getValue(),
      fontFamily: this.fontField.getValue(),
      fontSize: numberOrUndef(this.sizeInput.value),
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    await upsertMemo(memo);
    this.close();
    this.host.onSaved();
  }
}

function numberOrUndef(v: string): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

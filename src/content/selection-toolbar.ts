import { sendRuntimeMessage } from '@shared/messages';

const MIN_CHARS = 2;

export interface SelectionToolbarOptions {
  onDanmaku?(text: string): void;
}

/**
 * Sider-style floating toolbar that appears next to a text selection.
 * Ignores editable fields so it never fights the page's own caret.
 */
export class SelectionToolbar {
  private el: HTMLElement;
  private opts: SelectionToolbarOptions;
  private hideTimer: number | null = null;

  constructor(opts: SelectionToolbarOptions = {}) {
    this.opts = opts;
    this.el = document.createElement('div');
    this.el.className = 'zl-sel';
    this.el.innerHTML = `
      <button type="button" data-act="add">钉住</button>
      <button type="button" data-act="danmaku">飘过</button>
      <span class="zl-sel-div" aria-hidden="true"></span>
      <button type="button" data-act="panel">打开</button>
    `;

    this.el.addEventListener('mousedown', (e) => e.preventDefault());
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      const text = this.currentText();
      if (!act) return;
      if (act === 'add') {
        void sendRuntimeMessage({ type: 'zilean/open-side-panel', draftText: text || undefined });
      } else if (act === 'panel') {
        void sendRuntimeMessage({ type: 'zilean/open-side-panel' });
      } else if (act === 'danmaku' && text) {
        this.opts.onDanmaku?.(text);
      }
      this.hide();
    });

    document.addEventListener('mouseup', () => this.scheduleShow(), true);
    document.addEventListener('keyup', () => this.scheduleShow(), true);
    document.addEventListener('scroll', () => this.hide(), true);
    document.addEventListener('mousedown', (e) => {
      if (!e.composedPath().includes(this.el)) this.hide();
    }, true);
  }

  get element(): HTMLElement {
    return this.el;
  }

  private scheduleShow(): void {
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = null;
      this.showIfNeeded();
    }, 40);
  }

  private showIfNeeded(): void {
    const text = this.currentText();
    const sel = window.getSelection();
    if (!text || text.length < MIN_CHARS || !sel || sel.rangeCount === 0 || this.isEditableTarget()) {
      this.hide();
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) {
      this.hide();
      return;
    }
    const top = Math.max(8, rect.top - 44);
    const left = clamp(rect.left + rect.width / 2 - 86, 8, window.innerWidth - 180);
    this.el.style.top = top + 'px';
    this.el.style.left = left + 'px';
    this.el.classList.add('open');
  }

  private hide(): void {
    this.el.classList.remove('open');
  }

  private currentText(): string {
    return (window.getSelection()?.toString() ?? '').replace(/\s+/g, ' ').trim();
  }

  private isEditableTarget(): boolean {
    const node = window.getSelection()?.anchorNode;
    const el = node instanceof Element ? node : node?.parentElement;
    if (!el) return false;
    return Boolean(el.closest('input, textarea, [contenteditable="true"], [contenteditable=""]'));
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

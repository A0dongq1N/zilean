import { buildSelector, describeElement, isPickableElement, querySelectorSafe } from '@shared/selector';
import { sendRuntimeMessage } from '@shared/messages';
import type { Memo } from '@shared/types';

const MAX_HITS = 20;

interface Hit {
  el: Element;
  memos: Memo[];
}

export class ElementHints {
  private layer: HTMLElement;
  private box: HTMLElement;
  private tip: HTMLElement;
  private memos: Memo[] = [];
  private hits: Hit[] = [];
  private picking = false;
  private hoverEl: Element | null = null;
  private observer: MutationObserver | null = null;
  private refreshTimer: number | null = null;

  constructor() {
    this.layer = document.createElement('div');
    this.layer.className = 'zl-inspect';
    this.box = document.createElement('div');
    this.box.className = 'zl-inspect-box';
    this.tip = document.createElement('div');
    this.tip.className = 'zl-inspect-tip';
    const banner = document.createElement('div');
    banner.className = 'zl-inspect-banner';
    banner.textContent = '把鼠标移到要提醒的按钮或文字上，点一下。Esc 取消';
    this.layer.append(banner, this.box, this.tip);
    this.layer.hidden = true;

    document.addEventListener('mousemove', (e) => this.onMove(e), true);
    document.addEventListener('click', (e) => this.onClick(e), true);
    document.addEventListener('focusin', (e) => this.onFocus(e), true);
    document.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('scroll', () => this.paint(), true);
    window.addEventListener('resize', () => this.paint());
  }

  get element(): HTMLElement {
    return this.layer;
  }

  setMemos(memos: Memo[]): void {
    this.memos = memos.filter((memo) => memo.enabled && memo.selector);
    this.rebuild();
    this.watch(this.memos.length > 0);
  }

  startPick(): void {
    this.picking = true;
    this.hoverEl = null;
    this.layer.classList.add('picking');
    this.box.style.visibility = 'hidden';
    this.tip.textContent = '点一下，钉住这个元素';
    this.show();
  }

  stopPick(): void {
    this.picking = false;
    this.layer.classList.remove('picking');
    this.hoverEl = null;
    this.hide();
  }

  private rebuild(): void {
    const map = new Map<Element, Memo[]>();
    for (const memo of this.memos) {
      if (!memo.selector) continue;
      for (const el of querySelectorSafe(memo.selector).slice(0, MAX_HITS)) {
        const list = map.get(el) ?? [];
        list.push(memo);
        map.set(el, list);
      }
    }
    this.hits = [...map.entries()].map(([el, next]) => ({ el, memos: next }));
  }

  private watch(on: boolean): void {
    this.observer?.disconnect();
    this.observer = null;
    if (!on || !document.body) return;
    this.observer = new MutationObserver(() => {
      if (this.refreshTimer != null) window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => {
        this.refreshTimer = null;
        this.rebuild();
      }, 240);
    });
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  private onMove(event: MouseEvent): void {
    const el = this.elementFromEvent(event);
    if (this.picking) {
      this.hoverEl = el;
      this.paint();
      return;
    }
    const hit = el ? this.hits.find((item) => item.el === el || item.el.contains(el)) : undefined;
    this.hoverEl = hit?.el ?? null;
    if (hit) {
      this.tip.textContent = hit.memos.map((memo) => memo.text).join('\n');
      this.show();
      this.paint();
      return;
    }
    this.hide();
  }

  private onClick(event: MouseEvent): void {
    if (!this.picking) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const el = this.elementFromEvent(event);
    this.stopPick();
    if (!el) return;
    void sendRuntimeMessage({
      type: 'zilean/element-picked',
      selector: buildSelector(el),
      label: describeElement(el),
    });
  }

  private onFocus(event: FocusEvent): void {
    if (this.picking) return;
    const el = event.target instanceof Element ? event.target : null;
    const hit = el ? this.hits.find((item) => item.el === el || item.el.contains(el)) : undefined;
    this.hoverEl = hit?.el ?? null;
    if (!hit) return;
    this.tip.textContent = hit.memos.map((memo) => memo.text).join('\n');
    this.show();
    this.paint();
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.picking) {
      event.preventDefault();
      this.stopPick();
    }
  }

  private elementFromEvent(event: MouseEvent): Element | null {
    const path = event.composedPath();
    for (const node of path) {
      if (node instanceof Element && node.id === 'zilean-root-host') return null;
    }
    const raw = document.elementFromPoint(event.clientX, event.clientY);
    if (!raw) return null;
    const host = raw.closest('#zilean-root-host');
    if (host) return null;
    return isPickableElement(raw) ? raw : null;
  }

  private paint(): void {
    if (!this.hoverEl || this.layer.hidden) {
      this.box.style.visibility = 'hidden';
      return;
    }
    this.box.style.visibility = 'visible';
    const rect = this.hoverEl.getBoundingClientRect();
    this.box.style.top = `${Math.max(0, rect.top)}px`;
    this.box.style.left = `${Math.max(0, rect.left)}px`;
    this.box.style.width = `${Math.max(0, rect.width)}px`;
    this.box.style.height = `${Math.max(0, rect.height)}px`;
    const tipTop = rect.top > 56 ? rect.top - 8 : rect.bottom + 8;
    this.tip.style.top = `${tipTop}px`;
    this.tip.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;
    this.tip.style.transform = rect.top > 56 ? 'translateY(-100%)' : 'none';
  }

  private show(): void {
    this.layer.hidden = false;
  }

  private hide(): void {
    if (this.picking) return;
    this.layer.hidden = true;
  }
}

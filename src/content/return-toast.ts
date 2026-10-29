/** Quiet reminder when this page already has memos. Shown once per URL per tab. */
export class ReturnToast {
  private el: HTMLElement;
  private hideTimer: number | null = null;

  constructor(private onOpen: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'zl-return';
    this.el.addEventListener('click', (e) => e.stopPropagation());
  }

  get element(): HTMLElement {
    return this.el;
  }

  show(count: number): void {
    if (count <= 0 || this.alreadySeen()) return;
    this.markSeen();
    this.render(count);
    this.el.classList.add('open');
    this.hideTimer = window.setTimeout(() => this.hide(), 7000);
  }

  hide(): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.el.classList.remove('open');
  }

  private alreadySeen(): boolean {
    try {
      return sessionStorage.getItem(this.storageKey()) === '1';
    } catch {
      return false;
    }
  }

  private markSeen(): void {
    try {
      sessionStorage.setItem(this.storageKey(), '1');
    } catch {
      /* private mode */
    }
  }

  private storageKey(): string {
    return `zilean-return:${location.href}`;
  }

  private render(count: number): void {
    const head = document.createElement('div');
    head.className = 'zl-return-head';

    const title = document.createElement('div');
    title.className = 'zl-return-title';
    title.textContent = `这一页有 ${count} 条备忘`;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'zl-return-x';
    close.textContent = '×';
    close.title = '关掉';
    close.setAttribute('aria-label', '关掉');
    close.addEventListener('click', () => this.hide());

    head.appendChild(title);
    head.appendChild(close);

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'zl-return-open';
    open.textContent = '打开侧栏';
    open.addEventListener('click', () => {
      this.hide();
      this.onOpen();
    });

    this.el.replaceChildren(head, open);
  }
}

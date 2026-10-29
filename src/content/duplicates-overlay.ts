import {
  pickDuplicateIdsToClose,
  type DuplicateGroup,
  type DuplicateTabInfo,
} from '@shared/duplicates';
import { sendRuntimeMessage, type CurrentDuplicateResponse } from '@shared/messages';

export class DuplicatesOverlay {
  private el: HTMLElement;
  private group: DuplicateGroup | null = null;
  private currentTabId: number | undefined;
  private autoCloseTimer: number | null = null;
  private fadeTimer: number | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'zl-dup-overlay';
    this.el.addEventListener('click', (e) => e.stopPropagation());
    this.renderEmpty();
  }

  get element(): HTMLElement {
    return this.el;
  }

  open(group: DuplicateGroup, currentTabId: number | undefined): void {
    this.group = group;
    this.currentTabId = currentTabId;
    this.render();
    this.el.classList.remove('closing');
    this.el.classList.add('open');
    this.scheduleAutoClose();
  }

  close(): void {
    this.clearTimers();
    this.el.classList.remove('open');
    this.el.classList.remove('closing');
  }

  update(group: DuplicateGroup | null, currentTabId: number | undefined): void {
    this.group = group;
    this.currentTabId = currentTabId;
    if (!group) {
      this.close();
      this.renderEmpty();
      return;
    }
    if (this.el.classList.contains('open')) this.render();
  }

  private renderEmpty(): void {
    this.el.replaceChildren();
  }

  private scheduleAutoClose(): void {
    this.clearTimers();
    this.autoCloseTimer = window.setTimeout(() => {
      this.el.classList.add('closing');
      this.fadeTimer = window.setTimeout(() => this.close(), 280);
    }, 5000);
  }

  private clearTimers(): void {
    if (this.autoCloseTimer !== null) {
      window.clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
    if (this.fadeTimer !== null) {
      window.clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private render(): void {
    if (!this.group) {
      this.renderEmpty();
      return;
    }

    const header = document.createElement('div');
    header.className = 'zl-dup-header';

    const title = document.createElement('div');
    title.className = 'zl-dup-title';
    title.textContent = `同一地址开了 ${this.group.tabs.length} 个`;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'zl-dup-close';
    closeBtn.textContent = '×';
    closeBtn.title = '关闭';
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);

    const url = document.createElement('div');
    url.className = 'zl-dup-url';
    url.textContent = this.group.urlSample;
    url.title = this.group.urlSample;

    const list = document.createElement('div');
    list.className = 'zl-dup-list';
    for (const tab of this.group.tabs) {
      list.appendChild(this.renderTab(tab));
    }

    const footer = document.createElement('div');
    footer.className = 'zl-dup-footer';

    const closeOthers = document.createElement('button');
    closeOthers.type = 'button';
    closeOthers.className = 'zl-btn danger';
    closeOthers.textContent = '只留这一页';
    const otherIds = pickDuplicateIdsToClose(this.group, this.currentTabId);
    closeOthers.disabled = otherIds.length === 0;
    closeOthers.addEventListener('click', () => {
      if (closeOthers.disabled) return;
      closeOthers.disabled = true;
      void (async () => {
        await sendRuntimeMessage({
          type: 'zilean/keep-one-duplicate',
          key: this.group?.key ?? '',
          keepTabId: this.currentTabId,
        });
        await this.refreshFromRuntime();
      })();
    });
    footer.appendChild(closeOthers);

    this.el.replaceChildren(header, url, list, footer);
  }

  private renderTab(tab: DuplicateTabInfo): HTMLElement {
    const row = document.createElement('div');
    row.className = 'zl-dup-tab';
    const isCurrent = tab.id === this.currentTabId;
    row.classList.toggle('current', isCurrent);

    const favicon = document.createElement('img');
    favicon.className = 'zl-dup-favicon';
    favicon.alt = '';
    if (tab.favIconUrl) favicon.src = tab.favIconUrl;

    const main = document.createElement('div');
    main.className = 'zl-dup-main';

    const title = document.createElement('div');
    title.className = 'zl-dup-tab-title';
    title.textContent = tab.title || '未命名页面';

    const meta = document.createElement('div');
    meta.className = 'zl-dup-tab-meta';
    meta.textContent = `窗口 ${tab.windowId} · Tab ${tab.id}`;

    main.appendChild(title);
    main.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'zl-dup-actions';

    if (isCurrent) {
      const badge = document.createElement('span');
      badge.className = 'zl-dup-current-badge';
      badge.textContent = '当前页';
      actions.appendChild(badge);
    } else {
      const activate = document.createElement('button');
      activate.type = 'button';
      activate.textContent = '切换';
      activate.addEventListener('click', () => {
        void sendRuntimeMessage({
          type: 'zilean/activate-tab',
          tabId: tab.id,
          windowId: tab.windowId,
        });
      });

      actions.appendChild(activate);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'danger';
    close.textContent = isCurrent ? '关闭当前页' : '关闭';
    close.addEventListener('click', () => {
      void (async () => {
        // Closing the current tab tears down this page, so the reply never arrives.
        await sendRuntimeMessage({ type: 'zilean/close-tab', tabId: tab.id });
        if (!isCurrent) {
          await this.refreshFromRuntime();
          return;
        }
        this.close();
      })();
    });

    actions.appendChild(close);

    row.appendChild(favicon);
    row.appendChild(main);
    row.appendChild(actions);
    return row;
  }

  private async refreshFromRuntime(): Promise<void> {
    const res = await sendRuntimeMessage<{ ok?: boolean } & CurrentDuplicateResponse>({
      type: 'zilean/get-current-duplicate',
    });

    if (!res?.ok || !res.enabled || !res.group) {
      this.update(null, res?.currentTabId);
      return;
    }

    this.update(res.group, res.currentTabId);
  }
}

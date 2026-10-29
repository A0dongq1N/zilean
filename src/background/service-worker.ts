import {
  filterCloseableTabIds,
  findDuplicateGroupForTab,
  groupDuplicates,
  pickDuplicateIdsToClose,
  type DuplicateGroup,
  type DuplicateTabInfo,
} from '@shared/duplicates';
import type { RuntimeMessage } from '@shared/messages';
import { getSettings, setSettings } from '@shared/storage';
import { DEFAULT_SETTINGS } from '@shared/types';

const DUP_NOTICE_INTERVAL_MS = 30_000;
const DUP_CHECK_ALARM_NAME = 'zilean-check-duplicates';
const DUP_CHECK_INTERVAL_MINUTES = 5;

type NotifyMode = 'throttled' | 'periodic' | 'silent';

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(['settings', 'memos']);
  const patch: Record<string, unknown> = {};
  if (!current.settings) patch.settings = DEFAULT_SETTINGS;
  if (!Array.isArray(current.memos)) patch.memos = [];
  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
});

// Let clicks on the toolbar icon open the side panel directly.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn('[zilean] setPanelBehavior failed', err));

class DuplicateRegistry {
  private groups: DuplicateGroup[] = [];
  private enabled = DEFAULT_SETTINGS.duplicateDetection;
  private lastDuplicateTabIds = new Set<number>();
  private noticeState = new Map<number, { key: string; ts: number }>();
  private pending: Promise<void> | null = null;

  scheduleRefresh(mode: NotifyMode = 'throttled'): void {
    this.pending ??= this.refresh(mode).finally(() => {
      this.pending = null;
    });
  }

  snapshot(): { groups: DuplicateGroup[]; enabled: boolean } {
    return { groups: this.groups, enabled: this.enabled };
  }

  async closeTabs(tabIds: number[], keepTabId?: number): Promise<void> {
    const live = await this.liveTabs();
    const toClose = filterCloseableTabIds(live, tabIds, keepTabId);
    if (toClose.length === 0) return;
    await chrome.tabs.remove(toClose);
    await this.refresh('throttled');
  }

  async keepOneDuplicate(key: string, keepTabId?: number): Promise<void> {
    const live = await this.liveTabs();
    const group = groupDuplicates(live).find((item) => item.key === key);
    if (!group) return;
    await this.closeTabs(pickDuplicateIdsToClose(group, keepTabId), keepTabId);
  }

  private async liveTabs(): Promise<DuplicateTabInfo[]> {
    const tabs = await chrome.tabs.query({});
    return tabs.flatMap((tab) => {
      if (tab.id == null || tab.windowId == null || !tab.url) return [];
      return [
        {
          id: tab.id,
          windowId: tab.windowId,
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
          active: tab.active,
        },
      ];
    });
  }

  async activateTab(tabId: number, windowId: number): Promise<void> {
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(windowId, { focused: true });
  }

  async checkNow(currentTabId?: number): Promise<{
    groups: DuplicateGroup[];
    enabled: boolean;
    group: DuplicateGroup | null;
    currentTabId?: number;
  }> {
    await this.refresh('silent');
    return {
      ...this.snapshot(),
      group: findDuplicateGroupForTab(this.groups, currentTabId),
      currentTabId,
    };
  }

  async checkAutomatically(): Promise<void> {
    await this.refresh('periodic');
  }

  private async refresh(mode: NotifyMode): Promise<void> {
    const settings = await getSettings();
    this.enabled = settings.duplicateDetection;

    const nextGroups = this.enabled ? groupDuplicates(await this.liveTabs()) : [];

    const previousDuplicateTabIds = this.lastDuplicateTabIds;
    const nextDuplicateTabIds = new Set<number>();
    for (const group of nextGroups) {
      for (const tab of group.tabs) nextDuplicateTabIds.add(tab.id);
    }

    this.groups = nextGroups;
    this.lastDuplicateTabIds = nextDuplicateTabIds;

    await Promise.all([
      this.broadcastSnapshot(),
      this.notifyChangedTabs(previousDuplicateTabIds, nextDuplicateTabIds, mode),
    ]);
  }

  private async broadcastSnapshot(): Promise<void> {
    await chrome.runtime
      .sendMessage({
        type: 'zilean/duplicates-snapshot',
        groups: this.groups,
        enabled: this.enabled,
      } satisfies RuntimeMessage)
      .catch(() => undefined);
  }

  private async notifyChangedTabs(
    previousDuplicateTabIds: Set<number>,
    nextDuplicateTabIds: Set<number>,
    mode: NotifyMode,
  ): Promise<void> {
    if (mode === 'silent') return;

    const now = Date.now();
    const affected = new Set([...previousDuplicateTabIds, ...nextDuplicateTabIds]);

    await Promise.all(
      Array.from(affected).map(async (tabId) => {
        const group = findDuplicateGroupForTab(this.groups, tabId);
        if (!group) {
          this.noticeState.delete(tabId);
          await this.sendToTab(tabId, {
            type: 'zilean/duplicates-changed',
            group: null,
            enabled: this.enabled,
            currentTabId: tabId,
          });
          return;
        }

        const last = this.noticeState.get(tabId);
        if (mode === 'throttled' && last?.key === group.key && now - last.ts < DUP_NOTICE_INTERVAL_MS) {
          return;
        }

        this.noticeState.set(tabId, { key: group.key, ts: now });
        await this.sendToTab(tabId, {
          type: 'zilean/duplicates-changed',
          group,
          enabled: this.enabled,
          currentTabId: tabId,
        });
      }),
    );
  }

  private async sendToTab(tabId: number, message: RuntimeMessage): Promise<void> {
    await chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
  }
}

const duplicateRegistry = new DuplicateRegistry();

const HANDLED_MESSAGE_TYPES = new Set<RuntimeMessage['type']>([
  'zilean/open-options',
  'zilean/get-duplicates',
  'zilean/get-current-duplicate',
  'zilean/check-duplicates',
  'zilean/close-tab',
  'zilean/close-tabs',
  'zilean/keep-one-duplicate',
  'zilean/activate-tab',
  'zilean/open-side-panel',
  'zilean/start-element-pick',
  'zilean/element-picked',
]);

chrome.runtime.onMessage.addListener((raw: RuntimeMessage, sender, sendResponse) => {
  // Only claim an async response for messages we actually answer; holding the
  // channel open for our own broadcasts would leave callers waiting forever.
  if (!raw?.type || !HANDLED_MESSAGE_TYPES.has(raw.type)) return false;

  handleMessage(raw, sender)
    .then(sendResponse)
    .catch((err) => {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  return true;
});

async function handleMessage(message: RuntimeMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (message?.type === 'zilean/open-options') {
    chrome.runtime.openOptionsPage();
    return { ok: true };
  }

  if (message?.type === 'zilean/get-duplicates') {
    return { ok: true, ...duplicateRegistry.snapshot() };
  }

  if (message?.type === 'zilean/get-current-duplicate') {
    const tabId = sender.tab?.id;
    const { groups, enabled } = duplicateRegistry.snapshot();
    return {
      ok: true,
      group: findDuplicateGroupForTab(groups, tabId),
      enabled,
      currentTabId: tabId,
    };
  }

  if (message?.type === 'zilean/check-duplicates') {
    return { ok: true, ...(await duplicateRegistry.checkNow(sender.tab?.id)) };
  }

  if (message?.type === 'zilean/close-tab') {
    await duplicateRegistry.closeTabs([message.tabId]);
    return { ok: true };
  }

  if (message?.type === 'zilean/close-tabs') {
    await duplicateRegistry.closeTabs(message.tabIds);
    return { ok: true };
  }

  if (message?.type === 'zilean/keep-one-duplicate') {
    await duplicateRegistry.keepOneDuplicate(message.key, message.keepTabId);
    return { ok: true };
  }

  if (message?.type === 'zilean/activate-tab') {
    await duplicateRegistry.activateTab(message.tabId, message.windowId);
    return { ok: true };
  }

  if (message?.type === 'zilean/open-side-panel') {
    await openSidePanel(sender, message.draftText);
    return { ok: true };
  }

  if (message?.type === 'zilean/start-element-pick') {
    return startElementPick();
  }

  if (message?.type === 'zilean/element-picked') {
    const settings = await getSettings();
    await setSettings({
      ...settings,
      draftSelector: message.selector,
      draftElementLabel: message.label,
    });
    const tab = sender.tab;
    const windowId = tab?.windowId ?? (await chrome.windows.getCurrent()).id;
    if (windowId != null) {
      const openOpts: chrome.sidePanel.OpenOptions = { windowId };
      if (tab?.id != null) openOpts.tabId = tab.id;
      await chrome.sidePanel.open(openOpts);
    }
    return { ok: true };
  }

  return { ok: false, error: 'Unknown message type' };
}

async function openSidePanel(
  sender: chrome.runtime.MessageSender,
  draftText?: string,
): Promise<void> {
  const tab = sender.tab;
  const windowId = tab?.windowId ?? (await chrome.windows.getCurrent()).id;
  if (windowId == null) return;

  const trimmed = draftText?.trim();
  if (trimmed) {
    const settings = await getSettings();
    await setSettings({ ...settings, draftMemoText: trimmed });
  }

  const contexts = await chrome.runtime.getContexts?.({
    contextTypes: [chrome.runtime.ContextType.SIDE_PANEL],
    windowIds: [windowId],
  });
  const isOpen = Boolean(contexts?.length);
  const closer = (chrome.sidePanel as { close?: (opts: { windowId: number }) => Promise<void> }).close;
  if (isOpen && !trimmed && closer) {
    await closer({ windowId });
    return;
  }

  const openOpts: chrome.sidePanel.OpenOptions = { windowId };
  if (tab?.id != null) openOpts.tabId = tab.id;
  await chrome.sidePanel.open(openOpts);
}

chrome.tabs.onCreated.addListener(() => duplicateRegistry.scheduleRefresh());
chrome.tabs.onRemoved.addListener(() => duplicateRegistry.scheduleRefresh());
chrome.tabs.onReplaced.addListener(() => duplicateRegistry.scheduleRefresh());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    duplicateRegistry.scheduleRefresh();
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'settings' in changes) {
    duplicateRegistry.scheduleRefresh();
  }
});

chrome.alarms.create(DUP_CHECK_ALARM_NAME, { periodInMinutes: DUP_CHECK_INTERVAL_MINUTES });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DUP_CHECK_ALARM_NAME) {
    duplicateRegistry.checkAutomatically().catch(() => undefined);
  }
});

async function startElementPick(): Promise<{ ok: true } | { ok: false; error: string }> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const url = tab?.url ?? '';
  if (tab?.id == null || isRestrictedUrl(url)) {
    return { ok: false, error: '这个页面选不了。请先打开一个普通网页（不要用扩展管理页）。' };
  }
  try {
    await sendPick(tab.id);
    return { ok: true };
  } catch {
    // Reloading the extension orphans already-open tabs; reload the page to inject again.
    await chrome.tabs.reload(tab.id);
    try {
      await waitForTabComplete(tab.id);
      await sendPick(tab.id);
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: '这个标签页里还没有 Zilean。请打开一个普通网页，或手动刷新后再点一次。',
      };
    }
  }
}

function isRestrictedUrl(url: string): boolean {
  return (
    /^(chrome|edge|about|chrome-extension|devtools|view-source):/i.test(url) ||
    url.startsWith('https://chrome.google.com/webstore') ||
    url.startsWith('https://chromewebstore.google.com')
  );
}

async function sendPick(tabId: number): Promise<void> {
  let last: unknown;
  for (let i = 0; i < 6; i += 1) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'zilean/start-element-pick' });
      return;
    } catch (err) {
      last = err;
      await delay(350);
    }
  }
  throw last instanceof Error ? last : new Error('no content script');
}

function waitForTabComplete(tabId: number, timeoutMs = 15000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (ok) resolve();
      else reject(new Error('timeout'));
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') finish(true);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') finish(true);
    }).catch(() => finish(false));
  }).then(() => delay(500));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

duplicateRegistry.scheduleRefresh();

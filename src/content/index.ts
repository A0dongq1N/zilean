import { filterMemosForUrl } from '@shared/match';
import { getAll, subscribe, setSettings } from '@shared/storage';
import {
  sendRuntimeMessage,
  type CurrentDuplicateResponse,
  type RuntimeMessage,
} from '@shared/messages';
import type { Memo, StorageShape } from '@shared/types';
import tokenCss from '../ui/tokens.css?inline';
import cssText from './overlay.css?inline';
import { DanmakuEngine } from './danmaku';
import { DuplicatesOverlay } from './duplicates-overlay';
import { ElementHints } from './element-hints';
import { FloatingButton } from './fab';
import { QuickAddPanel } from './quick-add';
import { ReturnToast } from './return-toast';
import { SelectionToolbar } from './selection-toolbar';

if (window.top === window.self) {
  bootstrap().catch((err) => console.warn('[zilean] bootstrap failed', err));
}

async function bootstrap(): Promise<void> {
  const { memos, settings } = await getAll();
  const { matched } = filterMemosForUrl(memos, location.href);
  const floating = matched.filter((memo) => !memo.selector);

  const shadowHost = document.createElement('div');
  shadowHost.id = 'zilean-root-host';
  shadowHost.className = 'zl-host';
  const shadow = shadowHost.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${cssText}\n${tokenCss}`;
  shadow.appendChild(style);

  const root = document.createElement('div');
  root.className = 'zl-root';
  shadow.appendChild(root);

  const quickAdd = new QuickAddPanel({
    root: shadow,
    onSaved: () => {
      /* storage subscription will refresh memos automatically */
    },
  });
  shadow.appendChild(quickAdd.element);

  const duplicatesOverlay = new DuplicatesOverlay();
  shadow.appendChild(duplicatesOverlay.element);

  const hints = new ElementHints();
  shadow.appendChild(hints.element);
  hints.setMemos(matched);

  const engine = new DanmakuEngine(root, {
    memos: floating,
    settings,
    loop: settings.loop,
    visible: settings.visibleByDefault && floating.length > 0,
  });

  const fab = new FloatingButton({
    edge: settings.fabEdge,
    topRatio: settings.fabTopRatio,
    autoHide: settings.fabAutoHide,
    onClick: () => {
      void sendRuntimeMessage({ type: 'zilean/open-side-panel' });
    },
    onMoved: ({ edge, topRatio }) => {
      setSettings({ ...settings, fabEdge: edge, fabTopRatio: topRatio }).catch(() => undefined);
    },
    onAnchorChange: (anchor) => {
      anchorPanel(quickAdd.element, anchor);
      anchorPanel(duplicatesOverlay.element, anchor);
    },
  });
  shadow.appendChild(fab.element);

  const returnToast = new ReturnToast(() => {
    void sendRuntimeMessage({ type: 'zilean/open-side-panel' });
  });
  shadow.appendChild(returnToast.element);
  returnToast.show(matched.filter((memo) => memo.enabled).length);

  const selection = new SelectionToolbar({
    onDanmaku: (text) => {
      engine.enqueueNotice({ id: 'sel-preview', text });
    },
  });
  shadow.appendChild(selection.element);

  document.documentElement.appendChild(shadowHost);

  if (settings.visibleByDefault && floating.length > 0) {
    engine.start();
  }

  const showDuplicateNotice = (state: CurrentDuplicateResponse): void => {
    duplicatesOverlay.update(state.group, state.currentTabId);
    if (!state.enabled || !state.group) {
      engine.clearNotices('dup-');
      return;
    }
    engine.enqueueNotice({
      id: `dup-${state.group.key}`,
      text: `发现 ${state.group.tabs.length} 个重复页面，点击查看`,
      onClick: () => {
        void sendRuntimeMessage<{ ok?: boolean } & CurrentDuplicateResponse>({
          type: 'zilean/get-current-duplicate',
        }).then((res) => {
          if (res?.ok && res.enabled && res.group) {
            duplicatesOverlay.open(res.group, res.currentTabId);
          } else {
            duplicatesOverlay.update(null, res?.currentTabId);
            engine.clearNotices('dup-');
          }
        });
      },
    });
  };

  void sendRuntimeMessage<{ ok?: boolean } & CurrentDuplicateResponse>({
    type: 'zilean/get-current-duplicate',
  }).then((res) => {
    if (res?.ok) showDuplicateNotice(res);
  });

  let memoSignature = '';
  let chronoshiftUntil: number | null = null;
  const floatingAt = (list: Memo[]) =>
    list.filter((memo) => !memo.selector && (chronoshiftUntil == null || memo.createdAt <= chronoshiftUntil));

  chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
    if (message.type === 'zilean/start-element-pick') {
      hints.startPick();
      return false;
    }
    if (message.type === 'zilean/chronoshift') {
      chronoshiftUntil = message.until;
      const nextFloating = floatingAt(matched);
      memoSignature = signatureOf(nextFloating);
      engine.setMemos(nextFloating);
      return false;
    }
    if (message.type !== 'zilean/duplicates-changed') return false;
    showDuplicateNotice({
      group: message.group,
      enabled: message.enabled,
      currentTabId: message.currentTabId,
    });
    return false;
  });

  applyFabState(fab.element, matched.length);

  memoSignature = signatureOf(floating);

  subscribe((state: StorageShape) => {
    const { matched: next } = filterMemosForUrl(state.memos, location.href);
    const nextFloating = floatingAt(next);
    Object.assign(settings, state.settings);
    engine.setSettings(state.settings);
    engine.setLoop(state.settings.loop);
    hints.setMemos(next);

    const nextSignature = signatureOf(nextFloating);
    if (nextSignature !== memoSignature) {
      memoSignature = nextSignature;
      engine.setMemos(nextFloating);
    }

    fab.setAutoHide(state.settings.fabAutoHide);
    fab.setPosition({ edge: state.settings.fabEdge, topRatio: state.settings.fabTopRatio });

    if (nextFloating.length > 0 && state.settings.visibleByDefault && !engine.isVisible()) {
      engine.show();
    }
    applyFabState(fab.element, next.length);
    updateMatchedCount(next);
  });

  function updateMatchedCount(next: Memo[]): void {
    (matched as Memo[]).length = 0;
    matched.push(...next);
  }
}

function applyFabState(fab: HTMLButtonElement, count: number): void {
  fab.classList.toggle('has-memos', count > 0);
  fab.title = count > 0
    ? `打开 Zilean 侧边栏 · ${count} 条备忘`
    : '打开 Zilean 侧边栏';
}

function signatureOf(memos: Memo[]): string {
  return memos.map((m) => `${m.id}:${m.updatedAt}`).join('|');
}

const PANEL_GAP_PX = 10;

function anchorPanel(panel: HTMLElement, anchor: { edge: 'left' | 'right'; top: number; size: number }): void {
  if (anchor.edge === 'left') {
    panel.style.left = '12px';
    panel.style.right = 'auto';
  } else {
    panel.style.right = '12px';
    panel.style.left = 'auto';
  }

  const viewportH = window.innerHeight || document.documentElement.clientHeight;
  if (anchor.top > 260) {
    panel.style.bottom = Math.max(12, viewportH - anchor.top + PANEL_GAP_PX) + 'px';
    panel.style.top = 'auto';
  } else {
    panel.style.top = anchor.top + anchor.size + PANEL_GAP_PX + 'px';
    panel.style.bottom = 'auto';
  }
}

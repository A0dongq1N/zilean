import type { DuplicateGroup } from './duplicates';

export interface RuntimeOk {
  ok: true;
}

export interface RuntimeError {
  ok: false;
  error: string;
}

export type RuntimeResult<T = undefined> = T extends undefined ? RuntimeOk | RuntimeError : (RuntimeOk & T) | RuntimeError;

export type RuntimeMessage =
  | { type: 'zilean/open-options' }
  | { type: 'zilean/get-duplicates' }
  | { type: 'zilean/get-current-duplicate' }
  | { type: 'zilean/check-duplicates' }
  | { type: 'zilean/duplicates-snapshot'; groups: DuplicateGroup[]; enabled: boolean }
  | {
      type: 'zilean/duplicates-changed';
      group: DuplicateGroup | null;
      enabled: boolean;
      currentTabId: number;
    }
  | { type: 'zilean/close-tab'; tabId: number }
  | { type: 'zilean/close-tabs'; tabIds: number[] }
  | { type: 'zilean/keep-one-duplicate'; key: string; keepTabId?: number }
  | { type: 'zilean/activate-tab'; tabId: number; windowId: number }
  | { type: 'zilean/open-side-panel'; draftText?: string }
  | { type: 'zilean/start-element-pick' }
  | { type: 'zilean/element-picked'; selector: string; label: string }
  | { type: 'zilean/chronoshift'; until: number | null };

export interface DuplicateSnapshotResponse {
  groups: DuplicateGroup[];
  enabled: boolean;
}

export interface CurrentDuplicateResponse {
  group: DuplicateGroup | null;
  enabled: boolean;
  currentTabId?: number;
}

export interface DuplicateCheckResponse extends DuplicateSnapshotResponse {
  group: DuplicateGroup | null;
  currentTabId?: number;
}

/**
 * Send a runtime message that never rejects.
 *
 * The channel dies for perfectly normal reasons: the service worker is suspended
 * mid-request, the unpacked extension is reloaded (orphaning already-injected
 * content scripts), or the message itself closes the tab that sent it. Callers
 * treat `undefined` as "no answer" so a dead channel can't surface as an
 * unhandled rejection on the host page.
 */
export async function sendRuntimeMessage<T>(message: RuntimeMessage): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch {
    return undefined;
  }
}

import {
  DEFAULT_SETTINGS,
  type Memo,
  type Settings,
  type StorageShape,
} from './types';

const KEYS = {
  memos: 'memos',
  settings: 'settings',
} as const;

export async function getAll(): Promise<StorageShape> {
  const raw = await chrome.storage.local.get([KEYS.memos, KEYS.settings]);
  const memos = Array.isArray(raw[KEYS.memos]) ? (raw[KEYS.memos] as Memo[]) : [];
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...((raw[KEYS.settings] as Partial<Settings> | undefined) ?? {}),
  };
  return { memos, settings };
}

export async function getMemos(): Promise<Memo[]> {
  const raw = await chrome.storage.local.get(KEYS.memos);
  return Array.isArray(raw[KEYS.memos]) ? (raw[KEYS.memos] as Memo[]) : [];
}

export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(KEYS.settings);
  return {
    ...DEFAULT_SETTINGS,
    ...((raw[KEYS.settings] as Partial<Settings> | undefined) ?? {}),
  };
}

export async function setMemos(memos: Memo[]): Promise<void> {
  await chrome.storage.local.set({ [KEYS.memos]: memos });
}

export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEYS.settings]: settings });
}

export async function upsertMemo(memo: Memo): Promise<Memo[]> {
  const memos = await getMemos();
  const idx = memos.findIndex((m) => m.id === memo.id);
  const next = idx >= 0 ? [...memos] : [...memos, memo];
  if (idx >= 0) next[idx] = memo;
  await setMemos(next);
  return next;
}

export async function removeMemo(id: string): Promise<Memo[]> {
  const memos = await getMemos();
  const next = memos.filter((m) => m.id !== id);
  await setMemos(next);
  return next;
}

export type StorageChangeHandler = (state: StorageShape) => void;

export function subscribe(handler: StorageChangeHandler): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: chrome.storage.AreaName,
  ) => {
    if (area !== 'local') return;
    if (!(KEYS.memos in changes) && !(KEYS.settings in changes)) return;
    getAll().then(handler).catch(() => undefined);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

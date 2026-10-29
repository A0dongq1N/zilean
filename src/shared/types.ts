export type MatchMode = 'exact' | 'prefix' | 'domain' | 'regex';

export interface Memo {
  id: string;
  pattern: string;
  matchMode: MatchMode;
  text: string;
  color?: string;
  fontSize?: number;
  /** Font preset key from `@shared/fonts`. Undefined → use settings default. */
  fontFamily?: string;
  /** CSS selector; when set, the memo is shown on that element instead of as danmaku. */
  selector?: string;
  /** Short label for the pinned element, e.g. `button · 提交`. */
  elementLabel?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export type FabEdge = 'left' | 'right';

export interface Settings {
  loop: boolean;
  visibleByDefault: boolean;
  duplicateDetection: boolean;
  defaultColor: string;
  defaultFontSize: number;
  /** Font preset key used when a memo doesn't specify its own. */
  defaultFontFamily: string;
  /** Which viewport edge the floating button snaps to. */
  fabEdge: FabEdge;
  /** Vertical position of the floating button as a 0..1 ratio of viewport height. */
  fabTopRatio: number;
  /** Tuck the floating button against the edge while idle. */
  fabAutoHide: boolean;
  /** One-shot text used to prefill the side-panel composer. */
  draftMemoText: string;
  /** One-shot selector from the on-page element picker. */
  draftSelector: string;
  draftElementLabel: string;
}

export interface StorageShape {
  memos: Memo[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  loop: true,
  visibleByDefault: true,
  duplicateDetection: true,
  defaultColor: '#ffffff',
  defaultFontSize: 22,
  defaultFontFamily: 'default',
  fabEdge: 'right',
  fabTopRatio: 0.42,
  fabAutoHide: true,
  draftMemoText: '',
  draftSelector: '',
  draftElementLabel: '',
};

export interface BackupFile {
  app: 'zilean';
  version: 1;
  exportedAt: number;
  memos: Memo[];
  settings: Settings;
}

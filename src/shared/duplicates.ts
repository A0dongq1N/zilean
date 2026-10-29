export interface DuplicateTabInfo {
  id: number;
  windowId: number;
  url: string;
  title?: string;
  favIconUrl?: string;
  active?: boolean;
}

export interface DuplicateGroup {
  key: string;
  urlSample: string;
  tabs: DuplicateTabInfo[];
}

const EXCLUDED_PROTOCOLS = new Set([
  'about:',
  'chrome:',
  'chrome-extension:',
  'edge:',
  'moz-extension:',
]);

/**
 * Normalize a URL for duplicate-tab detection.
 *
 * Current product rule: only fully identical URLs count as duplicates. That
 * means query strings and hash fragments are intentionally preserved.
 */
export function normalizeUrlForDup(url: string | undefined | null): string | null {
  const raw = url?.trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (EXCLUDED_PROTOCOLS.has(parsed.protocol)) return null;
  return parsed.href;
}

export function groupDuplicates(tabs: DuplicateTabInfo[]): DuplicateGroup[] {
  const map = new Map<string, DuplicateTabInfo[]>();

  for (const tab of tabs) {
    const key = normalizeUrlForDup(tab.url);
    if (!key) continue;
    const bucket = map.get(key) ?? [];
    bucket.push({ ...tab, url: key });
    map.set(key, bucket);
  }

  return Array.from(map.entries())
    .filter(([, bucket]) => bucket.length >= 2)
    .map(([key, bucket]) => ({
      key,
      urlSample: bucket[0]?.url ?? key,
      tabs: bucket.sort((a, b) => a.windowId - b.windowId || a.id - b.id),
    }))
    .sort((a, b) => b.tabs.length - a.tabs.length || a.urlSample.localeCompare(b.urlSample));
}

/** Close extras in a group, always leaving one tab open. */
export function pickDuplicateIdsToClose(
  group: DuplicateGroup,
  keepTabId?: number,
): number[] {
  if (group.tabs.length < 2) return [];
  const keep =
    group.tabs.find((tab) => tab.id === keepTabId) ??
    group.tabs.find((tab) => tab.active) ??
    group.tabs[0];
  if (!keep) return [];
  return group.tabs.filter((tab) => tab.id !== keep.id).map((tab) => tab.id);
}

/**
 * From a live tab list, drop any requested close that would wipe the last
 * remaining copy of that URL. Stale UI can send already-closed ids plus the
 * survivor; this must not close the survivor.
 */
export function filterCloseableTabIds(
  liveTabs: DuplicateTabInfo[],
  requestedIds: number[],
  keepTabId?: number,
): number[] {
  const requested = new Set(requestedIds.filter((id) => Number.isFinite(id)));
  if (requested.size === 0) return [];

  const byUrl = new Map<string, DuplicateTabInfo[]>();
  const ungrouped: DuplicateTabInfo[] = [];
  for (const tab of liveTabs) {
    const key = normalizeUrlForDup(tab.url);
    if (!key) {
      ungrouped.push(tab);
      continue;
    }
    const bucket = byUrl.get(key) ?? [];
    bucket.push({ ...tab, url: key });
    byUrl.set(key, bucket);
  }

  const close: number[] = [];
  const taken = new Set<number>();

  for (const bucket of byUrl.values()) {
    const targets = bucket.filter((tab) => requested.has(tab.id));
    if (targets.length === 0) continue;
    const untouched = bucket.some((tab) => !requested.has(tab.id));
    const doomed = untouched
      ? targets
      : targets.filter((tab) => {
          const keep =
            targets.find((item) => item.id === keepTabId) ??
            targets.find((item) => item.active) ??
            targets[0];
          return keep != null && tab.id !== keep.id;
        });
    for (const tab of doomed) {
      if (taken.has(tab.id)) continue;
      taken.add(tab.id);
      close.push(tab.id);
    }
  }

  for (const tab of ungrouped) {
    if (!requested.has(tab.id) || taken.has(tab.id)) continue;
    taken.add(tab.id);
    close.push(tab.id);
  }

  return close;
}

export function findDuplicateGroupForTab(
  groups: DuplicateGroup[],
  tabId: number | undefined,
): DuplicateGroup | null {
  if (tabId == null) return null;
  return groups.find((group) => group.tabs.some((tab) => tab.id === tabId)) ?? null;
}

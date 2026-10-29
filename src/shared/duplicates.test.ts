import { describe, expect, it } from 'vitest';
import {
  filterCloseableTabIds,
  groupDuplicates,
  normalizeUrlForDup,
  pickDuplicateIdsToClose,
  type DuplicateGroup,
  type DuplicateTabInfo,
} from './duplicates';

function tab(id: number, url: string, windowId = 1): DuplicateTabInfo {
  return { id, windowId, url, title: `Tab ${id}` };
}

describe('duplicates', () => {
  it('normalizes valid URLs while preserving query and hash', () => {
    expect(normalizeUrlForDup(' https://example.com/a?x=1#top ')).toBe(
      'https://example.com/a?x=1#top',
    );
  });

  it('excludes internal or inaccessible URLs', () => {
    expect(normalizeUrlForDup('')).toBeNull();
    expect(normalizeUrlForDup('about:blank')).toBeNull();
    expect(normalizeUrlForDup('chrome://extensions')).toBeNull();
    expect(normalizeUrlForDup('edge://settings')).toBeNull();
    expect(normalizeUrlForDup('chrome-extension://abc/options.html')).toBeNull();
  });

  it('groups fully identical URLs across windows', () => {
    const groups = groupDuplicates([
      tab(1, 'https://example.com/a', 1),
      tab(2, 'https://example.com/a', 2),
      tab(3, 'https://example.com/b', 1),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.tabs.map((t) => t.id)).toEqual([1, 2]);
  });

  it('does not group different hash fragments', () => {
    const groups = groupDuplicates([
      tab(1, 'https://example.com/a#one'),
      tab(2, 'https://example.com/a#two'),
    ]);

    expect(groups).toHaveLength(0);
  });

  it('does not group different query strings', () => {
    const groups = groupDuplicates([
      tab(1, 'https://example.com/a?x=1'),
      tab(2, 'https://example.com/a?x=2'),
    ]);

    expect(groups).toHaveLength(0);
  });

  it('closes extras but always keeps one tab', () => {
    const group: DuplicateGroup = {
      key: 'https://example.com/a',
      urlSample: 'https://example.com/a',
      tabs: [
        tab(1, 'https://example.com/a', 1),
        { ...tab(2, 'https://example.com/a', 1), active: true },
        tab(3, 'https://example.com/a', 2),
      ],
    };

    expect(pickDuplicateIdsToClose(group)).toEqual([1, 3]);
    expect(pickDuplicateIdsToClose(group, 3)).toEqual([1, 2]);
    expect(pickDuplicateIdsToClose({ ...group, tabs: [tab(1, 'https://example.com/a')] })).toEqual(
      [],
    );
  });

  it('does not close the last live tab of a URL even if stale ids ask for it', () => {
    const live = [tab(2, 'https://example.com/a')];
    expect(filterCloseableTabIds(live, [1, 2, 3])).toEqual([]);
    expect(filterCloseableTabIds(live, [2])).toEqual([]);
    expect(
      filterCloseableTabIds(
        [tab(1, 'https://example.com/a'), tab(2, 'https://example.com/a')],
        [2],
      ),
    ).toEqual([2]);
  });

  it('ignores single tabs and excluded URLs', () => {
    const groups = groupDuplicates([
      tab(1, 'https://example.com/a'),
      tab(2, 'chrome://extensions'),
      tab(3, 'chrome://extensions'),
    ]);

    expect(groups).toHaveLength(0);
  });
});

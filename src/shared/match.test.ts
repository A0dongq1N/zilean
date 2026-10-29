import { describe, it, expect } from 'vitest';
import { matchUrl, filterMemosForUrl, suggestPatternForUrl } from './match';
import type { Memo } from './types';

function memo(partial: Partial<Memo>): Memo {
  const now = Date.now();
  return {
    id: partial.id ?? 'm',
    pattern: partial.pattern ?? '',
    matchMode: partial.matchMode ?? 'exact',
    text: partial.text ?? 'hello',
    enabled: partial.enabled ?? true,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('matchUrl', () => {
  it('exact matches full url including query/hash', () => {
    const url = 'https://a.com/x?y=1#z';
    expect(matchUrl(url, url, 'exact')).toBe(true);
    expect(matchUrl(url, 'https://a.com/x', 'exact')).toBe(false);
  });

  it('prefix matches starting substring', () => {
    expect(matchUrl('https://a.com/foo/bar', 'https://a.com/foo', 'prefix')).toBe(true);
    expect(matchUrl('https://a.com/baz', 'https://a.com/foo', 'prefix')).toBe(false);
  });

  it('domain matches host and subdomains', () => {
    expect(matchUrl('https://a.com/x', 'a.com', 'domain')).toBe(true);
    expect(matchUrl('https://www.a.com/x', 'a.com', 'domain')).toBe(true);
    expect(matchUrl('https://notmyb.com/x', 'a.com', 'domain')).toBe(false);
    expect(matchUrl('https://aacom.com', 'a.com', 'domain')).toBe(false);
  });

  it('regex matches with pattern and is safe on invalid', () => {
    expect(matchUrl('https://a.com/user/42', '^https://a\\.com/user/\\d+$', 'regex')).toBe(true);
    expect(matchUrl('x', '[invalid', 'regex')).toBe(false);
  });

  it('returns false on empty pattern', () => {
    expect(matchUrl('https://a.com', '', 'exact')).toBe(false);
  });
});

describe('filterMemosForUrl', () => {
  it('filters enabled and matched memos; reports bad regex as issues', () => {
    const memos: Memo[] = [
      memo({ id: '1', pattern: 'https://a.com/x', matchMode: 'exact' }),
      memo({ id: '2', pattern: 'a.com', matchMode: 'domain' }),
      memo({ id: '3', pattern: '[bad', matchMode: 'regex' }),
      memo({ id: '4', pattern: 'b.com', matchMode: 'domain', enabled: false }),
    ];
    const { matched, issues } = filterMemosForUrl(memos, 'https://a.com/x');
    expect(matched.map((m) => m.id)).toEqual(['1', '2']);
    expect(issues).toHaveLength(1);
    expect(issues[0].memoId).toBe('3');
  });
});

describe('suggestPatternForUrl', () => {
  const url = 'https://a.com/foo?q=1#h';
  it('exact returns the full url', () => {
    expect(suggestPatternForUrl(url, 'exact')).toBe(url);
  });
  it('prefix returns origin+pathname', () => {
    expect(suggestPatternForUrl(url, 'prefix')).toBe('https://a.com/foo');
  });
  it('domain returns hostname', () => {
    expect(suggestPatternForUrl(url, 'domain')).toBe('a.com');
  });
  it('regex escapes special chars', () => {
    expect(suggestPatternForUrl(url, 'regex')).toBe('^https://a\\.com/foo');
  });
});

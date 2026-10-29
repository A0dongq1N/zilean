import type { MatchMode, Memo } from './types';

export interface MatchIssue {
  memoId: string;
  reason: string;
}

export function matchUrl(
  url: string,
  pattern: string,
  mode: MatchMode,
): boolean {
  if (!pattern) return false;
  switch (mode) {
    case 'exact':
      return url === pattern;
    case 'prefix':
      return url.startsWith(pattern);
    case 'domain': {
      let host: string;
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch {
        return false;
      }
      const target = pattern.trim().toLowerCase();
      if (!target) return false;
      return host === target || host.endsWith('.' + target);
    }
    case 'regex':
      try {
        return new RegExp(pattern).test(url);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export function filterMemosForUrl(
  memos: Memo[],
  url: string,
): { matched: Memo[]; issues: MatchIssue[] } {
  const matched: Memo[] = [];
  const issues: MatchIssue[] = [];
  for (const memo of memos) {
    if (!memo.enabled) continue;
    if (memo.matchMode === 'regex') {
      try {
        new RegExp(memo.pattern);
      } catch (err) {
        issues.push({
          memoId: memo.id,
          reason: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }
    if (matchUrl(url, memo.pattern, memo.matchMode)) {
      matched.push(memo);
    }
  }
  return { matched, issues };
}

export function suggestPatternForUrl(url: string, mode: MatchMode): string {
  try {
    const u = new URL(url);
    switch (mode) {
      case 'exact':
        return u.toString();
      case 'prefix':
        return u.origin + u.pathname;
      case 'domain':
        return u.hostname;
      case 'regex':
        return '^' + escapeRegex(u.origin + u.pathname);
    }
  } catch {
    return url;
  }
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

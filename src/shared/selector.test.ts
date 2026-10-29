import { describe, expect, it } from 'vitest';
import { buildSelector, describeElement, isPickableElement, querySelectorSafe } from './selector';

describe('selector', () => {
  it('prefers a unique id', () => {
    document.body.innerHTML = '<button id="pay-now">支付</button>';
    const el = document.getElementById('pay-now')!;
    expect(buildSelector(el)).toBe('#pay-now');
    expect(querySelectorSafe('#pay-now')).toEqual([el]);
  });

  it('falls back to a path when id is missing', () => {
    document.body.innerHTML = '<section><p>一</p><p>二</p></section>';
    const second = document.querySelectorAll('p')[1]!;
    const selector = buildSelector(second);
    expect(querySelectorSafe(selector)).toEqual([second]);
    expect(describeElement(second)).toContain('二');
  });

  it('skips the extension host and invalid selectors', () => {
    document.body.innerHTML = '<div id="zilean-root-host"><span>x</span></div><p>ok</p>';
    expect(isPickableElement(document.body)).toBe(false);
    expect(isPickableElement(document.querySelector('#zilean-root-host span'))).toBe(false);
    expect(querySelectorSafe('???')).toEqual([]);
  });
});

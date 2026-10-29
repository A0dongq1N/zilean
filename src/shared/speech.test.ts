import { describe, expect, it } from 'vitest';
import { composeSpokenText, speechErrorMessage } from './speech';

describe('speech', () => {
  it('joins spoken text onto an existing draft', () => {
    expect(composeSpokenText('', '记得修这个 bug')).toBe('记得修这个 bug');
    expect(composeSpokenText('发布前', '核对 changelog')).toBe('发布前 核对 changelog');
    expect(composeSpokenText('发布前，', '核对 changelog')).toBe('发布前，核对 changelog');
  });

  it('explains permission and network failures in Chinese', () => {
    expect(speechErrorMessage('not-allowed')).toContain('麦克风');
    expect(speechErrorMessage('network')).toContain('网络');
    expect(speechErrorMessage('aborted')).toBe('');
  });
});

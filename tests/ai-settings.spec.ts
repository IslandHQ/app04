import {test, expect} from '@playwright/test';
import {normalizeAIEndpoint, aiFailureMessage} from '../server/ai-settings';

test('AI endpoint accepts base URLs and completion URLs without changing custom paths', () => {
  expect(normalizeAIEndpoint(' https://example.test/ ')).toBe('https://example.test/v1');
  expect(normalizeAIEndpoint('https://example.test/v1/chat/completions')).toBe('https://example.test/v1');
  expect(normalizeAIEndpoint('https://example.test/custom/v2/')).toBe('https://example.test/custom/v2');
  expect(() => normalizeAIEndpoint('not a URL')).toThrow();
  expect(() => normalizeAIEndpoint('https://user:secret@example.test')).toThrow();
});
test('AI errors identify corrective action without exposing upstream credentials', () => {
  for (const status of [400,401,403,404,429,500]) {
    const message=aiFailureMessage({status,message:'secret-key',error:{message:'secret-key'}});
    expect(message).not.toContain('secret-key');
    expect(message).not.toBe('AIへの接続に失敗しました');
  }
  expect(aiFailureMessage({status:401})).toContain('APIキー');
  expect(aiFailureMessage({name:'APIConnectionTimeoutError'})).toContain('タイムアウト');
});

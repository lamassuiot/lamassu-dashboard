import { describe, expect, it } from 'vitest';

import { createSyntheticToolCall, createToolResultMessage } from './chat-tools';
import {
  buildToolExecutionHistory,
  cleanProviderAssistantText,
  createToolCallSignature,
} from './chat-tool-loop';

describe('chat tool loop helpers', () => {
  it('keeps the natural response and removes leaked Kimi tool-control markup', () => {
    const leaked = [
      'He encontrado la primera página. Hay más resultados:',
      '<|open|>tools<|sep|><|open|>call tool="list_certificates" index="1"<|sep|>',
      '<|open|>argument key="bookmark" type="string"<|sep|>next-page<|close|>argument',
      '<|close|>call<|sep|><|close|>tools<|sep|><|close|>message<|sep|>',
    ].join('');

    expect(cleanProviderAssistantText(leaked)).toBe(
      'He encontrado la primera página. Hay más resultados',
    );
    expect(cleanProviderAssistantText('Resultado normal:')).toBe('Resultado normal:');
  });

  it('creates a provider-neutral JSON transcript containing pagination output', () => {
    const firstCall = createSyntheticToolCall('list_certificates', { page_size: 10 }, 'call-1');
    const firstResult = createToolResultMessage('call-1', {
      ok: true,
      result: { next: 'next-page', certificates: [{ serial_number: '01' }] },
    });

    expect(buildToolExecutionHistory([firstCall], [firstResult])).toEqual([{
      name: 'list_certificates',
      arguments: { page_size: 10 },
      output: {
        ok: true,
        result: { next: 'next-page', certificates: [{ serial_number: '01' }] },
      },
    }]);
  });

  it('detects repeated calls while allowing a different pagination bookmark', () => {
    const first = createToolCallSignature('list_certificates', { page_size: 10, bookmark: 'one' });
    const sameWithDifferentKeyOrder = createToolCallSignature('list_certificates', { bookmark: 'one', page_size: 10 });
    const nextPage = createToolCallSignature('list_certificates', { page_size: 10, bookmark: 'two' });

    expect(sameWithDifferentKeyOrder).toBe(first);
    expect(nextPage).not.toBe(first);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createOpenAICompatibleCompletion,
  getOpenAICompatibleConfigDefaults,
  getOpenAICompatibleCompletionUrl,
  streamOpenAICompatibleCompletion,
} from './openai-compatible';

const config = {
  apiKey: 'secret-key',
  baseUrl: 'https://provider.example/v1/',
  model: 'compatible-model',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OpenAI-compatible chat completions', () => {
  it('resolves provider defaults from runtime configuration', () => {
    expect(getOpenAICompatibleConfigDefaults({
      LAMASSU_OPENAI_API_KEY: ' configured-key ',
      LAMASSU_OPENAI_BASE_URL: ' https://provider.example/v1 ',
      LAMASSU_OPENAI_MODEL: ' provider-model ',
    })).toEqual({
      apiKey: 'configured-key',
      baseUrl: 'https://provider.example/v1',
      model: 'provider-model',
    });
  });

  it('keeps WebLLM enabled when no runtime key is configured', () => {
    expect(getOpenAICompatibleConfigDefaults({
      LAMASSU_OPENAI_API_KEY: '',
      LAMASSU_OPENAI_BASE_URL: '',
      LAMASSU_OPENAI_MODEL: '',
    })).toEqual({
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
    });
  });

  it('normalizes base URLs and accepts a full completion URL', () => {
    expect(getOpenAICompatibleCompletionUrl('https://provider.example/v1/'))
      .toBe('https://provider.example/v1/chat/completions');
    expect(getOpenAICompatibleCompletionUrl('https://provider.example/v1/chat/completions'))
      .toBe('https://provider.example/v1/chat/completions');
  });

  it('sends a non-streaming Chat Completions request with bearer authentication', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'planned response' } }],
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));

    const content = await createOpenAICompatibleCompletion(config, {
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0,
    });

    expect(content).toBe('planned response');
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://provider.example/v1/chat/completions');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret-key');
    expect(JSON.parse(String(init?.body))).toEqual({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'compatible-model',
      stream: false,
      temperature: 0,
    });
  });

  it('streams content from fragmented server-sent events', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hel'));
        controller.enqueue(encoder.encode('lo"}}]}\r'));
        controller.enqueue(encoder.encode('\n\r\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' },
      status: 200,
    }));

    const chunks: string[] = [];
    for await (const chunk of streamOpenAICompatibleCompletion(config, {
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['hello', ' world']);
  });

  it('surfaces compatible provider errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'Unknown model' },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    }));

    await expect(createOpenAICompatibleCompletion(config, { messages: [] }))
      .rejects.toThrow('OpenAI-compatible provider returned 400: Unknown model');
  });
});

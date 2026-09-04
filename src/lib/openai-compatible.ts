export const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_OPENAI_COMPATIBLE_MODEL = 'gpt-4.1-mini';

export interface OpenAICompatibleConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface OpenAICompatibleRuntimeConfig {
  LAMASSU_OPENAI_API_KEY?: unknown;
  LAMASSU_OPENAI_BASE_URL?: unknown;
  LAMASSU_OPENAI_MODEL?: unknown;
}

const readRuntimeString = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export const getOpenAICompatibleConfigDefaults = (
  runtimeConfig?: OpenAICompatibleRuntimeConfig | null,
): OpenAICompatibleConfig => ({
  apiKey: readRuntimeString(runtimeConfig?.LAMASSU_OPENAI_API_KEY),
  baseUrl:
    readRuntimeString(runtimeConfig?.LAMASSU_OPENAI_BASE_URL)
    || DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  model:
    readRuntimeString(runtimeConfig?.LAMASSU_OPENAI_MODEL)
    || DEFAULT_OPENAI_COMPATIBLE_MODEL,
});

interface ChatCompletionRequest {
  messages: unknown[];
  signal?: AbortSignal;
  temperature?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
  }>;
}

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

export const getOpenAICompatibleCompletionUrl = (baseUrl: string) => {
  const normalizedBaseUrl = stripTrailingSlashes(baseUrl.trim());

  if (!normalizedBaseUrl) {
    throw new Error('An OpenAI-compatible base URL is required.');
  }

  return normalizedBaseUrl.endsWith('/chat/completions')
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/chat/completions`;
};

const readTextContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      if (!part || typeof part !== 'object') {
        return '';
      }

      const text = (part as { text?: unknown }).text;
      return typeof text === 'string' ? text : '';
    })
    .join('');
};

const getProviderError = async (response: Response) => {
  let detail = '';

  try {
    const body = await response.json() as {
      error?: { message?: unknown } | string;
      message?: unknown;
    };

    if (typeof body.error === 'string') {
      detail = body.error;
    } else if (typeof body.error?.message === 'string') {
      detail = body.error.message;
    } else if (typeof body.message === 'string') {
      detail = body.message;
    }
  } catch (_) {
    // Some compatible providers return an empty or non-JSON error response.
  }

  return new Error(
    detail
      ? `OpenAI-compatible provider returned ${response.status}: ${detail}`
      : `OpenAI-compatible provider returned ${response.status} ${response.statusText || 'Request failed'}.`,
  );
};

const createRequest = (
  config: OpenAICompatibleConfig,
  request: ChatCompletionRequest,
  stream: boolean,
) => {
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();

  if (!apiKey) {
    throw new Error('An OpenAI-compatible API key is required.');
  }

  if (!model) {
    throw new Error('An OpenAI-compatible model is required.');
  }

  return fetch(getOpenAICompatibleCompletionUrl(config.baseUrl), {
    body: JSON.stringify({
      messages: request.messages,
      model,
      stream,
      temperature: request.temperature,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: request.signal,
  });
};

export const createOpenAICompatibleCompletion = async (
  config: OpenAICompatibleConfig,
  request: ChatCompletionRequest,
) => {
  const response = await createRequest(config, request, false);

  if (!response.ok) {
    throw await getProviderError(response);
  }

  const completion = await response.json() as ChatCompletionResponse;
  return readTextContent(completion.choices?.[0]?.message?.content);
};

const parseSseEvent = (event: string) => event
  .split('\n')
  .filter((line) => line.startsWith('data:'))
  .map((line) => line.slice(5).trimStart())
  .join('\n')
  .trim();

const streamSseContent = async function* (body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer = `${buffer}${decoder.decode(value, { stream: !done })}`.replace(/\r\n/g, '\n');

      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = parseSseEvent(event);

        if (data === '[DONE]') {
          return;
        }

        if (data) {
          const chunk = JSON.parse(data) as ChatCompletionChunk;
          const content = readTextContent(chunk.choices?.[0]?.delta?.content);
          if (content) {
            yield content;
          }
        }

        boundary = buffer.indexOf('\n\n');
      }

      if (done) {
        break;
      }
    }

    const data = parseSseEvent(buffer);
    if (data && data !== '[DONE]') {
      const chunk = JSON.parse(data) as ChatCompletionChunk;
      const content = readTextContent(chunk.choices?.[0]?.delta?.content);
      if (content) {
        yield content;
      }
    }
  } finally {
    reader.releaseLock();
  }
};

export const streamOpenAICompatibleCompletion = async function* (
  config: OpenAICompatibleConfig,
  request: ChatCompletionRequest,
) {
  const response = await createRequest(config, request, true);

  if (!response.ok) {
    throw await getProviderError(response);
  }

  if (response.headers.get('content-type')?.includes('application/json')) {
    const completion = await response.json() as ChatCompletionResponse;
    const content = readTextContent(completion.choices?.[0]?.message?.content);
    if (content) {
      yield content;
    }
    return;
  }

  if (!response.body) {
    throw new Error('The OpenAI-compatible provider returned an empty streaming response.');
  }

  yield* streamSseContent(response.body);
};

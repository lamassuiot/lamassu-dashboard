import type {
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam,
} from '@mlc-ai/web-llm';

export function cleanProviderAssistantText(text: string) {
  const toolMarkupStart = text.search(/<\|open\|>\s*tools(?:<\|sep\|>|\s)/i);
  const withoutLeakedToolMarkup = toolMarkupStart >= 0 ? text.slice(0, toolMarkupStart) : text;
  const normalized = withoutLeakedToolMarkup
    .replace(/<\|(?:open|close|sep)\|>/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return toolMarkupStart >= 0 ? normalized.replace(/\s*[:;,]\s*$/, '') : normalized;
}

function parseToolMessagePayload(message: ChatCompletionToolMessageParam | undefined) {
  if (!message) {
    return null;
  }

  const content = typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content);

  try {
    return JSON.parse(content);
  } catch (_) {
    return content;
  }
}

export function buildToolExecutionHistory(
  toolCalls: ChatCompletionMessageToolCall[],
  toolMessages: ChatCompletionToolMessageParam[],
) {
  const messagesByCallId = new Map(toolMessages.map((message) => [message.tool_call_id, message]));

  return toolCalls.map((toolCall) => {
    let parameters: Record<string, unknown> = {};
    try {
      parameters = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
    } catch (_) {
      // Keep malformed model arguments out of the portable transcript.
    }

    return {
      name: toolCall.function.name,
      arguments: parameters,
      output: parseToolMessagePayload(messagesByCallId.get(toolCall.id)),
    };
  });
}

export function createToolCallSignature(name: string, args: Record<string, unknown>) {
  const orderedArgs = Object.fromEntries(Object.entries(args).sort(([left], [right]) => left.localeCompare(right)));
  return `${name}:${JSON.stringify(orderedArgs)}`;
}

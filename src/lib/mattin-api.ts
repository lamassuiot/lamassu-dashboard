'use client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface MattinChatResponse {
  response: string;
  conversation_id: string;
}

export async function sendChatMessage(
  message: string,
  conversationId?: string,
): Promise<MattinChatResponse> {
  const body: Record<string, string> = { message };
  if (conversationId) {
    body.conversation_id = conversationId;
  }

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Chat request failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<MattinChatResponse>;
}

'use client';

import { getConfigValue } from '@/contexts/ConfigContext';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MattinChatRequest {
  message: string;
  conversation_id?: string;
}

export interface MattinChatResponse {
  response: string;
  conversation_id: string;
}

const getMattinApiUrl = (): string => {
  return getConfigValue('MATTIN_AGENT_URL', 'https://mattin.lksnext.com/public/v1/app/13/chat/31/call');
};

const getMattinApiKey = (): string => {
  return getConfigValue('MATTIN_API_KEY', '');
};

export async function sendChatMessage(
  message: string,
  conversationId?: string,
): Promise<MattinChatResponse> {
  const url = getMattinApiUrl();
  const apiKey = getMattinApiKey();

  if (!apiKey) {
    throw new Error('Mattin AI API key is not configured (MATTIN_API_KEY).');
  }

  const body: MattinChatRequest = { message };
  if (conversationId) {
    body.conversation_id = conversationId;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Mattin AI request failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<MattinChatResponse>;
}

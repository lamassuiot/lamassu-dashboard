import { NextRequest, NextResponse } from 'next/server';

const MATTIN_AGENT_URL = process.env.MATTIN_AGENT_URL ?? 'https://mattin.lksnext.com/public/v1/chat/31/call';
const MATTIN_API_KEY = process.env.MATTIN_API_KEY ?? '';
const MATTIN_APP_ID = process.env.MATTIN_APP_ID ?? '13';

export async function POST(req: NextRequest) {
  if (!MATTIN_API_KEY) {
    return NextResponse.json({ error: 'MATTIN_API_KEY is not configured on the server.' }, { status: 500 });
  }

  const json = await req.json();
  console.log('Received:', json);

  const formData = new FormData();
  formData.append('message', json.message);
  if (json.conversation_id) {
    formData.append('conversation_id', json.conversation_id);
  }

  const url = MATTIN_AGENT_URL;
  console.log('Sending to:', url);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-API-KEY': MATTIN_API_KEY,
    },
    body: formData,
  });

  const text = await response.text();
  console.log('Mattin AI response:', response.status, text);

  return new NextResponse(text, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
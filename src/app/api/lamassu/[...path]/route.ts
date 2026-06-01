import { NextRequest, NextResponse } from 'next/server';

const PROXY_TARGET = process.env.LAMASSU_API_PROXY_TARGET ?? 'https://demo-api.lamassu.cloud';

async function proxy(req: NextRequest, params: { path: string[] }) {
  const path = params.path.join('/');
  const search = req.nextUrl.search;
  const targetUrl = `${PROXY_TARGET}/${path}${search}`;

  const headers = new Headers();
  const auth = req.headers.get('authorization');
  if (auth) headers.set('Authorization', auth);
  const ct = req.headers.get('content-type');
  if (ct) headers.set('Content-Type', ct);

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const body = hasBody ? await req.text() : undefined;

  const response = await fetch(targetUrl, { method: req.method, headers, body });
  const responseBody = await response.text();

  return new NextResponse(responseBody, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
  });
}

type RouteParams = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: RouteParams) { return proxy(req, await params); }
export async function POST(req: NextRequest, { params }: RouteParams) { return proxy(req, await params); }
export async function PUT(req: NextRequest, { params }: RouteParams) { return proxy(req, await params); }
export async function PATCH(req: NextRequest, { params }: RouteParams) { return proxy(req, await params); }
export async function DELETE(req: NextRequest, { params }: RouteParams) { return proxy(req, await params); }

import { sameSecret, validIdentifier, createParticipantToken } from './livekit-token.js';

function jsonResponse(body, status, origin) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
  });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Tandem-Room-Code');
    headers.set('Access-Control-Max-Age', '600');
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

async function issueToken(request, env) {
  const origin = request.headers.get('Origin');
  if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) {
    return jsonResponse({ error: 'origin_not_allowed' }, 403);
  }

  if (request.method === 'OPTIONS') return jsonResponse({}, 204, env.ALLOWED_ORIGIN);
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, env.ALLOWED_ORIGIN);
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL || !env.LIVEKIT_DEMO_ROOM_CODE) {
    return jsonResponse({ error: 'livekit_not_configured' }, 503, env.ALLOWED_ORIGIN);
  }

  const suppliedCode = request.headers.get('X-Tandem-Room-Code') || '';
  if (!sameSecret(suppliedCode, env.LIVEKIT_DEMO_ROOM_CODE)) {
    return jsonResponse({ error: 'invalid_room_code' }, 401, env.ALLOWED_ORIGIN);
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 4096) return jsonResponse({ error: 'request_too_large' }, 413, env.ALLOWED_ORIGIN);

  let input;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400, env.ALLOWED_ORIGIN);
  }

  const room = input?.room;
  const identity = input?.identity;
  const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 80) : '';
  if (!validIdentifier(room) || !validIdentifier(identity) || !name) {
    return jsonResponse({ error: 'invalid_participant' }, 400, env.ALLOWED_ORIGIN);
  }
  if (!/^wss:\/\//.test(env.LIVEKIT_URL)) {
    return jsonResponse({ error: 'invalid_livekit_url' }, 503, env.ALLOWED_ORIGIN);
  }

  try {
    const token = await createParticipantToken({
      apiKey: env.LIVEKIT_API_KEY,
      apiSecret: env.LIVEKIT_API_SECRET,
      identity,
      name,
      room,
    });
    return jsonResponse({ serverUrl: env.LIVEKIT_URL, token }, 200, env.ALLOWED_ORIGIN);
  } catch {
    return jsonResponse({ error: 'token_generation_failed' }, 500, env.ALLOWED_ORIGIN);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/livekit/token') return issueToken(request, env);
    if (url.pathname.startsWith('/api/')) return jsonResponse({ error: 'not_found' }, 404, env.ALLOWED_ORIGIN);
    return env.ASSETS.fetch(request);
  },
};

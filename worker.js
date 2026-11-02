const textEncoder = new TextEncoder();

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

function base64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function validIdentifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function sameSecret(candidate, expected) {
  if (typeof candidate !== 'string' || !expected) return false;
  const left = textEncoder.encode(candidate);
  const right = textEncoder.encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return difference === 0;
}

async function createParticipantToken({ apiKey, apiSecret, identity, name, room }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(textEncoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64Url(textEncoder.encode(JSON.stringify({
    iss: apiKey,
    sub: identity,
    name,
    nbf: now - 5,
    exp: now + 45 * 60,
    video: {
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  })));
  const unsignedToken = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(unsignedToken));
  return `${unsignedToken}.${base64Url(new Uint8Array(signature))}`;
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

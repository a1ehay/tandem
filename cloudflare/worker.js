import { getAuthenticatedAccount, handleAuthRequest } from './auth.js';

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
    headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Tutdesk-Room-Code, X-Tandem-Room-Code');
    headers.set('Access-Control-Max-Age', '600');
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

async function readJsonBody(request, maxBytes) {
  if (Number(request.headers.get('Content-Length') || 0) > maxBytes) return { error: 'request_too_large' };
  if (!request.body) return { error: 'invalid_json' };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        return { error: 'request_too_large' };
      }
      chunks.push(value);
    }
  } catch { return { error: 'invalid_json' }; }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return { value: JSON.parse(new TextDecoder().decode(bytes)) }; }
  catch { return { error: 'invalid_json' }; }
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
    exp: now + 3 * 60 * 60,
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
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
    return jsonResponse({ error: 'livekit_not_configured' }, 503, env.ALLOWED_ORIGIN);
  }

  const suppliedCode = request.headers.get('X-Tutdesk-Room-Code') || request.headers.get('X-Tandem-Room-Code') || '';
  const hasDemoAccess = sameSecret(suppliedCode, env.LIVEKIT_DEMO_ROOM_CODE);
  const account = !hasDemoAccess && env.DB ? await getAuthenticatedAccount(request, env.DB) : null;
  if (!account && !hasDemoAccess) {
    const error = env.LIVEKIT_DEMO_ROOM_CODE ? 'invalid_room_code' : 'authentication_required';
    return jsonResponse({ error }, 401, env.ALLOWED_ORIGIN);
  }

  const parsed = await readJsonBody(request, 4096);
  if (parsed.error) return jsonResponse({ error: parsed.error }, parsed.error === 'request_too_large' ? 413 : 400, env.ALLOWED_ORIGIN);
  const input = parsed.value;

  const room = input?.room;
  const identity = account ? `participant-${crypto.randomUUID()}` : input?.identity;
  const name = account
    ? String(account.name || 'Участник').trim().slice(0, 80)
    : (typeof input?.name === 'string' ? input.name.trim().slice(0, 80) : '');
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
    if (url.pathname.startsWith('/api/auth/') || url.pathname === '/api/account-data' || url.pathname === '/api/tutor-students' || url.pathname === '/api/plan' || url.pathname === '/api/screen-share' || url.pathname.startsWith('/api/profile') || url.pathname.startsWith('/api/videos') || url.pathname.startsWith('/api/groups') || url.pathname.startsWith('/api/messages') || url.pathname.startsWith('/api/files') || url.pathname.startsWith('/api/homework-files')) {
      try {
        return await handleAuthRequest(request, env, url);
      } catch (error) {
        const incidentId = crypto.randomUUID();
        const reason = /iteration counts above/.test(error?.message || '') ? 'password_hash_runtime_limit'
          : /no such (table|column)/i.test(error?.message || '') ? 'database_schema_missing'
          : 'unexpected_error';
        console.error(JSON.stringify({ event: 'auth_request_failed', path: url.pathname, incidentId, reason }));
        return jsonResponse({ error: 'internal_error', message: 'Сервис аккаунтов временно недоступен. Попробуйте позже.', incidentId }, 500, env.ALLOWED_ORIGIN);
      }
    }
    if (url.pathname === '/api/livekit/token') return issueToken(request, env);
    if (url.pathname.startsWith('/api/')) return jsonResponse({ error: 'not_found' }, 404, env.ALLOWED_ORIGIN);
    return env.ASSETS.fetch(request);
  },
};

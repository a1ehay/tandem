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

export function base64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function validIdentifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

export function sameSecret(candidate, expected) {
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

export async function createParticipantToken({ apiKey, apiSecret, identity, name, room }) {
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


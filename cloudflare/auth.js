const SESSION_COOKIE = 'tutdesk_session';
const OAUTH_STATE_COOKIE = 'tandem_oauth_state';
const OAUTH_VERIFIER_COOKIE = 'tandem_oauth_verifier';
const OAUTH_RETURN_COOKIE = 'tandem_oauth_return';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_TTL_SECONDS = 60 * 10;
const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60 * 24;
const PASSWORD_RESET_TTL_SECONDS = 60 * 30;
const PASSWORD_ITERATIONS = 310000;
const textEncoder = new TextEncoder();

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function cookieValue(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  for (const part of cookies.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); }
    catch { return ''; }
  }
  return '';
}

function cookie(name, value, maxAge, secure) {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function addOAuthCookies(response, state, verifier, secure) {
  response.headers.append('Set-Cookie', cookie(OAUTH_STATE_COOKIE, state, OAUTH_TTL_SECONDS, secure));
  response.headers.append('Set-Cookie', cookie(OAUTH_VERIFIER_COOKIE, verifier, OAUTH_TTL_SECONDS, secure));
  return response;
}

function clearOAuthCookies(response, secure) {
  response.headers.append('Set-Cookie', cookie(OAUTH_STATE_COOKIE, '', 0, secure));
  response.headers.append('Set-Cookie', cookie(OAUTH_VERIFIER_COOKIE, '', 0, secure));
  response.headers.append('Set-Cookie', cookie(OAUTH_RETURN_COOKIE, '', 0, secure));
  return response;
}

function randomBase64Url(byteCount = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function passwordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, material, 256);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${base64Url(salt)}$${base64Url(new Uint8Array(bits))}`;
}

async function verifyPassword(password, storedHash) {
  const [algorithm, iterationText, saltText, expectedText] = String(storedHash || '').split('$');
  const iterations = Number(iterationText);
  if (algorithm !== 'pbkdf2-sha256' || !Number.isInteger(iterations) || iterations < 100000 || iterations > 600000 || !saltText || !expectedText) return false;
  let salt; let expected;
  try { salt = decodeBase64Url(saltText); expected = decodeBase64Url(expectedText); } catch { return false; }
  if (salt.length !== 16 || expected.length !== 32) return false;
  const material = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const result = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, 256));
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ result[index];
  return difference === 0;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function sendVerificationEmail(env, origin, email, name, token) {
  if (!env.RESEND_API_KEY || !env.AUTH_FROM_EMAIL) throw new Error('email_not_configured');
  const link = `${origin}/?verify=${encodeURIComponent(token)}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.AUTH_FROM_EMAIL,
      to: [email],
      subject: 'Подтвердите адрес электронной почты Tutdesk',
      text: `Здравствуйте, ${name}! Чтобы подтвердить адрес электронной почты, откройте ссылку: ${link}. Ссылка действует 24 часа.`,
      html: `<p>Здравствуйте, ${escapeHtml(name)}!</p><p>Подтвердите адрес электронной почты, чтобы войти в Tutdesk.</p><p><a href="${link}">Подтвердить почту</a></p><p>Ссылка действует 24 часа.</p>`,
    }),
  });
  if (!response.ok) throw new Error('email_delivery_failed');
}

async function sendPasswordResetEmail(env, origin, email, name, token) {
  if (!env.RESEND_API_KEY || !env.AUTH_FROM_EMAIL) throw new Error('email_not_configured');
  const link = `${origin}/?reset=${encodeURIComponent(token)}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.AUTH_FROM_EMAIL,
      to: [email],
      subject: 'Сброс пароля Tutdesk',
      text: `Здравствуйте, ${name}! Чтобы задать новый пароль Tutdesk, откройте ссылку: ${link}. Она действует 30 минут. Если вы не запрашивали сброс пароля, проигнорируйте письмо.`,
      html: `<p>Здравствуйте, ${escapeHtml(name)}!</p><p><a href="${link}">Задать новый пароль Tutdesk</a></p><p>Ссылка действует 30 минут. Если вы не запрашивали сброс пароля, проигнорируйте письмо.</p>`,
    }),
  });
  if (!response.ok) throw new Error('email_delivery_failed');
}

async function issueEmailVerification(db, env, origin, account) {
  const token = randomBase64Url(32);
  const now = Math.floor(Date.now() / 1000);
  const recent = await db.prepare('SELECT created_at FROM email_verification_tokens WHERE account_id = ?1 ORDER BY created_at DESC LIMIT 1').bind(account.id).first();
  if (recent && now - recent.created_at < 60) throw new Error('email_rate_limited');
  const tokenHash = await sha256Hex(token);
  await db.prepare('INSERT INTO email_verification_tokens (token_hash, account_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(tokenHash, account.id, now + EMAIL_VERIFICATION_TTL_SECONDS, now).run();
  try {
    await sendVerificationEmail(env, origin, account.email, account.name, token);
  } catch (error) {
    await db.prepare('DELETE FROM email_verification_tokens WHERE token_hash = ?1').bind(tokenHash).run();
    throw error;
  }
  await db.prepare('DELETE FROM email_verification_tokens WHERE account_id = ?1 AND token_hash <> ?2').bind(account.id, tokenHash).run();
}

function accountFields() {
  return 'id, role, name, email, email_verified, avatar_url, plan';
}

async function createPasswordAccount(request, env, origin) {
  const input = await readJsonBody(request, 8192);
  if (input.error) return input.error;
  const name = typeof input.value?.name === 'string' ? input.value.name.trim() : '';
  const email = typeof input.value?.email === 'string' ? input.value.email.trim().toLowerCase() : '';
  const role = input.value?.role === 'student' ? 'student' : input.value?.role === 'tutor' ? 'tutor' : null;
  const password = typeof input.value?.password === 'string' ? input.value.password : '';
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !role || password.length < 12 || password.length > 128) {
    return jsonResponse({ error: 'invalid_registration', message: 'Проверьте имя, email, роль и пароль (не менее 12 символов).' }, 400);
  }
  const existing = await env.DB.prepare(`SELECT ${accountFields()}, password_hash FROM accounts WHERE email = ?1 COLLATE NOCASE`).bind(email).first();
  if (existing) {
    if (!existing.email_verified && existing.password_hash) {
      try { await issueEmailVerification(env.DB, env, origin, existing); }
      catch (error) {
        if (error?.message === 'email_rate_limited') return jsonResponse({ error: 'email_rate_limited', message: 'Подождите минуту перед повторной отправкой письма.' }, 429);
        return jsonResponse({ error: 'email_delivery_failed', message: 'Не удалось отправить письмо. Попробуйте ещё раз позже.' }, 503);
      }
    }
    return jsonResponse({ ok: true, verificationRequired: true }, 202);
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const hash = await passwordHash(password);
  try {
    await env.DB.prepare(`
      INSERT INTO accounts (id, role, name, email, email_verified, avatar_url, plan, password_hash, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, 0, NULL, 'light', ?5, ?6, ?6)
    `).bind(id, role, name, email, hash, now).run();
  } catch {
    const duplicate = await env.DB.prepare(`SELECT ${accountFields()}, password_hash FROM accounts WHERE email = ?1 COLLATE NOCASE`).bind(email).first();
    if (duplicate) {
      if (!duplicate.email_verified && duplicate.password_hash) {
        try { await issueEmailVerification(env.DB, env, origin, duplicate); }
        catch { /* The generic response avoids exposing whether the address is registered. */ }
      }
      return jsonResponse({ ok: true, verificationRequired: true }, 202);
    }
    return jsonResponse({ error: 'registration_failed', message: 'Не удалось создать аккаунт. Попробуйте позже.' }, 500);
  }
  const account = { id, role, name, email };
  try {
    await issueEmailVerification(env.DB, env, origin, account);
  } catch {
    await env.DB.prepare('DELETE FROM accounts WHERE id = ?1').bind(id).run();
    return jsonResponse({ error: 'email_delivery_failed', message: 'Не удалось отправить письмо подтверждения. Проверьте настройки почты и попробуйте ещё раз.' }, 503);
  }
  return jsonResponse({ ok: true, verificationRequired: true }, 202);
}

async function loginWithPassword(request, env, origin) {
  const input = await readJsonBody(request, 8192);
  if (input.error) return input.error;
  const email = typeof input.value?.email === 'string' ? input.value.email.trim().toLowerCase() : '';
  const password = typeof input.value?.password === 'string' ? input.value.password : '';
  const account = await env.DB.prepare(`SELECT ${accountFields()}, password_hash FROM accounts WHERE email = ?1 COLLATE NOCASE`).bind(email).first();
  if (!account?.password_hash || password.length > 128 || !(await verifyPassword(password, account.password_hash))) {
    return jsonResponse({ error: 'invalid_credentials', message: 'Неверный email или пароль.' }, 401);
  }
  if (!account.email_verified) return jsonResponse({ error: 'email_not_verified', message: 'Подтвердите email по ссылке из письма.' }, 403);
  const session = await createSession(env.DB, account.id);
  delete account.password_hash;
  const response = jsonResponse({ account });
  response.headers.append('Set-Cookie', cookie(SESSION_COOKIE, session, SESSION_TTL_SECONDS, isSecureOrigin(origin)));
  return response;
}

async function verifyEmail(request, env, origin) {
  const input = await readJsonBody(request, 4096);
  if (input.error) return input.error;
  const token = typeof input.value?.token === 'string' ? input.value.token : '';
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return jsonResponse({ error: 'invalid_verification_token' }, 400);
  const now = Math.floor(Date.now() / 1000);
  const pending = await env.DB.prepare(`
    SELECT accounts.${accountFields().replaceAll(', ', ', accounts.')}, email_verification_tokens.token_hash
    FROM email_verification_tokens JOIN accounts ON accounts.id = email_verification_tokens.account_id
    WHERE email_verification_tokens.token_hash = ?1 AND email_verification_tokens.expires_at > ?2
  `).bind(await sha256Hex(token), now).first();
  if (!pending) return jsonResponse({ error: 'verification_link_expired', message: 'Ссылка недействительна или срок её действия истёк. Запросите новое письмо.' }, 400);
  await env.DB.batch([
    env.DB.prepare('UPDATE accounts SET email_verified = 1, updated_at = ?1 WHERE id = ?2').bind(now, pending.id),
    env.DB.prepare('DELETE FROM email_verification_tokens WHERE token_hash = ?1').bind(pending.token_hash),
  ]);
  const session = await createSession(env.DB, pending.id);
  delete pending.token_hash;
  pending.email_verified = 1;
  const response = jsonResponse({ account: pending });
  response.headers.append('Set-Cookie', cookie(SESSION_COOKIE, session, SESSION_TTL_SECONDS, isSecureOrigin(origin)));
  return response;
}

async function resendVerification(request, env, origin) {
  const input = await readJsonBody(request, 4096);
  if (input.error) return input.error;
  const email = typeof input.value?.email === 'string' ? input.value.email.trim().toLowerCase() : '';
  if (!email || email.length > 254) return jsonResponse({ error: 'invalid_email' }, 400);
  const account = await env.DB.prepare(`SELECT id, name, email, email_verified FROM accounts WHERE email = ?1 COLLATE NOCASE`).bind(email).first();
  if (account && !account.email_verified && account.password_hash) {
    try { await issueEmailVerification(env.DB, env, origin, account); }
    catch (error) {
      if (error?.message === 'email_rate_limited') return jsonResponse({ error: 'email_rate_limited', message: 'Подождите минуту перед повторной отправкой письма.' }, 429);
      return jsonResponse({ error: 'email_delivery_failed' }, 503);
    }
  }
  return jsonResponse({ ok: true, message: 'Если для этого адреса есть неподтверждённый аккаунт, мы отправили письмо.' });
}

async function requestPasswordReset(request, env, origin) {
  const input = await readJsonBody(request, 4096);
  if (input.error) return input.error;
  const email = typeof input.value?.email === 'string' ? input.value.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return jsonResponse({ error: 'invalid_email' }, 400);
  if (!env.RESEND_API_KEY || !env.AUTH_FROM_EMAIL) return jsonResponse({ error: 'email_not_configured' }, 503);
  const account = await env.DB.prepare(`SELECT id, name, email, email_verified, password_hash FROM accounts WHERE email = ?1 COLLATE NOCASE`).bind(email).first();
  if (account?.email_verified && account.password_hash) {
    const token = randomBase64Url(32);
    const now = Math.floor(Date.now() / 1000);
    const recent = await env.DB.prepare('SELECT created_at FROM password_reset_tokens WHERE account_id = ?1 ORDER BY created_at DESC LIMIT 1').bind(account.id).first();
    if (recent && now - recent.created_at < 60) return jsonResponse({ ok: true, message: 'Если для этого адреса есть аккаунт, мы отправили ссылку для сброса пароля.' });
    await env.DB.batch([
      env.DB.prepare('DELETE FROM password_reset_tokens WHERE account_id = ?1').bind(account.id),
      env.DB.prepare('INSERT INTO password_reset_tokens (token_hash, account_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)')
        .bind(await sha256Hex(token), account.id, now + PASSWORD_RESET_TTL_SECONDS, now),
    ]);
    try { await sendPasswordResetEmail(env, origin, account.email, account.name, token); }
    catch {
      await env.DB.prepare('DELETE FROM password_reset_tokens WHERE account_id = ?1').bind(account.id).run();
      return jsonResponse({ error: 'email_delivery_failed' }, 503);
    }
  }
  return jsonResponse({ ok: true, message: 'Если для этого адреса есть аккаунт, мы отправили ссылку для сброса пароля.' });
}

async function confirmPasswordReset(request, env) {
  const input = await readJsonBody(request, 8192);
  if (input.error) return input.error;
  const token = typeof input.value?.token === 'string' ? input.value.token : '';
  const password = typeof input.value?.password === 'string' ? input.value.password : '';
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token) || password.length < 12 || password.length > 128) {
    return jsonResponse({ error: 'invalid_password_reset', message: 'Ссылка недействительна или пароль короче 12 символов.' }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  const reset = await env.DB.prepare(`
    SELECT password_reset_tokens.token_hash, accounts.id
    FROM password_reset_tokens JOIN accounts ON accounts.id = password_reset_tokens.account_id
    WHERE password_reset_tokens.token_hash = ?1 AND password_reset_tokens.expires_at > ?2
      AND accounts.email_verified = 1 AND accounts.password_hash IS NOT NULL
  `).bind(await sha256Hex(token), now).first();
  if (!reset) return jsonResponse({ error: 'password_reset_expired', message: 'Ссылка недействительна или срок её действия истёк. Запросите сброс ещё раз.' }, 400);
  const hash = await passwordHash(password);
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE accounts SET password_hash = ?1, updated_at = ?2
      WHERE id = ?3 AND EXISTS (
        SELECT 1 FROM password_reset_tokens WHERE token_hash = ?4 AND expires_at > ?2
      )
    `).bind(hash, now, reset.id, reset.token_hash),
    env.DB.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?1').bind(reset.token_hash),
    env.DB.prepare('DELETE FROM sessions WHERE account_id = ?1').bind(reset.id),
  ]);
  if (!results[0]?.meta?.changes) return jsonResponse({ error: 'password_reset_expired', message: 'Ссылка недействительна или срок её действия истёк. Запросите сброс ещё раз.' }, 400);
  return jsonResponse({ ok: true });
}

async function readJsonBody(request, maxBytes) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > maxBytes) return { error: jsonResponse({ error: 'request_too_large' }, 413) };
  if (!request.body) return { error: jsonResponse({ error: 'invalid_json' }, 400) };
  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        reader.cancel().catch(() => {});
        return { error: jsonResponse({ error: 'request_too_large' }, 413) };
      }
      chunks.push(value);
    }
  } catch { return { error: jsonResponse({ error: 'invalid_json' }, 400) }; }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return { value: JSON.parse(new TextDecoder().decode(bytes)) }; }
  catch { return { error: jsonResponse({ error: 'invalid_json' }, 400) }; }
}

function isSecureOrigin(origin) {
  return origin.startsWith('https://');
}

function publicAppOrigin(env, fallback) {
  try {
    const configured = new URL(env.AUTH_PUBLIC_ORIGIN);
    if (configured.protocol !== 'https:' || configured.username || configured.password || configured.pathname !== '/' || configured.search || configured.hash) return fallback;
    return configured.origin;
  } catch { return fallback; }
}

function redirectToApp(origin, query = '') {
  return new Response(null, { status: 302, headers: { Location: `${origin}/${query}` } });
}

function callbackUrl(origin, provider) {
  return `${origin}/api/auth/${provider}/callback`;
}

function providerSettings(provider, env) {
  if (provider === 'google') {
    return {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
      scope: 'openid email profile',
    };
  }
  if (provider === 'yandex') {
    return {
      clientId: env.YANDEX_CLIENT_ID,
      clientSecret: env.YANDEX_CLIENT_SECRET,
      authorizeUrl: 'https://oauth.yandex.ru/authorize',
      tokenUrl: 'https://oauth.yandex.ru/token',
      userInfoUrl: 'https://login.yandex.ru/info?format=json',
      scope: 'login:info login:email login:avatar',
    };
  }
  if (provider === 'vk') {
    return {
      clientId: env.VK_CLIENT_ID,
      authorizeUrl: 'https://id.vk.ru/authorize',
      tokenUrl: 'https://id.vk.ru/oauth2/auth',
      userInfoUrl: 'https://id.vk.ru/oauth2/user_info',
      scope: 'email',
    };
  }
  return null;
}

async function startOAuth(request, env, provider, origin) {
  const settings = providerSettings(provider, env);
  const requestedConference = new URL(request.url).searchParams.get('conference') || '';
  const safeConference = /^[A-Za-z0-9_-]{1,64}$/.test(requestedConference) ? requestedConference : '';
  const conferenceQuery = safeConference ? `&conference=${encodeURIComponent(safeConference)}` : '';
  if (!settings?.clientId || (provider === 'google' && !settings.clientSecret) || !env.DB) {
    return redirectToApp(origin, `?auth_error=provider_not_configured${conferenceQuery}`);
  }

  const state = randomBase64Url();
  const verifier = randomBase64Url(48);
  const challenge = await sha256Base64Url(verifier);
  const redirectUri = callbackUrl(origin, provider);
  const authorization = new URL(settings.authorizeUrl);
  const parameters = {
    client_id: settings.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: settings.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: provider === 'vk' ? 's256' : 'S256',
  };
  if (provider === 'vk') {
    parameters.app_id = settings.clientId;
    parameters.sdk_type = 'vkid';
  }
  for (const [key, value] of Object.entries(parameters)) authorization.searchParams.set(key, value);

  const response = new Response(null, { status: 302, headers: { Location: authorization.toString() } });
  return addOAuthCookies(response, state, verifier, isSecureOrigin(origin));
}

async function exchangeCode(provider, settings, requestUrl, code, state, verifier, redirectUri) {
  const parameters = new URLSearchParams();
  let tokenUrl = settings.tokenUrl;

  if (provider === 'vk') {
    const query = new URLSearchParams({
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      client_id: settings.clientId,
      code_verifier: verifier,
      state,
      device_id: requestUrl.searchParams.get('device_id') || '',
    });
    tokenUrl += `?${query}`;
    parameters.set('code', code);
  } else {
    parameters.set('grant_type', 'authorization_code');
    parameters.set('client_id', settings.clientId);
    if (settings.clientSecret) parameters.set('client_secret', settings.clientSecret);
    parameters.set('code', code);
    parameters.set('redirect_uri', redirectUri);
    parameters.set('code_verifier', verifier);
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: parameters,
  });
  if (!response.ok) throw new Error('OAuth token exchange failed');
  const token = await response.json();
  if (provider === 'vk' && token.state !== state) throw new Error('OAuth state mismatch');
  if (!token.access_token) throw new Error('OAuth provider returned no access token');
  return token;
}

async function fetchProviderProfile(provider, settings, token) {
  let response;
  if (provider === 'vk') {
    const url = new URL(settings.userInfoUrl);
    url.searchParams.set('client_id', settings.clientId);
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: token.access_token }),
    });
  } else if (provider === 'yandex') {
    response = await fetch(settings.userInfoUrl, {
      headers: { Authorization: `OAuth ${token.access_token}` },
    });
  } else {
    response = await fetch(settings.userInfoUrl, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
  }
  if (!response.ok) throw new Error('OAuth profile request failed');
  const profile = await response.json();

  if (provider === 'google') {
    if (!profile.sub) throw new Error('Google profile has no subject');
    return {
      subject: String(profile.sub),
      name: profile.name || profile.email || 'Google user',
      email: profile.email || null,
      emailVerified: profile.email_verified === true,
      avatarUrl: profile.picture || null,
    };
  }
  if (provider === 'yandex') {
    if (!profile.id) throw new Error('Yandex profile has no id');
    return {
      subject: String(profile.id),
      name: profile.real_name || profile.display_name || profile.login || 'Yandex user',
      email: profile.default_email || profile.emails?.[0] || null,
      emailVerified: false,
      avatarUrl: profile.default_avatar_id ? `https://avatars.yandex.net/get-yapic/${encodeURIComponent(profile.default_avatar_id)}/islands-200` : null,
    };
  }
  const user = profile.user || profile;
  const subject = user.user_id || user.id || token.user_id;
  if (!subject) throw new Error('VK profile has no user id');
  return {
    subject: String(subject),
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'VK user',
    email: user.email || null,
    emailVerified: false,
    avatarUrl: user.avatar || user.photo_200 || null,
  };
}

async function findOrCreateAccount(db, provider, profile) {
  const existing = await db.prepare(`
    SELECT accounts.id, accounts.role, accounts.name, accounts.email, accounts.email_verified,
      accounts.avatar_url, accounts.plan
    FROM oauth_identities
    JOIN accounts ON accounts.id = oauth_identities.account_id
    WHERE oauth_identities.provider = ?1 AND oauth_identities.provider_subject = ?2
  `).bind(provider, profile.subject).first();
  if (existing) return existing;

  const now = Math.floor(Date.now() / 1000);
  const accountId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO accounts (id, role, name, email, email_verified, avatar_url, plan, created_at, updated_at)
    VALUES (?1, NULL, ?2, ?3, ?4, ?5, 'light', ?6, ?6)
  `).bind(accountId, profile.name, profile.email, profile.emailVerified ? 1 : 0, profile.avatarUrl, now).run();
  await db.prepare(`
    INSERT OR IGNORE INTO oauth_identities (provider, provider_subject, account_id, created_at)
    VALUES (?1, ?2, ?3, ?4)
  `).bind(provider, profile.subject, accountId, now).run();

  const account = await db.prepare(`
    SELECT accounts.id, accounts.role, accounts.name, accounts.email, accounts.email_verified,
      accounts.avatar_url, accounts.plan
    FROM oauth_identities
    JOIN accounts ON accounts.id = oauth_identities.account_id
    WHERE oauth_identities.provider = ?1 AND oauth_identities.provider_subject = ?2
  `).bind(provider, profile.subject).first();
  if (!account || account.id !== accountId) {
    await db.prepare('DELETE FROM accounts WHERE id = ?1').bind(accountId).run();
  }
  return account;
}

async function createSession(db, accountId) {
  const token = randomBase64Url(32);
  const now = Math.floor(Date.now() / 1000);
  await db.prepare('INSERT INTO sessions (token_hash, account_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await sha256Hex(token), accountId, now + SESSION_TTL_SECONDS, now).run();
  return token;
}

async function finishOAuth(request, env, provider, origin) {
  const requestUrl = new URL(request.url);
  const secure = isSecureOrigin(origin);
  const expectedState = cookieValue(request, OAUTH_STATE_COOKIE);
  const verifier = cookieValue(request, OAUTH_VERIFIER_COOKIE);
  const returnConference = cookieValue(request, OAUTH_RETURN_COOKIE);
  const returnedState = requestUrl.searchParams.get('state') || '';
  const code = requestUrl.searchParams.get('code') || '';
  const safeConference = /^[A-Za-z0-9_-]{1,64}$/.test(returnConference) ? returnConference : '';
  const conferenceQuery = safeConference ? `&conference=${encodeURIComponent(safeConference)}` : '';
  if (requestUrl.searchParams.has('error')) {
    return clearOAuthCookies(redirectToApp(origin, `?auth_error=oauth_cancelled${conferenceQuery}`), secure);
  }
  if (!expectedState || !verifier || expectedState !== returnedState || !code) {
    return clearOAuthCookies(redirectToApp(origin, `?auth_error=oauth_state${conferenceQuery}`), secure);
  }

  const settings = providerSettings(provider, env);
  if (!settings?.clientId || (provider === 'google' && !settings.clientSecret) || !env.DB) {
    return clearOAuthCookies(redirectToApp(origin, `?auth_error=provider_not_configured${conferenceQuery}`), secure);
  }

  try {
    const token = await exchangeCode(provider, settings, requestUrl, code, expectedState, verifier, callbackUrl(origin, provider));
    const profile = await fetchProviderProfile(provider, settings, token);
    const account = await findOrCreateAccount(env.DB, provider, profile);
    if (!account) throw new Error('OAuth account could not be loaded');
    const session = await createSession(env.DB, account.id);
    const response = redirectToApp(origin, `?auth=ready${conferenceQuery}`);
    response.headers.append('Set-Cookie', cookie(SESSION_COOKIE, session, SESSION_TTL_SECONDS, secure));
    return clearOAuthCookies(response, secure);
  } catch {
    return clearOAuthCookies(redirectToApp(origin, `?auth_error=oauth_failed${conferenceQuery}`), secure);
  }
}

async function accountForRequest(request, db) {
  const session = cookieValue(request, SESSION_COOKIE);
  if (!session) return null;
  const now = Math.floor(Date.now() / 1000);
  return db.prepare(`
    SELECT accounts.id, accounts.role, accounts.name, accounts.email, accounts.email_verified,
      accounts.avatar_url, accounts.plan
    FROM sessions
    JOIN accounts ON accounts.id = sessions.account_id
    WHERE sessions.token_hash = ?1 AND sessions.expires_at > ?2
  `).bind(await sha256Hex(session), now).first();
}

export async function getAuthenticatedAccount(request, db) {
  if (!db) return null;
  const account = await accountForRequest(request, db);
  return account?.role ? account : null;
}

async function handleAuthApi(request, env, path, origin) {
  if (!env.DB) return jsonResponse({ error: 'auth_not_configured' }, 503);
  const emailOrigin = publicAppOrigin(env, origin);
  if (path === '/api/auth/register' && request.method === 'POST') return createPasswordAccount(request, env, emailOrigin);
  if (path === '/api/auth/login' && request.method === 'POST') return loginWithPassword(request, env, origin);
  if (path === '/api/auth/verify' && request.method === 'POST') return verifyEmail(request, env, origin);
  if (path === '/api/auth/resend-verification' && request.method === 'POST') return resendVerification(request, env, emailOrigin);
  if (path === '/api/auth/password-reset/request' && request.method === 'POST') return requestPasswordReset(request, env, emailOrigin);
  if (path === '/api/auth/password-reset/confirm' && request.method === 'POST') return confirmPasswordReset(request, env);
  const account = await accountForRequest(request, env.DB);

  if (path === '/api/auth/me' && request.method === 'GET') {
    return jsonResponse({ account: account || null });
  }

  if (path === '/api/auth/logout' && request.method === 'POST') {
    const token = cookieValue(request, SESSION_COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256Hex(token)).run();
    const response = jsonResponse({ ok: true });
    response.headers.append('Set-Cookie', cookie(SESSION_COOKIE, '', 0, isSecureOrigin(env.ALLOWED_ORIGIN || '')));
    return response;
  }

  if (path === '/api/auth/role' && request.method === 'POST') {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    const parsed = await readJsonBody(request, 4096);
    if (parsed.error) return parsed.error;
    const input = parsed.value;
    const role = input?.role === 'student' ? 'student' : input?.role === 'tutor' ? 'tutor' : null;
    const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 80) : '';
    if (!role || !name) return jsonResponse({ error: 'invalid_profile' }, 400);
    await env.DB.prepare(`
      UPDATE accounts SET role = COALESCE(role, ?1), name = ?2, updated_at = ?3
      WHERE id = ?4
    `).bind(role, name, Math.floor(Date.now() / 1000), account.id).run();
    const updated = await env.DB.prepare(`
      SELECT id, role, name, email, email_verified, avatar_url, plan FROM accounts WHERE id = ?1
    `).bind(account.id).first();
    return jsonResponse({ account: updated });
  }

  if (path === '/api/account-data' && (request.method === 'GET' || request.method === 'PUT')) {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (request.method === 'GET') {
      const saved = await env.DB.prepare('SELECT data_json FROM account_data WHERE account_id = ?1').bind(account.id).first();
      if (!saved) return jsonResponse({ data: null });
      try { return jsonResponse({ data: JSON.parse(saved.data_json) }); }
      catch { return jsonResponse({ error: 'invalid_account_data' }, 500); }
    }
    const parsed = await readJsonBody(request, 1_000_000);
    if (parsed.error) return parsed.error;
    const input = parsed.value;
    if (!input?.data || typeof input.data !== 'object' || Array.isArray(input.data)) {
      return jsonResponse({ error: 'invalid_account_data' }, 400);
    }
    const serialized = JSON.stringify(input.data);
    if (textEncoder.encode(serialized).byteLength > 1_000_000) return jsonResponse({ error: 'request_too_large' }, 413);
    await env.DB.prepare(`
      INSERT INTO account_data (account_id, data_json, updated_at) VALUES (?1, ?2, ?3)
      ON CONFLICT(account_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
    `).bind(account.id, serialized, Math.floor(Date.now() / 1000)).run();
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: account ? 'not_found' : 'not_authenticated' }, account ? 404 : 401);
}

export async function handleAuthRequest(request, env, url) {
  const configuredUrl = env.ALLOWED_ORIGIN ? new URL(env.ALLOWED_ORIGIN) : null;
  const origin = configuredUrl?.origin;
  if (!configuredUrl || configuredUrl.pathname !== '/' || configuredUrl.search || configuredUrl.hash || origin !== url.origin) {
    return jsonResponse({ error: 'origin_not_allowed' }, 403);
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'auth' && parts.length === 4 && parts[3] === 'start' && request.method === 'GET') {
    const response = await startOAuth(request, env, parts[2], origin);
    if (response.status !== 302 || !providerSettings(parts[2], env)?.clientId || !env.DB) return response;
    const conferenceId = new URL(request.url).searchParams.get('conference') || '';
    const safeConference = /^[A-Za-z0-9_-]{1,64}$/.test(conferenceId) ? conferenceId : '';
    response.headers.append('Set-Cookie', cookie(OAUTH_RETURN_COOKIE, safeConference, OAUTH_TTL_SECONDS, isSecureOrigin(origin)));
    return response;
  }
  if (parts[0] === 'api' && parts[1] === 'auth' && parts.length === 4 && parts[3] === 'callback' && request.method === 'GET') {
    return finishOAuth(request, env, parts[2], origin);
  }
  if ((url.pathname === '/api/auth/register' || url.pathname === '/api/auth/login' || url.pathname === '/api/auth/verify' || url.pathname === '/api/auth/resend-verification' || url.pathname === '/api/auth/password-reset/request' || url.pathname === '/api/auth/password-reset/confirm' || url.pathname === '/api/auth/me' || url.pathname === '/api/auth/logout' || url.pathname === '/api/auth/role' || url.pathname === '/api/account-data')) {
    return handleAuthApi(request, env, url.pathname, origin);
  }
  return jsonResponse({ error: 'not_found' }, 404);
}

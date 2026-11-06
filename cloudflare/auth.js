const SESSION_COOKIE = 'tutdesk_session';
const OAUTH_STATE_COOKIE = 'tandem_oauth_state';
const OAUTH_VERIFIER_COOKIE = 'tandem_oauth_verifier';
const OAUTH_RETURN_COOKIE = 'tandem_oauth_return';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_TTL_SECONDS = 60 * 10;
const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60 * 24;
const PASSWORD_RESET_TTL_SECONDS = 60 * 30;
// Production Workers cap each PBKDF2 derivation at 100,000 iterations.
// Local workerd does not enforce that limit.
const PASSWORD_ITERATIONS = 100000;
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

function videoFromUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    let id; let provider; let embedUrl;
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
      id = host === 'youtu.be' ? url.pathname.slice(1) : (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')) ? url.pathname.split('/')[2] : url.searchParams.get('v');
      if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) return null;
      provider = 'YouTube';
      embedUrl = `https://www.youtube.com/embed/${id}`;
    } else if (['rutube.ru', 'www.rutube.ru'].includes(host)) {
      id = url.pathname.match(/^\/(?:video|play\/embed)\/([a-fA-F0-9]{32})\/?$/)?.[1];
      if (!id) return null;
      provider = 'Rutube';
      embedUrl = `https://rutube.ru/play/embed/${id}`;
    } else return null;
    return { provider, sourceUrl: url.href, embedUrl };
  } catch { return null; }
}

function videoModel(row, assignedStudentIds = []) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    provider: row.provider,
    url: row.source_url,
    embed: row.embed_url,
    assignedStudentIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  if (algorithm !== 'pbkdf2-sha256' || iterations !== PASSWORD_ITERATIONS || !saltText || !expectedText) return false;
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
  const grade = typeof input.value?.grade === 'string' ? input.value.grade.trim().slice(0, 40) : '';
  const password = typeof input.value?.password === 'string' ? input.value.password : '';
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !role || password.length < 8 || password.length > 128) {
    return jsonResponse({ error: 'invalid_registration', message: 'Проверьте имя, email, роль и пароль (не менее 8 символов).' }, 400);
  }
  if (!env.RESEND_API_KEY || !env.AUTH_FROM_EMAIL) {
    return jsonResponse({ error: 'email_not_configured', message: 'Регистрация временно недоступна: отправка писем подтверждения ещё не настроена.' }, 503);
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
    if (role === 'student' && grade) {
      await env.DB.prepare('INSERT INTO account_profiles (account_id, profile_json, updated_at) VALUES (?1, ?2, ?3)')
        .bind(id, JSON.stringify({ grade }), now).run();
    }
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
  const account = await env.DB.prepare(`SELECT id, name, email, email_verified, password_hash FROM accounts WHERE email = ?1 COLLATE NOCASE`).bind(email).first();
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
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token) || password.length < 8 || password.length > 128) {
    return jsonResponse({ error: 'invalid_password_reset', message: 'Ссылка недействительна или пароль слишком короткий. Не менее 8 символов.' }, 400);
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

  if (path === '/api/plan' && request.method === 'PUT') {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (account.role !== 'tutor') return jsonResponse({ error: 'tutor_account_required' }, 403);
    const parsed = await readJsonBody(request, 4096); if (parsed.error) return parsed.error;
    const plan = ['free', 'light', 'extreme'].includes(parsed.value?.plan) ? parsed.value.plan : null;
    if (!plan) return jsonResponse({ error: 'invalid_plan' }, 400);
    await env.DB.prepare('UPDATE accounts SET plan = ?1, updated_at = ?2 WHERE id = ?3').bind(plan, Math.floor(Date.now() / 1000), account.id).run();
    return jsonResponse({ plan });
  }

  if (path === '/api/screen-share' && (request.method === 'POST' || request.method === 'DELETE')) {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    const parsed = await readJsonBody(request, 4096); if (parsed.error) return parsed.error;
    const roomId = typeof parsed.value?.roomId === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(parsed.value.roomId) ? parsed.value.roomId : null;
    if (!roomId) return jsonResponse({ error: 'invalid_room' }, 400);
    if (request.method === 'DELETE') { await env.DB.prepare('DELETE FROM room_screen_shares WHERE room_id = ?1 AND account_id = ?2').bind(roomId, account.id).run(); return jsonResponse({ ok: true }); }
    if (account.plan !== 'free') return jsonResponse({ granted: true, managed: false });
    const now = Math.floor(Date.now() / 1000); const expires = now + 45;
    await env.DB.prepare(`INSERT INTO room_screen_shares (room_id, account_id, expires_at, updated_at) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(room_id) DO UPDATE SET account_id = excluded.account_id, expires_at = excluded.expires_at, updated_at = excluded.updated_at
      WHERE room_screen_shares.expires_at < ?4 OR room_screen_shares.account_id = excluded.account_id`).bind(roomId, account.id, expires, now).run();
    const lease = await env.DB.prepare('SELECT account_id, expires_at FROM room_screen_shares WHERE room_id = ?1').bind(roomId).first();
    return lease?.account_id === account.id ? jsonResponse({ granted: true, managed: true, expiresAt: lease.expires_at }) : jsonResponse({ granted: false, error: 'screen_share_busy' }, 409);
  }

  if (path === '/api/groups' && (request.method === 'GET' || request.method === 'POST')) {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (request.method === 'GET') {
      const query = account.role === 'tutor'
        ? `SELECT student_groups.id, student_groups.name, student_groups.tutor_id, student_group_members.student_id
           FROM student_groups LEFT JOIN student_group_members ON student_group_members.group_id = student_groups.id
           WHERE student_groups.tutor_id = ?1 ORDER BY student_groups.updated_at DESC`
        : `SELECT student_groups.id, student_groups.name, student_groups.tutor_id, student_group_members.student_id
           FROM student_groups JOIN student_group_members AS own_membership ON own_membership.group_id = student_groups.id AND own_membership.student_id = ?1
           LEFT JOIN student_group_members ON student_group_members.group_id = student_groups.id
           ORDER BY student_groups.updated_at DESC`;
      const { results } = await env.DB.prepare(query).bind(account.id).all();
      const groups = new Map();
      for (const row of results || []) {
        if (!groups.has(row.id)) groups.set(row.id, { id: row.id, name: row.name, tutorId: row.tutor_id, studentIds: [] });
        if (row.student_id) groups.get(row.id).studentIds.push(row.student_id);
      }
      return jsonResponse({ groups: [...groups.values()] });
    }
    if (account.role !== 'tutor') return jsonResponse({ error: 'tutor_account_required' }, 403);
    const parsed = await readJsonBody(request, 16_384); if (parsed.error) return parsed.error;
    const name = typeof parsed.value?.name === 'string' ? parsed.value.name.trim().slice(0, 80) : '';
    const studentIds = [...new Set(Array.isArray(parsed.value?.studentIds) ? parsed.value.studentIds.filter((id) => typeof id === 'string') : [])].slice(0, 100);
    if (!name || !studentIds.length) return jsonResponse({ error: 'invalid_group' }, 400);
    const placeholders = studentIds.map((_, index) => `?${index + 2}`).join(',');
    const linked = await env.DB.prepare(`SELECT student_id FROM tutor_students WHERE tutor_id = ?1 AND student_id IN (${placeholders})`).bind(account.id, ...studentIds).all();
    if ((linked.results || []).length !== studentIds.length) return jsonResponse({ error: 'student_not_linked' }, 403);
    const id = crypto.randomUUID(); const now = Math.floor(Date.now() / 1000);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO student_groups (id, tutor_id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)').bind(id, account.id, name, now),
      ...studentIds.map((studentId) => env.DB.prepare('INSERT INTO student_group_members (group_id, student_id, created_at) VALUES (?1, ?2, ?3)').bind(id, studentId, now)),
    ]);
    return jsonResponse({ group: { id, name, tutorId: account.id, studentIds } }, 201);
  }

  const groupMatch = path.match(/^\/api\/groups\/([0-9a-f-]{36})$/i);
  if (groupMatch && (request.method === 'PUT' || request.method === 'DELETE')) {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (account.role !== 'tutor') return jsonResponse({ error: 'tutor_account_required' }, 403);
    const owned = await env.DB.prepare('SELECT id FROM student_groups WHERE id = ?1 AND tutor_id = ?2').bind(groupMatch[1], account.id).first();
    if (!owned) return jsonResponse({ error: 'group_not_found' }, 404);
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM student_groups WHERE id = ?1 AND tutor_id = ?2').bind(groupMatch[1], account.id).run();
      return jsonResponse({ ok: true });
    }
    const parsed = await readJsonBody(request, 16_384); if (parsed.error) return parsed.error;
    const name = typeof parsed.value?.name === 'string' ? parsed.value.name.trim().slice(0, 80) : '';
    const studentIds = [...new Set(Array.isArray(parsed.value?.studentIds) ? parsed.value.studentIds.filter((id) => typeof id === 'string') : [])].slice(0, 100);
    if (!name || !studentIds.length) return jsonResponse({ error: 'invalid_group' }, 400);
    const placeholders = studentIds.map((_, index) => `?${index + 2}`).join(',');
    const linked = await env.DB.prepare(`SELECT student_id FROM tutor_students WHERE tutor_id = ?1 AND student_id IN (${placeholders})`).bind(account.id, ...studentIds).all();
    if ((linked.results || []).length !== studentIds.length) return jsonResponse({ error: 'student_not_linked' }, 403);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.batch([
      env.DB.prepare('UPDATE student_groups SET name = ?1, updated_at = ?2 WHERE id = ?3 AND tutor_id = ?4').bind(name, now, groupMatch[1], account.id),
      env.DB.prepare('DELETE FROM student_group_members WHERE group_id = ?1').bind(groupMatch[1]),
      ...studentIds.map((studentId) => env.DB.prepare('INSERT INTO student_group_members (group_id, student_id, created_at) VALUES (?1, ?2, ?3)').bind(groupMatch[1], studentId, now)),
    ]);
    return jsonResponse({ group: { id: groupMatch[1], name, tutorId: account.id, studentIds } });
  }

  if (path === '/api/files' && (request.method === 'GET' || request.method === 'POST')) {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (!env.HOMEWORK_FILES) return jsonResponse({ error: 'file_storage_not_configured' }, 503);
    if (request.method === 'GET') {
      const query = account.role === 'tutor'
        ? `SELECT teaching_files.* FROM teaching_files WHERE owner_id = ?1 ORDER BY created_at DESC`
        : `SELECT teaching_files.* FROM teaching_files JOIN teaching_file_recipients ON teaching_file_recipients.file_id = teaching_files.id WHERE teaching_file_recipients.student_id = ?1 ORDER BY teaching_files.created_at DESC`;
      const { results } = await env.DB.prepare(query).bind(account.id).all();
      return jsonResponse({ files: (results || []).map((row) => ({ id: row.id, ownerId: row.owner_id, name: row.file_name, type: row.content_type, size: row.size_bytes, folder: row.folder_name || '', url: `/api/files/${row.id}`, createdAt: row.created_at })) });
    }
    if (account.role !== 'tutor') return jsonResponse({ error: 'tutor_account_required' }, 403);
    if (Number(request.headers.get('Content-Length') || 0) > 10_500_000) return jsonResponse({ error: 'file_too_large', message: 'Максимальный размер файла — 10 МБ.' }, 413);
    let form; try { form = await request.formData(); } catch { return jsonResponse({ error: 'invalid_form_data' }, 400); }
    const file = form.get('file'); const folder = String(form.get('folder') || '').trim().slice(0, 80);
    if (!file || typeof file.arrayBuffer !== 'function' || file.size < 1 || file.size > 10_000_000) return jsonResponse({ error: 'invalid_file', message: 'Выберите файл до 10 МБ.' }, 400);
    const safeName = String(file.name || 'file').replace(/[\u0000-\u001f\u007f\\/]/g, '_').trim().slice(0, 180) || 'file';
    const id = crypto.randomUUID(); const objectKey = `library/${account.id}/${id}`; const now = Math.floor(Date.now() / 1000); const type = String(file.type || 'application/octet-stream').slice(0, 150);
    await env.HOMEWORK_FILES.put(objectKey, await file.arrayBuffer(), { metadata: { contentType: type } });
    try { await env.DB.prepare(`INSERT INTO teaching_files (id, owner_id, object_key, file_name, content_type, size_bytes, folder_name, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).bind(id, account.id, objectKey, safeName, type, file.size, folder, now).run(); }
    catch (error) { await env.HOMEWORK_FILES.delete(objectKey); throw error; }
    return jsonResponse({ file: { id, ownerId: account.id, name: safeName, type, size: file.size, folder, url: `/api/files/${id}`, createdAt: now } }, 201);
  }

  const libraryFileMatch = path.match(/^\/api\/files\/([0-9a-f-]{36})(?:\/(grants))?$/i);
  if (libraryFileMatch) {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (!env.HOMEWORK_FILES) return jsonResponse({ error: 'file_storage_not_configured' }, 503);
    const file = await env.DB.prepare(`SELECT teaching_files.*, EXISTS(SELECT 1 FROM teaching_file_recipients WHERE file_id = teaching_files.id AND student_id = ?2) AS can_read FROM teaching_files WHERE teaching_files.id = ?1`).bind(libraryFileMatch[1], account.id).first();
    if (!file || (file.owner_id !== account.id && !file.can_read)) return jsonResponse({ error: 'file_not_found' }, 404);
    if (libraryFileMatch[2] === 'grants' && request.method === 'POST') {
      if (file.owner_id !== account.id) return jsonResponse({ error: 'file_forbidden' }, 403);
      const parsed = await readJsonBody(request, 16_384); if (parsed.error) return parsed.error;
      const studentIds = [...new Set(Array.isArray(parsed.value?.studentIds) ? parsed.value.studentIds.filter((id) => typeof id === 'string') : [])].slice(0, 100);
      if (!studentIds.length) return jsonResponse({ error: 'invalid_recipients' }, 400);
      const placeholders = studentIds.map((_, index) => `?${index + 2}`).join(',');
      const linked = await env.DB.prepare(`SELECT student_id FROM tutor_students WHERE tutor_id = ?1 AND student_id IN (${placeholders})`).bind(account.id, ...studentIds).all();
      if ((linked.results || []).length !== studentIds.length) return jsonResponse({ error: 'student_not_linked' }, 403);
      await env.DB.batch(studentIds.map((studentId) => env.DB.prepare('INSERT OR IGNORE INTO teaching_file_recipients (file_id, student_id) VALUES (?1, ?2)').bind(file.id, studentId)));
      return jsonResponse({ ok: true });
    }
    if (!libraryFileMatch[2] && request.method === 'PUT') {
      if (file.owner_id !== account.id) return jsonResponse({ error: 'file_forbidden' }, 403);
      const parsed = await readJsonBody(request, 4096); if (parsed.error) return parsed.error;
      const folder = typeof parsed.value?.folder === 'string' ? parsed.value.folder.trim().slice(0, 80) : '';
      await env.DB.prepare('UPDATE teaching_files SET folder_name = ?1 WHERE id = ?2 AND owner_id = ?3').bind(folder, file.id, account.id).run();
      return jsonResponse({ ok: true, folder });
    }
    if (request.method === 'DELETE') {
      if (file.owner_id !== account.id) return jsonResponse({ error: 'file_forbidden' }, 403);
      await env.HOMEWORK_FILES.delete(file.object_key); await env.DB.prepare('DELETE FROM teaching_files WHERE id = ?1 AND owner_id = ?2').bind(file.id, account.id).run(); return jsonResponse({ ok: true });
    }
    if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);
    const object = await env.HOMEWORK_FILES.get(file.object_key, 'arrayBuffer'); if (!object) return jsonResponse({ error: 'file_not_found' }, 404);
    const inline = /^image\//.test(file.content_type) || file.content_type === 'application/pdf' || /^text\//.test(file.content_type);
    return new Response(object, { headers: { 'Content-Type': file.content_type || 'application/octet-stream', 'Content-Length': String(file.size_bytes), 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }

  if (path === '/api/messages' && (request.method === 'GET' || request.method === 'POST')) {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (request.method === 'GET') {
      const [{ results: direct }, { results: grouped }] = await Promise.all([
        env.DB.prepare(`SELECT messages.id, messages.sender_id, messages.recipient_id, messages.group_id, messages.body, messages.attachments_json, messages.created_at,
          sender.name AS sender_name FROM messages JOIN accounts AS sender ON sender.id = messages.sender_id
          WHERE messages.group_id IS NULL AND (messages.sender_id = ?1 OR messages.recipient_id = ?1)
          ORDER BY messages.created_at ASC LIMIT 500`).bind(account.id).all(),
        env.DB.prepare(`SELECT messages.id, messages.sender_id, messages.recipient_id, messages.group_id, messages.body, messages.attachments_json, messages.created_at,
          sender.name AS sender_name FROM messages JOIN accounts AS sender ON sender.id = messages.sender_id
          JOIN student_groups ON student_groups.id = messages.group_id
          LEFT JOIN student_group_members ON student_group_members.group_id = student_groups.id AND student_group_members.student_id = ?1
          WHERE student_groups.tutor_id = ?1 OR student_group_members.student_id = ?1
          ORDER BY messages.created_at ASC LIMIT 500`).bind(account.id).all(),
      ]);
      return jsonResponse({ messages: [...(direct || []), ...(grouped || [])].sort((a, b) => a.created_at - b.created_at).map((row) => { let attachments = []; try { attachments = JSON.parse(row.attachments_json || '[]'); } catch { /* legacy row */ } return { id: row.id, senderId: row.sender_id, senderName: row.sender_name, recipientId: row.recipient_id, groupId: row.group_id, body: row.body, attachments: Array.isArray(attachments) ? attachments : [], createdAt: row.created_at }; }) });
    }
    const parsed = await readJsonBody(request, 16_384); if (parsed.error) return parsed.error;
    const body = typeof parsed.value?.body === 'string' ? parsed.value.body.trim().slice(0, 4000) : '';
    const recipientId = typeof parsed.value?.recipientId === 'string' ? parsed.value.recipientId : null;
    const groupId = typeof parsed.value?.groupId === 'string' ? parsed.value.groupId : null;
    const attachmentIds = [...new Set(Array.isArray(parsed.value?.attachmentIds) ? parsed.value.attachmentIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)) : [])].slice(0, 10);
    if ((!body && !attachmentIds.length) || Boolean(recipientId) === Boolean(groupId)) return jsonResponse({ error: 'invalid_message' }, 400);
    if (recipientId) {
      const relation = await env.DB.prepare(`SELECT 1 AS linked FROM tutor_students WHERE
        (tutor_id = ?1 AND student_id = ?2) OR (student_id = ?1 AND tutor_id = ?2)`).bind(account.id, recipientId).first();
      if (!relation) return jsonResponse({ error: 'conversation_forbidden' }, 403);
    } else {
      const membership = await env.DB.prepare(`SELECT 1 AS linked FROM student_groups
        LEFT JOIN student_group_members ON student_group_members.group_id = student_groups.id AND student_group_members.student_id = ?2
        WHERE student_groups.id = ?1 AND (student_groups.tutor_id = ?2 OR student_group_members.student_id = ?2)`).bind(groupId, account.id).first();
      if (!membership) return jsonResponse({ error: 'conversation_forbidden' }, 403);
    }
    let attachments = [];
    if (attachmentIds.length) {
      const placeholders = attachmentIds.map((_, index) => `?${index + 2}`).join(',');
      const { results } = await env.DB.prepare(`SELECT teaching_files.* FROM teaching_files LEFT JOIN teaching_file_recipients ON teaching_file_recipients.file_id = teaching_files.id AND teaching_file_recipients.student_id = ?1 WHERE teaching_files.id IN (${placeholders}) AND (teaching_files.owner_id = ?1 OR teaching_file_recipients.student_id = ?1)`).bind(account.id, ...attachmentIds).all();
      if ((results || []).length !== attachmentIds.length) return jsonResponse({ error: 'file_forbidden' }, 403);
      attachments = results.map((row) => ({ id: row.id, name: row.file_name, type: row.content_type, size: row.size_bytes, url: `/api/files/${row.id}` }));
      if (account.role === 'tutor') {
        let studentIds = recipientId ? [recipientId] : [];
        if (groupId) { const members = await env.DB.prepare('SELECT student_id FROM student_group_members WHERE group_id = ?1').bind(groupId).all(); studentIds = (members.results || []).map((row) => row.student_id); }
        if (studentIds.length) await env.DB.batch(attachmentIds.flatMap((fileId) => studentIds.map((studentId) => env.DB.prepare('INSERT OR IGNORE INTO teaching_file_recipients (file_id, student_id) VALUES (?1, ?2)').bind(fileId, studentId))));
      }
    }
    const id = crypto.randomUUID(); const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare('INSERT INTO messages (id, sender_id, recipient_id, group_id, body, attachments_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(id, account.id, recipientId, groupId, body, JSON.stringify(attachments), now).run();
    return jsonResponse({ message: { id, senderId: account.id, senderName: account.name, recipientId, groupId, body, attachments, createdAt: now } }, 201);
  }

  if (path === '/api/homework-files' && request.method === 'POST') {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (account.role !== 'tutor') return jsonResponse({ error: 'tutor_account_required' }, 403);
    if (!env.HOMEWORK_FILES) return jsonResponse({ error: 'file_storage_not_configured' }, 503);
    if (Number(request.headers.get('Content-Length') || 0) > 10_500_000) return jsonResponse({ error: 'file_too_large', message: 'Максимальный размер файла — 10 МБ.' }, 413);
    let form; try { form = await request.formData(); } catch { return jsonResponse({ error: 'invalid_form_data' }, 400); }
    const file = form.get('file'); const taskId = String(form.get('taskId') || '').slice(0, 100);
    const studentIds = [...new Set(form.getAll('studentId').map(String))].slice(0, 100);
    if (!file || typeof file.arrayBuffer !== 'function' || !taskId || !studentIds.length || file.size < 1 || file.size > 10_000_000) return jsonResponse({ error: 'invalid_attachment', message: 'Выберите файл до 10 МБ.' }, 400);
    const placeholders = studentIds.map((_, index) => `?${index + 2}`).join(',');
    const linked = await env.DB.prepare(`SELECT student_id FROM tutor_students WHERE tutor_id = ?1 AND student_id IN (${placeholders})`).bind(account.id, ...studentIds).all();
    if ((linked.results || []).length !== studentIds.length) return jsonResponse({ error: 'student_not_linked' }, 403);
    const safeName = String(file.name || 'file').replace(/[\u0000-\u001f\u007f\\/]/g, '_').trim().slice(0, 180) || 'file';
    const id = crypto.randomUUID(); const objectKey = `${account.id}/${id}`; const now = Math.floor(Date.now() / 1000);
    await env.HOMEWORK_FILES.put(objectKey, await file.arrayBuffer(), { metadata: { contentType: String(file.type || 'application/octet-stream').slice(0, 150) } });
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO homework_attachments (id, owner_id, task_id, object_key, file_name, content_type, size_bytes, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).bind(id, account.id, taskId, objectKey, safeName, String(file.type || 'application/octet-stream').slice(0, 150), file.size, now),
        ...studentIds.map((studentId) => env.DB.prepare('INSERT INTO homework_attachment_recipients (attachment_id, student_id) VALUES (?1, ?2)').bind(id, studentId)),
      ]);
    } catch (error) { await env.HOMEWORK_FILES.delete(objectKey); throw error; }
    return jsonResponse({ attachment: { id, taskId, name: safeName, type: String(file.type || 'application/octet-stream'), size: file.size, url: `/api/homework-files/${id}` } }, 201);
  }

  const homeworkFileMatch = path.match(/^\/api\/homework-files\/([0-9a-f-]{36})$/i);
  if (homeworkFileMatch && (request.method === 'GET' || request.method === 'DELETE')) {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (!env.HOMEWORK_FILES) return jsonResponse({ error: 'file_storage_not_configured' }, 503);
    const attachment = await env.DB.prepare(`SELECT homework_attachments.*,
      EXISTS(SELECT 1 FROM homework_attachment_recipients WHERE attachment_id = homework_attachments.id AND student_id = ?2) AS can_read
      FROM homework_attachments WHERE homework_attachments.id = ?1`).bind(homeworkFileMatch[1], account.id).first();
    if (!attachment || (attachment.owner_id !== account.id && !attachment.can_read)) return jsonResponse({ error: 'attachment_not_found' }, 404);
    if (request.method === 'DELETE') {
      if (attachment.owner_id !== account.id) return jsonResponse({ error: 'attachment_forbidden' }, 403);
      await env.HOMEWORK_FILES.delete(attachment.object_key);
      await env.DB.prepare('DELETE FROM homework_attachments WHERE id = ?1 AND owner_id = ?2').bind(attachment.id, account.id).run();
      return jsonResponse({ ok: true });
    }
    const object = await env.HOMEWORK_FILES.get(attachment.object_key, 'arrayBuffer'); if (!object) return jsonResponse({ error: 'attachment_not_found' }, 404);
    const inline = /^image\//.test(attachment.content_type) || attachment.content_type === 'application/pdf' || /^text\//.test(attachment.content_type);
    const headers = new Headers({
      'Content-Type': attachment.content_type || 'application/octet-stream',
      'Content-Length': String(attachment.size_bytes),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.file_name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new Response(object, { headers });
  }

  if (path === '/api/auth/me' && request.method === 'GET') {
    return jsonResponse({ account: account ? { ...account, timeZone: account.time_zone || null } : null });
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

  if (path === '/api/profile' && (request.method === 'GET' || request.method === 'PUT')) {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (request.method === 'GET') {
      const requestedId = new URL(request.url).searchParams.get('account');
      let targetId = account.id;
      if (requestedId && requestedId !== account.id) {
        if (account.role !== 'tutor') return jsonResponse({ error: 'not_found' }, 404);
        const linked = await env.DB.prepare('SELECT 1 AS linked FROM tutor_students WHERE tutor_id = ?1 AND student_id = ?2').bind(account.id, requestedId).first();
        if (!linked) return jsonResponse({ error: 'not_found' }, 404);
        targetId = requestedId;
      }
      const saved = await env.DB.prepare('SELECT profile_json FROM account_profiles WHERE account_id = ?1').bind(targetId).first();
      let profile = {};
      try { if (saved?.profile_json) profile = JSON.parse(saved.profile_json); } catch { return jsonResponse({ error: 'invalid_profile_data' }, 500); }
      const target = targetId === account.id ? account : await env.DB.prepare('SELECT name, email, role FROM accounts WHERE id = ?1').bind(targetId).first();
      return jsonResponse({ profile: { ...profile, name: target?.name, email: target?.email, role: target?.role } });
    }
    const parsed = await readJsonBody(request, 8192);
    if (parsed.error) return parsed.error;
    const input = parsed.value;
    const requestedId = new URL(request.url).searchParams.get('account');
    let targetId = account.id;
    if (requestedId && requestedId !== account.id) {
      if (account.role !== 'tutor') return jsonResponse({ error: 'not_found' }, 404);
      const linked = await env.DB.prepare('SELECT 1 AS linked FROM tutor_students WHERE tutor_id = ?1 AND student_id = ?2').bind(account.id, requestedId).first();
      if (!linked) return jsonResponse({ error: 'not_found' }, 404);
      targetId = requestedId;
    }
    const previous = await env.DB.prepare('SELECT profile_json FROM account_profiles WHERE account_id = ?1').bind(targetId).first();
    let oldProfile = {};
    try { if (previous?.profile_json) oldProfile = JSON.parse(previous.profile_json); } catch { return jsonResponse({ error: 'invalid_profile_data' }, 500); }
    const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 80) : (targetId === account.id ? account.name : '');
    const grade = typeof input?.grade === 'string' ? input.grade.trim().slice(0, 40) : (oldProfile.grade || '');
    const target = targetId === account.id ? account : await env.DB.prepare('SELECT role FROM accounts WHERE id = ?1').bind(targetId).first();
    if (name.length < 2) return jsonResponse({ error: 'invalid_profile' }, 400);
    await env.DB.prepare('UPDATE accounts SET name = ?1, updated_at = ?2 WHERE id = ?3').bind(name, Math.floor(Date.now() / 1000), targetId).run();
    const profile = { ...oldProfile, ...(input && typeof input === 'object' ? input : {}), name, ...(target?.role === 'student' ? { grade } : {}) };
    for (const field of ['name', 'email', 'role']) delete profile[field];
    await env.DB.prepare(`INSERT INTO account_profiles (account_id, profile_json, updated_at) VALUES (?1, ?2, ?3)
      ON CONFLICT(account_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at`)
      .bind(targetId, JSON.stringify(profile), Math.floor(Date.now() / 1000)).run();
    return jsonResponse({ ok: true, profile: { ...profile, name, email: targetId === account.id ? account.email : undefined, role: target?.role } });
  }

  if (path === '/api/profile/email' && request.method === 'POST') {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (!env.RESEND_API_KEY || !env.AUTH_FROM_EMAIL) return jsonResponse({ error: 'email_not_configured' }, 503);
    const parsed = await readJsonBody(request, 4096);
    if (parsed.error) return parsed.error;
    const email = typeof parsed.value?.email === 'string' ? parsed.value.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || email === account.email?.toLowerCase()) return jsonResponse({ error: 'invalid_email' }, 400);
    const occupied = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?1 COLLATE NOCASE').bind(email).first();
    if (occupied) return jsonResponse({ error: 'email_in_use' }, 409);
    const token = randomBase64Url(); const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare('DELETE FROM email_change_tokens WHERE account_id = ?1 OR new_email = ?2').bind(account.id, email).run();
    await env.DB.prepare('INSERT INTO email_change_tokens (token_hash, account_id, new_email, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(await sha256Hex(token), account.id, email, now + EMAIL_VERIFICATION_TTL_SECONDS, now).run();
    const link = `${emailOrigin}/?email_change=${encodeURIComponent(token)}`;
    const mail = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.AUTH_FROM_EMAIL, to: [email], subject: 'Подтвердите новый email Tutdesk', text: `Чтобы изменить email аккаунта Tutdesk, откройте ссылку: ${link}. Ссылка действует 24 часа.`, html: `<p>Подтвердите новый email для Tutdesk:</p><p><a href="${link}">Подтвердить адрес</a></p><p>Ссылка действует 24 часа.</p>` }) });
    if (!mail.ok) { await env.DB.prepare('DELETE FROM email_change_tokens WHERE account_id = ?1').bind(account.id).run(); return jsonResponse({ error: 'email_delivery_failed' }, 503); }
    return jsonResponse({ ok: true });
  }

  if (path === '/api/profile/email/confirm' && request.method === 'POST') {
    const parsed = await readJsonBody(request, 4096);
    if (parsed.error) return parsed.error;
    const token = typeof parsed.value?.token === 'string' ? parsed.value.token : '';
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return jsonResponse({ error: 'invalid_token' }, 400);
    const pending = await env.DB.prepare('SELECT account_id, new_email FROM email_change_tokens WHERE token_hash = ?1 AND expires_at > ?2').bind(await sha256Hex(token), Math.floor(Date.now() / 1000)).first();
    if (!pending) return jsonResponse({ error: 'invalid_token' }, 400);
    const collision = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?1 COLLATE NOCASE AND id <> ?2').bind(pending.new_email, pending.account_id).first();
    if (collision) return jsonResponse({ error: 'email_in_use' }, 409);
    await env.DB.batch([
      env.DB.prepare('UPDATE accounts SET email = ?1, email_verified = 1, updated_at = ?2 WHERE id = ?3').bind(pending.new_email, Math.floor(Date.now() / 1000), pending.account_id),
      env.DB.prepare('DELETE FROM email_change_tokens WHERE account_id = ?1').bind(pending.account_id),
    ]);
    return jsonResponse({ ok: true });
  }

  if (path === '/api/videos' && (request.method === 'GET' || request.method === 'POST')) {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (request.method === 'GET') {
      if (account.role === 'tutor') {
        const { results } = await env.DB.prepare(`
          SELECT video_lessons.*, video_lesson_assignments.student_id
          FROM video_lessons
          LEFT JOIN video_lesson_assignments ON video_lesson_assignments.video_id = video_lessons.id
          WHERE video_lessons.owner_id = ?1
          ORDER BY video_lessons.updated_at DESC
        `).bind(account.id).all();
        const videos = new Map();
        for (const row of results || []) {
          if (!videos.has(row.id)) videos.set(row.id, videoModel(row));
          if (row.student_id) videos.get(row.id).assignedStudentIds.push(row.student_id);
        }
        return jsonResponse({ videos: [...videos.values()] });
      }
      const { results } = await env.DB.prepare(`
        SELECT DISTINCT video_lessons.*
        FROM video_lessons
        LEFT JOIN video_lesson_assignments ON video_lesson_assignments.video_id = video_lessons.id
        LEFT JOIN tutor_students ON tutor_students.tutor_id = video_lesson_assignments.assigned_by
          AND tutor_students.student_id = video_lesson_assignments.student_id
        WHERE video_lessons.owner_id = ?1
          OR (video_lesson_assignments.student_id = ?1 AND tutor_students.student_id IS NOT NULL)
        ORDER BY video_lessons.updated_at DESC
      `).bind(account.id).all();
      return jsonResponse({ videos: (results || []).map((row) => videoModel(row)) });
    }
    const parsed = await readJsonBody(request, 4096);
    if (parsed.error) return parsed.error;
    const title = typeof parsed.value?.title === 'string' ? parsed.value.title.trim().slice(0, 100) : '';
    const video = videoFromUrl(parsed.value?.url);
    if (!title || !video) return jsonResponse({ error: 'invalid_video' }, 400);
    const id = crypto.randomUUID(); const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`INSERT INTO video_lessons
      (id, owner_id, title, provider, source_url, embed_url, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`)
      .bind(id, account.id, title, video.provider, video.sourceUrl, video.embedUrl, now).run();
    return jsonResponse({ video: videoModel({ id, owner_id: account.id, title, provider: video.provider, source_url: video.sourceUrl, embed_url: video.embedUrl, created_at: now, updated_at: now }) }, 201);
  }

  const videoAssignmentMatch = path.match(/^\/api\/videos\/([0-9a-f-]{36})\/assignments$/i);
  if (videoAssignmentMatch && (request.method === 'POST' || request.method === 'DELETE')) {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (account.role !== 'tutor') return jsonResponse({ error: 'tutor_account_required' }, 403);
    const parsed = await readJsonBody(request, 4096);
    if (parsed.error) return parsed.error;
    const studentId = typeof parsed.value?.studentId === 'string' ? parsed.value.studentId : '';
    const [owned, linked] = await Promise.all([
      env.DB.prepare('SELECT 1 AS owned FROM video_lessons WHERE id = ?1 AND owner_id = ?2').bind(videoAssignmentMatch[1], account.id).first(),
      env.DB.prepare('SELECT 1 AS linked FROM tutor_students WHERE tutor_id = ?1 AND student_id = ?2').bind(account.id, studentId).first(),
    ]);
    if (!owned) return jsonResponse({ error: 'video_not_found' }, 404);
    if (!linked) return jsonResponse({ error: 'student_not_linked' }, 403);
    if (request.method === 'POST') {
      await env.DB.prepare(`INSERT OR IGNORE INTO video_lesson_assignments (video_id, student_id, assigned_by, created_at)
        VALUES (?1, ?2, ?3, ?4)`).bind(videoAssignmentMatch[1], studentId, account.id, Math.floor(Date.now() / 1000)).run();
    } else {
      await env.DB.prepare('DELETE FROM video_lesson_assignments WHERE video_id = ?1 AND student_id = ?2 AND assigned_by = ?3')
        .bind(videoAssignmentMatch[1], studentId, account.id).run();
    }
    return jsonResponse({ ok: true });
  }

  const videoMatch = path.match(/^\/api\/videos\/([0-9a-f-]{36})$/i);
  if (videoMatch && request.method === 'DELETE') {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    const result = await env.DB.prepare('DELETE FROM video_lessons WHERE id = ?1 AND owner_id = ?2').bind(videoMatch[1], account.id).run();
    if (!result.meta?.changes) return jsonResponse({ error: 'video_not_found' }, 404);
    return jsonResponse({ ok: true });
  }

  if (path === '/api/tutor-students' && (request.method === 'GET' || request.method === 'POST' || request.method === 'DELETE')) {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (request.method === 'DELETE') {
      if (account.role !== 'tutor') return jsonResponse({ error: 'tutor_account_required' }, 403);
      const parsed = await readJsonBody(request, 4096);
      if (parsed.error) return parsed.error;
      const studentId = typeof parsed.value?.studentId === 'string' ? parsed.value.studentId : '';
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM video_lesson_assignments
          WHERE student_id = ?1 AND assigned_by = ?2`).bind(studentId, account.id),
        env.DB.prepare('DELETE FROM tutor_students WHERE tutor_id = ?1 AND student_id = ?2').bind(account.id, studentId),
      ]);
      return jsonResponse({ ok: true });
    }
    if (request.method === 'POST') {
      if (account.role !== 'tutor') return jsonResponse({ error: 'tutor_account_required' }, 403);
      const parsed = await readJsonBody(request, 4096);
      if (parsed.error) return parsed.error;
      const email = typeof parsed.value?.email === 'string' ? parsed.value.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return jsonResponse({ error: 'invalid_email' }, 400);
      if (email === account.email?.toLowerCase()) return jsonResponse({ error: 'cannot_link_self' }, 400);
      const student = await env.DB.prepare(`SELECT id, role, name, email FROM accounts
        WHERE email = ?1 AND role = 'student' AND email_verified = 1`).bind(email).first();
      if (!student) return jsonResponse({ error: 'student_not_found' }, 404);
      await env.DB.prepare('INSERT OR IGNORE INTO tutor_students (tutor_id, student_id, created_at) VALUES (?1, ?2, ?3)')
        .bind(account.id, student.id, Math.floor(Date.now() / 1000)).run();
    }
    if (!['tutor', 'student'].includes(account.role)) return jsonResponse({ error: 'profile_setup_required' }, 403);
    const query = account.role === 'tutor'
      ? `SELECT accounts.id, accounts.role, accounts.name, accounts.email FROM tutor_students
         JOIN accounts ON accounts.id = tutor_students.student_id WHERE tutor_students.tutor_id = ?1 ORDER BY accounts.name`
      : `SELECT accounts.id, accounts.role, accounts.name, accounts.email FROM tutor_students
         JOIN accounts ON accounts.id = tutor_students.tutor_id WHERE tutor_students.student_id = ?1 ORDER BY accounts.name`;
    const { results } = await env.DB.prepare(query).bind(account.id).all();
    return jsonResponse({ accounts: results || [] });
  }

  if (path === '/api/account-data' && (request.method === 'GET' || request.method === 'PUT')) {
    if (!account) return jsonResponse({ error: 'not_authenticated' }, 401);
    if (request.method === 'GET') {
      const requestedId = new URL(request.url).searchParams.get('account');
      let targetId = account.id;
      if (requestedId && requestedId !== account.id) {
        const relation = account.role === 'tutor'
          ? await env.DB.prepare('SELECT 1 AS linked FROM tutor_students WHERE tutor_id = ?1 AND student_id = ?2').bind(account.id, requestedId).first()
          : await env.DB.prepare('SELECT 1 AS linked FROM tutor_students WHERE student_id = ?1 AND tutor_id = ?2').bind(account.id, requestedId).first();
        if (!relation) return jsonResponse({ error: 'not_found' }, 404);
        targetId = requestedId;
      }
      const saved = await env.DB.prepare('SELECT data_json FROM account_data WHERE account_id = ?1').bind(targetId).first();
      if (!saved) return jsonResponse({ data: null });
      try {
        const data = JSON.parse(saved.data_json);
        if (!requestedId || requestedId === account.id) return jsonResponse({ data });
        if (account.role === 'tutor') return jsonResponse({ data: {} });
        const studentModelId = `student-${account.id}`;
        const lessons = Array.isArray(data.lessons) ? data.lessons.filter((lesson) => lesson?.studentAccountId === account.id || lesson?.studentId === studentModelId) : [];
        const lessonIds = new Set(lessons.map((lesson) => lesson.id));
        const tasks = Array.isArray(data.tasks) ? data.tasks.filter((task) => task?.kind !== 'personal' && task?.studentId === studentModelId) : [];
        const boards = Array.isArray(data.boards) ? data.boards.filter((board) => Array.isArray(board?.lessonIds) && board.lessonIds.some((id) => lessonIds.has(id))).map((board) => ({ ...board, lessonIds: board.lessonIds.filter((id) => lessonIds.has(id)) })) : [];
        return jsonResponse({ data: { lessons, tasks, boards } });
      } catch { return jsonResponse({ error: 'invalid_account_data' }, 500); }
    }
    const parsed = await readJsonBody(request, 1_000_000);
    if (parsed.error) return parsed.error;
    const input = parsed.value;
    if (!input?.data || typeof input.data !== 'object' || Array.isArray(input.data)) {
      return jsonResponse({ error: 'invalid_account_data' }, 400);
    }
    const serialized = JSON.stringify({ ...input.data, videos: [] });
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
  if ((url.pathname === '/api/auth/register' || url.pathname === '/api/auth/login' || url.pathname === '/api/auth/verify' || url.pathname === '/api/auth/resend-verification' || url.pathname === '/api/auth/password-reset/request' || url.pathname === '/api/auth/password-reset/confirm' || url.pathname === '/api/auth/me' || url.pathname === '/api/auth/logout' || url.pathname === '/api/auth/role' || url.pathname === '/api/account-data' || url.pathname === '/api/tutor-students' || url.pathname === '/api/plan' || url.pathname === '/api/screen-share' || url.pathname.startsWith('/api/profile') || url.pathname.startsWith('/api/videos') || url.pathname.startsWith('/api/groups') || url.pathname.startsWith('/api/messages') || url.pathname.startsWith('/api/files') || url.pathname.startsWith('/api/homework-files'))) {
    return handleAuthApi(request, env, url.pathname, origin);
  }
  return jsonResponse({ error: 'not_found' }, 404);
}

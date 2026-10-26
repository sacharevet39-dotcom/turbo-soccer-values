import { accessFor, json, rpc, sameOrigin, type Env } from '../../_shared/admin'

type Context = { request: Request; env: Env }

async function rateKey(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function onRequestPost({ request, env }: Context) {
  if (!sameOrigin(request)) return json({ error: 'Request origin is not allowed.' }, 403)
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_SECRET_API_KEY || !env.TURBO_RATE_LIMIT_SALT) return json({ error: 'Admin login is not configured.' }, 503)
    if (!env.SUPABASE_SECRET_API_KEY.startsWith('sb_secret_')) return json({ error: 'Admin login requires a Supabase secret API key.' }, 503)
    const body = await request.json() as { username?: unknown; password?: unknown }
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!/^[a-z0-9_]{3,24}$/.test(username) || password.length < 1 || password.length > 256) return json({ error: 'Invalid username or password.' }, 401)
    const remote = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const ipKey = await rateKey(`${env.TURBO_RATE_LIMIT_SALT}:admin-login:ip:${remote}`)
    const ipAllowed = await rpc<boolean>(env, 'turbo_consume_login_attempt', { p_key: ipKey, p_limit: 30 })
    if (!ipAllowed) return json({ error: 'Invalid username or password. Try again later.' }, 429)

    const internalEmail = await rpc<string | null>(env, 'turbo_server_login_email', { p_username: username })
    if (!internalEmail) return json({ error: 'Invalid username or password.' }, 401)
    const accountKey = await rateKey(`${env.TURBO_RATE_LIMIT_SALT}:admin-login:ip-account:${remote}:${username}`)
    const accountAllowed = await rpc<boolean>(env, 'turbo_consume_login_attempt', { p_key: accountKey, p_limit: 8 })
    if (!accountAllowed) return json({ error: 'Invalid username or password. Try again later.' }, 429)
    const headers: Record<string, string> = {
      apikey: env.SUPABASE_SECRET_API_KEY,
      'content-type': 'application/json',
    }
    if (remote !== 'unknown') headers['Sb-Forwarded-For'] = remote
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: internalEmail, password }),
    })
    if (!response.ok) return json({ error: 'Invalid username or password.' }, 401)
    const session = await response.json() as { access_token?: string; refresh_token?: string; user?: { id?: string } }
    if (!session.access_token || !session.refresh_token || !session.user?.id) return json({ error: 'Invalid username or password.' }, 401)
    const access = await accessFor(env, session.user.id, session.access_token)
    if (!access || access.role !== 'ADMIN' || access.status !== 'active') return json({ error: 'Invalid username or password.' }, 401)
    return json({ access_token: session.access_token, refresh_token: session.refresh_token })
  } catch {
    return json({ error: 'Admin login is temporarily unavailable.' }, 503)
  }
}

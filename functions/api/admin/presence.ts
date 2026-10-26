import { accessFor, authUser, bearer, currentToken, json, rpc, sameOrigin, type Env } from '../../_shared/admin'

type Context = { request: Request; env: Env }

export async function onRequestGet({ env }: Context) {
  try {
    return json({ count: await rpc(env, 'turbo_public_online_count', {}) })
  } catch {
    return json({ count: null })
  }
}

export async function onRequestPost({ request, env }: Context) {
  if (!sameOrigin(request)) return json({ error: 'Request origin is not allowed.' }, 403)
  let sessionId = ''
  try {
    const body = await request.json() as { sessionId?: unknown }
    sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  } catch { return json({ error: 'Invalid request.' }, 400) }
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error: 'Invalid session.' }, 400)

  if (!env.TURBO_RATE_LIMIT_SALT) return json({ error: 'Presence is not configured.' }, 503)
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const rateHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.TURBO_RATE_LIMIT_SALT}:presence:${ip}`))
  const rateKey = Array.from(new Uint8Array(rateHash), byte => byte.toString(16).padStart(2, '0')).join('')
  try {
    const allowed = await rpc<boolean>(env, 'turbo_consume_login_attempt', { p_key: rateKey, p_limit: 2000 })
    if (!allowed) return json({ error: 'Presence updates are temporarily limited.' }, 429)
  } catch { return json({ error: 'Presence is temporarily unavailable.' }, 503) }

  let userId: string | null = null
  const token = bearer(request)
  if (token) {
    const user = await authUser(env, token)
    if (user) {
      const access = await accessFor(env, user.id, token)
      if (access?.status === 'active' && currentToken(token, access)) userId = user.id
    }
  }
  try {
    const count = await rpc(env, 'turbo_presence_heartbeat', { p_session_id: sessionId, p_user_id: userId })
    return json({ count })
  } catch {
    return json({ error: 'Presence update failed.' }, 503)
  }
}

import { json, rpc, sameOrigin, type Env } from '../_shared/admin'

type Context = { request: Request; env: Env }

export async function onRequestGet({ env }: Context) {
  try {
    return json({ total: await rpc<number>(env, 'turbo_site_visit_count', {}) })
  } catch {
    return json({ error: 'Visitor count is temporarily unavailable.' }, 503)
  }
}

export async function onRequestPost({ request, env }: Context) {
  if (!sameOrigin(request)) return json({ error: 'Request origin is not allowed.' }, 403)

  let visitId = ''
  try {
    const body = await request.json() as { visitId?: unknown }
    visitId = typeof body.visitId === 'string' ? body.visitId : ''
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }
  if (!/^[0-9a-f-]{36}$/i.test(visitId)) return json({ error: 'Invalid visit.' }, 400)
  if (!env.TURBO_RATE_LIMIT_SALT) return json({ error: 'Visitor count is not configured.' }, 503)

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.TURBO_RATE_LIMIT_SALT}:site-visit:${ip}`))
  const rateKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  try {
    const allowed = await rpc<boolean>(env, 'turbo_consume_login_attempt', { p_key: rateKey, p_limit: 300 })
    if (!allowed) return json({ error: 'Visitor updates are temporarily limited.' }, 429)
    return json(await rpc(env, 'turbo_register_site_visit', { p_visit_id: visitId }))
  } catch {
    return json({ error: 'Visitor count is temporarily unavailable.' }, 503)
  }
}

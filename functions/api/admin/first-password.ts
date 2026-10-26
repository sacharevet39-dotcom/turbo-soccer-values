import { accessFor, authUser, bearer, currentToken, json, rpc, sameOrigin, serviceAuth, type Env } from '../../_shared/admin'
import { ADMIN_PASSWORD_POLICY_MESSAGE, isStrongAdminPassword } from '../../../shared/password-policy.js'

type Context = { request: Request; env: Env }

export async function onRequestPost({ request, env }: Context) {
  if (!sameOrigin(request)) return json({ error: 'Request origin is not allowed.' }, 403)
  const token = bearer(request)
  const user = await authUser(env, token)
  if (!user) return json({ error: 'Sign in again to continue.' }, 401)
  const access = await accessFor(env, user.id, token)
  if (!access || access.role !== 'ADMIN' || access.status !== 'active' || !access.must_change_password || !currentToken(token, access)) return json({ error: 'This password-change session is no longer valid.' }, 403)
  let body: { password?: unknown }
  try { body = await request.json() as { password?: unknown } } catch { return json({ error: 'Invalid request.' }, 400) }
  if (!isStrongAdminPassword(body.password)) return json({ error: ADMIN_PASSWORD_POLICY_MESSAGE }, 400)
  try {
    await serviceAuth(env, `/admin/users/${encodeURIComponent(user.id)}`, 'PUT', { password: body.password })
  } catch {
    return json({ error: 'Auth did not confirm the password update. The required-change flag remains enabled; do not assume the change succeeded. Retry with the password you intend to use, or ask the owner to reset it if sign-in fails.' }, 502)
  }
  try {
    await rpc(env, 'turbo_server_complete_password_change', { p_user_id: user.id })
    return json({ ok: true })
  } catch {
    return json({ error: 'Auth accepted the password update, but the completion step could not be confirmed. Do not assume setup is complete. Sign in with the password you set: if prompted to change it, retry this step; if normal admin access opens, setup completed. If sign-in fails or the outcome remains unclear, ask the owner to reset it.' }, 503)
  }
}

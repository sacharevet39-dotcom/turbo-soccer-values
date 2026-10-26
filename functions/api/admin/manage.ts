import { accessFor, authUser, bearer, currentToken, json, randomPassword, rpc, sameOrigin, serviceAuth, validAdminTitle, validText, validUsername, type Env } from '../../_shared/admin'

type Context = { request: Request; env: Env }
type Body = Record<string, unknown> & { action?: string }
const COLOR_SET = new Set(['#b4f34b', '#ffd166', '#ff6b6b', '#7bdff2', '#c77dff', '#ffffff'])

export async function onRequestPost({ request, env }: Context) {
  if (!sameOrigin(request)) return json({ error: 'Request origin is not allowed.' }, 403)
  const token = bearer(request)
  const user = await authUser(env, token)
  if (!user) return json({ error: 'Sign in again to continue.' }, 401)
  const access = await accessFor(env, user.id, token)
  if (!access || access.status !== 'active' || access.role !== 'OWNER' || !currentToken(token, access)) return json({ error: 'Owner access is required.' }, 403)

  let body: Body
  try { body = await request.json() as Body } catch { return json({ error: 'Invalid request.' }, 400) }
  const actor = user.id
  try {
    if (body.action === 'list') {
      const accounts = await rpc(env, 'turbo_owner_accounts', { p_actor: actor })
      return json({ accounts })
    }
    if (body.action === 'create') {
      const username = String(body.username ?? '').trim()
      const displayName = String(body.displayName ?? '').trim()
      const title = String(body.title ?? 'Admin').trim()
      const titleColor = String(body.titleColor ?? '#b4f34b')
      if (!validUsername(username) || !validText(displayName, 40) || !validAdminTitle(title) || !COLOR_SET.has(titleColor)) return json({ error: 'Check the username, display name, title, and color. Titles containing OWNER are reserved for the account role.' }, 400)
      const internalEmail = `${crypto.randomUUID()}@accounts.turbo-soccer-values.invalid`
      const temporaryPassword = randomPassword()
      let created: Record<string, unknown> | null
      try {
        created = await serviceAuth(env, '/admin/users', 'POST', { email: internalEmail, password: temporaryPassword, email_confirm: true })
      } catch {
        return json({ error: 'Auth account creation failed or could not be confirmed. Do not treat the admin as created or share a temporary password. Check Auth users manually before retrying.' }, 502)
      }
      const createdUser = typeof created?.user === 'object' && created.user ? created.user as Record<string, unknown> : created
      const id = typeof createdUser?.id === 'string' ? createdUser.id : ''
      if (!id) return json({ error: 'Auth may have created an account but returned no usable ID. Do not treat the admin as created or share a temporary password. Check Auth users manually before retrying.' }, 502)
      try {
        await rpc(env, 'turbo_owner_create_admin', { p_actor: actor, p_user_id: id, p_username: username, p_internal_email: internalEmail, p_display_name: displayName, p_title: title, p_title_color: titleColor })
      } catch {
        return json({ error: `Supabase Auth account ${id} was created, but admin provisioning failed or could not be confirmed. Do not treat the admin as created or share a temporary password. No account was deleted; manual verification is required.` }, 502)
      }
      return json({ temporaryPassword }, 201)
    }
    if (body.action === 'update') {
      const target = String(body.userId ?? '')
      const username = String(body.username ?? '').trim()
      const displayName = String(body.displayName ?? '').trim()
      const title = String(body.title ?? '').trim()
      const titleColor = String(body.titleColor ?? '')
      const status = body.status === 'suspended' ? 'suspended' : body.status === 'active' ? 'active' : ''
      if (!/^[0-9a-f-]{36}$/i.test(target) || !validUsername(username) || !validText(displayName, 40) || !validAdminTitle(title) || !COLOR_SET.has(titleColor) || !status) return json({ error: 'Check the admin profile fields. Titles containing OWNER are reserved for the account role.' }, 400)
      await rpc(env, 'turbo_owner_update_admin', { p_actor: actor, p_target: target, p_username: username, p_display_name: displayName, p_title: title, p_title_color: titleColor, p_status: status })
      return json({ ok: true })
    }
    if (body.action === 'reset-password') {
      const target = String(body.userId ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(target)) return json({ error: 'Invalid account.' }, 400)
      const temporaryPassword = randomPassword()
      await rpc(env, 'turbo_owner_mark_password_reset', { p_actor: actor, p_target: target })
      try {
        await serviceAuth(env, `/admin/users/${encodeURIComponent(target)}`, 'PUT', { password: temporaryPassword })
      } catch {
        return json({ error: `The reset for admin ${target} is incomplete or could not be confirmed. The account remains marked for a password change and its existing sessions were revoked. No temporary password is being shown; retry the reset before sharing credentials.` }, 502)
      }
      return json({ temporaryPassword })
    }
    if (body.action === 'revoke-sessions') {
      const target = String(body.userId ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(target)) return json({ error: 'Invalid account.' }, 400)
      await rpc(env, 'turbo_owner_revoke_sessions', { p_actor: actor, p_target: target })
      return json({ ok: true })
    }
    if (body.action === 'audit') return json({ entries: await rpc(env, 'turbo_owner_audit', { p_actor: actor }) })
    if (body.action === 'presence') return json({ presence: await rpc(env, 'turbo_owner_presence', { p_actor: actor }) })
    return json({ error: 'Unknown admin action.' }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/duplicate key|unique constraint/i.test(message)) return json({ error: 'That username is already in use.' }, 409)
    if (/regular admin not found|P0002/i.test(message)) return json({ error: 'Admin account was not found.' }, 404)
    return json({ error: 'The admin action could not be completed.' }, 500)
  }
}

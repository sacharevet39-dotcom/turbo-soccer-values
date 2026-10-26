import { isStrongAdminPassword } from '../shared/password-policy.js'

// One-time/idempotent regular-admin provisioning. Passwords are supplied only
// through process environment variables and are never written to files/logs.
const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerId = process.env.TURBO_OWNER_USER_ID || '99aa849a-29ee-44b5-8951-a2bfb4d590fa'
if (!baseUrl || !serviceKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the current process first.')
if (!/^[0-9a-f-]{36}$/i.test(ownerId)) throw new Error('TURBO_OWNER_USER_ID must be a UUID.')

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' }
async function rpc(name, body) {
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`Supabase RPC ${name} failed (${response.status}).`)
  return response.json().catch(() => null)
}
async function auth(method, path, body) {
  const response = await fetch(`${baseUrl}/auth/v1${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`Supabase Auth Admin request failed (${response.status}).`)
  return result
}

const ownerRows = await rpc('turbo_server_admin_access', { p_user_id: ownerId })
if (!Array.isArray(ownerRows) || ownerRows[0]?.role !== 'OWNER' || ownerRows[0]?.status !== 'active') {
  throw new Error('The existing OWNER account is not linked. Apply and verify the admin migrations before provisioning.')
}
const userPages = new Map()
async function findExistingAuthUser(username) {
  const legacyEmail = `${username}@accounts.turbo-soccer-values.invalid`
  for (let page = 1; page <= 10; page++) {
    if (!userPages.has(page)) {
      const response = await auth('GET', `/admin/users?page=${page}&per_page=500`)
      userPages.set(page, response?.users ?? [])
    }
    const users = userPages.get(page)
    const match = users.find(user => user.app_metadata?.turbo_admin_provisioning_username === username)
      ?? users.find(user => user.email?.toLowerCase() === legacyEmail)
    if (match) return match
    if (users.length < 500) return null
  }
  throw new Error('Could not safely check for an existing Auth account; stopping without creating accounts.')
}

for (let number = 1; number <= 10; number++) {
  const username = `admin${number}`
  const envName = `TURBO_ADMIN${number}_INITIAL_PASSWORD`
  const existingStatus = await rpc('turbo_server_admin_login_record', { p_username: username })
  if (Array.isArray(existingStatus) && existingStatus[0]) {
    const status = existingStatus[0]
    const privateAliasPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@accounts\.turbo-soccer-values\.invalid$/i
    if (status.role === 'ADMIN' && !privateAliasPattern.test(status.internal_email ?? '')) {
      const authResponse = await auth('GET', `/admin/users/${encodeURIComponent(status.user_id)}`)
      const authUser = authResponse?.user && typeof authResponse.user === 'object' ? authResponse.user : authResponse
      if (!authUser?.id || authUser.id !== status.user_id) {
        throw new Error(`${username}: existing Auth account could not be verified by ID. Stop and inspect it manually; no password or account was changed.`)
      }
      const newEmail = `${crypto.randomUUID()}@accounts.turbo-soccer-values.invalid`
      try {
        await auth('PUT', `/admin/users/${encodeURIComponent(status.user_id)}`, {
          email: newEmail,
          email_confirm: true,
          app_metadata: { ...authUser.app_metadata, turbo_admin_provisioning_username: username },
        })
        await rpc('turbo_owner_rotate_admin_auth_email', {
          p_actor: ownerId,
          p_target: status.user_id,
          p_internal_email: newEmail,
        })
      } catch {
        throw new Error(`${username}: private Auth alias rotation was incomplete or could not be confirmed for account ${status.user_id}. Stop and verify Auth and admin records manually; the account password was not changed.`)
      }
      console.log(`${username}: existing account and password preserved; private Auth alias rotated.`)
    } else {
      console.log(`${username}: already exists (${status.status}; must change password: ${status.must_change_password}); preserved.`)
    }
    continue
  }
  const legacyEmail = `${username}@accounts.turbo-soccer-values.invalid`
  let user = await findExistingAuthUser(username)
  let email = user?.email?.toLowerCase() ?? ''
  let createdHere = false
  if (!user) {
    const password = process.env[envName]
    if (!password || !isStrongAdminPassword(password, 16)) throw new Error(`Set ${envName} (at least 16 characters, including uppercase, lowercase, a number, and a symbol) before provisioning.`)
    email = `${crypto.randomUUID()}@accounts.turbo-soccer-values.invalid`
    try {
      user = await auth('POST', '/admin/users', {
        email,
        password,
        email_confirm: true,
        app_metadata: { turbo_admin_provisioning_username: username },
      })
    } catch {
      throw new Error(`${username}: Auth account creation failed or could not be confirmed. Stop and verify Auth manually before retrying; no account was deleted.`)
    }
    createdHere = true
    userPages.clear()
  } else if (email === legacyEmail || user.app_metadata?.turbo_admin_provisioning_username !== username) {
    email = `${crypto.randomUUID()}@accounts.turbo-soccer-values.invalid`
    try {
      user = await auth('PUT', `/admin/users/${encodeURIComponent(user.id)}`, {
        email,
        email_confirm: true,
        app_metadata: { ...user.app_metadata, turbo_admin_provisioning_username: username },
      })
    } catch {
      throw new Error(`${username}: existing Auth account could not be moved to a private alias. Stop and verify Auth manually before retrying.`)
    }
    userPages.clear()
  }
  user = user?.user && typeof user.user === 'object' ? user.user : user
  if (!user?.id) throw new Error(`${username}: Auth may have created an account but returned no user ID. Stop and verify Auth manually before retrying; no account was deleted.`)
  try {
    await rpc('turbo_owner_create_admin', {
      p_actor: ownerId,
      p_user_id: user.id,
      p_username: username,
      p_internal_email: email,
      p_display_name: username,
      p_title: 'Admin',
      p_title_color: '#b4f34b',
    })
    console.log(`${username}: ${createdHere ? 'created' : 'existing Auth user linked'}; forced password change is enabled.`)
  } catch {
    const accountOrigin = createdHere ? 'was created' : 'already existed'
    throw new Error(`${username}: provisioning failed after the Auth account ${accountOrigin} (${user.id}). No account was deleted. Manual verification is required before continuing.`)
  }
}
console.log('Provisioning finished. Existing accounts were not reset. Remove the temporary password environment variables now.')

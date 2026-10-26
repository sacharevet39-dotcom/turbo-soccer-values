export type Env = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  TURBO_RATE_LIMIT_SALT: string
}

export type AuthUser = { id: string; email?: string }
export type AdminAccess = { role: 'OWNER' | 'ADMIN'; status: 'active' | 'suspended'; must_change_password: boolean; tokens_valid_after: string }

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('Origin')
  return !origin || new URL(origin).origin === new URL(request.url).origin
}

export function bearer(request: Request) {
  const value = request.headers.get('Authorization') ?? ''
  return value.startsWith('Bearer ') ? value.slice(7) : ''
}

export async function authUser(env: Env, token: string): Promise<AuthUser | null> {
  if (!token) return null
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  const user = await response.json() as AuthUser
  return typeof user.id === 'string' ? user : null
}

export async function rpc<T>(env: Env, name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => null) as T | { message?: string } | null
  if (!response.ok) throw new Error(typeof result === 'object' && result && 'message' in result ? String(result.message) : `Supabase RPC ${name} failed (${response.status})`)
  return result as T
}

export async function serviceAuth(env: Env, path: string, method: string, body?: unknown) {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const result = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) throw new Error(typeof result?.msg === 'string' ? result.msg : typeof result?.message === 'string' ? result.message : `Auth Admin request failed (${response.status})`)
  return result
}

export async function accessFor(env: Env, userId: string, token?: string) {
  const rows = await rpc<AdminAccess[]>(env, 'turbo_server_admin_access', { p_user_id: userId })
  const access = Array.isArray(rows) ? rows[0] ?? null : null
  if (!access || !token) return access
  const sessionId = tokenClaims(token)?.session_id
  if (typeof sessionId !== 'string') return null
  const active = await rpc<boolean>(env, 'turbo_server_session_active', { p_user_id: userId, p_session_id: sessionId })
  return active ? access : null
}

export function currentToken(token: string, access: AdminAccess | null) {
  if (!access) return false
  const claims = tokenClaims(token)
  return typeof claims?.iat === 'number' && claims.iat * 1000 > Date.parse(access.tokens_valid_after)
}

function tokenClaims(token: string) {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { iat?: number; session_id?: string }
  } catch { return null }
}

export function validUsername(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_]{3,24}$/.test(value)
}

export function validText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
}

export function validAdminTitle(value: unknown): value is string {
  return validText(value, 32) && !value.trim().toUpperCase().includes('OWNER')
}

export function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

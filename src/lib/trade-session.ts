import { supabase, tradeAuth } from './supabase'

export async function resolveActiveTradeClient() {
  if (supabase) {
    const { data: adminSession } = await supabase.auth.getSession()
    if (adminSession.session) {
      const { data, error } = await supabase.rpc('my_turbo_admin_profile')
      const row = Array.isArray(data) ? data[0] : data
      if (!error && row?.status === 'active' && !row.must_change_password) return { client: supabase, userId: adminSession.session.user.id, admin: true }
    }
  }
  if (!tradeAuth) return null
  const { data } = await tradeAuth.auth.getSession()
  return data.session ? { client: tradeAuth, userId: data.session.user.id, admin: false } : null
}

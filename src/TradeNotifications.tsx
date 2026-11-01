import { useCallback, useEffect, useState } from 'react'
import { Bell, Check, CircleCheck, LoaderCircle, ShieldCheck } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { errorMessage, supabase, tradeAuth } from './lib/supabase'
import { resolveActiveTradeClient } from './lib/trade-session'

type TradeNotification = {
  id: string
  actor_id: string
  listing_id: string | null
  event_type: 'offer_accepted' | 'acceptance_sent'
  counterpart_name: string
  created_at: string
  read_at: string | null
}

export function TradeNotificationNavLink({ active, onClick }: { active: boolean; onClick: () => void }) {
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    let alive = true
    const refresh = async () => {
      const context = await resolveActiveTradeClient()
      if (!context) { if (alive) setUnread(0); return }
      const { count, error } = await context.client.from('trade_notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
      if (alive && !error) setUnread(count ?? 0)
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15_000)
    const subscriptions = [supabase?.auth.onAuthStateChange(() => window.setTimeout(() => void refresh(), 0)).data.subscription, tradeAuth?.auth.onAuthStateChange(() => window.setTimeout(() => void refresh(), 0)).data.subscription]
    const onNotificationsUpdated = () => { window.setTimeout(() => void refresh(), 0) }
    window.addEventListener('tvs:notifications-updated', onNotificationsUpdated)
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('tvs:notifications-updated', onNotificationsUpdated); subscriptions.forEach(subscription => subscription?.unsubscribe()) }
  }, [])
  return <button type="button" className={`nav-link trade-notifications-nav${active ? ' active' : ''}`} aria-pressed={active} onClick={onClick}>
    Notifications{unread > 0 && <span className="trade-notification-badge" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span>}
  </button>
}

export function TradeNotificationCenter({ onOpenTradeBoard }: { onOpenTradeBoard: () => void }) {
  const [client, setClient] = useState<SupabaseClient | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [rows, setRows] = useState<TradeNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [markingAll, setMarkingAll] = useState(false)

  const refresh = useCallback(async () => {
    const context = await resolveActiveTradeClient()
    if (!context) { setClient(null); setUserId(null); setRows([]); setLoading(false); return }
    setClient(context.client)
    setUserId(context.userId)
    const { data, error: queryError } = await context.client.from('trade_notifications').select('id,actor_id,listing_id,event_type,counterpart_name,created_at,read_at').order('created_at', { ascending: false }).limit(100)
    if (queryError) setError(errorMessage(queryError))
    else { setRows((data ?? []) as TradeNotification[]); setError('') }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15_000)
    const subscriptions = [supabase?.auth.onAuthStateChange(() => window.setTimeout(() => void refresh(), 0)).data.subscription, tradeAuth?.auth.onAuthStateChange(() => window.setTimeout(() => void refresh(), 0)).data.subscription]
    const onNotificationsUpdated = () => { window.setTimeout(() => void refresh(), 0) }
    window.addEventListener('tvs:notifications-updated', onNotificationsUpdated)
    return () => { window.clearInterval(timer); window.removeEventListener('tvs:notifications-updated', onNotificationsUpdated); subscriptions.forEach(subscription => subscription?.unsubscribe()) }
  }, [refresh])

  async function markRead(notification: TradeNotification) {
    if (!client || notification.read_at) return
    const now = new Date().toISOString()
    const { error: updateError } = await client.from('trade_notifications').update({ read_at: now }).eq('id', notification.id).is('read_at', null)
    if (updateError) { setError(errorMessage(updateError)); return }
    setRows(current => current.map(row => row.id === notification.id ? { ...row, read_at: now } : row))
    window.dispatchEvent(new Event('tvs:notifications-updated'))
  }

  async function markAllRead() {
    if (!client || !userId || markingAll) return
    setMarkingAll(true)
    const now = new Date().toISOString()
    const { error: updateError } = await client.from('trade_notifications').update({ read_at: now }).eq('recipient_id', userId).is('read_at', null)
    if (updateError) setError(errorMessage(updateError))
    else setRows(current => current.map(row => row.read_at ? row : { ...row, read_at: now }))
    if (!updateError) window.dispatchEvent(new Event('tvs:notifications-updated'))
    setMarkingAll(false)
  }

  const unreadCount = rows.filter(row => !row.read_at).length
  return <section className="trade-notification-center">
    <header className="trade-notification-heading"><div><span className="eyebrow section-eyebrow">YOUR ACCOUNT</span><h1>Notifications</h1><p>Updates when another player responds to an offer.</p></div>{unreadCount > 0 && <button type="button" className="trade-notification-mark-all" onClick={() => void markAllRead()} disabled={markingAll}>{markingAll ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Mark all read</button>}</header>
    <div className="trade-notification-list" aria-live="polite">
      {error && <p className="inline-error" role="alert">{error}</p>}
      {loading ? <div className="trade-notification-empty"><LoaderCircle className="spin" size={20} /> Loading notifications…</div> : !userId ? <div className="trade-notification-empty"><ShieldCheck size={24} /><b>Connect an account to see your updates</b><span>Notifications appear here when you accept an offer or someone accepts yours.</span></div> : rows.length ? rows.map(notification => {
        const sent = notification.event_type === 'acceptance_sent'
        const message = sent ? `You accepted ${notification.counterpart_name}’s offer.` : `${notification.counterpart_name} accepted your offer.`
        return <article className={`trade-notification-row${notification.read_at ? '' : ' unread'}`} key={notification.id}>
          <span className="trade-notification-icon"><CircleCheck size={19} /></span><div className="trade-notification-copy"><b>{message}</b><time>{new Date(notification.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time></div>{!notification.read_at && <span className="trade-notification-unread-dot" aria-label="Unread" />}
          <button type="button" className="trade-notification-open" onClick={() => { void markRead(notification); onOpenTradeBoard() }}>View offers</button>
        </article>
      }) : <div className="trade-notification-empty"><Bell size={23} /><b>You’re all caught up</b><span>When an offer gets accepted, you’ll see it here.</span></div>}
    </div>
  </section>
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { SupabaseClient, UserIdentity } from '@supabase/supabase-js'
import { ArrowLeftRight, ArrowRight, BadgeCheck, Check, ChevronDown, Clock3, ExternalLink, Gem, Handshake, LoaderCircle, MessageCircle, MessagesSquare, Plus, RefreshCw, Search, Send, ShieldCheck, Trash2, UserRound, X } from 'lucide-react'
import type { Item } from './lib/supabase'
import { errorMessage, itemImage, supabase, tradeAuth } from './lib/supabase'
import { tradeChatContentError } from './lib/trade-chat-safety'
import { resolveActiveTradeClient } from './lib/trade-session'

type TradeLine = { id: string; quantity: number }
type TradeCurrency = { coins: number; gems: number }
type TradeSide = 'offer' | 'want'
type TradeListingItem = { side: TradeSide; quantity: number; item: Item }
type TradeChatThread = {
  id: string
  listing_id: string | null
  owner_id: string
  starter_id: string
  owner_roblox_user_id: string
  owner_roblox_username: string
  owner_roblox_display_name: string
  owner_avatar_url: string | null
  starter_roblox_user_id: string
  starter_roblox_username: string
  starter_roblox_display_name: string
  starter_avatar_url: string | null
  created_at: string
  last_message_at: string
}
type TradeChatMessage = { id: string; thread_id: string; sender_id: string; body: string; created_at: string }
type TradeListing = {
  id: string
  user_id: string
  identity_provider: 'discord' | 'custom:roblox'
  identity_provider_id: string
  trader_name: string
  trader_avatar_url: string | null
  trader_profile_url: string | null
  trader_handle: string | null
  trader_is_admin: boolean
  trader_admin_role: string | null
  trader_admin_display_name: string | null
  trader_admin_title: string | null
  trader_admin_title_color: string | null
  offer_coins: number
  offer_gems: number
  want_coins: number
  want_gems: number
  message: string
  status: 'open' | 'closed'
  created_at: string
  trade_listing_items: TradeListingItem[]
}
function identityLabel(provider: string) { return provider === 'custom:roblox' ? 'Roblox' : provider === 'discord' ? 'Discord' : provider }
function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime())
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function TradeHub({ items, view, onNavigateToChat }: { items: Item[]; view: 'trades' | 'chat'; onNavigateToChat: () => void }) {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [identities, setIdentities] = useState<UserIdentity[]>([])
  const [adminMode, setAdminMode] = useState(false)
  const [listings, setListings] = useState<TradeListing[]>([])
  const [acceptedListingIds, setAcceptedListingIds] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [showComposer, setShowComposer] = useState(false)
  const [counterListing, setCounterListing] = useState<TradeListing | null>(null)
  const [activeChatThreadId, setActiveChatThreadId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [acceptingListingId, setAcceptingListingId] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const refreshIdentities = useCallback(async () => {
    if (!tradeAuth || !supabase) return
    const context = await resolveActiveTradeClient()
    const isAdmin = context?.admin === true
    setAdminMode(isAdmin)
    const client = context?.client ?? tradeAuth
    const userId = context?.userId ?? null
    setSessionUserId(userId)
    if (!userId) { setIdentities([]); return }
    const { data } = await client.auth.getUserIdentities()
    const currentIdentities = data?.identities ?? []
    setIdentities(currentIdentities)
    if (currentIdentities.some(identity => identity.provider === 'custom:roblox')) await client.rpc('sync_my_roblox_trade_profile')
  }, [])

  const loadListings = useCallback(async () => {
    if (!tradeAuth) { setListings([]); setLoading(false); return }
    const { data, error } = await tradeAuth
      .from('trade_listings')
      .select('id,user_id,identity_provider,identity_provider_id,trader_name,trader_avatar_url,trader_profile_url,trader_handle,trader_is_admin,trader_admin_role,trader_admin_display_name,trader_admin_title,trader_admin_title_color,offer_coins,offer_gems,want_coins,want_gems,message,status,created_at,trade_listing_items(side,quantity,item:items(id,name,image_path,category))')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(60)
    if (error) { setLoadError(errorMessage(error)); setListings([]) }
    else {
      const rows = (data ?? []) as unknown as Array<Omit<TradeListing, 'trade_listing_items'> & { trade_listing_items: Array<{ side: TradeSide; quantity: number; item: Item | Item[] | null }> }>
      setListings(rows.map(row => ({ ...row, trade_listing_items: row.trade_listing_items.flatMap(line => {
        const item = Array.isArray(line.item) ? line.item[0] : line.item
        return item ? [{ side: line.side, quantity: line.quantity, item }] : []
      }) })))
      setLoadError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refreshIdentities()
    void loadListings()
    if (!tradeAuth || !supabase) return
    const { data: tradeEvents } = tradeAuth.auth.onAuthStateChange(() => window.setTimeout(() => { void refreshIdentities(); void loadListings() }, 0))
    const { data: adminEvents } = supabase.auth.onAuthStateChange(() => window.setTimeout(() => { void refreshIdentities(); void loadListings() }, 0))
    const timer = window.setInterval(() => void loadListings(), 30_000)
    return () => { tradeEvents.subscription.unsubscribe(); adminEvents.subscription.unsubscribe(); window.clearInterval(timer) }
  }, [loadListings, refreshIdentities])

  useEffect(() => {
    if (!sessionUserId || !listings.length) { setAcceptedListingIds(new Set()); return }
    const client = adminMode ? supabase : tradeAuth
    const ids = listings.filter(listing => listing.user_id !== sessionUserId).map(listing => listing.id)
    if (!client || !ids.length) { setAcceptedListingIds(new Set()); return }
    let active = true
    void client.from('trade_offer_acceptances').select('listing_id').eq('accepter_id', sessionUserId).in('listing_id', ids).then(({ data }) => {
      if (active) setAcceptedListingIds(new Set((data ?? []).map(row => row.listing_id)))
    })
    return () => { active = false }
  }, [adminMode, listings, sessionUserId])

  const filteredListings = useMemo(() => listings.filter(listing => {
    const categoryMatch = filter === 'all' || listing.trade_listing_items.some(line => line.item.category === filter)
    const currencyTerms = [listing.offer_coins, listing.want_coins].some(value => value > 0) ? 'coins' : ''
    const gemTerms = [listing.offer_gems, listing.want_gems].some(value => value > 0) ? 'gems' : ''
    const searchMatch = !search.trim() || [listing.trader_name, listing.message, currencyTerms, gemTerms, ...listing.trade_listing_items.map(line => line.item.name)].join(' ').toLowerCase().includes(search.trim().toLowerCase())
    return categoryMatch && searchMatch
  }), [filter, listings, search])
  const categories = useMemo(() => [...new Set(items.map(item => item.category).filter((category): category is string => Boolean(category)))].sort(), [items])

  async function publishListing(offer: TradeLine[], want: TradeLine[], message: string, offerCurrency: TradeCurrency, wantCurrency: TradeCurrency) {
    const client = adminMode ? supabase : tradeAuth
    if (!client || saving) return
    setSaving(true); setNotice('')
    const { error } = await client.rpc('create_trade_listing', {
      p_offer_items: offer.map(line => ({ item_id: line.id, quantity: line.quantity })),
      p_want_items: want.map(line => ({ item_id: line.id, quantity: line.quantity })),
      p_message: message.trim(),
      p_offer_coins: offerCurrency.coins,
      p_offer_gems: offerCurrency.gems,
      p_want_coins: wantCurrency.coins,
      p_want_gems: wantCurrency.gems,
    })
    if (error) setNotice(errorMessage(error))
    else { setShowComposer(false); setNotice('Your trade listing is live.'); await loadListings() }
    setSaving(false)
  }

  async function closeListing(listing: TradeListing) {
    const client = adminMode ? supabase : tradeAuth
    if (!client || !window.confirm(`Close your trade listing with ${listing.trader_name}?`)) return
    const { error } = await client.rpc('close_trade_listing', { p_listing_id: listing.id })
    if (error) setNotice(errorMessage(error))
    else { setListings(current => current.filter(entry => entry.id !== listing.id)); setNotice('Trade listing closed.') }
  }

  async function acceptListing(listing: TradeListing) {
    if (!sessionUserId || !hasTradeIdentity) { setNotice('Connect your Roblox or Discord account to accept an offer.'); return }
    if (acceptedListingIds.has(listing.id) || acceptingListingId) return
    const client = adminMode ? supabase : tradeAuth
    if (!client) return
    setAcceptingListingId(listing.id); setNotice('')
    const { error } = await client.rpc('accept_trade_offer', { p_listing_id: listing.id })
    if (error) setNotice(errorMessage(error))
    else {
      setAcceptedListingIds(current => new Set(current).add(listing.id))
      setNotice('Offer accepted. Both players have a notification. Use Chat to arrange the Turbo Soccer trade.')
      window.dispatchEvent(new Event('tvs:notifications-updated'))
    }
    setAcceptingListingId(null)
  }

  async function openListingChat(listing: TradeListing) {
    if (listing.identity_provider !== 'custom:roblox') return
    const client = adminMode ? supabase : tradeAuth
    if (!identities.some(identity => identity.provider === 'custom:roblox')) {
      onNavigateToChat()
      setNotice('Link your Roblox account to start a player chat.')
      return
    }
    if (!client) return
    const { data, error } = await client.rpc('start_trade_chat', { p_listing_id: listing.id })
    if (error) { setNotice(errorMessage(error)); return }
    setActiveChatThreadId(data as string)
    onNavigateToChat()
  }

  const hasTradeIdentity = identities.some(identity => ['discord', 'custom:roblox'].includes(identity.provider))
  const hasRobloxIdentity = identities.some(identity => identity.provider === 'custom:roblox')
  const chatClient = adminMode ? supabase ?? tradeAuth : tradeAuth ?? supabase
  return <div className="trade-hub">
    {notice && <div className="trade-hub-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}

    <header className="trade-page-heading"><div><span className="eyebrow section-eyebrow">{view === 'chat' ? 'ROBLOX COMMUNITY' : 'PLAYER MARKET'}</span><h1>{view === 'chat' ? 'Player chat' : 'Trade board'}</h1><p>{view === 'chat' ? 'Catch up with the players you have traded with.' : 'Find a great swap, show off your items, and make a deal!'}</p></div><div className="trade-market-bubble" aria-hidden="true">{view === 'chat' ? <MessagesSquare size={30} /> : <ArrowLeftRight size={30} />}</div></header>

    {view === 'chat' ? <TradeChatPanel client={chatClient} userId={sessionUserId} hasRoblox={hasRobloxIdentity} initialThreadId={activeChatThreadId} /> : <>

    <div className="trade-hub-toolbar"><label className="trade-hub-search"><Search size={19} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search players or items…" aria-label="Search trade listings" /></label><label className="trade-hub-filter"><span>Category</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All items</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label><button type="button" className="trade-refresh-button" onClick={() => { setLoading(true); void loadListings() }} aria-label="Refresh trade listings"><RefreshCw size={18} /></button></div>

    <div className="trade-listings-heading"><div><span className="eyebrow section-eyebrow">COMMUNITY MARKET</span><h2>Open trade offers</h2></div><span className="trade-open-count"><i />{filteredListings.length} active</span></div>
    {loadError && <div className="inline-error" role="alert">Could not load the trade board: {loadError}</div>}
    {loading ? <div className="trade-listings-loading"><LoaderCircle className="spin" size={20} /> Loading offers…</div> : filteredListings.length ? <div className="trade-listings">{filteredListings.map(listing => <TradeListingCard key={listing.id} listing={listing} own={listing.user_id === sessionUserId} accepted={acceptedListingIds.has(listing.id)} accepting={acceptingListingId === listing.id} onAccept={() => void acceptListing(listing)} onClose={() => void closeListing(listing)} onOpenChat={() => void openListingChat(listing)} onMakeOffer={() => { if (!hasTradeIdentity) { setNotice('Connect your Roblox or Discord account to make an offer.'); return }; setCounterListing(listing); setShowComposer(true) }} />)}</div> : <div className="trade-listings-empty"><div className="trade-empty-icon"><ArrowLeftRight size={22} /></div><b>{listings.length ? 'No listings match those filters' : 'No open offers yet'}</b><p>Connect your Roblox or Discord account and post the first trade.</p></div>}

    <section className="trade-publish-callout"><div><span className="trade-callout-icon"><Plus size={19} /></span><div><b>Looking for a specific item?</b><p>Publish what you offer and what you want. Your verified profile appears on the listing.</p></div></div><button type="button" className="trade-publish-button" disabled={!hasTradeIdentity} onClick={() => setShowComposer(true)}><Plus size={16} /> Create a listing</button>{!hasTradeIdentity && <small>Connect Roblox or Discord to publish.</small>}</section>

    </>}

    {showComposer && <TradeComposer key={counterListing?.id ?? 'new'} items={items} saving={saving} counterListing={counterListing} onClose={() => { setShowComposer(false); setCounterListing(null) }} onPublish={(offer, want, message, offerCurrency, wantCurrency) => void publishListing(offer, want, message, offerCurrency, wantCurrency)} />}
  </div>
}

function TradeChatPanel({ client, userId, hasRoblox, initialThreadId }: { client: SupabaseClient | null; userId: string | null; hasRoblox: boolean; initialThreadId: string | null }) {
  const [threads, setThreads] = useState<TradeChatThread[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(initialThreadId)
  const [messages, setMessages] = useState<TradeChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (initialThreadId) setSelectedId(initialThreadId) }, [initialThreadId])

  const loadThreads = useCallback(async () => {
    if (!client || !userId || !hasRoblox) { setThreads([]); setLoadingThreads(false); return }
    const pageSize = 500
    const allThreads: TradeChatThread[] = []
    for (let from = 0; ; from += pageSize) {
      const { data, error: queryError } = await client.from('trade_chat_threads').select('*').order('last_message_at', { ascending: false }).range(from, from + pageSize - 1)
      if (queryError) { setError(errorMessage(queryError)); setLoadingThreads(false); return }
      allThreads.push(...((data ?? []) as TradeChatThread[]))
      if (!data || data.length < pageSize) break
    }
    setThreads(allThreads)
    setLoadingThreads(false)
  }, [client, hasRoblox, userId])

  const loadMessages = useCallback(async (threadId: string) => {
    if (!client || !hasRoblox) return
    setLoadingMessages(true)
    const { data, error: queryError } = await client.from('trade_chat_messages').select('id,thread_id,sender_id,body,created_at').eq('thread_id', threadId).order('created_at', { ascending: false }).limit(200)
    if (queryError) setError(errorMessage(queryError))
    else setMessages(((data ?? []) as TradeChatMessage[]).reverse())
    setLoadingMessages(false)
  }, [client, hasRoblox])

  useEffect(() => {
    void loadThreads()
    const timer = window.setInterval(() => void loadThreads(), 10_000)
    return () => window.clearInterval(timer)
  }, [loadThreads])

  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    void loadMessages(selectedId)
    const timer = window.setInterval(() => void loadMessages(selectedId), 4_000)
    return () => window.clearInterval(timer)
  }, [loadMessages, selectedId])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages])

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || !selectedId || !userId || !draft.trim() || sending) return
    const contentError = tradeChatContentError(draft)
    if (contentError) { setError(contentError); return }
    setSending(true); setError('')
    const { error: sendError } = await client.rpc('send_trade_chat_message', { p_thread_id: selectedId, p_body: draft })
    if (sendError) setError(errorMessage(sendError))
    else { setDraft(''); await Promise.all([loadMessages(selectedId), loadThreads()]) }
    setSending(false)
  }

  const selected = threads.find(thread => thread.id === selectedId)
  const other = (thread: TradeChatThread) => thread.owner_id === userId
    ? { name: thread.starter_roblox_display_name, handle: thread.starter_roblox_username, avatar: thread.starter_avatar_url }
    : { name: thread.owner_roblox_display_name, handle: thread.owner_roblox_username, avatar: thread.owner_avatar_url }
  const selectedOther = selected ? other(selected) : null

  if (!hasRoblox) return <section className="trade-chat-gate"><div className="trade-chat-gate-icon"><MessagesSquare size={30} /></div><span className="eyebrow section-eyebrow">ROBLOX PLAYERS</span><h2>Chat with traders</h2><p>Player chat is only for accounts linked to Roblox. Connect Roblox from your account menu to start a conversation.</p></section>
  if (!userId) return <section className="trade-chat-gate"><div className="trade-chat-gate-icon"><MessagesSquare size={30} /></div><span className="eyebrow section-eyebrow">ROBLOX PLAYERS</span><h2>Sign in to chat</h2><p>Sign in with your linked Roblox account to message other Turbo Soccer traders.</p></section>

  return <section className="trade-chat-panel" aria-label="Roblox player chat">
    <aside className="trade-chat-inbox"><header><div><span className="eyebrow section-eyebrow">YOUR MESSAGES</span><h2>Player chat</h2></div><span className="trade-chat-inbox-count">{threads.length}</span></header>
      {loadingThreads && !threads.length ? <div className="trade-chat-inbox-empty">Loading chats…</div> : threads.length ? <div className="trade-chat-thread-list">{threads.map(thread => { const player = other(thread); return <button type="button" key={thread.id} className={`trade-chat-thread${selectedId === thread.id ? ' active' : ''}`} onClick={() => { setSelectedId(thread.id); setError('') }}><span className="trade-chat-avatar">{player.avatar ? <img src={player.avatar} alt="" /> : <UserRound size={20} />}</span><span className="trade-chat-thread-copy"><b>{player.name}</b><small>@{player.handle}</small><time>{relativeTime(thread.last_message_at)}</time></span></button> })}</div> : <div className="trade-chat-inbox-empty"><MessagesSquare size={27} /><b>No chats yet</b><span>Open a Roblox player’s trade and tap Chat to start one.</span></div>}
    </aside>
    <div className="trade-chat-conversation">{selected && selectedOther ? <>
      <header className="trade-chat-header"><span className="trade-chat-avatar large">{selectedOther.avatar ? <img src={selectedOther.avatar} alt="" /> : <UserRound size={23} />}</span><div><b>{selectedOther.name}</b><small>@{selectedOther.handle} · Roblox verified</small></div><a href={`https://www.roblox.com/users/${encodeURIComponent(selected.owner_id === userId ? selected.starter_roblox_user_id : selected.owner_roblox_user_id)}/profile`} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Roblox profile</a></header>
      <div className="trade-chat-context"><MessageCircle size={15} /> Keep your trade safe: no insults, personal details, off-site links or Robux deals.</div>
      <div className="trade-chat-messages" ref={scrollRef} aria-live="polite">{loadingMessages && !messages.length ? <div className="trade-chat-message-empty">Loading messages…</div> : messages.length ? messages.map(message => <div key={message.id} className={`trade-chat-message${message.sender_id === userId ? ' mine' : ''}`}><p>{message.body}</p><time>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>) : <div className="trade-chat-message-empty"><MessageCircle size={28} /><b>Say hi to start the chat</b><span>Talk about the offer here, then complete item trades in Turbo Soccer.</span></div>}</div>
      <form className="trade-chat-compose" onSubmit={event => void sendMessage(event)}><textarea value={draft} onChange={event => { setDraft(event.target.value.slice(0, 1000)); setError('') }} maxLength={1000} rows={1} placeholder={`Message ${selectedOther.name}…`} aria-label="Message" /><span>{draft.length}/1000</span><button type="submit" disabled={!draft.trim() || sending} aria-label="Send message">{sending ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}</button></form>
    </> : <div className="trade-chat-welcome"><div className="trade-chat-gate-icon"><MessagesSquare size={30} /></div><h2>Trade chat</h2><p>Pick a conversation, or open a Roblox player’s offer and press <b>Chat</b> to talk about a trade.</p><span><ShieldCheck size={16} /> Messages are private to the two linked Roblox accounts.</span></div>}</div>
    {error && <div className="trade-chat-error" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss error"><X size={14} /></button></div>}
  </section>
}

function TradeListingCard({ listing, own, accepted, accepting, onAccept, onClose, onOpenChat, onMakeOffer }: { listing: TradeListing; own: boolean; accepted: boolean; accepting: boolean; onAccept: () => void; onClose: () => void; onOpenChat: () => void; onMakeOffer: () => void }) {
  const [profileOpen, setProfileOpen] = useState(false)
  const offer = listing.trade_listing_items.filter(line => line.side === 'offer')
  const want = listing.trade_listing_items.filter(line => line.side === 'want')
  return <article className={`trade-listing-card${listing.trader_is_admin ? ' from-admin' : ''}${profileOpen ? ' profile-open' : ''}`}>
    <button type="button" className="trade-listing-player" onClick={() => setProfileOpen(value => !value)} aria-expanded={profileOpen} aria-label={`${profileOpen ? 'Hide' : 'Show'} ${listing.trader_name}'s profile`}><div className="trade-player-avatar">{listing.trader_avatar_url || listing.identity_provider === "custom:roblox" ? <img src={listing.trader_avatar_url || `https://www.roblox.com/headshot-thumbnail/image?userId=${encodeURIComponent(listing.identity_provider_id)}&width=150&height=150&format=png`} alt="" loading="lazy" /> : <UserRound size={23} />}</div><div className="trade-player-info"><b>{listing.trader_name}</b>{listing.trader_handle && <small className="trade-player-handle">@{listing.trader_handle}</small>}<span className="trade-player-platform"><i className={listing.identity_provider === 'discord' ? 'discord' : 'roblox'} />Verified {identityLabel(listing.identity_provider)}</span>{listing.trader_is_admin && <span className="trade-admin-badge"><BadgeCheck size={13} />{listing.trader_admin_role === 'OWNER' ? 'Verified Owner' : 'Verified Admin'}{listing.trader_admin_title ? ` · ${listing.trader_admin_title}` : ''}</span>}<small><Clock3 size={12} />{relativeTime(listing.created_at)}</small></div><span className={`trade-profile-chevron${profileOpen ? ' open' : ''}`} aria-hidden="true"><ChevronDown size={21} /></span></button>
    {profileOpen && <div className="trade-player-profile-detail">{listing.trader_avatar_url && <img src={listing.trader_avatar_url} alt={`${listing.trader_name}'s Roblox avatar`} /> }<div><b>{listing.trader_admin_display_name || listing.trader_name}</b><small>{listing.identity_provider === 'custom:roblox' ? `Roblox ID · ${listing.identity_provider_id}` : `Discord ID · ${listing.identity_provider_id}`}</small>{listing.trader_is_admin && <span className="trade-admin-badge"><BadgeCheck size={13} />{listing.trader_admin_role === 'OWNER' ? 'Turbo Soccer Owner' : 'Turbo Soccer Admin'}</span>}</div>{listing.trader_profile_url && <a href={listing.trader_profile_url} target="_blank" rel="noreferrer" aria-label={`${identityLabel(listing.identity_provider)} profile`}><ExternalLink size={15} /></a>}</div>}
    <TradeListingItems title="OFFERING" tone="offer" lines={offer} currencies={{ coins: listing.offer_coins, gems: listing.offer_gems }} />
    <span className="trade-listing-swap"><ArrowLeftRight size={19} /></span>
    <TradeListingItems title="LOOKING FOR" tone="want" lines={want} currencies={{ coins: listing.want_coins, gems: listing.want_gems }} />
    <div className="trade-listing-actions">{own ? <button type="button" className="trade-close-button" onClick={onClose}><Trash2 size={16} /> Close offer</button> : <>{listing.identity_provider === 'custom:roblox' && <button type="button" className="trade-action-button chat" onClick={onOpenChat}><MessageCircle size={18} /> Chat</button>}<button type="button" className="trade-action-button accept-offer" onClick={onAccept} disabled={accepted || accepting}>{accepted ? <Check size={17} /> : accepting ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{accepted ? 'Accepted' : accepting ? 'Accepting…' : 'Accept offer'}</button><button type="button" className="trade-action-button make-offer" onClick={onMakeOffer}><Handshake size={18} /> Make an offer</button></>}</div>
    {listing.message && <p className="trade-listing-message">“{listing.message}”</p>}
  </article>
}

function TradeListingItems({ title, tone, lines, currencies }: { title: string; tone: 'offer' | 'want'; lines: TradeListingItem[]; currencies: TradeCurrency }) {
  return <div className={`trade-listing-items ${tone}`}><div className="trade-listing-items-heading"><b>{title}</b></div><div className="trade-listing-item-row">{lines.map(line => <div className="trade-listing-item" key={line.item.id} title={`${line.item.name}${line.quantity > 1 ? ` × ${line.quantity}` : ''}`}><div className="trade-listing-item-image">{itemImage(line.item.image_path) ? <img src={itemImage(line.item.image_path)!} alt="" loading="lazy" /> : <UserRound size={18} />}{line.quantity > 1 && <span>×{line.quantity}</span>}</div><small>{line.item.name}</small></div>)}{currencies.gems > 0 && <TradeCurrencyListing type="gems" quantity={currencies.gems} />}{currencies.coins > 0 && <TradeCurrencyListing type="coins" quantity={currencies.coins} />}</div></div>
}

function TradeCurrencyListing({ type, quantity }: { type: keyof TradeCurrency; quantity: number }) {
  return <div className="trade-listing-currency"><div className={`trade-listing-currency-icon ${type}`}>{type === 'coins' ? <img src="/brand/coin.png" alt="" /> : <Gem size={22} />}</div><span><b>{new Intl.NumberFormat('en-US').format(quantity)}</b><small>{type === 'coins' ? 'Coins' : 'Gems'}</small></span></div>
}

function TradeComposer({ items, saving, counterListing, onClose, onPublish }: { items: Item[]; saving: boolean; counterListing: TradeListing | null; onClose: () => void; onPublish: (offer: TradeLine[], want: TradeLine[], message: string, offerCurrency: TradeCurrency, wantCurrency: TradeCurrency) => void }) {
  const [offer, setOffer] = useState<TradeLine[]>(() => counterListing?.trade_listing_items.filter(line => line.side === 'want').map(({ item, quantity }) => ({ id: item.id, quantity })) ?? [])
  const [want, setWant] = useState<TradeLine[]>(() => counterListing?.trade_listing_items.filter(line => line.side === 'offer').map(({ item, quantity }) => ({ id: item.id, quantity })) ?? [])
  const [offerCurrency, setOfferCurrency] = useState<TradeCurrency>(() => ({ coins: counterListing?.want_coins ?? 0, gems: counterListing?.want_gems ?? 0 }))
  const [wantCurrency, setWantCurrency] = useState<TradeCurrency>(() => ({ coins: counterListing?.offer_coins ?? 0, gems: counterListing?.offer_gems ?? 0 }))
  const [message, setMessage] = useState(() => counterListing ? `Offer for ${counterListing.trader_name}` : '')
  const [error, setError] = useState('')
  const [step, setStep] = useState<1 | 2 | 3>(1)
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose, saving])
  function continueStep() {
    setError('')
    if (step === 1 && !want.length && !wantCurrency.coins && !wantCurrency.gems) { setError('Choose an item, Coins or Gems that you want.'); return }
    if (step === 2 && !offer.length && !offerCurrency.coins && !offerCurrency.gems) { setError('Choose an item, Coins or Gems that you offer.'); return }
    setStep(current => current === 1 ? 2 : 3)
  }
  function publish() {
    setError('')
    if ((!offer.length && !offerCurrency.coins && !offerCurrency.gems) || (!want.length && !wantCurrency.coins && !wantCurrency.gems)) { setError('Complete both sides of the trade first.'); setStep(offer.length || offerCurrency.coins || offerCurrency.gems ? 1 : 2); return }
    onPublish(offer, want, message, offerCurrency, wantCurrency)
  }
  const setSide = step === 1 ? setWant : setOffer
  const setSideCurrency = step === 1 ? setWantCurrency : setOfferCurrency
  const pickerStep = step === 1 ? 1 : 2
  const lines = step === 1 ? want : offer
  const currency = step === 1 ? wantCurrency : offerCurrency
  const title = step === 1 ? 'Choose what you want' : step === 2 ? 'Choose what you offer' : 'Review your offer'
  const description = step === 1 ? counterListing ? `Start a counter listing for ${counterListing.trader_name}. Their offered items are selected for you.` : 'Select the items and quantities you would like in return.' : step === 2 ? 'Now choose the items and quantities you are offering.' : 'Check both sides, adjust quantities, then publish when ready.'
  return <div className="trade-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}><section className="trade-composer" role="dialog" aria-modal="true" aria-labelledby="trade-composer-title">
    <header className="trade-composer-header"><div><span className="eyebrow section-eyebrow">NEW TRADE · STEP {step} OF 3</span><h2 id="trade-composer-title">{title}</h2><p>{description}</p></div><button type="button" className="trade-composer-close" onClick={onClose} disabled={saving} aria-label="Close"><X size={19} /></button></header>
    <nav className="trade-wizard-steps" aria-label="Trade creation steps">{[{ number: 1, label: 'I want' }, { number: 2, label: 'I offer' }, { number: 3, label: 'Review' }].map(entry => <button type="button" key={entry.number} className={`trade-wizard-step${step === entry.number ? ' active' : ''}${step > entry.number ? ' complete' : ''}`} onClick={() => { if (entry.number < step) { setError(''); setStep(entry.number as 1 | 2 | 3) } }} disabled={entry.number > step}><span>{step > entry.number ? <Check size={13} /> : entry.number}</span>{entry.label}</button>)}</nav>
    {step < 3 ? <TradeItemPicker step={pickerStep} items={items} lines={lines} onChange={setSide} currency={currency} onCurrencyChange={setSideCurrency} /> : <div className="trade-review-layout"><TradeReviewSide title="YOU OFFER" tone="offer" lines={offer} items={items} currency={offerCurrency} onChange={setOffer} onCurrencyChange={setOfferCurrency} /><div className="trade-review-swap"><ArrowLeftRight size={20} /></div><TradeReviewSide title="YOU WANT" tone="want" lines={want} items={items} currency={wantCurrency} onChange={setWant} onCurrencyChange={setWantCurrency} /><label className="trade-message-field"><span>Note <small>optional</small></span><textarea value={message} maxLength={300} onChange={event => setMessage(event.target.value)} placeholder="Add a short note for other players…" /><small>{message.length}/300</small></label></div>}
    {error && <p className="trade-composer-error" role="alert">{error}</p>}
    <footer className="trade-composer-footer"><span><ShieldCheck size={14} /> Your name comes from the connected Roblox/Discord account.</span><div className="trade-wizard-actions">{step > 1 && <button type="button" className="trade-wizard-back" onClick={() => { setError(''); setStep(current => current === 3 ? 2 : 1) }} disabled={saving}>Back</button>}{step < 3 ? <button type="button" className="trade-publish-button" onClick={continueStep}>Continue <ArrowRight size={15} /></button> : <button type="button" className="trade-publish-button" onClick={publish} disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{saving ? 'Publishing…' : 'Publish offer'}</button>}</div></footer>
  </section></div>
}

function TradeItemPicker({ step, items, lines, onChange, currency, onCurrencyChange }: { step: 1 | 2; items: Item[]; lines: TradeLine[]; onChange: (lines: TradeLine[]) => void; currency: TradeCurrency; onCurrencyChange: (value: TradeCurrency) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const categories = useMemo(() => [...new Set(items.map(item => item.category).filter((value): value is string => Boolean(value)))].sort(), [items])
  const matches = useMemo(() => items.filter(item => {
    const matchesQuery = !query.trim() || `${item.name} ${item.category ?? ''} ${item.rarity ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
    return matchesQuery && (category === 'all' || item.category === category)
  }), [category, items, query])
  const selected = lines.map(line => ({ line, item: items.find(item => item.id === line.id) })).filter((value): value is { line: TradeLine; item: Item } => Boolean(value.item))
  function add(item: Item) {
    if (lines.some(line => line.id === item.id)) return
    if (lines.length >= 10) return
    onChange([...lines, { id: item.id, quantity: 1 }])
  }
  function update(id: string, quantity: number) { onChange(quantity < 1 ? lines.filter(line => line.id !== id) : lines.map(line => line.id === id ? { ...line, quantity: Math.min(99, quantity) } : line)) }
  const unitCount = lines.reduce((total, line) => total + line.quantity, 0)
  return <section className={`trade-item-picker ${step === 1 ? 'want' : 'offer'}`}>
    <div className="trade-picker-toolbar"><label className="trade-editor-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search items…" aria-label="Search trade items" /></label><label className="trade-picker-category"><span>Category</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All items</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label><div className="trade-picker-count"><b>{selected.length}/10</b><span>item slots · {unitCount} items</span></div></div>
    <div className="trade-item-grid" aria-label={step === 1 ? 'Choose items to want' : 'Choose items to offer'}><TradeCurrencyCard type="gems" amount={currency.gems} onChange={gems => onCurrencyChange({ ...currency, gems })} /><TradeCurrencyCard type="coins" amount={currency.coins} onChange={coins => onCurrencyChange({ ...currency, coins })} />{matches.map(item => {
      const line = lines.find(entry => entry.id === item.id)
      const image = itemImage(item.image_path)
      return <article className={`trade-choice-card${line ? ' selected' : ''}`} key={item.id}><button type="button" className="trade-choice-select" onClick={() => line ? update(item.id, line.quantity + 1) : add(item)} disabled={!line && lines.length >= 10} aria-label={line ? `Add one more ${item.name}` : `Add ${item.name}`}><span className="trade-choice-art">{image ? <img src={image} alt="" loading="lazy" /> : <UserRound size={28} />}{line && <span className="trade-choice-check"><Check size={13} /></span>}</span><b title={item.name}>{item.name}</b></button>{line && <div className="trade-choice-quantity"><button type="button" onClick={() => update(item.id, line.quantity - 1)} aria-label={`Remove one ${item.name}`}>−</button><span>{line.quantity}</span><button type="button" onClick={() => update(item.id, line.quantity + 1)} aria-label={`Add one ${item.name}`} disabled={line.quantity >= 99}>+</button></div>}</article>
    })}{!matches.length && <div className="trade-picker-no-results">No items match your search.</div>}</div>
    {lines.length >= 10 && <p className="trade-picker-limit">Your 10 item slots are full. Coins and Gems have separate slots.</p>}
  </section>
}

function TradeCurrencyCard({ type, amount, onChange }: { type: keyof TradeCurrency; amount: number; onChange: (value: number) => void }) {
  const label = type === 'coins' ? 'Coins' : 'Gems'
  const update = (value: string) => onChange(Math.min(50_000, Math.max(0, Math.floor(Number(value) || 0))))
  return <article className={`trade-choice-card trade-currency-choice ${amount > 0 ? 'selected' : ''}`}><div className="trade-choice-select"><span className={`trade-choice-art trade-currency-art ${type}`}>{type === 'coins' ? <img src="/brand/coin.png" alt="" /> : <Gem size={52} />}{amount > 0 && <span className="trade-choice-check"><Check size={13} /></span>}</span><b>{label}</b></div><label className="trade-currency-input"><input type="number" inputMode="numeric" min="0" max="50000" step="1" value={amount || ''} onChange={event => update(event.target.value)} placeholder="0" aria-label={`${label} amount, maximum 50,000`} /><span>/ 50,000</span></label></article>
}

function TradeReviewSide({ title, tone, lines, items, currency, onChange, onCurrencyChange }: { title: string; tone: TradeSide; lines: TradeLine[]; items: Item[]; currency: TradeCurrency; onChange: (lines: TradeLine[]) => void; onCurrencyChange: (value: TradeCurrency) => void }) {
  const selected = lines.map(line => ({ line, item: items.find(item => item.id === line.id) })).filter((entry): entry is { line: TradeLine; item: Item } => Boolean(entry.item))
  function update(id: string, quantity: number) { onChange(quantity < 1 ? lines.filter(line => line.id !== id) : lines.map(line => line.id === id ? { ...line, quantity: Math.min(99, quantity) } : line)) }
  return <section className={`trade-review-side ${tone}`}><header><b>{title}</b><span>{selected.length}/10 slots</span></header><div className="trade-review-items">{selected.map(({ line, item }) => <article className="trade-review-item" key={line.id}><div className="trade-review-art">{itemImage(item.image_path) ? <img src={itemImage(item.image_path)!} alt="" /> : <UserRound size={22} />}</div><div className="trade-review-copy"><b>{item.name}</b><small>×{line.quantity}</small></div><div className="trade-editor-quantity"><button type="button" onClick={() => update(line.id, line.quantity - 1)} aria-label={`Remove one ${item.name}`}>−</button><span>{line.quantity}</span><button type="button" onClick={() => update(line.id, line.quantity + 1)} aria-label={`Add one ${item.name}`} disabled={line.quantity >= 99}>+</button></div><button type="button" className="trade-editor-remove" onClick={() => update(line.id, 0)} aria-label={`Remove ${item.name}`}><X size={14} /></button></article>)}{currency.gems > 0 && <TradeReviewCurrency type="gems" amount={currency.gems} onChange={gems => onCurrencyChange({ ...currency, gems })} />}{currency.coins > 0 && <TradeReviewCurrency type="coins" amount={currency.coins} onChange={coins => onCurrencyChange({ ...currency, coins })} />}</div></section>
}

function TradeReviewCurrency({ type, amount, onChange }: { type: keyof TradeCurrency; amount: number; onChange: (value: number) => void }) {
  const label = type === 'coins' ? 'Coins' : 'Gems'
  return <article className="trade-review-item trade-review-currency"><div className={`trade-review-art ${type}`}>{type === 'coins' ? <img src="/brand/coin.png" alt="" /> : <Gem size={24} />}</div><div className="trade-review-copy"><b>{label}</b><small>{new Intl.NumberFormat('en-US').format(amount)}</small></div><label className="trade-review-currency-edit"><input type="number" min="0" max="50000" value={amount} onChange={event => onChange(Math.min(50_000, Math.max(0, Math.floor(Number(event.target.value) || 0))))} aria-label={`Edit ${label}, maximum 50,000`} /></label></article>
}

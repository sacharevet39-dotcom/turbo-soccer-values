import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Provider, UserIdentity } from '@supabase/supabase-js'
import { ArrowLeftRight, Check, Clock3, ExternalLink, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserRound, X } from 'lucide-react'
import type { Item } from './lib/supabase'
import { errorMessage, itemImage, tradeAuth } from './lib/supabase'

type TradeLine = { id: string; quantity: number }
type TradeSide = 'offer' | 'want'
type TradeListingItem = { side: TradeSide; quantity: number; item: Item }
type TradeListing = {
  id: string
  user_id: string
  identity_provider: 'discord' | 'custom:roblox'
  identity_provider_id: string
  trader_name: string
  trader_avatar_url: string | null
  trader_profile_url: string | null
  message: string
  status: 'open' | 'closed'
  created_at: string
  trade_listing_items: TradeListingItem[]
}

const AUTH_PROVIDERS = [
  { id: 'custom:roblox' as Provider, label: 'Roblox', icon: 'R', description: 'Show your verified Roblox profile to other traders.' },
  { id: 'discord' as Provider, label: 'Discord', icon: 'D', description: 'Use your verified Discord account to contact traders.' },
] as const

function identityProvider(identity: UserIdentity) { return identity.provider }
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

export function TradeHub({ items }: { items: Item[] }) {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [identities, setIdentities] = useState<UserIdentity[]>([])
  const [identityBusy, setIdentityBusy] = useState(false)
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const [listings, setListings] = useState<TradeListing[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [showComposer, setShowComposer] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const refreshIdentities = useCallback(async () => {
    if (!tradeAuth) return
    const { data: sessionData } = await tradeAuth.auth.getSession()
    const userId = sessionData.session?.user.id ?? null
    setSessionUserId(userId)
    if (!userId) { setIdentities([]); setIdentityBusy(false); return }
    setIdentityBusy(true)
    const { data, error } = await tradeAuth.auth.getUserIdentities()
    setIdentities(error ? [] : data.identities)
    setIdentityBusy(false)
  }, [])

  const loadListings = useCallback(async () => {
    if (!tradeAuth) { setListings([]); setLoading(false); return }
    const { data, error } = await tradeAuth
      .from('trade_listings')
      .select('id,user_id,identity_provider,identity_provider_id,trader_name,trader_avatar_url,trader_profile_url,message,status,created_at,trade_listing_items(side,quantity,item:items(*))')
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
    if (!tradeAuth) return
    const { data } = tradeAuth.auth.onAuthStateChange(() => window.setTimeout(() => { void refreshIdentities(); void loadListings() }, 0))
    const timer = window.setInterval(() => void loadListings(), 30_000)
    return () => { data.subscription.unsubscribe(); window.clearInterval(timer) }
  }, [loadListings, refreshIdentities])

  const connectedProviders = useMemo(() => new Set(identities.map(identityProvider)), [identities])
  const filteredListings = useMemo(() => listings.filter(listing => {
    const categoryMatch = filter === 'all' || listing.trade_listing_items.some(line => line.item.category === filter)
    const searchMatch = !search.trim() || [listing.trader_name, listing.message, ...listing.trade_listing_items.map(line => line.item.name)].join(' ').toLowerCase().includes(search.trim().toLowerCase())
    return categoryMatch && searchMatch
  }), [filter, listings, search])
  const categories = useMemo(() => [...new Set(items.map(item => item.category).filter((category): category is string => Boolean(category)))].sort(), [items])

  async function connectProvider(provider: Provider) {
    if (!tradeAuth || activeProvider) return
    setActiveProvider(provider)
    setNotice('')
    try {
      const options = {
        redirectTo: `${window.location.origin}/?tab=trades`,
        scopes: provider === 'discord' ? 'identify' : 'openid profile',
      }
      const linked = connectedProviders.has(provider)
      const result = sessionUserId
        ? linked ? { error: null } : await tradeAuth.auth.linkIdentity({ provider, options })
        : await tradeAuth.auth.signInWithOAuth({ provider, options })
      if (result.error) {
        const detail = errorMessage(result.error)
        if (/unsupported provider|provider.{0,20}(disabled|not enabled)/i.test(detail)) setNotice(`${identityLabel(provider)} sign-in is not configured yet. The site owner must enable this provider in Supabase Auth.`)
        else if (/manual.{0,20}link|link.{0,25}identity.{0,20}disabled/i.test(detail)) setNotice('Supabase manual identity linking is disabled. Ask the site owner to enable it before linking a second account.')
        else setNotice(detail)
      }
      else if (sessionUserId && !linked) setNotice(`Continue to ${identityLabel(provider)} to confirm the connection.`)
    } catch (error) { setNotice(errorMessage(error)) }
    finally { setActiveProvider(null) }
  }

  async function publishListing(offer: TradeLine[], want: TradeLine[], message: string) {
    if (!tradeAuth || saving) return
    setSaving(true); setNotice('')
    const { error } = await tradeAuth.rpc('create_trade_listing', {
      p_offer_items: offer.map(line => ({ item_id: line.id, quantity: line.quantity })),
      p_want_items: want.map(line => ({ item_id: line.id, quantity: line.quantity })),
      p_message: message.trim(),
    })
    if (error) setNotice(errorMessage(error))
    else { setShowComposer(false); setNotice('Your trade listing is live.'); await loadListings() }
    setSaving(false)
  }

  async function closeListing(listing: TradeListing) {
    if (!tradeAuth || !window.confirm(`Close your trade listing with ${listing.trader_name}?`)) return
    const { error } = await tradeAuth.rpc('close_trade_listing', { p_listing_id: listing.id })
    if (error) setNotice(errorMessage(error))
    else { setListings(current => current.filter(entry => entry.id !== listing.id)); setNotice('Trade listing closed.') }
  }

  const hasTradeIdentity = identities.some(identity => ['discord', 'custom:roblox'].includes(identity.provider))
  return <div className="trade-hub">
    <section className="trade-account-panel">
      <div className="trade-account-copy"><span className="trade-account-mark"><ShieldCheck size={19} /></span><div><b>{hasTradeIdentity ? 'Trader account connected' : 'Connect your trader account'}</b><p>{hasTradeIdentity ? 'Your verified account name will be attached to each listing.' : 'Link Roblox or Discord so other players know who they are trading with.'}</p></div></div>
      <div className="trade-account-actions">{AUTH_PROVIDERS.map(provider => {
        const connected = connectedProviders.has(provider.id)
        return <button type="button" key={provider.id} className={`trade-account-button ${provider.id === 'discord' ? 'discord' : 'roblox'}${connected ? ' connected' : ''}`} disabled={identityBusy || Boolean(activeProvider)} onClick={() => void connectProvider(provider.id)}>
          <span className="trade-provider-icon">{activeProvider === provider.id ? <LoaderCircle className="spin" size={16} /> : connected ? <Check size={16} /> : provider.icon}</span><span>{connected ? `${provider.label} connected` : sessionUserId ? `Link ${provider.label}` : `Continue with ${provider.label}`}</span>
        </button>
      })}</div>
    </section>

    {notice && <div className="trade-hub-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}

    <div className="trade-hub-toolbar"><label className="trade-hub-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search player or item…" aria-label="Search trade listings" /></label><label className="trade-hub-filter"><span>Category</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All items</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label><button type="button" className="trade-refresh-button" onClick={() => { setLoading(true); void loadListings() }} aria-label="Refresh trade listings"><RefreshCw size={15} /></button></div>

    <div className="trade-listings-heading"><div><span className="eyebrow section-eyebrow">COMMUNITY MARKET</span><h3>Open trade offers</h3></div><span className="trade-open-count"><i />{filteredListings.length} active</span></div>
    {loadError && <div className="inline-error" role="alert">Could not load the trade board: {loadError}</div>}
    {loading ? <div className="trade-listings-loading"><LoaderCircle className="spin" size={20} /> Loading offers…</div> : filteredListings.length ? <div className="trade-listings">{filteredListings.map(listing => <TradeListingCard key={listing.id} listing={listing} own={listing.user_id === sessionUserId} onClose={() => void closeListing(listing)} />)}</div> : <div className="trade-listings-empty"><div className="trade-empty-icon"><ArrowLeftRight size={22} /></div><b>{listings.length ? 'No listings match those filters' : 'No open offers yet'}</b><p>Connect your Roblox or Discord account and post the first trade.</p></div>}

    <section className="trade-publish-callout"><div><span className="trade-callout-icon"><Plus size={19} /></span><div><b>Looking for a specific item?</b><p>Publish what you offer and what you want. Your verified profile appears on the listing.</p></div></div><button type="button" className="trade-publish-button" disabled={!hasTradeIdentity} onClick={() => setShowComposer(true)}><Plus size={16} /> Create a listing</button>{!hasTradeIdentity && <small>Connect Roblox or Discord to publish.</small>}</section>

    {showComposer && <TradeComposer items={items} saving={saving} onClose={() => setShowComposer(false)} onPublish={(offer, want, message) => void publishListing(offer, want, message)} />}
  </div>
}

function TradeListingCard({ listing, own, onClose }: { listing: TradeListing; own: boolean; onClose: () => void }) {
  const offer = listing.trade_listing_items.filter(line => line.side === 'offer')
  const want = listing.trade_listing_items.filter(line => line.side === 'want')
  const value = (lines: TradeListingItem[]) => lines.reduce((total, line) => total + (line.item.value ?? 0) * line.quantity, 0)
  const contactLabel = listing.identity_provider === 'custom:roblox' ? 'View Roblox profile' : 'View Discord profile'
  return <article className="trade-listing-card">
    <div className="trade-listing-player"><div className="trade-player-avatar">{listing.trader_avatar_url ? <img src={listing.trader_avatar_url} alt="" loading="lazy" /> : <UserRound size={23} />}</div><div className="trade-player-info"><b>{listing.trader_name}</b><span className="trade-player-platform"><i className={listing.identity_provider === 'discord' ? 'discord' : 'roblox'} />Verified {identityLabel(listing.identity_provider)}</span><small><Clock3 size={12} />{relativeTime(listing.created_at)}</small></div></div>
    <TradeListingItems title="OFFERING" tone="offer" lines={offer} total={value(offer)} />
    <span className="trade-listing-swap"><ArrowLeftRight size={19} /></span>
    <TradeListingItems title="LOOKING FOR" tone="want" lines={want} total={value(want)} />
    <div className="trade-listing-actions">{listing.trader_profile_url && <a href={listing.trader_profile_url} target="_blank" rel="noreferrer" className="trade-contact-button"><ExternalLink size={15} />{contactLabel}</a>}{own && <button type="button" className="trade-close-button" onClick={onClose}><Trash2 size={14} /> Close offer</button>}</div>
    {listing.message && <p className="trade-listing-message">“{listing.message}”</p>}
  </article>
}

function TradeListingItems({ title, tone, lines, total }: { title: string; tone: 'offer' | 'want'; lines: TradeListingItem[]; total: number }) {
  return <div className={`trade-listing-items ${tone}`}><div className="trade-listing-items-heading"><b>{title}</b><span>{total ? `${new Intl.NumberFormat('en-US').format(total)} coins` : 'Value not set'}</span></div><div className="trade-listing-item-row">{lines.slice(0, 4).map(line => <div className="trade-listing-item" key={line.item.id} title={`${line.item.name}${line.quantity > 1 ? ` × ${line.quantity}` : ''}`}><div className="trade-listing-item-image">{itemImage(line.item.image_path) ? <img src={itemImage(line.item.image_path)!} alt="" loading="lazy" /> : <UserRound size={18} />}{line.quantity > 1 && <span>×{line.quantity}</span>}</div><small>{line.item.name}</small></div>)}{lines.length > 4 && <span className="trade-more-items">+{lines.length - 4}</span>}</div></div>
}

function TradeComposer({ items, saving, onClose, onPublish }: { items: Item[]; saving: boolean; onClose: () => void; onPublish: (offer: TradeLine[], want: TradeLine[], message: string) => void }) {
  const [offer, setOffer] = useState<TradeLine[]>([])
  const [want, setWant] = useState<TradeLine[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose, saving])
  function publish() {
    setError('')
    if (!offer.length || !want.length) { setError('Add at least one item to both sides of the trade.'); return }
    onPublish(offer, want, message)
  }
  return <div className="trade-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}><section className="trade-composer" role="dialog" aria-modal="true" aria-labelledby="trade-composer-title">
    <header className="trade-composer-header"><div><span className="eyebrow section-eyebrow">NEW OFFER</span><h2 id="trade-composer-title">Create a trade listing</h2><p>Choose what you offer and what you are looking for.</p></div><button type="button" className="trade-composer-close" onClick={onClose} disabled={saving} aria-label="Close"><X size={19} /></button></header>
    <div className="trade-composer-columns"><TradeSideEditor title="I OFFER" tone="offer" items={items} lines={offer} onChange={setOffer} /><div className="trade-composer-arrow"><ArrowLeftRight size={18} /></div><TradeSideEditor title="I WANT" tone="want" items={items} lines={want} onChange={setWant} /></div>
    <label className="trade-message-field"><span>Note <small>optional</small></span><textarea value={message} maxLength={300} onChange={event => setMessage(event.target.value)} placeholder="Add a short note for other players…" /><small>{message.length}/300</small></label>
    {error && <p className="trade-composer-error" role="alert">{error}</p>}
    <footer className="trade-composer-footer"><span><ShieldCheck size={14} /> Your name comes from the connected Roblox/Discord account.</span><button type="button" className="trade-publish-button" onClick={publish} disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{saving ? 'Publishing…' : 'Publish offer'}</button></footer>
  </section></div>
}

function TradeSideEditor({ title, tone, items, lines, onChange }: { title: string; tone: TradeSide; items: Item[]; lines: TradeLine[]; onChange: (lines: TradeLine[]) => void }) {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => query.trim() ? items.filter(item => `${item.name} ${item.category ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : [], [items, query])
  const selected = lines.map(line => ({ line, item: items.find(item => item.id === line.id) })).filter((value): value is { line: TradeLine; item: Item } => Boolean(value.item))
  function add(item: Item) {
    onChange(lines.some(line => line.id === item.id) ? lines.map(line => line.id === item.id ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line) : lines.length < 9 ? [...lines, { id: item.id, quantity: 1 }] : lines)
    setQuery('')
  }
  function update(id: string, quantity: number) { onChange(quantity < 1 ? lines.filter(line => line.id !== id) : lines.map(line => line.id === id ? { ...line, quantity: Math.min(99, quantity) } : line)) }
  return <section className={`trade-editor-side ${tone}`}><div className="trade-editor-heading"><b>{title}</b><span>{selected.length}/9 items</span></div><label className="trade-editor-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search items to add…" aria-label={`Search items for ${title}`} /></label>{query && <div className="trade-editor-results">{matches.length ? matches.map(item => <button type="button" key={item.id} onClick={() => add(item)} disabled={lines.length >= 9 && !lines.some(line => line.id === item.id)}><span>{itemImage(item.image_path) && <img src={itemImage(item.image_path)!} alt="" />}</span><b>{item.name}</b><small>{item.category || 'Uncategorized'}</small></button>) : <p>No matching items.</p>}</div>}<div className="trade-editor-selected">{selected.map(({ line, item }) => <article className="trade-editor-item" key={line.id}><div className="trade-editor-item-art">{itemImage(item.image_path) && <img src={itemImage(item.image_path)!} alt="" />}</div><div className="trade-editor-item-copy"><b>{item.name}</b><small>{item.category || 'Uncategorized'}</small></div><div className="trade-editor-quantity"><button type="button" onClick={() => update(line.id, line.quantity - 1)} aria-label={`Remove one ${item.name}`}>−</button><span>{line.quantity}</span><button type="button" onClick={() => update(line.id, line.quantity + 1)} aria-label={`Add one ${item.name}`}>+</button></div><button type="button" className="trade-editor-remove" onClick={() => update(line.id, 0)} aria-label={`Remove ${item.name}`}><X size={14} /></button></article>)}{!selected.length && <div className="trade-editor-empty"><Plus size={17} /><span>Search and add items here</span></div>}</div></section>
}

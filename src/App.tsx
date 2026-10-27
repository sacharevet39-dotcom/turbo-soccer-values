import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowDownWideNarrow, ArrowLeftRight, ArrowUpWideNarrow, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, ExternalLink, Eye, Globe2, ImagePlus, LockKeyhole, LogOut, Minus, PackagePlus, Plus,
  Menu, Search, ShieldCheck, SlidersHorizontal, Star, TicketPercent, Trash2, Upload, UserRound, UsersRound, X,
} from 'lucide-react'
import { configured, errorMessage, itemImage, supabase, type Item, type PromoCode } from './lib/supabase'
import { sourceImages } from './catalogImages'
import { AdminManagement, AdminSelfSettings } from './admin/AdminManagement'
import { ADMIN_PASSWORD_MIN_LENGTH, ADMIN_PASSWORD_POLICY_MESSAGE, isStrongAdminPassword } from '../shared/password-policy.js'

const PAGE_SIZE = 24
const CATEGORY_OPTIONS = ['Car', 'Pattern', 'Color', 'Wheels', 'Boost', 'Trail', 'Goal Explosion', 'Demolition Explosion', 'Ball', 'Hat', 'Banner', 'Border', 'Title', 'Horn', 'Plate', 'Finish']
const RARITY_OPTIONS = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Exclusive', 'Halloween', 'Beta']
function rarityTone(rarity: string) {
  const key = rarity.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '')
  const tones: Record<string, string> = { common: 'common', commun: 'common', uncommon: 'uncommon', peucommun: 'uncommon', rare: 'rare', epic: 'epic', epique: 'epic', legendary: 'legendary', legendaire: 'legendary', exclusive: 'exclusive', exclusif: 'exclusive', halloween: 'halloween', beta: 'beta' }
  return `rarity-${tones[key] ?? 'other'}`
}
type View = 'values' | 'trade' | 'codes'
type TradeLine = { id: string; quantity: number }
type FormState = { name: string; value: string; category: string; rarity: string; description: string; image_path: string; demand: string; variant_parent_id: string; variant_color_name: string; variant_color_hex: string }
type ColorDraft = { name: string; hex: string }
type PromoForm = { code: string; reward: string; is_expired: boolean }
type AdminProfile = { role: 'OWNER' | 'ADMIN'; username: string | null; display_name: string; title: string; title_color: string; status: string; must_change_password: boolean; last_seen: string | null }
type AdminSection = 'publish' | 'profile' | 'accounts' | 'codes'
const blankForm: FormState = { name: '', value: '', category: '', rarity: '', description: '', image_path: '', demand: '', variant_parent_id: '', variant_color_name: '', variant_color_hex: '' }
const blankPromoForm: PromoForm = { code: '', reward: '', is_expired: false }

function App() {
  useEffect(() => {
    if (!configured || !supabase) return
    let sessionId = ''
    try {
      sessionId = localStorage.getItem('tvs-presence-id') ?? ''
      if (!/^[0-9a-f-]{36}$/i.test(sessionId)) { sessionId = crypto.randomUUID(); localStorage.setItem('tvs-presence-id', sessionId) }
    } catch { sessionId = crypto.randomUUID() }
    const ping = async () => {
      const { data } = await supabase!.auth.getSession()
      await fetch('/api/admin/presence', { method: 'POST', headers: { 'content-type': 'application/json', ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) }, body: JSON.stringify({ sessionId }) }).catch(() => undefined)
    }
    void ping()
    const interval = window.setInterval(() => void ping(), 30000)
    const { data } = supabase.auth.onAuthStateChange(() => { window.setTimeout(() => void ping(), 0) })
    return () => { window.clearInterval(interval); data.subscription.unsubscribe() }
  }, [])
  const isAdminRoute = window.location.pathname.startsWith('/admin')
  if (isAdminRoute) return <Admin />
  const itemRoute = window.location.pathname.match(/^\/item\/([^/]+)\/?$/)
  if (itemRoute) return <ItemDetailsPage itemId={decodeURIComponent(itemRoute[1])} />
  return <PublicApp />
}

function SiteNav({ activeView, onViewChange }: { activeView: View | 'admin'; onViewChange?: (view: View) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])
  const closeMenu = () => setMenuOpen(false)
  return <header className="topbar site-topbar">
    <a className="brand" href="/" aria-label="Turbo Soccer Values home" onClick={closeMenu}><BrandMark /><span className="brand-tagline">ITEM VALUES</span></a>
    <button type="button" className={`mobile-menu-toggle ${menuOpen ? 'active' : ''}`} aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}<span>{menuOpen ? 'Close' : 'Menu'}</span></button>
    <nav id="site-navigation" className={`main-nav ${menuOpen ? 'open' : ''}`} aria-label="Main navigation">
      {onViewChange ? <button type="button" className={activeView === 'values' ? 'nav-link active' : 'nav-link'} aria-pressed={activeView === 'values'} onClick={() => { onViewChange('values'); closeMenu() }}>Value list</button> : <a className={activeView === 'values' ? 'nav-link active' : 'nav-link'} aria-current={activeView === 'values' ? 'page' : undefined} href="/" onClick={closeMenu}>Value list</a>}
      {onViewChange ? <button type="button" className={activeView === 'trade' ? 'nav-link active' : 'nav-link'} aria-pressed={activeView === 'trade'} onClick={() => { onViewChange('trade'); closeMenu() }}>Trade calculator</button> : <a className={activeView === 'trade' ? 'nav-link active' : 'nav-link'} aria-current={activeView === 'trade' ? 'page' : undefined} href="/?tab=trade" onClick={closeMenu}>Trade calculator</a>}
      {onViewChange ? <button type="button" className={activeView === 'codes' ? 'nav-link active' : 'nav-link'} aria-pressed={activeView === 'codes'} onClick={() => { onViewChange('codes'); closeMenu() }}>Codes</button> : <a className="nav-link" href="/?tab=codes" onClick={closeMenu}>Codes</a>}
    </nav>
    <div className="top-actions"><OnlineCount /><VisitCount /><a className={`admin-link ${activeView === 'admin' ? 'active' : ''}`} href="/admin" aria-current={activeView === 'admin' ? 'page' : undefined} onClick={closeMenu}><LockKeyhole size={15} /> Admin</a></div>
  </header>
}

function PublicApp() {
  const [view, setView] = useState<View>(() => {
    const tab = new URLSearchParams(location.search).get('tab')
    return tab === 'trade' || tab === 'codes' ? tab : 'values'
  })
  const [items, setItems] = useState<Item[]>([])
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<'high' | 'low'>('high')
  const [page, setPage] = useState(1)
  const [theirSide, setTheirSide] = useState<TradeLine[]>([])
  const [ourSide, setOurSide] = useState<TradeLine[]>([])
  const [autoAdded, setAutoAdded] = useState(false)
  const itemToAdd = new URLSearchParams(location.search).get('item')

  const loadItems = useCallback(async () => {
    if (!supabase) { setItems([]); setLoading(false); return }
    const { data, error } = await supabase.from('items').select('*').order('name').range(0, 999)
    if (error) setLoadError(errorMessage(error))
    else { setItems((data ?? []) as Item[]); setLoadError('') }
    const promoResult = await supabase.from('promo_codes').select('*').order('is_expired', { ascending: true }).order('sort_order').order('code')
    if (!promoResult.error) setPromoCodes((promoResult.data ?? []) as PromoCode[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadItems()
    const timer = window.setInterval(() => void loadItems(), 30_000)
    const focus = () => void loadItems()
    window.addEventListener('focus', focus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [loadItems])

  useEffect(() => {
    if (view !== 'trade' || !itemToAdd || !items.length || autoAdded) return
    setAutoAdded(true)
    if (items.some(item => item.id === itemToAdd)) {
      setOurSide(current => current.some(line => line.id === itemToAdd) ? current : [...current, { id: itemToAdd, quantity: 1 }])
    }
  }, [view, itemToAdd, items, autoAdded])

  const categories = useMemo(() => [...new Set([...CATEGORY_OPTIONS, ...items.map(i => i.category).filter((x): x is string => Boolean(x))])], [items])
  const quickCategories = useMemo(() => categories.filter(value => items.some(item => item.category === value)).slice(0, 5), [categories, items])
  const filtered = useMemo(() => items
    .filter(i => i.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter(i => category === 'all' || i.category === category)
    .sort((a, b) => {
      const av = a.value ?? -1, bv = b.value ?? -1
      return sort === 'high' ? bv - av || a.name.localeCompare(b.name) : av - bv || a.name.localeCompare(b.name)
    }), [items, search, category, sort])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  useEffect(() => setPage(1), [search, category, sort])

  return <div className="app-shell">
    <SiteNav activeView={view} onViewChange={setView} />
    <main>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" /> ITEM VALUES</div>
          <h1>Turbo Soccer<br /><span>market</span></h1>
          <p>Check values before you trade.</p>
          <div className="hero-meta"><a href="https://www.roblox.com/games/101880234193261/Turbo-Soccer-Beta-1-0" target="_blank" rel="noreferrer">Play Turbo Soccer <ExternalLink size={13} /></a></div>
        </div>
        <div className="hero-feature-art" aria-hidden="true">
          <img src="/brand/turbo-soccer-feature.jpg" alt="" />
        </div>
        <div className="hero-art hero-goal-art" aria-hidden="true">
          <img src="/brand/turbo-soccer-goal.png" alt="" />
        </div>
      </section>
      <section className="content-section">
        <div className="section-heading"><div><div className="eyebrow section-eyebrow">{view === 'values' ? 'VALUE LIST' : view === 'trade' ? 'YOUR TRADE' : 'EXTRA'}</div><h2>{view === 'values' ? 'Item values' : view === 'trade' ? 'Trade calculator' : 'Promo codes'}</h2><p>{view === 'values' ? 'Search by name, filter by type, or sort by value.' : view === 'trade' ? 'Add items for each player to compare totals.' : 'Redeem these codes in Turbo Soccer while they are available.'}</p></div>
          {view === 'values' && <div className="item-count"><span className="count-dot" /> {items.length} {items.length === 1 ? 'item' : 'items'} listed</div>}
        </div>
        {view !== 'codes' && !configured && <SetupNotice />}
        {view !== 'codes' && loadError && <div className="inline-error" role="alert">Could not load the item list: {loadError} <button onClick={() => { setLoading(true); void loadItems() }}>Retry</button></div>}
        {view === 'values' ? <>
          <div className="toolbar">
            <label className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by item name" aria-label="Search by item name" />{search && <button className="icon-button" onClick={() => setSearch('')} aria-label="Clear search"><X size={15} /></button>}</label>
            <div className="toolbar-right"><label className="select-wrap"><SlidersHorizontal size={15} /><select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter category"><option value="all">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select><ChevronDown size={14} /></label><button className="sort-button" onClick={() => setSort(sort === 'high' ? 'low' : 'high')}><span>{sort === 'high' ? <ArrowDownWideNarrow size={15} /> : <ArrowUpWideNarrow size={15} />}</span> Value: {sort === 'high' ? 'Highest' : 'Lowest'}</button></div>
          </div>
          <div className="category-chips" aria-label="Quick category filters"><button className={category === 'all' ? 'category-chip active' : 'category-chip'} onClick={() => setCategory('all')}>All items</button>{quickCategories.map(c => <button key={c} className={category === c ? 'category-chip active' : 'category-chip'} onClick={() => setCategory(category === c ? 'all' : c)}>{c}</button>)}</div>
          {loading ? <div className="loading-grid">{Array.from({ length: 8 }, (_, i) => <div className="skeleton-card" key={i}><div /><span /><b /></div>)}</div> : pageItems.length ? <>
            <div className={`item-grid${pageItems.length <= 3 ? ` item-grid-sparse sparse-${pageItems.length}` : ''}`}>{pageItems.map(item => <ItemCard item={item} key={item.id} />)}</div>
            {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onPage={setPage} />}
          </> : <EmptyItems search={search} onClear={() => { setSearch(''); setCategory('all') }} />}
        </> : view === 'trade' ? <TradeCalculator items={items} left={theirSide} right={ourSide} setLeft={setTheirSide} setRight={setOurSide} /> : <PromoCodeShowcase codes={promoCodes} loading={loading} />}
      </section>
    </main>
    <AdminIdentities />
    <footer className="footer"><a className="footer-brand" href="/"><BrandMark /> TURBO SOCCER VALUES</a><span>Community values · Not affiliated with Roblox</span><span>Values are a guide. Agree on a trade with the other player.</span></footer>
  </div>
}

function BrandMark() { return <img className="brand-logo" src="/brand/logo.png" alt="Turbo Soccer" /> }

function uploadedImageObjectPath(imagePath: string | null | undefined) {
  const projectUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!projectUrl || !imagePath) return null
  try {
    const imageUrl = new URL(imagePath)
    const storageRoot = new URL('/storage/v1/object/public/item-images/', projectUrl)
    if (imageUrl.origin !== storageRoot.origin || !imageUrl.pathname.startsWith(storageRoot.pathname)) return null
    return decodeURIComponent(imageUrl.pathname.slice(storageRoot.pathname.length)) || null
  } catch { return null }
}

function OnlineCount() {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    const update = async () => {
      try {
        const response = await fetch('/api/admin/presence', { cache: 'no-store' })
        const result = await response.json() as { count?: number | null }
        if (active && typeof result.count === 'number') setCount(result.count)
      } catch { /* Presence is optional when Pages Functions are not configured. */ }
    }
    void update()
    const timer = window.setInterval(() => void update(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])
  return count === null ? null : <span className="live-pill visitor-count"><span className="live-status-dot" aria-hidden="true" /> {count} online</span>
}

function VisitCount() {
  const [total, setTotal] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const response = await fetch('/api/visitors', { cache: 'no-store' })
        if (!response.ok) return
        const result = await response.json() as { total?: unknown }
        if (active && typeof result.total === 'number') {
          setTotal(result.total)
        }
      } catch { /* Visitor totals are optional when Pages Functions are unavailable. */ }
    }
    const register = async () => {
      try {
        let visitId = sessionStorage.getItem('tvs-visit-session-id') ?? ''
        if (!/^[0-9a-f-]{36}$/i.test(visitId)) {
          visitId = crypto.randomUUID()
          sessionStorage.setItem('tvs-visit-session-id', visitId)
        }
        const response = await fetch('/api/visitors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitId }) })
        if (!response.ok) { await refresh(); return }
        const result = await response.json() as { total?: unknown }
        if (active && typeof result.total === 'number') {
          setTotal(result.total)
        }
      } catch { await refresh() }
    }
    void register()
    const timer = window.setInterval(() => void refresh(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])
  if (total === null) return null
  const formattedTotal = new Intl.NumberFormat('en-US').format(total)
  return <span className="live-pill visit-total" aria-label={`${formattedTotal} total site ${total === 1 ? 'visit' : 'visits'}`}><Eye size={14} aria-hidden="true" /><strong>{formattedTotal}</strong><span className="visit-total-label">{total === 1 ? 'visit' : 'visits'}</span></span>
}

function AdminIdentities() {
  const [profiles, setProfiles] = useState<Array<{ display_name: string; title: string; title_color: string; online: boolean }>>([])
  useEffect(() => {
    if (!supabase) return
    let active = true
    const load = async () => {
      const { data } = await supabase!.from('turbo_admin_profiles').select('display_name,title,title_color,online').order('display_name').limit(12)
      if (active && data) setProfiles(data)
    }
    void load()
    return () => { active = false }
  }, [])
  if (!profiles.length) return null
  return <section className="community-admins"><div className="community-admins-heading"><div className="eyebrow section-eyebrow">THE TEAM</div><h2>Community admins</h2></div><div className="community-admin-list">{profiles.map((profile, index) => <div className="community-admin" key={`${profile.display_name}-${index}`}><span className="community-admin-status"><i className={profile.online ? 'online' : ''} /></span><div><b>{profile.display_name}</b><small style={{ color: profile.title_color }}>{profile.title}</small></div></div>)}</div></section>
}

function PromoCodeShowcase({ codes, loading }: { codes: PromoCode[]; loading: boolean }) {
  const [copied, setCopied] = useState('')
  async function copyPromoText(entry: PromoCode, mode: 'code' | 'details') {
    const key = `${entry.id}:${mode}`
    const text = mode === 'code' ? entry.code : `${entry.code}\n${entry.reward}`
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(current => current === key ? '' : current), 1600) }
    catch { setCopied('') }
  }
  return <section className="promo-showcase" aria-label="Promo codes">
    {codes.length ? <div className="promo-code-grid">{codes.map(entry => <article className={`promo-code-card${entry.is_expired ? ' expired' : ''}`} key={entry.id}>
      <div className="promo-code-status"><span aria-hidden="true">{entry.is_expired ? '❌' : '✅'}</span>{entry.is_expired ? 'Expired' : 'Available'}</div>
      <div className="promo-code-main"><b>{entry.code}</b><div className="promo-code-actions"><button type="button" className="promo-copy" disabled={entry.is_expired} onClick={() => void copyPromoText(entry, 'code')} aria-label={`Copy code ${entry.code}`}>{copied === `${entry.id}:code` ? 'Copied' : 'Copy code'}</button><button type="button" className="promo-copy" disabled={entry.is_expired} onClick={() => void copyPromoText(entry, 'details')} aria-label={`Copy ${entry.code} and its reward text`}>{copied === `${entry.id}:details` ? 'Copied' : 'Copy text'}</button></div></div>
      <p>{entry.reward}</p>
    </article>)}</div> : <p className="promo-showcase-empty">{loading ? 'Loading promo codes…' : 'No promo codes are listed right now.'}</p>}
  </section>
}

function SetupNotice() {
  return <div className="setup-notice"><div className="notice-icon"><CircleHelp size={18} /></div><div><b>Database setup is needed</b><p>The site is ready, but the public list will appear after Supabase is connected and the first items are added in the admin panel.</p></div><a href="/admin">Open admin setup <ChevronRight size={14} /></a></div>
}

function ItemCard({ item }: { item: Item }) {
  const image = itemImage(item.image_path)
  return <a className="item-card" href={`/item/${item.id}`} aria-label={`Open ${item.name} details`}>
    <div className="item-card-heading"><h3>{item.name}</h3>{item.rarity && <span className={`rarity-chip ${rarityTone(item.rarity)}`}>{item.rarity}</span>}</div>
    <div className="card-visual">{image ? <img src={image} alt={item.name} loading="lazy" /> : <div className="image-placeholder"><BrandMark /><span>IMAGE PENDING</span></div>}{item.variant_color_hex && <span className="variant-color-band" style={{ '--variant-color': item.variant_color_hex } as React.CSSProperties} title={item.variant_color_name ?? 'Color variant'} />}{item.variant_color_name && <span className="variant-color-label">{item.variant_color_name}</span>}<span className="view-details">Details <ChevronRight size={13} /></span></div>
    <div className="card-info"><div className="item-subline"><span>{item.category || 'Uncategorized'}</span><span className="card-value-label">VALUE</span></div><CoinValue value={item.value} compact className="card-value" /><div className="card-demand"><span>DEMAND</span><DemandStars rating={item.demand} /></div></div>
  </a>
}

function DemandStars({ rating, interactive = false, onChange }: { rating: number | null; interactive?: boolean; onChange?: (value: number | null) => void }) {
  return <div className={`demand-stars${interactive ? ' interactive' : ''}${rating == null ? ' unrated' : ''}`} role={interactive ? 'radiogroup' : 'img'} aria-label={rating == null ? 'Demand not rated' : `Demand: ${rating} out of 5 stars`}>
    {Array.from({ length: 5 }, (_, index) => {
      const value = index + 1
      const active = rating != null && value <= rating
      return interactive
        ? <button key={value} type="button" role="radio" aria-checked={rating === value} data-active={active} aria-label={`${value} out of 5 stars`} onClick={() => onChange?.(value)}><Star size={21} strokeWidth={2.25} fill={active ? 'currentColor' : 'none'} /></button>
        : <Star key={value} size={15} strokeWidth={2} fill={active ? 'currentColor' : 'none'} aria-hidden="true" />
    })}
    {interactive && <span className="demand-current" aria-live="polite">{rating == null ? '—' : `${rating}/5`}</span>}
    {interactive && rating != null && <button type="button" className="clear-demand" aria-label="Clear demand rating" onClick={() => onChange?.(null)}>Clear</button>}
  </div>
}

function EmptyItems({ search, onClear }: { search: string; onClear: () => void }) {
  return <div className="empty-state"><div className="empty-illustration"><Search size={23} /><span><BrandMark /></span></div><h3>{search ? 'No matches found' : 'The list is warming up'}</h3><p>{search ? `No items match “${search}”. Try a different name.` : 'Official item names and values will show here once the database has been filled in.'}</p>{search && <button className="secondary-button" onClick={onClear}>Clear filters</button>}{!search && <a className="empty-admin-link" href="/admin">Admin access <ChevronRight size={14} /></a>}</div>
}

function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (n: number) => void }) {
  return <div className="pagination"><span>Page {page} of {pageCount}</span><div><button disabled={page <= 1} aria-label="Previous page" onClick={() => onPage(page - 1)}><ChevronLeft size={17} /></button><button disabled={page >= pageCount} aria-label="Next page" onClick={() => onPage(page + 1)}><ChevronRight size={17} /></button></div></div>
}

function ItemDetailsPage({ itemId }: { itemId: string }) {
  const [item, setItem] = useState<Item | null>(null)
  const [related, setRelated] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let alive = true
    if (!supabase) { setLoading(false); return }
    void (async () => {
      const { data, error: readError } = await supabase.from('items').select('*').eq('id', itemId).maybeSingle()
      if (!alive) return
      if (readError) setError(errorMessage(readError))
      else if (!data) setError('This item could not be found.')
      else {
        const found = data as Item
        setItem(found)
        document.title = `${found.name} · Turbo Soccer Values`
        if (found.category) {
          const result = await supabase.from('items').select('*').eq('category', found.category).neq('id', found.id).limit(4)
          if (alive) setRelated((result.data ?? []) as Item[])
        }
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [itemId])
  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); window.setTimeout(() => setCopied(false), 1800) }
    catch { setError('Could not copy the item link. Copy it from your browser address bar.') }
  }
  return <div className="app-shell"><SiteNav activeView="values" />
    <main className="detail-page"><a className="back-to-items" href="/"><ChevronLeft size={17} /> All items</a>{loading ? <div className="detail-loading"><div className="spinner" /> Loading item…</div> : error || !item ? <div className="empty-state"><h3>{configured ? 'Item unavailable' : 'Connect the database first'}</h3><p>{error || 'Item details will appear after Supabase is connected.'}</p><a className="secondary-button" href="/">Back to item list</a></div> : <>
      <div className="detail-page-grid"><div className="detail-art-wrap"><span className="detail-art-sticker">TURBO SOCCER ITEM</span>{itemImage(item.image_path) ? <img src={itemImage(item.image_path)!} alt={item.name} className="detail-art" /> : <div className="image-placeholder"><BrandMark /><span>IMAGE PENDING</span></div>}{item.variant_color_hex && <span className="variant-color-band detail-variant-band" style={{ '--variant-color': item.variant_color_hex } as React.CSSProperties} title={item.variant_color_name ?? 'Color variant'} />}</div><article className="detail-card"><div className="eyebrow section-eyebrow">ITEM PROFILE</div><h1>{item.name}</h1><div className="detail-value-label">CURRENT VALUE</div><CoinValue value={item.value} className="detail-value" /><div className="detail-tags">{item.category && <span>{item.category}</span>}{item.rarity && <span className={`rarity-chip ${rarityTone(item.rarity)}`}>{item.rarity}</span>}{item.variant_color_name && <span>{item.variant_color_name}</span>}</div><div className="detail-demand"><span>COMMUNITY DEMAND</span><DemandStars rating={item.demand} /></div>{item.description ? <p className="detail-description">{item.description}</p> : <p className="detail-description muted">No item description has been added yet.</p>}<div className="detail-meta"><span>Updated</span><b>{new Date(item.updated_at).toLocaleDateString()}</b></div><div className="detail-actions"><a className="primary-button" href={`/?tab=trade&item=${encodeURIComponent(item.id)}`}><ArrowLeftRight size={16} /> Compare in calculator</a><button className="secondary-button" onClick={() => void share()}>{copied ? <Check size={15} /> : <ExternalLink size={15} />}{copied ? 'Link copied' : 'Share item'}</button></div>{error && <p className="detail-error" role="status">{error}</p>}<p className="detail-disclaimer"><CircleHelp size={14} /> Community-entered value in coins. Trades are not guaranteed by Roblox.</p></article></div>
      {related.length > 0 && <section className="related-section"><div className="section-heading"><div><div className="eyebrow section-eyebrow">KEEP EXPLORING</div><h2>More {item.category} items</h2></div></div><div className="item-grid related-grid">{related.map(entry => <ItemCard key={entry.id} item={entry} />)}</div></section>}
    </>}</main><footer className="footer"><a className="footer-brand" href="/"><BrandMark /> TURBO SOCCER VALUES</a><span>Fan-made values · Not affiliated with Roblox</span><span>Values are estimates, not an official trade guarantee.</span></footer></div>
}

function CoinValue({ value, className = '', compact = false, prefix = '' }: { value: number | null; className?: string; compact?: boolean; prefix?: string }) {
  if (value === null) return <span className={`coin-value no-value ${className}`}>Not set</span>
  return <span className={`coin-value ${compact ? 'compact' : ''} ${className}`}><img src="/brand/coin.png" alt="" /><span>{prefix}{new Intl.NumberFormat('en-US').format(value)}{compact ? '' : value === 1 ? ' coin' : ' coins'}</span></span>
}

function TradeCalculator({ items, left, right, setLeft, setRight }: { items: Item[]; left: TradeLine[]; right: TradeLine[]; setLeft: (v: TradeLine[]) => void; setRight: (v: TradeLine[]) => void }) {
  const total = (lines: TradeLine[]) => lines.reduce((sum, line) => sum + ((items.find(i => i.id === line.id)?.value ?? 0) * line.quantity), 0)
  const leftTotal = total(left), rightTotal = total(right), diff = leftTotal - rightTotal
  function add(side: 'left' | 'right', id: string) {
    const list = side === 'left' ? left : right
    const set = side === 'left' ? setLeft : setRight
    const existing = list.find(line => line.id === id)
    if (!existing && list.length >= 9) return
    set(existing ? list.map(line => line.id === id ? { ...line, quantity: line.quantity + 1 } : line) : [...list, { id, quantity: 1 }])
  }
  function update(side: 'left' | 'right', id: string, quantity: number) {
    const list = side === 'left' ? left : right, set = side === 'left' ? setLeft : setRight
    set(quantity < 1 ? list.filter(line => line.id !== id) : list.map(line => line.id === id ? { ...line, quantity: Math.min(99, quantity) } : line))
  }
  return <div className="trade-wrap">
    <div className="trade-hint"><ArrowLeftRight size={16} /><span>Compare what you give against what you receive. Items without a value count as 0 until one is set.</span></div>
    <div className="trade-columns"><TradeSide title="THEIR OFFER" tint="blue" items={items} lines={left} onAdd={id => add('left', id)} onUpdate={(id, q) => update('left', id, q)} /><div className="trade-mid"><span>VS</span></div><TradeSide title="YOUR OFFER" tint="lime" items={items} lines={right} onAdd={id => add('right', id)} onUpdate={(id, q) => update('right', id, q)} /></div>
    <div className="trade-result"><div><span className="result-label">VALUE DIFFERENCE</span><CoinValue value={diff} className={diff === 0 ? 'even' : diff > 0 ? 'gain' : 'loss'} prefix={diff > 0 ? '+' : ''} /><small>{diff === 0 ? 'Even trade' : diff > 0 ? 'Their offer is higher' : 'Your offer is higher'}</small></div><div className="result-summary"><span>Their total <CoinValue value={leftTotal} compact /></span><span>Your total <CoinValue value={rightTotal} compact /></span></div><button className="secondary-button" onClick={() => { setLeft([]); setRight([]) }}>Clear trade</button></div>
    <p className="trade-disclaimer"><CircleHelp size={14} /> Calculator uses community-entered values and does not guarantee a fair or official Roblox trade.</p>
  </div>
}

function TradeSide({ title, tint, items, lines, onAdd, onUpdate }: { title: string; tint: 'blue' | 'lime'; items: Item[]; lines: TradeLine[]; onAdd: (id: string) => void; onUpdate: (id: string, quantity: number) => void }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const categories = useMemo(() => [...new Set(items.map(item => item.category).filter((value): value is string => Boolean(value)))].sort(), [items])
  const matches = useMemo(() => items.filter(item => (category === 'all' || item.category === category) && item.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 12), [items, category, search])
  const selectedItems = lines.map(line => ({ line, item: items.find(entry => entry.id === line.id) })).filter((entry): entry is { line: TradeLine; item: Item } => Boolean(entry.item))
  const total = selectedItems.reduce((sum, { line, item }) => sum + (item.value ?? 0) * line.quantity, 0)
  return <section className={`trade-side ${tint}`}>
    <div className="side-header"><span>{title}</span><CoinValue value={total} compact /></div>
    <div className="trade-picker"><div className="trade-picker-controls"><label className="trade-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search items…" aria-label={`Search items for ${title.toLowerCase()}`} /></label><select value={category} onChange={event => setCategory(event.target.value)} aria-label="Filter by category"><option value="all">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select></div>
      {search || category !== 'all' ? <div className="trade-search-results" role="listbox" aria-label="Matching items">{matches.length ? matches.map(item => <button type="button" key={item.id} role="option" aria-selected="false" disabled={!lines.some(line => line.id === item.id) && lines.length >= 9} onClick={() => { onAdd(item.id); setSearch('') }}><span className="trade-result-thumb">{itemImage(item.image_path) && <img src={itemImage(item.image_path)!} alt="" />}{item.variant_color_hex && <i style={{ background: item.variant_color_hex }} />}</span><span className="trade-result-description"><b>{item.name}</b><small>{item.category || 'Uncategorized'}</small></span><CoinValue value={item.value} compact /></button>) : <p>No matching items.</p>}</div> : <p className="trade-picker-hint">Search and select an item to add it to the board.</p>}
    </div>
    <div className="trade-board" aria-label={`${title}: up to nine items`}>
      {Array.from({ length: 9 }, (_, index) => {
        const entry = selectedItems[index]
        if (!entry) return <div className="trade-slot-empty" key={`empty-${index}`}><Plus size={16} /><span>Empty slot</span></div>
        const { item, line } = entry
        return <article className="trade-item-tile" key={line.id}>
          <div className="trade-tile-art">{itemImage(item.image_path) ? <img src={itemImage(item.image_path)!} alt={item.name} /> : <ImagePlus size={23} />}{item.variant_color_hex && <i className="trade-variant-band" style={{ backgroundColor: item.variant_color_hex }} />}{item.value == null ? <span className="trade-tile-price">Not valued</span> : <span className="trade-tile-price"><CoinValue value={item.value} compact /></span>}</div>
          <b className="trade-tile-name" title={item.name}>{item.name}</b>
          <div className="trade-tile-controls"><button type="button" onClick={() => onUpdate(line.id, line.quantity - 1)} aria-label={`Remove one ${item.name}`}><Minus size={12} /></button><span>{line.quantity}</span><button type="button" onClick={() => onUpdate(line.id, line.quantity + 1)} aria-label={`Add one ${item.name}`}><Plus size={12} /></button></div>
        </article>
      })}
    </div>
  </section>
}

function Admin() {
  const [session, setSession] = useState<{ email?: string } | null>(null)
  const [admin, setAdmin] = useState(false)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loginMode, setLoginMode] = useState<'owner' | 'admin'>('owner')
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [firstPassword, setFirstPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [notice, setNotice] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([])
  const [hiddenImages, setHiddenImages] = useState<string[]>([])
  const [form, setForm] = useState<FormState>(blankForm)
  const [editing, setEditing] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [imageSearch, setImageSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [adminSection, setAdminSection] = useState<AdminSection>('publish')
  const [hasColorVariants, setHasColorVariants] = useState(false)
  const [colorVariants, setColorVariants] = useState<ColorDraft[]>([{ name: '', hex: '#60A5FA' }])
  const [promoForm, setPromoForm] = useState<PromoForm>(blankPromoForm)
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null)

  useEffect(() => {
    if (profile?.role !== 'OWNER' && adminSection === 'accounts') setAdminSection('publish')
  }, [profile?.role, adminSection])

  const refresh = useCallback(async () => {
    if (!supabase) { setChecking(false); return }
    const { data: auth } = await supabase.auth.getSession()
    if (!auth.session) { setSession(null); setAdmin(false); setProfile(null); setChecking(false); return }
    setSession(auth.session.user)
    const { data, error } = await supabase.rpc('my_turbo_admin_profile')
    const current = !error && Array.isArray(data) ? data[0] as AdminProfile | undefined : undefined
    setProfile(current ?? null)
    const allowed = Boolean(current && current.status === 'active')
    setAdmin(allowed)
    if (allowed && !current?.must_change_password) {
      const result = await supabase.from('items').select('*').order('name').range(0, 999)
      if (result.error) setNotice(`Could not load items: ${errorMessage(result.error)}`)
      else setItems((result.data ?? []) as Item[])
      const promoResult = await supabase.from('promo_codes').select('*').order('is_expired', { ascending: true }).order('sort_order').order('code')
      if (!promoResult.error) setPromoCodes((promoResult.data ?? []) as PromoCode[])
      const hidden = await supabase.from('admin_hidden_catalog_images').select('image_path')
      if (!hidden.error) setHiddenImages((hidden.data ?? []).map(row => row.image_path))
    }
    setChecking(false)
  }, [])

  useEffect(() => {
    void refresh()
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange(() => { window.setTimeout(() => void refresh(), 0) })
    return () => data.subscription.unsubscribe()
  }, [refresh])

  async function signIn(e: FormEvent) {
    e.preventDefault(); setLoginError('')
    if (!supabase) return
    setBusy(true)
    if (loginMode === 'owner') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) setLoginError('Sign-in failed. Check your email and password.')
      else await refresh()
    } else {
      try {
        const response = await fetch('/api/admin/username-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
        const result = await response.json() as { access_token?: string; refresh_token?: string; error?: string }
        if (!response.ok || !result.access_token || !result.refresh_token) setLoginError(result.error ?? 'Sign-in failed. Check your username and password.')
        else {
          const { error } = await supabase.auth.setSession({ access_token: result.access_token, refresh_token: result.refresh_token })
          if (error) setLoginError('Sign-in failed. Please try again.')
          else await refresh()
        }
      } catch { setLoginError('Admin login is temporarily unavailable.') }
    }
    setBusy(false)
  }
  async function signOut() { await supabase?.auth.signOut(); setSession(null); setAdmin(false); setProfile(null); setItems([]) }
  async function finishPasswordChange(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !isStrongAdminPassword(firstPassword)) { setNotice(ADMIN_PASSWORD_POLICY_MESSAGE); return }
    setBusy(true); setNotice('')
    const { data: auth } = await supabase.auth.getSession()
    try {
      const response = await fetch('/api/admin/first-password', { method: 'POST', headers: { 'content-type': 'application/json', ...(auth.session?.access_token ? { Authorization: `Bearer ${auth.session.access_token}` } : {}) }, body: JSON.stringify({ password: firstPassword }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) setNotice(result.error ?? 'Password change failed. Try again.')
      else {
        setFirstPassword('')
        await supabase.auth.signOut()
        setSession(null); setAdmin(false); setProfile(null)
        setLoginError('Password updated. Sign in again with your new password.')
      }
    } catch { setNotice('Password change service is unavailable. Try again later.') }
    setBusy(false)
  }
  function editItem(item: Item) {
    setEditing(item.id); setHasColorVariants(false); setForm({ name: item.name, value: item.value === null ? '' : String(item.value), category: item.category ?? '', rarity: item.rarity ?? '', description: item.description ?? '', image_path: item.image_path ?? '', demand: item.demand == null ? '' : String(item.demand), variant_parent_id: item.variant_parent_id ?? '', variant_color_name: item.variant_color_name ?? '', variant_color_hex: item.variant_color_hex ?? '' }); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function saveItem(e: FormEvent) {
    e.preventDefault(); if (!supabase) return
    const name = form.name.trim()
    const val = form.value.trim() === '' ? null : Number(form.value)
    if (!name) { setNotice('Enter an item name before saving.'); return }
    if (val !== null && (!Number.isSafeInteger(val) || val < 0)) { setNotice('Value must be a non-negative whole number.'); return }
    setBusy(true); setNotice('')
    const demand = form.demand === '' ? null : Number(form.demand)
    const payload = { name, value: val, image_path: form.image_path || null, category: form.category.trim() || null, rarity: form.rarity.trim() || null, description: form.description.trim() || null, demand, variant_parent_id: form.variant_parent_id || null, variant_color_name: form.variant_color_name.trim() || null, variant_color_hex: form.variant_color_hex || null }
    let error: { code?: string; message: string } | null = null
    if (editing) {
      const result = await supabase.from('items').update(payload).eq('id', editing)
      error = result.error
    } else if (hasColorVariants) {
      const normalized = colorVariants.map(color => ({ name: color.name.trim(), hex: color.hex.toUpperCase() }))
      if (normalized.some(color => !color.name || !/^#[0-9A-F]{6}$/.test(color.hex)) || new Set(normalized.map(color => color.name.toLowerCase())).size !== normalized.length) {
        setNotice('Enter a unique name and a valid color for every variant.'); setBusy(false); return
      }
      const result = await supabase.rpc('turbo_create_item_with_variants', { p_item: { ...payload, variant_parent_id: null, variant_color_name: null, variant_color_hex: null }, p_variants: normalized })
      error = result.error
    } else {
      const result = await supabase.from('items').insert(payload)
      error = result.error
    }
    if (error) setNotice(error.code === '23505' ? 'An item or color variant with that name already exists.' : error.message.toLowerCase().includes('variant') ? error.message : error.message.toLowerCase().includes("'demand'") || error.message.toLowerCase().includes('demand column') ? 'Apply the Supabase migration 20261027032224_item_demand_stars.sql before saving demand ratings.' : errorMessage(error))
    else { setNotice(editing ? 'Item updated.' : hasColorVariants ? 'Item and color variants added.' : 'Item added.'); setForm(blankForm); setEditing(null); setHasColorVariants(false); setColorVariants([{ name: '', hex: '#60A5FA' }]); await refresh() }
    setBusy(false)
  }
  async function deleteItem(item: Item) {
    if (!supabase || !window.confirm(`Delete “${item.name}”? This cannot be undone.`)) return
    setBusy(true)
    const { error } = await supabase.from('items').delete().eq('id', item.id)
    if (error) setNotice(errorMessage(error))
    else { if (editing === item.id) { setEditing(null); setForm(blankForm) }; setNotice(`${item.name} deleted.`); await refresh() }
    setBusy(false)
  }
  async function uploadImage(file?: File) {
    if (!supabase || !file) return
    const allowed = ['image/webp', 'image/png', 'image/jpeg', 'image/gif']
    if (!allowed.includes(file.type)) { setNotice('Use a WEBP, PNG, JPEG, or GIF image.'); return }
    if (file.size > 5 * 1024 * 1024) { setNotice('Image must be 5 MB or smaller.'); return }
    setUploading(true); setNotice('')
    const ext = file.name.split('.').pop()?.toLowerCase() || 'webp'
    const path = `items/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('item-images').upload(path, file, { contentType: file.type, upsert: false })
    if (error) setNotice(errorMessage(error))
    else { const { data } = supabase.storage.from('item-images').getPublicUrl(path); setForm(f => ({ ...f, image_path: data.publicUrl })); setNotice('Image uploaded. Save the item to link it.') }
    setUploading(false)
  }
  async function deleteUploadedImage(imagePath = form.image_path) {
    if (!supabase || !imagePath) return
    const objectPath = uploadedImageObjectPath(imagePath)
    if (!objectPath) { setNotice('This bundled game image cannot be deleted from storage. You can still remove it from this item.'); return }
    const { data: references, error: referenceError } = await supabase.from('items').select('id').eq('image_path', imagePath)
    if (referenceError) { setNotice(`Could not check which items use this image: ${errorMessage(referenceError)}`); return }
    const referenceCount = references?.length ?? 0
    const affectedItems = referenceCount === 1 ? ' The linked item will remain but lose its image.' : referenceCount > 1 ? ` ${referenceCount} linked items will remain but lose their image.` : ''
    setBusy(true); setNotice('')
    if (referenceCount) {
      const { error: unlinkError } = await supabase.from('items').update({ image_path: null }).eq('image_path', imagePath)
      if (unlinkError) { setNotice(`Could not unlink this image from its items: ${errorMessage(unlinkError)}`); setBusy(false); return }
      setItems(current => current.map(item => item.image_path === imagePath ? { ...item, image_path: null } : item))
    }
    const { error } = await supabase.storage.from('item-images').remove([objectPath])
    setForm(current => current.image_path === imagePath ? { ...current, image_path: '' } : current)
    if (error) setNotice(`The image was unlinked, but its file could not be deleted: ${errorMessage(error)}`)
    else setNotice(`Uploaded image permanently deleted.${affectedItems}`)
    setBusy(false)
  }
  async function removeImageFromLibrary(imagePath: string) {
    if (!supabase) return
    setBusy(true); setNotice('')
    try {
      const { data: references, error: referenceError } = await supabase.from('items').select('id').eq('image_path', imagePath)
      if (referenceError) { setNotice(`Could not check items using this image: ${errorMessage(referenceError)}`); return }
      const { error: hideError } = await supabase.from('admin_hidden_catalog_images').insert({ image_path: imagePath })
      if (hideError) {
        setNotice(hideError.code === '42P01' || hideError.code === 'PGRST205' ? 'Image library setup is missing in Supabase. Apply migration 20261027032238_seed_game_item_catalogue.sql.' : errorMessage(hideError))
        return
      }
      if (references?.length) {
        const { error } = await supabase.from('items').update({ image_path: null }).eq('image_path', imagePath)
        if (error) {
          await supabase.from('admin_hidden_catalog_images').delete().eq('image_path', imagePath)
          setNotice(`Image was kept in the library because linked items could not be updated: ${errorMessage(error)}`)
          return
        }
        setItems(current => current.map(item => item.image_path === imagePath ? { ...item, image_path: null } : item))
      }
      setHiddenImages(current => [...current, imagePath])
      setForm(current => current.image_path === imagePath ? { ...current, image_path: '' } : current)
      setNotice(`Image removed from the library.${references?.length ? ` ${references.length} item${references.length === 1 ? '' : 's'} kept and unlinked.` : ''}`)
    } catch (error) {
      setNotice(`Could not remove this image: ${errorMessage(error)}`)
    } finally {
      setBusy(false)
    }
  }
  function exportCsv() {
    const rows = [['name','value','image_path','category','rarity','description','demand','variant_parent_id','variant_color_name','variant_color_hex','created_at','updated_at'], ...items.map(i => [i.name, i.value ?? '', i.image_path ?? '', i.category ?? '', i.rarity ?? '', i.description ?? '', i.demand ?? '', i.variant_parent_id ?? '', i.variant_color_name ?? '', i.variant_color_hex ?? '', i.created_at, i.updated_at])]
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'turbo-soccer-items.csv'; link.click(); URL.revokeObjectURL(link.href)
  }
  function editPromo(entry: PromoCode) {
    setEditingPromoId(entry.id)
    setPromoForm({ code: entry.code, reward: entry.reward, is_expired: entry.is_expired })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function savePromo(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    const code = promoForm.code.trim().toUpperCase()
    const reward = promoForm.reward.trim()
    if (!/^[A-Z0-9_-]{2,32}$/.test(code) || !reward || reward.length > 200) { setNotice('Use a 2–32 character code and a reward description of 1–200 characters.'); return }
    setBusy(true); setNotice('')
    const newCodeSortOrder = Math.min(0, ...promoCodes.map(entry => entry.sort_order)) - 1
    const payload = { code, reward, is_expired: promoForm.is_expired, sort_order: editingPromoId ? promoCodes.find(entry => entry.id === editingPromoId)?.sort_order ?? newCodeSortOrder : newCodeSortOrder, updated_at: new Date().toISOString() }
    const result = editingPromoId ? await supabase.from('promo_codes').update(payload).eq('id', editingPromoId) : await supabase.from('promo_codes').insert(payload)
    if (result.error) setNotice(result.error.code === '23505' ? 'That promo code already exists.' : errorMessage(result.error))
    else { setNotice(editingPromoId ? 'Promo code updated.' : 'Promo code added.'); setPromoForm(blankPromoForm); setEditingPromoId(null); await refresh() }
    setBusy(false)
  }
  async function deletePromo(entry: PromoCode) {
    if (!supabase || !window.confirm(`Delete promo code ${entry.code}?`)) return
    setBusy(true)
    const { error } = await supabase.from('promo_codes').delete().eq('id', entry.id)
    if (error) setNotice(errorMessage(error))
    else { if (editingPromoId === entry.id) { setEditingPromoId(null); setPromoForm(blankPromoForm) }; setNotice(`${entry.code} deleted.`); await refresh() }
    setBusy(false)
  }

  if (checking) return <AdminShell><div className="admin-loading"><div className="spinner" /> Checking secure admin access…</div></AdminShell>
  if (!configured) return <AdminShell><SetupPanel /></AdminShell>
  if (!session) return <AdminShell><div className="login-wrap"><div className="login-card"><div className="login-emblem"><LockKeyhole size={21} /></div><div className="eyebrow section-eyebrow">PRIVATE ADMIN</div><h1>Sign in to manage<br />the item list.</h1><p>Your admin access is restricted to approved accounts.</p><div className="login-mode-switch"><button className={loginMode === 'owner' ? 'active' : ''} type="button" onClick={() => { setLoginMode('owner'); setLoginError('') }}>Owner</button><button className={loginMode === 'admin' ? 'active' : ''} type="button" onClick={() => { setLoginMode('admin'); setLoginError('') }}>Admin</button></div><form onSubmit={signIn} className="admin-form">{loginMode === 'owner' ? <label>Email address<input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label> : <label>Username<input required minLength={3} maxLength={24} value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" /></label>}<label>Password<input required type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>{loginError && <div className="form-error" role="alert">{loginError}</div>}<button className="primary-button full-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ChevronRight size={16} /></button></form><a href="/" className="back-link"><ChevronLeft size={15} /> Back to public site</a></div><div className="login-foot"><ShieldCheck size={15} /> Protected by Supabase Auth and database policies</div></div></AdminShell>
  if (!admin) return <AdminShell><div className="unauthorized"><div className="login-emblem danger"><ShieldCheck size={21} /></div><div className="eyebrow section-eyebrow">ACCESS RESTRICTED</div><h1>This account isn't<br />on the admin list.</h1><p>Your sign-in worked, but this account is not authorized to manage official items.</p><div className="unauthorized-actions"><button className="primary-button" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button><a href="/" className="secondary-button">Public site</a></div></div></AdminShell>
  if (profile?.must_change_password) return <AdminShell><div className="setup-panel password-change-panel"><div className="login-emblem"><ShieldCheck size={21} /></div><div className="eyebrow section-eyebrow">FIRST SIGN IN</div><h1>Choose your<br />new password.</h1><p>You must replace the temporary password before managing items.</p><form className="admin-form" onSubmit={finishPasswordChange}><label>New password<input type="password" required minLength={ADMIN_PASSWORD_MIN_LENGTH} autoComplete="new-password" value={firstPassword} onChange={e => setFirstPassword(e.target.value)} /></label>{notice && <div className="form-error" role="status">{notice}</div>}<button className="primary-button full-button" disabled={busy}>{busy ? 'Updating…' : 'Set new password'} <Check size={16} /></button></form><button className="text-button" onClick={() => void signOut()}>Sign out</button></div></AdminShell>

  const adminItems = items.filter(item => item.name.toLowerCase().includes(filter.toLowerCase()))
  const availableImages = [...new Set([...sourceImages, ...items.map(item => item.image_path).filter((path): path is string => Boolean(path))])].filter(path => !hiddenImages.includes(path))
  const visibleImages = availableImages.filter(path => path.toLowerCase().includes(imageSearch.trim().toLowerCase()))
  const selectedImage = itemImage(form.image_path)
  const selectedUpload = uploadedImageObjectPath(form.image_path)
  return <AdminShell><div className="admin-dashboard"><header className="admin-header"><div><div className="eyebrow section-eyebrow">TURBO SOCCER · ADMIN</div><h1>{profile?.role === 'OWNER' ? 'Owner control room' : 'Your item list'}</h1><p>Choose what you want to manage.</p></div><div className="admin-user"><span className="admin-avatar">{(profile?.display_name ?? session.email ?? profile?.username ?? 'A').slice(0, 1).toUpperCase()}</span><div><b>{profile?.display_name ?? session.email ?? profile?.username}</b><small><span className="count-dot" /> {profile?.role === 'OWNER' ? 'OWNER' : profile?.title ?? 'ADMIN'}</small></div><button className="icon-button" onClick={() => void signOut()} title="Sign out"><LogOut size={17} /></button></div></header>
    {notice && <div className={`admin-notice ${/could not|error|must|already|use a/i.test(notice) ? 'error' : ''}`} role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
    <nav className="admin-main-menu" aria-label="Admin menu">
      <button type="button" className={`admin-menu-action ${adminSection === 'publish' ? 'active' : ''}`} aria-pressed={adminSection === 'publish'} onClick={() => setAdminSection('publish')}><PackagePlus size={20} /><span>Manage items<small>Catalog and values</small></span></button>
      <a className="admin-menu-action admin-menu-site" href="/"><Globe2 size={20} /><span>View the site<small>Public catalog</small></span><ExternalLink size={14} /></a>
      <button type="button" className={`admin-menu-action ${adminSection === 'codes' ? 'active' : ''}`} aria-pressed={adminSection === 'codes'} onClick={() => setAdminSection('codes')}><TicketPercent size={20} /><span>Promo codes<small>Public codes and status</small></span></button>
      {profile?.role === 'OWNER' && <button type="button" className={`admin-menu-action ${adminSection === 'accounts' ? 'active' : ''}`} aria-pressed={adminSection === 'accounts'} onClick={() => setAdminSection('accounts')}><UsersRound size={20} /><span>Admin accounts<small>Owner only</small></span></button>}
      <button type="button" className={`admin-menu-action ${adminSection === 'profile' ? 'active' : ''}`} aria-pressed={adminSection === 'profile'} onClick={() => setAdminSection('profile')}><UserRound size={20} /><span>My profile<small>Name and password</small></span></button>
    </nav>
    {adminSection === 'profile' && <section className="admin-section-content" aria-label="My profile"><AdminSelfSettings profile={profile!} onSaved={() => void refresh()} /></section>}
    {adminSection === 'accounts' && profile?.role === 'OWNER' && <section className="admin-section-content" aria-label="Admin account management"><AdminManagement /></section>}
    {adminSection === 'codes' && <section className="admin-section-content"><div className="admin-section-intro"><span className="panel-kicker">HOMEPAGE CONTENT</span><h2>Manage promo codes</h2><p>Update the public code list and mark expired offers.</p></div><section className="admin-panel promo-manager"><form className="promo-manager-form" onSubmit={savePromo}><label>Code<input required maxLength={32} pattern="[A-Za-z0-9_-]{2,32}" placeholder="e.g. 85KLIKES" value={promoForm.code} onChange={event => setPromoForm({ ...promoForm, code: event.target.value.toUpperCase() })} /></label><label>Reward description<input required maxLength={200} placeholder="Describe what the code gives" value={promoForm.reward} onChange={event => setPromoForm({ ...promoForm, reward: event.target.value })} /></label><label className="promo-expired-toggle"><input type="checkbox" checked={promoForm.is_expired} onChange={event => setPromoForm({ ...promoForm, is_expired: event.target.checked })} /> Mark as expired</label><button className="primary-button" disabled={busy}>{editingPromoId ? 'Save code' : 'Add code'} <Check size={15} /></button>{editingPromoId && <button type="button" className="secondary-button" onClick={() => { setEditingPromoId(null); setPromoForm(blankPromoForm) }}>Cancel</button>}</form><div className="promo-manager-list">{promoCodes.map(entry => <article className="promo-manager-row" key={entry.id}><span className="promo-manager-status" aria-hidden="true">{entry.is_expired ? '❌' : '✅'}</span><div><b>{entry.code}</b><small>{entry.reward}</small></div><span className={`promo-status-chip${entry.is_expired ? ' expired' : ''}`}>{entry.is_expired ? 'Expired' : 'Available'}</span><button className="row-action" onClick={() => editPromo(entry)}>Edit</button><button className="row-delete" aria-label={`Delete ${entry.code}`} onClick={() => void deletePromo(entry)}><Trash2 size={15} /></button></article>)}</div>{!promoCodes.length && <p className="promo-manager-empty">No promo codes yet. Add the first one above.</p>}</section></section>}
    {adminSection === 'publish' && <div className="admin-section-content"><div className="admin-section-intro"><span className="panel-kicker">CATALOG</span><h2>Manage items</h2><p>Add an item or update a published value.</p></div><div className="admin-layout"><section className="admin-panel editor-panel"><div className="panel-heading"><div><span className="panel-kicker">{editing ? 'EDIT ITEM' : 'NEW ITEM'}</span><h2>{editing ? 'Update details' : 'Add to the list'}</h2></div>{editing && <button className="text-button" onClick={() => { setEditing(null); setForm(blankForm) }}>Cancel edit</button>}</div>
      <form onSubmit={saveItem} className="admin-form"><label>Item name <span className="required-star">*</span><input maxLength={100} required placeholder="Enter the official name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><div className="form-two"><label>Value in coins <small>whole numbers</small><input type="number" min="0" step="1" placeholder="Leave blank if unknown" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></label><label>Category <small>optional</small><input list="category-options" maxLength={60} placeholder="e.g. Ball" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /><datalist id="category-options">{CATEGORY_OPTIONS.map(option => <option key={option} value={option} />)}</datalist></label></div><div className="form-two"><label>Rarity <small>optional</small><input list="rarity-options" maxLength={60} placeholder="e.g. Limited" value={form.rarity} onChange={e => setForm({ ...form, rarity: e.target.value })} /><datalist id="rarity-options">{RARITY_OPTIONS.map(option => <option key={option} value={option} />)}</datalist></label><label>Image <small>optional</small><span className="image-status">{form.image_path ? 'Image selected' : 'No image selected'}</span></label></div>
      {!editing && <div className="variant-setup"><label className="variant-toggle"><input type="checkbox" checked={hasColorVariants} onChange={event => setHasColorVariants(event.target.checked)} /><span><b>This item has color variants</b><small>Create up to 15 color versions using this item’s image.</small></span></label>{hasColorVariants && <div className="variant-draft-list">{colorVariants.map((color, index) => <div className="variant-draft-row" key={index}><span className="variant-draft-number">{index + 1}</span><label>Color name<input required maxLength={32} placeholder="e.g. Sky Blue" value={color.name} onChange={event => setColorVariants(current => current.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))} /></label><label>Color<input type="color" value={color.hex} onChange={event => setColorVariants(current => current.map((entry, i) => i === index ? { ...entry, hex: event.target.value } : entry))} /></label>{colorVariants.length > 1 && <button type="button" className="row-delete" aria-label={`Remove color ${color.name || index + 1}`} onClick={() => setColorVariants(current => current.filter((_, i) => i !== index))}><X size={15} /></button>}</div>)}<button type="button" className="secondary-button add-color-variant" disabled={colorVariants.length >= 15} onClick={() => setColorVariants(current => [...current, { name: '', hex: '#60A5FA' }])}><Plus size={15} /> Add color ({colorVariants.length}/15)</button></div>}</div>}
      {editing && form.variant_parent_id && <div className="variant-edit-fields"><span className="panel-kicker">COLOR VARIANT</span><label>Variant name<input required maxLength={32} value={form.variant_color_name} onChange={event => setForm({ ...form, variant_color_name: event.target.value })} /></label><label>Color<input type="color" value={form.variant_color_hex || '#60A5FA'} onChange={event => setForm({ ...form, variant_color_hex: event.target.value.toUpperCase() })} /></label><small>This version is managed as its own item. Its image comes from the original item.</small></div>}
      <div className="image-picker">
        <div className="picker-heading"><span>Image library</span><span>{availableImages.length} photos · {visibleImages.length} shown</span></div>
        {form.image_path && <div className="image-current-preview"><div className="image-current-art">{selectedImage ? <img src={selectedImage} alt="Selected item" /> : <ImagePlus size={24} />}</div><div className="image-current-details"><b>Selected image</b><small>{selectedUpload ? selectedUpload.split('/').pop() : form.image_path.split('/').pop()}</small><div className="image-current-actions"><button type="button" className="secondary-button" onClick={() => setForm(current => ({ ...current, image_path: '' }))}><X size={14} /> Remove from item</button>{selectedUpload && <button type="button" className="delete-image-button" disabled={busy} onClick={() => void deleteUploadedImage()}><Trash2 size={14} /> Delete uploaded photo</button>}</div></div></div>}
        <label className="image-search"><Search size={15} /><input placeholder="Search images by filename..." value={imageSearch} onChange={e => setImageSearch(e.target.value)} /><span>{visibleImages.length}</span></label>
        <div className="image-options">{visibleImages.map(src => { const uploaded = Boolean(uploadedImageObjectPath(src)); return <div key={src} className="image-option-wrap"><button type="button" title={src.split('/').pop()} className={form.image_path === src ? 'image-option selected' : 'image-option'} onClick={() => setForm(current => ({ ...current, image_path: current.image_path === src ? '' : src }))}><img src={itemImage(src)!} alt={src.split('/').pop()} loading="lazy" />{form.image_path === src && <span><Check size={15} /></span>}</button><button type="button" className="image-option-delete" title="Remove image from library (also unlinks catalogue items)" aria-label={`Remove image from library ${src.split('/').pop()}`} disabled={busy} onClick={event => { event.preventDefault(); event.stopPropagation(); void (uploaded ? deleteUploadedImage(src) : removeImageFromLibrary(src)) }}><X size={18} strokeWidth={2.5} /></button></div> })}</div>
        {!visibleImages.length && <div className="image-library-empty">No images match that search.</div>}
        <label className="upload-button"><Upload size={14} /> {uploading ? 'Uploading…' : 'Upload new photo'}<input type="file" accept="image/webp,image/png,image/jpeg,image/gif" disabled={uploading} onChange={e => { void uploadImage(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} /></label>
      </div>
      <div className="demand-field"><span className="demand-label">Community demand</span><small>Optional · saved with this item</small><DemandStars rating={form.demand === '' ? null : Number(form.demand)} interactive onChange={rating => setForm(current => ({ ...current, demand: rating == null ? '' : String(rating) }))} /></div>
      <label>Description <small>optional</small><textarea maxLength={2000} rows={3} placeholder="Add item details" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <div className="preview-box"><span className="preview-label">PUBLIC LIST PREVIEW</span><div className="preview-item"><div className="preview-image">{itemImage(form.image_path) ? <img src={itemImage(form.image_path)!} alt="" /> : <ImagePlus size={18} />}{form.variant_color_hex && <span className="variant-color-band" style={{ '--variant-color': form.variant_color_hex } as React.CSSProperties} />}</div><div><b>{form.name || 'Item name'}</b><small>{form.category || 'Category'}</small>{form.rarity && <span className={`rarity-chip ${rarityTone(form.rarity)}`}>{form.rarity}</span>}</div><CoinValue value={form.value !== '' ? Number(form.value) : null} compact /></div></div>
      <button className="primary-button full-button" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add item'} <Check size={16} /></button></form></section>
    <section className="admin-panel catalogue-panel"><div className="panel-heading"><div><span className="panel-kicker">LIVE CATALOGUE</span><h2>Published items <span className="catalogue-total">{items.length}</span></h2></div><button className="export-button" onClick={exportCsv} disabled={!items.length}>Export CSV</button></div><label className="search-box admin-search"><Search size={16} /><input placeholder="Find an item..." value={filter} onChange={e => setFilter(e.target.value)} /></label><div className="catalogue-list">{adminItems.length ? adminItems.map(item => <div className="catalogue-row" key={item.id}><div className="catalogue-thumb">{itemImage(item.image_path) && <img src={itemImage(item.image_path)!} alt="" />}{item.variant_color_hex && <span className="variant-color-band" style={{ '--variant-color': item.variant_color_hex } as React.CSSProperties} />}</div><div className="catalogue-name"><b>{item.name}</b><small>{item.variant_color_name ? `${item.category || 'No category'} · ${item.variant_color_name}` : item.category || 'No category'}</small>{item.rarity && <span className={`rarity-chip ${rarityTone(item.rarity)}`}>{item.rarity}</span>}</div><CoinValue value={item.value} compact className="catalogue-value" /><button className="row-action" onClick={() => editItem(item)} aria-label={`Edit ${item.name}`}>Edit</button><button className="row-delete" onClick={() => void deleteItem(item)} aria-label={`Delete ${item.name}`}><Trash2 size={15} /></button></div>) : <div className="catalogue-empty"><BrandMark /><b>{filter ? 'No items match' : 'No items added yet'}</b><span>{filter ? 'Try another search.' : 'Add your first item to start the catalogue.'}</span></div>}</div><div className="catalogue-footer"><span><span className="count-dot" /> Changes publish automatically</span><a href="/">View public site <ExternalLink size={13} /></a></div></section></div>
    <div className="admin-security-note"><ShieldCheck size={16} /><span>Writes are enforced by Supabase Row Level Security. Only accounts listed in the private admin allowlist can change catalogue data.</span></div></div>}
  </div></AdminShell>
}

function AdminShell({ children }: { children: React.ReactNode }) { return <div className="admin-shell"><SiteNav activeView="admin" />{children}</div> }

function SetupPanel() {
  return <div className="setup-panel"><div className="login-emblem"><LockKeyhole size={21} /></div><div className="eyebrow section-eyebrow">EXISTING SUPABASE PROJECT</div><h1>Connect the<br />current database.</h1><p>Use the same project as the published catalogue so your existing OWNER login and item data stay connected.</p><ol><li>Back up the database and verify the OWNER UUID before applying migrations 002, 003, and 004 in order.</li><li>Set the existing project URL and public anon key in <code>.env</code>.</li><li>Set the Pages Functions server key and rate-limit salt as private Cloudflare secrets.</li><li>Provision the ten initial admin accounts with <code>scripts/provision-admins.ps1</code>.</li></ol><a className="secondary-button" href="/">Back to public site <ChevronRight size={15} /></a></div>
}

export default App


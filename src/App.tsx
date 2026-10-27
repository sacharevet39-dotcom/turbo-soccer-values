import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowDownWideNarrow, ArrowLeftRight, ArrowUpWideNarrow, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, ExternalLink, ImagePlus, LockKeyhole, LogOut, Minus, Plus,
  Search, ShieldCheck, SlidersHorizontal, Star, Trash2, Upload, X,
} from 'lucide-react'
import { configured, errorMessage, itemImage, supabase, type Item } from './lib/supabase'
import { sourceImages } from './catalogImages'
import { AdminManagement, AdminSelfSettings } from './admin/AdminManagement'
import { ADMIN_PASSWORD_MIN_LENGTH, ADMIN_PASSWORD_POLICY_MESSAGE, isStrongAdminPassword } from '../shared/password-policy.js'

const PAGE_SIZE = 24
const CATEGORY_OPTIONS = ['Car', 'Pattern', 'Color', 'Wheels', 'Boost', 'Trail', 'Goal Explosion', 'Demolition Explosion', 'Ball', 'Hat', 'Banner', 'Border', 'Title', 'Horn', 'Plate', 'Finish']
const RARITY_OPTIONS = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Exclusive', 'Halloween', 'Beta']
type View = 'values' | 'trade'
type TradeLine = { id: string; quantity: number }
type FormState = { name: string; value: string; category: string; rarity: string; description: string; image_path: string; demand: string }
type AdminProfile = { role: 'OWNER' | 'ADMIN'; username: string | null; display_name: string; title: string; title_color: string; status: string; must_change_password: boolean; last_seen: string | null }
const blankForm: FormState = { name: '', value: '', category: '', rarity: '', description: '', image_path: '', demand: '' }

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

function PublicApp() {
  const [view, setView] = useState<View>(new URLSearchParams(location.search).get('tab') === 'trade' ? 'trade' : 'values')
  const [items, setItems] = useState<Item[]>([])
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
    <header className="topbar">
      <a className="brand" href="/" aria-label="Turbo Soccer Values home"><BrandMark /><span className="brand-tagline">ITEM VALUES</span></a>
      <nav className="main-nav" aria-label="Main navigation">
        <button className={view === 'values' ? 'nav-link active' : 'nav-link'} onClick={() => setView('values')}>Value list</button>
        <button className={view === 'trade' ? 'nav-link active' : 'nav-link'} onClick={() => setView('trade')}>Trade calculator</button>
      </nav>
      <div className="top-actions"><OnlineCount /><a className="admin-link" href="/admin"><LockKeyhole size={15} /> Admin</a></div>
    </header>
    <main>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" /> TURBO SOCCER VALUES</div>
          <h1>Turbo Soccer<br /><span>market</span></h1>
          <p>Check item values, then compare both sides before you trade.</p>
          <div className="hero-meta"><span>Values shared by the community</span><span className="meta-separator" /><a href="https://www.roblox.com/games/101880234193261/Turbo-Soccer-Beta-1-0" target="_blank" rel="noreferrer">Play Turbo Soccer <ExternalLink size={13} /></a></div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-car-frame">
            <img src="/brand/octane-fennec.jpg" alt="" />
          </div>
          <div className="art-stat stat-top"><ArrowLeftRight size={14} /><span>TRADE CALCULATOR</span></div>
          <div className="art-stat stat-bottom"><span className="stat-dot" /> CARS <b>·</b> WHEELS <b>·</b> BOOSTS</div>
        </div>
      </section>
      <section className="content-section">
        <div className="section-heading"><div><div className="eyebrow section-eyebrow">{view === 'values' ? 'VALUE LIST' : 'YOUR TRADE'}</div><h2>{view === 'values' ? 'Item values' : 'Trade calculator'}</h2><p>{view === 'values' ? 'Search by name, filter by type, or sort by value.' : 'Add items for each player to compare totals.'}</p></div>
          {view === 'values' && <div className="item-count"><span className="count-dot" /> {items.length} {items.length === 1 ? 'item' : 'items'} listed</div>}
        </div>
        {!configured && <SetupNotice />}
        {loadError && <div className="inline-error" role="alert">Could not load the item list: {loadError} <button onClick={() => { setLoading(true); void loadItems() }}>Retry</button></div>}
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
        </> : <TradeCalculator items={items} left={theirSide} right={ourSide} setLeft={setTheirSide} setRight={setOurSide} />}
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
  return count === null ? null : <span className="live-pill visitor-count"><span /> {count} online</span>
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

function SetupNotice() {
  return <div className="setup-notice"><div className="notice-icon"><CircleHelp size={18} /></div><div><b>Database setup is needed</b><p>The site is ready, but the public list will appear after Supabase is connected and the first items are added in the admin panel.</p></div><a href="/admin">Open admin setup <ChevronRight size={14} /></a></div>
}

function ItemCard({ item }: { item: Item }) {
  const image = itemImage(item.image_path)
  return <a className="item-card" href={`/item/${item.id}`} aria-label={`Open ${item.name} details`}>
    <div className="item-card-heading"><h3>{item.name}</h3>{item.rarity && <span className="rarity-chip">{item.rarity}</span>}</div>
    <div className="card-visual">{image ? <img src={image} alt={item.name} loading="lazy" /> : <div className="image-placeholder"><BrandMark /><span>IMAGE PENDING</span></div>}<span className="view-details">Details <ChevronRight size={13} /></span></div>
    <div className="card-info"><div className="item-subline"><span>{item.category || 'Uncategorized'}</span><span className="card-value-label">VALUE</span></div><CoinValue value={item.value} compact className="card-value" />{item.demand != null && <DemandStars rating={item.demand} />}</div>
  </a>
}

function DemandStars({ rating, interactive = false, onChange }: { rating: number | null; interactive?: boolean; onChange?: (value: number | null) => void }) {
  return <div className={`demand-stars${interactive ? ' interactive' : ''}`} role={interactive ? 'radiogroup' : 'img'} aria-label={rating == null ? 'Demand not rated' : `Demand: ${rating} out of 5 stars`}>
    {Array.from({ length: 5 }, (_, index) => {
      const value = index + 1
      const active = rating != null && value <= rating
      return interactive
        ? <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} out of 5 stars`} onClick={() => onChange?.(value)}><Star size={15} fill={active ? 'currentColor' : 'none'} /></button>
        : <Star key={value} size={13} fill={active ? 'currentColor' : 'none'} aria-hidden="true" />
    })}
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
  return <div className="app-shell"><header className="topbar"><a className="brand" href="/" aria-label="Turbo Soccer Values home"><BrandMark /><span className="brand-tagline">ITEM VALUES</span></a><nav className="main-nav"><a className="nav-link" href="/">Value list</a><a className="nav-link" href="/?tab=trade">Trade calculator</a></nav><div className="top-actions"><a className="admin-link" href="/admin"><LockKeyhole size={15} /> Admin</a></div></header>
    <main className="detail-page"><a className="back-to-items" href="/"><ChevronLeft size={17} /> All items</a>{loading ? <div className="detail-loading"><div className="spinner" /> Loading item…</div> : error || !item ? <div className="empty-state"><h3>{configured ? 'Item unavailable' : 'Connect the database first'}</h3><p>{error || 'Item details will appear after Supabase is connected.'}</p><a className="secondary-button" href="/">Back to item list</a></div> : <>
      <div className="detail-page-grid"><div className="detail-art-wrap"><span className="detail-art-sticker">TURBO SOCCER ITEM</span>{itemImage(item.image_path) ? <img src={itemImage(item.image_path)!} alt={item.name} className="detail-art" /> : <div className="image-placeholder"><BrandMark /><span>IMAGE PENDING</span></div>}</div><article className="detail-card"><div className="eyebrow section-eyebrow">ITEM PROFILE</div><h1>{item.name}</h1><div className="detail-value-label">CURRENT VALUE</div><CoinValue value={item.value} className="detail-value" /><div className="detail-tags">{item.category && <span>{item.category}</span>}{item.rarity && <span className="rarity-chip">{item.rarity}</span>}</div>{item.demand != null && <div className="detail-demand"><span>COMMUNITY DEMAND</span><DemandStars rating={item.demand} /></div>}{item.description ? <p className="detail-description">{item.description}</p> : <p className="detail-description muted">No item description has been added yet.</p>}<div className="detail-meta"><span>Updated</span><b>{new Date(item.updated_at).toLocaleDateString()}</b></div><div className="detail-actions"><a className="primary-button" href={`/?tab=trade&item=${encodeURIComponent(item.id)}`}><ArrowLeftRight size={16} /> Compare in calculator</a><button className="secondary-button" onClick={() => void share()}>{copied ? <Check size={15} /> : <ExternalLink size={15} />}{copied ? 'Link copied' : 'Share item'}</button></div>{error && <p className="detail-error" role="status">{error}</p>}<p className="detail-disclaimer"><CircleHelp size={14} /> Community-entered value in coins. Trades are not guaranteed by Roblox.</p></article></div>
      {related.length > 0 && <section className="related-section"><div className="section-heading"><div><div className="eyebrow section-eyebrow">KEEP EXPLORING</div><h2>More {item.category} items</h2></div></div><div className="item-grid related-grid">{related.map(entry => <ItemCard key={entry.id} item={entry} />)}</div></section>}
    </>}</main><footer className="footer"><a className="footer-brand" href="/"><BrandMark /> TURBO SOCCER VALUES</a><span>Fan-made values · Not affiliated with Roblox</span><span>Values are estimates, not an official trade guarantee.</span></footer></div>
}

function CoinValue({ value, className = '', compact = false, prefix = '' }: { value: number | null; className?: string; compact?: boolean; prefix?: string }) {
  if (value === null) return <span className={`coin-value no-value ${className}`}>Not set</span>
  return <span className={`coin-value ${compact ? 'compact' : ''} ${className}`}><img src="/brand/coin.png" alt="" /><span>{prefix}{new Intl.NumberFormat('en-US').format(value)}{compact ? '' : value === 1 ? ' coin' : ' coins'}</span></span>
}

function TradeCalculator({ items, left, right, setLeft, setRight }: { items: Item[]; left: TradeLine[]; right: TradeLine[]; setLeft: (v: TradeLine[]) => void; setRight: (v: TradeLine[]) => void }) {
  const [choice, setChoice] = useState<Record<string, string>>({ left: '', right: '' })
  const total = (lines: TradeLine[]) => lines.reduce((sum, line) => sum + ((items.find(i => i.id === line.id)?.value ?? 0) * line.quantity), 0)
  const leftTotal = total(left), rightTotal = total(right), diff = leftTotal - rightTotal
  function add(side: 'left' | 'right') {
    const id = choice[side]
    if (!id) return
    const list = side === 'left' ? left : right
    const set = side === 'left' ? setLeft : setRight
    const existing = list.find(line => line.id === id)
    if (!existing && list.length >= 9) return
    set(existing ? list.map(line => line.id === id ? { ...line, quantity: line.quantity + 1 } : line) : [...list, { id, quantity: 1 }])
    setChoice({ ...choice, [side]: '' })
  }
  function update(side: 'left' | 'right', id: string, quantity: number) {
    const list = side === 'left' ? left : right, set = side === 'left' ? setLeft : setRight
    set(quantity < 1 ? list.filter(line => line.id !== id) : list.map(line => line.id === id ? { ...line, quantity: Math.min(99, quantity) } : line))
  }
  return <div className="trade-wrap">
    <div className="trade-hint"><ArrowLeftRight size={16} /><span>Compare what you give against what you receive. Items without a value count as 0 until one is set.</span></div>
    <div className="trade-columns"><TradeSide title="THEIR OFFER" tint="blue" items={items} lines={left} value={choice.left} onChange={v => setChoice({ ...choice, left: v })} onAdd={() => add('left')} onUpdate={(id, q) => update('left', id, q)} /><div className="trade-mid"><span>VS</span></div><TradeSide title="YOUR OFFER" tint="lime" items={items} lines={right} value={choice.right} onChange={v => setChoice({ ...choice, right: v })} onAdd={() => add('right')} onUpdate={(id, q) => update('right', id, q)} /></div>
    <div className="trade-result"><div><span className="result-label">VALUE DIFFERENCE</span><CoinValue value={diff} className={diff === 0 ? 'even' : diff > 0 ? 'gain' : 'loss'} prefix={diff > 0 ? '+' : ''} /><small>{diff === 0 ? 'Even trade' : diff > 0 ? 'Their offer is higher' : 'Your offer is higher'}</small></div><div className="result-summary"><span>Their total <CoinValue value={leftTotal} compact /></span><span>Your total <CoinValue value={rightTotal} compact /></span></div><button className="secondary-button" onClick={() => { setLeft([]); setRight([]) }}>Clear trade</button></div>
    <p className="trade-disclaimer"><CircleHelp size={14} /> Calculator uses community-entered values and does not guarantee a fair or official Roblox trade.</p>
  </div>
}

function TradeSide({ title, tint, items, lines, value, onChange, onAdd, onUpdate }: { title: string; tint: 'blue' | 'lime'; items: Item[]; lines: TradeLine[]; value: string; onChange: (v: string) => void; onAdd: () => void; onUpdate: (id: string, quantity: number) => void }) {
  const selectedItems = lines.map(line => ({ line, item: items.find(entry => entry.id === line.id) })).filter((entry): entry is { line: TradeLine; item: Item } => Boolean(entry.item))
  const total = selectedItems.reduce((sum, { line, item }) => sum + (item.value ?? 0) * line.quantity, 0)
  return <section className={`trade-side ${tint}`}>
    <div className="side-header"><span>{title}</span><CoinValue value={total} compact /></div>
    <div className="add-item-row"><select value={value} onChange={e => onChange(e.target.value)} aria-label={`Select item for ${title.toLowerCase()}`}><option value="">Choose an item…</option>{items.map(item => <option key={item.id} value={item.id}>{item.name}{item.value === null ? ' · Not valued' : ` · ${formatValue(item.value)}`}</option>)}</select><button type="button" className="add-item-button" onClick={onAdd} disabled={!value || (!lines.some(line => line.id === value) && lines.length >= 9)} aria-label="Add selected item"><Plus size={17} /></button></div>
    <div className="trade-board" aria-label={`${title}: up to nine items`}>
      {Array.from({ length: 9 }, (_, index) => {
        const entry = selectedItems[index]
        if (!entry) return <div className="trade-slot-empty" key={`empty-${index}`}><Plus size={16} /><span>Empty slot</span></div>
        const { item, line } = entry
        return <article className="trade-item-tile" key={line.id}>
          <div className="trade-tile-art">{itemImage(item.image_path) ? <img src={itemImage(item.image_path)!} alt={item.name} /> : <ImagePlus size={23} />}<span className="trade-tile-price">{item.value == null ? 'Not valued' : <CoinValue value={item.value} compact />}</span></div>
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
  const [hiddenImages, setHiddenImages] = useState<string[]>([])
  const [form, setForm] = useState<FormState>(blankForm)
  const [editing, setEditing] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [imageSearch, setImageSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

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
    setEditing(item.id); setForm({ name: item.name, value: item.value === null ? '' : String(item.value), category: item.category ?? '', rarity: item.rarity ?? '', description: item.description ?? '', image_path: item.image_path ?? '', demand: item.demand == null ? '' : String(item.demand) }); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function saveItem(e: FormEvent) {
    e.preventDefault(); if (!supabase) return
    const name = form.name.trim()
    const val = form.value.trim() === '' ? null : Number(form.value)
    if (!name) { setNotice('Enter an item name before saving.'); return }
    if (val !== null && (!Number.isSafeInteger(val) || val < 0)) { setNotice('Value must be a non-negative whole number.'); return }
    setBusy(true); setNotice('')
    const demand = form.demand === '' ? null : Number(form.demand)
    const payload = { name, value: val, image_path: form.image_path || null, category: form.category.trim() || null, rarity: form.rarity.trim() || null, description: form.description.trim() || null, demand }
    const result = editing ? await supabase.from('items').update(payload).eq('id', editing) : await supabase.from('items').insert(payload)
    if (result.error) setNotice(result.error.code === '23505' ? 'An item with that name already exists.' : result.error.message.toLowerCase().includes("'demand'") || result.error.message.toLowerCase().includes('demand column') ? 'Apply the Supabase migration 202610270002_item_demand_stars.sql before saving demand ratings.' : errorMessage(result.error))
    else { setNotice(editing ? 'Item updated.' : 'Item added.'); setForm(blankForm); setEditing(null); await refresh() }
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
    const { data: references, error: referenceError } = await supabase.from('items').select('id').eq('image_path', imagePath)
    if (referenceError) { setNotice(`Could not check items using this image: ${errorMessage(referenceError)}`); return }
    const { error: hideError } = await supabase.from('admin_hidden_catalog_images').insert({ image_path: imagePath })
    if (hideError) {
      setNotice(hideError.code === '42P01' || hideError.code === 'PGRST205' ? 'Run Supabase migration 202610270003_seed_game_item_catalogue.sql to enable image-library removal.' : errorMessage(hideError))
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
  }
  function exportCsv() {
    const rows = [['name','value','image_path','category','rarity','description','created_at','updated_at'], ...items.map(i => [i.name, i.value ?? '', i.image_path ?? '', i.category ?? '', i.rarity ?? '', i.description ?? '', i.created_at, i.updated_at])]
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'turbo-soccer-items.csv'; link.click(); URL.revokeObjectURL(link.href)
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
  return <AdminShell><div className="admin-dashboard"><header className="admin-header"><div><div className="eyebrow section-eyebrow">TURBO SOCCER · ADMIN</div><h1>{profile?.role === 'OWNER' ? 'Owner control room' : 'Your item list'}</h1><p>Add and update items{profile?.role === 'OWNER' ? ', manage admin accounts, and check site activity.' : ' for the community.'}</p></div><div className="admin-user"><span className="admin-avatar">{(profile?.display_name ?? session.email ?? profile?.username ?? 'A').slice(0, 1).toUpperCase()}</span><div><b>{profile?.display_name ?? session.email ?? profile?.username}</b><small><span className="count-dot" /> {profile?.role === 'OWNER' ? 'OWNER' : profile?.title ?? 'ADMIN'}</small></div><button className="icon-button" onClick={() => void signOut()} title="Sign out"><LogOut size={17} /></button></div></header>
    {notice && <div className={`admin-notice ${/could not|error|must|already|use a/i.test(notice) ? 'error' : ''}`} role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
    <AdminSelfSettings profile={profile!} onSaved={() => void refresh()} />
    {profile?.role === 'OWNER' && <AdminManagement />}
    <div className="admin-layout"><section className="admin-panel editor-panel"><div className="panel-heading"><div><span className="panel-kicker">{editing ? 'EDIT ITEM' : 'NEW ITEM'}</span><h2>{editing ? 'Update details' : 'Add to the list'}</h2></div>{editing && <button className="text-button" onClick={() => { setEditing(null); setForm(blankForm) }}>Cancel edit</button>}</div>
      <form onSubmit={saveItem} className="admin-form"><label>Item name <span className="required-star">*</span><input maxLength={100} required placeholder="Enter the official name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><div className="form-two"><label>Value in coins <small>whole numbers</small><input type="number" min="0" step="1" placeholder="Leave blank if unknown" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></label><label>Category <small>optional</small><input list="category-options" maxLength={60} placeholder="e.g. Ball" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /><datalist id="category-options">{CATEGORY_OPTIONS.map(option => <option key={option} value={option} />)}</datalist></label></div><div className="form-two"><label>Rarity <small>optional</small><input list="rarity-options" maxLength={60} placeholder="e.g. Limited" value={form.rarity} onChange={e => setForm({ ...form, rarity: e.target.value })} /><datalist id="rarity-options">{RARITY_OPTIONS.map(option => <option key={option} value={option} />)}</datalist></label><label>Image <small>optional</small><span className="image-status">{form.image_path ? 'Image selected' : 'No image selected'}</span></label></div>
      <div className="image-picker">
        <div className="picker-heading"><span>Image library</span><span>{availableImages.length} photos · {visibleImages.length} shown</span></div>
        {form.image_path && <div className="image-current-preview"><div className="image-current-art">{selectedImage ? <img src={selectedImage} alt="Selected item" /> : <ImagePlus size={24} />}</div><div className="image-current-details"><b>Selected image</b><small>{selectedUpload ? selectedUpload.split('/').pop() : form.image_path.split('/').pop()}</small><div className="image-current-actions"><button type="button" className="secondary-button" onClick={() => setForm(current => ({ ...current, image_path: '' }))}><X size={14} /> Remove from item</button>{selectedUpload && <button type="button" className="delete-image-button" disabled={busy} onClick={() => void deleteUploadedImage()}><Trash2 size={14} /> Delete uploaded photo</button>}</div></div></div>}
        <label className="image-search"><Search size={15} /><input placeholder="Search images by filename..." value={imageSearch} onChange={e => setImageSearch(e.target.value)} /><span>{visibleImages.length}</span></label>
        <div className="image-options">{visibleImages.map(src => { const uploaded = Boolean(uploadedImageObjectPath(src)); return <div key={src} className="image-option-wrap"><button type="button" title={src.split('/').pop()} className={form.image_path === src ? 'image-option selected' : 'image-option'} onClick={() => setForm(current => ({ ...current, image_path: current.image_path === src ? '' : src }))}><img src={itemImage(src)!} alt={src.split('/').pop()} loading="lazy" />{form.image_path === src && <span><Check size={15} /></span>}</button><button type="button" className="image-option-delete" title="Remove image from library (also unlinks catalogue items)" aria-label={`Remove image from library ${src.split('/').pop()}`} disabled={busy} onClick={() => void (uploaded ? deleteUploadedImage(src) : removeImageFromLibrary(src))}><X size={13} /></button></div> })}</div>
        {!visibleImages.length && <div className="image-library-empty">No images match that search.</div>}
        <label className="upload-button"><Upload size={14} /> {uploading ? 'Uploading…' : 'Upload new photo'}<input type="file" accept="image/webp,image/png,image/jpeg,image/gif" disabled={uploading} onChange={e => { void uploadImage(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} /></label>
      </div>
      <label className="demand-field">Community demand <small>optional · choose 1 to 5 stars</small><DemandStars rating={form.demand === '' ? null : Number(form.demand)} interactive onChange={rating => setForm(current => ({ ...current, demand: rating == null ? '' : String(rating) }))} /></label>
      <label>Description <small>optional</small><textarea maxLength={2000} rows={3} placeholder="Add item details" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <div className="preview-box"><span className="preview-label">PUBLIC LIST PREVIEW</span><div className="preview-item"><div className="preview-image">{itemImage(form.image_path) ? <img src={itemImage(form.image_path)!} alt="" /> : <ImagePlus size={18} />}</div><div><b>{form.name || 'Item name'}</b><small>{form.category || 'Category'}{form.rarity ? ` · ${form.rarity}` : ''}</small></div><CoinValue value={form.value !== '' ? Number(form.value) : null} compact /></div></div>
      <button className="primary-button full-button" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add item'} <Check size={16} /></button></form></section>
    <section className="admin-panel catalogue-panel"><div className="panel-heading"><div><span className="panel-kicker">LIVE CATALOGUE</span><h2>Published items <span className="catalogue-total">{items.length}</span></h2></div><button className="export-button" onClick={exportCsv} disabled={!items.length}>Export CSV</button></div><label className="search-box admin-search"><Search size={16} /><input placeholder="Find an item..." value={filter} onChange={e => setFilter(e.target.value)} /></label><div className="catalogue-list">{adminItems.length ? adminItems.map(item => <div className="catalogue-row" key={item.id}><div className="catalogue-thumb">{itemImage(item.image_path) && <img src={itemImage(item.image_path)!} alt="" />}</div><div className="catalogue-name"><b>{item.name}</b><small>{item.category || 'No category'}{item.rarity ? ` · ${item.rarity}` : ''}</small></div><CoinValue value={item.value} compact className="catalogue-value" /><button className="row-action" onClick={() => editItem(item)} aria-label={`Edit ${item.name}`}>Edit</button><button className="row-delete" onClick={() => void deleteItem(item)} aria-label={`Delete ${item.name}`}><Trash2 size={15} /></button></div>) : <div className="catalogue-empty"><BrandMark /><b>{filter ? 'No items match' : 'No items added yet'}</b><span>{filter ? 'Try another search.' : 'Add your first item to start the catalogue.'}</span></div>}</div><div className="catalogue-footer"><span><span className="count-dot" /> Changes publish automatically</span><a href="/">View public site <ExternalLink size={13} /></a></div></section></div>
    <div className="admin-security-note"><ShieldCheck size={16} /><span>Writes are enforced by Supabase Row Level Security. Only accounts listed in the private admin allowlist can change catalogue data.</span></div>
  </div></AdminShell>
}

function AdminShell({ children }: { children: React.ReactNode }) { return <div className="admin-shell"><header className="topbar admin-topbar"><a className="brand" href="/"><BrandMark /><span className="brand-tagline">ITEM VALUES</span></a><a className="admin-back" href="/"><ChevronLeft size={15} /> Public site</a></header>{children}</div> }

function SetupPanel() {
  return <div className="setup-panel"><div className="login-emblem"><LockKeyhole size={21} /></div><div className="eyebrow section-eyebrow">EXISTING SUPABASE PROJECT</div><h1>Connect the<br />current database.</h1><p>Use the same project as the published catalogue so your existing OWNER login and item data stay connected.</p><ol><li>Back up the database and verify the OWNER UUID before applying migrations 002, 003, and 004 in order.</li><li>Set the existing project URL and public anon key in <code>.env</code>.</li><li>Set the Pages Functions server key and rate-limit salt as private Cloudflare secrets.</li><li>Provision the ten initial admin accounts with <code>scripts/provision-admins.ps1</code>.</li></ol><a className="secondary-button" href="/">Back to public site <ChevronRight size={15} /></a></div>
}

function formatValue(value: number | null) { return value === null || value === undefined ? 'Not set' : `${new Intl.NumberFormat('en-US').format(value)} ${value === 1 ? 'coin' : 'coins'}` }

export default App


import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowDownWideNarrow, ArrowLeftRight, ArrowUpWideNarrow, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, ExternalLink, ImagePlus, LockKeyhole, LogOut, Minus, Plus,
  Search, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Upload, X,
} from 'lucide-react'
import { configured, errorMessage, itemImage, supabase, type Item } from './lib/supabase'

const PAGE_SIZE = 24
const sourceImages = [
  '/catalog/Capture_decran_2026-10-26_a_15.51.35.webp',
  '/catalog/Capture_decran_2026-10-26_a_15.51.45.webp',
  '/catalog/Capture_decran_2026-10-26_a_15.51.51.webp',
  '/catalog/Capture_decran_2026-10-26_a_15.51.58.webp',
  '/catalog/Capture_decran_2026-10-26_a_15.52.03.webp',
]
type View = 'values' | 'trade'
type TradeLine = { id: string; quantity: number }
type FormState = { name: string; value: string; category: string; rarity: string; description: string; image_path: string }
const blankForm: FormState = { name: '', value: '', category: '', rarity: '', description: '', image_path: '' }

function App() {
  const isAdminRoute = window.location.pathname.startsWith('/admin')
  if (isAdminRoute) return <Admin />
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
  const [selected, setSelected] = useState<Item | null>(null)
  const [theirSide, setTheirSide] = useState<TradeLine[]>([])
  const [ourSide, setOurSide] = useState<TradeLine[]>([])

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

  const categories = useMemo(() => [...new Set(items.map(i => i.category).filter((x): x is string => Boolean(x)))].sort(), [items])
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
      <a className="brand" href="/" aria-label="Turbo Soccer Values home"><BrandMark /><span>turbo<span className="brand-light">soccer</span><small>VALUES HUB</small></span></a>
      <nav className="main-nav" aria-label="Main navigation">
        <button className={view === 'values' ? 'nav-link active' : 'nav-link'} onClick={() => setView('values')}>Value list</button>
        <button className={view === 'trade' ? 'nav-link active' : 'nav-link'} onClick={() => setView('trade')}>Trade calculator</button>
      </nav>
      <div className="top-actions"><span className="live-pill"><span /> Community values</span><a className="admin-link" href="/admin"><LockKeyhole size={15} /> Admin</a></div>
    </header>
    <main>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" /> TURBO SOCCER · ITEM DATABASE</div>
          <h1>Know the value.<br /><span>Make the play.</span></h1>
          <p>Look up the community item list and see how your next trade stacks up.</p>
          <div className="hero-meta"><span><ShieldCheck size={15} /> Values maintained by the community</span><span className="meta-separator" /><a href="https://www.roblox.com/games/101880234193261/Turbo-Soccer-Beta-1-0" target="_blank" rel="noreferrer">Play Turbo Soccer <ExternalLink size={13} /></a></div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-ball">TS<span>01</span></div><div className="art-stat stat-top"><Sparkles size={14} /><span>PLAYER-UPDATED</span></div><div className="art-stat stat-bottom"><span className="stat-dot" /> VALUE INDEX <b>LIVE</b></div></div>
      </section>
      <section className="content-section">
        <div className="section-heading"><div><div className="eyebrow section-eyebrow">THE MARKET</div><h2>{view === 'values' ? 'Item values' : 'Trade calculator'}</h2><p>{view === 'values' ? 'Find your item and check where it stands.' : 'Build both sides and compare the total value.'}</p></div>
          {view === 'values' && <div className="item-count"><span className="count-dot" /> {items.length} {items.length === 1 ? 'item' : 'items'} listed</div>}
        </div>
        {!configured && <SetupNotice />}
        {loadError && <div className="inline-error" role="alert">Could not load the item list: {loadError} <button onClick={() => { setLoading(true); void loadItems() }}>Retry</button></div>}
        {view === 'values' ? <>
          <div className="toolbar">
            <label className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..." aria-label="Search items" />{search && <button className="icon-button" onClick={() => setSearch('')} aria-label="Clear search"><X size={15} /></button>}</label>
            <div className="toolbar-right"><label className="select-wrap"><SlidersHorizontal size={15} /><select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter category"><option value="all">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select><ChevronDown size={14} /></label><button className="sort-button" onClick={() => setSort(sort === 'high' ? 'low' : 'high')}><span>{sort === 'high' ? <ArrowDownWideNarrow size={15} /> : <ArrowUpWideNarrow size={15} />}</span> Value: {sort === 'high' ? 'Highest' : 'Lowest'}</button></div>
          </div>
          {loading ? <div className="loading-grid">{Array.from({ length: 8 }, (_, i) => <div className="skeleton-card" key={i}><div /><span /><b /></div>)}</div> : pageItems.length ? <>
            <div className="item-grid">{pageItems.map((item, index) => <ItemCard item={item} key={item.id} index={(page - 1) * PAGE_SIZE + index + 1} onClick={() => setSelected(item)} />)}</div>
            {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onPage={setPage} />}
          </> : <EmptyItems search={search} onClear={() => { setSearch(''); setCategory('all') }} />}
        </> : <TradeCalculator items={items} left={theirSide} right={ourSide} setLeft={setTheirSide} setRight={setOurSide} />}
      </section>
    </main>
    <footer className="footer"><a className="footer-brand" href="/"><BrandMark /> TURBO SOCCER VALUES</a><span>Community-maintained values · Not affiliated with Roblox</span><span>Values are estimates, not an official trade guarantee.</span></footer>
    {selected && <ItemModal item={selected} onClose={() => setSelected(null)} />}
  </div>
}

function BrandMark() { return <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span> }

function SetupNotice() {
  return <div className="setup-notice"><div className="notice-icon"><CircleHelp size={18} /></div><div><b>Database setup is needed</b><p>The site is ready, but the public list will appear after Supabase is connected and the first items are added in the admin panel.</p></div><a href="/admin">Open admin setup <ChevronRight size={14} /></a></div>
}

function ItemCard({ item, index, onClick }: { item: Item; index: number; onClick: () => void }) {
  const image = itemImage(item.image_path)
  return <button className="item-card" onClick={onClick} aria-label={`Open ${item.name} details`}>
    <div className="card-visual"><span className="card-index">{String(index).padStart(2, '0')}</span>{image ? <img src={image} alt="" loading="lazy" /> : <div className="image-placeholder"><BrandMark /><span>IMAGE PENDING</span></div>}<span className="view-details">Details <ChevronRight size={13} /></span></div>
    <div className="card-info"><div className="item-heading"><h3>{item.name}</h3><span className="item-value">{formatValue(item.value)}</span></div><div className="item-subline"><span>{item.category || 'Uncategorized'}</span>{item.rarity && <span className="rarity-chip">{item.rarity}</span>}</div></div>
  </button>
}

function EmptyItems({ search, onClear }: { search: string; onClear: () => void }) {
  return <div className="empty-state"><div className="empty-illustration"><Search size={23} /><span><BrandMark /></span></div><h3>{search ? 'No matches found' : 'The list is warming up'}</h3><p>{search ? `No items match “${search}”. Try a different name.` : 'Official item names and values will show here once the database has been filled in.'}</p>{search && <button className="secondary-button" onClick={onClear}>Clear filters</button>}{!search && <a className="empty-admin-link" href="/admin">Admin access <ChevronRight size={14} /></a>}</div>
}

function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (n: number) => void }) {
  return <div className="pagination"><span>Page {page} of {pageCount}</span><div><button disabled={page <= 1} aria-label="Previous page" onClick={() => onPage(page - 1)}><ChevronLeft size={17} /></button><button disabled={page >= pageCount} aria-label="Next page" onClick={() => onPage(page + 1)}><ChevronRight size={17} /></button></div></div>
}

function ItemModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const image = itemImage(item.image_path)
  useEffect(() => { const close = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="modal-close" onClick={onClose} aria-label="Close details"><X size={18} /></button><div className="detail-image">{image ? <img src={image} alt={item.name} /> : <div className="image-placeholder"><BrandMark /><span>IMAGE PENDING</span></div>}</div><div className="detail-content"><div className="eyebrow section-eyebrow">ITEM PROFILE</div><h2 id="detail-title">{item.name}</h2><div className="detail-value-label">CURRENT VALUE</div><div className="detail-value">{formatValue(item.value)}</div><div className="detail-tags">{item.category && <span>{item.category}</span>}{item.rarity && <span className="rarity-chip">{item.rarity}</span>}</div>{item.description && <p className="detail-description">{item.description}</p>}<p className="detail-disclaimer"><CircleHelp size={14} /> Community value only. This is not an official Roblox guarantee.</p><button className="primary-button full-button" onClick={onClose}>Done <Check size={15} /></button></div></section></div>
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
    <div className="trade-result"><div><span className="result-label">VALUE DIFFERENCE</span><strong className={diff === 0 ? '' : diff > 0 ? 'gain' : 'loss'}>{diff > 0 ? '+' : ''}{formatValue(diff)}</strong><small>{diff === 0 ? 'Even trade' : diff > 0 ? 'Their offer is higher' : 'Your offer is higher'}</small></div><div className="result-summary"><span>Their total <b>{formatValue(leftTotal)}</b></span><span>Your total <b>{formatValue(rightTotal)}</b></span></div><button className="secondary-button" onClick={() => { setLeft([]); setRight([]) }}>Clear trade</button></div>
    <p className="trade-disclaimer"><CircleHelp size={14} /> Calculator uses community-entered values and does not guarantee a fair or official Roblox trade.</p>
  </div>
}

function TradeSide({ title, tint, items, lines, value, onChange, onAdd, onUpdate }: { title: string; tint: 'blue' | 'lime'; items: Item[]; lines: TradeLine[]; value: string; onChange: (v: string) => void; onAdd: () => void; onUpdate: (id: string, quantity: number) => void }) {
  return <div className={`trade-side ${tint}`}><div className="side-header"><span>{title}</span><span>{formatValue(lines.reduce((s, l) => s + (items.find(i => i.id === l.id)?.value ?? 0) * l.quantity, 0))}</span></div><div className="add-item-row"><select value={value} onChange={e => onChange(e.target.value)} aria-label={`Select item for ${title.toLowerCase()}`}><option value="">Choose an item...</option>{items.map(i => <option key={i.id} value={i.id}>{i.name}{i.value === null ? ' · No value' : ` · ${formatValue(i.value)}`}</option>)}</select><button className="add-item-button" onClick={onAdd} disabled={!value} aria-label="Add selected item"><Plus size={17} /></button></div><div className="trade-lines">{lines.length ? lines.map(line => { const item = items.find(i => i.id === line.id); if (!item) return null; return <div className="trade-line" key={line.id}><div className="trade-line-image">{itemImage(item.image_path) && <img src={itemImage(item.image_path)!} alt="" />}</div><div className="trade-line-name"><b>{item.name}</b><span>{formatValue(item.value)} each</span></div><div className="quantity-control"><button onClick={() => onUpdate(line.id, line.quantity - 1)} aria-label="Decrease quantity"><Minus size={12} /></button><span>{line.quantity}</span><button onClick={() => onUpdate(line.id, line.quantity + 1)} aria-label="Increase quantity"><Plus size={12} /></button></div><b className="line-total">{formatValue((item.value ?? 0) * line.quantity)}</b></div> }) : <div className="trade-empty"><span><Plus size={16} /></span><b>Nothing added yet</b><small>Choose an item above to start</small></div>}</div></div>
}

function Admin() {
  const [session, setSession] = useState<{ email?: string } | null>(null)
  const [admin, setAdmin] = useState(false)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [notice, setNotice] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [form, setForm] = useState<FormState>(blankForm)
  const [editing, setEditing] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  const refresh = useCallback(async () => {
    if (!supabase) { setChecking(false); return }
    const { data: auth } = await supabase.auth.getSession()
    if (!auth.session) { setSession(null); setAdmin(false); setChecking(false); return }
    setSession(auth.session.user)
    const { data, error } = await supabase.rpc('is_turbo_admin')
    setAdmin(!error && data === true)
    if (!error && data === true) {
      const result = await supabase.from('items').select('*').order('name').range(0, 999)
      if (result.error) setNotice(`Could not load items: ${errorMessage(result.error)}`)
      else setItems((result.data ?? []) as Item[])
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
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setLoginError(errorMessage(error))
    else await refresh()
    setBusy(false)
  }
  async function signOut() { await supabase?.auth.signOut(); setSession(null); setAdmin(false); setItems([]) }
  function editItem(item: Item) {
    setEditing(item.id); setForm({ name: item.name, value: item.value === null ? '' : String(item.value), category: item.category ?? '', rarity: item.rarity ?? '', description: item.description ?? '', image_path: item.image_path ?? '' }); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function saveItem(e: FormEvent) {
    e.preventDefault(); if (!supabase) return
    const name = form.name.trim()
    const val = form.value.trim() === '' ? null : Number(form.value)
    if (!name) { setNotice('Enter an item name before saving.'); return }
    if (val !== null && (!Number.isSafeInteger(val) || val < 0)) { setNotice('Value must be a non-negative whole number.'); return }
    setBusy(true); setNotice('')
    const payload = { name, value: val, image_path: form.image_path || null, category: form.category.trim() || null, rarity: form.rarity.trim() || null, description: form.description.trim() || null }
    const result = editing ? await supabase.from('items').update(payload).eq('id', editing) : await supabase.from('items').insert(payload)
    if (result.error) setNotice(result.error.code === '23505' ? 'An item with that name already exists.' : errorMessage(result.error))
    else { setNotice(editing ? 'Item updated.' : 'Item added.'); setForm(blankForm); setEditing(null); await refresh() }
    setBusy(false)
  }
  async function deleteItem(item: Item) {
    if (!supabase || !window.confirm(`Delete “${item.name}”? This cannot be undone.`)) return
    setBusy(true)
    const { error } = await supabase.from('items').delete().eq('id', item.id)
    if (error) setNotice(errorMessage(error))
    else { setNotice(`${item.name} deleted.`); await refresh() }
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
  function exportCsv() {
    const rows = [['name','value','image_path','category','rarity','description','created_at','updated_at'], ...items.map(i => [i.name, i.value ?? '', i.image_path ?? '', i.category ?? '', i.rarity ?? '', i.description ?? '', i.created_at, i.updated_at])]
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'turbo-soccer-items.csv'; link.click(); URL.revokeObjectURL(link.href)
  }

  if (checking) return <AdminShell><div className="admin-loading"><div className="spinner" /> Checking secure admin access…</div></AdminShell>
  if (!configured) return <AdminShell><SetupPanel /></AdminShell>
  if (!session) return <AdminShell><div className="login-wrap"><div className="login-card"><div className="login-emblem"><LockKeyhole size={21} /></div><div className="eyebrow section-eyebrow">PRIVATE ADMIN</div><h1>Sign in to manage<br />the item list.</h1><p>Your admin access is restricted to an explicitly allowlisted account.</p><form onSubmit={signIn} className="admin-form"><label>Email address<input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label><label>Password<input required type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>{loginError && <div className="form-error" role="alert">{loginError}</div>}<button className="primary-button full-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ChevronRight size={16} /></button></form><a href="/" className="back-link"><ChevronLeft size={15} /> Back to public site</a></div><div className="login-foot"><ShieldCheck size={15} /> Protected by database-level access policies</div></div></AdminShell>
  if (!admin) return <AdminShell><div className="unauthorized"><div className="login-emblem danger"><ShieldCheck size={21} /></div><div className="eyebrow section-eyebrow">ACCESS RESTRICTED</div><h1>This account isn't<br />on the admin list.</h1><p>Your sign-in worked, but this account is not authorized to manage official items.</p><div className="unauthorized-actions"><button className="primary-button" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button><a href="/" className="secondary-button">Public site</a></div></div></AdminShell>

  const adminItems = items.filter(item => item.name.toLowerCase().includes(filter.toLowerCase()))
  const availableImages = [...new Set([...sourceImages, ...items.map(item => item.image_path).filter((path): path is string => Boolean(path))])]
  return <AdminShell><div className="admin-dashboard"><header className="admin-header"><div><div className="eyebrow section-eyebrow">TURBO SOCCER · CONTROL ROOM</div><h1>Item management</h1><p>Keep the community catalogue accurate and up to date.</p></div><div className="admin-user"><span className="admin-avatar">{(session.email ?? 'A').slice(0, 1).toUpperCase()}</span><div><b>{session.email}</b><small><span className="count-dot" /> Admin access</small></div><button className="icon-button" onClick={() => void signOut()} title="Sign out"><LogOut size={17} /></button></div></header>
    {notice && <div className={`admin-notice ${/could not|error|must|already|use a/i.test(notice) ? 'error' : ''}`} role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
    <div className="admin-layout"><section className="admin-panel editor-panel"><div className="panel-heading"><div><span className="panel-kicker">{editing ? 'EDIT ITEM' : 'NEW ITEM'}</span><h2>{editing ? 'Update details' : 'Add to the list'}</h2></div>{editing && <button className="text-button" onClick={() => { setEditing(null); setForm(blankForm) }}>Cancel edit</button>}</div>
      <form onSubmit={saveItem} className="admin-form"><label>Item name <span className="required-star">*</span><input maxLength={100} required placeholder="Enter the official name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><div className="form-two"><label>Value <small>whole number</small><input type="number" min="0" step="1" placeholder="Leave blank if unknown" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></label><label>Category <small>optional</small><input maxLength={60} placeholder="e.g. Ball" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></label></div><div className="form-two"><label>Rarity <small>optional</small><input maxLength={60} placeholder="e.g. Limited" value={form.rarity} onChange={e => setForm({ ...form, rarity: e.target.value })} /></label><label>Image <small>optional</small><span className="image-status">{form.image_path ? 'Image selected' : 'No image selected'}</span></label></div>
      <div className="image-picker"><div className="picker-heading"><span>Choose an existing image</span><span>{availableImages.length} available</span></div><div className="image-options">{availableImages.map(src => <button key={src} type="button" title={src.split('/').pop()} className={form.image_path === src ? 'image-option selected' : 'image-option'} onClick={() => setForm({ ...form, image_path: form.image_path === src ? '' : src })}><img src={itemImage(src)!} alt={src.split('/').pop()} loading="lazy" />{form.image_path === src && <span><Check size={15} /></span>}</button>)}</div><label className="upload-button"><Upload size={14} /> {uploading ? 'Uploading…' : 'Upload image'}<input type="file" accept="image/webp,image/png,image/jpeg,image/gif" disabled={uploading} onChange={e => { void uploadImage(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} /></label></div>
      <label>Description <small>optional</small><textarea maxLength={2000} rows={3} placeholder="Add item details" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <div className="preview-box"><span className="preview-label">PUBLIC LIST PREVIEW</span><div className="preview-item"><div className="preview-image">{itemImage(form.image_path) ? <img src={itemImage(form.image_path)!} alt="" /> : <ImagePlus size={18} />}</div><div><b>{form.name || 'Item name'}</b><small>{form.category || 'Category'}{form.rarity ? ` · ${form.rarity}` : ''}</small></div><strong>{form.value ? formatValue(Number(form.value)) : '—'}</strong></div></div>
      <button className="primary-button full-button" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add item'} <Check size={16} /></button></form></section>
    <section className="admin-panel catalogue-panel"><div className="panel-heading"><div><span className="panel-kicker">LIVE CATALOGUE</span><h2>Current items <span className="catalogue-total">{items.length}</span></h2></div><button className="export-button" onClick={exportCsv} disabled={!items.length}>Export CSV</button></div><label className="search-box admin-search"><Search size={16} /><input placeholder="Find an item..." value={filter} onChange={e => setFilter(e.target.value)} /></label><div className="catalogue-list">{adminItems.length ? adminItems.map(item => <div className="catalogue-row" key={item.id}><div className="catalogue-thumb">{itemImage(item.image_path) && <img src={itemImage(item.image_path)!} alt="" />}</div><div className="catalogue-name"><b>{item.name}</b><small>{item.category || 'No category'}{item.rarity ? ` · ${item.rarity}` : ''}</small></div><strong className="catalogue-value">{formatValue(item.value)}</strong><button className="row-action" onClick={() => editItem(item)} aria-label={`Edit ${item.name}`}>Edit</button><button className="row-delete" onClick={() => void deleteItem(item)} aria-label={`Delete ${item.name}`}><Trash2 size={15} /></button></div>) : <div className="catalogue-empty"><BrandMark /><b>{filter ? 'No items match' : 'No items added yet'}</b><span>{filter ? 'Try another search.' : 'Add your first item to start the catalogue.'}</span></div>}</div><div className="catalogue-footer"><span><span className="count-dot" /> Changes publish automatically</span><a href="/">View public site <ExternalLink size={13} /></a></div></section></div>
    <div className="admin-security-note"><ShieldCheck size={16} /><span>Writes are enforced by Supabase Row Level Security. Only accounts listed in the private admin allowlist can change catalogue data.</span></div>
  </div></AdminShell>
}

function AdminShell({ children }: { children: React.ReactNode }) { return <div className="admin-shell"><header className="topbar admin-topbar"><a className="brand" href="/"><BrandMark /><span>turbo<span className="brand-light">soccer</span><small>VALUES HUB</small></span></a><a className="admin-back" href="/"><ChevronLeft size={15} /> Public site</a></header>{children}</div> }

function SetupPanel() {
  return <div className="setup-panel"><div className="login-emblem"><LockKeyhole size={21} /></div><div className="eyebrow section-eyebrow">ONE-TIME CONNECTION</div><h1>Connect your<br />database first.</h1><p>The admin panel and public values list use Supabase. Connect the project in <code>.env</code> before signing in.</p><ol><li>Create a free Supabase project.</li><li>Run the SQL migration in <code>supabase/migrations</code>.</li><li>Set the Supabase URL and public anon key in <code>.env</code>.</li><li>Create your admin account and add its user ID to the private allowlist.</li></ol><a className="secondary-button" href="/">Back to public site <ChevronRight size={15} /></a></div>
}

function formatValue(value: number | null) { return value === null || value === undefined ? '—' : `${new Intl.NumberFormat('en-US').format(value)} pts` }

export default App


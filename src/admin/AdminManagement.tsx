import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, RefreshCw, Shield, UserPlus, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Profile = { role: 'OWNER' | 'ADMIN'; username: string | null; display_name: string; title: string; title_color: string }
type Account = { user_id: string; username: string | null; display_name: string; role: string; title: string; title_color: string; status: string; must_change_password: boolean; last_seen: string | null; online: boolean }
type Presence = { visitorCount: number; adminCount: number; ownerOnline: boolean; admins: Array<{ userId: string; username: string; displayName: string; title: string; titleColor: string; lastSeen: string }> }
type Audit = { id: number; actor_user_id: string | null; target_user_id: string | null; action: string; details: Record<string, unknown>; created_at: string }
const colors = ['#b4f34b', '#ffd166', '#ff6b6b', '#7bdff2', '#c77dff', '#ffffff']

async function ownerRequest(action: string, extras: Record<string, unknown> = {}) {
  const { data } = await supabase!.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Your session expired. Sign in again.')
  const response = await fetch('/api/admin/manage', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...extras }) })
  const result = await response.json() as Record<string, unknown>
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'The request failed.')
  return result
}

export function AdminSelfSettings({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [username, setUsername] = useState(profile.username ?? '')
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [title, setTitle] = useState(profile.title)
  const [titleColor, setTitleColor] = useState(profile.title_color)
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [accessExpiry, setAccessExpiry] = useState<number | null>(null)

  useEffect(() => { setUsername(profile.username ?? ''); setDisplayName(profile.display_name); setTitle(profile.title); setTitleColor(profile.title_color) }, [profile])
  useEffect(() => { void supabase?.auth.getSession().then(({ data }) => setAccessExpiry(data.session?.expires_at ?? null)) }, [profile])
  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    if (profile.role !== 'OWNER' && title.trim().toUpperCase().includes('OWNER')) {
      setMessage('Titles containing OWNER are reserved for the account role. Choose another title.')
      return
    }
    setBusy(true); setMessage('')
    const { error } = await supabase.rpc('set_my_turbo_admin_profile', { p_username: username, p_display_name: displayName, p_title: title, p_title_color: titleColor })
    setMessage(error ? 'Profile could not be saved. Check the fields and try again.' : 'Profile saved.')
    if (!error) onSaved()
    setBusy(false)
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault()
    if (!supabase || newPassword.length < 8) { setMessage('Use a password with at least 8 characters.'); return }
    setBusy(true); setMessage('')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setMessage(error ? 'Password could not be changed.' : 'Password changed. Sign in again to refresh your secure session.')
    if (!error) { setNewPassword(''); await supabase.auth.signOut() }
    setBusy(false)
  }
  return <section className="admin-panel self-settings"><div className="panel-heading"><div><span className="panel-kicker">ACCOUNT SETTINGS</span><h2>Your admin identity</h2></div></div><form className="admin-form profile-form" onSubmit={saveProfile}><div className="profile-grid"><label>Username<input required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" value={username} onChange={e => setUsername(e.target.value)} /></label><label>Public display name<input required maxLength={40} value={displayName} onChange={e => setDisplayName(e.target.value)} /></label><label>Title<input required maxLength={32} value={title} onChange={e => setTitle(e.target.value)} /></label><div className="title-color-picker"><span>Title color</span><div>{colors.map(color => <button type="button" key={color} aria-label={`Choose ${color}`} aria-pressed={titleColor === color} style={{ background: color }} onClick={() => setTitleColor(color)} />)}</div></div></div><button className="secondary-button" disabled={busy}>Save profile</button></form><form className="admin-form password-form" onSubmit={changePassword}><label>Change password<input type="password" minLength={8} autoComplete="new-password" placeholder="At least 8 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label><button className="secondary-button" disabled={busy || newPassword.length < 8}>Update password</button></form><p className="admin-submessage">Current access token expiry: {accessExpiry ? new Date(accessExpiry * 1000).toLocaleString() : 'Unavailable'} · refresh is handled by Supabase Auth.</p>{message && <p className="admin-submessage" role="status">{message}</p>}</section>
}

export function AdminManagement() {
  const [tab, setTab] = useState<'accounts' | 'presence' | 'audit'>('accounts')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [presence, setPresence] = useState<Presence | null>(null)
  const [audit, setAudit] = useState<Audit[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [oneTimePassword, setOneTimePassword] = useState('')
  const [copied, setCopied] = useState(false)
  const [newAdmin, setNewAdmin] = useState({ username: '', displayName: '', title: 'Admin', titleColor: '#b4f34b' })
  const [editing, setEditing] = useState<Account | null>(null)

  const loadAccounts = useCallback(async () => {
    const result = await ownerRequest('list')
    setAccounts(Array.isArray(result.accounts) ? result.accounts as Account[] : [])
  }, [])
  const loadPresence = useCallback(async () => {
    const result = await ownerRequest('presence')
    setPresence(result.presence as Presence)
  }, [])
  const loadAudit = useCallback(async () => {
    const result = await ownerRequest('audit')
    setAudit(Array.isArray(result.entries) ? result.entries as Audit[] : [])
  }, [])

  useEffect(() => { void loadAccounts().catch(error => setMessage(error.message)) }, [loadAccounts])
  useEffect(() => {
    if (tab !== 'presence') return
    void loadPresence().catch(error => setMessage(error.message))
    const timer = window.setInterval(() => { void loadPresence().catch(() => undefined) }, 20000)
    return () => window.clearInterval(timer)
  }, [tab, loadPresence])
  useEffect(() => { if (tab === 'audit') void loadAudit().catch(error => setMessage(error.message)) }, [tab, loadAudit])

  async function runAction(action: string, data: Record<string, unknown> = {}) {
    setBusy(true); setMessage('')
    try { return await ownerRequest(action, data) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The request failed.'); return null }
    finally { setBusy(false) }
  }
  async function create(e: FormEvent) {
    e.preventDefault()
    setOneTimePassword('')
    const result = await runAction('create', newAdmin)
    if (!result) return
    setOneTimePassword(String(result.temporaryPassword ?? ''))
    setNewAdmin({ username: '', displayName: '', title: 'Admin', titleColor: '#b4f34b' })
    await loadAccounts()
  }
  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const ok = await runAction('update', { userId: editing.user_id, username: editing.username, displayName: editing.display_name, title: editing.title, titleColor: editing.title_color, status: editing.status })
    if (ok) { setEditing(null); await loadAccounts() }
  }
  async function reset(account: Account) {
    if (!window.confirm(`Reset the password for ${account.username}? They must change it at their next sign-in.`)) return
    setOneTimePassword('')
    const result = await runAction('reset-password', { userId: account.user_id })
    if (result) setOneTimePassword(String(result.temporaryPassword ?? ''))
  }
  async function toggleStatus(account: Account) {
    const updated = { ...account, status: account.status === 'active' ? 'suspended' : 'active' }
    if (await runAction('update', { userId: updated.user_id, username: updated.username, displayName: updated.display_name, title: updated.title, titleColor: updated.title_color, status: updated.status })) await loadAccounts()
  }
  async function revokeSessions(account: Account) {
    if (!window.confirm(`Revoke every active session for ${account.username}? They will need to sign in again.`)) return
    if (await runAction('revoke-sessions', { userId: account.user_id })) await loadAccounts()
  }
  async function copyPassword() {
    if (!oneTimePassword) return
    await navigator.clipboard.writeText(oneTimePassword)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return <section className="admin-panel owner-management"><div className="panel-heading"><div><span className="panel-kicker">OWNER CONTROL ROOM</span><h2>Admin management</h2></div><button className="secondary-button compact-refresh" disabled={busy} onClick={() => { void loadAccounts(); if (tab === 'presence') void loadPresence() }}><RefreshCw size={15} /> Refresh</button></div>
    <div className="owner-tabs"><button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}><Users size={15} /> Accounts</button><button className={tab === 'presence' ? 'active' : ''} onClick={() => setTab('presence')}><span className="online-dot" /> Online</button><button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}><Shield size={15} /> Audit log</button></div>
    {message && <p className="admin-submessage" role="status">{message}</p>}
    {oneTimePassword && <div className="temporary-password"><div><b>Temporary password — shown once</b><code>{oneTimePassword}</code><small>Give this to the admin securely. It is not saved in this page after you dismiss it.</small></div><button className="secondary-button" onClick={() => void copyPassword()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button><button className="icon-button" aria-label="Dismiss temporary password" onClick={() => setOneTimePassword('')}>×</button></div>}
    {tab === 'accounts' && <><form className="admin-form create-admin-form" onSubmit={create}><h3><UserPlus size={17} /> Create regular admin</h3><label>Username<input required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" value={newAdmin.username} onChange={e => setNewAdmin({ ...newAdmin, username: e.target.value })} /></label><label>Display name<input required maxLength={40} value={newAdmin.displayName} onChange={e => setNewAdmin({ ...newAdmin, displayName: e.target.value })} /></label><label>Title<input required maxLength={32} value={newAdmin.title} onChange={e => setNewAdmin({ ...newAdmin, title: e.target.value })} /></label><div className="title-color-picker"><span>Title color</span><div>{colors.map(color => <button type="button" key={color} aria-label={`Choose ${color}`} aria-pressed={newAdmin.titleColor === color} style={{ background: color }} onClick={() => setNewAdmin({ ...newAdmin, titleColor: color })} />)}</div></div><button className="primary-button" disabled={busy}><UserPlus size={15} /> Create account</button></form><div className="owner-account-list">{accounts.length ? accounts.map(account => <div className="owner-account-row" key={account.user_id}><span className="admin-avatar">{account.display_name.slice(0,1).toUpperCase()}</span><div className="owner-account-name"><b>{account.display_name}</b><small>@{account.username ?? 'owner'} · {account.title} · <span className={account.online ? 'online-text' : 'offline-text'}>{account.online ? 'Online' : 'Offline'}</span> · Last seen {account.last_seen ? new Date(account.last_seen).toLocaleString() : 'never'}</small></div><span className={`account-status ${account.status}`}>{account.status}</span>{account.must_change_password && <span className="must-change-chip">Change password required</span>}{account.role === 'OWNER' ? <span className="owner-badge">OWNER</span> : <div className="account-actions"><button className="row-action" onClick={() => setEditing({ ...account })}>Edit</button><button className="row-action" disabled={busy} onClick={() => void reset(account)}>Reset password</button><button className="row-action" disabled={busy} onClick={() => void toggleStatus(account)}>{account.status === 'active' ? 'Suspend' : 'Reactivate'}</button><button className="row-action" disabled={busy} onClick={() => void revokeSessions(account)}>Revoke sessions</button></div>}</div>) : <p className="admin-submessage">No regular admin accounts exist yet.</p>}</div></>}
    {tab === 'presence' && <div className="presence-overview"><div className="presence-stat"><strong>{presence?.visitorCount ?? '—'}</strong><span>Visitors online</span></div><div className="presence-stat"><strong>{presence?.adminCount ?? '—'}</strong><span>Admins online</span></div><div className="presence-stat"><strong>{presence?.ownerOnline ? 'Online' : 'Offline'}</strong><span>Owner status</span></div><div className="online-admin-list"><h3>Online admins</h3>{presence?.admins.length ? presence.admins.map(person => <div className="online-admin-row" key={person.userId}><i /><b>{person.displayName}</b><span>@{person.username}</span><small>{person.title}</small></div>) : <p>No regular admins are online.</p>}<small>Presence expires after 90 seconds without a heartbeat.</small></div></div>}
    {tab === 'audit' && <div className="audit-list">{audit.length ? audit.map(entry => <div className="audit-row" key={entry.id}><b>{entry.action.replaceAll('.', ' ')}</b><span>{String(entry.details.name ?? entry.details.username ?? '')}</span><time>{new Date(entry.created_at).toLocaleString()}</time></div>) : <p>No audit entries yet.</p>}</div>}
    {editing && <div className="account-edit-overlay"><form className="account-edit-card admin-form" onSubmit={saveEdit}><div className="panel-heading"><h3>Edit @{editing.username}</h3><button type="button" className="icon-button" aria-label="Close" onClick={() => setEditing(null)}>×</button></div><label>Username<input required minLength={3} maxLength={24} value={editing.username ?? ''} onChange={e => setEditing({ ...editing, username: e.target.value })} /></label><label>Display name<input required maxLength={40} value={editing.display_name} onChange={e => setEditing({ ...editing, display_name: e.target.value })} /></label><label>Title<input required maxLength={32} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} /></label><div className="title-color-picker"><span>Title color</span><div>{colors.map(color => <button type="button" key={color} aria-label={`Choose ${color}`} aria-pressed={editing.title_color === color} style={{ background: color }} onClick={() => setEditing({ ...editing, title_color: color })} />)}</div></div><button className="primary-button" disabled={busy}>Save changes</button></form></div>}
  </section>
}

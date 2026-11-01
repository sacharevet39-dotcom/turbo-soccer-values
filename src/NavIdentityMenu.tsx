import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Provider, UserIdentity } from '@supabase/supabase-js'
import { BadgeCheck, ChevronDown, ExternalLink, LogOut, ShieldCheck, Unlink, UserRound, X } from 'lucide-react'
import './identity-menu.css'
import { errorMessage, supabase, tradeAuth } from './lib/supabase'

type RobloxProfile = { roblox_user_id: string; roblox_username: string; roblox_display_name: string; roblox_profile_url: string; roblox_avatar_url: string | null }
type AdminProfile = { role: string; display_name: string; title: string; status: string; must_change_password?: boolean }
const providers: Array<{ id: Provider; name: string; icon: 'roblox' | 'discord'; scopes: string }> = [
  { id: 'custom:roblox', name: 'Roblox', icon: 'roblox', scopes: 'openid profile' },
  { id: 'discord', name: 'Discord', icon: 'discord', scopes: 'identify' },
]
const ROBLOX_PRODUCTION_CALLBACK = 'https://turbo-soccer-values.pages.dev/?tab=trades&roblox_auth=complete'
const EMAIL_PRODUCTION_CALLBACK = 'https://turbo-soccer-values.pages.dev/'

function hasOAuthVerifier(client: 'admin' | 'trade') {
  try {
    const projectRef = new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname.split('.')[0]
    const storageKey = client === 'admin' ? `sb-${projectRef}-auth-token` : 'tvs-trade-auth'
    const prefix = `${storageKey}-flow-`
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index)
        if (key?.startsWith(prefix) && key.endsWith('-code-verifier') && storage.getItem(key)) return true
      }
    }
  } catch { /* Storage may be disabled; keep the explicit flow marker as a fallback. */ }
  return false
}

function identityConnectionError(provider: string, error: unknown) {
  const message = errorMessage(error)
  if (/manual.{0,24}link|link.{0,24}disabled/i.test(message)) return 'Supabase has manual account linking disabled. Enable identity linking in Authentication settings, then try again.'
  if (/identity.{0,32}(already|exists|linked)|already.{0,32}(identity|linked)/i.test(message)) return `This ${provider} account is linked to another Turbo Soccer login. Sign in to that account, connect a second login method, disconnect ${provider}, then link it here.`
  return message
}

function ProviderLogo({ type }: { type: 'roblox' | 'discord' }) {
  return type === 'roblox'
    ? <svg viewBox="0 0 24 24" aria-hidden="true" className="identity-logo roblox-logo"><path d="M5.1 2.8 21.2 7.1a1.2 1.2 0 0 1 .85 1.47l-4.3 16.1a1.2 1.2 0 0 1-1.47.85L.2 21.2a1.2 1.2 0 0 1-.85-1.47l4.3-16.1A1.2 1.2 0 0 1 5.1 2.8Zm4.35 7.05-1.8 6.73 6.73 1.8 1.8-6.73-6.73-1.8Z" transform="translate(1 -2) scale(.92)" /></svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true" className="identity-logo discord-logo"><path d="M19.7 5.1a18.2 18.2 0 0 0-4.5-1.4l-.6 1.3a16.8 16.8 0 0 0-5.2 0l-.6-1.3a18.3 18.3 0 0 0-4.5 1.4C1.5 9.2.7 13.2 1.1 17.2a18.4 18.4 0 0 0 5.5 2.8l1.2-2a11.8 11.8 0 0 1-1.9-.9l.5-.4a13 13 0 0 0 11.2 0l.5.4a12 12 0 0 1-1.9.9l1.2 2a18.3 18.3 0 0 0 5.5-2.8c.5-4.6-.8-8.5-3.2-12.1ZM8.8 14.9c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" /></svg>
}

export function NavIdentityMenu() {
  const [open, setOpen] = useState(false)
  const [identities, setIdentities] = useState<UserIdentity[]>([])
  const [profile, setProfile] = useState<RobloxProfile | null>(null)
  const [admin, setAdmin] = useState<AdminProfile | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [activeIsAdmin, setActiveIsAdmin] = useState(false)
  const [emailFormOpen, setEmailFormOpen] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('')

  async function refresh() {
    if (!supabase || !tradeAuth) return
    const { data: mainSession } = await supabase.auth.getSession()
    let adminProfile: AdminProfile | null = null
    if (mainSession.session) {
      const { data } = await supabase.rpc('my_turbo_admin_profile')
      const row = Array.isArray(data) ? data[0] : data
      if (row?.status === 'active' && !row.must_change_password) adminProfile = row as AdminProfile
    }
    setAdmin(adminProfile)
    const client = adminProfile ? supabase : tradeAuth
    setActiveIsAdmin(Boolean(adminProfile))
    const { data: session } = await client.auth.getSession()
    setSessionId(session.session?.user.id ?? null)
    if (!session.session) { setIdentities([]); setProfile(null); return }
    const { data: identityData } = await client.auth.getUserIdentities()
    const linked = identityData?.identities ?? []
    setIdentities(linked)
    if (linked.some(identity => identity.provider === 'custom:roblox')) {
      const { data, error } = await client.rpc('sync_my_roblox_trade_profile')
      if (!error) {
        setProfile(data as RobloxProfile | null)
        window.dispatchEvent(new Event('tvs:admin-profile-updated'))
      }
    } else setProfile(null)
  }

  useEffect(() => {
    let active = true
    const finishOAuth = async () => {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
      let emailClient: 'admin' | 'trade' | null = null
      try {
        const marker = sessionStorage.getItem('tvs-email-identity-client') || localStorage.getItem('tvs-email-identity-client')
        if (marker === 'admin' || marker === 'trade') emailClient = marker
      } catch { /* Keep account recovery bound to the browser that started it. */ }
      const emailType = url.searchParams.get('type') || hashParams.get('type')
      const emailReturn = Boolean(emailClient && (url.searchParams.get('email_auth') === 'complete' || emailType === 'email_change' || (code && url.searchParams.has('flow_id')) || url.searchParams.has('token_hash') || hashParams.has('access_token') || url.searchParams.has('error')))
      if (emailReturn && emailClient) {
        const client = emailClient === 'admin' ? supabase : tradeAuth
        const accessToken = url.searchParams.get('access_token') || hashParams.get('access_token')
        const refreshToken = url.searchParams.get('refresh_token') || hashParams.get('refresh_token')
        const tokenHash = url.searchParams.get('token_hash') || hashParams.get('token_hash')
        const flowId = url.searchParams.get('flow_id')
        const callbackError = url.searchParams.get('error_description') || url.searchParams.get('error')
        let emailError: string | null = callbackError ? callbackError.slice(0, 180) : null
        if (!emailError) {
          if (!client) emailError = 'The account session could not be opened. Restart this from the same browser.'
          else if (accessToken && refreshToken) {
            const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
            emailError = error?.message ?? null
          } else if (tokenHash && emailType === 'email_change') {
            const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'email_change' })
            emailError = error?.message ?? null
          } else if (code && hasOAuthVerifier(emailClient)) {
            const { error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
            emailError = error?.message ?? null
          } else emailError = 'Email confirmation could not be completed. Open its link in the same browser window where you started it.'
        }

        if (emailError) setNotice(`Email confirmation failed: ${emailError}`)
        else if (client) {
          const { data, error } = await client.auth.getUserIdentities()
          if (error || !data?.identities.some(identity => identity.provider === 'email')) setNotice('Email confirmed, but the email login is not visible yet. Refresh this page and check your inbox again.')
          else setNotice('Email login added. You can now disconnect Roblox from this account.')
        }
        try { sessionStorage.removeItem('tvs-email-identity-client'); localStorage.removeItem('tvs-email-identity-client') } catch { /* ignore storage cleanup failures */ }
        for (const key of ['email_auth', 'token_hash', 'type', 'access_token', 'refresh_token']) url.searchParams.delete(key)
        url.hash = ''
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`)
      }
      let oauthClient: 'admin' | 'trade' | null = null
      let oauthProvider: string | null = null
      try {
        const marker = sessionStorage.getItem('tvs-oauth-client') || localStorage.getItem('tvs-oauth-client')
        if (marker === 'admin' || marker === 'trade') oauthClient = marker
        oauthProvider = sessionStorage.getItem('tvs-oauth-provider') || localStorage.getItem('tvs-oauth-provider')
      } catch { /* The PKCE slot below can identify the initiating client. */ }
      const adminVerifier = hasOAuthVerifier('admin')
      const tradeVerifier = hasOAuthVerifier('trade')
      if (adminVerifier !== tradeVerifier) oauthClient = adminVerifier ? 'admin' : 'trade'
      const isAdminReturn = oauthClient === 'admin' || url.searchParams.get('admin_identity') === 'complete'
      const isTradeReturn = oauthClient === 'trade' || url.searchParams.get('trade_auth') === 'complete' || url.searchParams.get('roblox_auth') === 'complete'
      const providerError = url.searchParams.get('error_description') || url.searchParams.get('error') || url.searchParams.get('error_code')
      if (providerError && !emailReturn) setNotice(`Connection failed: ${providerError.slice(0, 180)}`)
      if (code && !emailReturn && (isAdminReturn || isTradeReturn)) {
        const client = isAdminReturn ? supabase : tradeAuth
        const flowId = url.searchParams.get('flow_id')
        const hasVerifier = oauthClient ? hasOAuthVerifier(oauthClient) : false
        if (!client || !oauthClient || !hasVerifier) {
          setNotice(isAdminReturn ? 'Roblox returned to the admin profile, but its sign-in check was missing. Please restart Connect Roblox from this browser tab.' : 'Roblox returned, but the sign-in check was missing. Please restart Connect Roblox from this browser tab.')
        } else {
          const { error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
          if (error) setNotice(`Could not finish account connection: ${errorMessage(error)}`)
          else {
            const { data: identityData, error: identityError } = await client.auth.getUserIdentities()
            const expectedProvider = oauthProvider || (url.searchParams.get('roblox_auth') === 'complete' ? 'custom:roblox' : null)
            if (identityError || (expectedProvider && !identityData?.identities.some(identity => identity.provider === expectedProvider))) {
              setNotice(expectedProvider === 'custom:roblox' ? 'Roblox authorization finished, but the account was not linked. Check that Roblox is not already linked to another Turbo Soccer account, then try again.' : 'Authorization finished, but the account was not linked. Try again from the connected accounts menu.')
            } else setNotice(expectedProvider === 'custom:roblox' && isAdminReturn ? 'Roblox account linked to the admin profile.' : 'Account connected successfully.')
          }
        }
      }
      if (code || isAdminReturn || isTradeReturn || providerError || url.hash) {
        try { sessionStorage.removeItem('tvs-oauth-client'); localStorage.removeItem('tvs-oauth-client'); sessionStorage.removeItem('tvs-oauth-provider'); localStorage.removeItem('tvs-oauth-provider') } catch { /* session storage may be disabled */ }
        for (const key of ['code', 'flow_id', 'sb_flow_id', 'admin_identity', 'trade_auth', 'roblox_auth', 'error', 'error_description', 'error_code']) url.searchParams.delete(key)
        url.hash = ''
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`)
      }
      if (active) await refresh()
    }
    void finishOAuth()
    const unsubscribers = [supabase?.auth.onAuthStateChange(() => window.setTimeout(() => { if (active) void refresh() }, 0)).data.subscription, tradeAuth?.auth.onAuthStateChange(() => window.setTimeout(() => { if (active) void refresh() }, 0)).data.subscription].filter(Boolean)
    return () => { active = false; unsubscribers.forEach(subscription => subscription?.unsubscribe()) }
  }, [])

  const linked = useMemo(() => new Set(identities.map(identity => identity.provider)), [identities])
  async function connect(provider: typeof providers[number]) {
    if (!supabase || !tradeAuth || busy) return
    const client = activeIsAdmin ? supabase : tradeAuth
    const isLinked = linked.has(provider.id)
    if (isLinked) { setNotice(`${provider.name} is already connected.`); return }
    setBusy(provider.id); setNotice('')
    // Keep Supabase's redirect target on the single production URL allowlisted
    // in Auth settings; the initiating client is remembered per browser tab.
    const callback = provider.id === 'custom:roblox' ? ROBLOX_PRODUCTION_CALLBACK : `${window.location.origin}/`
    let markerStored = false
    try { sessionStorage.setItem('tvs-oauth-client', activeIsAdmin ? 'admin' : 'trade'); sessionStorage.setItem('tvs-oauth-provider', provider.id); markerStored = true } catch { /* Local storage or PKCE persistence may still be available. */ }
    try { localStorage.setItem('tvs-oauth-client', activeIsAdmin ? 'admin' : 'trade'); localStorage.setItem('tvs-oauth-provider', provider.id); markerStored = true } catch { /* The session marker may still be available. */ }
    if (!markerStored) {
      setNotice('Your browser blocked site storage. Allow storage for this site, then try connecting again.')
      setBusy(null)
      return
    }
    const options = { redirectTo: callback, scopes: provider.scopes }
    try {
      const result = sessionId
        ? await client.auth.linkIdentity({ provider: provider.id, options })
        : await client.auth.signInWithOAuth({ provider: provider.id, options })
      if (result.error) {
        try { sessionStorage.removeItem('tvs-oauth-client'); localStorage.removeItem('tvs-oauth-client'); sessionStorage.removeItem('tvs-oauth-provider'); localStorage.removeItem('tvs-oauth-provider') } catch { /* ignore storage cleanup failures */ }
        setNotice(identityConnectionError(provider.name, result.error))
      } else if (result.data?.url) window.location.assign(result.data.url)
      else setNotice(`Could not start ${provider.name} authorization. Please try again.`)
    } catch (error) {
      try { sessionStorage.removeItem('tvs-oauth-client'); localStorage.removeItem('tvs-oauth-client'); sessionStorage.removeItem('tvs-oauth-provider'); localStorage.removeItem('tvs-oauth-provider') } catch { /* ignore storage cleanup failures */ }
      setNotice(`Could not start ${provider.name} authorization: ${identityConnectionError(provider.name, error)}`)
    } finally { setBusy(null) }
  }

  async function disconnect(provider: typeof providers[number]) {
    if (!supabase || !tradeAuth || busy) return
    const client = activeIsAdmin ? supabase : tradeAuth
    const identity = identities.find(candidate => candidate.provider === provider.id)
    if (!identity) { setNotice(`${provider.name} is not connected to this account.`); return }
    if (identities.length < 2) {
      setNotice(`Connect another sign-in method to this account before disconnecting ${provider.name}.`)
      return
    }
    if (!window.confirm(`Disconnect ${provider.name} from this Turbo Soccer account? You can then connect it to a different account.`)) return
    setBusy(`unlink:${provider.id}`)
    setNotice('')
    try {
      const { error } = await client.auth.unlinkIdentity(identity)
      if (error) setNotice(`Could not disconnect ${provider.name}: ${identityConnectionError(provider.name, error)}`)
      else {
        const { error: profileCleanupError } = provider.id === 'custom:roblox'
          ? await client.rpc('sync_my_roblox_trade_profile')
          : { error: null }
        setNotice(profileCleanupError
          ? `${provider.name} disconnected, but the public profile could not be refreshed. Contact an admin before linking it elsewhere.`
          : `${provider.name} disconnected. You can now link it to the other Turbo Soccer account.`)
        await refresh()
        window.dispatchEvent(new Event('tvs:admin-profile-updated'))
      }
    } catch (error) {
      setNotice(`Could not disconnect ${provider.name}: ${identityConnectionError(provider.name, error)}`)
    } finally { setBusy(null) }
  }

  async function addEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !tradeAuth || busy) return
    if (recoveryPassword.length < 8) { setNotice('Use a password with at least 8 characters.'); return }
    if (recoveryPassword !== recoveryPasswordConfirm) { setNotice('The passwords do not match.'); return }
    const client = activeIsAdmin ? supabase : tradeAuth
    const clientName = activeIsAdmin ? 'admin' : 'trade'
    try {
      sessionStorage.setItem('tvs-email-identity-client', clientName)
      localStorage.setItem('tvs-email-identity-client', clientName)
    } catch {
      try { sessionStorage.removeItem('tvs-email-identity-client'); localStorage.removeItem('tvs-email-identity-client') } catch { /* ignore storage cleanup failures */ }
      setNotice('Your browser blocked site storage. Allow storage for this site, then try again.')
      return
    }
    setBusy('email')
    setNotice('')
    try {
      const { error } = await client.auth.updateUser(
        { email: recoveryEmail.trim(), password: recoveryPassword },
        { emailRedirectTo: EMAIL_PRODUCTION_CALLBACK },
      )
      if (error) {
        try { sessionStorage.removeItem('tvs-email-identity-client'); localStorage.removeItem('tvs-email-identity-client') } catch { /* ignore storage cleanup failures */ }
        setNotice(`Could not add email login: ${errorMessage(error)}`)
      } else {
        setEmailFormOpen(false)
        setRecoveryPassword('')
        setRecoveryPasswordConfirm('')
        setNotice('Confirmation sent. Open the email link in this same browser. Then you can disconnect Roblox here.')
      }
    } catch (error) {
      try { sessionStorage.removeItem('tvs-email-identity-client'); localStorage.removeItem('tvs-email-identity-client') } catch { /* ignore storage cleanup failures */ }
      setNotice(`Could not add email login: ${errorMessage(error)}`)
    } finally { setBusy(null) }
  }

  async function signOut() {
    const client = activeIsAdmin ? supabase : tradeAuth
    if (!client) return
    const { error } = await client.auth.signOut()
    if (error) setNotice(errorMessage(error))
    else { setOpen(false); setNotice('Account disconnected.'); setIdentities([]); setProfile(null); setSessionId(null); setAdmin(null) }
  }

  async function revokeSessions() {
    const client = activeIsAdmin ? supabase : tradeAuth
    if (!client || !window.confirm('Sign out this Turbo Soccer account on all devices?')) return
    const { error } = await client.auth.signOut({ scope: 'global' })
    if (error) setNotice(`Could not revoke sessions: ${errorMessage(error)}`)
    else { setOpen(false); setIdentities([]); setProfile(null); setSessionId(null); setAdmin(null); setNotice('All refresh sessions for this account were revoked.') }
  }

  const identityName = identities[0]?.identity_data?.preferred_username || identities[0]?.identity_data?.username || identities[0]?.identity_data?.global_name
  const displayName = profile?.roblox_display_name || profile?.roblox_username || admin?.display_name || identityName
  return <div className="nav-identity" onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}>
    {profile ? <button type="button" className={`nav-profile-trigger${admin ? ' admin' : ''}`} aria-expanded={open} onClick={() => setOpen(value => !value)}><span className="nav-profile-avatar"><img src={profile.roblox_avatar_url || `https://www.roblox.com/headshot-thumbnail/image?userId=${encodeURIComponent(profile.roblox_user_id)}&width=150&height=150&format=png`} alt="" /></span><span className="nav-profile-label"><b>{profile.roblox_display_name}</b><small>@{profile.roblox_username}</small></span><ChevronDown size={14} /></button> : admin ? <button type="button" className="nav-profile-trigger admin" aria-expanded={open} onClick={() => setOpen(value => !value)}><span className="nav-profile-avatar admin-avatar"><ShieldCheck size={16} /></span><span className="nav-profile-label"><b>{admin.display_name}</b><small>{admin.role === 'OWNER' ? 'Site owner' : 'Admin'}</small></span><ChevronDown size={14} /></button> : sessionId ? <button type="button" className="nav-profile-trigger" aria-expanded={open} onClick={() => setOpen(value => !value)}><span className="nav-profile-avatar"><UserRound size={17} /></span><span className="nav-profile-label"><b>{displayName || 'Connected account'}</b><small>{identities[0] ? `${identities[0].provider === 'custom:roblox' ? 'Roblox' : 'Discord'} account` : 'Account'}</small></span><ChevronDown size={14} /></button> : <div className="nav-connect-actions">{providers.map(provider => <button key={provider.id} type="button" className={`nav-connect-button ${provider.icon}`} onClick={() => void connect(provider)} disabled={Boolean(busy)} title={`Connect ${provider.name}`}><ProviderLogo type={provider.icon} /><span>{busy === provider.id ? 'Connecting…' : `Connect ${provider.name}`}</span></button>)}</div>}
    {open && <><button className="nav-identity-scrim" aria-label="Close account menu" onClick={() => setOpen(false)} /><section className="nav-identity-popover" aria-label="Connected accounts"><header><div><span className="nav-popover-kicker">YOUR ACCOUNT</span><b>{displayName || 'Connect an account'}</b></div><button type="button" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button></header>
      {admin && <div className="identity-admin-card"><span className="identity-admin-mark"><BadgeCheck size={16} /></span><span><b>Verified {admin.role === 'OWNER' ? 'Owner' : 'Admin'}</b><small>{admin.title || 'Turbo Soccer team'}</small></span></div>}
      {profile && <a className="identity-roblox-profile" href={profile.roblox_profile_url} target="_blank" rel="noreferrer"><span className="identity-roblox-avatar"><img src={profile.roblox_avatar_url || `https://www.roblox.com/headshot-thumbnail/image?userId=${encodeURIComponent(profile.roblox_user_id)}&width=150&height=150&format=png`} alt="" /></span><span><b>{profile.roblox_display_name}</b><small>@{profile.roblox_username} · ID {profile.roblox_user_id}</small></span><ExternalLink size={14} /></a>}
      <div className="identity-provider-list">{providers.map(provider => {
        const isLinked = linked.has(provider.id)
        const unlinking = busy === `unlink:${provider.id}`
        return <div className="identity-provider-row" key={provider.id}><span className={`identity-provider-mark ${provider.icon}`}><ProviderLogo type={provider.icon} /></span><span><b>{provider.name}</b><small>{isLinked ? 'Connected and verified' : 'Not connected'}</small></span>{isLinked ? <div className="identity-provider-actions"><i className="identity-connected-dot" />{identities.length > 1 ? <button className="identity-disconnect-button" type="button" onClick={() => void disconnect(provider)} disabled={Boolean(busy)} title={`Disconnect ${provider.name}`}><Unlink size={12} />{unlinking ? 'Disconnecting…' : 'Disconnect'}</button> : <small className="identity-unlink-hint" title="Add another sign-in method first">Add another login first</small>}</div> : <button type="button" onClick={() => void connect(provider)} disabled={Boolean(busy)}>{busy === provider.id ? 'Connecting…' : sessionId ? 'Link' : 'Connect'}</button>}</div>
      })}</div>
      {sessionId && linked.has('custom:roblox') && !linked.has('email') && <div className="identity-email-recovery">
        {emailFormOpen ? <form onSubmit={event => void addEmailLogin(event)}>
          <b>Add an email login</b>
          <small>Use an email you control that is not already used by another Turbo Soccer account.</small>
          <label>Email address<input type="email" value={recoveryEmail} onChange={event => setRecoveryEmail(event.target.value)} autoComplete="email" required /></label>
          <label>Password<input type="password" value={recoveryPassword} onChange={event => setRecoveryPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
          <label>Confirm password<input type="password" value={recoveryPasswordConfirm} onChange={event => setRecoveryPasswordConfirm(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
          <div><button type="button" className="identity-email-cancel" onClick={() => { setEmailFormOpen(false); setNotice('') }} disabled={Boolean(busy)}>Cancel</button><button type="submit" disabled={Boolean(busy)}>{busy === 'email' ? 'Sending…' : 'Send confirmation'}</button></div>
        </form> : <button type="button" className="identity-email-open" onClick={() => { setNotice(''); setEmailFormOpen(true) }} disabled={Boolean(busy)}>Use email instead</button>}
      </div>}
      {notice && <p className="identity-notice" role="status">{notice}</p>}{sessionId && <div className="identity-account-actions"><button className="identity-signout" type="button" onClick={() => void signOut()}><LogOut size={14} /> Sign out</button><button className="identity-signout" type="button" onClick={() => void revokeSessions()}><ShieldCheck size={14} /> Sign out all devices</button></div>}
    </section></>}
  </div>
}

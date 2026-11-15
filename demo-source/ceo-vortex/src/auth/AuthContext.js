import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, DEMO_MODE } from '../supabaseClient'

const AuthContext = createContext(null)

const PROFILE_COLUMNS = 'user_id, student_code, full_name, email, avatar_url, university, faculty, year'
const OAUTH_ERROR_KEYS = ['error', 'error_code', 'error_description']

/* Dev-only preview of the signed-in UI. It never works in a production build. */
function isPreviewSignedIn() {
  if (DEMO_MODE) return true
  if (process.env.NODE_ENV === 'production') {
    return false
  }
  return new URLSearchParams(window.location.search).get('preview') === 'signedin'
}

function urlHasOAuthError() {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return OAUTH_ERROR_KEYS.some((key) => search.has(key) || hash.has(key))
}

function stripOAuthErrorFromUrl() {
  const url = new URL(window.location.href)
  OAUTH_ERROR_KEYS.forEach((key) => url.searchParams.delete(key))
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  if (OAUTH_ERROR_KEYS.some((key) => hash.has(key))) {
    url.hash = ''
  }
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
}

async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('user_id', userId).maybeSingle()
  if (error) {
    throw new Error(error.message)
  }
  return data
}

/* Only the 4 columns the database lets the browser change. */
function cleanPatch(fields) {
  const patch = {}
  ;['full_name', 'university', 'faculty'].forEach((key) => {
    if (key in fields) {
      const value = String(fields[key] == null ? '' : fields[key]).trim().slice(0, 120)
      patch[key] = value === '' ? null : value
    }
  })
  if ('year' in fields) {
    const year = Number.parseInt(fields.year, 10)
    patch.year = Number.isInteger(year) && year >= 1 && year <= 7 ? year : null
  }
  return patch
}

export function AuthProvider({ children }) {
  const [preview] = useState(isPreviewSignedIn)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [profileRow, setProfileRow] = useState(null)
  const [profileStatus, setProfileStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(urlHasOAuthError)

  const user = session ? session.user : null
  const userId = user ? user.id : null

  /* Remove the OAuth error from the address bar so a refresh does not show it again. */
  useEffect(() => {
    if (urlHasOAuthError()) {
      stripOAuthErrorFromUrl()
    }
  }, [])

  /* Let supabase-js own the session; we only mirror it. */
  useEffect(() => {
    if (!supabase) {
      return undefined
    }
    let active = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setSession(data.session)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setLoading(false)
        }
      })
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!supabase || !userId) {
      return
    }
    setProfileStatus('loading')
    try {
      const row = await fetchProfile(userId)
      if (row) {
        setProfileRow(row)
        setProfileStatus('ready')
      } else {
        setProfileStatus('error')
      }
    } catch (e) {
      setProfileStatus('error')
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setProfileRow(null)
      setProfileStatus('idle')
      return
    }
    refreshProfile()
  }, [userId, refreshProfile])

  const updateProfile = useCallback(
    async (fields) => {
      if (!supabase || !userId) {
        throw new Error('Not signed in')
      }
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update(cleanPatch(fields))
        .eq('user_id', userId)
        .select(PROFILE_COLUMNS)
        .single()
      if (updateError) {
        throw new Error(updateError.message)
      }
      setProfileRow(data)
      return data
    },
    [userId]
  )

  const signInWithGoogle = useCallback(async () => {
    setError(false)
    if (!supabase) {
      setError(true)
      return
    }
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (signInError) {
      setError(true)
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) {
      return
    }
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      setError(true)
    }
  }, [])

  const clearError = useCallback(() => setError(false), [])

  const profile = useMemo(
    () => (profileRow && profileRow.user_id === userId ? profileRow : null),
    [profileRow, userId]
  )
  const profileComplete = Boolean(profile && profile.university && profile.faculty && profile.year)
  const profileLoading = Boolean(userId) && profileStatus !== 'ready' && profileStatus !== 'error'

  const value = useMemo(
    () => ({
      user,
      session,
      profile,
      profileComplete,
      profileLoading,
      loading,
      error,
      isSignedIn: Boolean(session) || preview,
      signInWithGoogle,
      signOut,
      refreshProfile,
      updateProfile,
      clearError,
    }),
    [
      user,
      session,
      profile,
      profileComplete,
      profileLoading,
      loading,
      error,
      preview,
      signInWithGoogle,
      signOut,
      refreshProfile,
      updateProfile,
      clearError,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

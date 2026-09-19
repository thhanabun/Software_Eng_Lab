import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getMe, login as apiLogin, logout as apiLogout, type AuthUser } from './api'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {
    throw new Error('AuthProvider missing')
  },
  logout: async () => {},
  refresh: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const { user: next } = await getMe()
      setUser(next)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    void refresh().finally(() => setLoading(false))
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const { user: next } = await apiLogin(email, password)
    setUser(next)
    return next
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

// Role home: requesters start at My Tickets, staff at the queue, admins at
// User Management.
export function homePath(role: string): string {
  if (role === 'ADMINISTRATOR') return '/admin/users'
  if (role !== 'REQUESTER') return '/staff/tickets'
  return '/tickets'
}

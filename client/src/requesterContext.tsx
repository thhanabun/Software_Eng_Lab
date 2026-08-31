import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Requester } from './api'
import { REQUESTER_STORAGE_KEY } from './requesterStorage'

interface RequesterContextValue {
  requester: Requester | null
  selectRequester: (requester: Requester) => void
  changeRequester: () => void
}

const RequesterContext = createContext<RequesterContextValue>({
  requester: null,
  selectRequester: () => {},
  changeRequester: () => {},
})

function readStoredRequester(): Requester | null {
  try {
    const raw = localStorage.getItem(REQUESTER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Requester
    if (typeof parsed?.id !== 'number' || typeof parsed?.name !== 'string') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequester] = useState<Requester | null>(readStoredRequester)

  const selectRequester = useCallback((next: Requester) => {
    localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(next))
    setRequester(next)
  }, [])

  const changeRequester = useCallback(() => {
    localStorage.removeItem(REQUESTER_STORAGE_KEY)
    setRequester(null)
  }, [])

  const value = useMemo(
    () => ({ requester, selectRequester, changeRequester }),
    [requester, selectRequester, changeRequester],
  )

  return <RequesterContext.Provider value={value}>{children}</RequesterContext.Provider>
}

export function useRequester(): RequesterContextValue {
  return useContext(RequesterContext)
}

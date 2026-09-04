import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useRequester } from '../requesterContext'

export default function RequireRequester({ children }: { children: ReactNode }) {
  const { requester } = useRequester()
  if (!requester) {
    return <Navigate to="/select-requester" replace />
  }
  return <>{children}</>
}

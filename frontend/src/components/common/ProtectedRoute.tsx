import { useUser } from '@clerk/react'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

interface Props {
  requiredRole?: 'vendor' | 'consumer'
  children: React.ReactNode
}

export function ProtectedRoute({ requiredRole, children }: Props) {
  const { user, isLoaded, isSignedIn } = useUser()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      navigate({ to: '/auth/sign-in' })
      return
    }
    const role = user?.unsafeMetadata?.role as string | undefined
    if (!role) {
      navigate({ to: '/onboarding/role-select' })
      return
    }
    if (requiredRole && role !== requiredRole) {
      navigate({ to: '/' })
    }
  }, [isLoaded, isSignedIn, user, requiredRole, navigate])

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-57px)]">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    )
  }

  if (!isSignedIn) return null
  if (requiredRole && (user?.unsafeMetadata?.role as string) !== requiredRole) return null

  return <>{children}</>
}

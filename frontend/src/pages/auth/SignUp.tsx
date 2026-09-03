import { SignUp } from '@clerk/react'

export default function SignUpPage() {
  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center p-4">
      <SignUp
        routing="path"
        path="/auth/sign-up"
        signInUrl="/auth/sign-in"
        fallbackRedirectUrl="/onboarding/role-select"
      />
    </div>
  )
}
